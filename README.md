🎮🎶 **spc-converter** [![npm](https://img.shields.io/npm/v/spc-converter.svg)](https://www.npmjs.com/package/spc-converter)

Node.js library and command line program to convert [Super Nintendo SPC files](https://wiki.superfamicom.org/spc-and-rsn-file-format) to WAV files or PCM data.

## Use as a command line program

### Install

```
npm i -g spc-converter
```

### Use

#### Convert to WAV file

```
spc-converter file.spc file.wav
```

Outputs `file.wav`.

#### Options

```
spc-converter file.spc file.wav --length=120 --fade=5000 --rate=44100
```

- `--length`: How many seconds to play the song for before it fades out. Defaults to the length in the file's ID666 tag, or 150 seconds if it doesn't have one.
- `--fade`: How many milliseconds the song fades out for, after its length. Defaults to the fade in the file's ID666 tag, or 8000 if it doesn't have a length.
- `--xid6-length`: Take the song's length from its xid6 tags instead of its ID666 tag, if it has them. They're more exact, but are wrong in many files.
- `--silence`: How many seconds of silence end the song early. Defaults to 6. Use 0 to always play the whole length.
- `--rate`: The WAV file's sample rate. Defaults to 48000. The Super Nintendo's own is 32000, which needs no resampling.
- `--no-amplification`: Ignoring the amplification in xid6 tags.

An option that isn't one of these (like `--lenght=10`) is an error, which suggests the option you may have meant.

## Use in Node.js

### Install

```
npm i spc-converter
```

### Use

Convert a SPC file to a WAV file in your own Node.js script:

```javascript
const fs = require('fs')
const file = 'file.spc'

// initialize SPCPlayer module
const SPCPlayer = await require('spc-converter')()

// convert SPC file to WAV Buffer
const wavBuffer = await SPCPlayer.renderToWavBlob(file)

// write to file
const outputFileName = file.split('.spc')[0] + '.wav'
fs.writeFileSync(outputFileName, wavBuffer)
```

You can also use this library to convert a SPC file directly to PCM audio:

```javascript
const file = 'file.spc'

// initialize SPCPlayer module
const SPCPlayer = await require('spc-converter')()

// convert SPC file to PCM Buffer
const pcmBuffer = await SPCPlayer.renderToPCMBuffer(file)
console.log(pcmBuffer) // then you can do something with the PCM audio data
```

The PCM audio is interleaved stereo 32-bit floats at 48000 Hz, as the bytes of a `Uint8Array`.

Both functions take a file path or the file's bytes, and an optional object of options:

- `lengthSeconds`: How many seconds to play the song for before it fades out.
- `fadeMilliseconds`: How many milliseconds the song fades out for, after its length.
- `xid6Length`: `true` to take the song's length from its xid6 tags instead of its ID666 tag, if it has them. They're more exact (an intro, a loop played a number of times, and an end, to 1/64000th of a second), but are wrong in many files, which is why game-music-emu ignores them.
- `silenceSeconds`: How many seconds of silence end the song early. Defaults to 6. Use 0 to always play the whole length.
- `sampleRate`: The sample rate to convert to. Defaults to 48000. The Super Nintendo's own is 32000, which needs no resampling. Converting to other rates uses a windowed sinc filter, which doesn't add the distortion simpler resampling does.
- `amplification`: `false` ignore the amplification in its xid6 tags.

```javascript
const pcmBuffer = await SPCPlayer.renderToPCMBuffer(file, { lengthSeconds: 120, fadeMilliseconds: 5000, sampleRate: 32000 })
```

Songs play for as long as their [ID666 tag](https://wiki.superfamicom.org/spc-and-rsn-file-format) says (in either of its text or binary formats), then fade out for as long as it says. Songs whose tag doesn't say how long to play, including files without a tag, play for 150 seconds then fade out over 8 seconds, as [game-music-emu](https://github.com/libgme/game-music-emu) does. A song that goes silent for 6 seconds ends there (keeping a second of the silence), also as game-music-emu does, so songs that finish sooner than their length don't trail off into silence. To find out how long a song will be without converting it (at most, since whether it goes silent sooner can't be known without playing it):

```javascript
const { lengthSeconds, fadeMilliseconds } = SPCPlayer.getSongLength(file)
```

## Development

Install [Node.js](https://nodejs.org) and either [Docker](https://www.docker.com/products/docker-desktop/) or [Emscripten](https://emscripten.org/docs/getting_started/downloads.html).

1. Clone this repo.
2. `npm ci`
3. `git submodule update --init`
4. `npm run build`
5. `npm t`
