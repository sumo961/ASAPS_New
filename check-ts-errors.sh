#!/bin/bash

echo "Checking TypeScript compilation errors in renderer package..."
cd "packages/renderer"
npx tsc --noEmit 2>&1 | tee ../../ts-errors.log

echo ""
echo "TypeScript check complete. Errors saved to ts-errors.log"
