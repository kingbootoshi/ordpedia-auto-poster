# CLAUDE.md - Ordpedia Auto Poster Guidelines

## VITAL INSTRUCTIONS TO FOLLOW:

1. If you do not have context of the docs of this project, open and read all the .md's from docs/ located in the root of the folder you are currently in

2. Once you are familiarized with the codebase, open up INSTRUCTIONS in the folder for_claude/INSTRUCTIONS.md. That folder also includes PROBLEMS.md and provided SOLUTIONS.md for you to implement. READ the problems AND the solutions

3. The SOLUTIONS.md will contain instructions for you to follow and implement. Focus on following the guidelines and technical specification the SOLUTIONS.md file provides to you

4. After you finish developing, you MUST update for_claude/DEVELOPER_LOGS.md, explaining the latest changes you just did to the codebase and tracking it. Explain concisely the problem(s), and the solution you implemented.

## Build & Run Commands
- TypeScript only: `bun run src/index.ts` or `npm run dev`
- Python API only: `uvicorn main:app --reload`
- Run both servers together: `npm run start:all` or `./start.sh`
- Memory tools: `python memory_tools/addMemory.py`, `python memory_tools/searchMemory.py`
- Audit sync status: `npm run audit` or `bun run auditSync.ts`
- GitHub sync only: `bun run src/initialSync.ts`
- Memory sync only: `bun run src/initialMemorySync.ts`
- Initialize revision tracking: `npm run init-tracking` or `bun run src/initRevisionTracking.ts`

## Code Style Guidelines
- TypeScript: Use strict typing, camelCase, async/await for promises
- Python: Follow PEP 8, use snake_case, structured logging, type hints
- Error handling: Always catch and log errors with context
- Logging: Use pino for TypeScript, Python's logging module for Python

## Project Structure
- TypeScript app monitors Supabase for Ordpedia updates and:
  1. Posts updates to Twitter
  2. Syncs approved content to GitHub repository
  3. Stores content in vector memory via Python API
- Python FastAPI service provides vector memory storage and retrieval
- Memory system extracts facts from Ordpedia pages for semantic search
- Intelligent sync detection avoids redundant operations
- Audit tools verify sync status across all systems

## Environment Configuration
- Store all secrets in .env file (never commit to repo)
- Required: SUPABASE_URL, SUPABASE_SERVICE_ROLE, GITHUB_TOKEN, etc.