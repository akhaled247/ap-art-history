"""
Select CED-required images from pptx2md conversions and update data/images.json.

Required image counts come from unit notes in data/source/:
- Explicit \"N images\" on the work attribution line in the notes
- Else explicit \"N images\" on the matching PowerPoint attribution slide
  (fills Unit 3 gaps where notes omit the count; brings Unit 3 to 103)
- Else 1

Then collect that many artwork photos from the converted deck (skip maps/diagrams).
"""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path
from urllib.parse import unquote

import hashlib

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
IMAGES_JSON = ROOT / "data" / "images.json"
ARTWORKS_JSON = ROOT / "data" / "artworks.json"
OUT_DIR = ROOT / "images" / "artworks"
REPORT_PATH = ROOT / "source" / "pptx-md" / "image-replace-report.json"
COUNTS_PATH = ROOT / "source" / "pptx-md" / "notes-image-counts.json"
TMP_SPLIT_DIR = ROOT / "source" / "pptx-md" / "_splits"
PREV_CACHE_DIR = ROOT / "source" / "pptx-md" / "_prev-cache"
PHASH_DUP_THRESHOLD = 8  # aHash hamming distance → treat as same image

NOTES_FILES = [
    (ROOT / "data" / "source" / "unit-01-global-prehistory.md", 1, 11, False),
    (ROOT / "data" / "source" / "unit-02-ancient-mediterranean.md", 12, 47, False),
    (
        ROOT / "data" / "source" / "unit-03-early-europe-colonial-americas.md",
        48,
        98,
        True,
    ),
]

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

# CED heading: markdown title OR span text like "66. Annunciation..."
# Require whitespace after the dotted number so "2.5 million" / "4.3 inches" do not match.
HEADING_RE = re.compile(
    r"(?:^#\s*(\d{1,3})\.\s+(.+)$)|(?:(\d{1,3})\\\.\s+([A-Za-z][^<\n]*))",
    re.M,
)
IMG_RE = re.compile(r"!\[.*?\]\((.*?)\)")
COUNT_RE = re.compile(r"(?<!\d)(\d+)\s+images?", re.I)
ATTR_HINT_RE = re.compile(
    r"\b(?:bce|ce|century|c\.\s*\d|images?|oil|fresco|marble|limestone|"
    r"bronze|tempera|wood|stone|mosaic|manuscript|encaustic)\b",
    re.I,
)
MIN_SIDE = 250
MIN_BYTES = 100_000


def parse_notes_counts(path: Path, ced_min: int, ced_max: int, escaped: bool) -> dict[int, int | None]:
    """Return ced -> count (int) or None if attribution has no explicit image count."""
    text = path.read_text(encoding="utf-8")
    art = re.search(r"(?im)^(?:\*\*)?Artworks(?:\*\*)?\s*$", text)
    if art:
        text = text[art.end() :]
    allowed = set(range(ced_min, ced_max + 1))
    pat = r"(?m)^(?:\*\*)?(\d{1,3})" + (r"\\\.\s+" if escaped else r"\.\s+(?:\*\*)?")
    starts = list(re.finditer(pat, text))
    out: dict[int, int | None] = {}
    for idx, m in enumerate(starts):
        ced = int(m.group(1))
        if ced == 111:
            ced = 11
        if ced not in allowed:
            continue
        end = (
            starts[idx + 1].start()
            if idx + 1 < len(starts)
            else min(len(text), m.start() + 3500)
        )
        chunk = text[m.start() : end]
        stop = re.search(r"(?m)^\s*\d+\.\s+\*\*Form\*\*|^\s*\d+\.\s+Form\b", chunk)
        header = chunk[: stop.start()] if stop else chunk[:900]
        if re.search(r"unit introduction", header, re.I):
            continue
        cm = COUNT_RE.search(header)
        out[ced] = int(cm.group(1)) if cm else None
    return out


