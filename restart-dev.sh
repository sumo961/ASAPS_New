#!/bin/bash
# Quick script to restart the dev server

echo "🔄 Restarting dev server..."
echo ""

# Kill any existing dev server on port 5173 or 5174
echo "Stopping existing dev server..."
pkill -f "vite" 2>/dev/null
sleep 2

# Start dev server
echo "Starting dev server..."
cd "/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/builder" && npm run dev
