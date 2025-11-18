#!/usr/bin/env python3
"""
RedStory XML Converter - Converts old-style ASML conversationChoice beats to DialogTree format

This script:
1. Parses the old Story.xml format with conversationChoice beats
2. Identifies conversation chains that can be folded into DialogTrees
3. Converts to new XML format with proper dialogTree structure
4. Preserves all logic: counters, variables, conditions, and branching
"""

import xml.etree.ElementTree as ET
import re
from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass

@dataclass
class ConversationChoice:
    """Represents a conversation choice from the old format"""
    beat_id: str
    name: str
    cluster: str
    questioner: str
    question: str
    choices: List[Dict[str, Any]]
    node: Optional[str] = None
    delay: Optional[str] = None

class XMLConverter:
    def __init__(self, input_file: str):
        self.input_file = input_file
        self.tree = ET.parse(input_file)
        self.root = self.tree.getroot()
        self.beats_by_id: Dict[str, ET.Element] = {}
        self.conversation_chains: Dict[str, List[str]] = {}

    def parse_beat(self, beat: ET.Element) -> Optional[ConversationChoice]:
        """Parse a conversationChoice beat from old format"""
        func = beat.find('function')
        if func is None or func.get('kind') != 'conversationChoice':
            return None

        beat_id_elem = beat.find('id')
        if beat_id_elem is None:
            return None

        choices = []
        for choice in func.findall('choice'):
            choice_dict = {
                'id': choice.get('id'),
                'content': choice.get('content'),
                'counter': choice.get('counter'),
                'buttonsoun(': choice.get('buttonsoun('),
                'targetBeat': choice.get('targetBeat')
            }
            choices.append(choice_dict)

        # Get the question text and questioner
        question_elem = func.find('question')
        questioner_elem = func.find('questioner')
        node_elem = beat.find('node')
        delay_elem = func.find('delay')

        return ConversationChoice(
            beat_id=beat_id_elem.get('id'),
            name=beat_id_elem.get('name', ''),
            cluster=beat_id_elem.get('cluster', ''),
            questioner=questioner_elem.text if questioner_elem is not None else '1',
            question=question_elem.text if question_elem is not None else '',
            choices=choices,
            node=node_elem.text if node_elem is not None else None,
            delay=delay_elem.text if delay_elem is not None else None
        )

    def build_conversation_chains(self):
        """Identify chains of conversationChoice beats that should be folded"""
        # First, index all beats by ID
        for beat in self.root.findall('.//beat'):
            beat_id = beat.find('id')
            if beat_id is not None:
                self.beats_by_id[beat_id.get('id')] = beat

        # Look for conversationChoice beats
        for beat in self.root.findall('.//beat'):
            conv = self.parse_beat(beat)
            if conv:
                # Follow the chain: check if any choice leads to another conversationChoice
                chain = [conv.beat_id]
                self._follow_chain(conv, chain)
                if len(chain) > 1:
                    self.conversation_chains[conv.beat_id] = chain

    def _follow_chain(self, conv: ConversationChoice, chain: List[str]):
        """Recursively follow conversation chains"""
        for choice in conv.choices:
            target_id = choice.get('targetBeat')
            if target_id and target_id in self.beats_by_id:
                target_beat = self.beats_by_id[target_id]
                target_conv = self.parse_beat(target_beat)
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

    def convert_buttonsoun(_to_effects(self, sound_name: str) -> List[Dict[str, Any]]:
        """Convert buttonsoun( to effects"""
        if not sound_name or sound_name == 'undefined':
            return []

        return [{
            'type': 'playsoun(',
            'name': sound_name
        }]

    def create_dialog_tree(self, conv: ConversationChoice) -> ET.Element:
        """Create a dialogTree element from a ConversationChoice"""
        # Create effects for any counter/sound operations
        effects = []

        # Add counter effects
        for choice in conv.choices:
            if choice.get('counter'):
                effects.extend(self.convert_counter_to_effects(choice['counter']))

        # Create the dialogTree element
        dialog_tree = ET.Element('dialogTree', {
            'id': f"node_{conv.beat_id}",
            'speaker': self.get_character_name(conv.questioner),
            'text': conv.question
        })

        if conv.node:
            dialog_tree.set('node', conv.node)

        # Add effects if any
        if effects:
            for effect in effects:
                effect_elem = ET.SubElement(dialog_tree, 'effect')
                effect_elem.set('type', effect['type'])
                if effect['type'] == 'counter':
                    effect_elem.set('name', effect['name'])
                    effect_elem.set('operation', effect['operation'])
                    effect_elem.set('value', str(effect['value']))
                elif effect['type'] == 'playsoun(',
                    effect_elem.set('name', effect['name'])

        # Add choices
        for choice in conv.choices:
            choice_elem = ET.SubElement(dialog_tree, 'choice')
            choice_elem.set('id', choice['id'])
            choice_elem.set('text', choice['content'])

            if choice.get('targetBeat'):
                choice_elem.set('target', choice['targetBeat'])

            # Add choice-specific effects
            choice_effects = []
            if choice.get('counter'):
                choice_effects.extend(self.convert_counter_to_effects(choice['counter']))
            if choice.get('buttonsoun('):
                choice_effects.extend(self.convert_buttonsoun(_to_effects(choice['buttonsoun(']))

            for effect in choice_effects:
                effect_elem = ET.SubElement(choice_elem, 'effect')
                effect_elem.set('type', effect['type'])
                if effect['type'] == 'counter':
                    effect_elem.set('name', effect['name'])
                    effect_elem.set('operation', effect['operation'])
                    effect_elem.set('value', str(effect['value']))
                elif effect['type'] == 'playsoun(',
                    effect_elem.set('name', effect['name'])

        return dialog_tree

    def get_character_name(self, questioner_id: str) -> str:
        """Map questioner ID to character name"""
        # Map numeric IDs to character names based on RedStory structure
        char_map = {
            '1': 'Mom',
            'WOLF': 'Wolf',
            'GRAN': 'Gran',
            'WOODSMAN': 'Woodsman'
        }
        return char_map.get(questioner_id, 'Red')

    def convert(self, output_file: str):
        """Main conversion method"""
        # Build the new XML structure
        new_root = ET.Element('story')
        new_root.set('title', "Red's Path through the woods")
        new_root.set('author', 'ASG')
        new_root.set('version', '2.0.0')

        # Copy settings (with some updates)
        settings = ET.SubElement(new_root, 'settings')
        ET.SubElement(settings, 'debug', firstbeat='0', showvals='on')

        # Copy environment
        env_elem = self.root.find('environment')
        if env_elem is not None:
            new_env = ET.SubElement(new_root, 'environment')
            # Copy all props and nodes
            for child in env_elem:
                new_env.append(child)

        # Convert characters section
        chars_elem = self.root.find('chars')
        if chars_elem is not None:
            chars = ET.SubElement(new_root, 'characters')
            for char in chars_elem.findall('char'):
                char_elem = ET.SubElement(chars, 'character')
                char_elem.set('id', char.find('id').text)
                char_elem.set('name', char.find('name').text)

                # Check for graphics
                graphics = char.find('graphics')
                if graphics is not None:
                    for state in graphics.findall('state'):
                        state_elem = ET.SubElement(char_elem, 'appearance')
                        state_elem.set('state', state.get('kind'))
                        state_elem.set('file', state.get('fPath'))

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
        for beat in self.root.findall('.//beat'):
            beat_id_elem = beat.find('id')
            if beat_id_elem is None:
                continue

            beat_id = beat_id_elem.get('id')

            # Skip beats that are part of a chain (except the root)
            is_in_chain = False
            for chain in self.conversation_chains.values():
                if beat_id in chain[1:]:  # Skip if not the first in chain
                    is_in_chain = True
                    break

            if is_in_chain:
                continue

            # Convert conversationChoice beats
            conv = self.parse_beat(beat)
            if conv:
                # Create new beat
                new_beat = ET.SubElement(plot, 'beat')
                new_id = ET.SubElement(new_beat, 'id')
                new_id.set('id', beat_id)
                new_id.set('name', conv.name)
                if conv.cluster:
                    new_id.set('cluster', conv.cluster)

                # Copy transition
                transition = beat.find('transition')
                if transition is not None:
                    new_beat.append(transition)

                # Copy sound
                sound = beat.find('sound')
                if sound is not None:
                    new_beat.append(sound)

                # Create function with dialogTree
                func = ET.SubElement(new_beat, 'function')
                func.set('kind', 'dialogTree')

                dialog_tree = self.create_dialog_tree(conv)
                func.append(dialog_tree)

                # Add connection to next beat (if not handled by choices)
                if not any(c.get('targetBeat') for c in conv.choices):
                    default_target = beat.find('.//defaulttarget')
                    if default_target is not None:
                        conn = ET.SubElement(func, 'connection')
                        conn.set('target', default_target.get('targetBeat'))
                        conn.set('label', 'Continue')

                # Copy locations
                locs = beat.find('locs')
                if locs is not None:
                    new_locs = ET.SubElement(new_beat, 'locs')
                    for loc in locs:
                        new_locs.append(loc)

            else:
                # For non-conversation beats, copy them as-is
                new_beat = ET.SubElement(plot, 'beat')
                # Copy all elements
                for child in beat:
                    new_beat.append(child)

        # Create the new XML tree
        new_tree = ET.ElementTree(new_root)

        # Write with pretty formatting
        self._indent(new_root)
        new_tree.write(output_file, encoding='utf-8', xml_declaration=True)

        print(f"Conversion complete! Output written to {output_file}")
        print(f"Identified {len(self.conversation_chains)} conversation chains")
        for root_id, chain in self.conversation_chains.items():
            print(f"  Chain starting at {root_id}: {chain}")

    def _indent(self, elem, level=0):
        """Pretty-print XML with proper indentation"""
        i = "\n" + level * "  "
        if len(elem):
            if not elem.text or not elem.text.strip():
                elem.text = i + "  "
            if not elem.tail or not elem.tail.strip():
                elem.tail = i
            for elem in elem:
                self._indent(elem, level + 1)
            if not elem.tail or not elem.tail.strip():
                elem.tail = i
        else:
            if level and (not elem.tail or not elem.tail.strip()):
                elem.tail = i


def main():
    """Main entry point"""
    import sys
    import os

    input_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/StoryBackup.xml'
    output_file = '/Users/hartmut/Library/Mobile Documents/com~apple~CloudDocs/Coding/Project Phoenix/asaps-modern/examples/RedStory/Story_converted.xml'

    if not os.path.exists(input_file):
        print(f"Error: Input file {input_file} not found")
        return 1

    print("Starting conversion of RedStory...")
    converter = XMLConverter(input_file)
    converter.convert(output_file)
    print("Done!")
    return 0


if __name__ == '__main__':
    sys.exit(main())
