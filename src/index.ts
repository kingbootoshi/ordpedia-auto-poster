import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import fetch from 'node-fetch'
import pino from 'pino'
import { handleNewOrUpdatedPage, handleNewlyApprovedRevision, renamePageFolderIfSlugChanged } from './gitPoster'

// Initialize logger
const logger = pino({
  name: 'ordpedia-auto-poster',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Load environment variables
dotenv.config()

// Initialize OAuth 1.0a
const oauth = new OAuth({
  consumer: {
    key: process.env.CONSUMER_KEY as string,
    secret: process.env.CONSUMER_SECRET as string,
  },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString: string, key: string) {
    return crypto.createHmac('sha1', key).update(baseString).digest('base64')
  },
})

async function postTweet(text: string, reply_to?: string): Promise<string> {
  const tweetEndpoint = 'https://api.twitter.com/2/tweets'
  const tweetData = reply_to
    ? { text, reply: { in_reply_to_tweet_id: reply_to } }
    : { text }

  const authHeader = oauth.toHeader(
    oauth.authorize(
      {
        url: tweetEndpoint,
        method: 'POST',
      },
      {
        key: process.env.ACCESS_TOKEN as string,
        secret: process.env.ACCESS_TOKEN_SECRET as string,
      }
    )
  )

  try {
    logger.debug({ tweetData }, 'Posting tweet')
    const response = await fetch(tweetEndpoint, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error(
        {
          status: response.status,
          response: errorText,
          headers: Object.fromEntries(response.headers),
        },
        'Failed to post tweet'
      )
      throw new Error(`Failed to post tweet: ${errorText}`)
    }

    const data = (await response.json()) as { data: { id: string } }
    logger.debug({ response: data }, 'Successfully posted tweet')
    return data.data.id
  } catch (error) {
    logger.error({ error }, 'Failed to post tweet')
    throw error
  }
}

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE as string
  )

  // Listen for new inserts in the "pages" table -> tweet about new page
  // Then also handle GitHub updates if the page is already approved or becomes approved later.
  supabase
    .channel('pages-inserts')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pages' }, async (payload) => {
      try {
        logger.info('New page inserted:', payload.new)
        const newPage = payload.new

        // Tweet about it
        const { data: userRecord, error: userError } = await supabase
          .from('users')
          .select('username')
          .eq('id', newPage.created_by)
          .single()

        if (userError || !userRecord) {
          logger.error('Error fetching user record:', userError)
          return
        }

        const twitterHandle = `@${userRecord.username}`
        const pageTitle = newPage.title
        const pageSlug = newPage.slug

        await postTweet(
          `A new Ordpedia page was created! 📖

${twitterHandle} has created a new page "${pageTitle}"

Read it here 👉 https://www.ordpedia.com/page/${pageSlug}`
        )

        logger.info('Successfully posted tweet for new page:', pageTitle)

        // Now check if the page is approved at creation
        if (newPage.is_approved) {
          await handleNewOrUpdatedPage(supabase, newPage.id)
        }
      } catch (err) {
        logger.error('Error handling new page insert:', err)
      }
    })
    .subscribe()

  // Listen for page updates (approval or slug rename)
  supabase
    .channel('pages-updates')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pages' }, async (payload) => {
      try {
        const oldPage = payload.old
        const newPage = payload.new
        
        logger.info({
          event: 'page_update',
          pageId: newPage.id,
          title: newPage.title,
          oldSlug: oldPage.slug,
          newSlug: newPage.slug,
          wasApproved: !oldPage.is_approved && newPage.is_approved,
          slugChanged: oldPage.slug !== newPage.slug
        }, 'Page updated')

        // If page was just approved, handle GitHub
        if (!oldPage.is_approved && newPage.is_approved) {
          logger.info({
            event: 'page_approval',
            pageId: newPage.id,
            title: newPage.title
          }, 'Page newly approved - syncing to GitHub')
          await handleNewOrUpdatedPage(supabase, newPage.id)
        }

        // If slug changed, rename the folder in GitHub
        if (oldPage.slug !== newPage.slug) {
          logger.info({
            event: 'slug_change',
            pageId: newPage.id,
            title: newPage.title,
            oldSlug: oldPage.slug,
            newSlug: newPage.slug
          }, 'Page slug changed - updating GitHub folder')
          await renamePageFolderIfSlugChanged(supabase, oldPage.slug, newPage.id)
        }
      } catch (err) {
        const error = err as Error
        logger.error({
          error: {
            message: error.message,
            stack: error.stack
          },
          pageId: payload.new.id
        }, 'Error handling page update')
      }
    })
    .subscribe()

  // Listen for page revision updates (approval)
  supabase
    .channel('page-revisions-updates')
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'page_revisions' },
      async (payload) => {
        try {
          const oldRev = payload.old
          const newRev = payload.new

          logger.info({
            event: 'revision_update',
            revisionId: newRev.id,
            pageId: newRev.page_id,
            revisionNumber: newRev.revision_number,
            wasApproved: !oldRev.is_approved && newRev.is_approved
          }, 'Page revision updated')

          // If revision was just approved, handle GitHub
          if (!oldRev.is_approved && newRev.is_approved) {
            logger.info({
              event: 'revision_approval',
              revisionId: newRev.id,
              pageId: newRev.page_id,
              revisionNumber: newRev.revision_number
            }, 'Revision newly approved - syncing to GitHub')
            await handleNewlyApprovedRevision(supabase, newRev.id)
          }
        } catch (err) {
          const error = err as Error
          logger.error({
            error: {
              message: error.message,
              stack: error.stack
            },
            revisionId: payload.new.id,
            pageId: payload.new.page_id
          }, 'Error handling revision update')
        }
      }
    )
    .subscribe()

  logger.info({
    supabaseUrl: process.env.SUPABASE_URL,
    githubRepo: `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`
  }, '🚀 Auto-poster started - Listening for new inserts/updates... Press Ctrl+C to exit.')
}

main().catch((err) => {
  logger.error('Fatal error in main:', err)
})