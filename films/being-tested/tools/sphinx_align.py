# /// script
# requires-python = ">=3.10"
# dependencies = ["pocketsphinx>=5", "numpy", "scipy", "soundfile"]
# ///
"""Forced alignment of the lyric sheet against the vocal stem with PocketSphinx (its en-us acoustic
model ships inside the PyPI wheel; this environment can't download the MMS model align.py wants).

    uv run being-tested/tools/sphinx_align.py being-tested [--windows]  -> docs/sphinx_words.json

Without --windows it aligns the whole song in one utterance. With --windows it reads
docs/lyrics.txt ('@ t0 t1 name' windows, one sung line per row) and aligns window by window.
"""
import json, re, sys
from pathlib import Path
import numpy as np, soundfile as sf
from scipy.signal import resample_poly
from pocketsphinx import Decoder

film = Path(sys.argv[1])
EXTRA = {  # ARPAbet for the song's jargon (not in cmudict)
    "autocomplete": "AO T OW K AH M P L IY T", "autoencoder": "AO T OW EH N K OW D ER",
    "eval": "IY V AE L", "flatlined": "F L AE T L AY N D", "grokked": "G R AA K T",
    "polysemantic": "P AA L IY S AH M AE N T IH K", "steganography": "S T EH G AH N AA G R AH F IY",
    "superposition": "S UW P ER P AH Z IH SH AH N", "waluigi's": "W AH L UW IY JH IY Z",
}
SPOKEN = {"ide": "i d e"}

def norm(line):
    out = []
    for w in re.findall(r"[A-Za-z']+", line):
        w = w.lower().strip("'")
        if w in SPOKEN: out += SPOKEN[w].split()
        else: out.append(w)
    return out

y, sr = sf.read(film / "audio" / "stems" / "vocals.wav")
y = y.mean(1) if y.ndim > 1 else y
y16 = resample_poly(y, 160, 441) if sr == 44100 else resample_poly(y, 16000, sr)
y16 = y16 / (np.abs(y16).max() + 1e-9) * 0.9
pcm = (y16 * 32767).astype(np.int16)

def decoder():
    d = Decoder(samprate=16000, loglevel="ERROR", beam=1e-100, wbeam=1e-80, pbeam=1e-100, bestpath=False)
    for w, ph in EXTRA.items(): d.add_word(w, ph, True)
    return d

def align(words, a, b):
    d = decoder()
    d.set_align_text(" ".join(words))
    seg = pcm[int(a * 16000): int(b * 16000)].tobytes()
    d.start_utt(); d.process_raw(seg, full_utt=True); d.end_utt()
    d.set_alignment(); d.start_utt(); d.process_raw(seg, full_utt=True); d.end_utt()
    out = []
    for w in d.get_alignment():
        if w.name in ("<s>", "</s>", "<sil>", "sil"): continue
        out.append({"w": w.name, "t0": round(a + w.start / 100, 3), "t1": round(a + (w.start + w.duration) / 100, 3)})
    return out

if "--windows" in sys.argv:
    res = []
    cur = None
    for raw in (film / "docs" / "lyrics.txt").read_text().splitlines():
        s = raw.strip()
        if not s or s.startswith("#"): continue
        if s.startswith("@"):
            p = s.split(); cur = {"t0": float(p[1]), "t1": float(p[2]), "name": " ".join(p[3:]), "lines": []}; res.append(cur); continue
        cur["lines"].append(s)
    out = []
    for W in res:
        words, owner = [], []
        for li, L in enumerate(W["lines"]):
            ws = norm(L.split("|")[0] if "|" in L else L); words += ws; owner += [li] * len(ws)
        al = []
        for pad in (0.0, 0.15, -0.15, 0.3):   # FSG search can dead-end on a frame; nudge the window end
            try:
                al = align(words, W["t0"], W["t1"] + pad); break
            except RuntimeError:
                continue
        if len(al) != len(words):
            print(f"!! {W['name']}: aligned {len(al)} of {len(words)} words"); continue
        for li, L in enumerate(W["lines"]):
            ww = [al[k] for k in range(len(words)) if owner[k] == li]
            out.append({"section": W["name"], "text": L, "t0": ww[0]["t0"], "t1": ww[-1]["t1"], "words": ww})
        print(f"{W['name']:<14} {W['t0']:7.2f}-{W['t1']:7.2f}  {len(al)} words")
    (film / "docs" / "sphinx_lines.json").write_text(json.dumps(out, indent=1))
else:
    lines = []
    for raw in (film / "docs" / "lyrics_meta.txt").read_text().splitlines():
        s = raw.strip()
        if not s or s.startswith("[") or s.startswith("(") or s == "...": continue
        lines.append(s)
    words, owner = [], []
    for li, L in enumerate(lines):
        ws = norm(L); words += ws; owner += [li] * len(ws)
    al = align(words, 0, len(pcm) / 16000)
    print(f"aligned {len(al)} of {len(words)} words")
    out = []
    if len(al) == len(words):
        for li, L in enumerate(lines):
            ww = [al[k] for k in range(len(words)) if owner[k] == li]
            out.append({"text": L, "t0": ww[0]["t0"], "t1": ww[-1]["t1"], "words": ww})
            print(f"{ww[0]['t0']:7.2f}-{ww[-1]['t1']:7.2f}  {L}")
    (film / "docs" / "sphinx_lines.json").write_text(json.dumps(out, indent=1))
