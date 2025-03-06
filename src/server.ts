import fetch from 'node-fetch';
import { exec } from 'child_process';

const MEMORY_API_URL = process.env.MEMORY_API_URL || 'http://127.0.0.1:8000';
const MAX_RETRIES = 5;
const RETRY_DELAY = 2000;

/**
 * Check if memory server is running
 */
export async function checkMemoryServer(retryCount = 0): Promise<boolean> {
  try {
    const response = await fetch(`${MEMORY_API_URL}/health`, { method: 'GET' });
    return response.status === 200;
  } catch (error) {
    if (retryCount < MAX_RETRIES) {
      console.log(`Memory server not available, retrying in ${RETRY_DELAY/1000}s (${retryCount + 1}/${MAX_RETRIES})...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
      return checkMemoryServer(retryCount + 1);
    }
    return false;
  }
}

/**
 * Start memory server if not running
 */
export function startMemoryServer(): Promise<boolean> {
  return new Promise((resolve) => {
    console.log('Starting memory server...');
    const pythonServer = exec('uvicorn main:app --reload');
    
    pythonServer.stdout?.on('data', (data) => {
      console.log(`Memory server: ${data}`);
      if (data.includes('Application startup complete')) {
        resolve(true);
      }
    });
    
    pythonServer.stderr?.on('data', (data) => {
      console.error(`Memory server error: ${data}`);
    });
    
    // Set a timeout for server startup
    setTimeout(() => resolve(false), 10000);
  });
}

/**
 * Ensure memory server is available, starting it if needed
 */
export async function ensureMemoryServer(): Promise<boolean> {
  const isAvailable = await checkMemoryServer();
  
  if (isAvailable) {
    console.log('Memory server is available');
    return true;
  }
  
  console.log('Memory server not detected, attempting to start...');
  return startMemoryServer();
}