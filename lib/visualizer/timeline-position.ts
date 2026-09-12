/** Evenly-spaced ordinal position (0-100) for `index` among `count` items --
 * rank-based, not proportional to any year value (sortYear placeholders for
 * undated events carry no real chronological distance). */
export function scrubberPercent(index: number, count: number): number {
  if (count <= 1) return 0;
  return (index / (count - 1)) * 100;
}

/** Nearest ordinal index for a pointer/click at `clientX` along a track
 * spanning `rect.left` to `rect.left + rect.width`. Clamped to [0, count-1]. */
export function scrubberIndexAtClientX(clientX: number, rect: { left: number; width: number }, count: number): number {
  if (count <= 1) return 0;
  const ratio = rect.width <= 0 ? 0 : Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  return Math.round(ratio * (count - 1));
}
