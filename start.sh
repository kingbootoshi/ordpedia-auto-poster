#!/bin/bash

# Start Python FastAPI server in background
echo "Starting Python FastAPI server..."
uvicorn main:app --reload &
PYTHON_PID=$!

# Wait for Python server to initialize (5 seconds)
echo "Waiting for Python server to initialize..."
sleep 5

# Start TypeScript application
echo "Starting TypeScript application..."
npm run dev

# Clean up Python server when TypeScript app exits
trap "kill $PYTHON_PID" EXIT