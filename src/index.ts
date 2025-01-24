import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import OAuth from 'oauth-1.0a'
import crypto from 'crypto'
import fetch from 'node-fetch'
import pino from 'pino'

// Initialize logger
const logger = pino({
  name: 'ordpedia-auto-poster',
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label.toUpperCase() }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
})

// Load environment variables from .env
dotenv.config()

// Initialize OAuth 1.0a
const oauth = new OAuth({
  consumer: {
    key: process.env.CONSUMER_KEY as string,
    secret: process.env.CONSUMER_SECRET as string,
  },
  signature_method: 'HMAC-SHA1',
  hash_function(baseString: string, key: string) {
    return crypto
      .createHmac('sha1', key)
      .update(baseString)
      .digest('base64')
  },
})

// Function to post a tweet
async function postTweet(text: string, reply_to?: string): Promise<string> {
  const tweetEndpoint = 'https://api.twitter.com/2/tweets'
  
  // Prepare tweet data with optional reply
  const tweetData = reply_to 
    ? { text, reply: { in_reply_to_tweet_id: reply_to } }
    : { text }

  // Get OAuth header
  const authHeader = oauth.toHeader(oauth.authorize({
    url: tweetEndpoint,
    method: 'POST',
  }, {
    key: process.env.ACCESS_TOKEN as string,
    secret: process.env.ACCESS_TOKEN_SECRET as string,
  }))

  try {
    logger.debug({ tweetData }, 'Posting tweet')
    const response = await fetch(tweetEndpoint, {
      method: 'POST',
      headers: {
        ...authHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(tweetData),
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error({ 
        status: response.status,
        response: errorText,
        headers: Object.fromEntries(response.headers)
      }, 'Failed to post tweet')
      throw new Error(`Failed to post tweet: ${errorText}`)
    }

    const data = await response.json() as { data: { id: string } }
    logger.debug({ response: data }, 'Successfully posted tweet')
    return data.data.id
  } catch (error) {
    logger.error({ error }, 'Failed to post tweet')
    throw error
  }
}

async function main() {
  // Create a Supabase client using your service role key
  const supabase = createClient(
    process.env.SUPABASE_URL as string,
    process.env.SUPABASE_SERVICE_ROLE as string
  )

  // Listen for new inserts in the "pages" table
  supabase
    .channel('pages-inserts')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'pages' },
      async (payload) => {
        try {
          logger.info('New page inserted:', payload.new)
          const newPage = payload.new

          // Fetch the user from "users" table to get their Twitter username
          const { data: userRecord, error: userError } = await supabase
            .from('users')
            .select('username')
            .eq('id', newPage.created_by)
            .single()

          if (userError || !userRecord) {
            logger.error('Error fetching user record:', userError)
            return
          }

          // Construct tweet content
          const twitterHandle = `@${userRecord.username}`
          const pageTitle = newPage.title
          const pageSlug = newPage.slug

          // Post the first tweet
          const firstTweetId = await postTweet(
            `A new Ordpedia page was created! ${twitterHandle} has created a new page "${pageTitle}"

View the page link down below 👇`
          )

          console.log("First tweet id:", firstTweetId)

          // Post the second tweet as a reply to the first tweet
          await postTweet(
            `https://www.ordpedia.com/page/${pageSlug}`,
            firstTweetId
          )

          logger.info('Successfully posted tweet thread for new page:', pageTitle)
        } catch (err) {
          logger.error('Error handling new page insert:', err)
        }
      }
    )
    .subscribe()

  logger.info('Listening for new page inserts... Press Ctrl+C to exit.')
}

main().catch((err) => {
  logger.error('Fatal error in main:', err)
})