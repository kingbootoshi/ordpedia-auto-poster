import { createClient, SupabaseClient } from '@supabase/supabase-js'
import pino from 'pino'
import * as dotenv from 'dotenv'
import { syncPageToMemory } from './gitPoster'

dotenv.config()

const logger = pino({
  name: 'initialMemorySync',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

/**
 * Fetch the latest approved revision for a page from Supabase.
 */
async function fetchLatestApprovedRevision(
  supabase: SupabaseClient,
  pageId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from('page_revisions')
    .select('content')
    .eq('page_id', pageId)
    .eq('is_approved', true)
    .order('revision_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    logger.error({ pageId }, `Error fetching latest approved revision: ${error.message}`)
    return null
  }
  if (!data) {
    logger.warn({ pageId }, 'No approved revision found')
    return null
  }
  return data.content || null
}

/**
 * For each page that is_approved, fetch the latest revision and sync to memory
 */
async function bulkMemorySync() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    )

    logger.info('Fetching all approved pages from Supabase...')
    const { data: pages, error: pagesErr } = await supabase
      .from('pages')
      .select('id')
      .eq('is_approved', true)

    if (pagesErr || !pages) {
      throw new Error(`Could not fetch approved pages: ${pagesErr?.message}`)
    }

    logger.info({ pageCount: pages.length }, 'Found approved pages to memory-sync')

    for (const page of pages) {
      try {
        const content = await fetchLatestApprovedRevision(supabase, page.id)
        if (!content) {
          logger.warn({ pageId: page.id }, 'Skipping page because no approved revision content found')
          continue
        }
        // Sync the content
        logger.info({ pageId: page.id }, 'Syncing page to memory...')
        await syncPageToMemory(supabase, page.id, content)
      } catch (err) {
        logger.error({
          error: (err as Error).message,
          pageId: page.id
        }, 'Failed to sync page to memory, continuing with next')
      }
    }
    logger.info('Completed memory-sync for all approved pages')
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Fatal error in bulkMemorySync')
    process.exit(1)
  }
}

// Export for use in other modules
export { bulkMemorySync }

// If invoked directly (e.g. "bun run src/initialMemorySync.ts" or "node dist/initialMemorySync.js")
if (require.main === module) {
  bulkMemorySync()
    .then(() => {
      logger.info('Memory sync completed successfully')
      process.exit(0)
    })
    .catch((err) => {
      logger.error({ error: (err as Error).message }, 'Error in initialMemorySync')
      process.exit(1)
    })
}