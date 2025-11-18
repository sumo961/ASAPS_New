#!/usr/bin/env python3
"""
RedStory Asset Converter - Updates asset format from old ASML to current standard

Converts:
- fPath -> file
- Adds descriptions for props
- Updates character appearance format
"""

import xml.etree.ElementTree as ET
import sys

def convert_assets(input_file: str, output_file: str):
    """Convert asset formats in XML file"""
    tree = ET.parse(input_file)
    root = tree.getroot()

    # Convert environment section
    env = root.find('environment')
    if env is not None:
        # Convert props (fPath -> file, add descriptions)
        for prop in env.findall('prop'):
            fpath = prop.get('fPath')
            if fpath:
                prop.set('file', fpath)
                prop.attrib.pop('fPath', None)

            # Add descriptions based on prop names
            name = prop.get('name', '')
            if name == 'sweets':
                prop.text = 'Some pinata candy'
            elif name == 'book':
                prop.text = "An illustrated version of Lady Chatterley's Lover"
            elif name == 'gift':
                prop.text = "A mysterious present"
            elif name == 'axe':
                prop.text = 'A sharp woodcutting axe'
            elif name == 'knife':
                prop.text = 'A sharp knife'

        # Convert nodes (fPath -> file)
        for node in env.findall('node'):
            fpath = node.get('fPath')
            if fpath:
                node.set('file', fpath)
                node.attrib.pop('fPath', None)

        # Convert sounds (fPath -> file)
        for sound in env.findall('sound'):
            fpath = sound.get('fPath')
            if fpath:
                sound.set('file', fpath)
                sound.attrib.pop('fPath', None)

    # Convert characters section
    chars_section = root.find('characters')
    if chars_section is not None:
        for char in chars_section.findall('character'):
            # Convert appearance elements if present
            for appearance in char.findall('appearance'):
                fpath = appearance.get('file')
                if fpath and 'fPath' in appearance.attrib:
                    appearance.set('file', fpath)
                    appearance.attrib.pop('fPath', None)

    # Pretty print with indentation
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

    # Write output
    tree.write(output_file, encoding='utf-8', xml_declaration=True)
    print(f"Asset conversion complete! Output: {output_file}")

def main():
    input_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted.xml'
    output_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted_v2.xml'

    convert_assets(input_file, output_file)
    return 0

if __name__ == '__main__':
    sys.exit(main())
