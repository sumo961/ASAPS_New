import { MultiChoiceBeat } from './MultiChoiceBeat';
import type { BeatConfig } from '../types';
import { StoryContext } from '../engine/StoryContext';
import type { MultiChoiceOption, CharacterOption } from '../generated/beat-types';
import { stripRolePrefix } from '../engine/roles';

/**
 * Choose your character — a Multi Choice whose options cast a role
 * (docs/Character-Roles-Design.md, D7). Same screen, layouts, Visual Editor
 * and choice editor as Multi Choice; each option names a character, and
 * taking it casts that character into `role` before the option's own
 * effects run (so an effect on '@player' lands on the one just chosen).
 * An option's label defaults to the character's current name, and it can
 * carry a description line.
 *
 * With no options authored, the role's candidates are offered as they are.
 * An option without a target goes where the other options go (usually all
 * options share one target).
 */
export class ChooseCharacterBeat extends MultiChoiceBeat {
  public role: string;

  constructor(config: BeatConfig & { parameters?: Record<string, any> } & Record<string, any>) {
    super({
      ...config,
      question: (config as any).question || config.parameters?.question || 'Who will you be?',
    } as any);
    this.role = stripRolePrefix(String((config as any).role ?? config.parameters?.role ?? 'player'));
  }

  getParameters(): Record<string, any> {
    return { ...super.getParameters(), role: this.role };
  }

  updateParameters(params: Record<string, any>): void {
    super.updateParameters(params);
    if (params.role !== undefined) this.role = stripRolePrefix(String(params.role));
  }

  protected choicesFor(context: StoryContext): MultiChoiceOption[] {
    const authored = (this.choices || []) as unknown as CharacterOption[];
    const options: CharacterOption[] = authored.length > 0
      ? authored
      : (context.getRole(this.role)?.candidates ?? []).map((id) => ({ id: `cast_${id}`, character: id }));
    return options.map((o) => {
      const option = { ...o, text: o.text ?? '', target: o.target ?? '' } as MultiChoiceOption;
      if (option.text || option.displayText || !o.character) return option;
      const ch = context.getMergedCharacter(o.character);
      return { ...option, text: ch?.displayName || ch?.name || o.character };
    });
  }

  protected onChoiceTaken(selected: MultiChoiceOption, context: StoryContext): void {
    const character = (selected as unknown as CharacterOption).character;
    if (character) context.castRole(this.role, character);
  }

  protected targetFor(selected: MultiChoiceOption, context: StoryContext): string | null {
    return selected.target
      || (this.choices || []).find((c) => c.target && c.target !== '__self__')?.target
      || this.getNextBeat(context);
  }
}
