#!/bin/bash

echo "🎉 ASPS Modern - Final Setup and Launch"
echo "========================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Make all scripts executable
echo -e "${BLUE}Making all scripts executable...${NC}"
chmod +x apply-all-fixes.sh 2>/dev/null
chmod +x fix-visual-editor-issues.sh 2>/dev/null
chmod +x complete-visual-editor-fixes.sh 2>/dev/null
chmod +x add-sound-support.sh 2>/dev/null

# Run the complete fix application
echo -e "${BLUE}Applying all fixes...${NC}"
if [ -f "apply-all-fixes.sh" ]; then
    ./apply-all-fixes.sh
else
    echo -e "${YELLOW}Warning: apply-all-fixes.sh not found${NC}"
    echo "Running manual build instead..."
    npm install
    npm run build
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✨ ASPS Modern is ready to launch!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Display feature summary
echo -e "${BLUE}Features ready to use:${NC}"
echo "✅ Full-size visual editor with adaptive stage"
echo "✅ Complete asset management system"
echo "✅ Sound support for all elements"
echo "✅ All beat types with visual editing"
echo "✅ ASML import/export"
echo "✅ Professional UI with keyboard shortcuts"
echo ""

# Launch options
echo -e "${BLUE}Launch Options:${NC}"
echo "1) Start development server (recommended)"
echo "2) Build for production"
echo "3) View documentation"
echo "4) Exit"
echo ""
read -p "Select option (1-4): " choice

case $choice in
    1)
        echo -e "${GREEN}Starting development server...${NC}"
        echo "Opening http://localhost:5173 in your browser..."
        # Try to open browser based on OS
        if [[ "$OSTYPE" == "darwin"* ]]; then
            # macOS
            (sleep 3 && open http://localhost:5173) &
        elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
            # Linux
            (sleep 3 && xdg-open http://localhost:5173) &
        elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
            # Windows
            (sleep 3 && start http://localhost:5173) &
        fi
        npm run dev
        ;;
    2)
        echo -e "${GREEN}Building for production...${NC}"
        npm run build
        echo ""
        echo -e "${GREEN}Production build complete!${NC}"
        echo "To preview: npm run preview"
        echo "To deploy: See CURRENT_STATUS.md for deployment options"
        ;;
    3)
        echo -e "${BLUE}Available Documentation:${NC}"
        echo "1. CURRENT_STATUS.md - Project status and overview"
        echo "2. FEATURES_IMPLEMENTED.md - Complete feature list"
        echo "3. TEST_CHECKLIST.md - Testing guide"
        echo "4. Issues.md - Issue tracking"
        echo "5. ISSUE_RESOLUTION_SUMMARY.md - Recent fixes"
        echo ""
        read -p "Which document to open? (1-5): " doc
        case $doc in
            1) cat CURRENT_STATUS.md | less ;;
            2) cat FEATURES_IMPLEMENTED.md | less ;;
            3) cat TEST_CHECKLIST.md | less ;;
            4) cat Issues.md | less ;;
            5) cat ISSUE_RESOLUTION_SUMMARY.md | less ;;
            *) echo "Invalid selection" ;;
        esac
        ;;
    4)
        echo -e "${GREEN}Thank you for using ASPS Modern!${NC}"
        exit 0
        ;;
    *)
        echo "Invalid selection"
        ;;
esac
