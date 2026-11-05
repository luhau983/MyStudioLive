// Comment -> intent parsing for Đảo Sinh Tồn.
// Only short comments (≤ 4 words) whose first word(s) match a command count, so ordinary chat
// ("tròn quá", "năm nay…") rarely triggers anything. Accents are optional.

export function normalize(text) {
  if (typeof text !== 'string') return '';
  return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd')
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const CLASS_WORDS = [
  ['chien binh', 'warrior'], ['chien', 'warrior'], ['warrior', 'warrior'],
  ['cung thu', 'archer'], ['cung', 'archer'], ['archer', 'archer'],
  ['ninja', 'ninja']
];
const ZONE_WORDS = [['bac', 'bac'], ['nam', 'nam'], ['dong', 'dong'], ['tay', 'tay']];
const STANCE_WORDS = [['tron', 'hide'], ['xong', 'charge'], ['hoi', 'heal'], ['hoi mau', 'heal']];

const startsWith = (text, word) => text === word || text.startsWith(word + ' ');

// Returns { kind, value } or null. `join` means the comment carried no command.
export function parseCommand(raw) {
  const text = normalize(raw);
  if (!text) return null;
  if (text.split(' ').length > 4) return { kind: 'chat' };
  const vote = /^bao ([123])\b/.exec(text);
  if (vote) return { kind: 'vote', value: Number(vote[1]) - 1 };
  if (startsWith(text, 'vi tri')) return { kind: 'position' };
  if (startsWith(text, 'vao') || startsWith(text, 'join')) return { kind: 'join' };
  for (const [w, v] of CLASS_WORDS) if (startsWith(text, w)) return { kind: 'class', value: v };
  for (const [w, v] of ZONE_WORDS) if (startsWith(text, w)) return { kind: 'zone', value: v };
  for (const [w, v] of STANCE_WORDS) if (startsWith(text, w)) return { kind: 'stance', value: v };
  return { kind: 'chat' };
}
