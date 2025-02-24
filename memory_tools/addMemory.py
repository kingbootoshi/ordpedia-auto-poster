import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from neo4j import GraphDatabase
import json
import glob
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime

# Add the project root to Python path
sys.path.append(str(Path(__file__).parent.parent))

from mem0 import Memory

load_dotenv()

os.environ["OPENAI_API_KEY"] = os.getenv("OPENAI_API_KEY")

def setup_logging():
    """
    Configure comprehensive logging with multiple handlers and formatters.
    Creates a logs directory structure with run-specific folders.
    """
    # Create base logs directory
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    
    # Create a unique run folder based on timestamp
    run_timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    run_dir = log_dir / f"run_{run_timestamp}"
    run_dir.mkdir(exist_ok=True)
    
    # Create level-specific directories within the run folder
    for level in ["debug", "info", "error"]:
        (run_dir / level).mkdir(exist_ok=True)

    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(logging.DEBUG)

    # Clear any existing handlers
    if logger.hasHandlers():
        logger.handlers.clear()

    # Common log format
    detailed_formatter = logging.Formatter(
        '%(asctime)s | %(levelname)-8s | %(process)d | %(threadName)s | '
        '%(filename)s:%(lineno)d | %(funcName)s | %(message)s'
    )
    
    # Console Handler - INFO level
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(detailed_formatter)
    logger.addHandler(console_handler)

    # Debug File Handler
    debug_handler = RotatingFileHandler(
        filename=run_dir / "debug" / "debug.log",
        maxBytes=10*1024*1024,  # 10MB
        backupCount=5
    )
    debug_handler.setLevel(logging.DEBUG)
    debug_handler.setFormatter(detailed_formatter)
    logger.addHandler(debug_handler)

    # Info File Handler
    info_handler = RotatingFileHandler(
        filename=run_dir / "info" / "info.log",
        maxBytes=10*1024*1024,
        backupCount=5
    )
    info_handler.setLevel(logging.INFO)
    info_handler.setFormatter(detailed_formatter)
    logger.addHandler(info_handler)

    # Error File Handler
    error_handler = RotatingFileHandler(
        filename=run_dir / "error" / "error.log",
        maxBytes=10*1024*1024,
        backupCount=5
    )
    error_handler.setLevel(logging.ERROR)
    error_handler.setFormatter(detailed_formatter)
    logger.addHandler(error_handler)

    # Log the run start with run directory information
    logger.info(f"Starting new logging session in directory: {run_dir}")

    return logger

# Initialize logger
logger = setup_logging()
 
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

!!! IMPORTANT !!!

IT IS VERY VERY IMPORTANT THAT YOU:
1. RETURN THE RESPONSE IN THE JSON FORMAT AS SHOWN ABOVE
2. START EVERY FACT WITH THE MAIN SUBJECT NAME
3. BE SPECIFIC AND AVOID VAGUE DESCRIPTIONS
4. MAINTAIN TECHNICAL ACCURACY
5. EMBED SOCIAL LINKS WITHIN RELEVANT FACTS (NOT AS SEPARATE FACTS)

MANDATORY OUTPUT:
{{"facts": ["<SUBJECT_NAME> fact 1 with embedded links", "<SUBJECT_NAME> fact 2", "..."]}}
"""

# Initialize configurations for the memory system
config = {
    "vector_store": {
        "provider": "qdrant",
            "config": {
                "collection_name": "test",
                "url": os.getenv("QDRANT_URL"),
                "api_key": os.getenv("QDRANT_API_KEY"),
            },
    },
    "custom_prompt": custom_prompt,
    "version": "v1.1"
}

logger.info("Initializing memory system...")
logger.debug(f"Memory system configuration: {json.dumps({k: v for k, v in config.items() if k != 'custom_prompt'}, indent=2)}")
m = Memory.from_config(config_dict=config)
logger.info("Memory system initialized.")

# Define the memories for each category
test_memories = [
    """Based Angels is a collection of 5,555 recursive PFPs inscribed on the motherchain Bitcoin in May 2024.You can view and trade the Based Angels collection on the secondary market Magic Eden.

About
Based Angels is a derivative of the Redacted Remilio Babies: companion collection to Milady Maker, inscribed on Bitcoin blockchain led by 13 with art by Spiralgaze.Angel-Memes-Lab.png

The collection is inspired by the aesthetics and fashion of the 2000s-2010s through the lens of nostalgia, channeling it into modern Bitcoin technology, with orange hair as a symbol and the main color of the Bitcoin blockchain.

Style & Races
Based Angels consist of five types of bodies: Normie & Tanned human, Archangel, Fallen & Guardian.Angel-Memes-Lab-1.pngSome of the Angels have special clothes, costumes, hands and many other amazing attributes and styles to follow.Angel-Memes-Lab-2.png

Related Projects
Based Angels has two official projects related to the main collection.

BASED•ANGELS•RUNE was etched and airdropped on May 18th to holders, with 75 runes for every unlisted angel. The snapshot was taken on May 13th.

The Based Angels Honoraries collection is the visual embodiment of art by Spiralgaze, given as a gift and token of appreciation to the project's friends and OG holders.Angel-Memes-Lab-3.png

Official Links
Official Website and Meme Editor: https://basedangels.net/
Twitter/X: https://twitter.com/basedangelsbtc
Based Angels Marketplace: https://magiceden.io/ordinals/marketplace/basedangels
Based Angels Honoraries: https://magiceden.io/ordinals/marketplace/based-angels-honoraries
Based Angels Rune Marketplace: https://magiceden.io/runes/BASED%E2%80%A2ANGELS%E2%80%A2RUNE
Based Angels Memedepot: https://memedepot.com/d/basedangels
0x1x3x Twitter: https://twitter.com/0x1x3x
Spiralgaze Twitter: https://twitter.com/spiralgaze"""
]

# Function to format memories as a single string
def format_memories(memories):
    logger.debug(f"Formatting {len(memories)} memories")
    return "\n".join(f"• {memory}" for memory in memories)

try:
    # Add test memories
    logger.info("Starting test memory addition process")
    test_memory_string = format_memories(test_memories)
    logger.debug(f"Formatted test memories: {test_memory_string}")
    test_result = m.add(test_memory_string, agent_id="test_agent")
    logger.info(f"Added test memories successfully: {test_result}")

except Exception as e:
    logger.error(f"Error adding test memories: {str(e)}", exc_info=True)
    raise