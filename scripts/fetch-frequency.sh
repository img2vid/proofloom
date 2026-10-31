#!/usr/bin/env bash
# Download OpenSubtitles top-50k frequency lists (hermitdave/FrequencyWords, CC BY-SA 4.0)
# for every language bundled in Proofloom. Norwegian maps nb/nn -> no, Serbian uses sr (Latin+Cyrillic mix ok).
set -u
cd "$(dirname "$0")/.."
mkdir -p vendor/frequency
BASE="https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018"
declare -A MAP=(
  [bg]=bg [ca]=ca [cs]=cs [da]=da [de]=de [el]=el [eo]=eo [es]=es [et]=et [eu]=eu
  [fa]=fa [fr]=fr [ga]=ga [gl]=gl [he]=he [hr]=hr [hu]=hu [is]=is [it]=it [ko]=ko
  [lt]=lt [lv]=lv [nb]=no [nl]=nl [nn]=no [pl]=pl [pt]=pt [ro]=ro [ru]=ru [sk]=sk
  [sl]=sl [sr]=sr [sv]=sv [tr]=tr [uk]=uk [vi]=vi
)
for code in "${!MAP[@]}"; do
  src="${MAP[$code]}"
  out="vendor/frequency/${code}_50k.txt"
  if [ -s "$out" ]; then echo "keep $out ($(wc -l < "$out") lines)"; continue; fi
  url="$BASE/$src/${src}_50k.txt"
  if curl -fsSL --retry 2 --max-time 60 -o "$out" "$url"; then
    echo "ok   $out <- $url ($(wc -l < "$out") lines)"
  else
    echo "MISS $code ($url)"
    rm -f "$out"
  fi
done
echo "---- summary ----"
ls -la vendor/frequency/ | tail -40
