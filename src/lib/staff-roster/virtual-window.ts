/** Fixed-row virtual window math for long preview tables. */
export function virtualWindowRange(
  count: number,
  scrollTop: number,
  rowHeight: number,
  viewportPx: number,
  overscan: number,
) {
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visible = Math.ceil(viewportPx / rowHeight) + overscan * 2;
  const end = Math.min(count, start + visible);
  return {
    start,
    end,
    topPad: start * rowHeight,
    bottomPad: Math.max(0, (count - end) * rowHeight),
    /** True when every row is in the slice — skip maxHeight clipping so none look "missing". */
    fullyInWindow: count === 0 || (start === 0 && end >= count),
  };
}

/**
 * Virtual pads assume a fixed row height. On short lists (e.g. one staff × FEC month ≈ 31)
 * those pads read as missing dates — render the full list instead.
 */
export function shouldVirtualizePreviewRows(
  count: number,
  fullyInWindow: boolean,
  minRowsToVirtualize = 80,
) {
  return count >= minRowsToVirtualize && !fullyInWindow;
}
