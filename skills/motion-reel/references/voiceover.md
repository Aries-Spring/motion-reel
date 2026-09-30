# Voice-over (optional)

Only when the brief has a voice (narrator, talking character). Tools and worked examples:
- `scripts/voice.py`: quota, voice list, cached takes + forced alignment. `scripts/scribe.py`: transcripts.
- `references/examples/score_vo.py`: `build_vo()`, the beat-locked edit and the `lipsync.json` export,
  inside a full bespoke score (copy it to `<film>/audio/score.py` and adapt).
- `references/examples/rig_split.py` + `lipsync_rig.js`: turning a flat illustrated portrait into a
  talking cut-out (clean plate, feature layer, jaw warp, vector mouth).

## Script
- Budget ~2.5 words/s for a clear read, ~3 for an energetic one, and leave the first beat and the
  end card's last 1.5 s free. 15 s holds ~30 words. Time it: a take that runs long gets cut by
  rewriting, not by speeding past 1.2x.
- Write in the language's own script (Urdu in Urdu script, not Roman) for correct pronunciation;
  on-screen supers can use the brand's own romanisation.
- Prefer words the chosen voice can say: e.g. a non-native voice flattens retroflex consonants, so
  pick synonyms that avoid them in key words.

## ElevenLabs
- The key comes from the user; pass it as `ELEVENLABS_API_KEY` in the environment. Never write it
  into the project, keep any copy outside it, and suggest rotating it if it was pasted in chat.
- Check the plan first (`voice.py --quota`, `voice.py --voices`): free-tier keys can only use
  **premade** voices through the API (library voices return 402, voice design 403) and run at most 2
  requests at once. Budget characters: each take of a 15-20 s script costs ~200-250.
- `eleven_v4` covers the widest set of languages (incl. Urdu); set `language_code`. v3/v4 audio tags
  like `[excited]` steer delivery without being spoken.
- `voice.py` caches every take on disk keyed by (text, voice, model, language, settings) and never
  re-requests an existing one. Put the line in `<film>/audio/script.txt`.
- Pick between voices by evidence, not by guess: run each take through Scribe
  (`scribe.py`) and compare the transcript to the script, especially the brand name.
- TTS `with-timestamps` alignment runs ~90 ms late; `voice.py` also force-aligns each take
  (`<take>.fa.json`), and that is what the edit and the lip sync use.

## Edit onto the grid
Cut the take into phrases at silences (or in the closure before a plosive, ~-33 dB is fine), then
place each phrase so its speech onset lands on a beat. A 3-3-2 syncopation (beats 0, 1.5, 3) suits a
three-word slogan. Print the gaps between placed phrases and fix any overlap. Write the result to
`<film>/audio/vo.wav` (mix.mjs ducks the music under it) and the re-timed word list to the film
(for kinetic type that appears as each word is said).

## Lip sync (talking characters)
From the forced alignment: map each character to a viseme class (closed M/B/P, F/V bite, rounded O/U,
wide E/I, open A, default consonant), re-time by the phrase edit, and export with a 100 Hz mouth-open
envelope from the processed VO. In the film, blend visemes over +/-40 ms (coarticulation) and scale
mouth height by the envelope.

## Verify
Transcribe the final mix with Scribe: every word, and the brand name, must come back right with the
music under it. If not, deepen the ducking or lift the VO before touching anything else.
