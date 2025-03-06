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
const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://127.0.0.1:8000'

// Interface for GitHub API content response
interface GitHubContent {
  sha: string;
  content?: string;
  type?: string;
  name?: string;
}

// Interface for Memory API response
interface MemoryAPIResponse {
  status: string;
  result: {
    results: Array<{
      id: string;
      memory: string;
    }>;
  };
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
 * Return { slug, title, revisionNumber, content }
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
 * Fetch all approved revisions for a page
 * Returns array of {revisionNumber, content} objects sorted by revision number
 */
async function fetchAllApprovedRevisions(
  supabase: SupabaseClient,
  pageId: string
): Promise<Array<{
  revisionNumber: number
  content: string
}>> {
  // Fetch all approved revisions for this page
  const { data: revData, error: revErr } = await supabase
    .from('page_revisions')
    .select('content, revision_number')
    .eq('page_id', pageId)
    .eq('is_approved', true)
    .order('revision_number', { ascending: true })

  if (revErr) {
    throw new Error(`Error fetching approved revisions for page ${pageId}: ${revErr.message}`)
  }

  if (!revData || revData.length === 0) {
    logger.warn({ pageId }, 'No approved revisions found for page')
    return []
  }

  return revData.map(rev => ({
    revisionNumber: rev.revision_number,
    content: rev.content
  }))
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

    // Now sync the content to memory system if this page is newly approved
    // We'll do a quick check: is the page is_approved?
    const { data: pageData } = await supabase
      .from('pages')
      .select('is_approved')
      .eq('id', pageId)
      .single()

    if (pageData && pageData.is_approved) {
      logger.info({ pageId }, 'Page is approved. Syncing to memory service...')
      await syncPageToMemory(supabase, pageId, pageContent.content)
    }

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

    // Also sync new revision content to memory
    logger.info({ revisionId, pageId }, 'Syncing newly approved revision content to memory service...')
    await syncPageToMemory(supabase, pageId, revData.content)
    
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

// Utility to check if a file exists in GitHub
async function fileExistsInRepo(filePath: string): Promise<boolean> {
  try {
    logger.debug({ filePath }, 'Checking if file exists in GitHub')
    const getResp = await githubRequest<GitHubContent>('GET', `/contents/${filePath}`)
    return !!getResp?.sha;
  } catch (err) {
    // 404 means file doesn't exist
    if ((err as Error).message.includes('404')) {
      return false;
    }
    // Other errors should be thrown
    throw err;
  }
}

// Utility to check if page memories exist in Supabase
async function pageMemoriesExist(supabase: SupabaseClient, pageId: string): Promise<boolean> {
  try {
    const { count, error } = await supabase
      .from('page_memories')
      .select('*', { count: 'exact', head: true })
      .eq('page_id', pageId);
    
    if (error) throw error;
    return count !== null && count > 0;
  } catch (err) {
    logger.error({ pageId, error: (err as Error).message }, 'Error checking for existing memories');
    return false; // Assume no memories exist if check fails
  }
}

/**
 * Bulk upload all approved pages and their revisions - run this once to backfill.
 * Only syncs pages that don't already exist in GitHub or don't have memories.
 */
export async function uploadAllApprovedPages() {
  try {
    logger.info('Starting bulk upload of all approved pages and their revisions')
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    )

    logger.debug('Fetching all approved pages from Supabase')
    const { data: pages, error: pagesErr } = await supabase
      .from('pages')
      .select('id, slug, title')
      .eq('is_approved', true)

    if (pagesErr || !pages) {
      throw new Error(`Could not fetch approved pages: ${pagesErr?.message}`)
    }

    logger.info({ pageCount: pages.length }, 'Found approved pages to check')

    for (const page of pages) {
      try {
        // Get basic page info
        const pageId = page.id
        const slug = page.slug
        const title = page.title
        
        // Check if latest revision file exists
        const { data: latestRevision, error: revErr } = await supabase
          .from('page_revisions')
          .select('revision_number')
          .eq('page_id', pageId)
          .eq('is_approved', true)
          .order('revision_number', { ascending: false })
          .limit(1)
          .single();

        if (revErr || !latestRevision) {
          logger.warn({ pageId, slug, title }, 'No approved revisions found, skipping page');
          continue;
        }

        // Check if file already exists in GitHub and memories exist in Supabase
        const revisionFilePath = `${slug}/revision-${latestRevision.revision_number}.md`;
        const [fileExists, memoriesExist] = await Promise.all([
          fileExistsInRepo(revisionFilePath),
          pageMemoriesExist(supabase, pageId)
        ]);

        if (fileExists && memoriesExist) {
          logger.info({
            pageId,
            slug,
            title,
            revisionNumber: latestRevision.revision_number
          }, 'Page already synced to GitHub and Memory, skipping');
          continue;
        }

        logger.info({
          pageId,
          slug,
          title,
          needsGitHubSync: !fileExists,
          needsMemorySync: !memoriesExist
        }, 'Processing page for sync')
        
        // Fetch all approved revisions for this page if GitHub sync needed
        const revisions = await fetchAllApprovedRevisions(supabase, pageId)
        
        if (revisions.length === 0) {
          logger.warn({ pageId, slug }, 'No approved revisions found, skipping page')
          continue
        }
        
        logger.info(
          { pageId, slug, revisionCount: revisions.length }, 
          'Found approved revisions to upload'
        )
        
        // Upload each revision to GitHub
        for (const rev of revisions) {
          try {
            const mdName = `revision-${rev.revisionNumber}.md`
            
            logger.info(
              { pageId, slug, revisionNumber: rev.revisionNumber }, 
              'Creating/updating file in GitHub'
            )
            
            await createOrUpdateFileInRepo(
              `${slug}/${mdName}`,
              rev.content,
              `Sync revision ${rev.revisionNumber} for page ${title} (${pageId})`
            )
          } catch (err) {
            // Log but continue with next revision
            const error = err as Error
            logger.error({
              error: {
                message: error.message,
                stack: error.stack,
                cause: error.cause
              },
              pageId,
              slug,
              revisionNumber: rev.revisionNumber
            }, 'Failed to upload revision during bulk upload, continuing with next')
          }
        }
        
        // Only sync memory if needed
        if (!memoriesExist) {
          const latestRevision = revisions[revisions.length - 1]
          if (latestRevision) {
            logger.info({ pageId, slug }, 'Syncing latest revision to memory')
            await syncPageToMemory(supabase, pageId, latestRevision.content)
          }
        } else {
          logger.info({ pageId, slug }, 'Memories already exist, skipping memory sync')
        }
        
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
    logger.info('Completed bulk upload of all approved pages and their revisions')
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

/**
 * Sync page content to the memory API. Replaces old memory, adds new memory, stores in "page_memories".
 */
export async function syncPageToMemory(supabase: SupabaseClient, pageId: string, pageContent: string) {
  try {
    // 1) Delete all existing memories for this page
    const delResp = await fetch(`${MEMORY_API_URL}/delete_all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: pageId })
    })

    if (!delResp.ok) {
      const errText = await delResp.text()
      throw new Error(`Failed to delete_all for pageId ${pageId}: ${errText}`)
    }
    logger.info({ pageId }, 'Deleted old memories successfully')

    // 2) Add new memory with the entire page content
    const addResp = await fetch(`${MEMORY_API_URL}/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: pageContent,
        run_id: pageId
      })
    })

    if (!addResp.ok) {
      const errText = await addResp.text()
      throw new Error(`Failed to add memory for pageId ${pageId}: ${errText}`)
    }

    const addResult = await addResp.json() as MemoryAPIResponse
    logger.info({ pageId, addResult }, 'Successfully added new memory')

    // 3) Store each memory record in page_memories
    // Expected format: {status: "success", result: { results: [ {id: "...", memory: "..."}, ... ] }}
    if (addResult?.result?.results) {
      for (const mem of addResult.result.results) {
        await supabase.from('page_memories').insert({
          page_id: pageId,
          memory_id: mem.id,
          content: mem.memory
        })
      }
      logger.info({ pageId }, 'Stored new memories in page_memories table')
    }
  } catch (error) {
    logger.error({ error: (error as Error).message, pageId }, 'Error syncing page content to memory service')
  }
}