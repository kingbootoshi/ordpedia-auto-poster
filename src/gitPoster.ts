import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import fetch from 'node-fetch'
import pino from 'pino'

dotenv.config()

const logger = pino({
  name: 'gitPoster',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER || ''
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME || ''

// Interface for GitHub API content response
interface GitHubContent {
  sha: string;
  content?: string;
  type?: string;
  name?: string;
}

/**
 * Simple helper to call GitHub API with correct headers.
 */
async function githubRequest<T>(
  method: string,
  path: string,
  body?: any
): Promise<T> {
  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}${path}`
  const headers: Record<string, string> = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  }

  const options: Record<string, any> = {
    method,
    headers,
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  logger.debug({ method, path, url }, 'Making GitHub API request')
  const response = await fetch(url, options)
  if (!response.ok) {
    const respText = await response.text()
    logger.error({
      status: response.status,
      statusText: response.statusText,
      response: respText,
      method,
      path,
      url
    }, 'GitHub API request failed')
    throw new Error(
      `GitHub API Error: ${response.status} ${response.statusText} - ${respText}`
    )
  }
  return response.json() as Promise<T>
}

/**
 * Create or update a file in the repo.
 * filePath: The path in the repo, e.g. "myslug/revision-1.md"
 * content: The full text content to put in the file
 * commitMessage: The commit message
 */
async function createOrUpdateFileInRepo(
  filePath: string,
  content: string,
  commitMessage: string
) {
  // Get the current file SHA if it exists
  let sha = null
  let isUpdate = false
  try {
    logger.debug({ filePath }, 'Checking if file exists in GitHub')
    const getResp = await githubRequest<GitHubContent>('GET', `/contents/${filePath}`)
    if (getResp?.sha) {
      sha = getResp.sha
      isUpdate = true
      logger.debug({ filePath, sha }, 'File exists, will update')
    }
  } catch (err) {
    // 404 means file doesn't exist, so that's OK
    if (!(err as Error).message.includes('404')) {
      throw err
    }
    logger.debug({ filePath }, 'File does not exist, will create new')
  }

  const encodedContent = Buffer.from(content).toString('base64')

  logger.info({
    operation: isUpdate ? 'update' : 'create',
    filePath,
    contentLength: content.length,
    sha: sha || undefined
  }, `${isUpdate ? 'Updating' : 'Creating'} file in GitHub`)

  await githubRequest('PUT', `/contents/${filePath}`, {
    message: commitMessage,
    content: encodedContent,
    sha: sha || undefined,
  })

  logger.info({
    operation: isUpdate ? 'update' : 'create',
    filePath
  }, `Successfully ${isUpdate ? 'updated' : 'created'} file in GitHub`)
}

/**
 * Renames a folder in the GitHub repo by:
 * 1. Listing all files in old folder
 * 2. Recreating them in new folder
 * 3. Deleting files in old folder
 *
 * slugOld: old folder name
 * slugNew: new folder name
 */
async function renameFolderInRepo(
  slugOld: string,
  slugNew: string
) {
  logger.info({ oldSlug: slugOld, newSlug: slugNew }, 'Starting folder rename operation')
  
  // 1) List all files in old folder
  let items: any[] = []
  try {
    logger.debug({ folder: slugOld }, 'Listing files in old folder')
    const getResp = await githubRequest<GitHubContent[]>('GET', `/contents/${slugOld}`)
    if (Array.isArray(getResp)) {
      items = getResp
      logger.info({ folder: slugOld, fileCount: items.length }, 'Found files to move')
    }
  } catch (err) {
    // If old folder doesn't exist at all, nothing to rename
    if (!(err as Error).message.includes('404')) {
      throw err
    }
    logger.info({ folder: slugOld }, 'Old folder does not exist, nothing to rename')
    return
  }

  // 2) For each file in old folder, get its contents and recreate in new folder
  for (const item of items) {
    if (item.type === 'file') {
      const filePath = `${slugOld}/${item.name}`
      logger.debug({ file: filePath }, 'Moving file to new location')
      
      // fetch the file content
      const fileContentResp = await githubRequest<GitHubContent>('GET', `/contents/${filePath}`)
      const sha = fileContentResp.sha
      const decodedContent = Buffer.from(fileContentResp.content || '', 'base64').toString('utf8')
      
      // create or update file in new folder
      const newPath = `${slugNew}/${item.name}`
      logger.info({ oldPath: filePath, newPath }, 'Creating file in new location')
      await createOrUpdateFileInRepo(
        newPath,
        decodedContent,
        `Rename ${slugOld} to ${slugNew}`
      )
    }
  }

  // 3) Delete each file in old folder
  for (const item of items) {
    if (item.type === 'file') {
      const filePath = `${slugOld}/${item.name}`
      try {
        logger.info({ file: filePath }, 'Deleting file from old location')
        await githubRequest('DELETE', `/contents/${filePath}`, {
          message: `Removing old folder files ${slugOld}`,
          sha: item.sha,
        })
        logger.debug({ file: filePath }, 'Successfully deleted file')
      } catch (err) {
        const error = err as Error
        logger.error({
          error: {
            message: error.message,
            stack: error.stack
          },
          file: filePath
        }, 'Failed deleting old file')
      }
    }
  }

  logger.info({ oldSlug: slugOld, newSlug: slugNew }, 'Successfully completed folder rename operation')
}

/**
 * Fetch the page, its slug, and the LATEST approved revision from DB
 * Return { slug, revisionNumber, content }
 */
async function fetchPageContent(
  supabase: SupabaseClient,
  pageId: string
): Promise<{
  slug: string
  title: string
  revisionNumber: number
  content: string
}> {
  // fetch the page record
  const { data: pageData, error: pageErr } = await supabase
    .from('pages')
    .select('*')
    .eq('id', pageId)
    .single()

  if (pageErr || !pageData) {
    throw new Error(`Error fetching page: ${pageErr?.message}`)
  }

  // fetch the latest approved revision
  const { data: revData, error: revErr } = await supabase
    .from('page_revisions')
    .select('content, revision_number')
    .eq('page_id', pageId)
    .eq('is_approved', true)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (revErr || !revData) {
    throw new Error(`No approved revision found for page ${pageId}`)
  }

  return {
    slug: pageData.slug,
    title: pageData.title,
    revisionNumber: revData.revision_number,
    content: revData.content,
  }
}

/**
 * Handle uploading the newest approved revision of a page to GitHub.
 * Called when a page is newly approved or updated or on initial bulk upload.
 */
export async function handleNewOrUpdatedPage(
  supabase: SupabaseClient,
  pageId: string
) {
  try {
    logger.info({ pageId }, 'Starting to handle new/updated page')
    const pageContent = await fetchPageContent(supabase, pageId)
    logger.debug({ pageContent }, 'Fetched page content')
    
    const folderName = pageContent.slug
    const mdName = `revision-${pageContent.revisionNumber}.md`
    
    logger.info({ folderName, mdName }, 'Creating/updating file in GitHub')
    await createOrUpdateFileInRepo(
      `${folderName}/${mdName}`,
      pageContent.content,
      `Add/Update page revision ${pageContent.revisionNumber} for page ${pageId}`
    )
    logger.info({ pageId, folderName, mdName }, 'Successfully handled new/updated page')
  } catch (err) {
    const error = err as Error
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      },
      pageId
    }, 'Error in handleNewOrUpdatedPage')
    throw err // Re-throw to be handled by caller
  }
}

/**
 * Handle a newly approved revision by updating that page's folder with the new revision .md
 */
export async function handleNewlyApprovedRevision(
  supabase: SupabaseClient,
  revisionId: string
) {
  try {
    logger.info({ revisionId }, 'Starting to handle newly approved revision')
    const { data: revData, error: revErr } = await supabase
      .from('page_revisions')
      .select('page_id, revision_number, content')
      .eq('id', revisionId)
      .single()

    if (revErr || !revData) {
      throw new Error(`Could not fetch revision: ${revErr?.message}`)
    }

    const pageId = revData.page_id
    logger.debug({ pageId, revisionId }, 'Fetching page info')
    const folderInfo = await fetchPageContent(supabase, pageId)
    const folderName = folderInfo.slug

    const mdName = `revision-${revData.revision_number}.md`
    logger.info({ folderName, mdName }, 'Creating/updating file in GitHub')
    await createOrUpdateFileInRepo(
      `${folderName}/${mdName}`,
      revData.content,
      `New approved revision ${revData.revision_number} for page ${pageId}`
    )
    logger.info({ revisionId, pageId, folderName, mdName }, 'Successfully handled newly approved revision')
  } catch (err) {
    const error = err as Error
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      },
      revisionId
    }, 'Error in handleNewlyApprovedRevision')
    throw err
  }
}

/**
 * Rename the folder if the slug changed. oldSlug = the old slug, new page ID = so we can fetch the new slug.
 */
export async function renamePageFolderIfSlugChanged(
  supabase: SupabaseClient,
  oldSlug: string,
  pageId: string
) {
  try {
    // fetch new slug from db
    const { data: pageData, error: pageErr } = await supabase
      .from('pages')
      .select('slug')
      .eq('id', pageId)
      .single()

    if (pageErr || !pageData) {
      throw new Error(`Could not fetch updated page for rename: ${pageErr?.message}`)
    }

    const newSlug = pageData.slug
    if (newSlug === oldSlug) {
      return // no rename needed
    }

    await renameFolderInRepo(oldSlug, newSlug)
  } catch (err) {
    logger.error('Error in renamePageFolderIfSlugChanged:', err)
  }
}

/**
 * Bulk upload all approved pages - run this once to backfill.
 */
export async function uploadAllApprovedPages() {
  try {
    logger.info('Starting bulk upload of all approved pages')
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    )

    logger.debug('Fetching all approved pages from Supabase')
    const { data: pages, error: pagesErr } = await supabase
      .from('pages')
      .select('id')
      .eq('is_approved', true)

    if (pagesErr || !pages) {
      throw new Error(`Could not fetch approved pages: ${pagesErr?.message}`)
    }

    logger.info({ pageCount: pages.length }, 'Found approved pages to upload')

    for (const page of pages) {
      try {
        await handleNewOrUpdatedPage(supabase, page.id)
      } catch (err) {
        // Log but continue with next page
        const error = err as Error
        logger.error({
          error: {
            message: error.message,
            stack: error.stack,
            cause: error.cause
          },
          pageId: page.id
        }, 'Failed to handle page during bulk upload, continuing with next')
      }
    }
    logger.info('Completed bulk upload of all approved pages')
  } catch (err) {
    const error = err as Error
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      }
    }, 'Fatal error in uploadAllApprovedPages')
    throw err
  }
}