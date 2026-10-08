import { normalizeAimForSide } from "../../../shared/game/math";
import type { Side, Vec2 } from "../../../shared/game/types";

export const AIM_DRAG_DEADZONE_PX = 14;

type PointerAimInput = {
  pointer: Vec2;
  shoulder: Vec2;
  side: Side;
  currentAim: Vec2;
  dragStart: Vec2 | null;
  isCharging: boolean;
};

export const resolveDirectPointerAim = (pointer: Vec2, shoulder: Vec2, side: Side): Vec2 => {
  return normalizeAimForSide(
    {
      aimX: pointer.x - shoulder.x,
      aimY: pointer.y - shoulder.y,
    },
    side,
  );
};

export const resolveSlingshotDragAim = (
  pointer: Vec2,
  dragStart: Vec2,
  side: Side,
  fallbackAim: Vec2,
): Vec2 => {
  const aimX = dragStart.x - pointer.x;
  const aimY = dragStart.y - pointer.y;
  if (Math.hypot(aimX, aimY) < AIM_DRAG_DEADZONE_PX) {
    return normalizeAimForSide({ aimX: fallbackAim.x, aimY: fallbackAim.y }, side);
  }
  return normalizeAimForSide({ aimX, aimY }, side);
};

export const resolveSlingshotPullAnchor = (
  hand: Vec2,
  aim: Vec2,
  pullDistance: number,
  maxDistance = 120,
): Vec2 => {
  const distance = Math.min(maxDistance, Math.max(0, pullDistance));
  const aimLength = Math.hypot(aim.x, aim.y);
  if (distance <= 0.001 || aimLength <= 0.001) return hand;
  const pullX = -aim.x / aimLength;
  const pullY = -aim.y / aimLength;
  return {
    x: hand.x + (pullX * distance),
    y: hand.y + (pullY * distance),
  };
};

export const resolvePointerAim = ({
  pointer,
  shoulder,
  side,
  currentAim,
  dragStart,
  isCharging,
}: PointerAimInput): Vec2 => {
  if (isCharging && dragStart) {
    return resolveSlingshotDragAim(pointer, dragStart, side, currentAim);
  }
  return resolveDirectPointerAim(pointer, shoulder, side);
};
