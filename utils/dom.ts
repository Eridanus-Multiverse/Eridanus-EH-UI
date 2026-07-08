// Install a <style> tag exactly once by id — the shared shape behind six
// hand-rolled copies (WelcomeScreen/StatusStar/ThinkingIndicator/Starfield/
// chat/settings page styles).
export function installStyleOnce(id: string, css: string) {
  if (typeof document === "undefined") return;
  if (document.getElementById(id)) return;
  const el = document.createElement("style");
  el.id = id;
  el.textContent = css;
  document.head.appendChild(el);
}
