# mem0 API Server for Ordpedia Pages/Searching

A FastAPI-based memory service for storing and retrieving Bitcoin ecosystem information using vector embeddings and semantic search capabilities.

To start
```
uvicorn main:app --reload
```

Server will be available at http://127.0.0.1:8000

## Overview

This API service provides a streamlined interface for managing Ordpedia's memory system, focusing on core operations:
- Adding new memories (documents/information)
- Searching existing memories
- Deleting single or all memories for a given `run_id`
- An additional search endpoint that returns bullet-point results

The service uses Qdrant as the vector store backend and maintains a fixed `agent_id="ordpedia"` for all operations.

## Configuration

### Environment Variables

Required environment variables:
```env
QDRANT_URL=your_qdrant_url
QDRANT_API_KEY=your_qdrant_api_key
```

### System Configuration

The system is configured with:
- Collection name: `ordpedia`
- Fixed agent ID: `ordpedia`
- Custom prompt for Bitcoin ecosystem information extraction

## API Endpoints

### 1. Add Memory
Adds a new memory to the system with `agent_id="ordpedia"`.

```http
POST /add
Content-Type: application/json

{
    "content": "string",  // The content to add
    "run_id": "string"    // Typically the page UUID
}
```

Example:
```json
{
    "content": "Based Angels is led by 13 (twitter.com/0x1x3x) with art by Spiralgaze (twitter.com/spiralgaze). The collection website is basedangels.net.",
    "run_id": "9cd68c44-f361-4edf-8a5a-3d8cd488c603"
}
```

Response:
```json
{
    "status": "success",
    "result": {
        "results": [
            {
                "id": "uuid-string",
                "memory": "Based Angels is led by 13 (twitter.com/0x1x3x)..."
            }
        ]
    },
    "execution_time_seconds": 0.123
}
```

### 2. Search Memories
Semantic search through stored memories.

```http
POST /search
Content-Type: application/json

{
    "query": "string",        
    "run_id": "string"        // Optional: filter by run_id
}
```

Example:
```json
{
    "query": "tell me about Based Angels",
    "run_id": "9cd68c44-f361-4edf-8a5a-3d8cd488c603"
}
```

Response:
```json
{
    "status": "success",
    "results": [
        {
            "id": "uuid-string",
            "memory": "Based Angels is led by 13 (twitter.com/0x1x3x)...",
            "score": 0.95
        }
    ],
    "execution_time_seconds": 0.123
}
```

### 3. Delete Memory
Deletes a specific memory by ID.

```http
POST /delete
Content-Type: application/json

{
    "memory_id": "uuid-string"
}
```

Response:
```json
{
    "status": "success",
    "result": {
        "message": "Memory deleted successfully!"
    },
    "execution_time_seconds": 0.456
}
```

### 4. Delete All Memories
Deletes all memories for a specific run_id.

```http
POST /delete_all
Content-Type: application/json

{
    "run_id": "uuid-string"
}
```

Example:
```json
{
    "run_id": "9cd68c44-f361-4edf-8a5a-3d8cd488c603"
}
```

Response:
```json
{
    "status": "success",
    "result": {
        "message": "All memories deleted successfully!"
    },
    "execution_time_seconds": 0.456
}
```

### 5. Search Formatted
Returns the top matching memories as bullet points. Default limit is 20.

```http
POST /search_formatted
Content-Type: application/json

{
    "query": "string",
    "run_id": "string",       // optional
    "limit": 20              // optional, default 20
}
```

Example:
```json
{
    "query": "tell me about Based Angels",
    "run_id": "9cd68c44-f361-4edf-8a5a-3d8cd488c603",
    "limit": 5
}
```

Response:
```json
{
    "status": "success",
    "results": [
        {
            "id": "uuid-string",
            "memory": "Based Angels is led by 13...",
            "score": 0.95
        }
    ],
    "bullet_points": "- Based Angels is led by 13...\n- Another memory fact...",
    "execution_time_seconds": 0.123
}
```

## Error Handling

All endpoints return appropriate HTTP status codes:
- **200**: Successful operation
- **500**: Internal server error (with JSON error details)

Error response example:
```json
{
  "detail": "Error message description"
}
```

## Running the Service

1. **Install dependencies**:
```bash
pip install -r requirements.txt
```

2. **Set environment variables**:
```bash
export QDRANT_URL=your_qdrant_url
export QDRANT_API_KEY=your_qdrant_api_key
```

3. **Run the service**:
```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Best Practices

1. **Use run_id = Page UUID**: For each Ordpedia page, use its unique ID as `run_id`. If a page gets revised, `delete_all` then re-add new content with the same `run_id`.
2. **Content Format**: Provide well-structured, factual information about the Bitcoin ecosystem for best extraction results.
3. **Semantic Queries**: Use natural language in queries for better semantic matches.
4. **Memory Management**: Regularly remove outdated data with `delete_all` before adding new content if a page changes.