// converts SPC files to PCM audio or WAV files, by playing them with blargg's snes_spc emulator, built from its source with its cycle accurate DSP emulator (see build-wasm.js)
//
// a song plays for as long as its ID666 tag says (read with spc-tag, in either of the tag's formats), then fades out for as long as the tag says; songs whose tag doesn't say play for 2.5 minutes and fade out over 8 seconds, as game-music-emu (and so players built on it, like https://chiptune.app) does. A song that goes silent for 6 seconds ends there, also as game-music-emu does, so songs that end sooner than their length don't trail off into silence

const fs = require('fs')
const { readSPCID666Tags } = require('spc-tag')
const didYouMean = require('./didYouMean')

const NATIVE_SAMPLE_RATE = 32000 // the rate the Super Nintendo's sound chip, and so the emulator, plays at
const DEFAULT_LENGTH_SECONDS = 150
const DEFAULT_FADE_MILLISECONDS = 8000
const DEFAULT_SILENCE_SECONDS = 6
const SILENCE_THRESHOLD = 8 // samples this close to 0 (out of 32768) count as silence, as in game-music-emu (see count_silence() in https://github.com/libgme/game-music-emu/blob/master/gme/Music_Emu.cpp)
const SILENCE_KEPT = NATIVE_SAMPLE_RATE // how much of a silence that ends a song is kept, in frames, so whatever was fading away into it isn't cut off
const XID6_TICKS_PER_SECOND = 64000 // xid6 lengths are in ticks of 1/64000th of a second
const SPC_SIGNATURE = 'SNES-SPC700 Sound File Data'
const SPC_MIN_SIZE = 0x10180 // the header, 64KB of RAM, and the DSP registers; the rest of a full file (unused space and extra RAM) is optional
const FRAMES_PER_CHUNK = NATIVE_SAMPLE_RATE * 5 // how much is played between yields to the event loop, so converting doesn't block it for long
const OPTION_NAMES = ['lengthSeconds', 'fadeMilliseconds', 'xid6Length', 'silenceSeconds', 'sampleRate']

