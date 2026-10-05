#!/usr/bin/env python3
"""Download all four official DOCX schedules; preview or write application JSON."""

import argparse
import hashlib
import html
import json
import re
import urllib.request
import zipfile
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "src" / "data"
SOURCE = "https://oas.fon.bg.ac.rs/raspored-nastave/"
NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
DAYS = ["Ponedeljak", "Utorak", "Sreda", "Četvrtak", "Petak"]
YEAR_WORDS = ["PRVA", "DRUGA", "TRECA", "CETVRTA"]
LATIN = "ABVGDĐEŽZIJKLMNOPRSŠTĆUFHCČ"
CYRILLIC = "АБВГДЂЕЖЗИЈКЛМНОПРСШТЋУФХЦЧ"
TRANSLITERATION = dict(zip(LATIN + LATIN.lower(), CYRILLIC + CYRILLIC.lower()))
TRANSLITERATION.update({"Lj": "Љ", "LJ": "Љ", "lj": "љ", "Nj": "Њ", "NJ": "Њ", "nj": "њ", "Dž": "Џ", "DŽ": "Џ", "dž": "џ"})


def clean(text):
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def fetch(url):
    request = urllib.request.Request(url, headers={"User-Agent": "FON-Raspored/1.0"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return response.read()


def discover(page):
    links = list(dict.fromkeys(html.unescape(url) for url in re.findall(
        r'href=["\']([^"\']+\.docx)["\']', page, re.I,
    )))
    result = []
    for year, word in enumerate(YEAR_WORDS, 1):
        schedules = [url for url in links if re.search(rf"/{year}(?:godina|zimski[^/]*)\.docx$", url, re.I)]
        groups = [url for url in links if re.search(rf"Grupe-za-nastavu-{word}-godina[^/]*\.docx$", url, re.I)]
        if len(schedules) != 1 or len(groups) != 1:
            raise ValueError(f"Expected one Serbian schedule and group allocation for year {year}: {schedules}, {groups}")
        result.append((year, schedules[0], groups[0]))
    return result


def document(path):
    with zipfile.ZipFile(path) as archive:
        return ElementTree.fromstring(archive.read("word/document.xml"))


def node_text(node, tabs=False):
    parts = []
    for child in node.iter():
        if child.tag == NS + "t":
            parts.append(child.text or "")
        elif tabs and child.tag == NS + "tab":
            parts.append("\t")
        elif tabs and child.tag in {NS + "br", NS + "cr"}:
            parts.append("\n")
    return "".join(parts)


def boundary(text, fallback):
    text = clean(text).strip("-–— ")
    if not text or text.casefold() in {"svi", "сви"}:
        return fallback
    return re.sub(r"Dž|DŽ|dž|Lj|LJ|lj|Nj|NJ|nj|.", lambda match: TRANSLITERATION.get(match[0], match[0]), text)


def parse_groups(path, year):
    rows = []
    for row in document(path).iter(NS + "tr"):
        cells = [clean(" ".join(node_text(p) for p in cell.iter(NS + "p"))) for cell in row.findall(NS + "tc")]
        if len(cells) not in {3, 4}:
            continue
        group = re.sub(r"\s+", "", cells[0]).upper()
        if not re.fullmatch(rf"{chr(64 + year)}\d+", group):
            continue
        rows.append({"program": cells[1], "grupa": group, "od": boundary(cells[2], "А"), "do": boundary(cells[-1], "Ш")})
    if not rows:
        raise ValueError(f"No groups parsed from {path}")
    return rows


def parse_schedule(path, year):
    events = []
    day = None
    for paragraph in document(path).iter(NS + "p"):
        raw = node_text(paragraph, tabs=True).strip()
        value = clean(raw)
        if value in DAYS:
            day = value
            continue
        if value in {"Subota", "Nedelja"}:
            day = None
            continue
        columns = [clean(part) for part in raw.split("\t")]
        if len(columns) < 2 or columns[1] not in {"P", "V"}:
            continue
        if not day or len(columns) < 5:
            raise ValueError(f"Unrecognized lesson in {path}: {raw!r}")
        time = re.fullmatch(r"(\d{2}:\d{2})\s*[-–—]\s*(\d{2}:\d{2})", columns[3])
        groups = [re.sub(r"\s+", "", group).upper() for group in columns[2].split(",")]
        if not time or any(not re.fullmatch(r"[A-D]\d+", group) for group in groups):
            raise ValueError(f"Unrecognized time/groups in {path}: {raw!r}")
        events.append({"predmet": columns[0], "tip": columns[1], "grupe": groups, "od": time[1], "do": time[2], "sala": clean(" ".join(columns[4:])), "dan": day})
    if not events:
        raise ValueError(f"No lessons parsed from {path}")
    return events


def merge(events):
    merged = {}
    for event in events:
        key = tuple(event[field] for field in ("dan", "predmet", "tip", "od", "do")) + (tuple(event["grupe"]),)
        if key not in merged:
            merged[key] = event.copy()
        elif event["sala"] not in merged[key]["sala"].split("/"):
            merged[key]["sala"] += "/" + event["sala"]
    return list(merged.values())


def generate(events, allocations):
    terms, subjects, groups, schedule = {}, {}, {}, {}
    for year, rows in allocations.items():
        groups[year] = defaultdict(list)
        subjects[year] = {}
        terms[year] = {}
        for row in rows:
            groups[year][row["program"]].append({key: row[key] for key in ("grupa", "od", "do")})
            schedule[row["grupa"]] = {}
        for program, ranges in groups[year].items():
            members = {row["grupa"] for row in ranges}
            subjects[year][program] = list(dict.fromkeys(event["predmet"] for event in events if members.intersection(event["grupe"])))
    for event in events:
        public = {key: event[key] for key in ("predmet", "tip", "grupe", "od", "do", "sala")}
        public["string"] = f"{event['predmet']} {event['tip']} {','.join(event['grupe'])} {event['od']}-{event['do']} {event['sala']}"
        for group in event["grupe"]:
            if group not in schedule:
                raise ValueError(f"Unknown group {group}")
            schedule[group].setdefault(event["dan"], []).append(public.copy())
        for year in {f"year{ord(group[0]) - 64}" for group in event["grupe"]}:
            term = {key: event[key] for key in ("od", "do", "sala", "grupe", "dan")}
            lessons = terms[year].setdefault(event["predmet"], {"P": [], "V": []})[event["tip"]]
            if term not in lessons:
                lessons.append(term)
    for year in terms.values():
        for types in year.values():
            for lessons in types.values():
                lessons.sort(key=lambda item: (item["dan"], item["od"], item["sala"]))
    for days in schedule.values():
        for lessons in days.values():
            lessons.sort(key=lambda item: (item["od"], item["predmet"], item["tip"]))
    return {"predmeti.json": subjects, "termini.json": terms, "raspored_grupa.json": groups, "raspored_nastave.json": schedule}


def slots(terms):
    return {(name, kind, item["dan"], item["od"], item["do"], item["sala"]) for year in terms.values() for name, types in year.items() for kind, lessons in types.items() for item in lessons}


def preserve_room_order(events, previous_terms):
    """The same classrooms in a different DOCX row order are not a changed slot."""
    def key(name, kind, day, start, end, room):
        return (name, kind, day, start, end, tuple(sorted(room.split("/"))))
    previous = {key(*slot): slot[-1] for slot in slots(previous_terms)}
    count = 0
    for event in events:
        identity = key(event["predmet"], event["tip"], event["dan"], event["od"], event["do"], event["sala"])
        if identity in previous and event["sala"] != previous[identity]:
            event["sala"] = previous[identity]
            count += 1
    return count


def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=4) + "\n", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Update src/data only after all documents are parsed")
    args = parser.parse_args()
    previous = {name: json.loads((DATA / name).read_text()) for name in ("predmeti.json", "termini.json", "raspored_grupa.json", "raspored_nastave.json")}
    directory = ROOT / ".schedule-import" / datetime.now(timezone.utc).strftime("official-%Y%m%dT%H%M%S%fZ")
    directory.mkdir(parents=True)
    save(directory / "previous-catalog.json", {"subjects": previous["predmeti.json"], "terms": previous["termini.json"]})
    page = fetch(SOURCE).decode("utf-8")
    (directory / "source.html").write_text(page, encoding="utf-8")
    manifest, allocations, events = [], {}, []
    for year, schedule_url, groups_url in discover(page):
        for kind, url in [("schedule", schedule_url), ("groups", groups_url)]:
            body = fetch(url)
            path = directory / f"{kind}-year-{year}.docx"
            path.write_bytes(body)
            manifest.append({"year": year, "kind": kind, "url": url, "sha256": hashlib.sha256(body).hexdigest()})
        allocations[f"year{year}"] = parse_groups(directory / f"groups-year-{year}.docx", year)
        parsed = parse_schedule(directory / f"schedule-year-{year}.docx", year)
        events.extend(parsed)
        print(f"year{year}: {len(parsed)} source rows, {len(allocations[f'year{year}'])} groups", flush=True)
    events = merge(events)
    reordered_rooms = preserve_room_order(events, previous["termini.json"])
    generated = generate(events, allocations)
    old, new = slots(previous["termini.json"]), slots(generated["termini.json"])
    summary = {"previous": len(old), "current": len(new), "unchanged": len(old & new), "removed": len(old - new), "added": len(new - old), "normalized_room_order": reordered_rooms}
    save(directory / "manifest.json", {"source": SOURCE, "documents": manifest, "summary": summary})
    save(directory / "current-catalog.json", {"subjects": generated["predmeti.json"], "terms": generated["termini.json"]})
    save(directory / "changes.json", {"removed": sorted(old - new), "added": sorted(new - old)})
    for name, value in generated.items():
        save(directory / name, value)
        if args.write:
            save(DATA / name, value)
    print(json.dumps(summary))
    print(f"Source archive and comparison: {directory.relative_to(ROOT)}")
    print("Updated src/data" if args.write else "Preview only; run with --write to update src/data")


if __name__ == "__main__":
    main()
