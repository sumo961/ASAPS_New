#!/usr/bin/env python3
"""
Remove all dialogTree beats from Story_converted_proper.xml
"""

import xml.etree.ElementTree as ET

# Input and output files
input_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted_proper.xml'
output_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_no_dialogtree.xml'

# Parse the XML
print(f"Reading {input_file}...")
tree = ET.parse(input_file)
root = tree.getroot()

# Find the plot element
plot = root.find('plot')
if plot is None:
    print("Error: No plot element found")
    exit(1)

# Collect beats to remove (those with function kind="dialogTree")
beats_to_remove = []
for beat in plot.findall('beat'):
    function_elem = beat.find("function[@kind='dialogTree']")
    if function_elem is not None:
        beat_id = beat.find('id')
        if beat_id is not None:
            beat_id_value = beat_id.get('id')
            beats_to_remove.append((beat, beat_id_value))

print(f"Found {len(beats_to_remove)} dialogTree beats to remove:")
for _, beat_id in beats_to_remove:
    print(f"  - Beat ID: {beat_id}")

# Remove the beats
for beat, beat_id in beats_to_remove:
    plot.remove(beat)
    print(f"Removed beat {beat_id}")

print(f"\nRemaining beats: {len(plot.findall('beat'))}")

# Pretty print
print("Formatting XML...")
def indent(elem, level=0):
    i = "\n" + level * "  "
    if len(elem):
        if not elem.text or not elem.text.strip():
            elem.text = i + "  "
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
        for elem in elem:
            indent(elem, level + 1)
        if not elem.tail or not elem.tail.strip():
            elem.tail = i
    else:
        if level and (not elem.tail or not elem.tail.strip()):
            elem.tail = i

indent(root)

# Write the output
print(f"Writing {output_file}...")
new_tree = ET.ElementTree(root)
new_tree.write(output_file, encoding='utf-8', xml_declaration=True)

print("Done!")
