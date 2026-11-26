import glob, os
from PIL import Image, ImageChops

JOBS = [
    ("raw_clash", "assets/vfx/vfx_vs_clash.png", True),
    ("raw_burst", "assets/vfx/vfx_hit_burst.png", True),
    ("raw_frame", "assets/vfx/vfx_win_frame.png", False),
]

def make_radial_mask(size=256):
    mask = Image.new("L", (size, size), 0)
    px = mask.load()
    half = size / 2.0
    for y in range(size):
        dy = (y - half + 0.5) / half
        for x in range(size):
            dx = (x - half + 0.5) / half
            r = (dx * dx + dy * dy) ** 0.5
            if r <= 0.52:
                v = 255
            elif r >= 0.95:
                v = 0
            else:
                t = (r - 0.52) / (0.95 - 0.52)
                v = int(255 * (1.0 - t * t * (3.0 - 2.0 * t)))
            px[x, y] = v
    return Image.merge("RGB", (mask, mask, mask))

vignette = make_radial_mask(256)

for src_dir, out_path, use_vignette in JOBS:
    if not os.path.isdir(src_dir):
        continue
    files = sorted(glob.glob(os.path.join(src_dir, "*.png")))
    if len(files) < 16:
        print(f"[EKSIK] {src_dir}: {len(files)}/16 kare")
        continue
    sheet = Image.new("RGB", (1024, 1024), (0, 0, 0))
    for i, fp in enumerate(files[:16]):
        im = Image.open(fp).convert("RGB").resize((256, 256), Image.LANCZOS)
        if use_vignette:
            im = ImageChops.multiply(im, vignette)
        sheet.paste(im, ((i % 4) * 256, (i // 4) * 256))
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    sheet.save(out_path, "PNG", optimize=True)
    print(f"[HAZIR] {src_dir} -> {out_path}")