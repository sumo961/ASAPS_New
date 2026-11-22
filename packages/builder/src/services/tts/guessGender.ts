/**
 * Whether a speaker is a woman or a man, as far as the story says, so that a
 * voice picked for them (autoVoices) suits them. In the field test a man's
 * voice read Karin's lines: her character has no pronouns set, and the pick
 * went by nothing else (author, 2026-11-22).
 *
 * In this order, stopping at the first that answers:
 *  1. the character's pronouns, where the author set she or he;
 *  2. what the character's own texts call them (her description: "She missed
 *     two payments…"), where one of she/he clearly outweighs the other;
 *  3. what they are called: a role word (Mother, Grandpa, Mrs, the King) or a
 *     common first name.
 * No answer is an answer too: the voice is then any free one. This only
 * suggests a voice; the author's own choice of voice always wins, and
 * nothing here is stored on the character.
 */

export type GuessedGender = 'female' | 'male';

const FEMALE_WORDS = new Set([
  'mother', 'mom', 'mum', 'mommy', 'mummy', 'mama', 'mamma', 'grandmother', 'grandma', 'grandmama', 'granny', 'gran', 'nana', 'aunt', 'auntie',
  'sister', 'daughter', 'wife', 'girl', 'woman', 'lady', 'queen', 'princess', 'duchess', 'witch', 'nun', 'actress', 'waitress', 'hostess',
  'mrs', 'ms', 'miss', 'madam', 'madame', 'frau', 'señora', 'senora', 'signora', 'fru', 'mor', 'mormor', 'farmor', 'mutter', 'oma', 'tante',
]);
const MALE_WORDS = new Set([
  'father', 'dad', 'daddy', 'papa', 'grandfather', 'grandpa', 'granddad', 'grandad', 'uncle', 'brother', 'son', 'husband', 'boy', 'man',
  'king', 'prince', 'duke', 'lord', 'wizard', 'monk', 'actor', 'waiter', 'huntsman', 'woodsman', 'fisherman', 'policeman', 'postman',
  'mr', 'mister', 'sir', 'herr', 'señor', 'senor', 'signor', 'far', 'morfar', 'farfar', 'vater', 'opa', 'onkel',
]);

// Common first names (English, German, Nordic, Romance, a few others). Names
// in common use for both (Alex, Kim, Robin, Sam, Chris, Jo, Andrea, Sasha…)
// are left out on purpose.
const FEMALE_NAMES = new Set(`
ada agnes aisha alice alicia amanda amelia amy ana anita anja anna anne annika astrid ava barbara beatrice bella birgit brigitte camilla carla
carmen carol caroline catherine cecilia charlotte chloe christina christine claire clara claudia daisy diana dora edith eleanor elena elin
elisabeth elizabeth ella ellen elsa emilia emily emma erika esther eva evelyn fatima fiona florence frances freya frida gabriela gerda grace
greta gudrun hannah heidi helen helena helga hilda ida inga ingrid irene iris isabel isabella isabelle jane janet jennifer jessica joan joanna
johanna josephine julia julie karen karin katarina kate katharina katherine kathrin katja kerstin klara laura lea leah lena lily linda lisa
louise lucia lucy luisa madeleine maja margaret margareta maria marie marta martha mary matilda maya mia michelle mona monika nadia naomi
natalie nina nora olivia paula petra rachel rebecca rosa rose ruth sabine sally sandra sara sarah selma sigrid silvia siri sofia sonja sophia
sophie stella susan susanne svetlana sylvia tanya teresa theresa tina tove ulla ulrika ursula valentina vera victoria viktoria wilma yasmin
zoe`.split(/\s+/).filter(Boolean));
const MALE_NAMES = new Set(`
aaron adam adrian ahmed alan albert alexander alfred ali anders andreas andrew anton arthur axel ben benjamin bernd bjorn björn bo boris brian
bruno carl carlos charles christian christopher claus daniel david dennis dieter dmitri edward emil erik ernst felix francis frank franz fred
frederick fredrik friedrich georg george gerhard giovanni gunnar gustav hans harald harry hartmut heinrich helmut henrik henry herbert hugo
ian ivan jack jacob jakob james jan jens johan johann johannes john jon jonas jonathan jorge jose josef joseph juan jürgen karl kevin klaus
knut kurt lars leo leon leonard louis lucas ludwig luis lukas magnus manuel marco marcus mark markus martin matthias max maximilian michael
miguel mikael mohammed niklas nils noah olaf ole oliver olof oscar oskar otto pablo patrick paul pedro per peter philip philipp pierre rainer
ralf raphael richard robert roger rolf rudolf samuel sebastian simon stefan stephen steven sven theo theodor thomas tim tobias tom tomas
tony ulf ulrich uwe victor viktor vincent walter werner wilhelm william wolfgang`.split(/\s+/).filter(Boolean));