def parse_pptx_counts(md_path: Path, ced_range: range) -> dict[int, int]:
    text = md_path.read_text(encoding="utf-8")
    slides = re.split(r"\n---\n", text)
    labels: dict[int, int] = {}
    seen: set[int] = set()
    for slide in slides:
        for m in HEADING_RE.finditer(slide):
            ced = int(m.group(1) or m.group(3))
            if ced == 111:
                ced = 11
            if ced not in ced_range or ced in seen:
                continue
            plain = strip_markup(slide)
            if re.search(r"unit introduction", plain, re.I):
                continue
            cm = COUNT_RE.search(plain)
            if cm:
                labels[ced] = int(cm.group(1))
            seen.add(ced)
            break
    return labels


def build_required_counts() -> dict[int, dict]:
    """Authoritative counts from unit notes, with pptx fills where notes omit N."""
    notes: dict[int, int | None] = {}
    for path, lo, hi, escaped in NOTES_FILES:
        notes.update(parse_notes_counts(path, lo, hi, escaped))

    pptx: dict[int, int] = {}
    for src in SOURCES:
        pptx.update(parse_pptx_counts(src["md"], src["ced_range"]))

    final: dict[int, dict] = {}
    for ced in sorted(set(notes) | set(pptx)):
        if notes.get(ced) is not None:
            final[ced] = {"count": notes[ced], "source": "notes-explicit"}
        elif ced in pptx:
            final[ced] = {"count": pptx[ced], "source": "pptx-fill"}
        else:
            final[ced] = {"count": 1, "source": "notes-default-1"}

    COUNTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    COUNTS_PATH.write_text(
        json.dumps(
            {
                "counts": {str(k): v["count"] for k, v in final.items()},
                "sources": {str(k): v["source"] for k, v in final.items()},
                "totals": {
                    "u1": sum(v["count"] for k, v in final.items() if 1 <= k <= 11),
                    "u2": sum(v["count"] for k, v in final.items() if 12 <= k <= 47),
                    "u3": sum(v["count"] for k, v in final.items() if 48 <= k <= 98),
                },
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return final


def decode_img_ref(ref: str) -> str:
    return unquote(ref).replace("/", "\\")


def resolve_img(img_root: Path, ref: str) -> Path | None:
    rel = decode_img_ref(ref)
    # refs look like img\filename.png
    candidate = img_root / rel
    if candidate.exists():
        return candidate
    # try forward slashes
    candidate = img_root / rel.replace("\\", "/")
    if candidate.exists():
        return candidate
    return None


def is_usable_image(path: Path) -> bool:
    try:
        if path.stat().st_size < MIN_BYTES:
            return False
        with Image.open(path) as im:
            w, h = im.size
        return w >= MIN_SIDE and h >= MIN_SIDE
    except OSError:
        return False


def image_features(path: Path) -> dict:
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        small = np.asarray(rgb.resize((64, 64)), dtype=float)
    r, g, b = small[:, :, 0], small[:, :, 1], small[:, :, 2]
    water = float(((b > r + 20) & (b > g + 10) & (b > 80)).mean())
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    white = float((lum > 230).mean())
    light = float((lum > 180).mean())
    dark = float((lum < 80).mean())
    edge = float(
        (np.abs(np.diff(lum, axis=0)).mean() + np.abs(np.diff(lum, axis=1)).mean()) / 2
    )
    # Near-grayscale (B&W documentary / engraving slides)
    chan_delta = float(
        (np.abs(r - g).mean() + np.abs(g - b).mean() + np.abs(r - b).mean()) / 3
    )
    return {
        "w": w,
        "h": h,
        "water": water,
        "white": white,
        "light": light,
        "dark": dark,
        "edge": edge,
        "chan_delta": chan_delta,
    }


def is_site_plan(path: Path, slide_text: str = "") -> bool:
    """Architectural / site / floor plans that belong in the CED image set."""
    text_l = slide_text.lower()
    if re.search(
        r"\b(site plan|floor plan|ground plan|plan and elevation|groundplan|"
        r"plan of the|reconstruction of|architectural plan|temple plan|"
        r"plan\/elevation|plan view|hypostyle plan|mosque plan)\b",
        text_l,
    ):
        return True
    try:
        f = image_features(path)
    except OSError:
        return False
    # Pale line drawings / reconstruction elevations on near-white ground
    # (not ordinary photographs of buildings or sculptures). Landscape-only
    # so white-bg museum sculpture photos are not treated as plans.
    if (
        f["w"] > f["h"]
        and f["light"] >= 0.78
        and f["dark"] <= 0.05
        and f["white"] >= 0.35
        and f["edge"] >= 6.5
        and f["water"] < 0.15
        and f["chan_delta"] >= 2.0
    ):
        return True
    # Wide schematic site diagrams (Stonehenge stone-circle plan style).
    # Exclude sky-heavy panoramic photographs (high blue/water fraction).
    if (
        f["w"] >= f["h"] * 2.5
        and f["edge"] >= 12
        and f["dark"] <= 0.15
        and f["water"] < 0.28
        and f["light"] < 0.55
        and f["chan_delta"] >= 2.0
    ):
        return True
    return False


def is_geographic_map(path: Path, slide_text: str = "") -> bool:
    """Location / satellite / world maps — not CED required views."""
    text_l = slide_text.lower()
    if re.search(r"\b(google earth|satellite map|world map)\b", text_l):
        return True
    # "site map" alone is geographic; "site plan" is handled separately
    if re.search(r"\bsite map\b", text_l) and not re.search(r"\bsite plan\b", text_l):
        return True
    try:
        f = image_features(path)
    except OSError:
        return True
    if f["water"] >= 0.35:
        return True
    if f["white"] >= 0.65 and f["water"] >= 0.08:
        return True
    if (
        f["h"] > f["w"] * 1.2
        and 0.1 <= f["water"] <= 0.35
        and f["white"] < 0.15
        and f["edge"] < 9.0
    ):
        return True
    return False


def is_junk_diagram(path: Path, slide_text: str = "") -> bool:
    """Teaching overlays / memes / B&W discovery shots — skip."""
    try:
        f = image_features(path)
    except OSError:
        return True
    if f["chan_delta"] < 2.0:
        return True
    # Color-coded legend overlays (not pale reconstruction plans)
    if f["white"] >= 0.55 and f["edge"] >= 8.5 and not is_site_plan(path, slide_text):
        return True
    if f["white"] >= 0.7 and f["edge"] >= 7 and f["water"] < 0.05 and not is_site_plan(
        path, slide_text
    ):
        return True
    if f["w"] >= f["h"] * 2.8 and f["h"] < 320 and not is_site_plan(path, slide_text):
        return True
    return False


def is_map_or_diagram(path: Path, slide_text: str = "") -> bool:
    """True = skip. Site plans are kept."""
    if is_site_plan(path, slide_text):
        return False
    if is_geographic_map(path, slide_text):
        return True
    if is_junk_diagram(path, slide_text):
        return True
    return False


def file_md5(path: Path) -> str:
    return hashlib.md5(path.read_bytes()).hexdigest()


def average_hash(path: Path, size: int = 16) -> int:
    with Image.open(path) as im:
        g = im.convert("L").resize((size, size), Image.Resampling.LANCZOS)
        pixels = list(g.getdata())
    avg = sum(pixels) / len(pixels)
    bits = 0
    for i, px in enumerate(pixels):
        if px >= avg:
            bits |= 1 << i
    return bits


def hamming(a: int, b: int) -> int:
    return (a ^ b).bit_count()


def is_phash_duplicate(h: int, existing: list[int], threshold: int = PHASH_DUP_THRESHOLD) -> bool:
    return any(hamming(h, e) <= threshold for e in existing)


def load_previous_images_json() -> dict[int, list[dict]]:
    """Prior image repo entries from git HEAD (Flickr / Smarthistory)."""
    import subprocess

    try:
        raw = subprocess.check_output(
            ["git", "show", "HEAD:data/images.json"],
            cwd=str(ROOT),
            stderr=subprocess.DEVNULL,
        )
        entries = json.loads(raw.decode("utf-8"))
    except (subprocess.CalledProcessError, json.JSONDecodeError, OSError):
        return {}
    return {e["id"]: e.get("images", []) for e in entries}


def fetch_previous_repo_images(ced: int, prev_entries: list[dict]) -> list[Path]:
    """Download prior remote images for a CED work into a local cache."""
    import urllib.request

    out_dir = PREV_CACHE_DIR / f"{ced:03d}"
    out_dir.mkdir(parents=True, exist_ok=True)
    paths: list[Path] = []
    for i, im in enumerate(prev_entries, start=1):
        src = im.get("src") or ""
        if not src.startswith("http"):
            local = ROOT / src.replace("/", "\\")
            if local.exists() and "placeholder" not in src:
                paths.append(local)
            continue
        ext = ".jpg"
        for candidate in (".png", ".jpg", ".jpeg", ".webp"):
            if candidate in src.lower():
                ext = candidate if candidate != ".jpeg" else ".jpg"
                break
        dest = out_dir / f"{i:02d}{ext}"
        if not dest.exists():
            try:
                req = urllib.request.Request(
                    src, headers={"User-Agent": "apah-image-crosscheck/1.0"}
                )
                with urllib.request.urlopen(req, timeout=30) as resp:
                    dest.write_bytes(resp.read())
            except Exception:
                continue
        if dest.exists() and dest.stat().st_size > 5000:
            paths.append(dest)
    return paths


def split_dual_view(path: Path) -> list[Path]:
    """Split a side-by-side dual photo into left/right halves."""
    TMP_SPLIT_DIR.mkdir(parents=True, exist_ok=True)
    with Image.open(path) as im:
        rgb = im.convert("RGB")
        w, h = rgb.size
        mid = w // 2
        left = rgb.crop((0, 0, mid, h))
        right = rgb.crop((mid, 0, w, h))
    stem = path.stem
    left_path = TMP_SPLIT_DIR / f"{stem}__L.jpg"
    right_path = TMP_SPLIT_DIR / f"{stem}__R.jpg"
    left.save(left_path, quality=92, optimize=True)
    right.save(right_path, quality=92, optimize=True)
    return [left_path, right_path]


def strip_markup(text: str) -> str:
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"!\[.*?\]\(.*?\)", " ", text)
    text = re.sub(r"_\[.*?\]\(.*?\)_", " ", text)
    text = text.replace("\\", "")
    return re.sub(r"\s+", " ", text).strip()


def find_work_markers(slides: list[str], ced_range: range) -> list[tuple[int, int, str, int | None]]:
    """Return list of (ced_id, slide_index, title, labeled_count)."""
    markers = []
    seen = set()
    for i, slide in enumerate(slides):
        for m in HEADING_RE.finditer(slide):
            is_md_heading = m.group(1) is not None
            if is_md_heading:
                ced = int(m.group(1))
                title = m.group(2).strip()
            else:
                ced = int(m.group(3))
                title = re.sub(r"\\", "", m.group(4)).strip()
            if ced == 111:
                ced = 11
            if ced not in ced_range or ced in seen:
                continue
            # Span matches must look like attribution cards, not body prose.
            plain = strip_markup(slide)
            if not is_md_heading and not ATTR_HINT_RE.search(plain):
                continue
            if not is_md_heading and len(title) < 4:
                continue
            labeled = None
            cm = COUNT_RE.search(plain)
            if cm:
                labeled = int(cm.group(1))
            markers.append((ced, i, title, labeled))
            seen.add(ced)
            break
    return markers


def collect_candidates(
    slides: list[str],
    start: int,
    end: int,
    img_root: Path,
    needed: int,
) -> list[Path]:
    """
    Gather filtered candidates from attribution + following slides.
    Keeps site plans; skips geographic maps / junk. Byte-dedupes.
    """
    attr_paths: list[Path] = []
    follow_paths: list[Path] = []
    seen_hash: set[str] = set()
    slide_text_by_path: dict[Path, str] = {}

    def consider(bucket: list[Path], path: Path, slide_text: str) -> None:
        if not is_usable_image(path):
            return
        digest = file_md5(path)
        if digest in seen_hash:
            return
        if is_map_or_diagram(path, slide_text):
            return
        seen_hash.add(digest)
        bucket.append(path)
        slide_text_by_path[path] = slide_text

    attr_text = strip_markup(slides[start])
    for ref in IMG_RE.findall(slides[start]):
        p = resolve_img(img_root, ref)
        if p:
            consider(attr_paths, p, attr_text)

    for i in range(start + 1, end):
        slide_text = strip_markup(slides[i])
        for ref in IMG_RE.findall(slides[i]):
            p = resolve_img(img_root, ref)
            if p:
                consider(follow_paths, p, slide_text)

    # Mark attribution-slide images for scoring preference
    for p in attr_paths:
        slide_text_by_path[p] = (slide_text_by_path.get(p, "") + " __ATTR_SLIDE__").strip()

    combined = attr_paths + follow_paths

    # When the attribution card already carries the full CED set, prefer those.
    collect_candidates.attr_paths = attr_paths  # type: ignore[attr-defined]

    # Dual-view split when notes need 2 and first keeper is a wide composite.
    if needed == 2 and combined:
        first = combined[0]
        try:
            f = image_features(first)
        except OSError:
            f = None
        if f and f["w"] >= f["h"] * 1.25 and f["w"] >= 900:
            if len(combined) == 1 or (
                len(combined) >= 2 and image_features(combined[1])["w"] < f["w"] * 0.6
            ):
                return split_dual_view(first)

    # Rescue pass: pale reconstruction / plan drawings still rejected as junk.
    if len(combined) < needed + 3:
        for i in range(start, end):
            slide_text = strip_markup(slides[i])
            for ref in IMG_RE.findall(slides[i]):
                p = resolve_img(img_root, ref)
                if not p or not is_usable_image(p):
                    continue
                digest = file_md5(p)
                if digest in seen_hash:
                    continue
                if is_geographic_map(p, slide_text):
                    continue
                if is_site_plan(p, slide_text) or (
                    image_features(p)["light"] >= 0.7
                    and image_features(p)["edge"] >= 6.5
                    and image_features(p)["chan_delta"] >= 2.0
                ):
                    seen_hash.add(digest)
                    combined.append(p)
                    slide_text_by_path[p] = slide_text

    # Stash slide text for later site-plan detection in select_final
    collect_candidates.slide_text_by_path = slide_text_by_path  # type: ignore[attr-defined]
    return combined


def select_final_images(
    candidates: list[Path],
    needed: int,
    prev_paths: list[Path],
    slide_text_by_path: dict[Path, str] | None = None,
) -> list[Path]:
    """
    Pick `needed` unique images:
    - Prefer candidates that match the previous Flickr/Smarthistory repo (phash)
    - Include a site plan when one appears in the candidate pool
    - Deduplicate by perceptual hash (same image from pptx + previous → once)
    """
    slide_text_by_path = slide_text_by_path or {}
    if not candidates and not prev_paths:
        return []

    prev_hashes: list[int] = []
    for p in prev_paths:
        try:
            prev_hashes.append(average_hash(p))
        except OSError:
            continue

    scored: list[tuple[int, int, Path]] = []  # (-score, order, path)
    for order, path in enumerate(candidates):
        try:
            h = average_hash(path)
        except OSError:
            continue
        score = 0
        st = slide_text_by_path.get(path, "")
        # Attribution-card images are the teacher's CED set — strongest prior
        if "__ATTR_SLIDE__" in st:
            score += 120
        # Match against previous Flickr/Smarthistory repo (include once via phash)
        if any(hamming(h, ph) <= PHASH_DUP_THRESHOLD for ph in prev_hashes):
            score += 80
        if is_site_plan(path, st):
            score += 50
        # Prefer earlier (attribution-adjacent) slides slightly
        score += max(0, 20 - order)
        scored.append((-score, order, path))

    scored.sort()
    chosen: list[Path] = []
    chosen_hashes: list[int] = []

    def try_add(path: Path) -> bool:
        try:
            h = average_hash(path)
        except OSError:
            return False
        if is_phash_duplicate(h, chosen_hashes):
            return False
        chosen.append(path)
        chosen_hashes.append(h)
        return True

    for _, _, path in scored:
        if len(chosen) >= needed:
            break
        try_add(path)

    # Ensure one site plan is included when present in the pool
    plan_candidates = [
        p
        for p in candidates
        if is_site_plan(p, slide_text_by_path.get(p, ""))
    ]
    has_plan = any(
        is_site_plan(p, slide_text_by_path.get(p, "")) for p in chosen
    )
    if plan_candidates and not has_plan:
        for plan in plan_candidates:
            try:
                h = average_hash(plan)
            except OSError:
                continue
            if is_phash_duplicate(h, chosen_hashes):
                # Plan already represented via duplicate of something chosen
                has_plan = True
                break
            if len(chosen) < needed:
                if try_add(plan):
                    has_plan = True
                    break
            else:
                # Swap out the lowest-priority non-plan (last added non-plan)
                for idx in range(len(chosen) - 1, -1, -1):
                    if not is_site_plan(
                        chosen[idx], slide_text_by_path.get(chosen[idx], "")
                    ):
                        chosen[idx] = plan
                        chosen_hashes[idx] = h
                        has_plan = True
                        break
                break

    # If still short, pull unique previous-repo images not already represented
    if len(chosen) < needed:
        for p in prev_paths:
            if len(chosen) >= needed:
                break
            try_add(p)

    return chosen[:needed]


def ext_for(path: Path) -> str:
    e = path.suffix.lower()
    if e in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        return ".jpg" if e == ".jpeg" else e
    return ".png"


def main(apply: bool = True) -> None:
    images = json.loads(IMAGES_JSON.read_text(encoding="utf-8"))
    by_id = {entry["id"]: entry for entry in images}
    artworks = {
        a["id"]: a for a in json.loads(ARTWORKS_JSON.read_text(encoding="utf-8"))
    }
    required = build_required_counts()
    print(
        "notes-based counts:",
        f"u1={sum(v['count'] for k,v in required.items() if 1<=k<=11)}",
        f"u2={sum(v['count'] for k,v in required.items() if 12<=k<=47)}",
        f"u3={sum(v['count'] for k,v in required.items() if 48<=k<=98)}",
    )
    previous_by_id = load_previous_images_json()
    print(f"previous image repo works loaded: {len(previous_by_id)}")

    report = {"selected": [], "missing": [], "skipped_false_positive": []}

    for src in SOURCES:
        text = src["md"].read_text(encoding="utf-8")
        slides = re.split(r"\n---\n", text)
        markers = find_work_markers(slides, src["ced_range"])
        print(f"{src['md'].name}: {len(markers)} works")

        for idx, (ced, slide_i, title, labeled) in enumerate(markers):
            end = markers[idx + 1][1] if idx + 1 < len(markers) else len(slides)
            entry = by_id.get(ced)
            json_count = len(entry["images"]) if entry else 1
            req = required.get(ced)
            if req:
                needed = max(1, int(req["count"]))
                count_source = req["source"]
            elif labeled is not None:
                needed = max(1, labeled)
                count_source = "pptx-slide"
            else:
                needed = max(1, json_count)
                count_source = "images-json"

            candidates = collect_candidates(
                slides, slide_i, end, src["img_root"], needed
            )
            slide_texts = getattr(collect_candidates, "slide_text_by_path", {})
            attr_paths = getattr(collect_candidates, "attr_paths", [])
            prev_paths = fetch_previous_repo_images(
                ced, previous_by_id.get(ced, [])
            )
            # If attribution slide already has the full required set, use it
            # (still phash-dedupe and allow prev-repo fill if short).
            seed = attr_paths if len(attr_paths) >= needed else candidates
            chosen = select_final_images(
                seed if len(attr_paths) >= needed else candidates,
                needed,
                prev_paths,
                slide_texts,
            )
            # If we seeded from attr only and missed a site plan that exists
            # later in the section, merge plan into final via full candidate pool.
            if len(attr_paths) >= needed:
                plans = [
                    p
                    for p in candidates
                    if is_site_plan(p, slide_texts.get(p, ""))
                ]
                if plans and not any(
                    is_site_plan(p, slide_texts.get(p, "")) for p in chosen
                ):
                    chosen = select_final_images(
                        candidates, needed, prev_paths, slide_texts
                    )

            if not chosen:
                report["missing"].append(
                    {
                        "id": ced,
                        "title": title,
                        "reason": "no usable images in section",
                        "source": src["label"],
                    }
                )
                continue

            artwork = artworks.get(ced, {})
            date = artwork.get("dateDisplay") or ""
            alt_base = artwork.get("title") or title
            new_images = []
            dest_dir = OUT_DIR / f"{ced:03d}"
            if apply:
                dest_dir.mkdir(parents=True, exist_ok=True)
                # clear previous local copies for this work
                for old in dest_dir.glob("*"):
                    if old.is_file():
                        old.unlink()

            copied = []
            for n, src_path in enumerate(chosen, start=1):
                dest_name = f"{n:02d}{ext_for(src_path)}"
                dest = dest_dir / dest_name
                if apply:
                    # re-encode via pillow for jpeg consistency when needed
                    if dest.suffix.lower() in {".jpg", ".jpeg"} and src_path.suffix.lower() not in {
                        ".jpg",
                        ".jpeg",
                    }:
                        with Image.open(src_path) as im:
                            rgb = im.convert("RGB")
                            rgb.save(dest, quality=92, optimize=True)
                    else:
                        shutil.copy2(src_path, dest)
                rel = f"images/artworks/{ced:03d}/{dest_name}".replace("\\", "/")
                alt = f"{alt_base} ({date})" if date else alt_base
                if len(chosen) > 1:
                    alt = f"{alt_base} — view {n}" + (f" ({date})" if date else "")
                new_images.append(
                    {
                        "src": rel,
                        "alt": alt,
                        "source": src["label"],
                        "local": True,
                    }
                )
                copied.append(
                    {
                        "from": str(src_path.relative_to(ROOT)),
                        "to": rel,
                        "bytes": src_path.stat().st_size,
                    }
                )

            if apply and entry is not None:
                entry["images"] = new_images

            plan_included = any(
                is_site_plan(p, slide_texts.get(p, "")) for p in chosen
            )
            report["selected"].append(
                {
                    "id": ced,
                    "title": alt_base,
                    "needed": needed,
                    "count_source": count_source,
                    "labeled_count": labeled,
                    "json_count_before": json_count,
                    "chosen": len(chosen),
                    "available": len(candidates),
                    "prev_repo_cached": len(prev_paths),
                    "site_plan_included": plan_included,
                    "files": copied,
                    "source": src["label"],
                }
            )

    # Note works in units 1-3 not found
    expected_ids = set(range(1, 99)) | {250}
    found_ids = {row["id"] for row in report["selected"]} | {
        row["id"] for row in report["missing"]
    }
    for ced in sorted(expected_ids):
        art = artworks.get(ced)
        if not art:
            continue
        if art.get("unit") not in (1, 2, 3):
            continue
        if ced not in found_ids:
            report["missing"].append(
                {
                    "id": ced,
                    "title": art.get("title"),
                    "reason": "no attribution marker in converted markdown",
                }
            )

    if apply:
        IMAGES_JSON.write_text(
            json.dumps(images, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )

    REPORT_PATH.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(
        f"selected={len(report['selected'])} missing={len(report['missing'])} "
        f"report={REPORT_PATH.relative_to(ROOT)}"
    )


if __name__ == "__main__":
    import sys

    apply = "--dry-run" not in sys.argv
    main(apply=apply)
