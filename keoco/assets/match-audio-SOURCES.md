# Match announcer and start whistle

Added 2026-11-02. Files are bundled locally; playback makes no third-party requests.

- `count-3.mp3`, `count-2.mp3`, `count-1.mp3`: sorrentix, [countdown 3 2 1 jump](https://freesound.org/people/sorrentix/sounds/412018/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Source HQ preview: https://cdn.freesound.org/previews/412/412018_7966561-hq.mp3. Extracted 0.54–1.28s, 1.75–2.39s, 2.66–3.46s. The final word “jump” is excluded.
- `ko.mp3`: pyro13djt, [Random Video Game Vocals.wav](https://freesound.org/people/pyro13djt/sounds/338223/), [CC0](https://creativecommons.org/publicdomain/zero/1.0/). Source HQ preview: https://cdn.freesound.org/previews/338/338223_4316284-hq.mp3. Extracted the opening “KO”, 0–1.04s.
- `start-whistle.mp3`: Mixkit, “Police short whistle”, item 615 on the [sports SFX page](https://mixkit.co/free-sound-effects/sports/), [Sound Effects Free License](https://mixkit.co/license/modal/sfxFree/). Source preview: https://assets.mixkit.co/active_storage/sfx/615/615-preview.mp3. Extracted 0–0.57s. Used as part of this game; do not redistribute as a standalone sound pack.

Processing: FFmpeg, mono 44.1 kHz MP3 at 96 kbps, loudness target -18 LUFS / -2 dBTP and 35ms fade out. Countdown digits are separate files to follow the authoritative timer even after pausing or reconnecting. The voice is English (“three, two, one”, “K O”).