const words = (s: string) => s.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);

/** From what someone is called: "Grandma", "Mrs Holm", "Captain Ingrid", "Karin Lindqvist". */
export function genderFromName(name: string | undefined | null): GuessedGender | undefined {
  if (!name) return undefined;
  const parts = words(name);
  // A role word anywhere says it ("the old King", "Mrs Holm").
  const femaleWord = parts.some((w) => FEMALE_WORDS.has(w));
  const maleWord = parts.some((w) => MALE_WORDS.has(w));
  if (femaleWord !== maleWord) return femaleWord ? 'female' : 'male';
  if (femaleWord && maleWord) return undefined;
  // Otherwise a first name: the first word that is one ("Captain Ingrid").
  for (const w of parts) {
    const f = FEMALE_NAMES.has(w);
    const m = MALE_NAMES.has(w);
    if (f !== m) return f ? 'female' : 'male';
  }
  return undefined;
}

/** From a text about one person: she/her against he/him/his, where one clearly outweighs the other. */
export function genderFromText(text: string | undefined | null): GuessedGender | undefined {
  if (!text) return undefined;
  let she = 0;
  let he = 0;
  for (const w of words(text)) {
    if (w === 'she' || w === 'her' || w === 'hers' || w === 'herself') she += 1;
    else if (w === 'he' || w === 'him' || w === 'his' || w === 'himself') he += 1;
  }
  if (she > 0 && she >= he * 2) return 'female';
  if (he > 0 && he >= she * 2) return 'male';
  return undefined;
}

interface CharacterLike {
  id?: string;
  name?: string;
  displayName?: string;
  pronouns?: unknown;
  description?: string;
  variants?: ReadonlyArray<{ characterDescription?: string; description?: string } | null | undefined> | null;
}

export function genderOfCharacter(c: CharacterLike): GuessedGender | undefined {
  if (c.pronouns === 'she') return 'female';
  if (c.pronouns === 'he') return 'male';
  // "They", or pronouns of the author's own: said on purpose, nothing to guess.
  if (c.pronouns) return undefined;
  const texts = [c.description, ...(c.variants ?? []).flatMap((v) => [v?.characterDescription, v?.description])].filter(Boolean).join('\n');
  return genderFromText(texts) ?? genderFromName(c.displayName) ?? genderFromName(c.name);
}

/** For every speaker of the story: characters by all they are known by, other speakers by their name. */
export function guessSpeakerGenders(
  characters: ReadonlyArray<CharacterLike> | null | undefined,
  speakers?: ReadonlyArray<string> | null,
): Record<string, GuessedGender | undefined> {
  const out: Record<string, GuessedGender | undefined> = {};
  const known = new Set<string>();
  for (const c of characters ?? []) {
    const gender = genderOfCharacter(c);
    for (const name of [c.displayName, c.name, c.id]) {
      if (!name) continue;
      known.add(name);
      if (gender) out[name] = gender;
    }
  }
  for (const speaker of speakers ?? []) {
    if (!speaker || known.has(speaker)) continue;
    const gender = genderFromName(speaker);
    if (gender) out[speaker] = gender;
  }
  return out;
}
