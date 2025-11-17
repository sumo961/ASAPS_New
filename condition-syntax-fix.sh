#!/bin/bash

echo "🔧 ASML Condition Syntax - Complete Fix Applied!"
echo "================================================"
echo ""

echo "✅ CORRECTED CONDITION SYNTAX:"
echo ""

echo "1. Counter Conditions:"
echo '   <condition type="counter" operator=">=" counter="courage" val="60" />'
echo '   <condition type="counter" operator="<" counter="health" val="25" />'
echo ""

echo "2. Variable Conditions:"  
echo '   <condition type="variable" name="WolfMet" val="true" />'
echo '   <condition type="variable" name="playerChoice" val="sword" />'
echo ""

echo "3. Inventory Conditions:"
echo '   <condition type="inventory" operator="contains" character="Queen" val="key" />'
echo '   <condition type="inventory" operator="contains" character="Hero" val="map" />'
echo ""

echo "4. Counter Compare Conditions:"
echo '   <condition type="counterCompare" counter1="strength" operator="<" counter2="magic" />'
echo '   <condition type="counterCompare" counter1="health" operator=">=" counter2="minHealth" />'
echo ""

echo "📋 ATTRIBUTE MAPPING SUMMARY:"
echo ""
echo "| Condition Type  | Primary Attr | Value Attr | Example                           |"
echo "|-----------------|--------------|------------|-----------------------------------|"
echo "| counter         | counter=     | val=       | counter=\"health\" val=\"50\"        |"
echo "| variable        | name=        | val=       | name=\"hasKey\" val=\"true\"         |"
echo "| inventory       | character=   | val=       | character=\"Hero\" val=\"sword\"     |"
echo "| counterCompare  | counter1=    | counter2=  | counter1=\"str\" counter2=\"dex\"   |"
echo ""

echo "🔧 FILES UPDATED:"
echo "• ASMLParser.ts - Parse all condition types with correct attributes"
echo "• ASMLGenerator.ts - Export all condition types with correct attributes"
echo "• types/index.ts - Updated Condition interface for counterCompare"
echo ""

echo "🧪 TESTING:"
echo ""
echo "1. Import a story with condition beats"
echo "2. Export the story"  
echo "3. Check exported XML uses correct syntax:"
echo "   - counter conditions use 'counter=' and 'val='"
echo "   - variable conditions use 'name=' and 'val='"
echo "   - inventory conditions use 'character=' and 'val='"
echo "   - counterCompare conditions use 'counter1=' and 'counter2='"
echo ""

echo "✅ All ASML condition syntax issues are now resolved!"
echo ""
echo "The system now properly handles all four condition types:"
echo "✓ counter (compares counter to value)"
echo "✓ variable (compares variable to value)" 
echo "✓ inventory (checks if character has item)"
echo "✓ counterCompare (compares two counters)"

