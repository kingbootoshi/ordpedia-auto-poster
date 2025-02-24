# mem0 API Server for Ordpedia Pages/Searching

A FastAPI-based memory service for storing and retrieving Bitcoin ecosystem information using vector embeddings and semantic search capabilities.

## Overview

This API service provides a streamlined interface for managing Ordpedia's memory system, focusing on three core operations:
- Adding new memories (documents/information)
- Searching existing memories
- Deleting memories (single or batch)

The service uses Qdrant as the vector store backend and maintains a fixed agent ID "Ordpedia" for all operations.

## Configuration

### Environment Variables

Required environment variables:
```env
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
```

### System Configuration

The system is configured with:
- Collection name: "ordpedia"
- Fixed agent ID: "Ordpedia"
- Custom prompt for Bitcoin ecosystem information extraction

## API Endpoints

### 1. Add Memory
Adds a new memory to the system.

```http
POST /add
Content-Type: application/json

{
    "content": "string",  // The content to add to memory
    "run_id": "string"   // Unique identifier for this batch/run
}
```

Example:
```json
{
    "content": "Based Angels is led by 13 (twitter.com/0x1x3x) with art by Spiralgaze (twitter.com/spiralgaze). The collection website is basedangels.net.",
    "run_id": "batch_20240224"
}
```

Response:
```json
{
    "status": "success",
    "result": {
        "memory_id": "uuid-string",
        "content": "string",
        // Additional memory metadata
    },
    "execution_time_seconds": 0.123
}
```

### 2. Search Memories
Search through stored memories using semantic search.

```http
POST /search
Content-Type: application/json

{
    "query": "string",        // Search query
    "run_id": "string"       // Optional: Filter by run_id
}
```

Example:
```json
{
    "query": "tell me about Based Angels",
    "run_id": "batch_20240224"  // Optional
}
```

Response:
```json
{
    "status": "success",
    "results": [
        {
            "memory_id": "uuid-string",
            "content": "string",
            "score": 0.95,
            // Additional memory metadata
        }
    ],
    "execution_time_seconds": 0.123
}
```

### 3. Delete Memory
Delete a specific memory by ID.

```http
POST /delete
Content-Type: application/json

{
    "memory_id": "string"    // UUID of the memory to delete
}
```

Example:
```json
{
    "memory_id": "258b33c5-a41f-4c99-ae69-b2a31f273838"
}
```

Response:
```json
{
    "status": "success",
    "result": true,
    "execution_time_seconds": 0.123
}
```

### 4. Delete All Memories
Delete all memories for a specific run_id.

```http
POST /delete_all
Content-Type: application/json

{
    "run_id": "string"      // Run ID to delete all memories for
}
```

Example:
```json
{
    "run_id": "batch_20240224"
}
```

Response:
```json
{
    "status": "success",
    "result": true,
    "execution_time_seconds": 0.123
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- 200: Successful operation
- 400: Bad request (invalid input)
- 500: Internal server error

Error Response Format:
```json
{
    "detail": "Error message description"
}
```

## Logging

The service includes comprehensive logging:
- Request/response logging with unique request IDs
- Execution time tracking
- Error logging with stack traces
- Log rotation with 10MB file size limit

Log files are stored in the `logs` directory:
- `api.log`: Main API operations log

## Running the Service

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Set up environment variables:
```bash
export QDRANT_URL=your_qdrant_url
export QDRANT_API_KEY=your_qdrant_api_key
```

3. Run the service:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Best Practices

1. **Run IDs**: Use meaningful run IDs that help identify batches of related memories based on the page UUID, this is so we can reference it for delete_all specifically

2. **Content Format**: When adding memories, structure your content clearly. The system works best with well-formatted, factual information about the Bitcoin ecosystem.

3. **Search Queries**: Make search queries specific and focused. The system uses semantic search, so natural language queries work well.

4. **Memory Management**: Regularly clean up old or outdated memories using the delete_all endpoint with the appropriate run_id. Should be used when a new page revision is added.

New page revision = wipe all memories for that run_id and add the new page revision again fully

## Information Extraction

The system uses a specialized prompt to extract and structure information about:
- Protocol/Project Details
- Individual/Team Information
- Technical Information
- Market/Economic Information
- Community & Ecosystem
- Historical Context

Each fact is structured to start with the main subject name and includes embedded social links within relevant facts.