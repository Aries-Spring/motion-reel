# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Voice-over takes from ElevenLabs: cached, force-aligned, stdlib only.

    uv run <skill>/scripts/voice.py --quota                      characters left this month + tier
    uv run <skill>/scripts/voice.py --voices                     voices this key can use
    uv run <skill>/scripts/voice.py <film> --script <film>/audio/script.txt --voice bill \\
        [--take bill_t1] [--language ur] [--speed 1.1] [--stability 0.5] [--model eleven_v4]

The key comes from ELEVENLABS_API_KEY (never write it into the project). The script file holds the
line in the language's own script; v4 audio tags like [excited] or [whispers] steer delivery and are
not spoken. Takes land in <film>/audio/vo/<take>.mp3 + <take>.json (TTS, character timestamps) +
<take>.fa.json (forced alignment against the take's own audio: TTS timestamps run ~90 ms late, so
the edit and the lip sync use .fa.json). An existing take is never re-requested (budgets are small):
delete its files to redo it. Free-tier keys: premade voices only, at most 2 requests at a time.
"""

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

API = "https://api.elevenlabs.io/v1"


def call(path, key, data=None, headers=None, method=None):
    h = {"xi-api-key": key, **(headers or {})}
    if isinstance(data, (dict, list)):
        data, h["Content-Type"] = json.dumps(data).encode(), "application/json"
    req = urllib.request.Request(f"{API}{path}", data=data, headers=h, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs {e.code} on {path}: {e.read().decode()[:400]}")


def multipart(fields, file_field, file_path):
    boundary = "----motionreel" + hashlib.sha1(file_path.read_bytes()[:4096]).hexdigest()[:16]
    parts = [f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
             for k, v in fields.items()]
    parts.append((f"--{boundary}\r\nContent-Disposition: form-data; name=\"{file_field}\"; "
                  f"filename=\"{file_path.name}\"\r\nContent-Type: application/octet-stream\r\n\r\n").encode()
                 + file_path.read_bytes() + f"\r\n--{boundary}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={boundary}"}


def spoken(text):
    """Strip v4 audio tags like [excited]: they steer delivery but aren't said."""
    return re.sub(r"\[[^\]]*\]\s*", "", text)


def voice_id(name, key):
    if re.fullmatch(r"[A-Za-z0-9]{20}", name):
        return name
    voices = call("/voices", key)["voices"]
    for v in voices:
        if v["name"].split(" ")[0].lower() == name.lower() or v["name"].lower() == name.lower():
            return v["voice_id"]
    sys.exit(f"no voice named {name!r}; see --voices")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("film", nargs="?")
    ap.add_argument("--script", help="text file with the line (defaults to <film>/audio/script.txt)")
    ap.add_argument("--voice", default=None, help="premade voice name (first word) or a voice id")
    ap.add_argument("--take", default=None)
    ap.add_argument("--language", default=None, help="ISO 639-1 code for eleven_v4, e.g. ur, hi, ar")
    ap.add_argument("--model", default="eleven_v4")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--stability", type=float, default=0.5)
    ap.add_argument("--quota", action="store_true")
    ap.add_argument("--voices", action="store_true")
    a = ap.parse_args()
    key = os.environ.get("ELEVENLABS_API_KEY") or sys.exit("set ELEVENLABS_API_KEY")

    if a.quota:
        d = call("/user/subscription", key)
        print(f"{d['tier']}: {d['character_limit'] - d['character_count']} of {d['character_limit']} characters left")
        return
    if a.voices:
        for v in call("/voices", key)["voices"]:
            lb = v.get("labels") or {}
            print(f"{v['voice_id']}  {v['name'][:48]:48s} {v.get('category', ''):9s} "
                  f"{lb.get('gender', '')} {lb.get('age', '')} {lb.get('accent', '')}")
        return
    if not a.film or not a.voice:
        ap.error("pass <film> and --voice (or --quota / --voices)")

    film = Path(a.film)
    script = Path(a.script) if a.script else film / "audio" / "script.txt"
    text = script.read_text().strip()
    settings = {"stability": a.stability, "similarity_boost": 0.8, "style": 0.35,
                "use_speaker_boost": True, "speed": a.speed}
    sig = hashlib.sha1(json.dumps([text, a.voice, a.model, a.language, settings]).encode()).hexdigest()[:8]
    take = a.take or f"{a.voice.lower()}_{sig}"
    vo = film / "audio" / "vo"
    vo.mkdir(parents=True, exist_ok=True)
    mp3, meta, fa = vo / f"{take}.mp3", vo / f"{take}.json", vo / f"{take}.fa.json"

    if not (mp3.exists() and meta.exists()):
        vid = voice_id(a.voice, key)
        body = {"text": text, "model_id": a.model, "voice_settings": settings}
        if a.language:
            body["language_code"] = a.language
        print(f"requesting {len(text)} chars, voice {a.voice}, {a.model}")
        d = call(f"/text-to-speech/{vid}/with-timestamps?output_format=mp3_44100_128", key, body)
        mp3.write_bytes(base64.b64decode(d["audio_base64"]))
        meta.write_text(json.dumps({"text": text, "voice": a.voice, "voice_id": vid, "model": a.model,
                                    "language": a.language, "settings": settings,
                                    "alignment": d.get("alignment")}, ensure_ascii=False, indent=1))
        ends = (d.get("alignment") or {}).get("character_end_times_seconds") or [0]
        print(f"-> {mp3}  speech ends {ends[-1]:.2f}s")
    else:
        print(f"cached: {mp3}")
    if not fa.exists():
        body, h = multipart({"text": spoken(text)}, "file", mp3)
        fa.write_text(json.dumps(call("/forced-alignment", key, body, h), ensure_ascii=False, indent=1))
        print(f"-> {fa}")
    words = [w for w in json.loads(fa.read_text())["words"] if w["text"].strip(" —-")]
    print("  " + " | ".join(f"{i}:{w['text']} {w['start']:.2f}" for i, w in enumerate(words)))


if __name__ == "__main__":
    main()
