import { uploadAllApprovedPages } from './gitPoster'
import pino from 'pino'
import * as dotenv from 'dotenv'

// Load environment variables first
dotenv.config()

// Initialize logger with more detailed settings
const logger = pino({
  name: 'ordpedia-initial-sync',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Enable error serialization
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err
  }
})

// Verify required environment variables
const requiredEnvVars = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE',
  'GITHUB_TOKEN',
  'GITHUB_REPO_OWNER',
  'GITHUB_REPO_NAME'
]

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName])
if (missingEnvVars.length > 0) {
  logger.error({ missingEnvVars }, 'Missing required environment variables')
  process.exit(1)
}

// Run the initial sync
logger.info({
  supabaseUrl: process.env.SUPABASE_URL,
  githubRepo: `${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`
}, 'Starting initial sync of all approved pages to GitHub...')

uploadAllApprovedPages()
  .then(() => {
    logger.info('Initial sync completed successfully!')
    process.exit(0)
  })
  .catch((err) => {
    const error = err as Error
    logger.error({
      error: {
        message: error.message,
        stack: error.stack,
        cause: error.cause
      }
    }, 'Fatal error during initial sync')
    process.exit(1)
  }) 