module.exports = async () => {
  const emulator = await require('./spc-emulator')()

  // the song's length in seconds and fade in milliseconds: the ones given in `options`, or else the ones its tags say, or else the defaults
  //
  // the length comes from the ID666 tag, unless options.xid6Length is set and the file has xid6 tags with a length, which are more exact (to 1/64000th of a second, as an intro, a loop played a number of times, and an end), but are wrong in many files, which is why game-music-emu ignores them
  function songLength (spc, options) {
    const tags = readSPCID666Tags(Buffer.from(spc.buffer, spc.byteOffset, spc.byteLength))
    let tagged = { lengthSeconds: tags.lengthSeconds, fadeMilliseconds: tags.lengthSeconds !== null ? tags.fadeMilliseconds ?? 0 : null }
    if (options.xid6Length) {
      const signed = (ticks) => ticks > 0x7FFFFFFF ? ticks - 0x100000000 : ticks // the end can be negative
      const ticks = (tags.introLength ?? 0) + (tags.loopLength ?? 0) * (tags.loopCount ?? 1) + signed(tags.endLength ?? 0)
      if (ticks > 0) tagged = { lengthSeconds: ticks / XID6_TICKS_PER_SECOND, fadeMilliseconds: tags.fadeLength !== undefined ? tags.fadeLength / XID6_TICKS_PER_SECOND * 1000 : tagged.fadeMilliseconds ?? 0 }
    }
    return {
      lengthSeconds: options.lengthSeconds ?? tagged.lengthSeconds ?? DEFAULT_LENGTH_SECONDS,
      fadeMilliseconds: options.fadeMilliseconds ?? tagged.fadeMilliseconds ?? DEFAULT_FADE_MILLISECONDS
    }
  }

  // plays the song for up to `totalFrames` at the emulator's own rate, as interleaved stereo 16 bit samples, stopping early once it's been silent for `silenceFrames` (if that's not 0); returns the samples played
  async function play (spc, totalFrames, silenceFrames) {
    const spcPointer = emulator._malloc(spc.length)
    emulator.HEAPU8.set(spc, spcPointer)
    const loadError = emulator._load_spc(spcPointer, spc.length)
    emulator._free(spcPointer) // the emulator keeps its own copy
    if (loadError) throw new Error(`Couldn't play the SPC file: ${emulator.UTF8ToString(loadError)}`)

    const samples = new Int16Array(totalFrames * 2)
    const chunkPointer = emulator._malloc(FRAMES_PER_CHUNK * 2 * Int16Array.BYTES_PER_ELEMENT)
    let lastSound = -1 // the last frame that wasn't silent
    try {
      for (let frame = 0; frame < totalFrames; frame += FRAMES_PER_CHUNK) {
        const frames = Math.min(FRAMES_PER_CHUNK, totalFrames - frame)
        const playError = emulator._play_spc(chunkPointer, frames * 2)
        if (playError) throw new Error(`Couldn't play the SPC file: ${emulator.UTF8ToString(playError)}`)
        const chunk = emulator.HEAP16.subarray(chunkPointer / 2, chunkPointer / 2 + frames * 2) // the heap is read after playing, since it can grow (and be replaced) while playing
        samples.set(chunk, frame * 2)
        if (silenceFrames) {
          for (let i = chunk.length - 1; i >= 0; i--) {
            if (Math.abs(chunk[i]) > SILENCE_THRESHOLD) {
              lastSound = frame + (i >> 1)
              break
            }
          }
          if (frame + frames - 1 - lastSound >= silenceFrames) return samples.subarray(0, Math.min(totalFrames, lastSound + 1 + SILENCE_KEPT) * 2)
        }
        await new Promise(resolve => setImmediate(resolve))
      }
    } finally {
      emulator._free(chunkPointer)
    }
    return samples
  }

  // renders a song to interleaved stereo 32 bit float pcm at `sampleRate`, with its fade applied; returns { pcm, sampleRate }
  async function render (filePathOrArrayBuffer, options = {}) {
    warnAboutUnknownOptions(options)
    const spc = readSpc(filePathOrArrayBuffer)
    const { lengthSeconds, fadeMilliseconds } = songLength(spc, options)
    const sampleRate = options.sampleRate ?? 48000
    const fadeFrames = Math.round(fadeMilliseconds / 1000 * NATIVE_SAMPLE_RATE)
    const totalFrames = Math.round(lengthSeconds * NATIVE_SAMPLE_RATE) + fadeFrames
    const samples = await play(spc, totalFrames, Math.round((options.silenceSeconds ?? DEFAULT_SILENCE_SECONDS) * NATIVE_SAMPLE_RATE))

    // to floats, fading out over the end (unless it went silent and ended before then)
    const native = new Float32Array(samples.length)
    const fadeStart = totalFrames - fadeFrames
    for (let frame = 0; frame < samples.length / 2; frame++) {
      const gain = frame < fadeStart ? 1 : 1 - (frame - fadeStart) / fadeFrames
      native[frame * 2] = samples[frame * 2] / 32768 * gain
      native[frame * 2 + 1] = samples[frame * 2 + 1] / 32768 * gain
    }

    return { pcm: resample(native, NATIVE_SAMPLE_RATE, sampleRate), sampleRate }
  }

  return {
    // renders an SPC file (a path, or its bytes) to pcm: interleaved stereo 32 bit floats, as the bytes of a Uint8Array
    //
    // options: { lengthSeconds, fadeMilliseconds, xid6Length, silenceSeconds, sampleRate }: to play the song for a length other than the one its tags say, to take its length from its xid6 tags, to end it after a silence of another length (or 0 to never end it early), and to convert it to a sample rate other than 48000 (32000 is the emulator's own, which needs no resampling)
    renderToPCMBuffer: async function (filePathOrArrayBuffer, options) {
      const { pcm } = await render(filePathOrArrayBuffer, options)
      return new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength)
    },

    // renders an SPC file (a path, or its bytes) to a 16 bit stereo WAV file, as a Buffer; takes the same options as renderToPCMBuffer
    renderToWavBlob: async function (filePathOrArrayBuffer, options) {
      const { pcm, sampleRate } = await render(filePathOrArrayBuffer, options)
      return encodeWAV(pcm, sampleRate, 2)
    },

    // how long a song plays and fades out for: { lengthSeconds, fadeMilliseconds }, from its tags or the defaults, as rendering would use; it can end sooner if it goes silent, which can't be known without playing it. Takes the lengthSeconds, fadeMilliseconds, and xid6Length options
    getSongLength: function (filePathOrArrayBuffer, options = {}) {
      warnAboutUnknownOptions(options)
      return songLength(readSpc(filePathOrArrayBuffer), options)
    }
  }
}

// warns (with a node warning, which can be silenced) about options that would be ignored because they're misspelled, suggesting the one that was meant
function warnAboutUnknownOptions (options) {
  for (const name of Object.keys(options)) {
    if (OPTION_NAMES.includes(name)) continue
    const suggestion = didYouMean(name, OPTION_NAMES)
    process.emitWarning(`spc-converter: ignoring unknown option "${name}".${suggestion ? ` Did you mean "${suggestion}"?` : ''}`)
  }
}

