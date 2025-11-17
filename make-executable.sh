#!/bin/bash

# Make all shell scripts executable
chmod +x fix-typescript-errors.sh
chmod +x typescript-fixes-applied.sh
chmod +x continue-dev.sh

echo "✅ All scripts are now executable!"
echo ""
echo "To continue development, run:"
echo "  ./continue-dev.sh"
echo ""
echo "This will:"
echo "1. Build all packages with the TypeScript fixes"
echo "2. Start the development server at http://localhost:5173"
