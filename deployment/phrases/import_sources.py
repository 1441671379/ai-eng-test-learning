"""Extract the user's PDF wordlists by their real column/font hierarchy.

Run with a document-tools Python (pdfplumber), not the inference environment.
Only list data is imported. Document prose is never executed as instructions.
"""
from pathlib import Path
from collections import Counter
import argparse
import hashlib
import json
import re
import pdfplumber

ROOT = Path(__file__).resolve().parents[2]


def clean(text):
    return re.sub(r"\s+", " ", text).strip()


def key(text):
    return clean(text).lower().replace("’", "'").replace("…", "...")


def pte_entries(path):
    entries = []
    head = None
    next_number = 1
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages[4:]:
            for left, right in ((110, 285), (370, 555)):
                pending = ""
                pending_chars = []
                # Head rows at the top of either column start around y=20.
                # Cropping at35 kept their children but inherited the prior head.
                for row in page.crop((left, 15, right, 790)).extract_text_lines():
                    chars = [c for c in row["chars"] if abs(c["size"] - 10) < .15]
                    if not chars:
                        continue
                    text = clean(pending + " " + row["text"])
                    chars = pending_chars + chars
                    pos = re.search(r"\((adj|adv|n|v|vpp|prep)\)\s*$", text)
                    if not pos:
                        pending, pending_chars = text, chars
                        continue
                    pending, pending_chars = "", []
                    component = clean(text[:pos.start()])
                    italic = sum("Italic" in c["fontname"] for c in chars) > len(chars) / 2
                    if not italic:
                        head = (component, pos[1])
                        number = page.crop((left - 60, max(0, row["top"] - 1), left - 5, row["bottom"] + 3)).extract_text().strip()
                        if number.isdigit():
                            next_number = int(number)
                    else:
                        if head is None:
                            raise ValueError(f"Missing PTE head on page {page.page_number}: {text}")
                        phrase = head[0] + " " + component
                        entries.append({"phrase": phrase, "level": None, "pattern": head[1] + "+" + pos[1],
                                        "variants": [], "source": {"book": "pte", "page": page.page_number,
                                        "number": next_number, "components": [head[0], component]}})
                        next_number += 1
                if pending:
                    raise ValueError(f"Unparsed PTE row on page {page.page_number}: {pending}")
    numbers = [e["source"]["number"] for e in entries]
    # This supplied 2026 PDF jumps from the 26-item significant group (2061–2086)
    # to significantly at 2088. Preserve the actual rows; never invent number 2087.
    if len(entries) != 2468 or len(set(numbers)) != len(numbers) or set(range(1, 2470)) - set(numbers) != {2087}:
        raise ValueError(f"Unexpected PTE extraction or numbering: {len(entries)} rows")
    return entries


def oxford_entries(path):
    entries, level, current = [], None, None
    with pdfplumber.open(path) as pdf:
        for page in pdf.pages:
            for left, right in ((42, 169), (173, 300), (303, 430), (434, 562)):
                for row in page.crop((left, 125 if page.page_number == 1 else 42, right, 790)).extract_text_lines():
                    text = clean(row["text"])
                    if text in ("A1", "A2", "B1", "B2", "C1"):
                        level = text
                        continue
                    chars = [c for c in row["chars"] if abs(c["size"] - 9) < .15 and "MyriadPro" in c["fontname"]]
                    if not chars:
                        continue
                    primary = row["x0"] < left + 3 and any("Regular" in c["fontname"] for c in chars)
                    if primary:
                        if not level:
                            raise ValueError("Oxford level missing")
                        current = {"phrase": text, "level": level, "pattern": "expression", "variants": [],
                                   "source": {"book": "oxford", "page": page.page_number, "number": len(entries) + 1}}
                        entries.append(current)
                    elif current:
                        # Keep subsidiary forms/examples with their head; not as independent 750-list items.
                        if row["x0"] < left + 3 and current["variants"]:
                            current["variants"][-1] += " " + text
                        else:
                            current["variants"].append(text)
    if len(entries) != 750:
        raise ValueError(f"Expected 750 Oxford heads; found {len(entries)}")
    return entries


def build(oxford, pte, destination):
    indexed = {}
    # Source positions are stable even when an import spelling is corrected.
    # Reimporting must not orphan existing private FSRS/saved-entry records.
    previous = json.loads(destination.read_text(encoding='utf-8')) if destination.exists() else {}
    prior_by_source = {(s['book'],s['number']):e for e in previous.get('entries',[]) for s in e.get('sources',[])}
    rows = oxford_entries(oxford) + pte_entries(pte)
    for row in rows:
        normalized = key(row["phrase"])
        if normalized not in indexed:
            prior=prior_by_source.get((row['source']['book'],row['source']['number']))
            indexed[normalized] = {"id": prior['id'] if prior else "phrase-" + hashlib.sha256(normalized.encode()).hexdigest()[:24],
                                   "phrase": row["phrase"], "level": row["level"], "pattern": row["pattern"],
                                   "variants": row["variants"], "sources": []}
            if prior:
                aliases=list(dict.fromkeys(prior.get('legacyPhrases',[])+([prior['phrase']] if prior['phrase']!=row['phrase'] else [])))
                if aliases:indexed[normalized]['legacyPhrases']=aliases
        indexed[normalized]["sources"].append(row["source"])
    result = {"version": 1, "books": [
        {"id": "oxford", "title": "Oxford Phrase List", "count": 750, "pages": 4, "levels": "A1–C1", "sha256": hashlib.sha256(oxford.read_bytes()).hexdigest()},
        {"id": "pte", "title": "Pearson Academic Collocation List", "count": 2468, "advertisedCount": 2469, "missingSourceNumbers": [2087], "pages": 40, "edition": "VERSION 3/2026", "sha256": hashlib.sha256(pte.read_bytes()).hexdigest()}],
        "entries": list(indexed.values())}
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(json.dumps({"sourceHeads": len(rows), "uniqueEntries": len(indexed), "levels": dict(Counter(r["level"] for r in rows if r["level"])), "destination": str(destination)}, ensure_ascii=False))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--oxford", type=Path, required=True, help="Path to your own Oxford source PDF")
    parser.add_argument("--pte", type=Path, required=True, help="Path to your own Pearson source PDF")
    parser.add_argument("--output", type=Path, default=ROOT / "deployment/phrases/catalog.json")
    args = parser.parse_args()
    build(args.oxford, args.pte, args.output)
