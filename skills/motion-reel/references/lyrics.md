# Music and lyric videos

For a song the user supplies (theirs, or one they have the rights to use for this video). The song is
the soundtrack and the clock: the film runs the whole track, the beat grid comes from it, every lyric
lands on its sung word, and a singer (if there is one) lip-syncs to the actual vocal. The lyric sheet
stays in the film folder; don't copy it anywhere else.

## Pipeline

1. **Grid**: `uv run <skill>/scripts/beats.py <film> --track song.mp3 --full`. Keeps the whole track,
   sets film.json's duration to its length, beat 0 on the first downbeat (a pickup sits at negative
   beats). It prints how it chose the downbeat (harmonic change into the beat, then the kick); if the
   bar lines look shifted against the sections you hear, pass `--downbeat SECONDS` (any bar's first beat).
   Sections: name them from the bar energy in beats.json plus where the vocal enters and drops out.
2. **Vocal + draft**: `uv run <skill>/scripts/lyrics.py <film>`. Demucs separates the vocal
   (`audio/stems/vocals.wav`, `no_vocals.wav`); two Whisper models transcribe it; you get
   `docs/lyrics.txt` (a draft) and `docs/lyrics_check.md` (every window where the models disagree, and
   stretches of vocal with no words). First run downloads ~3.5 GB of models.
3. **Fix the sheet.** This is the step that decides whether the video is right. For each entry in
   lyrics_check.md:
   - Ask the user. They know their song; show them only the disputed phrases, not the sheet.
   - Score the readings against the vocal: write `docs/candidates.txt`
     ```
     @ 29.4 36.2
     see the ocean rise
     see the motion rise
     sea and lotion rise
     ```
     and run `uv run <skill>/scripts/align.py <film> --candidates docs/candidates.txt`. Lower loss per
     token = the audio agrees more. Differences under ~0.05 are noise.
   - Break ties with meaning and rhyme (a verse that rhymes fire / wire / higher wants a fourth -ire).
   - Whatever stays a guess, tell the user which lines, so they can correct the sheet.
   Write numbers, acronyms and symbols with a spoken form: `NASA|n_a_s_a`, `2049|twenty_forty_nine`,
   `x²|x_squared`. Keep windows 5-20 s ('@ t0 t1 name'); one sung line per row.
4. **Align**: `uv run <skill>/scripts/align.py <film>` -> `lyrics.json` (every word's t0/t1) and
   `lipsync.json` (100 Hz mouth envelope). It prints a check: word starts vs the vocal's own onsets
   (expect a median within ~10 ms) and flags lines whose words got crushed (< 35 ms), the sign that the
   text doesn't match the audio there.
5. **Shot list** on the grid as usual, one row per lyric line or per 4-8 beats, marking which words get
   a visual (the noun that becomes the shot: the word the camera dives on, the image a line names).

## What goes wrong with sung lyrics

- One Whisper model can go deaf for a whole verse (it scores singing over a mix as "no speech").
  lyrics.py keeps both models and drafts each stretch from whichever heard more; never trust one pass.
- Whisper invents words over instrumentals ("Thank you." on the outro); lyrics.py drops segments
  with no vocal energy under them. Held vowels and vocalise come back as nothing: lyrics_check.md lists
  vocal stretches with no words so you can decide (a "vocalise" moment, not a missing line).
- Whisper's own word timestamps run ~30 ms off the vocal onsets; the forced aligner lands ~10 ms. Use
  align.py's times for anything that hits on a word.
- Acronyms and jargon come back as near-misses (an initialism heard as a made-up word); a prompt with the song's
  vocabulary helps Whisper but can also make it hallucinate that vocabulary. Candidates + ear decide.

## Type for lyrics

- Two clocks: shots and accents on the beat grid (`u`), words on their sung time (`t`, lyrics.json).
  A word appears ~40 ms before its t0 (the eye leads the ear); the current word takes the accent colour.
- One lyric style per section so the type never repeats a trick (stamp, type-on, karaoke wipe, a
  vertical column, words riding 3-D objects, tags, decode...), and every sung line readable on the phone
  sheets: 80 px or larger at 1080p for the main line, a stroke in the ground colour when it sits over
  busy footage, unsung words in a karaoke line still legible (not 10 % grey on black).
- Lay a line out once (cache it), then reveal words on their times; don't reflow mid-line. Keep at most
  two rows; long lines go over two shots rather than three rows.

## A singer

`references/examples/vector_rig.js` (a 2.5-D character drawn in code) and `performance.js` (lip sync from
lipsync.json + vowel shapes from lyrics.json, seeded blinks, nods on line onsets, hair follow-through).
The mouth opens with the vocal envelope; the vowel being sung shapes it (o/u round, e/i wide); blend
over +/-40 ms. Give her direction per shot through the overrides (eyes, brows, look, a wink on a beat):
a singer who only lip-syncs reads as a puppet.
