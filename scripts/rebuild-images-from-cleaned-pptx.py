"""
Rebuild images/artworks + data/images.json from the cleaned pptx2md img folders.

Assumes the user already deleted unwanted extracts. For each CED work, take
existing image files referenced in that work's slide section (in order), up to
the notes-based required count.
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
IMAGES_JSON = ROOT / "data" / "images.json"
ARTWORKS_JSON = ROOT / "data" / "artworks.json"
COUNTS_PATH = ROOT / "source" / "pptx-md" / "notes-image-counts.json"
OUT_DIR = ROOT / "images" / "artworks"

SOURCES = [
    {
        "md": ROOT / "source" / "pptx-md" / "unit-1" / "unit-1.md",
        "img_root": ROOT / "source" / "pptx-md" / "unit-1",
        "ced_range": range(1, 12),
        "label": "Unit 1 Global Prehistory PowerPoint",
    },
    {
        "md": ROOT / "source" / "pptx-md" / "unit-2" / "unit-2.md",
        "img_root": ROOT / "source" / "pptx-md" / "unit-2",
        "ced_range": range(12, 48),
        "label": "Unit 2 Ancient Mediterranean PowerPoint",
    },
    {
        "md": ROOT / "source" / "pptx-md" / "unit-3a" / "unit-3a.md",
        "img_root": ROOT / "source" / "pptx-md" / "unit-3a",
        "ced_range": range(48, 66),
        "label": "Unit 3 Early Europe & Colonial Americas PowerPoint (1 of 2)",
    },
    {
        "md": ROOT / "source" / "pptx-md" / "unit-3b" / "unit-3b.md",
        "img_root": ROOT / "source" / "pptx-md" / "unit-3b",
        "ced_range": range(66, 99),
        "label": "Unit 3 Early Europe & Colonial Americas PowerPoint (2 of 2)",
    },
]

HEADING_RE = re.compile(
    r"(?:^#\s*(\d{1,3})\.\s+(.+)$)|(?:(\d{1,3})\\\.\s+([A-Za-z][^<\n]*))",
    re.M,
)
IMG_RE = re.compile(r"!\[.*?\]\((.*?)\)")
ATTR_HINT_RE = re.compile(
    r"\b(?:bce|ce|century|c\.\s*\d|images?|oil|fresco|marble|limestone|"
    r"bronze|tempera|wood|stone|mosaic|manuscript|encaustic)\b",
    re.I,
)


def resolve_img(img_root: Path, ref: str) -> Path | None:
    rel = unquote(ref).replace("/", "\\")
    for candidate in (img_root / rel, img_root / rel.replace("\\", "/")):
        if candidate.exists():
            return candidate
    return None


def strip_markup(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[.*?\]\(.*?\)", " ", text)
    text = text.replace("\\", "")
    return re.sub(r"\s+", " ", text).strip()


def find_work_markers(slides: list[str], ced_range: range) -> list[tuple[int, int, str]]:
    markers = []
    seen: set[int] = set()
    for i, slide in enumerate(slides):
        for m in HEADING_RE.finditer(slide):
            is_md = m.group(1) is not None
            ced = int(m.group(1) or m.group(3))
            title = (m.group(2) or m.group(4) or "").strip()
            title = re.sub(r"\\", "", title)
            if ced == 111:
                ced = 11
            if ced not in ced_range or ced in seen:
                continue
            plain = strip_markup(slide)
            if not is_md and not ATTR_HINT_RE.search(plain):
                continue
            if not is_md and len(title) < 4:
                continue
            markers.append((ced, i, title))
            seen.add(ced)
            break
    return markers


def collect_existing(
    slides: list[str], start: int, end: int, img_root: Path
) -> list[Path]:
    """All image refs in the work section that still exist on disk, order preserved, unique."""
    found: list[Path] = []
    seen: set[str] = set()
    for i in range(start, end):
        for ref in IMG_RE.findall(slides[i]):
            p = resolve_img(img_root, ref)
            if not p:
                continue
            key = str(p.resolve()).lower()
            if key in seen:
                continue
            seen.add(key)
            found.append(p)
    return found


def ext_for(path: Path) -> str:
    e = path.suffix.lower()
    if e == ".jpeg":
        return ".jpg"
    if e in {".jpg", ".png", ".gif", ".webp"}:
        return e
    return ".png"


def split_dual(path: Path) -> list[Path]:
    from PIL import Image

    split_dir = ROOT / "source" / "pptx-md" / "_splits"
    split_dir.mkdir(parents=True, exist_ok=True)
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        mid = w // 2
        left = rgb.crop((0, 0, mid, h))
        right = rgb.crop((mid, 0, w, h))
    left_p = split_dir / f"{path.stem}__L.jpg"
    right_p = split_dir / f"{path.stem}__R.jpg"
    left.save(left_p, quality=92, optimize=True)
    right.save(right_p, quality=92, optimize=True)
    return [left_p, right_p]


def fill_from_prev_cache(ced: int, needed: int, have: int) -> list[Path]:
    cache = ROOT / "source" / "pptx-md" / "_prev-cache" / f"{ced:03d}"
    if not cache.exists():
        return []
    files = sorted(
        [p for p in cache.iterdir() if p.is_file()], key=lambda p: p.name
    )
    return files[: max(0, needed - have)]


def main() -> None:
    counts = {
        int(k): int(v)
        for k, v in json.loads(COUNTS_PATH.read_text(encoding="utf-8"))["counts"].items()
    }
    images = json.loads(IMAGES_JSON.read_text(encoding="utf-8"))
    by_id = {e["id"]: e for e in images}
    artworks = {
        a["id"]: a for a in json.loads(ARTWORKS_JSON.read_text(encoding="utf-8"))
    }

    report = {"ok": [], "short": [], "unused_left": []}

    for src in SOURCES:
        text = src["md"].read_text(encoding="utf-8")
        slides = re.split(r"\n---\n", text)
        markers = find_work_markers(slides, src["ced_range"])
        print(f"{src['md'].name}: {len(markers)} works")

        used_in_unit: set[str] = set()

        for idx, (ced, slide_i, title) in enumerate(markers):
            end = markers[idx + 1][1] if idx + 1 < len(markers) else len(slides)
            needed = counts.get(ced, 1)
            existing = collect_existing(slides, slide_i, end, src["img_root"])
            chosen = existing[:needed]

            # Dual-view composite left as one file (e.g. Narmer): split if need 2
            if (
                len(chosen) == 1
                and needed == 2
            ):
                try:
                    from PIL import Image

                    with Image.open(chosen[0]) as im:
                        w, h = im.size
                    if w >= h * 1.25 and w >= 900:
                        chosen = split_dual(chosen[0])
                except OSError:
                    pass

            # Fill remaining slots from previous Flickr/Smarthistory cache
            if len(chosen) < needed:
                chosen = chosen + fill_from_prev_cache(ced, needed, len(chosen))

            artwork = artworks.get(ced, {})
            date = artwork.get("dateDisplay") or ""
            alt_base = artwork.get("title") or title

            dest_dir = OUT_DIR / f"{ced:03d}"
            dest_dir.mkdir(parents=True, exist_ok=True)
            for old in dest_dir.glob("*"):
                if old.is_file():
                    old.unlink()

            new_images = []
            for n, src_path in enumerate(chosen, start=1):
                dest_name = f"{n:02d}{ext_for(src_path)}"
                dest = dest_dir / dest_name
                shutil.copy2(src_path, dest)
                used_in_unit.add(str(src_path.resolve()).lower())
                alt = f"{alt_base} ({date})" if date else alt_base
                if len(chosen) > 1:
                    alt = f"{alt_base} — view {n}" + (f" ({date})" if date else "")
                new_images.append(
                    {
                        "src": f"images/artworks/{ced:03d}/{dest_name}",
                        "alt": alt,
                        "source": src["label"],
                        "local": True,
                    }
                )

            if ced in by_id:
                by_id[ced]["images"] = new_images
            else:
                entry = {"id": ced, "title": alt_base, "images": new_images}
                images.append(entry)
                by_id[ced] = entry

            row = {
                "id": ced,
                "needed": needed,
                "chosen": len(chosen),
                "available": len(existing),
                "files": [im["src"] for im in new_images],
            }
            if len(chosen) < needed:
                report["short"].append(row)
            else:
                report["ok"].append(row)

        # leftover cleaned files not assigned to any work in this unit
        img_dir = src["img_root"] / "img"
        if img_dir.exists():
            for p in sorted(img_dir.iterdir()):
                if p.is_file() and str(p.resolve()).lower() not in used_in_unit:
                    report["unused_left"].append(str(p.relative_to(ROOT)))

    images.sort(key=lambda e: e["id"])
    IMAGES_JSON.write_text(
        json.dumps(images, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    report_path = ROOT / "source" / "pptx-md" / "rebuild-from-cleaned-report.json"
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        f"ok={len(report['ok'])} short={len(report['short'])} "
        f"unused_left={len(report['unused_left'])}"
    )
    for row in report["short"]:
        print(f"  SHORT #{row['id']}: {row['chosen']}/{row['needed']} avail={row['available']}")
    if report["unused_left"]:
        print("unused cleaned files:")
        for u in report["unused_left"]:
            print(f"  {u}")


if __name__ == "__main__":
    main()
