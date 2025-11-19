#!/usr/bin/env python3
"""
PROPER RedStory XML Converter - Correctly nests conversation chains in DialogTree format

This script:
1. Parses the old Story.xml format with conversationChoice beats
2. Builds conversation chains by following targetBeat references
3. Converts to PROPERLY NESTED dialogTree structure with <target><dialogTree>...</dialogTree></target>
4. Preserves all logic: counters, variables, conditions, and branching

Key difference from previous version: Properly nests dialog trees instead of keeping flat beats
"""

import xml.etree.ElementTree as ET
import sys
from typing import Dict, List, Optional, Any

class XMLConverter:
    def __init__(self, input_file: str):
        self.input_file = input_file
        self.tree = ET.parse(input_file)
        self.root = self.tree.getroot()
        self.beats_by_id: Dict[str, ET.Element] = {}
        self.conversation_chains: Dict[str, List[str]] = {}

    def index_beats(self):
        """Index all beats by ID for quick lookup"""
        for beat in self.root.findall('.//beat'):
            beat_id_elem = beat.find('id')
            if beat_id_elem is not None:
                self.beats_by_id[beat_id_elem.get('id')] = beat

    def parse_conversation_choice(self, beat: ET.Element) -> Optional[Dict[str, Any]]:
        """Parse a conversationChoice beat from old format"""
        func = beat.find('function')
        if func is None or func.get('kind') != 'conversationChoice':
            return None

        beat_id_elem = beat.find('id')
        if beat_id_elem is None:
            return None

        # Get the question text and questioner
        question_elem = func.find('question')
        questioner_elem = func.find('questioner')
        node_elem = beat.find('node')

        choices = []
        for choice in func.findall('choice'):
            choice_dict = {
                'id': choice.get('id'),
                'content': choice.get('content'),
                'counter': choice.get('counter'),
                'buttonsound': choice.get('buttonsound'),
                'targetBeat': choice.get('targetBeat'),
                'loc': choice.get('loc')
            }
            choices.append(choice_dict)

        return {
            'beat_id': beat_id_elem.get('id'),
            'name': beat_id_elem.get('name', ''),
            'cluster': beat_id_elem.get('cluster', ''),
            'questioner': questioner_elem.text if questioner_elem is not None else '1',
            'question': question_elem.text if question_elem is not None else '',
            'node': node_elem.text if node_elem is not None else None,
            'choices': choices
        }

    def build_conversation_chains(self):
        """Identify chains of conversationChoice beats"""
        self.index_beats()

        # Find all conversation choice beats
        for beat in self.root.findall('.//beat'):
            conv = self.parse_conversation_choice(beat)
            if conv:
                # Follow the chain
                chain = [conv['beat_id']]
                self._follow_chain(conv, chain)
                if len(chain) > 1:
                    self.conversation_chains[conv['beat_id']] = chain

    def _follow_chain(self, conv: Dict[str, Any], chain: List[str]):
        """Recursively follow conversation chains"""
        for choice in conv['choices']:
            target_id = choice.get('targetBeat')
            if target_id and target_id in self.beats_by_id:
                target_beat = self.beats_by_id[target_id]
                target_conv = self.parse_conversation_choice(target_beat)
                if target_conv and target_id not in chain:
                    chain.append(target_id)
                    self._follow_chain(target_conv, chain)

    def convert_counter_to_effects(self, counter_str: str) -> List[Dict[str, Any]]:
        """Convert old counter format 'counterName,val' to effects"""
        if not counter_str or counter_str == 'undefined,00':
            return []

        effects = []
        parts = counter_str.split(',')
        if len(parts) == 2:
            name, val = parts
            if name != 'undefined':
                effects.append({
                    'type': 'counter',
                    'operation': 'change',
                    'name': name,
                    'value': int(val)
                })
        return effects

    def convert_buttonsound_to_effects(self, sound_name: str) -> List[Dict[str, Any]]:
        """Convert buttonsound to effects"""
        if not sound_name or sound_name == 'undefined':
            return []

        return [{
            'type': 'playsound',
            'name': sound_name
        }]

    def get_character_name(self, questioner_id: str) -> str:
        """Map questioner ID to character name"""
        char_map = {
            '1': 'Mom',
            'WOLF': 'Wolf',
            'GRAN': 'Gran',
            'WOODSMAN': 'Woodsman'
        }
        return char_map.get(questioner_id, 'Red')

    def build_nested_dialog_tree(self, beat_id: str, visited: List[str]) -> ET.Element:
        """Build a properly nested dialog tree from a conversation chain"""
        if beat_id in visited:
            return None

        visited.append(beat_id)

        beat = self.beats_by_id.get(beat_id)
        if not beat:
            return None

        conv = self.parse_conversation_choice(beat)
        if not conv:
            return None

        # Create the dialogTree element (for NESTED use only - inside <target>)
        dialog_tree = ET.Element('dialogTree', {
            'id': f"node_{beat_id}",
            'speaker': self.get_character_name(conv['questioner']),
            'text': conv['question']
        })

        if conv['node']:
            dialog_tree.set('node', conv['node'])

        # Add choices with counter attributes directly on choice element
        for choice in conv['choices']:
            choice_elem = ET.SubElement(dialog_tree, 'choice')
            choice_elem.set('id', choice['id'])
            choice_elem.set('text', choice['content'])

            # Add counter attributes directly to choice element
            if choice.get('counter'):
                counter_str = choice['counter']
                if counter_str and counter_str != 'undefined,00':
                    parts = counter_str.split(',')
                    if len(parts) == 2 and parts[0] != 'undefined':
                        choice_elem.set('counter', parts[0])
                        choice_elem.set('operation', 'change')
                        choice_elem.set('val', parts[1])

            # Add sound effects
            if choice.get('buttonsound') and choice['buttonsound'] != 'undefined':
                effect_elem = ET.SubElement(choice_elem, 'effect')
                effect_elem.set('type', 'playsound')
                effect_elem.set('name', choice['buttonsound'])

            # Handle target - check if it leads to another conversation
            target_id = choice.get('targetBeat')
            if target_id and target_id in self.conversation_chains:
                # Target is part of a conversation chain - nest it
                target_elem = ET.SubElement(choice_elem, 'target')
                nested_tree = self.build_nested_dialog_tree(target_id, visited)
                if nested_tree:
                    target_elem.append(nested_tree)
            elif target_id:
                # Regular target - just set the attribute
                choice_elem.set('target', target_id)

        return dialog_tree

    def convert(self, output_file: str):
        """Main conversion method"""
        # Build the new XML structure
        new_root = ET.Element('story')
        new_root.set('title', "Red's Path through the woods")
        new_root.set('author', 'ASG')
        new_root.set('version', '2.0.0')

        # Copy settings
        settings = ET.SubElement(new_root, 'settings')
        ET.SubElement(settings, 'debug', firstbeat='0', showvals='on')

        # Convert environment section
        env_elem = self.root.find('environment')
        if env_elem is not None:
            new_env = ET.SubElement(new_root, 'environment')
            # Copy all props and nodes (convert fPath -> file)
            for child in env_elem:
                if child.tag in ['prop', 'node', 'sound']:
                    # Convert fPath to file for props, nodes, sounds
                    fpath = child.get('fPath')
                    if fpath:
                        child.set('file', fpath)
                        child.attrib.pop('fPath', None)
                    # Add descriptions for props
                    if child.tag == 'prop':
                        name = child.get('name', '')
                        if name == 'sweets':
                            child.text = 'Some pinata candy'
                        elif name == 'book':
                            child.text = "An illustrated version of Lady Chatterley's Lover"
                        elif name == 'gift':
                            child.text = "A mysterious present"
                        elif name == 'axe':
                            child.text = 'A sharp woodcutting axe'
                        elif name == 'knife':
                            child.text = 'A sharp knife'
                new_env.append(child)

        # Convert characters section
        chars_section = self.root.find('chars')
        if chars_section is not None:
            chars = ET.SubElement(new_root, 'characters')
            for char in chars_section.findall('char'):
                char_elem = ET.SubElement(chars, 'character')
                char_elem.set('id', char.find('id').text)
                char_elem.set('name', char.find('name').text)

                # Convert appearances
                graphics = char.find('graphics')
                if graphics is not None:
                    for state in graphics.findall('state'):
                        appearance = ET.SubElement(char_elem, 'appearance')
                        appearance.set('state', state.get('kind'))
                        appearance.set('file', state.get('fPath'))

                # Add counters
                for counter in char.findall('counter'):
                    counter_elem = ET.SubElement(char_elem, 'counter')
                    counter_elem.set('name', counter.get('name'))
                    counter_elem.set('value', counter.get('val'))
                    counter_elem.set('min', '0')
                    counter_elem.set('max', '100')

        # Build conversation chains
        self.build_conversation_chains()

        # Create plot section
        plot = ET.SubElement(new_root, 'plot')

        # Process each beat
        processed_beats = set()

        for beat in self.root.findall('.//beat'):
            beat_id_elem = beat.find('id')
            if beat_id_elem is None:
                continue

            beat_id = beat_id_elem.get('id')

            # Skip beats that are part of a chain (except the root)
            is_in_chain = False
            is_chain_root = False
            for root_id, chain in self.conversation_chains.items():
                if beat_id in chain:
                    if beat_id == chain[0]:
                        is_chain_root = True
                    else:
                        is_in_chain = True
                    break

            if is_in_chain and not is_chain_root:
                continue

            # Convert conversation chains to dialogTree
            if is_chain_root:
                # This is the root of a conversation chain - build dialog tree with attributes on function
                new_beat = ET.SubElement(plot, 'beat')
                new_id = ET.SubElement(new_beat, 'id')
                new_id.set('id', beat_id)
                new_id.set('name', beat_id_elem.get('name', ''))
                if beat_id_elem.get('cluster'):
                    new_id.set('cluster', beat_id_elem.get('cluster'))

                # Copy other elements (node, transition, etc.)
                for child in beat:
                    if child.tag not in ['id', 'function']:
                        new_beat.append(child)

                # Build dialog tree with attributes directly on function element
                conv = self.parse_conversation_choice(beat)
                if conv:
                    # Create function element WITH dialogTree attributes
                    func = ET.SubElement(new_beat, 'function')
                    func.set('kind', 'dialogTree')
                    func.set('speaker', self.get_character_name(conv['questioner']))
                    func.set('text', conv['question'])
                    if conv['node']:
                        func.set('node', conv['node'])

                    # Add choices as direct children of function
                    for choice in conv['choices']:
                        choice_elem = ET.SubElement(func, 'choice')
                        choice_elem.set('id', choice['id'])
                        choice_elem.set('text', choice['content'])

                        # Add counter attributes directly to choice element
                        if choice.get('counter'):
                            counter_str = choice['counter']
                            if counter_str and counter_str != 'undefined,00':
                                parts = counter_str.split(',')
                                if len(parts) == 2 and parts[0] != 'undefined':
                                    choice_elem.set('counter', parts[0])
                                    choice_elem.set('operation', 'change')
                                    choice_elem.set('val', parts[1])

                        # Add sound effects
                        if choice.get('buttonsound') and choice['buttonsound'] != 'undefined':
                            effect_elem = ET.SubElement(choice_elem, 'effect')
                            effect_elem.set('type', 'playsound')
                            effect_elem.set('name', choice['buttonsound'])

                        # Handle target - check if it leads to another conversation
                        target_id = choice.get('targetBeat')
                        if target_id and target_id in self.conversation_chains:
                            # Target is part of a conversation chain - nest it
                            target_elem = ET.SubElement(choice_elem, 'target')
                            nested_tree = self.build_nested_dialog_tree(target_id, [])
                            if nested_tree:
                                target_elem.append(nested_tree)
                        elif target_id:
                            # Regular target - just set the attribute
                            choice_elem.set('target', target_id)

                    processed_beats.add(beat_id)

            else:
                # For non-conversation beats, copy them as-is
                conv = self.parse_conversation_choice(beat)
                if conv:
                    # This is a standalone conversation beat (not part of chain)
                    new_beat = ET.SubElement(plot, 'beat')
                    new_id = ET.SubElement(new_beat, 'id')
                    new_id.set('id', beat_id)
                    new_id.set('name', conv['name'])
                    if conv['cluster']:
                        new_id.set('cluster', conv['cluster'])

                    # Copy other elements
                    for child in beat:
                        if child.tag not in ['id', 'function']:
                            new_beat.append(child)

                    # Build dialog tree with attributes directly on function element
                    conv = self.parse_conversation_choice(beat)
                    if conv:
                        # Create function element WITH dialogTree attributes
                        func = ET.SubElement(new_beat, 'function')
                        func.set('kind', 'dialogTree')
                        func.set('speaker', self.get_character_name(conv['questioner']))
                        func.set('text', conv['question'])
                        if conv['node']:
                            func.set('node', conv['node'])

                        # Add choices as direct children of function
                        for choice in conv['choices']:
                            choice_elem = ET.SubElement(func, 'choice')
                            choice_elem.set('id', choice['id'])
                            choice_elem.set('text', choice['content'])

                            # Add counter attributes directly to choice element
                            if choice.get('counter'):
                                counter_str = choice['counter']
                                if counter_str and counter_str != 'undefined,00':
                                    parts = counter_str.split(',')
                                    if len(parts) == 2 and parts[0] != 'undefined':
                                        choice_elem.set('counter', parts[0])
                                        choice_elem.set('operation', 'change')
                                        choice_elem.set('val', parts[1])

                            # Add sound effects
                            if choice.get('buttonsound') and choice['buttonsound'] != 'undefined':
                                effect_elem = ET.SubElement(choice_elem, 'effect')
                                effect_elem.set('type', 'playsound')
                                effect_elem.set('name', choice['buttonsound'])

                            # Handle target
                            target_id = choice.get('targetBeat')
                            if target_id:
                                choice_elem.set('target', target_id)

                else:
                    # Non-conversation beat - copy as-is
                    new_beat = ET.SubElement(plot, 'beat')
                    for child in beat:
                        new_beat.append(child)

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

        indent(new_root)
        new_tree = ET.ElementTree(new_root)
        new_tree.write(output_file, encoding='utf-8', xml_declaration=True)

        print(f"Conversion complete! Output: {output_file}")
        print(f"Identified {len(self.conversation_chains)} conversation chains:")
        for root_id, chain in self.conversation_chains.items():
            print(f"  Chain {root_id}: {chain}")

def main():
    input_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/StoryBackup.xml'
    output_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted_proper.xml'

    converter = XMLConverter(input_file)
    converter.convert(output_file)

if __name__ == '__main__':
    main()
