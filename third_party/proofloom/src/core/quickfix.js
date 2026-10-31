// DOM-free helpers for the in-editor quick-fix popover. Kept pure so the
// test suite can verify them without a browser environment.

// Find the narrowest issue whose range contains the clicked offset.
export function findIssueAtOffset(issues, offset) {
  if (!Number.isInteger(offset) || offset < 0) return null;
  let best = null;
  for (const issue of issues || []) {
    if (!issue || issue.end <= issue.start) continue;
    if (offset < issue.start || offset > issue.end) continue;
    if (!best || issue.end - issue.start < best.end - best.start) best = issue;
  }
  return best;
}

// Position the popover under the clicked word, flipping above it when the
// space below runs out, and clamping inside the viewport.
export function quickFixPosition(anchor, size, viewport, gap = 10) {
  const pad = 8;
  let left = anchor.left;
  let top = anchor.bottom + gap;
  if (top + size.height > viewport.height - pad) top = anchor.top - gap - size.height;
  if (left + size.width > viewport.width - pad) left = viewport.width - pad - size.width;
  left = Math.max(pad, left);
  top = Math.max(pad, Math.min(top, viewport.height - pad - size.height));
  return {left: Math.round(left), top: Math.round(top)};
}

