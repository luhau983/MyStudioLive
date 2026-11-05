// Trang nào đang mở?
//   /overlay.html (hoặc /?view=stage) -> trang lên live (1080x1920), DUY NHẤT trang này phát tiếng
//   /overlay.html?silent=1 / ?mute=1  -> khung xem trước trong MyStudioLive: chạy cảnh nhưng im lặng
//   /control.html (hoặc /)            -> bảng điều khiển, im lặng, mở bao nhiêu tab cũng được
const params = new URLSearchParams(window.location.search);
export const IS_STAGE = params.get('view') === 'stage' || window.location.pathname.endsWith('/overlay.html');
// khung xem trước im lặng: không giành quyền phát tiếng của trang live thật
export const IS_SILENT = IS_STAGE && (params.get('silent') === '1' || params.get('mute') === '1');
// bảng điều khiển nhúng trong MyStudioLive: app đã có khung xem trước riêng nên bỏ bản xem trước 3D thứ hai
export const IS_EMBEDDED = window.location.pathname.endsWith('/control.html');
// mã riêng của trang stage này: server chỉ cho trang stage mở sau cùng phát tiếng
export const STAGE_ID = IS_STAGE && !IS_SILENT ? Math.random().toString(36).slice(2, 10) : '';

// Kích thước thiết kế của stage. Mọi thứ trên stage vẽ theo khung 1080x1920 rồi tự co giãn.
export const STAGE_W = 1080;
export const STAGE_H = 1920;

// Gửi lệnh từ trang điều khiển tới trang stage
export async function sendControl(action: string, text?: string) {
  const r = await fetch('/api/control', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, text }),
  });
  return r.json();
}

// Giả lập sự kiện để test khi chưa live
export async function emitTest(type: string, data: Record<string, unknown>) {
  await fetch('/api/test/emit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, data }),
  });
}

// MyStudioLive đổi cảnh khác: trang live quay về cảnh chung của app (chỉ trang được app chuyển hướng tới, có ?sl=1)
export function navigateToStudio(port: unknown) {
  if (!params.has('sl') || !Number.isInteger(port)) return;
  const q = new URLSearchParams(window.location.search);
  q.delete('sl');
  q.delete('silent');
  const s = q.toString().replace(/=(&|$)/g, '$1');
  window.location.replace(`${window.location.protocol}//${window.location.hostname}:${port}/${s ? '?' + s : ''}`);
}
