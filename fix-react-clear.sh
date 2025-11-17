#!/bin/bash

# Fix ReactRenderer clear() method to properly unmount React content

FILE="/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/packages/renderer/src/renderers/ReactRenderer.tsx"

echo "Fixing ReactRenderer clear() method..."

# Find and replace the clear() method
sed -i'.backup2' '
/^  clear(): void {$/,/^  }$/ {
  /^  clear(): void {$/ {
    N
    N
    N
    N
    s/.*/  clear(): void {\
    \/\/ FIXED: Don'\''t call super.clear() as it removes DOM that React is managing\
    \/\/ Instead, render empty content and stop sounds manually\
    if (this.root) {\
      this.root.render(<><\/>);\
    }\
    \
    \/\/ Stop all sounds (copied from BaseRenderer)\
    this.assetCache.sounds.forEach((audio: HTMLAudioElement) => {\
      try {\
        audio.pause();\
        audio.currentTime = 0;\
      } catch (err) {\
        \/\/ Ignore errors\
      }\
    });\
  }/
  }
}' "$FILE"

echo "✓ Fixed ReactRenderer.clear() method"
echo ""
echo "The clear() method now:"
echo "  1. Renders empty React fragment (proper unmount)"
echo "  2. Stops audio manually"
echo "  3. Does NOT call super.clear() (which was removing React's DOM)"
echo ""
echo "Rebuild the renderer package:"
echo "  cd packages/renderer && npm run build"
