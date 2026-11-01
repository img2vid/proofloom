// Vendored language data: Hunspell pairs from the LibreOffice/dictionaries
// repository for languages that have no npm dictionary package, plus
// OpenSubtitles frequency lists (hermitdave/FrequencyWords, CC BY-SA 4.0)
// for new and existing bundled languages.
//
// This module is the single source of truth for the vendored languages:
//   - scripts/build.mjs derives their LANGUAGE_PACKS rows from this table;
//   - "node scripts/vendor-languages.mjs" fetches everything manually;
//   - the build calls ensureVendorAssets() so a plain `npm run build`
//     always produces the full language set when the network allows it
//     (offline builds simply skip what is missing and still succeed).
// The fetched files are gitignored (vendor/dictionaries/, vendor/frequency/)
// because they are large and reproducible; keep fetch-frequency.sh's map in
// sync with FREQUENCY_SOURCES if you edit either.
const LO_RAW = 'https://raw.githubusercontent.com/LibreOffice/dictionaries/master';
const LO_TREE = 'https://github.com/LibreOffice/dictionaries/tree/master';
const FREQUENCY_RAW = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content';

// Vendored Hunspell pairs. `folder` is the upstream directory; `aff`/`dic`
// are stored under normalized index.aff/index.dic names; `extras` ship
// verbatim for license transparency.
export const VENDOR_LANGUAGES = [
  {code: 'af', name: 'Afrikaans', license: 'Free Software (Translate.org.za; see README_af_ZA.txt)', folder: 'af_ZA', aff: 'af_ZA.aff', dic: 'af_ZA.dic', extras: ['README_af_ZA.txt', 'description.xml']},
  {code: 'an', name: 'Aragonese', license: '(MPL-1.1 OR GPL-3.0-or-later OR LGPL-3.0-or-later)', folder: 'an_ES', aff: 'an_ES.aff', dic: 'an_ES.dic', extras: ['LICENSES-en.txt']},
  {code: 'ar', name: 'Arabic', license: '(GPL-2.0 OR LGPL-2.1 OR MPL-1.1)', folder: 'ar', aff: 'ar.aff', dic: 'ar.dic', extras: ['COPYING.txt', 'README_ar.txt']},
  {code: 'as', name: 'Assamese', license: 'GPL-3.0', folder: 'as_IN', aff: 'as_IN.aff', dic: 'as_IN.dic', extras: ['README_as_IN.txt']},
  {code: 'bn', name: 'Bangla', license: 'GPL-2.0-or-later', folder: 'bn_BD', aff: 'bn_BD.aff', dic: 'bn_BD.dic', extras: ['COPYING']},
  {code: 'bo', name: 'Tibetan', license: 'CC0-1.0', folder: 'bo', aff: 'bo.aff', dic: 'bo.dic', extras: ['README.md', 'CHANGELOG.md']},
  {code: 'ckb', name: 'Kurdish (Sorani)', license: 'CC-BY-SA-4.0', folder: 'ckb/dictionaries', aff: 'ckb.aff', dic: 'ckb.dic', extras: ['../LICENSES-en.txt']},
  {code: 'gu', name: 'Gujarati', license: 'GPL-2.0-or-later', folder: 'gu_IN', aff: 'gu_IN.aff', dic: 'gu_IN.dic', extras: ['README_gu_IN.txt']},
  {code: 'gug', name: 'Guarani', license: 'GFDL-1.2-or-later', folder: 'gug', aff: 'gug.aff', dic: 'gug.dic', extras: ['README_th_gug_PY.txt']},
  {code: 'hi', name: 'Hindi', license: 'GPL-2.0-or-later', folder: 'hi_IN', aff: 'hi_IN.aff', dic: 'hi_IN.dic', extras: ['COPYING', 'README_hi_IN.txt']},
  {code: 'id', name: 'Indonesian', license: 'LGPL-2.1-or-later', folder: 'id', aff: 'id_ID.aff', dic: 'id_ID.dic', extras: ['LICENSE-dict', 'README-dict.adoc']},
  {code: 'kmr', name: 'Kurdish (Kurmanji)', license: '(GPL-3.0 OR LGPL-2.1 OR MPL-1.1)', folder: 'kmr_Latn', aff: 'kmr_Latn.aff', dic: 'kmr_Latn.dic', extras: ['license.txt']},
  {code: 'kn', name: 'Kannada', license: 'GPL-2.0-or-later', folder: 'kn_IN', aff: 'kn_IN.aff', dic: 'kn_IN.dic', extras: ['README-kn_IN.txt']},
  {code: 'lij', name: 'Ligurian', license: 'MIT', folder: 'lij_IT', aff: 'lij_IT.aff', dic: 'lij_IT.dic', extras: ['LICENSE_lij_IT.txt']},
  {code: 'mr', name: 'Marathi', license: 'GPL-2.0-or-later', folder: 'mr_IN', aff: 'mr_IN.aff', dic: 'mr_IN.dic', extras: ['COPYING']},
  {code: 'or', name: 'Odia', license: 'Unspecified upstream; redistributed via LibreOffice/dictionaries (see description.xml)', folder: 'or_IN', aff: 'or_IN.aff', dic: 'or_IN.dic', extras: ['description.xml']},
  {code: 'pa', name: 'Punjabi', license: 'Unspecified upstream; redistributed via LibreOffice/dictionaries (see description.xml)', folder: 'pa_IN', aff: 'pa_IN.aff', dic: 'pa_IN.dic', extras: ['description.xml']},
  {code: 'sa', name: 'Sanskrit', license: 'Unspecified upstream; redistributed via LibreOffice/dictionaries (see description.xml)', folder: 'sa_IN', aff: 'sa_IN.aff', dic: 'sa_IN.dic', extras: ['description.xml']},
  {code: 'si', name: 'Sinhala', license: 'GPL-3.0', folder: 'si_LK', aff: 'si_LK.aff', dic: 'si_LK.dic', extras: ['LICENSES-en.txt']},
  {code: 'sq', name: 'Albanian', license: 'GPL-2.0-or-later', folder: 'sq_AL', aff: 'sq_AL.aff', dic: 'sq_AL.dic', extras: ['README.txt']},
  {code: 'sw', name: 'Swahili', license: 'LGPL', folder: 'sw_TZ', aff: 'sw_TZ.aff', dic: 'sw_TZ.dic', extras: ['README_sw_TZ.txt']},
  {code: 'ta', name: 'Tamil', license: 'MPL-1.1', folder: 'ta_IN', aff: 'ta_IN.aff', dic: 'ta_IN.dic', extras: ['COPYING']},
  {code: 'te', name: 'Telugu', license: 'GPL-2.0-or-later', folder: 'te_IN', aff: 'te_IN.aff', dic: 'te_IN.dic', extras: ['README_te_IN.txt']},
];

