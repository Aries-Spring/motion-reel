# Voice-over (optional)

Only when the brief has a voice (narrator, talking character); a reel without one is the default and
needs none of this. There are two sources of a voice:
- **A recording the user supplies**: no account needed. See "A supplied recording" below.
- **ElevenLabs**, through the optional `motion-reel-voice` plugin's MCP tools: `quota`, `voices`, `tts`
  (cached takes + forced alignment) and `transcribe` (Scribe). In Claude Code they appear as
  `mcp__plugin_motion-reel-voice_elevenlabs__<tool>`.

Worked examples (for either source):
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

## A supplied recording
Ask for a clean, dry take (wav or mp3, no music) and put it in `<film>/audio/vo/`. Everything below
still applies except the forced alignment, which only the ElevenLabs tools provide:
- Cut phrases at silences in the recording's own RMS envelope (-35 dB with a 150 ms minimum gap is a
  good start) instead of at aligned word boundaries, then land each phrase onset on a beat as usual.
- Lip sync from the processed VO's 100 Hz envelope alone: export `lipsync.json` with an empty
  `visemes` list; `lipsync_rig.js` then opens the mouth by loudness with a neutral width, which reads
  well at video speed.
- Time supers per phrase (from the placed phrase onsets) rather than per word.
If the user also has the `motion-reel-voice` tools, `transcribe` works on any recording as a check.

## ElevenLabs (motion-reel-voice add-on)
- If the `mcp__plugin_motion-reel-voice_elevenlabs__*` tools aren't available, the add-on isn't
  installed: `claude plugin install motion-reel-voice@aries-spring`. Otherwise use a supplied
  recording or skip the voice.
- The key is that plugin's option **ElevenLabs API key**, which the user sets once with
  `/plugin configure motion-reel-voice` (then `/reload-plugins`); it lives in the OS credential
  store and only the local MCP server sees it. If a tool says no key is set, ask the user to set it
  there. Never ask for the key in chat or write it anywhere; if they paste one anyway, point them to
  the option and suggest rotating it.
- Check the plan first (`quota`, `voices`): free-tier keys can only use
  **premade** voices through the API (library voices return 402, voice design 403) and run at most 2
  requests at once. Budget characters: each take of a 15-20 s script costs ~200-250.
- `eleven_v4` covers the widest set of languages (incl. Urdu); set `language_code`. v3/v4 audio tags
  like `[excited]` steer delivery without being spoken.
- `tts` caches every take on disk keyed by (text, voice, model, language, settings) and never
  re-requests an existing one. Put the line in `<film>/audio/script.txt` and pass absolute paths.
- Pick between voices by evidence, not by guess: run each take through `transcribe` and compare
  the transcript to the script, especially the brand name.
- TTS `with-timestamps` alignment runs ~90 ms late; `tts` also force-aligns each take
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
With the ElevenLabs tools, transcribe the final mix with `transcribe` (export an mp3 of `mix.wav`
first); without them, listen-check by rendering the phrase list against the mix. Every word, and the brand name, must come back right with the
music under it. If not, deepen the ducking or lift the VO before touching anything else.
