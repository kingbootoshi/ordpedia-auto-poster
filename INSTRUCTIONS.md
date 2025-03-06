# Ordpedia Auto Poster - Developer Instructions

## System Setup

### Prerequisites
- Node.js 16+ and npm/Bun
- Python 3.10+
- Supabase account with service role key
- GitHub repository with access token
- Qdrant vector database instance

### Environment Configuration
Create a `.env` file in the project root with:

```env
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE=your-service-role-key

# GitHub
GITHUB_TOKEN=your-github-token
GITHUB_REPO_OWNER=username
GITHUB_REPO_NAME=ordpedia-info

# Twitter (optional)
CONSUMER_KEY=twitter-consumer-key
CONSUMER_SECRET=twitter-consumer-secret
ACCESS_TOKEN=twitter-access-token
ACCESS_TOKEN_SECRET=twitter-access-token-secret

# Memory Service
MEMORY_API_URL=http://127.0.0.1:8000

# Vector Database (for Python service)
QDRANT_URL=your-qdrant-url
QDRANT_API_KEY=your-qdrant-api-key
```

### Installation

1. **Install TypeScript dependencies**:
   ```bash
   npm install
   # or
   bun install
   ```

2. **Install Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Setup permissions for start script**:
   ```bash
   chmod +x start.sh
   ```

## Running the System

### Unified Start (Recommended)
This starts both TypeScript app and Python memory server:

```bash
npm run start:all
# or
./start.sh
```

### Individual Components
To run components separately:

**Memory Server**:
```bash
uvicorn main:app --reload
```

**TypeScript App**:
```bash
npm run dev
# or
bun run src/index.ts
```

## Key Operations

### Initial Sync
The system will automatically perform initial sync on startup:

1. Check for existing GitHub files and memories
2. Only sync content that doesn't already exist
3. Skip fully synchronized pages

### One-Time Sync Jobs
If you need to run specific sync jobs:

**GitHub Sync Only**:
```bash
bun run src/initialSync.ts
```

**Memory Sync Only**:
```bash
bun run src/initialMemorySync.ts
```

## System Architecture
1. **TypeScript service** monitors Supabase for changes and orchestrates syncs
2. **Python FastAPI** provides vector memory storage and retrieval
3. **Memory system** extracts facts from Ordpedia pages for semantic search
4. **GitHub integration** maintains backup of all approved content

## Monitoring
The system produces detailed logs:

- TypeScript logs show real-time events and sync operations
- Python API logs in `logs/api.log` show memory operations
- All logs include request IDs, timestamps, and execution details

## Troubleshooting

### Memory Server Not Starting
- Check Python version and dependencies
- Verify Qdrant connection details
- Check for port conflicts (default: 8000)

### GitHub Sync Issues
- Verify GitHub token permissions (needs repo access)
- Check repository existence and write access
- Look for rate limiting issues in logs

### Supabase Connection Problems
- Verify service role key has necessary permissions
- Check for network connectivity issues
- Ensure realtime functionality is enabled in Supabase dashboard