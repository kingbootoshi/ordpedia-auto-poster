# Ordpedia Auto Poster System - Todo List

## Completed Tasks
- ✅ Make it so new pages that are approved are saved to public GitHub
- ✅ Save all existing pages to GitHub
- ✅ Set up a cloud memory pipeline that takes entire pages, extracts facts, and becomes queryable
- ✅ Save memory IDs for each page in Supabase for tracking
- ✅ Implement revision synchronization with proper GitHub folder structure
- ✅ Delete old facts when a page gets revised, then re-run the pipeline
- ✅ Unified startup process for both TypeScript and Python servers
- ✅ Add redundancy checks to avoid unnecessary operations during initial sync
- ✅ Add health check endpoint to memory service

## In Progress
- 🔄 Evaluate fact extraction reliability (vs. chunking sentences into facts)
- 🔄 Performance optimization for large-scale initial syncs

## Todo
- Turn Ordpedia server into a developer API that returns relevant data based on queries
- Add more comprehensive memory search capabilities
- Implement special pages about specific keywords/concepts
- Add monitoring and alerting for sync failures
- Build a dashboard for tracking system status
- Deploy a service to analyze recent chats and add new pages automatically
- Implement related words/topics feature using memory system
- Add telemetry for monitoring system performance