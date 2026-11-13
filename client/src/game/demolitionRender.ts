/** Paper/ink presentation only; positions and awarded target states come from the game. */
export type DemolitionPieceAppearance = {
  body: { position: { x: number; y: number }; angle: number };
  w: number;
  h: number;
  color: string;
  kind: "brick" | "tank" | "plank";
  target: boolean;
  hit: boolean;
  label: string | undefined;
  toughness?: number;
  toughnessMax?: number;
};
export type DemolitionView = { scale: number; cameraX: number; worldOriginY: number };
const INK = "#263d38";
const PAPER = "#fff8e7";
export const TARGET_BADGE_RADIUS = 15; // CSS pixels, independent of world scale and device-pixel ratio.
export const TARGET_BADGE_GAP = 5;
export const TARGET_BADGE_STROKE_WIDTH = 2.5;
const PIECE_STROKE_WIDTH = 2.5;

/** Fixed cost: two paper-edge fills, at most four hatch segments, or two water glints. */
export const drawDemolitionPiece = (ctx: CanvasRenderingContext2D, piece: DemolitionPieceAppearance): void => {
  ctx.save();
  try {
    ctx.translate(piece.body.position.x, piece.body.position.y);
    ctx.rotate(piece.body.angle);
    ctx.fillStyle = piece.hit ? "#f0c34b" : piece.color;
    ctx.fillRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    ctx.fillStyle = "#fff8e74d";
    ctx.fillRect(-piece.w / 2 + 3, -piece.h / 2 + 3, Math.max(0, piece.w - 6), Math.min(4, Math.max(0, piece.h - 6)));
    ctx.fillStyle = "#263d381f";
    ctx.fillRect(-piece.w / 2 + 3, piece.h / 2 - 6, Math.max(0, piece.w - 6), 3);
    ctx.strokeStyle = INK;
    ctx.lineWidth = PIECE_STROKE_WIDTH;
    ctx.strokeRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
    if (piece.kind === "tank") {
      ctx.fillStyle = "#237f8780";
      ctx.fillRect(-piece.w / 2 + 5, 0, piece.w - 10, piece.h / 2 - 5);
      ctx.strokeStyle = "#237f87"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-piece.w / 2 + 6, 0); ctx.lineTo(piece.w / 2 - 6, 0); ctx.stroke();
      ctx.fillStyle = "#fff8e780";
      ctx.fillRect(-piece.w / 2 + 10, 10, 22, 3);
      ctx.fillRect(-piece.w / 2 + 10, 18, 12, 2);
    } else if (piece.kind === "plank" || (piece.color === "#d75c46" && piece.w <= 30)) {
      ctx.strokeStyle = "#263d3855"; ctx.lineWidth = 1;
      ctx.beginPath();
      if (piece.kind === "plank") {
        for (let i = -1; i <= 1; i++) {
          ctx.moveTo(-piece.w / 2 + 6, i * piece.h * .15);
          ctx.lineTo(piece.w / 2 - 6, i * piece.h * .15);
        }
      } else {
        for (let i = 0; i < 4; i++) {
          const y = -piece.h / 2 + 10 + i * (piece.h - 20) / 3;
          ctx.moveTo(-piece.w / 2 + 5, y + 3); ctx.lineTo(piece.w / 2 - 5, y - 3);
        }
      }
      ctx.stroke();
    } else if (piece.w > 80) {
      for (let i = -1; i <= 1; i++) {
        ctx.fillStyle = PAPER;
        ctx.fillRect(i * 35 - 9, -10, 18, 22);
        ctx.strokeRect(i * 35 - 9, -10, 18, 22);
      }
    }
    if ((piece.toughnessMax ?? 0) > 0 && (piece.toughness ?? 0) > 0) {
      ctx.fillStyle = INK;
      ctx.fillRect(-piece.w / 2 + 3, -piece.h / 2 + 3, Math.max(0, piece.w - 6), 5);
      ctx.fillStyle = "#b98ac6";
      const ratio = Math.max(0, Math.min(1, piece.toughness! / piece.toughnessMax!));
      ctx.fillRect(-piece.w / 2 + 4, -piece.h / 2 + 4, Math.max(0, piece.w - 8) * ratio, 3);
    }
    if (piece.label) {
      ctx.fillStyle = INK; ctx.font = "bold 10px Arial"; ctx.textAlign = "center";
      ctx.fillText(piece.label, 0, 23);
    }
  } finally { ctx.restore(); }
};

export const resolveDemolitionTargetBadge = (piece: DemolitionPieceAppearance, view: DemolitionView) => {
  if (!piece.target) return null;
  // Expand local rectangle corners by the mitered ink stroke before rotating.
  const halfHeight = Math.abs(Math.sin(piece.body.angle)) * (piece.w + PIECE_STROKE_WIDTH) / 2
    + Math.abs(Math.cos(piece.body.angle)) * (piece.h + PIECE_STROKE_WIDTH) / 2;
  const bodyTop = (piece.body.position.y - halfHeight) * view.scale + view.worldOriginY;
  return {
    x: (piece.body.position.x - view.cameraX) * view.scale,
    y: bodyTop - TARGET_BADGE_GAP - TARGET_BADGE_RADIUS - TARGET_BADGE_STROKE_WIDTH / 2,
    radius: TARGET_BADGE_RADIUS,
    glyph: piece.hit ? "✓" : "★",
    fill: piece.hit ? PAPER : "#d75c46",
    glyphColor: piece.hit ? INK : PAPER,
  };
};

/** Call in the CSS-coordinate overlay after the complete world layer has been restored. */
export const drawDemolitionTargetBadge = (ctx: CanvasRenderingContext2D, piece: DemolitionPieceAppearance, view: DemolitionView): void => {
  const badge = resolveDemolitionTargetBadge(piece, view);
  if (!badge) return;
  ctx.save();
  try {
    ctx.fillStyle = badge.fill; ctx.strokeStyle = INK; ctx.lineWidth = TARGET_BADGE_STROKE_WIDTH;
    ctx.beginPath(); ctx.arc(badge.x, badge.y, badge.radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = badge.glyphColor; ctx.font = "bold 17px Arial";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(badge.glyph, badge.x, badge.y);
  } finally { ctx.restore(); }
};
