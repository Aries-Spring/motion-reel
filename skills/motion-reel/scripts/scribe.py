# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""Intelligibility check: transcribe takes, or the final mix, with ElevenLabs Scribe.

    uv run <skill>/scripts/scribe.py <film>/audio/vo/bill_t1.mp3 [more files] [--language urd]

Compare the transcript to the script word by word, the brand name above all. Pick between voices on
this evidence, and run it on the mastered mix: if a word drops out under the music, deepen the
ducking or lift the VO before touching anything else. Uses ELEVENLABS_API_KEY.
"""

import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from voice import call, multipart  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--language", default=None, help="ISO 639-1/-3 code (e.g. urd); default auto-detect")
    a = ap.parse_args()
    key = os.environ.get("ELEVENLABS_API_KEY") or sys.exit("set ELEVENLABS_API_KEY")
    for f in a.files:
        fields = {"model_id": "scribe_v1", **({"language_code": a.language} if a.language else {})}
        body, h = multipart(fields, "file", Path(f))
        print(f"{f}:\n  {call('/speech-to-text', key, body, h)['text']}\n")


if __name__ == "__main__":
    main()