// OpenSubtitles frequency sources per language code: {src, version} — the
// 2018 dump where available, 2016 for the rest. Variant codes reuse a base
// list (Valencian shares Catalan, pre-reform Russian shares modern Russian,
// Serbian Latin shares the mixed-script Serbian list). Languages absent here
// run without frequency ranking, exactly like before.
export const FREQUENCY_SOURCES = {
  af: {src: 'af', version: '2016'}, ar: {src: 'ar', version: '2018'}, bn: {src: 'bn', version: '2018'},
  'ca-valencia': {src: 'ca', version: '2018'}, 'el-polyton': {src: 'el', version: '2018'}, hi: {src: 'hi', version: '2016'},
  hy: {src: 'hy', version: '2016'}, id: {src: 'id', version: '2018'}, ka: {src: 'ka', version: '2018'},
  mk: {src: 'mk', version: '2018'}, 'ru-petr1708': {src: 'ru', version: '2018'}, si: {src: 'si', version: '2016'},
  sq: {src: 'sq', version: '2018'}, 'sr-latn': {src: 'sr', version: '2018'}, ta: {src: 'ta', version: '2016'},
  te: {src: 'te', version: '2016'},
};

async function fetchFile(url, out, log) {
  const response = await fetch(url, {signal: AbortSignal.timeout(120000)});
  if (!response.ok) throw new Error(`${response.status} for ${url}`);
  const body = Buffer.from(await response.arrayBuffer());
  if (!body.length) throw new Error(`empty body for ${url}`);
  const {writeFileSync, mkdirSync} = await import('node:fs');
  const {dirname} = await import('node:path');
  mkdirSync(dirname(out), {recursive: true});
  writeFileSync(out, body);
  log(`  fetched ${out} (${body.length} bytes)`);
}

async function exists(file) {
  const {existsSync} = await import('node:fs');
  return existsSync(file);
}

// Fetch every missing vendored dictionary pair and every missing frequency
// list the build could use. Idempotent: present files are kept. Individual
// failures are reported and skipped (the build packs only what is present),
// so offline builds degrade gracefully instead of failing.
export async function ensureVendorAssets({log = message => console.log(message)} = {}) {
  const results = {dictionaries: [], frequencies: [], failures: []};
  for (const language of VENDOR_LANGUAGES) {
    const out = `vendor/dictionaries/${language.code}`;
    if (await exists(`${out}/index.aff`) && await exists(`${out}/index.dic`)) continue;
    try {
      await fetchFile(`${LO_RAW}/${language.folder}/${language.aff}`, `${out}/index.aff`, log);
      await fetchFile(`${LO_RAW}/${language.folder}/${language.dic}`, `${out}/index.dic`, log);
      const {writeFileSync} = await import('node:fs');
      writeFileSync(`${out}/manifest.json`, JSON.stringify({
        code: language.code, name: language.name, license: language.license,
        source: `${LO_TREE}/${language.folder}`, upstreamFolder: language.folder,
      }, null, 2) + '\n');
      for (const extra of language.extras) {
        try {
          await fetchFile(`${LO_RAW}/${language.folder}/${extra}`, `${out}/${extra.replace(/^(\.\.\/)+/, '')}`, log);
        } catch { /* license files are best-effort; the manifest always lands */ }
      }
      results.dictionaries.push(language.code);
    } catch (error) {
      results.failures.push(`${language.code} (dictionary: ${error.message})`);
      const {rmSync} = await import('node:fs');
      rmSync(out, {recursive: true, force: true});
    }
  }
  for (const [code, {src, version}] of Object.entries(FREQUENCY_SOURCES)) {
    const out = `vendor/frequency/${code}_50k.txt`;
    if (await exists(out)) continue;
    try {
      await fetchFile(`${FREQUENCY_RAW}/${version}/${src}/${src}_50k.txt`, out, log);
      results.frequencies.push(code);
    } catch (error) {
      results.failures.push(`${code} (frequency: ${error.message})`);
      const {rmSync} = await import('node:fs');
      rmSync(out, {force: true});
    }
  }
  return results;
}

// Manual entry point: node scripts/vendor-languages.mjs
if (process.argv[1] && process.argv[1].endsWith('vendor-languages.mjs')) {
  ensureVendorAssets({log: console.log})
    .then(results => {
      console.log(`Vendored dictionaries fetched: ${results.dictionaries.join(', ') || 'none needed'}`);
      console.log(`Frequency lists fetched: ${results.frequencies.join(', ') || 'none needed'}`);
      if (results.failures.length) console.warn(`Failures (rerun to retry): ${results.failures.join('; ')}`);
    })
    .catch(error => { console.error('Vendor fetch failed:', error.message); process.exitCode = 1; });
}
