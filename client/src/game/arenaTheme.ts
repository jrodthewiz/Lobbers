export const ARENA_THEMES = [
  { id: "garden", label: "Sunday club", icon: "☀", sky: ["#a4d7d5", "#d9eacb", "#f7e9ba"], sun: "#f2ca61", cloud: "#fff9e7", far: "#a5bf95", near: "#7fa585", soil: 0x957953, turf: 0x8fa66b },
  { id: "sunset", label: "Golden grudge", icon: "◒", sky: ["#b883b6", "#f2b39a", "#ffe2a4"], sun: "#ffdb83", cloud: "#fff0d7", far: "#b38d9c", near: "#8b7f91", soil: 0x966e65, turf: 0xd4b079 },
  { id: "moon", label: "Moon mayhem", icon: "☾", sky: ["#202b50", "#46567d", "#a4b2b4"], sun: "#fff1c7", cloud: "#bac6d8", far: "#64718e", near: "#4c6679", soil: 0x655c79, turf: 0x91b4ae },
] as const;
export type ArenaTheme = typeof ARENA_THEMES[number];
let sessionTheme: ArenaTheme | null = null;
export function readArenaTheme(): ArenaTheme {
  if (sessionTheme) return sessionTheme;
  let id = "garden";
  try { id = localStorage.getItem("lobbers-arena") ?? id; } catch { /* Storage is optional. */ }
  sessionTheme = ARENA_THEMES.find(theme => theme.id === id) ?? ARENA_THEMES[0];
  return sessionTheme;
}
export function selectArenaTheme(id: string): void {
  const theme = ARENA_THEMES.find(theme => theme.id === id) ?? ARENA_THEMES[0];
  sessionTheme = theme;
  try { localStorage.setItem("lobbers-arena", theme.id); } catch { /* Keep in-session selection. */ }
  document.documentElement.dataset.arena = theme.id;
  window.dispatchEvent(new CustomEvent("lobbers:arena", { detail: theme.id }));
}
