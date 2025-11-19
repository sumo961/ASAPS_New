#!/usr/bin/env python3
"""
Convert legacy conditionCheck format to modern conditionBeat format

Old format:
  <function kind="conditionCheck">
    <method val="inventory" />
    <cond char="Red" val="knife" YesTargetBeat="210" NoTargetBeat="101" />
  </function>

New format:
  <function kind="conditionBeat">
    <condition type="inventory" name="knife" operator="has" />
    <trueTarget targetBeat="210" />
    <falseTarget targetBeat="101" />
  </function>

Old format (global):
  <method val="global" />
  <cond name="AxeFound" val="true" YesTargetBeat="103" NoTargetBeat="102" />

New format (global):
  <condition type="variable" name="AxeFound" operator="==" right="true" />
  <trueTarget targetBeat="103" />
  <falseTarget targetBeat="102" />
"""

import xml.etree.ElementTree as ET
import sys

def convert_conditions(input_file: str, output_file: str):
    """Convert legacy conditionCheck format to conditionBeat"""
    tree = ET.parse(input_file)
    root = tree.getroot()

    for beat in root.findall('.//beat'):
        func = beat.find('function')
        if func is None or func.get('kind') != 'conditionCheck':
            continue

        # Update function kind
        func.set('kind', 'conditionBeat')

        # Find method and cond elements
        method = func.find('method')
        cond = func.find('cond')

        if method is None or cond is None:
            print(f"Warning: Skipping beat {beat.find('id').get('id')}, missing method or cond")
            continue

        method_val = method.get('val', '')
        # Remove old elements
        func.remove(method)
        func.remove(cond)

        # Create condition element
        condition = ET.SubElement(func, 'condition')

        if method_val == 'inventory':
            # Inventory check: char and val attributes
            char = cond.get('char', 'Red')
            item = cond.get('val', '')
            condition.set('type', 'inventory')
            condition.set('name', item)
            condition.set('operator', 'has')
        elif method_val == 'global':
            # Global variable check: name and val
            var_name = cond.get('name', '')
            var_val = cond.get('val', '')
            condition.set('type', 'variable')
            condition.set('name', var_name)
            condition.set('operator', '==')
            condition.set('right', var_val)
        elif method_val in ['sequence', 'visited']:
            # For sequence/visited, convert to visitedBeat condition
            condition.set('type', 'visitedBeat')
            condition.set('name', cond.get('val', ''))
        else:
            print(f"Warning: Unknown method val '{method_val}' in beat {beat.find('id').get('id')}")
            continue

        # Add true/false targets
        yes_target = cond.get('YesTargetBeat')
        no_target = cond.get('NoTargetBeat')

        if yes_target:
            true_elem = ET.SubElement(func, 'trueTarget')
            true_elem.set('targetBeat', yes_target)

        if no_target:
            false_elem = ET.SubElement(func, 'falseTarget')
            false_elem.set('targetBeat', no_target)

    # Pretty print
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

    tree.write(output_file, encoding='utf-8', xml_declaration=True)
    print(f"Condition conversion complete! Output: {output_file}")

def main():
    input_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted_v2.xml'
    output_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted_final.xml'

    convert_conditions(input_file, output_file)
    return 0

if __name__ == '__main__':
    sys.exit(main())
