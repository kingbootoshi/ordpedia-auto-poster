-- Add column to track which revision number is reflected in the current memories
ALTER TABLE public.pages ADD COLUMN last_memory_synced_revision_number INTEGER;

-- Optional: Add comment to describe the column's purpose
COMMENT ON COLUMN public.pages.last_memory_synced_revision_number IS 
  'Tracks the revision_number from page_revisions that was last used to generate this page''s memories';

-- This column will be NULL for existing records, indicating that they should be re-synced
-- You can run this SQL command on your Supabase database to apply the schema change