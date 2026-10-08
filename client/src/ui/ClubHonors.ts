import type { GameSnapshot, PlayerView } from "../game/viewModel";

type ClubRecord = { wins: number; matches: number; best: number };
export class ClubHonors {
  private settled = false;
  private record: ClubRecord = { wins: 0, matches: 0, best: 0 };
  constructor(private readonly root: HTMLElement) {
    try {
      const saved = JSON.parse(localStorage.getItem("lobbers-club-record") ?? "null");
      if (saved && [saved.wins, saved.matches, saved.best].every(n => Number.isFinite(n) && n >= 0)) this.record = saved;
    } catch { /* A private browser still gets the full game. */ }
    this.renderRecord();
  }
  update(snapshot: GameSnapshot, local: PlayerView | null, damage: number, shots: number, longest: number): void {
    if (!local || snapshot.roundState === "waiting" || snapshot.roundState === "countdown") this.settled = false;
    if (snapshot.roundState !== "ended" || !local) return;
    const win = snapshot.winnerSide === local.side;
    const badge = win && local.hp <= 20 ? ["COMEBACK KID", "Won with 20 HP or less. Nerves of paper. Outside voice of steel."]
      : win && local.hp === 100 ? ["UNTOUCHABLE", "A clean win. Your tank still has that new-tank smell."]
      : damage >= 80 ? ["WRECKING CREW", "80+ damage dealt. The neighborhood has questions."]
      : longest >= 150 ? ["AIR MAIL", "A 150 m lob. Postage definitely not included."]
      : shots >= 5 ? ["CHAOS CONTRIBUTOR", "Five shots or more. Doing your part for the crater economy."]
      : win ? ["BACKYARD CHAMP", "One tiny tank. One enormous victory."]
      : ["HONORARY MENACE", "The club respects the attempt. The fence less so."];
    const title = this.root.querySelector("#honorTitle");
    const detail = this.root.querySelector("#honorDetail");
    if (title) title.textContent = badge[0]!;
    if (detail) detail.textContent = badge[1]!;
    if (!this.settled) {
      this.settled = true;
      this.record.matches++; if (win) this.record.wins++;
      this.record.best = Math.max(this.record.best, longest);
      try { localStorage.setItem("lobbers-club-record", JSON.stringify(this.record)); } catch { /* Session record remains available. */ }
      this.renderRecord();
    }
  }
  private renderRecord(): void {
    const label = this.root.querySelector("#clubRecord");
    if (label) label.textContent = this.record.matches > 0 ? `YOUR CLUB RECORD · ${this.record.wins} W / ${this.record.matches} PLAYED · BEST ${this.record.best.toFixed(0)} m` : "CLUB MEMBERSHIP: QUESTIONABLE JUDGMENT REQUIRED";
  }
}
