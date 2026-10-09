/**
 * About basket — static page, mounted for soft navigation.
 */
let activeCleanup = null;

export function mount() {
  if (activeCleanup) {
    try { activeCleanup(); } catch (_) {}
    activeCleanup = null;
  }
  const root = document.querySelector(".about-page");
  if (!root) return function () {};

  function cleanup() {}
  activeCleanup = cleanup;
  return cleanup;
}
