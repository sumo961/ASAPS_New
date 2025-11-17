#!/bin/bash

# ASPS Connection Management Fix Script
# This fixes the connection replacement bug where old connections aren't removed

echo "================================================"
echo "  ASPS Connection Management Fix"
echo "================================================"
echo ""

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print status
print_status() {
    echo -e "${YELLOW}[*]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Create backup directory with timestamp
BACKUP_DIR="$SCRIPT_DIR/backups/connection-fix-$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"
print_success "Created backup directory: $BACKUP_DIR"

# ============================================
# STEP 1: Backup existing files
# ============================================
print_status "Backing up existing files..."

# Backup Beat.ts
if [ -f "$SCRIPT_DIR/packages/core/src/beats/Beat.ts" ]; then
    cp "$SCRIPT_DIR/packages/core/src/beats/Beat.ts" "$BACKUP_DIR/Beat.ts.backup"
    print_success "Backed up Beat.ts"
fi

# Backup Inspector.tsx  
if [ -f "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx" ]; then
    cp "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx" "$BACKUP_DIR/Inspector.tsx.backup"
    print_success "Backed up Inspector.tsx"
fi

echo ""

# ============================================
# STEP 2: Fix Beat.ts
# ============================================
print_status "Fixing Beat class with connection management methods..."

# Check if the fix file exists
if [ -f "$SCRIPT_DIR/fix-beat-class.ts" ]; then
    cp "$SCRIPT_DIR/fix-beat-class.ts" "$SCRIPT_DIR/packages/core/src/beats/Beat.ts"
    print_success "Applied Beat.ts fixes"
else
    print_error "fix-beat-class.ts not found, applying inline fix..."
    
    # Apply inline fix by adding methods to Beat class
    cat > "$SCRIPT_DIR/packages/core/src/beats/Beat.ts.tmp" << 'EOF'
import type { 
  BeatConfig, 
  Connection, 
  Location, 
  Transition, 
  Sound,  
} from '../types';
import type { IRenderer } from '@asaps/renderer';

import { StoryContext } from '../engine/StoryContext';

export abstract class Beat {
  public id: string;
  public name: string;
  public type: string;
  public cluster?: string;
  public transition?: Transition;
  public sound?: Sound;
  public locations: Map<string, Location> = new Map();
  public connections: Connection[] = [];
  public defaultTarget?: string;
  public x?: number;
  public y?: number;

  constructor(config: BeatConfig) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type;
    this.cluster = config.cluster;
    this.transition = config.transition;
    this.sound = config.sound;
    this.defaultTarget = config.defaultTarget;
    
    if (config.locations) {
      config.locations.forEach(loc => {
        this.locations.set(loc.name, loc);
      });
    }
  }

  // Abstract methods that concrete beat classes must implement
  abstract getParameters(): Record<string, any>;
  abstract updateParameters(params: Record<string, any>): void;

  async execute(context: StoryContext, renderer: IRenderer): Promise<string | null> {
    try {
      await this.onEnter(context, renderer);
      
      if (this.transition) {
        await renderer.applyTransition(this.transition);
      }
      
      if (this.sound) {
        await renderer.playSound(this.sound);
      }
      
      const nextBeatId = await this.performAction(context, renderer);
      
      await this.onExit(context, renderer);
      
      context.markBeatVisited(this.id);
      
      return nextBeatId;
    } catch (error) {
      console.error(`Error executing beat ${this.id}:`, error);
      throw error;
    }
  }

  protected abstract performAction(
    context: StoryContext, 
    renderer: IRenderer
  ): Promise<string | null>;

  protected async onEnter(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Entering beat: ${this.name} (${this.id})`);
  }

  protected async onExit(context: StoryContext, renderer: IRenderer): Promise<void> {
    console.log(`Exiting beat: ${this.name} (${this.id})`);
  }

  // ============= CONNECTION MANAGEMENT METHODS =============
  
  /**
   * Add a new connection
   */
  addConnection(connection: Connection): void {
    // Avoid duplicates
    if (!this.hasConnection(connection.targetId, connection.label)) {
      this.connections.push(connection);
    }
  }

  /**
   * Clear all connections
   */
  clearConnections(): void {
    this.connections = [];
  }

  /**
   * Remove a specific connection
   */
  removeConnection(targetId: string, label?: string): void {
    this.connections = this.connections.filter(c => 
      !(c.targetId === targetId && (!label || c.label === label))
    );
  }

  /**
   * Replace all connections with new ones
   */
  replaceConnections(newConnections: Connection[]): void {
    this.connections = [...newConnections];
  }

  /**
   * Check if a connection exists
   */
  hasConnection(targetId: string, label?: string): boolean {
    return this.connections.some(c => 
      c.targetId === targetId && (!label || c.label === label)
    );
  }

  /**
   * Get a copy of connections (safe for reading)
   */
  getConnections(): Connection[] {
    return [...this.connections];
  }

  /**
   * Get direct access to connections array (for editing)
   * Use with caution - prefer the specific methods above
   */
  getConnectionsForEdit(): Connection[] {
    return this.connections;
  }

  // =========================================================

  getNextBeat(context: StoryContext): string | null {
    for (const connection of this.connections) {
      if (connection.condition && context.checkCondition(connection.condition)) {
        return connection.targetId;
      }
    }
    
    if (this.defaultTarget) {
      return this.defaultTarget;
    }
    
    const unconditional = this.connections.find(c => !c.condition);
    return unconditional?.targetId || null;
  }

  // Updated toJSON method that includes parameters
  toJSON(): any {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      cluster: this.cluster,
      transition: this.transition,
      sound: this.sound,
      locations: Array.from(this.locations.values()),
      connections: this.connections,
      defaultTarget: this.defaultTarget,
      x: this.x,
      y: this.y,
      parameters: this.getParameters() // Now includes beat-specific parameters
    };
  }
}
EOF
    
    mv "$SCRIPT_DIR/packages/core/src/beats/Beat.ts.tmp" "$SCRIPT_DIR/packages/core/src/beats/Beat.ts"
    print_success "Applied inline Beat.ts fixes"
fi

echo ""

# ============================================
# STEP 3: Fix Inspector handleSave
# ============================================
print_status "Fixing Inspector handleSave method..."

# Update the Inspector to use the new clearConnections method
sed -i.bak '
/const connections = beat.getConnections();/,/connections.length = 0;/ {
    s/const connections = beat.getConnections();/\/\/ Fixed: Use proper connection clearing method/
    s/connections.length = 0;/if (beat.clearConnections) { beat.clearConnections(); } else { beat.connections = []; }/
}' "$SCRIPT_DIR/packages/builder/src/components/Inspector.tsx"

if [ $? -eq 0 ]; then
    print_success "Fixed Inspector connection clearing"
else
    print_error "Failed to fix Inspector - may need manual edit"
fi

echo ""

# ============================================
# STEP 4: Check for duration multiplication issue
# ============================================
print_status "Checking for duration multiplication issue in ASMLGenerator..."

if [ -f "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts" ]; then
    if grep -q "duration.*\* *1000" "$SCRIPT_DIR/packages/core/src/xml/ASMLGenerator.ts"; then
        print_error "Found duration multiplication by 1000 - needs fixing!"
        echo "   Look for: duration: transition.duration * 1000"
        echo "   Replace with: duration: transition.duration"
    else
        print_success "No duration multiplication issue found (may already be fixed)"
    fi
else
    print_error "ASMLGenerator.ts not found"
fi

echo ""

# ============================================
# STEP 5: Build the project
# ============================================
print_status "Building the project..."
cd "$SCRIPT_DIR"

# Try npm build first
if command -v npm &> /dev/null; then
    npm run build
    if [ $? -eq 0 ]; then
        print_success "Build completed successfully"
    else
        print_error "Build failed - check error messages above"
    fi
else
    print_error "npm not found - please build manually"
fi

echo ""

# ============================================
# Summary
# ============================================
echo "================================================"
echo -e "${GREEN}  Connection Management Fixes Applied${NC}"
echo "================================================"
echo ""
echo "✅ What was fixed:"
echo "  • Added connection management methods to Beat class"
echo "  • Fixed Inspector to properly clear connections"
echo "  • Connections should now replace correctly"
echo ""
echo "⚠️  Still needs manual fixes:"
echo "  • Duration multiplication by 1000 in ASMLGenerator"
echo "  • Missing characters/settings/environment in export"
echo ""
echo "📋 Test the fixes:"
echo "  1. Start dev server: npm run dev"
echo "  2. Select a beat and change its connection"
echo "  3. Save and verify old connection is gone"
echo "  4. Check flowchart shows only new connection"
echo "  5. Export and verify connection is saved correctly"
echo ""
echo "💾 Backups saved to: $BACKUP_DIR"
echo ""
echo "If issues persist, restore from backup:"
echo "  cp $BACKUP_DIR/*.backup <original-paths>"
