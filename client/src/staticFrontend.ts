/** Static hosting needs an explicit HTTP(S) origin; backend availability is not implied. */
export const compatibleRoomServerOrigin = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const origin = value.trim();
  if (!/^https?:\/\/[^/?#\\\s]+\/?$/i.test(origin)) return null;
  try {
    const url = new URL(origin);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
};

export const needsStaticBackendNotice = (mode: string | null, staticFrontend: unknown, serverUrl: unknown): boolean => (
  mode === "artillery" && staticFrontend === "true" && compatibleRoomServerOrigin(serverUrl) === null
);

export const showStaticBackendNotice = (): void => {
  const root = document.querySelector<HTMLElement>("#hud-root");
  if (!root) throw new Error("Missing HUD root.");
  root.className = "static-backend-notice";
  root.style.cssText = "position:fixed;inset:0;display:flex;overflow:auto;padding:24px;box-sizing:border-box;background:#fff8e7;color:#263d38;font:16px/1.6 Arial,sans-serif;pointer-events:auto";
  const main = document.createElement("main");
  main.style.cssText = "width:min(600px,100%);margin:auto";
  main.setAttribute("aria-labelledby", "staticBackendTitle");
  const title = document.createElement("h1");
  title.id = "staticBackendTitle"; title.tabIndex = -1;
  title.textContent = "Online artillery needs a room server";
  const available = document.createElement("p");
  available.textContent = "Doodle Demolition and side-by-side 1v1 on this device are available in this frontend.";
  const explanation = document.createElement("p");
  explanation.textContent = "The room server and peer invitation/signaling service have not been migrated. Online artillery and remote multiplayer are unavailable here without a compatible configured server.";
  const modes = document.createElement("nav");
  modes.setAttribute("aria-label", "Available game modes");
  modes.style.cssText = "display:flex;flex-wrap:wrap;gap:12px;margin-top:24px";
  for (const [label, href] of [["Play Demolition", "?mode=demolition"], ["Local 1v1 (same device)", "?mode=duel"]]) {
    const link = document.createElement("a");
    link.textContent = label!; link.href = href!;
    link.style.cssText = "display:inline-block;color:#263d38;background:#f0c34b;border:2px solid #263d38;border-radius:6px;padding:12px 16px;font-weight:bold";
    modes.append(link);
  }
  main.append(title, available, explanation, modes);
  root.replaceChildren(main);
  title.focus();
};
