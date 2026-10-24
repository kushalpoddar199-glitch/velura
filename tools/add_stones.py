#!/usr/bin/env python3
"""
Velura — add stones to the collection from a folder of photos.

    python3 tools/add_stones.py <folder> <collection>

  <folder>      photos of the stones, one per file. The file name becomes the
                stone name:  nero-marquina.jpg  ->  "Nero Marquina"
  <collection>  white, black, grey, beige, onyx, gold, green, blue or pink

Example:
    python3 tools/add_stones.py ~/Desktop/black-marbles black

For each photo it writes a sharp texture to stones/<slug>.jpg and adds (or
updates) the stone in catalog.json with a small thumbnail. Re-running with the
same file name replaces that stone's photo.

Photo tips: shoot or scan the slab straight-on, evenly lit, no reflections,
cropped to stone only (no edges, labels or floor). Landscape, at least 1600 px wide.
"""
import base64, io, json, os, re, sys

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is missing. Run:  pip3 install pillow   (then run this again)")

FAMILIES = {"white", "black", "grey", "beige", "onyx", "gold", "green", "blue", "pink"}
EXTS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff", ".heic"}
TEX_MAX = 2048          # long side of the texture used on floors and slab pages
THUMB = 128             # thumbnail stored inline in catalog.json

def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    folder, family = os.path.expanduser(sys.argv[1]), sys.argv[2].strip().lower()
    if family not in FAMILIES:
        sys.exit(f"Collection must be one of: {', '.join(sorted(FAMILIES))}")
    if not os.path.isdir(folder):
        sys.exit(f"Folder not found: {folder}")

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    cat_path, stone_dir = os.path.join(root, "catalog.json"), os.path.join(root, "stones")
    os.makedirs(stone_dir, exist_ok=True)
    catalog = json.load(open(cat_path)) if os.path.exists(cat_path) else []
    by_slug = {s["slug"]: s for s in catalog}

    files = sorted(f for f in os.listdir(folder) if os.path.splitext(f)[1].lower() in EXTS and not f.startswith("."))
    if not files:
        sys.exit("No photos found in that folder (jpg, png, webp, tif).")

    added = updated = 0
    for f in files:
        base = os.path.splitext(f)[0]
        name = re.sub(r"[_\-]+", " ", base).strip()
        name = " ".join(w if w.isupper() and len(w) <= 4 else w.capitalize() for w in name.split())
        slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "stone"
        try:
            im = ImageOps.exif_transpose(Image.open(os.path.join(folder, f))).convert("RGB")
        except Exception as e:
            print(f"  ! skipped {f}: {e}")
            continue
        if min(im.size) < 400:
            print(f"  ! {f} is only {im.size[0]}×{im.size[1]} px — it will look soft on floors")
        tex = im.copy(); tex.thumbnail((TEX_MAX, TEX_MAX), Image.LANCZOS)
        tex.save(os.path.join(stone_dir, slug + ".jpg"), "JPEG", quality=88, optimize=True, progressive=True)
        th = im.copy(); s = min(th.size)
        th = th.crop(((th.width - s) // 2, (th.height - s) // 2, (th.width + s) // 2, (th.height + s) // 2)).resize((THUMB, THUMB), Image.LANCZOS)
        buf = io.BytesIO(); th.save(buf, "JPEG", quality=80)
        entry = {"name": name, "family": family, "slug": slug, "thumb": "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()}
        if slug in by_slug:
            by_slug[slug].update(entry); updated += 1; print(f"  ↻ {name}  ({family})")
        else:
            catalog.append(entry); by_slug[slug] = entry; added += 1; print(f"  + {name}  ({family})")

    json.dump(catalog, open(cat_path, "w"), separators=(",", ":"))
    print(f"\nDone: {added} added, {updated} updated — {len(catalog)} stones in the collection.")
    print("Publish with:  git add -A && git commit -m 'Add stones' && git push")

if __name__ == "__main__":
    main()
