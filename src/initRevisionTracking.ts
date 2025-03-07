import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import pino from 'pino'

dotenv.config()

// Initialize logger
const logger = pino({
  name: 'initRevisionTracking',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

/**
 * Initializes last_memory_synced_revision_number for existing pages
 * For pages that already have memories, sets the tracker to match the latest revision
 * This avoids unnecessary resyncing after adding the new column
 */
async function initializeRevisionTracking() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    )

    logger.info('Starting initialization of revision tracking for existing pages...')
    
    // 1. Fetch all approved pages that have memories but no revision tracking yet
    const { data: pages, error: pagesErr } = await supabase
      .from('pages')
      .select('id, slug, title, last_memory_synced_revision_number')
      .eq('is_approved', true)
      .is('last_memory_synced_revision_number', null)
    
    if (pagesErr) {
      throw new Error(`Failed to fetch pages: ${pagesErr.message}`)
    }
    
    logger.info({ pageCount: pages?.length || 0 }, 'Found approved pages with null revision tracking')
    
    if (!pages || pages.length === 0) {
      logger.info('No pages found that need revision tracking initialization')
      return
    }
    
    // Track statistics
    let updatedCount = 0
    let skippedCount = 0
    
    // 2. For each page, check if memories exist, and if so, set revision to match latest
    for (const page of pages) {
      try {
        // 2a. Check if memories exist for this page
        const { count: memoryCount, error: memErr } = await supabase
          .from('page_memories')
          .select('*', { count: 'exact', head: true })
          .eq('page_id', page.id)
        
        if (memErr) {
          logger.error({ pageId: page.id, error: memErr.message }, 'Error checking for memories')
          continue
        }
        
        if (!memoryCount || memoryCount === 0) {
          logger.debug({ pageId: page.id }, 'No memories exist for page, skipping')
          skippedCount++
          continue
        }
        
        // 2b. Since memories exist, get the latest revision number
        const { data: latestRev, error: revErr } = await supabase
          .from('page_revisions')
          .select('revision_number')
          .eq('page_id', page.id)
          .eq('is_approved', true)
          .order('revision_number', { ascending: false })
          .limit(1)
          .single()
        
        if (revErr || !latestRev) {
          logger.warn({ pageId: page.id }, 'Has memories but no approved revisions found, skipping')
          skippedCount++
          continue
        }
        
        // 2c. Update the revision tracker to match the latest revision
        await supabase
          .from('pages')
          .update({ last_memory_synced_revision_number: latestRev.revision_number })
          .eq('id', page.id)
        
        logger.info({ 
          pageId: page.id, 
          slug: page.slug,
          revisionNumber: latestRev.revision_number 
        }, 'Updated revision tracking to match latest revision')
        
        updatedCount++
      } catch (err) {
        logger.error({ pageId: page.id, error: (err as Error).message }, 'Error processing page')
      }
    }
    
    logger.info({ 
      total: pages.length,
      updated: updatedCount,
      skipped: skippedCount 
    }, 'Completed initialization of revision tracking')
    
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Error initializing revision tracking')
    process.exit(1)
  }
}

// If this script is invoked directly
if (require.main === module) {
  initializeRevisionTracking()
    .then(() => {
      logger.info('Successfully initialized revision tracking')
      process.exit(0)
    })
    .catch(err => {
      logger.error({ error: (err as Error).message }, 'Failed to initialize revision tracking')
      process.exit(1)
    })
}