# ASPAS Modern - Troubleshooting Guide

## Common Issues and Solutions

### 1. Missing Configuration Files

**Issue**: `tsconfig.json` or `vite.config.ts` missing for renderer package

**Solution**: These files have been added. If you still see errors:
```bash
# Run clean install
chmod +x clean-install.sh
./clean-install.sh

# Or on Windows
clean-install.bat
```

### 2. Module Resolution Errors

**Issue**: Cannot find module '@asaps/core' or '@asaps/renderer'

**Solution**: Build packages in correct order:
```bash
# Build core first (required by others)
npm run build -w @asaps/core

# Build renderer (depends on core)
npm run build -w @asaps/renderer

# Then start the builder
npm run dev -w @asaps/builder
```

### 3. Port Already in Use

**Issue**: Port 5173 is already in use

**Solution**: Either kill the process using the port or use a different port:
```bash
# Find process using port 5173
lsof -i :5173  # Mac/Linux
netstat -ano | findstr :5173  # Windows

# Or change port in packages/builder/vite.config.ts
server: {
  port: 3000,  // or any available port
  open: true
}
```

### 4. TypeScript Errors

**Issue**: TypeScript compilation errors

**Solution**: Ensure all TypeScript configurations are correct:
```bash
# Check TypeScript version
npx tsc --version  # Should be 5.6.0 or higher

# Run type checking
npm run type-check

# If errors persist, try:
rm -rf packages/*/tsconfig.tsbuildinfo
npm run build
```

### 5. Missing Dependencies

**Issue**: Module not found errors

**Solution**: Ensure all dependencies are installed:
```bash
# Clean install all dependencies
npm install
npm install --workspaces

# If specific package missing
npm install [package-name] -w @asaps/[package]
```

### 6. ReactFlow Not Working

**Issue**: Graph editor not displaying or drag-and-drop not working

**Solution**: ReactFlow CSS must be imported:
```typescript
// In packages/builder/src/components/graph/GraphEditor.tsx
import 'reactflow/dist/style.css';
```

### 7. Build Errors

**Issue**: Build fails with various errors

**Solution**: Try a clean build:
```bash
# Remove all build artifacts
rm -rf packages/*/dist
rm -rf packages/*/node_modules
rm -rf node_modules

# Clean install and build
./clean-install.sh  # or clean-install.bat on Windows
```

### 8. Import/Export Not Working

**Issue**: Cannot import or export story files

**Solution**: Check browser permissions and file format:
- Ensure browser allows file access
- XML files must be valid ASML format
- Check console for specific error messages

### 9. Renderer Not Found

**Issue**: IRenderer interface or rendering functions not found

**Solution**: Ensure renderer package is built and exported correctly:
```bash
# Build renderer package
npm run build -w @asaps/renderer

# Check that dist folder exists
ls packages/renderer/dist/
```

### 10. Development Server Won't Start

**Issue**: `npm run dev` fails

**Solution**: Check for missing scripts or configurations:
```bash
# Verify package.json scripts
cat package.json | grep scripts -A 10

# Try running directly
npx vite --config packages/builder/vite.config.ts
```

## Quick Fixes

### Complete Reset
```bash
# Nuclear option - complete reset
git stash  # Save any changes
rm -rf node_modules packages/*/node_modules packages/*/dist
npm cache clean --force
./clean-install.sh
```

### Verify Installation
```bash
# Check all packages are built
ls -la packages/core/dist/
ls -la packages/renderer/dist/
ls -la packages/builder/dist/  # Only if built for production

# Check dependencies
npm ls
```

### Test Individual Packages
```bash
# Test core package
npm run test -w @asaps/core

# Test renderer package  
npm run test -w @asaps/renderer

# Test builder package
npm run test -w @asaps/builder
```

## Still Having Issues?

1. **Check Node/npm versions**:
   - Node.js: 18.0.0 or higher
   - npm: 7.0.0 or higher

2. **Review error messages carefully** - they often point to the exact issue

3. **Check the console** in browser DevTools for runtime errors

4. **Ensure file permissions** are correct (especially on Mac/Linux)

5. **Try a different browser** if having UI issues

## Contact for Help

If you're still experiencing issues:
1. Document the exact error message
2. Note what steps you took before the error
3. Check if the issue is reproducible
4. Review the project documentation
