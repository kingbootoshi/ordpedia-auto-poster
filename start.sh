#!/bin/bash

# Start Python FastAPI server in background
echo "Starting Python FastAPI server..."
uvicorn main:app --reload &
PYTHON_PID=$!

# Wait for Python server to initialize (5 seconds)
echo "Waiting for Python server to initialize..."
sleep 5

# Start search interface server in background
echo "Starting search interface server on port 4444..."
node search-server.cjs &
SEARCH_PID=$!

# Wait for search server to initialize
echo "Waiting for search interface server to initialize..."
sleep 2

echo "All servers started!"
echo "- Memory API:      http://localhost:8000"
echo "- Search Interface: http://localhost:4444"

# Start TypeScript application
echo "Starting TypeScript application..."
npm run dev

# Clean up all servers when TypeScript app exits
cleanup() {
  echo "Shutting down servers..."
  kill $PYTHON_PID
  kill $SEARCH_PID
}

trap cleanup EXIT