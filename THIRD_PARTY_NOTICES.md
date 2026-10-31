# Open-source credits and data attribution

Proofloom is built with open-source libraries and data. Their licenses are not replaced by the MIT license on the original application code. A build copies dependency license files to `dist/licenses/`; the machine-readable index is `dist/licenses/index.json`.

| Component | Source | License / purpose |
| --- | --- | --- |
| nspell 2.1.5 | https://github.com/wooorm/nspell | MIT; Hunspell-like spelling and suggestions |
| dictionary-en 4.0.0 | https://github.com/wooorm/dictionaries/tree/main/dictionaries/en | Dictionary/affixes MIT AND BSD; packaging MIT; English dictionary based on SCOWL / wordlist.aspell.net |
| dictionary-en-gb 3.0.0 | https://github.com/wooorm/dictionaries/tree/main/dictionaries/en-gb | Dictionary/affixes MIT AND BSD; packaging MIT; British English spelling |
| @cspell/dict-en-common-misspellings 2.2.0 | https://github.com/streetsidesoftware/cspell-dicts/tree/main/dictionaries/en-common-misspellings | **CC BY-SA 4.0**; spelling-correction data |
| JSZip 3.10.1 | https://github.com/Stuk/jszip | MIT OR GPL-3.0-or-later; used under MIT; archive reading and generation |
| Mammoth 1.11.0 | https://github.com/mwilliamson/mammoth.js | BSD-2-Clause; DOCX text extraction |
| PDF.js 4.10.38 | https://github.com/mozilla/pdf.js | Apache-2.0; PDF text extraction and rendering |
| Tesseract.js 6.0.1 and core 6.0.0 | https://github.com/naptha/tesseract.js | Apache-2.0; browser OCR API and engine |
| @tesseract.js-data/eng 1.0.0 | https://github.com/naptha/tessdata | Apache-2.0; bundled English recognition model; retain package notices |
| DM Sans | https://github.com/googlefonts/dm-fonts | SIL Open Font License 1.1; UI font, packaged by Fontsource |
| Newsreader | https://github.com/productiontype/Newsreader | SIL Open Font License 1.1; reading font, packaged by Fontsource |
| esbuild 0.25.5 | https://github.com/evanw/esbuild | MIT; build-time bundler |

## CSpell spelling data: attribution and transformation

Credit: Street Side Software, CSpell dictionary contributors, and contributors to the English Wikipedia lists of common misspellings.

Upstream package: `@cspell/dict-en-common-misspellings@2.2.0`. Upstream identifies its references as:

- https://en.wikipedia.org/wiki/Wikipedia:Lists_of_common_misspellings/For_machines
- https://en.wikipedia.org/wiki/Wikipedia:Lists_of_common_misspellings
- https://github.com/streetsidesoftware/cspell-dicts/tree/main/dictionaries/en-common-misspellings

Proofloom's build transforms the general-English `suggestWords` and `flagWords` arrays into a JSON object mapping lowercased misspellings to suggested replacements. Whitespace-containing source keys, extreme key lengths, and entries without a target are excluded. Replacement alternatives are split on commas. No endorsement by the upstream contributors is implied.

The resulting `dist/data/corrections.json` adaptation is distributed under **Creative Commons Attribution-ShareAlike 4.0 International**, not the application MIT license. Keep this attribution and the upstream license when sharing it or adaptations. The complete CC BY-SA 4.0 text is copied to `dist/licenses/@cspell--dict-en-common-misspellings--LICENSE`.

License: https://creativecommons.org/licenses/by-sa/4.0/

## Additional dependencies

The package lock records exact resolved dependencies. The build collects license files for installed packages, including transitive dependencies. Some components bundle additional notices internally. Retain generated `.LEGAL.txt` files and the `licenses/` directory with deployment assets. The Fontsource package data and English dictionary source licenses are also included.

## Optional external grammar service

LanguageTool is a separate service, not bundled server software. Its name and links identify the optional compatible provider. Users must operate or license their own endpoint and follow its terms. See https://dev.languagetool.org/http-server and https://dev.languagetool.org/public-http-api.html. The application does not automatically call the public free endpoint.
