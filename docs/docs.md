# Ordpedia Auto Poster System Documentation

## Overview

The Ordpedia Auto Poster system is a comprehensive solution that maintains synchronization between:

1. Ordpedia website (Supabase database)
2. GitHub backup repository (markdown files)
3. Vector memory storage system (extracted facts)

It provides automated processing of Ordpedia content, real-time event handling, and maintains consistent backups of all approved content with intelligent sync detection to avoid redundant operations.

## System Architecture

The system consists of two main components:

1. **TypeScript Application**: 
   - Monitors Supabase for real-time events
   - Posts updates to Twitter
   - Syncs content to GitHub
   - Manages memory integration

2. **Python Memory Service**:
   - FastAPI-based vector memory API
   - Extracts and stores facts from Ordpedia pages
   - Provides semantic search capabilities
   - Uses Qdrant as vector database backend

## Key Features

- **Real-time Monitoring**: Listens for page creation, updates, and approvals
- **GitHub Backup**: Maintains full revision history for all approved content
- **Memory Integration**: Extracts and stores facts for semantic retrieval
- **Redundancy Checks**: Avoids duplicate operations with existence verification
- **Logging**: Comprehensive logging of all operations

## System Startup

The system can be started in two ways:

1. **Integrated Startup** (recommended):
   ```bash
   npm run start:all
   # or
   ./start.sh
   ```
   This launches both Python Memory Server and TypeScript application

2. **Individual Components**:
   ```bash
   # Start Memory Server
   uvicorn main:app --reload
   
   # Start TypeScript App
   npm run dev
   ```

3. **Utility Scripts**:
   ```bash
   # Run Sync Audit
   npm run audit
   # or
   bun run auditSync.ts
   
   # Run GitHub Sync Only
   bun run src/initialSync.ts
   
   # Run Memory Sync Only
   bun run src/initialMemorySync.ts
   ```

## Initial Sync Process

When the system starts, it performs intelligent synchronization:

1. **Discovery**: Fetches all approved pages from Supabase
2. **Validation**:
   - Checks if GitHub files already exist
   - Checks if memories already exist
3. **Selective Sync**:
   - Only syncs pages/content that isn't already present
   - Skips fully synced content to avoid redundant operations

## Event-Driven Updates

The system responds to these Supabase events:

1. **New Page Creation**:
   - Posts tweet about new page
   - If page is pre-approved, syncs to GitHub/memory

2. **Page Updates**:
   - Page Approval: Syncs newly approved pages
   - Slug Changes: Renames GitHub folders, preserving content

3. **Revision Updates**:
   - Syncs newly approved revisions
   - Updates memory with latest content

## Memory System Integration

The memory system extracts structured facts from Ordpedia pages:

1. **Extraction Process**:
   - Deletes existing memories for a page
   - Sends content to memory API
   - LLM extracts discrete facts
   - Facts are stored in vector database
   - Memory IDs are recorded in Supabase

2. **Only Latest Content**:
   - Multiple revisions may be stored in GitHub
   - Only the latest approved revision is stored in memory
   - Ensures memory contains only current information

## GitHub Structure

Content is organized in GitHub following this structure:
```
repository/
   page-slug-1/
      revision-1.md
      revision-2.md
   page-slug-2/
      revision-1.md
   ...
```

## Sync Auditing

The system includes a comprehensive audit tool (`auditSync.ts`) to verify sync status:

1. **Complete Inventory**:
   - Checks all approved pages in the database
   - Verifies both GitHub and memory sync status

2. **Detailed Reporting**:
   - Total counts of pages and revisions
   - Number of fully synced pages
   - Number of partially synced pages (GitHub only or memory only)
   - List of unsynced pages with their specific status
   - Percentage calculation of sync completion

3. **Usage**:
   ```bash
   npm run audit
   ```

4. **Color-Coded Output**:
   - ✅ Fully synced pages (both GitHub and memory)
   - 🔵 GitHub only (missing memory)
   - 🟡 Memory only (missing GitHub)  
   - 🔴 Not synced at all

This tool is invaluable for system monitoring and ensuring data integrity across all platforms.

## Failure Handling

The system is designed for resilience:
- Failed operations are logged but don't stop the process
- Memory availability is checked before operations
- Missing memory server doesn't prevent GitHub operations
- Errors in one page sync don't affect others
- Comprehensive error logging with context for debugging

## Configuration

Configuration is managed through:
- Environment variables (.env file)
- TypeScript defaults
- Python API configuration

Key variables:
```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE=...
GITHUB_TOKEN=...
GITHUB_REPO_OWNER=...
GITHUB_REPO_NAME=...
MEMORY_API_URL=http://127.0.0.1:8000
QDRANT_URL=...
QDRANT_API_KEY=...
```