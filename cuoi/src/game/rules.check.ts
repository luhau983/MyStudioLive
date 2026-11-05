// Chạy: npx tsx src/game/rules.check.ts
import assert from 'node:assert/strict';
import { parseCommand, matchName, nameScore, pickRole } from './rules';

assert.deepEqual(parseCommand('cưới vợ @Lan Anh'), { type: 'propose', role: 'groom', target: 'Lan Anh' });
assert.deepEqual(parseCommand('Cưới chồng @Tuấn 🌸'), { type: 'propose', role: 'bride', target: 'Tuấn 🌸' });
assert.deepEqual(parseCommand('cuoi @minhtuan99'), { type: 'propose', role: 'any', target: 'minhtuan99' });
assert.deepEqual(parseCommand('lấy chồng @Bảo'), { type: 'propose', role: 'bride', target: 'Bảo' });
assert.equal(parseCommand('đám cưới vui quá'), null);
assert.equal(parseCommand('@Lan đẹp quá'), null);
assert.deepEqual(parseCommand('Đồng ý!'), { type: 'yes' });
assert.deepEqual(parseCommand('em đồng ý'), { type: 'yes' });
assert.deepEqual(parseCommand('dong y nha'), { type: 'yes' });
assert.deepEqual(parseCommand('không'), { type: 'no' });
assert.deepEqual(parseCommand('từ chối'), { type: 'no' });
assert.deepEqual(parseCommand('zô'), { type: 'zo' });
assert.deepEqual(parseCommand('Se duyên cho con'), { type: 'duyen' });
assert.deepEqual(parseCommand('xin duyen'), { type: 'duyen' });
assert.deepEqual(parseCommand('đấm @Minh Tuấn'), { type: 'punch', target: 'Minh Tuấn' });
assert.deepEqual(parseCommand('trêu @Lan'), { type: 'tease', target: 'Lan' });
assert.deepEqual(parseCommand('quẩy'), { type: 'dance' });
assert.deepEqual(parseCommand('quẩy lên'), { type: 'dance' });
assert.equal(parseCommand('đám cưới @Lan vui ghê'), null);
assert.deepEqual(parseCommand('dzô dzô'), { type: 'zo' });
assert.equal(parseCommand('không biết nói gì luôn á mọi người ơi'), null);
assert.deepEqual(parseCommand('không cưới đâu'), { type: 'no' });

// gõ tên hiển thị hoặc username đều được (bỏ dấu, emoji, chữ kiểu lạ)
assert.equal(nameScore('lananh2k', 'Bé Na', 'lananh2k'), 3);
assert.equal(nameScore('Lan Anh', 'Lan Anh 🌸', 'x'), 3);
assert.equal(nameScore('Lan Anh nha', 'Lan Anh 🌸', 'x'), 3);
assert.equal(nameScore('trang', 'Trang Nguyễn 2k', 'x'), 2); // đầu tên: chỉ nhận khi sảnh có 1 người khớp
assert.equal(nameScore('nguyen', 'Trang Nguyễn 2k', 'x'), 1);
assert.equal(nameScore('an', 'Lan Anh', 'x'), 0); // dưới 3 ký tự không đoán
const vu = 'Vũ🌈🌈';
for (const c of ['cưới chồng @vũ', 'cưới chồng @ vũ', 'cưới chồng @Vũ🌈🌈', 'cưới chồng @vu', 'cưới chồng @vu.2k5', 'cưới vợ @ Vũ nha']) {
  const p = parseCommand(c);
  assert.ok(p?.type === 'propose' && nameScore(p.target, vu, 'vu.2k5') === 3, c);
}
assert.equal(nameScore('vũ', '𝑽𝒖̃ 🌈', 'x'), 3);
assert.ok(matchName('trang', 'Trang Nguyễn', 'x'));

assert.equal(pickRole('abc'), pickRole('abc'));

console.log('rules ok');
