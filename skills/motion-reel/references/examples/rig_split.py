"""WORKED EXAMPLE (the Chai Dhaba spot): split a flat illustrated portrait into a talking-head rig.
Manzoor Chacha's real portrait -> a clean plate + a mustache layer that can flap over a drawn mouth.
The coordinates are his; for another face, find yours on a zoomed, gridded crop first.

    uv run --with opencv-python-headless --with pillow <film>/assets/rig.py

Technique: the mustache is as dark as the ink outlines, so colour alone can't find it. Open the dark
mask with a disk larger than the line weight (thin strokes vanish, thick shapes stay), keep only the
blobs that touch the feature's light highlight, grow back into the hugging outline, then inpaint the
hole (Telea) for the clean plate. Moves stay small, so the soft inpaint only shows in slivers.

Writes assets/cut/rig_base.png      the portrait with the mustache painted out (clean plate)
       assets/cut/rig_mustache.png  the mustache alone, same canvas, so it can flap over the mouth
Coordinates below are portrait pixels; film.js uses the same numbers (RIG in film.js).
"""

from pathlib import Path

import cv2
import numpy as np
from PIL import Image

CUT = Path(__file__).resolve().parent / "cut"
STRIPES = [(228, 321), (346, 311)]   # a pixel on each wedge's light highlight stripe
REGION = (150, 270, 430, 390)         # x0, y0, x1, y1 around the mouth


def main():
    im = np.array(Image.open(CUT / "portrait_manzoor.png").convert("RGBA"))
    rgb = np.ascontiguousarray(im[:, :, :3])
    h, w = rgb.shape[:2]

    # 1) the wedges' bodies are as dark as the ink, but thick: open the dark mask to drop the thin
    #    outline strokes, keep the dark blobs touching the two light highlight stripes
    x0, y0, x1, y1 = REGION
    val = rgb.max(axis=2).astype(int)
    light = np.zeros((h, w), np.uint8)
    light[y0:y1, x0:x1] = val[y0:y1, x0:x1] >= 75
    _, lab = cv2.connectedComponents(light, connectivity=4)
    stripes = np.isin(lab, [lab[y, x] for x, y in STRIPES]).astype(np.uint8)
    dark = np.zeros((h, w), np.uint8)
    dark[y0:y1, x0:x1] = val[y0:y1, x0:x1] < 75
    op = cv2.morphologyEx(dark, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (8, 8)))
    n, lab2 = cv2.connectedComponents(op, connectivity=8)
    near = cv2.dilate(stripes, np.ones((9, 9), np.uint8))
    keep = [i for i in range(1, n) if near[lab2 == i].any()]
    m = cv2.morphologyEx(np.isin(lab2, keep).astype(np.uint8) | stripes, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    # 2) take in the ink outline that hugs it (dark pixels within 3 px)
    grown = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    must = ((m > 0) | ((grown > 0) & (dark > 0))).astype(np.uint8) * 255

    layer = im.copy()
    layer[:, :, 3] = np.minimum(im[:, :, 3], must)
    Image.fromarray(layer).save(CUT / "rig_mustache.png")

    # 3) clean plate: paint the mustache out (Telea inpaint), keep the lips
    hole = cv2.dilate(must, np.ones((5, 5), np.uint8))
    lips = np.zeros_like(hole)
    cv2.ellipse(lips, (292, 320), (33, 17), 0, 0, 360, 255, -1)
    hole = cv2.bitwise_and(hole, cv2.bitwise_not(lips))
    base = cv2.inpaint(rgb, hole, 9, cv2.INPAINT_TELEA)
    out = np.dstack([base, im[:, :, 3]])
    Image.fromarray(out).save(CUT / "rig_base.png")
    ys, xs = np.nonzero(must)
    print(f"mustache {xs.min()}-{xs.max()} x {ys.min()}-{ys.max()}, {len(xs)} px")


if __name__ == "__main__":
    main()
