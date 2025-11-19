#!/usr/bin/env python3
"""
RedStory DurScreen Converter - Updates durScreen format from old ASML to current standard

Converts OLD format:
  <function kind="durScreen">
    <text>Message</text>
    <duration>5000</duration>
    <target targetBeat="7"/>
  </function>

To NEW format:
  <function kind="durScreen" text="Message" duration="5000">
    <connection target="beat_7" />
  </function>
"""

import xml.etree.ElementTree as ET
import sys
from typing import Optional

class DurScreenConverter:
    def __init__(self, input_file: str):
        self.input_file = input_file
        self.tree = ET.parse(input_file)
        self.root = self.tree.getroot()
        self.stats = {'converted': 0, 'skipped': 0}

    def convert_durscreen(self, func_elem: ET.Element) -> bool:
        """Convert a single durScreen function element"""
        if func_elem.get('kind') != 'durScreen':
            return False

        # Get the text element
        text_elem = func_elem.find('text')
        if text_elem is None or text_elem.text is None:
            return False

        # Get the duration element
        duration_elem = func_elem.find('duration')
        if duration_elem is None or duration_elem.text is None:
            return False

        # Get the target element
        target_elem = func_elem.find('target')
        if target_elem is None:
            return False

        target_beat = target_elem.get('targetBeat')
        if not target_beat:
            return False

        # Convert targetBeat format (e.g., "7" -> "beat_7")
        connection_target = f"beat_{target_beat}"

        # Apply new format
        func_elem.set('text', text_elem.text)
        func_elem.set('duration', duration_elem.text)

        # Remove old child elements
        func_elem.remove(text_elem)
        func_elem.remove(duration_elem)
        func_elem.remove(target_elem)

        # Add connection element
        connection = ET.SubElement(func_elem, 'connection')
        connection.set('target', connection_target)

        self.stats['converted'] += 1
        return True

    def convert_all(self):
        """Convert all durScreen beats in the document"""
        for func_elem in self.root.findall('.//function[@kind="durScreen"]'):
            self.convert_durscreen(func_elem)

    def write_output(self, output_file: str):
        """Write the converted XML to file"""
        self.tree.write(output_file, encoding='unicode', xml_declaration=True)

def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <input_xml_file>")
        print(f"Example: {sys.argv[0]} Story_converted_final.xml")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = input_file.replace('.xml', '_durscreen.xml')

    try:
        converter = DurScreenConverter(input_file)
        converter.convert_all()
        converter.write_output(output_file)

        print(f"DurScreen conversion complete!")
        print(f"  Converted: {converter.stats['converted']} beats")
        print(f"  Output: {output_file}")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
