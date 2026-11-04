// TailAdmin dark variant is class-based (.dark); mirror prefers-color-scheme, which main.js drives via nativeTheme.
// Loaded synchronously in <head> so the first paint already has the right theme.
(() => {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const sync = () => document.documentElement.classList.toggle('dark', mq.matches);
  sync();
  mq.addEventListener('change', sync);
  // Electron titleBarOverlay (Windows) exposes Window Controls Overlay; the header pads for the caption buttons.
  if (navigator.windowControlsOverlay?.visible) document.documentElement.classList.add('wco');
})();
