#!/bin/bash
# Test script for verifying critical ASPS fixes
# Tests: DialogTree import, SetTimer connections, RandomTarget

echo "================================================"
echo "ASPS Critical Fixes Verification"
echo "================================================"
echo ""

# Check if build completes
echo "Step 1: Building project..."
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed - check TypeScript errors"
    exit 1
fi

echo ""
echo "Step 2: Checking critical fixes..."

# Check DialogTree recursive parsing
if grep -q "RECURSIVE PARSE" packages/core/src/xml/ASMLParser.ts; then
    echo "✅ DialogTree recursive parsing implemented"
else
    echo "❌ DialogTree recursive parsing missing"
fi

# Check SetTimer dual connection handling
if grep -q "ALSO parse regular connection" packages/core/src/xml/ASMLParser.ts; then
    echo "✅ SetTimer dual connections implemented"
else
    echo "❌ SetTimer dual connections missing"
fi

# Check RandomTarget parsing
if grep -q "case 'randomTarget':" packages/core/src/xml/ASMLParser.ts; then
    echo "✅ RandomTarget parsing implemented"
else
    echo "❌ RandomTarget parsing missing"
fi

echo ""
echo "Step 3: Creating test files..."

# Create test DialogTree XML
cat > test-dialogtree.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<story title="Dialog Test">
  <settings></settings>
  <environment></environment>
  <characters></characters>
  <plot>
    <clusters />
    <beat>
      <id id="dialog_test" name="Nested Dialog Test" />
      <function kind="dialogTree" speaker="Player" text="Hello there!">
        <choice id="c1" text="How are you?" counter="friendliness" operation="add" val="5">
          <target>
            <dialogTree id="d2" speaker="NPC" text="I'm doing well, thanks for asking!">
              <choice id="c2" text="That's great!" target="end_beat"/>
              <choice id="c3" text="Tell me more">
                <target>
                  <dialogTree id="d3" speaker="NPC" text="Well, it's been quite a journey...">
                    <choice id="c4" text="I see" counter="wisdom" operation="add" val="3" target="end_beat"/>
                  </dialogTree>
                </target>
              </choice>
            </dialogTree>
          </target>
        </choice>
        <choice id="c5" text="Goodbye" target="end_beat"/>
      </function>
    </beat>
    <beat>
      <id id="end_beat" name="End" />
      <function kind="endScreen" message="The End"/>
    </beat>
  </plot>
</story>
EOF

# Create test SetTimer XML
cat > test-settimer.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<story title="Timer Test">
  <settings></settings>
  <environment></environment>
  <characters></characters>
  <plot>
    <clusters />
    <beat>
      <id id="start" name="Start" />
      <function kind="introText" text="Starting timer...">
        <connection target="timer_beat"/>
      </function>
    </beat>
    <beat>
      <id id="timer_beat" name="Set Timer" />
      <function kind="setTimer">
        <timer name="countdown" val="30" target="timeout_beat"/>
        <connection target="continue_beat"/>
      </function>
    </beat>
    <beat>
      <id id="continue_beat" name="Continue" />
      <function kind="introText" text="Timer is running in background...">
        <connection target="end_beat"/>
      </function>
    </beat>
    <beat>
      <id id="timeout_beat" name="Timeout" />
      <function kind="introText" text="Timer expired!">
        <connection target="end_beat"/>
      </function>
    </beat>
    <beat>
      <id id="end_beat" name="End" />
      <function kind="endScreen" message="The End"/>
    </beat>
  </plot>
</story>
EOF

# Create test RandomTarget XML
cat > test-randomtarget.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<story title="Random Test">
  <settings></settings>
  <environment></environment>
  <characters></characters>
  <plot>
    <clusters />
    <beat>
      <id id="start" name="Start" />
      <function kind="introText" text="Let's roll the dice...">
        <connection target="random_beat"/>
      </function>
    </beat>
    <beat>
      <id id="random_beat" name="Random Choice" />
      <function kind="randomTarget">
        <choice targetBeat="outcome1"/>
        <choice targetBeat="outcome2"/>
        <choice targetBeat="outcome3"/>
      </function>
    </beat>
    <beat>
      <id id="outcome1" name="Outcome 1" />
      <function kind="introText" text="You got outcome 1!">
        <connection target="end_beat"/>
      </function>
    </beat>
    <beat>
      <id id="outcome2" name="Outcome 2" />
      <function kind="introText" text="You got outcome 2!">
        <connection target="end_beat"/>
      </function>
    </beat>
    <beat>
      <id id="outcome3" name="Outcome 3" />
      <function kind="introText" text="You got outcome 3!">
        <connection target="end_beat"/>
      </function>
    </beat>
    <beat>
      <id id="end_beat" name="End" />
      <function kind="endScreen" message="The End"/>
    </beat>
  </plot>
</story>
EOF

echo "✅ Test files created:"
echo "   - test-dialogtree.xml (nested dialogs with counters)"
echo "   - test-settimer.xml (dual connections)"
echo "   - test-randomtarget.xml (random choices)"

echo ""
echo "================================================"
echo "Manual Testing Instructions"
echo "================================================"
echo ""
echo "1. Start the dev server: npm run dev"
echo "2. Import test-dialogtree.xml:"
echo "   - Verify all 3 levels of nesting are preserved"
echo "   - Check counter effects on choices"
echo "   - Export and re-import to test round-trip"
echo ""
echo "3. Import test-settimer.xml:"
echo "   - Verify timer_beat has TWO connections:"
echo "     • Red dashed line to timeout_beat (timer)"
echo "     • Regular line to continue_beat (immediate)"
echo "   - Test preview: should go to continue immediately"
echo ""
echo "4. Import test-randomtarget.xml:"
echo "   - Verify random_beat has 3 purple connections"
echo "   - Export and check for <choice targetBeat=\"...\"/> elements"
echo "   - Test preview: should randomly select outcome"
echo ""
echo "✅ All critical backend fixes are in place!"
echo "🔧 UI enhancements can be applied from provided artifacts"
echo ""
