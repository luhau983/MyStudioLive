// Bảng tên + bong bóng chat vẽ sẵn ra canvas 2D (lấy từ Đám Cưới Online), dán lên lớp phủ trên cảnh 3D.

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function hash(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Bảng tên vẽ sẵn 1 lần (gấp đôi độ nét), có avatar tròn bên trái nếu có. Mỗi khung hình chỉ dán ảnh.
export function nameTag(name: string, avatar: HTMLImageElement | null, color = '#7a2e43', title: { text: string; gold: boolean } | null = null) {
  const short = name.length > 16 ? name.slice(0, 15) + '…' : name;
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  const font = '700 44px "Be Vietnam Pro", sans-serif';
  const tFont = '800 32px "Be Vietnam Pro", sans-serif';
  c.font = font;
  const av = 60; // luôn có ô avatar: chưa có ảnh thì vẽ chữ cái đầu
  const nameW = Math.ceil(c.measureText(short).width) + 40 + av;
  c.font = tFont;
  const titleW = title ? Math.ceil(c.measureText(title.text).width) + 36 : 0;
  const w = Math.max(nameW, titleW);
  const th = title ? 48 : 0; // dải danh hiệu phía trên tên
  cv.width = w;
  cv.height = 68 + th;
  if (title) {
    const tx = (w - titleW) / 2;
    roundRect(c, tx + 2, 2, titleW - 4, 42, 21);
    if (title.gold) {
      const g = c.createLinearGradient(tx, 0, tx + titleW, 0);
      g.addColorStop(0, '#ff8fab');
      g.addColorStop(1, '#e05780');
      c.fillStyle = g;
    } else c.fillStyle = '#7b88a8';
    c.fill();
    c.font = tFont;
    c.fillStyle = '#ffffff';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(title.text, w / 2, 24);
  }
  const nx = (w - nameW) / 2;
  roundRect(c, nx + 2, th + 4, nameW - 4, 60, 30);
  c.fillStyle = 'rgba(255,255,255,0.9)';
  c.fill();
  c.save();
  c.beginPath();
  c.arc(nx + 34, th + 34, 26, 0, Math.PI * 2);
  c.clip();
  if (avatar) c.drawImage(avatar, nx + 8, th + 8, 52, 52);
  else {
    c.fillStyle = `hsl(${hash(name) % 360} 70% 62%)`;
    c.fillRect(nx + 8, th + 8, 52, 52);
    c.fillStyle = '#ffffff';
    c.font = '800 32px "Be Vietnam Pro", sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText((name.trim()[0] ?? '?').toUpperCase(), nx + 34, th + 36);
  }
  c.restore();
  c.beginPath();
  c.arc(nx + 34, th + 34, 26, 0, Math.PI * 2);
  c.strokeStyle = '#ffffff';
  c.lineWidth = 3;
  c.stroke();
  c.font = font;
  c.fillStyle = color;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(short, nx + av + (nameW - av) / 2, th + 36);
  return cv;
}

export function bubble(text: string) {
  const t = text.length > 46 ? text.slice(0, 45) + '…' : text;
  const cv = document.createElement('canvas');
  const c = cv.getContext('2d')!;
  const font = '600 40px "Be Vietnam Pro", sans-serif';
  c.font = font;
  // ngắt tối đa 2 dòng, mỗi dòng ~520px
  const words = t.split(/\s+/);
  const lines: string[] = [''];
  for (const w of words) {
    const tryLine = lines[lines.length - 1] ? `${lines[lines.length - 1]} ${w}` : w;
    if (c.measureText(tryLine).width > 520 && lines[lines.length - 1]) {
      if (lines.length === 2) {
        lines[1] += '…';
        break;
      }
      lines.push(w);
    } else lines[lines.length - 1] = tryLine;
  }
  const w = Math.ceil(Math.max(...lines.map((l) => c.measureText(l).width))) + 48;
  const h = lines.length * 50 + 40;
  cv.width = w;
  cv.height = h + 16;
  c.font = font;
  roundRect(c, 2, 2, w - 4, h - 4, 26);
  c.fillStyle = '#ffffff';
  c.fill();
  c.strokeStyle = '#f2a7b8';
  c.lineWidth = 4;
  c.stroke();
  c.beginPath();
  c.moveTo(w / 2 - 14, h - 4);
  c.lineTo(w / 2, h + 14);
  c.lineTo(w / 2 + 14, h - 4);
  c.fillStyle = '#ffffff';
  c.fill();
  c.fillStyle = '#4a2a33';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  lines.forEach((l, i) => c.fillText(l, w / 2, 40 + i * 50));
  return cv;
}

