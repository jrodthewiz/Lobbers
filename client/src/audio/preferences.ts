let enabled = true;
try { enabled = localStorage.getItem("lobbers-sound") !== "off"; } catch { /* Use sound by default. */ }
export const soundEnabled = (): boolean => enabled;
export function toggleSound(): void {
  enabled = !enabled;
  try { localStorage.setItem("lobbers-sound", enabled ? "on" : "off"); } catch { /* In-session preference is enough. */ }
  window.dispatchEvent(new Event("lobbers:sound"));
}