// an SPC file's bytes, from a path or bytes, checked to be an SPC file
function readSpc (filePathOrArrayBuffer) {
  const spc = typeof filePathOrArrayBuffer === 'string' ? new Uint8Array(fs.readFileSync(filePathOrArrayBuffer)) : new Uint8Array(filePathOrArrayBuffer.buffer ?? filePathOrArrayBuffer, filePathOrArrayBuffer.byteOffset ?? 0, filePathOrArrayBuffer.byteLength)
  if (spc.length < SPC_MIN_SIZE || new TextDecoder('latin1').decode(spc.subarray(0, SPC_SIGNATURE.length)) !== SPC_SIGNATURE) throw new Error('Not an SPC file')
  return spc
}

// converts interleaved stereo pcm from one sample rate to another, with a windowed sinc filter (https://ccrma.stanford.edu/~jos/resample/), which keeps frequencies up to the lower of the two rates' limits intact and filters out the ones above it, so converting adds no aliasing or imaging
//
// each output sample is a weighted sum of the TAPS input samples around it, weighted by a sinc function, which is the ideal filter, cut off by a Blackman window; the weights are worked out in advance for PHASES positions between input samples. When converting down to a lower rate, the filter is widened by the ratio of the rates, so that it cuts off at the lower rate's limit
const TAPS = 32
const PHASES = 512
function resample (input, fromRate, toRate) {
  if (fromRate === toRate) return input
  const ratio = toRate / fromRate
  const cutoff = Math.min(1, ratio) * 0.97 // as a fraction of the input's highest frequency, a little under the output's, leaving room for the filter to roll off
  const halfWidth = Math.ceil(TAPS / 2 / Math.min(1, ratio))
  const width = halfWidth * 2

  // the weights, for each phase: the filter centered at that fraction of the way between two input samples
  const weights = new Float32Array((PHASES + 1) * width)
  for (let phase = 0; phase <= PHASES; phase++) {
    const fraction = phase / PHASES
    let sum = 0
    for (let tap = 0; tap < width; tap++) {
      const x = tap - halfWidth + 1 - fraction // how far this input sample is from the output sample, in input samples
      const sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x)
      const position = (x + halfWidth) / width // 0 to 1 across the window
      const window = position <= 0 || position >= 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * position) + 0.08 * Math.cos(4 * Math.PI * position)
      const weight = cutoff * sinc * window
      weights[phase * width + tap] = weight
      sum += weight
    }
    for (let tap = 0; tap < width; tap++) weights[phase * width + tap] /= sum // so a constant signal comes out the same
  }

  const inputFrames = input.length / 2
  const outputFrames = Math.floor(inputFrames * ratio)
  const output = new Float32Array(outputFrames * 2)
  for (let frame = 0; frame < outputFrames; frame++) {
    const position = frame / ratio
    const before = Math.floor(position)
    const weightsAt = Math.round((position - before) * PHASES) * width
    const first = before - halfWidth + 1
    let left = 0
    let right = 0
    for (let tap = 0; tap < width; tap++) {
      const inputFrame = Math.min(inputFrames - 1, Math.max(0, first + tap)) // the edges are extended, rather than treated as silence
      const weight = weights[weightsAt + tap]
      left += input[inputFrame * 2] * weight
      right += input[inputFrame * 2 + 1] * weight
    }
    output[frame * 2] = left
    output[frame * 2 + 1] = right
  }
  return output
}

module.exports.resample = resample // for the tests

function encodeWAV (samples, sampleRate, numChannels) {
  const buffer = new ArrayBuffer(44 + samples.length * 2)
  const view = new DataView(buffer)

  // RIFF identifier 'RIFF'
  view.setUint32(0, 0x52494646, false)
  // file length minus RIFF identifier length and file description length
  view.setUint32(4, 36 + samples.length * 2, true)
  // RIFF type 'WAVE'
  view.setUint32(8, 0x57415645, false)
  // format chunk identifier 'fmt '
  view.setUint32(12, 0x666d7420, false)
  // format chunk length
  view.setUint32(16, 16, true)
  // sample format (raw)
  view.setUint16(20, 1, true)
  // channel count
  view.setUint16(22, numChannels, true)
  // sample rate
  view.setUint32(24, sampleRate, true)
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * 2, true)
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true)
  // bits per sample
  view.setUint16(34, 16, true)
  // data chunk identifier 'data'
  view.setUint32(36, 0x64617461, false)
  // data chunk length
  view.setUint32(40, samples.length * 2, true)

  // write the PCM samples
  let offset = 44
  for (let i = 0; i < samples.length; i++, offset += 2) {
    // clamp and convert float [-1,1] to int16
    const s = Math.max(-1, Math.min(1, samples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true)
  }

  return Buffer.from(buffer)
}
