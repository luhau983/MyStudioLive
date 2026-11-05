// Luật thuần (không React, không 3D): đọc lệnh trong comment, khớp tên, giá cướp dâu. Test: npx tsx src/game/rules.check.ts
import { plain } from '../live/chatter';

export type Role = 'groom' | 'bride';

export type Command =
  | { type: 'propose'; role: Role | 'any'; target: string } // role = vai của NGƯỜI GÕ
  | { type: 'yes' }
  | { type: 'no' }
  | { type: 'zo' }
  | { type: 'duyen' }
  | { type: 'punch'; target: string }
  | { type: 'tease'; target: string }
  | { type: 'dance' };

/**
 *   "cưới vợ @Lan Anh"   -> mình làm chú rể, cưới Lan Anh
 *   "cưới chồng @Tuấn"   -> mình làm cô dâu
 *   "cưới @Tuấn"         -> MC bốc vai
 *   "lấy @Tuấn", "cuoi vo @x" cũng được. Thiếu @ thì không tính (tránh "đám cưới vui quá").
 */
export function parseCommand(comment: string): Command | null {
  const raw = comment.trim();
  const at = raw.indexOf('@');
  if (at >= 0) {
    const head = plain(raw.slice(0, at)).trim();
    const target = raw.slice(at + 1).trim().replace(/\s+/g, ' ');
    if (target && !head.includes('dam cuoi') && /(^| )(dam|danh|tat|bop|choang|uppercut)( |$)/.test(head)) return { type: 'punch', target: target.slice(0, 40) };
    if (target && /(^| )(treu|choc|gheo)( |$)/.test(head)) return { type: 'tease', target: target.slice(0, 40) };
    if (target && !head.includes('dam cuoi') && /(^|\s)(cuoi|lay|ruoc|hoi)(\s|$)/.test(head)) {
      const role: Role | 'any' = /(vo|em ay|nang)(\s|$)/.test(head) ? 'groom' : /(chong|anh ay|chang)(\s|$)/.test(head) ? 'bride' : 'any';
      return { type: 'propose', role, target: target.slice(0, 40) };
    }
  }
  const p = plain(raw).trim();
  if (/^((ok|em|anh|toi|minh) )?(dong y|chiu|ung|gat dau|yes)( |$)/.test(p)) return { type: 'yes' };
  // chỉ câu ngắn: "không biết nói gì luôn" không phải từ chối
  if (p.split(' ').length <= 4 && /^((em|anh|toi|minh) )?(khong|ko|k dong y|tu choi|no|thoi|hong)( |$)/.test(p)) return { type: 'no' };
  if (/(^| )(se duyen|xin duyen|cau duyen)( |$)/.test(p)) return { type: 'duyen' };
  if (p.length <= 16 && /(^| )(quay|nhay|quay len|bung)( |$)/.test(p)) return { type: 'dance' };
  if (/(^| )(d?zo+|do+)( |$)/.test(p) && p.length <= 20) return { type: 'zo' };
  return null;
}

/**
 * Độ khớp giữa chữ gõ sau @ và 1 người (gõ tên hiển thị hay username đều được; bỏ dấu, bỏ emoji, chữ kiểu lạ):
 *   3 = đúng username, hoặc đúng y tên hiển thị ("@vũ" với "Vũ🌈🌈"; "@Lan Anh nha" với "Lan Anh")
 *   2 = tên hiển thị BẮT ĐẦU bằng chữ gõ, gõ từ 3 ký tự ("@trang" với "Trang Nguyễn 2k")
 *   1 = tên hiển thị CHỨA chữ gõ, từ 3 ký tự ("@nguyen" với "Trang Nguyễn 2k")
 *   0 = không khớp
 * Mức 2 và 1 chỉ dùng khi trong sảnh có đúng 1 người khớp (findGuest lo việc này), để không bắt nhầm.
 */
export function nameScore(typed: string, nickname: string, username: string): number {
  const nick = squash(nickname);
  const user = squash(username);
  const first = firstToken(typed);
  if (first && username && (first === username.toLowerCase() || squash(first) === user)) return 3;
  const prefixes = namePrefixes(typed.replace(/^@+\s*/, '')).map(squash).filter(Boolean);
  if (prefixes.some((t) => t === nick || t === user)) return 3;
  if (!prefixes.length || !nick) return 0;
  if (prefixes.some((p) => p.length >= 3 && nick.startsWith(p))) return 2;
  if (prefixes.some((p) => p.length >= 3 && nick.includes(p))) return 1;
  return 0;
}

/** khớp chắc chắn (mức 3) hoặc gần đúng (mức 2) — dùng khi chờ người được @ vào tiệc */
export function matchName(typed: string, nickname: string, username: string): boolean {
  return nameScore(typed, nickname, username) >= 2;
}

/** đúng y username hoặc tên hiển thị */
export function exactName(typed: string, nickname: string, username: string) {
  return nameScore(typed, nickname, username) === 3;
}

/** chữ đầu sau @: bỏ @ thừa, dấu câu cuối ("@vu.2k5!" -> "vu.2k5") */
export const firstToken = (typed: string) =>
  (typed.trim().replace(/^@+\s*/, '').split(/\s+/)[0] ?? '').replace(/[^\p{L}\p{N}._]+$/u, '').toLowerCase();

/** các cách cắt chữ sau @, dài trước: "Lan Anh nha" -> "Lan Anh nha", "Lan Anh", "Lan" */
export function namePrefixes(typed: string) {
  const words = typed.trim().split(/\s+/);
  return words.map((_, i) => words.slice(0, words.length - i).join(' '));
}

const squash = (s: string) => plain(s).replace(/[^a-z0-9]/g, '');

/** Bốc vai khi gõ "cưới @x" không nói rõ: tung đồng xu theo tên cho cố định, khỏi cãi */
export function pickRole(proposerId: string): Role {
  let h = 0;
  for (const c of proposerId) h = (h * 31 + c.charCodeAt(0)) | 0;
  return Math.abs(h) % 2 ? 'groom' : 'bride';
}

export const other = (r: Role): Role => (r === 'groom' ? 'bride' : 'groom');
