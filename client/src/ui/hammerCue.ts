export const HAMMER_ACCESSIBLE_LABEL = "Hold to charge hammer; release to swing";

/** Existing button only: CSS fill is decorative; the accessible name never chatters with charge. */
export const updateHammerCue = (button: HTMLButtonElement | null, charging: boolean, charge: number): void => {
  if (!button) return;
  const percent = charging ? Math.round(Math.max(0, Math.min(1, Number.isFinite(charge) ? charge : 0)) * 100) : 0;
  const label = charging ? `Release ${percent}%` : "Hold → HAMMER";
  if (button.textContent !== label) button.textContent = label;
  const active = String(charging);
  if (button.dataset.charging !== active) button.dataset.charging = active;
  const fill = `${percent}%`;
  if (button.style.getPropertyValue("--hammer-charge") !== fill) button.style.setProperty("--hammer-charge", fill);
  if (button.getAttribute("aria-label") !== HAMMER_ACCESSIBLE_LABEL) button.setAttribute("aria-label", HAMMER_ACCESSIBLE_LABEL);
};
