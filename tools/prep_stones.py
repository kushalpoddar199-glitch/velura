#!/usr/bin/env python3
"""
Velura: split marble_data.json into a light catalogue for the AR page.

Output (written to the repo root, next to ar.html):
  catalog.json        name, family, slug, and a tiny 128px thumbnail per stone
  stones/<slug>.jpg   1024px texture, loaded only when a stone is tapped

Usage:
  python3 tools/prep_stones.py [path/to/marble_data.json]
"""
import base64, io, json, os, re, sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow is missing. Run:  pip3 install pillow   (then run this script again)")

src = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/Desktop/DESKPOOP/marble_data.json")
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
stone_dir = os.path.join(root, "stones")
os.makedirs(stone_dir, exist_ok=True)

data = json.load(open(src))
seen, catalog = set(), []

for s in data:
    slug = re.sub(r"[^a-z0-9]+", "-", s["name"].lower()).strip("-") or "stone"
    base, n = slug, 2
    while slug in seen:
        slug, n = f"{base}-{n}", n + 1
    seen.add(slug)

    raw = base64.b64decode(s["img"].split(",", 1)[1])
    im = Image.open(io.BytesIO(raw)).convert("RGB")

    tex = im.copy()
    tex.thumbnail((1024, 1024), Image.LANCZOS)
    tex.save(os.path.join(stone_dir, slug + ".jpg"), "JPEG", quality=85, optimize=True, progressive=True)

    w, h = im.size
    m = min(w, h)
    th = im.crop(((w - m) // 2, (h - m) // 2, (w + m) // 2, (h + m) // 2)).resize((128, 128), Image.LANCZOS)
    buf = io.BytesIO()
    th.save(buf, "JPEG", quality=70, optimize=True)

    catalog.append({
        "name": s["name"],
        "family": s.get("family", ""),
        "slug": slug,
        "thumb": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode(),
    })

with open(os.path.join(root, "catalog.json"), "w") as f:
    json.dump(catalog, f, separators=(",", ":"))

size_kb = os.path.getsize(os.path.join(root, "catalog.json")) // 1024
print(f"Done: {len(catalog)} stones -> catalog.json ({size_kb} KB) + stones/*.jpg")
