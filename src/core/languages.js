// Resolve which bundled dictionary serves a BCP-47 language tag.
// Shared by the checker worker, the build, and the tests so the mapping
// stays identical everywhere. `bundled` is meta.json's languages array.
export function bundledVariant(language, bundled = []) {
  const tag = String(language || '').trim();
  const lower = tag.toLowerCase() || 'en-us';
  if (/^en-(gb|in|au|nz|ie)/.test(lower)) return {variant: 'en-GB'};
  if (lower.startsWith('en')) return {variant: 'en-US'};
  let base = lower.split('-')[0];
  try { base = new Intl.Locale(tag || 'en').language.toLowerCase(); } catch { /* already the base */ }
  const entry = bundled.find(l => l.code === lower) || bundled.find(l => l.code === base);
  return entry ? {variant: entry.code, bundled: true} : {variant: `none:${base}`};
}
