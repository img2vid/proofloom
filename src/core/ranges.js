// Protected ranges: URLs, emails, inline code, and fenced code blocks are
// never corrected.
export function protectedRangesInternal(text) {
  return [...text.matchAll(/```[\s\S]*?(?:```|$)|`[^`\n]+`|https?:\/\/[^\s<>]+|\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu)].map(m => [m.index, m.index + m[0].length]);
}

export function inProtected(start, end, ranges) {
  return ranges.some(([a, b]) => start < b && end > a);
}
