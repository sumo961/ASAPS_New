#!/bin/bash

# Quick fix for Inspector type errors
# Uses type assertions to bypass TypeScript checking until core is rebuilt

echo "Applying quick Inspector fix with type assertions..."

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Backup current Inspector
cp "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx" \
   "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx.backup.$(date +%Y%m%d_%H%M%S)"

# Fix the clearConnections line using sed
sed -i.bak 's/if (beat\.clearConnections) { beat\.clearConnections(); } else { beat\.connections = \[\]; }/\/\/ Use type assertion to bypass TypeScript checking until core types are updated\n      const beatAny = beat as any;\n      if (beatAny.clearConnections) {\n        beatAny.clearConnections();\n      } else {\n        beat.connections = [];\n      }/' "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx"

echo "✅ Applied type assertion fix"
echo ""
echo "Now rebuild in order:"
echo "1. cd packages/core && npm run build"
echo "2. cd ../renderer && npm run build"  
echo "3. cd ../builder && npm run build"
echo ""
echo "Or just run: npm run build"
