#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import re
import json
import sys
from typing import List, Tuple, Optional


def read_text(path: str, encoding: str) -> str:
    # Use broader gb18030 for GB2312 family for robustness
    enc = encoding.lower()
    if enc in ("gb2312", "gbk", "gb-2312"):
        enc = "gb18030"
    with open(path, "rb") as f:
        raw = f.read()
    try:
        return raw.decode(enc, errors="strict")
    except Exception:
        # Fallbacks
        for alt in ["utf-8-sig", "utf-8", "gb18030", "cp936"]:
            if alt == enc:
                continue
            try:
                return raw.decode(alt)
            except Exception:
                pass
        # As last resort, decode with replacement to avoid crash
        return raw.decode(enc, errors="replace")


def sanitize_filename(name: str) -> str:
    # Replace Windows-invalid filename characters
    name = name.strip()
    if not name:
        return "chapter"
    return re.sub(r"[\\/:*?\"<>|]", "·", name)


def is_chapter_heading(line: str, patterns: List[re.Pattern]) -> Optional[str]:
    text = line.strip()
    if not text:
        return None
    for pat in patterns:
        m = pat.match(text)
        if m:
            # Prefer captured title if available
            title = m.group(1) if m.groups() else text
            return title.strip()
    return None


def split_book(src_path: str, encoding: str, out_dir: str) -> Tuple[int, List[dict]]:
    os.makedirs(out_dir, exist_ok=True)

    content = read_text(src_path, encoding)
    # Normalize newlines
    content = content.replace("\r\n", "\n").replace("\r", "\n")

    # Chapter heading patterns
    patterns = [
        # 兼容“第X卷……第Y章……”或直接“第Y章……”
        # 例：第五卷名震一方第六百四十八章至木灵婴
        re.compile(r"^(((?:第[一二三四五六七八九十百千0-9]+卷)[^\n\r]*?)?第[一二三四五六七八九十百千0-9]+章[^\n\r]*)$"),
        # XX外传（整行以外传结尾/或仅包含外传）
        re.compile(r"^(.{1,40}?外传)$"),
    ]

    lines = content.split("\n")

    chapters = []  # list of (title, start_index)
    for idx, line in enumerate(lines):
        title = is_chapter_heading(line, patterns)
        if title:
            # Avoid counting extremely short headings like just "外传" unless line is just that
            if title == "外传" and len(line.strip()) != 2:
                continue
            chapters.append((title, idx))

    # If no chapters detected, write whole book into one file
    manifest = {
        "book": out_dir,
        "source": src_path,
        "encoding": encoding,
        "chapters": [],
    }

    width = 4  # Zero-padding width for filenames

    def write_chapter(idx: int, title: str, body_lines: List[str]):
        safe_title = sanitize_filename(title)
        fname = f"{idx:0{width}d}_{safe_title}.txt"
        out_path = os.path.join(out_dir, fname)
        with open(out_path, "w", encoding="utf-8", newline="\n") as f:
            f.write("\n".join(body_lines).strip("\n"))
        manifest["chapters"].append({
            "index": idx,
            "title": title,
            "file": fname,
        })

    if not chapters:
        write_chapter(1, "全文", lines)
    else:
        # Write preface if content exists before first chapter
        first_title, first_start = chapters[0]
        if any(s.strip() for s in lines[:first_start]):
            write_chapter(0, "开篇", lines[:first_start])

        for i, (title, start) in enumerate(chapters):
            end = chapters[i + 1][1] if i + 1 < len(chapters) else len(lines)
            body = lines[start:end]
            # Keep title as first line if present, but avoid duplication if body[0] equals title
            if not body or body[0].strip() != title.strip():
                body = [title, ""] + body
            write_chapter(i + 1, title, body)

    # Save manifest
    with open(os.path.join(out_dir, "manifest.json"), "w", encoding="utf-8") as mf:
        json.dump(manifest, mf, ensure_ascii=False, indent=2)

    return len(manifest["chapters"]), manifest["chapters"]


def main():
    # Default configuration for the two books
    config = [
        {"src": "1.txt", "encoding": "gb2312", "out_dir": "凡人修仙传"},
        {"src": "2.txt", "encoding": "utf-8", "out_dir": "凡人修仙传·仙界篇"},
    ]

    # Simple CLI parsing
    args = sys.argv[1:]
    clean = False
    if args and args[0] == "--clean":
        clean = True
        args = args[1:]
    # Allow overriding via CLI: python split_novel.py [--clean] src encoding out_dir
    if len(args) == 3:
        config = [{"src": args[0], "encoding": args[1], "out_dir": args[2]}]

    def purge(out_dir: str):
        try:
            for name in os.listdir(out_dir):
                if name.endswith('.txt') or name == 'manifest.json':
                    try:
                        os.remove(os.path.join(out_dir, name))
                    except Exception:
                        pass
        except FileNotFoundError:
            pass

    for item in config:
        src, enc, out_dir = item["src"], item["encoding"], item["out_dir"]
        if not os.path.exists(src):
            print(f"[WARN] Source not found: {src}")
            continue
        if clean:
            purge(out_dir)
        count, _ = split_book(src, enc, out_dir)
        print(f"[OK] {out_dir}: {count} chapters written from {src}")


if __name__ == "__main__":
    main()
