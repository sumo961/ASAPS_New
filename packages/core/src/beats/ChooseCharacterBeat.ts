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
 *
 * `optionStyle` shows the options as picture cards instead of buttons:
 * each option's own `image`, else its character's portrait (the active
 * variant's when it has one).
 */
export type CharacterOptionStyle = 'buttons' | 'pictures' | 'picturesOnly';

function normalizeOptionStyle(v: unknown): CharacterOptionStyle {
  return v === 'pictures' || v === 'picturesOnly' ? v : 'buttons';
}

export class ChooseCharacterBeat extends MultiChoiceBeat {
  public role: string;
  public optionStyle: CharacterOptionStyle;

  constructor(config: BeatConfig & { parameters?: Record<string, any> } & Record<string, any>) {
    super({
      ...config,
      question: (config as any).question || config.parameters?.question || 'Who will you be?',
    } as any);
    this.role = stripRolePrefix(String((config as any).role ?? config.parameters?.role ?? 'player'));
    this.optionStyle = normalizeOptionStyle((config as any).optionStyle ?? config.parameters?.optionStyle);
  }

  getParameters(): Record<string, any> {
    return { ...super.getParameters(), role: this.role, optionStyle: this.optionStyle };
  }

  updateParameters(params: Record<string, any>): void {
    super.updateParameters(params);
    if (params.role !== undefined) this.role = stripRolePrefix(String(params.role));
    if (params.optionStyle !== undefined) this.optionStyle = normalizeOptionStyle(params.optionStyle);
  }

  protected choiceStyle(): string {
    return this.optionStyle;
  }

  protected choicesFor(context: StoryContext): MultiChoiceOption[] {
    const authored = (this.choices || []) as unknown as CharacterOption[];
    const options: CharacterOption[] = authored.length > 0
      ? authored
      : (context.getRole(this.role)?.candidates ?? []).map((id) => ({ id: `cast_${id}`, character: id }));
    const pictures = this.optionStyle !== 'buttons';
    return options.map((o) => {
      const option = { ...o, text: o.text ?? '', target: o.target ?? '' } as MultiChoiceOption & { image?: string };
      const ch = o.character ? context.getMergedCharacter(o.character) : undefined;
      if (pictures && !option.image) {
        const portrait = (ch as any)?.portrait as { assetId?: string; image?: string } | undefined;
        const image = portrait?.assetId || portrait?.image;
        if (image) option.image = image;
      }
      if (option.text || option.displayText || !o.character) return option;
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
