import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import fetch from 'node-fetch';
import pino from 'pino';

dotenv.config();

const logger = pino({
  name: 'syncAudit',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

// GitHub request helper
async function githubRequest<T = any>(
  method: string,
  path: string,
  body?: any
): Promise<T | null> {
  const url = `https://api.github.com/repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}${path}`;
  
  try {
    const response = await fetch(url, {
      method,
      headers: {
        'Authorization': `token ${process.env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${await response.text()}`);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json() as T;
  } catch (err) {
    if ((err as Error).message.includes('404')) {
      return null;
    }
    throw err;
  }
}

// Check if a file exists in GitHub repo
async function fileExistsInRepo(filePath: string): Promise<boolean> {
  try {
    const result = await githubRequest('GET', `/contents/${filePath}`);
    return !!result;
  } catch (err) {
    if ((err as Error).message.includes('404')) {
      return false;
    }
    throw err;
  }
}

// Check if page memories exist
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
    return false;
  }
}

// Main audit function
async function auditSync() {
  try {
    logger.info('Starting sync audit');
    
    const supabase = createClient(
      process.env.SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    );

    // Get all pages
    logger.info('Fetching all pages from Supabase');
    const { data: pages, error: pagesErr } = await supabase
      .from('pages')
      .select('id, title, slug, is_approved')
      .order('created_at', { ascending: false });

    if (pagesErr || !pages) {
      throw new Error(`Failed to fetch pages: ${pagesErr?.message}`);
    }

    // Get revision count
    const { data: revisionsData, error: revisionsErr } = await supabase
      .from('page_revisions')
      .select('id')
      .eq('is_approved', true);

    if (revisionsErr) {
      throw new Error(`Failed to fetch revisions count: ${revisionsErr.message}`);
    }

    const totalRevisions = revisionsData?.length || 0;
    const totalPages = pages.length;
    const approvedPages = pages.filter(p => p.is_approved).length;

    // Track sync status
    let fullySync = 0;
    let gitOnlySync = 0;
    let memoryOnlySync = 0;
    let notSynced = 0;
    
    const notSyncedPages: {
      id: string;
      title: string;
      slug: string;
      hasGit: boolean;
      hasMemory: boolean;
    }[] = [];

    // Audit each page
    for (const page of pages) {
      if (!page.is_approved) {
        logger.debug({ pageId: page.id, slug: page.slug }, 'Skipping non-approved page');
        continue;
      }

      const { data: latestRevision, error: revErr } = await supabase
        .from('page_revisions')
        .select('revision_number')
        .eq('page_id', page.id)
        .eq('is_approved', true)
        .order('revision_number', { ascending: false })
        .limit(1)
        .single();

      if (revErr || !latestRevision) {
        logger.warn({ pageId: page.id, slug: page.slug }, 'No approved revisions found for approved page');
        continue;
      }

      // Check GitHub and memory status
      const revisionFilePath = `${page.slug}/revision-${latestRevision.revision_number}.md`;
      const [hasGit, hasMemory] = await Promise.all([
        fileExistsInRepo(revisionFilePath),
        pageMemoriesExist(supabase, page.id)
      ]);

      // Log status
      logger.debug({
        pageId: page.id,
        slug: page.slug,
        hasGit,
        hasMemory
      }, 'Page sync status');

      // Increment appropriate counter
      if (hasGit && hasMemory) {
        fullySync++;
      } else if (hasGit && !hasMemory) {
        gitOnlySync++;
        notSyncedPages.push({
          id: page.id,
          title: page.title,
          slug: page.slug,
          hasGit: true,
          hasMemory: false
        });
      } else if (!hasGit && hasMemory) {
        memoryOnlySync++;
        notSyncedPages.push({
          id: page.id,
          title: page.title,
          slug: page.slug,
          hasGit: false,
          hasMemory: true
        });
      } else {
        notSynced++;
        notSyncedPages.push({
          id: page.id,
          title: page.title,
          slug: page.slug,
          hasGit: false,
          hasMemory: false
        });
      }
    }

    // Display summary
    const summary = {
      totalPagesInDatabase: totalPages,
      approvedPages,
      totalRevisions,
      syncStatus: {
        fullySync,
        gitOnlySync,
        memoryOnlySync,
        notSynced
      },
      percentageFullySynced: Math.round((fullySync / approvedPages) * 100),
      unsyncedPages: notSyncedPages.map(p => ({
        title: p.title,
        slug: p.slug,
        status: p.hasGit 
          ? 'Git only (missing memory)' 
          : p.hasMemory 
            ? 'Memory only (missing git)' 
            : 'Not synced at all'
      }))
    };

    // Print report
    console.log('\n============ ORDPEDIA SYNC AUDIT REPORT ============');
    console.log(`Total pages in database: ${totalPages}`);
    console.log(`Approved pages: ${approvedPages}`);
    console.log(`Total approved revisions: ${totalRevisions}`);
    console.log(`\nSync Status:`);
    console.log(`✅ Fully synced pages: ${fullySync} (${summary.percentageFullySynced}%)`);
    console.log(`⚠️ GitHub only (no memory): ${gitOnlySync}`);
    console.log(`⚠️ Memory only (no GitHub): ${memoryOnlySync}`);
    console.log(`❌ Not synced at all: ${notSynced}`);
    
    if (notSyncedPages.length > 0) {
      console.log('\nUNSYNCED PAGES:');
      notSyncedPages.forEach(page => {
        const status = page.hasGit 
          ? '🔵 Git only (missing memory)' 
          : page.hasMemory 
            ? '🟡 Memory only (missing git)' 
            : '🔴 Not synced at all';
        console.log(`${status} | ${page.title} (${page.slug})`);
      });
    }
    
    console.log('\nDetailed JSON Report:');
    console.log(JSON.stringify(summary, null, 2));
    
    return summary;
  } catch (err) {
    logger.error({ error: (err as Error).message }, 'Error in audit');
    throw err;
  }
}

// Run the audit
auditSync()
  .then(() => {
    logger.info('Audit completed successfully');
    process.exit(0);
  })
  .catch(err => {
    logger.error({ error: (err as Error).message }, 'Audit failed');
    process.exit(1);
  });