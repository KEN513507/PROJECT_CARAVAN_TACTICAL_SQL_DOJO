#!/usr/bin/env python3
from pathlib import Path
import argparse
import json
import re

# Contract:
# - A table gets a semantic name ONLY if the immediately preceding non-empty line
#   is a standalone UPPER_SNAKE identifier.
# - No prose inference.
# - No "nearest identifier" search.
# - Anonymous Markdown tables remain anonymous/unbound.
NAME_RE = re.compile(r'^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$')
CHAPTER_RE = re.compile(r'^##\s+CHAPTER\s+(\d+)\s*(.*)$')

def cells(line: str):
    return [x.strip() for x in line.strip().strip("|").split("|")]

def separator(row):
    return bool(row) and all(re.fullmatch(r':?-{3,}:?', x.replace(" ", "")) for x in row)

def coerce(v):
    v = v.strip()
    if v == "":
        return None
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    if re.fullmatch(r"-?\d+\.\d+", v):
        return float(v)
    return v

def previous_nonempty(lines, idx):
    j = idx - 1
    while j >= 0:
        s = lines[j].strip()
        if s:
            return j, s
        j -= 1
    return None, None

def parse(text):
    lines = text.splitlines()
    chapter_no = 0
    chapter_title = "PROLOGUE"
    named = []
    unbound = []

    i = 0
    while i < len(lines):
        s = lines[i].strip()

        cm = CHAPTER_RE.match(s)
        if cm:
            chapter_no = int(cm.group(1))
            chapter_title = cm.group(2).strip()
            i += 1
            continue

        if s.startswith("|") and i + 1 < len(lines):
            header = cells(s)
            sep = cells(lines[i+1].strip())
            if len(header) == len(sep) and separator(sep):
                rows = []
                j = i + 2
                while j < len(lines) and lines[j].strip().startswith("|"):
                    row = cells(lines[j].strip())
                    if len(row) != len(header):
                        raise ValueError(
                            f"line {j+1}: expected {len(header)} columns, got {len(row)}"
                        )
                    rows.append({header[k]: coerce(row[k]) for k in range(len(header))})
                    j += 1

                prev_idx, prev = previous_nonempty(lines, i)
                rec = {
                    "chapter": chapter_no,
                    "chapter_title": chapter_title,
                    "columns": header,
                    "rows": rows,
                    "line_start": i + 1,
                    "line_end": j,
                    "preceding_line": prev,
                    "preceding_line_number": (prev_idx + 1) if prev_idx is not None else None,
                }

                if prev and NAME_RE.fullmatch(prev):
                    rec["name"] = prev
                    named.append(rec)
                else:
                    unbound.append(rec)

                i = j
                continue
        i += 1

    return named, unbound

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", type=Path)
    ap.add_argument("-o", "--output", type=Path, default=Path("tables.json"))
    args = ap.parse_args()

    named, unbound = parse(args.input.read_text(encoding="utf-8"))
    payload = {
        "schema_version": 3,
        "parser_contract": "strict-standalone-upper-snake-only",
        "source": args.input.name,
        "named_table_count": len(named),
        "unbound_markdown_table_count": len(unbound),
        "tables": {t["name"]: t for t in named},
        "unbound_tables": unbound,
    }
    args.output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"NAMED_TABLES={len(named)}")
    for t in named:
        print(f'{t["name"]}: chapter={t["chapter"]}, rows={len(t["rows"])}')
    print(f"UNBOUND_TABLES={len(unbound)}")
    for n, t in enumerate(unbound, 1):
        print(f'UNBOUND_{n}: chapter={t["chapter"]}, headers={t["columns"]}, preceding={t["preceding_line"]!r}')

if __name__ == "__main__":
    main()
