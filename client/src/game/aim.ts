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

export const resolvePointerAim = ({
  pointer,
  shoulder,
  side,
  currentAim: _currentAim,
  dragStart: _dragStart,
  isCharging: _isCharging,
}: PointerAimInput): Vec2 => {
  return resolveDirectPointerAim(pointer, shoulder, side);
};
