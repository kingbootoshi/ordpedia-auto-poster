import os
import sys
from pathlib import Path
import json
import logging
from logging.handlers import RotatingFileHandler
from typing import Optional
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid

# Add the project root to Python path
sys.path.append(str(Path(__file__).parent))

from mem0 import Memory

def setup_logger():
    """Configure logging with proper process safety for multiple workers and detailed request information."""
    logger = logging.getLogger(__name__)
    logger.setLevel(logging.INFO)

    if logger.hasHandlers():
        logger.handlers.clear()

    # Create logs directory if it doesn't exist
    os.makedirs('logs', exist_ok=True)

    # Detailed formatter for both console and file
    detailed_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | PID:%(process)d | %(name)s | '
        '%(filename)s:%(lineno)d | %(funcName)s | '
        '%(message)s'
    )

    # Console Handler with detailed formatting
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(detailed_formatter)

    # Main API log file with rotation
    api_handler = RotatingFileHandler(
        filename='logs/api.log',
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5,
        delay=True
    )
    api_handler.setLevel(logging.INFO)
    api_handler.setFormatter(detailed_formatter)

    logger.addHandler(console_handler)
    logger.addHandler(api_handler)

    return logger

logger = setup_logger()

load_dotenv()

# Custom prompt for information extraction
custom_prompt = """
You are a Bitcoin Ecosystem Information Extractor, specialized in accurately storing facts about anything in the Bitcoin ecosystem including protocols, collections, individuals, tools, marketplaces, technologies, and developments. Your primary role is to extract relevant pieces of information and organize them into distinct, manageable facts. This allows for easy retrieval and reference in future interactions.

Types of Information to Remember:
1. Protocol/Project Details:
   - Technical specifications
   - Launch dates
   - Team members/Creators (with their social links embedded)
   - Implementation details
   - Architecture
   - Use cases
   - Network statistics

2. Individual/Team Information:
   - Roles and contributions (with social links embedded)
   - Notable achievements
   - Project affiliations
   - Historical significance
   - Social presence (always embedded with relevant facts)

3. Technical Information:
   - Implementation details
   - Blockchain specifics
   - Technical architecture
   - Integration points
   - Security features
   - Performance metrics
   - Network parameters

4. Market/Economic Information:
   - Trading platforms
   - Market statistics
   - Economic models
   - Fee structures
   - Trading volumes
   - Market impact

5. Community & Ecosystem:
   - Official project links (grouped together)
   - Partnerships
   - Integrations
   - Community initiatives
   - Governance structures

6. Historical Context:
   - Development milestones
   - Notable events
   - Protocol upgrades
   - Market events
   - Community developments

Here are some few shot examples:

Input: "Ordinals Protocol, created by Casey Rodarmor (twitter.com/rodarmor), introduced inscriptions on satoshis in January 2023. The protocol documentation is at docs.ordinals.com."
Output: {{"facts": ["Ordinals Protocol was created by Casey Rodarmor (twitter.com/rodarmor)", "Ordinals Protocol launched in January 2023", "Ordinals Protocol's documentation is available at docs.ordinals.com"]}}

Input: "Based Angels is led by 13 (twitter.com/0x1x3x) with art by Spiralgaze (twitter.com/spiralgaze). The collection website is basedangels.net."
Output: {{"facts": ["Based Angels is led by 13 (twitter.com/0x1x3x) with art created by Spiralgaze (twitter.com/spiralgaze)", "Based Angels official website is basedangels.net"]}}

Input: "Adam Back (twitter.com/adam3us), CEO of Blockstream (blockstream.com), invented Hashcash in 1997."
Output: {{"facts": ["Adam Back (twitter.com/adam3us) is the CEO of Blockstream (blockstream.com)", "Adam Back invented Hashcash in 1997"]}}

Return the extracted facts in a json format as shown above. EVERY fact MUST start with the main subject name (e.g., if extracting facts about "Lightning Network", every fact must start with "Lightning Network...").

Remember:
- ALWAYS start each fact with the main subject name (protocol, person, project, etc.)
- ALWAYS embed social links within the relevant fact about the person/creator
- Group related information together (e.g., creator + their social links in the same fact)
- Extract ALL technical specifications and numbers precisely
- Include ALL relevant links and references
- Capture ALL features and characteristics specifically
- Note ALL related projects, protocols, or individuals
- Record ALL team members, creators, or contributors with their social links
- NO vague descriptions - be specific and detailed
- Use active voice and clear, direct statements
- Maintain technical accuracy in all descriptions

MANDATORY OUTPUT:
{{"facts": ["<SUBJECT_NAME> fact 1 with embedded links", "<SUBJECT_NAME> fact 2", "..."]}}
"""

# Initialize configurations for the memory system
config = {
    "vector_store": {
        "provider": "qdrant",
        "config": {
            "collection_name": "ordpedia",
            "url": os.getenv("QDRANT_URL"),
            "api_key": os.getenv("QDRANT_API_KEY"),
        },
    },
    "custom_prompt": custom_prompt,
    "version": "v1.1"
}

# Initialize memory instance
memory_instance = Memory.from_config(config_dict=config)
app = FastAPI()

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

