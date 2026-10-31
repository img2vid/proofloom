from __future__ import annotations
import json
import re
import unicodedata
from functools import lru_cache
from dataclasses import asdict, dataclass, field
from pathlib import Path
from .voice_catalog import CatalogVoice
from .ipa_pronunciation import display_inline_ipa

@dataclass
class CharacterProfile:
    name: str
    voice: str = ''
    gender: str = 'Unspecified'
    age: str = 'Unspecified'
    language: str = 'auto'
    characteristics: str = 'natural'
    rate: int = 0
    pitch: int = 0
    design_strength: int = 85

@dataclass
class VoiceProject:
    profiles: list[CharacterProfile] = field(default_factory=lambda:[CharacterProfile('Narrator')])
    script: str = ''
    pronunciation_files: list[str] = field(default_factory=list)

    def save(self, destination: str | Path) -> None:
        Path(destination).write_text(json.dumps({'version':1,'script':self.script,'pronunciation_files':self.pronunciation_files,'profiles':[asdict(p) for p in self.profiles]}, ensure_ascii=False, indent=2),encoding='utf-8')

    @classmethod
    def load(cls, source: str | Path) -> 'VoiceProject':
        data = json.loads(Path(source).read_text(encoding='utf-8'))
        if not isinstance(data, dict) or not isinstance(data.get('profiles'), list):
            raise ValueError('Invalid character voice project')
        profiles = [CharacterProfile(**p) for p in data['profiles'] if isinstance(p,dict)]
        for profile in profiles:
            path = Path(profile.voice) if profile.voice else None
            if path is not None and path.suffix.lower() == '.onnx' and not path.is_absolute():
                candidate=(Path(source).parent/path).resolve()
                if candidate.is_file():
                    profile.voice=str(candidate)
        if not profiles or not any(p.name.casefold() == 'narrator' for p in profiles):
            raise ValueError('A Narrator profile is required')
        if len({p.name.casefold() for p in profiles}) != len(profiles):
            raise ValueError('Duplicate character names')
        return cls(profiles, str(data.get('script', '')), [str(p) if Path(p).is_absolute() else str((Path(source).parent / p).resolve()) for p in data.get('pronunciation_files', []) if isinstance(p,str)])

@dataclass(frozen=True)
class SpeechPassage:
    speaker: str
    text: str
    language: str

SCRIPT_RANGES = [
    ('bn', 'Bengali', 0x0980, 0x09FF), ('hi', 'Hindi', 0x0900, 0x097F),
    ('ar', 'Arabic', 0x0600, 0x06FF), ('ru', 'Russian', 0x0400, 0x052F),
    ('el', 'Greek', 0x0370, 0x03FF), ('he', 'Hebrew', 0x0590, 0x05FF),
    ('th', 'Thai', 0x0E00, 0x0E7F), ('ko', 'Korean', 0xAC00, 0xD7AF),
    ('ja', 'Japanese', 0x3040, 0x30FF), ('zh', 'Chinese', 0x4E00, 0x9FFF),
    ('ta', 'Tamil', 0x0B80, 0x0BFF), ('te', 'Telugu', 0x0C00, 0x0C7F),
    ('ml', 'Malayalam', 0x0D00, 0x0D7F), ('gu', 'Gujarati', 0x0A80, 0x0AFF),
    ('pa', 'Punjabi', 0x0A00, 0x0A7F), ('kn', 'Kannada', 0x0C80, 0x0CFF),
]
STOPWORDS = {
    'en': {'the','and','of','in','was','is','with','for','to','you','she','he'},
    'fr': {'le','les','la','des','une','est','dans','pour','avec','vous','elle'},
    'es': {'el','los','las','una','que','del','con','para','como','está'},
    'de': {'der','die','das','ist','mit','und','ein','eine','nicht','ich'},
    'pt': {'uma','que','com','não','para','está','como','dos','das'},
    'it': {'gli','una','che','con','per','non','sono','della'},
    'nl': {'het','een','van','niet','met','voor','zijn','dat'},
}

@lru_cache(maxsize=1)
def _lingua_detector():
    try:
        from lingua import LanguageDetectorBuilder
        return LanguageDetectorBuilder.from_all_languages().with_preloaded_language_models().build()
    except ImportError:
        return None

def detect_language(text: str) -> tuple[str, float]:
    counts = {iso:sum(start<=ord(ch)<=end for ch in text) for iso,_,start,end in SCRIPT_RANGES}
    nonlatin = max(counts, key=counts.get) if counts else 'en'
    significant = sum(unicodedata.category(ch).startswith('L') for ch in text)
    if counts.get(nonlatin,0) >= max(2, significant * .2):
        return nonlatin, round(min(.99, .55 + counts[nonlatin]/max(1,significant)*.4),2)
    if len(text.strip()) >= 25:
        detector = _lingua_detector()
        if detector is not None:
            confident = detector.compute_language_confidence_values(text)
            if confident and confident[0].value >= .45:
                code = confident[0].language.iso_code_639_1
                if code is not None:
                    return code.name.lower(),round(confident[0].value,2)
    words = re.findall(r"[^\W\d_]+",text.casefold(),flags=re.UNICODE)
    scores = {code:sum(w in vocab for w in words) for code,vocab in STOPWORDS.items()}
    selected = max(scores,key=scores.get)
    ordered = sorted(scores.values(),reverse=True)
    if not words or not ordered[0]:
        return 'und', 0.0
    return selected, round(min(.95,.46+(ordered[0]- (ordered[1] if len(ordered)>1 else 0))/max(3,ordered[0])*.4),2)

