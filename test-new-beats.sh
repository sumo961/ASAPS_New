#!/bin/bash

# Test script for new beat types
echo "========================================="
echo "Testing New Beat Types Implementation"
echo "========================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Navigate to project directory
cd "$(dirname "$0")"

echo "1. Building the project..."
npm run build > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Build successful${NC}"
else
    echo -e "${RED}✗ Build failed${NC}"
    exit 1
fi

echo ""
echo "2. Testing beat type registration..."

# Create a simple test file
cat > test-new-beats.js << 'EOF'
const { BeatTypeRegistry } = require('./packages/core/dist');

const registry = BeatTypeRegistry.getInstance();

// Test that new beat types are registered
const newBeats = ['randomTarget', 'setTimer', 'addRemoveInventory'];
const obsoleteBeats = ['setCounter'];

console.log('Checking new beat types:');
let allGood = true;

newBeats.forEach(beatType => {
    if (registry.hasBeatType(beatType)) {
        console.log(`  ✓ ${beatType} is registered`);
    } else {
        console.log(`  ✗ ${beatType} is NOT registered`);
        allGood = false;
    }
});

console.log('\nChecking obsolete beat types:');
obsoleteBeats.forEach(beatType => {
    if (!registry.hasBeatType(beatType)) {
        console.log(`  ✓ ${beatType} is correctly NOT registered`);
    } else {
        console.log(`  ✗ ${beatType} is still registered (should be removed)`);
        allGood = false;
    }
});

// Test creating instances
console.log('\nTesting beat creation:');
try {
    const randomBeat = registry.createBeat('randomTarget', {
        id: 'test1',
        name: 'Test Random',
        type: 'randomTarget',
        parameters: {
            choices: [
                { id: '1', target: 'beat_1' },
                { id: '2', target: 'beat_2' }
            ]
        }
    });
    console.log('  ✓ RandomTargetBeat created successfully');
    
    const timerBeat = registry.createBeat('setTimer', {
        id: 'test2',
        name: 'Test Timer',
        type: 'setTimer',
        parameters: {
            name: 'countdown',
            value: 60,
            timerTarget: 'timeout_beat'
        }
    });
    console.log('  ✓ SetTimerBeat created successfully');
    
    const inventoryBeat = registry.createBeat('addRemoveInventory', {
        id: 'test3',
        name: 'Test Inventory',
        type: 'addRemoveInventory',
        parameters: {
            action: 'add',
            item: 'Magic Sword',
            character: 'player'
        }
    });
    console.log('  ✓ AddRemoveInventoryBeat created successfully');
    
    // Test setVariable with counter type
    const counterBeat = registry.createBeat('setVariable', {
        id: 'test4',
        name: 'Test Counter',
        type: 'setVariable',
        parameters: {
            type: 'counter',
            name: 'health',
            value: 100,
            operation: 'set'
        }
    });
    const params = counterBeat.getParameters();
    if (params.type === 'counter' && params.name === 'health' && params.value === 100) {
        console.log('  ✓ SetVariableBeat handles counter type correctly');
    } else {
        console.log('  ✗ SetVariableBeat counter parameters incorrect');
        allGood = false;
    }
    
} catch (error) {
    console.log('  ✗ Error creating beats:', error.message);
    allGood = false;
}

process.exit(allGood ? 0 : 1);
EOF

echo "Running tests..."
node test-new-beats.js

if [ $? -eq 0 ]; then
    echo -e "\n${GREEN}=========================================${NC}"
    echo -e "${GREEN}All tests passed! 🎉${NC}"
    echo -e "${GREEN}=========================================${NC}"
else
    echo -e "\n${RED}=========================================${NC}"
    echo -e "${RED}Some tests failed. Please check the output above.${NC}"
    echo -e "${RED}=========================================${NC}"
fi

# Clean up test file
rm -f test-new-beats.js

echo ""
echo "3. Summary of changes:"
echo "   - Created RandomTargetBeat class"
echo "   - Created SetTimerBeat class"
echo "   - Created AddRemoveInventoryBeat class"
echo "   - Updated SetVariableBeat to handle type parameter"
echo "   - Registered all new beat types in BeatRegistry"
echo "   - Removed SetCounter (obsolete)"
echo "   - Fixed Inspector UI for counterCompare and timer conditions"
echo ""
echo "You can now:"
echo "  1. Run 'npm run dev' to test in the builder"
echo "  2. Create beats of types: randomTarget, setTimer, addRemoveInventory"
echo "  3. Use setVariable with type='counter' instead of old SetCounter"
echo "  4. All values will be properly preserved in the Inspector"
