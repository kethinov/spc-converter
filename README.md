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
spc-converter file.spc
```

Outputs file.wav

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

## Development

### Run tests

- Clone this repo
- `npm ci`
- `npm t`

### Background

This project is a heavily-modified hard fork of https://codeberg.org/Telinc1/smwcentral-spc-player to repurpose it as a generic converter for SPC files to WAV or PCM audio data.