def detected_languages(text: str) -> list[tuple[str,float]]:
    blocks = re.split(r'\n\s*\n',text)
    detected = [detect_language(b) for b in blocks if b.strip()]
    seen = {}
    for lang,confidence in detected:
        if lang != 'und':
            seen[lang] = max(seen.get(lang,0),confidence)
    return sorted(seen.items(),key=lambda item:-item[1])

def parse_passages(text: str, profiles: list[CharacterProfile], *, auto_tag: bool=False) -> list[SpeechPassage]:
    names = {p.name.casefold():p.name for p in profiles}
    current = names.get('narrator','Narrator')
    passages: list[SpeechPassage] = []
    inline = re.compile(r'^\s*([^:\n]{1,60}):\s*(.+)$')
    tags = re.compile(r'\[([^\[\]\n]{1,60})\]')
    def append(content: str):
        if content.strip():
            language,_ = detect_language(display_inline_ipa(content))
            passages.append(SpeechPassage(current,content.strip(),language))
    for line in text.splitlines():
        content = line.strip()
        if not content:
            continue
        match = inline.match(content)
        if match and match.group(1).strip().casefold() in names:
            current = names[match.group(1).strip().casefold()]
            content = match.group(2).strip()
        elif auto_tag:
            attributed = re.search(r'\b([\w-]{2,35})\s+(?:said|asked|replied|whispered|shouted|answered|murmured)\b', content, re.I)
            if attributed and attributed.group(1).casefold() in names:
                current = names[attributed.group(1).casefold()]
            elif not content.startswith(('“','"',"'")):
                current = names.get('narrator','Narrator')
        position=0
        for tag in tags.finditer(content):
            who = names.get(tag.group(1).strip().casefold())
            if who is None:
                continue
            append(content[position:tag.start()])
            current=who
            position=tag.end()
        append(content[position:])
    return passages

def auto_profiles(text: str, *, installed: list[str] | None=None, catalog: list[CatalogVoice] | None=None) -> VoiceProject:
    installed=installed or []
    names=['Narrator'] + detect_characters(text)
    languages=detected_languages(text)
    code=languages[0][0] if languages else 'auto'
    provisional=[CharacterProfile(n) for n in names]
    passages=parse_passages(text,provisional,auto_tag=True)
    assigned=set()
    profiles=[]
    for name in names:
        own=' '.join(x.text for x in passages if x.speaker.casefold()==name.casefold())
        local,_=detect_language(own)
        p=CharacterProfile(name,language=local if local!='und' else code)
        matches=[v for v in installed if p.language=='auto' or v.replace('_','-').casefold().startswith(p.language.replace('_','-').split('-')[0].casefold())]
        if not matches:
            matches=installed
        available=[v for v in matches if v not in assigned]
        if available:
            p.voice=available[0]
            assigned.add(p.voice)
        elif matches:
            p.voice=matches[len(profiles)%len(matches)]
        elif catalog:
            picks=recommend_voices(p,catalog,used=assigned)
            if picks:
                p.voice=picks[0].key
                assigned.add(p.voice)
        profiles.append(p)
    return VoiceProject(profiles,text)

def detect_characters(text: str) -> list[str]:
    candidates = re.findall(r'(?<!\w)([\w][\w\'-]{1,35})\s+(?:said|asked|replied|whispered|shouted|answered|murmured)\b',text,re.I)
    tags = re.findall(r'\[([^\[\]\n]{1,60})\]',text,re.M)
    exclude = {'i','he','she','they','we','it','someone','the','who','narrator'}
    return list(dict.fromkeys(name for name in tags+candidates if name.casefold() not in exclude and name[0].isupper()))

def recommend_voices(profile: CharacterProfile, catalog: list[CatalogVoice], *, used: set[str] | None=None, limit: int=5) -> list[CatalogVoice]:
    language = profile.language if profile.language!='auto' else 'en'
    family = language.replace('_','-').split('-')[0]
    choices = [v for v in catalog if v.language.split('-')[0].casefold()==family.casefold()]
    quality = {'high':0,'medium':1,'low':2,'x_low':3}
    used = used or set()
    return sorted(choices,key=lambda v:(v.key in used, v.language.casefold()!=language.casefold(),quality.get(v.quality,3),v.key))[:limit]