### Pydantic models ###
class AddRequest(BaseModel):
    """Request model for adding memories"""
    content: str  # The content to add to memory
    run_id: str   # The run ID for this addition

class SearchRequest(BaseModel):
    """Request model for searching memories"""
    query: str  # The search query
    run_id: Optional[str] = None  # Optional run ID filter

class DeleteRequest(BaseModel):
    """Request model for deleting a specific memory"""
    memory_id: str  # The ID of the memory to delete

class DeleteAllRequest(BaseModel):
    """Request model for deleting all memories for a run"""
    run_id: str  # The run ID to delete all memories for

class SearchFormattedRequest(BaseModel):
    """Request model for the search_formatted endpoint"""
    query: str
    run_id: Optional[str] = None
    limit: Optional[int] = None

@app.post("/add")
def add_memory(req: AddRequest):
    """Add a new memory with agent_id='ordpedia'"""
    try:
        logger.info(f"Adding memory for run_id: {req.run_id}")
        start_time = datetime.now()
        
        response = memory_instance.add(
            req.content,
            agent_id="ordpedia",
            run_id=req.run_id
        )
        
        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"Memory added successfully in {execution_time:.3f}s")
        
        return {
            "status": "success",
            "result": response,
            "execution_time_seconds": execution_time
        }
    except Exception as e:
        logger.error(f"Error adding memory: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search")
def search_memory(req: SearchRequest):
    """Search memories with optional run_id filter using agent_id='ordpedia'"""
    try:
        logger.info(f"Searching memories | Query: '{req.query}' | Run ID: {req.run_id}")
        start_time = datetime.now()

        # Build search parameters
        search_params = {
            "agent_id": "ordpedia"
        }
        if req.run_id:
            search_params["run_id"] = req.run_id

        results = memory_instance.search(req.query, **search_params)
        execution_time = (datetime.now() - start_time).total_seconds()
        
        logger.info(f"Search completed | Results found: {len(results)} | Time: {execution_time:.3f}s")
        
        return {
            "status": "success",
            "results": results,
            "execution_time_seconds": execution_time
        }
    except Exception as e:
        logger.error(f"Error searching memories: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/delete")
def delete_memory(req: DeleteRequest):
    """Delete a specific memory by ID with agent_id='ordpedia'"""
    try:
        logger.info(f"Deleting memory ID: {req.memory_id}")
        start_time = datetime.now()
        
        result = memory_instance.delete(req.memory_id)
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return {
            "status": "success",
            "result": result,
            "execution_time_seconds": execution_time
        }
    except Exception as e:
        logger.error(f"Error deleting memory: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/delete_all")
def delete_all_memories(req: DeleteAllRequest):
    """Delete all memories for a specific run_id with agent_id='ordpedia'"""
    try:
        logger.info(f"Deleting all memories for run_id: {req.run_id}")
        start_time = datetime.now()
        
        result = memory_instance.delete_all(
            agent_id="ordpedia",
            run_id=req.run_id
        )
        
        execution_time = (datetime.now() - start_time).total_seconds()
        
        return {
            "status": "success",
            "result": result,
            "execution_time_seconds": execution_time
        }
    except Exception as e:
        logger.error(f"Error in delete_all: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/search_formatted")
def search_formatted(req: SearchFormattedRequest):
    """
    Search memories and return bullet-point results.
    Default limit is 20 if not specified.
    """
    try:
        logger.info(f"Formatted search | Query: '{req.query}' | Run ID: {req.run_id} | Limit: {req.limit}")
        start_time = datetime.now()

        search_params = {
            "agent_id": "ordpedia"
        }
        if req.run_id:
            search_params["run_id"] = req.run_id

        limit = req.limit if req.limit else 20
        results = memory_instance.search(req.query, limit=limit, **search_params)

        bullet_points = "\n".join([f"- {item['memory']}" for item in results])

        execution_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"Formatted search completed | Found: {len(results)} results | Time: {execution_time:.3f}s")

        return {
            "status": "success",
            "results": results,
            "bullet_points": bullet_points,
            "execution_time_seconds": execution_time
        }
    except Exception as e:
        logger.error(f"Error in search_formatted: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.middleware("http")
async def log_request_info(request, call_next):
    """Middleware to log detailed request information"""
    request_id = str(uuid.uuid4())
    
    logger.info(
        f"Request {request_id} | "
        f"Method: {request.method} | "
        f"URL: {request.url} | "
        f"Client: {request.client.host}:{request.client.port}"
    )

    start_time = datetime.now()
    response = await call_next(request)
    duration = (datetime.now() - start_time).total_seconds()

    logger.info(
        f"Response {request_id} | "
        f"Status: {response.status_code} | "
        f"Duration: {duration:.3f}s"
    )

    return response

@app.get("/health")
async def health_check():
    """Health check endpoint for server availability detection"""
    return {"status": "ok", "service": "memory-api"}

@app.on_event("startup")
async def startup_event():
    """Log startup information"""
    logger.info(f"Starting Ordpedia Memory API service - PID: {os.getpid()}")
    logger.info(f"Qdrant URL: {os.getenv('QDRANT_URL')}")
    logger.info("Configuration loaded successfully")