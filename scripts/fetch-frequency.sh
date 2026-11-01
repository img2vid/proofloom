#!/usr/bin/env bash
# Download OpenSubtitles top-50k frequency lists (hermitdave/FrequencyWords, CC BY-SA 4.0)
# for every language bundled in Proofloom. Norwegian maps nb/nn -> no, Serbian uses sr (Latin+Cyrillic mix ok).
# The 2018 dump is preferred; languages only present in the older 2016 dump fall back to it.
# scripts/vendor-languages.mjs performs the same fetch during `npm run build` — keep its
# FREQUENCY_SOURCES map in sync with the MAP below.
set -u
cd "$(dirname "$0")/.."
mkdir -p vendor/frequency
declare -A MAP=(
  [bg]=bg [ca]=ca [cs]=cs [da]=da [de]=de [el]=el [eo]=eo [es]=es [et]=et [eu]=eu
  [fa]=fa [fr]=fr [ga]=ga [gl]=gl [he]=he [hr]=hr [hu]=hu [is]=is [it]=it [ko]=ko
  [lt]=lt [lv]=lv [nb]=no [nl]=nl [nn]=no [pl]=pl [pt]=pt [ro]=ro [ru]=ru [sk]=sk
  [sl]=sl [sr]=sr [sv]=sv [tr]=tr [uk]=uk [vi]=vi
  [af]=af [ar]=ar [bn]=bn [hi]=hi [hy]=hy [id]=id [ka]=ka [mk]=mk [si]=si [sq]=sq [ta]=ta [te]=te
  [ca-valencia]=ca [el-polyton]=el [ru-petr1708]=ru [sr-latn]=sr
)
for code in "${!MAP[@]}"; do
  src="${MAP[$code]}"
  out="vendor/frequency/${code}_50k.txt"
  if [ -s "$out" ]; then echo "keep $out ($(wc -l < "$out") lines)"; continue; fi
  fetched=""
  for version in 2018 2016; do
    url="https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/$version/$src/${src}_50k.txt"
    if curl -fsSL --retry 2 --max-time 60 -o "$out" "$url"; then
      echo "ok   $out <- $version ($(wc -l < "$out") lines)"; fetched="yes"; break
    fi
    rm -f "$out"
  done
  [ -z "$fetched" ] && echo "MISS $code"
done
echo "---- summary ----"
ls -la vendor/frequency/ | tail -60
