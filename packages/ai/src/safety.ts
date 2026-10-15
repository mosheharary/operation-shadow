import { isPlainText } from '@operation-shadow/schemas';

// Generated text is shown to players as plain text only. Besides the schema's markup and link
// checks, it must not name real-world extremist movements, figures or symbols (the setting is
// fictional), nor contain slurs. The list is deliberately conservative: a hit falls back to the
// offline generator rather than trying to edit the text.
const BLOCKED = [
  'nazi',
  'hitler',
  'swastika',
  'gestapo',
  'third reich',
  'waffen',
  'wehrmacht',
  'luftwaffe',
  'fuhrer',
  'führer',
  'heil',
  'holocaust',
  'auschwitz',
  'mussolini',
  'stalin',
  'kkk',
  'ku klux',
  'isis',
  'al-qaeda',
  'jihad',
  'nigger',
  'faggot',
  'kike',
  'chink',
  'spic',
  'retard',
];

const PATTERN = new RegExp(`\\b(${BLOCKED.map((w) => w.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')).join('|')})(?:s|es)?\\b`, 'i');

/** Problem with a piece of generated text, or null when it is acceptable. */
export function textProblem(text: string): string | null {
  if (!isPlainText(text)) return 'contains markup, a link or control characters';
  const hit = PATTERN.exec(text);
  if (hit) return 'names a real-world extremist group, figure or slur';
  return null;
}
