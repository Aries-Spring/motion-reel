# /// script
# requires-python = ">=3.10"
# dependencies = ["requests"]
# ///
"""ElevenLabs helper for the Bell Witch film. The key comes from ELEVENLABS_API_KEY (never written to
the repo). Every take is cached in audio/el/ keyed by its request, so re-running never re-spends credits.

  uv run audio/eleven.py tts  <name> <voice_id> "<text>" [--model eleven_v3] [--stability 0.5]
  uv run audio/eleven.py sfx  <name> "<prompt>" [--dur 3.0] [--influence 0.5]
  uv run audio/eleven.py quota
"""
import base64, hashlib, json, os, sys
from pathlib import Path
import requests

API = "https://api.elevenlabs.io/v1"
OUT = Path(__file__).resolve().parent / "el"
OUT.mkdir(exist_ok=True)
KEY = os.environ.get("ELEVENLABS_API_KEY")
if not KEY:
    sys.exit("set ELEVENLABS_API_KEY")
H = {"xi-api-key": KEY}


def opt(args, name, d):
    return type(d)(args[args.index(name) + 1]) if name in args else d


def quota():
    try:
        s = requests.get(f"{API}/user/subscription", headers=H, timeout=30).json()
        return s["character_count"], s["character_limit"]
    except Exception:
        return 0, 0


def tts(name, voice, text, args):
    model = opt(args, "--model", "eleven_v3")
    stab = opt(args, "--stability", 0.5)
    sim = opt(args, "--similarity", 0.75)
    style = opt(args, "--style", 0.0)
    body = {"text": text, "model_id": model,
            "voice_settings": {"stability": stab, "similarity_boost": sim, "style": style, "use_speaker_boost": True}}
    key = hashlib.sha1(json.dumps([voice, body], sort_keys=True).encode()).hexdigest()[:10]
    mp3, js = OUT / f"{name}.mp3", OUT / f"{name}.json"
    if js.exists() and json.loads(js.read_text()).get("key") == key:
        print(f"cached {mp3.name}")
        return
    before = quota()[0]
    r = requests.post(f"{API}/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_128", headers=H, json=body, timeout=300)
    if r.status_code != 200:
        sys.exit(f"tts {r.status_code}: {r.text[:400]}")
    d = r.json()
    mp3.write_bytes(base64.b64decode(d["audio_base64"]))
    js.write_text(json.dumps({"key": key, "voice": voice, "text": text, "body": body,
                              "alignment": d.get("alignment"), "normalized_alignment": d.get("normalized_alignment")}, indent=1))
    print(f"-> {mp3.name}  ({quota()[0] - before} credits)")


def sfx(name, prompt, args):
    dur = opt(args, "--dur", 0.0)
    inf = opt(args, "--influence", 0.5)
    body = {"text": prompt, "prompt_influence": inf, "output_format": "mp3_44100_128"}
    if dur > 0:
        body["duration_seconds"] = dur
    key = hashlib.sha1(json.dumps(body, sort_keys=True).encode()).hexdigest()[:10]
    mp3, js = OUT / f"sfx_{name}.mp3", OUT / f"sfx_{name}.json"
    if js.exists() and json.loads(js.read_text()).get("key") == key:
        print(f"cached {mp3.name}")
        return
    before = quota()[0]
    r = requests.post(f"{API}/sound-generation", headers=H, json=body, timeout=300)
    if r.status_code != 200:
        sys.exit(f"sfx {r.status_code}: {r.text[:400]}")
    mp3.write_bytes(r.content)
    js.write_text(json.dumps({"key": key, "body": body}, indent=1))
    print(f"-> {mp3.name}  ({quota()[0] - before} credits)")


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[0] == "quota":
        print("%d / %d credits used" % quota())
    elif a[0] == "tts":
        tts(a[1], a[2], a[3], a[4:])
    elif a[0] == "sfx":
        sfx(a[1], a[2], a[3:])
