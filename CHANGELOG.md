## 2.0.0

- Breaking: requires Node.js 22 or newer (Node.js 20 reached its end of life in April 2026), as spc-tag 1.1.0 does.
- Replaced emulator to now use snes_spc's cycle-accurate DSP emulator rather than its faster, less accurate one, which SMW Central's player (and game-music-emu) use. Songs sound almost the same, but ones that depend on the sound chip's exact timing play more faithfully.
- Added options to `renderToPCMBuffer` and `renderToWavBlob`: `lengthSeconds`, `fadeMilliseconds`, and `sampleRate`, and the same as `--length`, `--fade`, and `--rate` for the command line program.
- Added `getSongLength`, to find out how long a song will be without converting it.
- Added a `silenceSeconds` option and `--silence` flag. Songs that go silent for 6 seconds now end there (keeping a second of the silence), as game-music-emu does, rather than trailing off into silence. Use the new option to change how long, or turn it off with 0.
- Added an `xid6Length` option and `--xid6-length` flag, to take a song's length from its xid6 tags (an intro, a loop played a number of times, and an end) instead of its ID666 tag.
- Changed fade behavior: Songs now fade out after their length, as the ID666 tag means, rather than over the end of it, so they're longer by their fade.
- Fixed a bug which caused files without an ID666 tag, or whose tag doesn't say how long to play the song converting to nothing. Now such songs play for 150 seconds then fade out over 8 seconds.
- Fixed a bug where ID666 tag declaring how long to play a song was not respected.
- Fixed possible distortion bug. Audio is now resampled from the Super Nintendo's 32000 Hz with a windowed sinc filter, rather than by linear interpolation, which added audible distortion to high notes.
- Fixed a slight drift in timing over long songs, from how the audio was resampled.
- Fixed other smaller things too.
- Updated dependencies.

## 1.0.0

- Initial version.
