#!/usr/bin/env python3
# Pixel comparison of the screenshots that compare-screens.py made with two builds (labels "old" and "new").
# Exit code 1 when a screen differs; the differences are saved as diff-<screen>.png. Needs Pillow (pip install pillow).
#
#   scripts/e2e/compare-screens-diff.py <simulator name>
import os, sys
from PIL import Image, ImageChops
SIM = sys.argv[1]
WORK = os.environ.get("E2E_WORK", os.path.expanduser("~/Code/e2e-runs"))
base = os.path.join(os.environ.get("E2E_COMPARE_DIR", os.path.join(WORK, "screen-compare")), SIM)
old, new = os.path.join(base, "old"), os.path.join(base, "new")
names = sorted(f for f in os.listdir(old) if f.endswith(".png"))
bad = 0
for f in names:
    if not os.path.exists(os.path.join(new, f)):
        print(f"{SIM} {f}: MISSING in new"); bad += 1; continue
    a = Image.open(os.path.join(old, f)).convert("RGB"); b = Image.open(os.path.join(new, f)).convert("RGB")
    if a.size != b.size:
        print(f"{SIM} {f}: size {a.size} vs {b.size}"); bad += 1; continue
    diff = ImageChops.difference(a, b)
    # a pixel counts when a channel differs by more than 2 (of 255)
    mask = diff.point(lambda v: 255 if v > 2 else 0).convert("L")
    box = mask.getbbox()
    count = sum(1 for v in mask.getdata() if v) if box else 0
    if count:
        bad += 1
        diff.point(lambda v: min(255, v * 8)).save(os.path.join(base, "diff-" + f))
    print(f"{SIM} {f}: {a.size[0]}x{a.size[1]} differing pixels {count}" + (f" in {box}" if box else ""))
extra = sorted(set(os.listdir(new)) - set(names) - {"wda.log"})
if extra: print(f"{SIM} only in new: {extra}"); bad += 1
print(f"{SIM}: {len(names)} screens, {bad} with a difference")
sys.exit(1 if bad else 0)
