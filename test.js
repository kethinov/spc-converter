const { describe, it, before } = require('node:test')
const assert = require('node:assert')
const { execFileSync, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const { writeSPCID666Tags } = require('spc-tag')
const { resample } = require('./loadSpcPlayer')
const didYouMean = require('./didYouMean')

// runs the command line program, returning its exit code and what it printed
function spcConverter (...args) {
  const { status, stdout, stderr } = spawnSync(process.execPath, ['spc-converter.js', ...args], { encoding: 'utf8' })
  return { status, stdout, stderr }
}

describe('spc-converter command line tests', () => {
  it('should print an error when no arguments are passed', () => {
    try {
      execFileSync(process.execPath, ['spc-converter.js'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('Please supply a valid input SPC file'))
    }
  })

  it('should print an error when input file is not an SPC file', () => {
    try {
      execFileSync(process.execPath, ['spc-converter.js', 'test.txt', 'output.wav'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('Please supply a valid input SPC file'))
    }
  })

  it('should print an error when output file is not a WAV file', () => {
    fs.writeFileSync('test.spc', Buffer.alloc(66048, 0))
    try {
      execFileSync(process.execPath, ['spc-converter.js', 'test.spc', 'output.mp3'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('This tool outputs .wav files'))
    } finally {
      fs.unlinkSync('test.spc')
    }
  })

  it('should print an error when input file does not exist', () => {
    try {
      execFileSync(process.execPath, ['spc-converter.js', 'nonexistent.spc', 'output.wav'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('Input file not found'))
    }
  })

  it('should convert for the length and fade given as options, at the sample rate given', () => {
    fs.writeFileSync('test.spc', makeSampleSPCFile())
    try {
      const output = execFileSync(process.execPath, ['spc-converter.js', 'test.spc', 'output.wav', '--length=2', '--fade=500', '--rate=32000'], { encoding: 'utf8' })
      assert(output.includes('(2 seconds, then a 0.5 second fade, or until it goes silent)'))
      const wav = fs.readFileSync('output.wav')
      assert.strictEqual(wav.readUInt32LE(24), 32000) // sample rate
      assert.strictEqual(wav.readUInt32LE(40), 2.5 * 32000 * 2 * 2) // bytes of 16 bit stereo audio
    } finally {
      if (fs.existsSync('test.spc')) fs.unlinkSync('test.spc')
      if (fs.existsSync('output.wav')) fs.unlinkSync('output.wav')
    }
  })

  it('should print an error when an option isn\'t a number', () => {
    fs.writeFileSync('test.spc', makeSampleSPCFile())
    try {
      execFileSync(process.execPath, ['spc-converter.js', 'test.spc', 'output.wav', '--length=long'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('--length needs to be a number'))
    } finally {
      fs.unlinkSync('test.spc')
    }
  })

  it('should successfully convert an SPC file to WAV', () => {
    fs.writeFileSync('test.spc', makeSampleSPCFile())
    try {
      const output = execFileSync(process.execPath, ['spc-converter.js', 'test.spc', 'output.wav'], { encoding: 'utf8' })
      assert(output.includes('Converting test.spc to output.wav'))
      assert(output.includes('Successfully wrote output.wav'))
      assert(fs.existsSync('output.wav'), 'Output WAV file should exist')
      const stats = fs.statSync('output.wav')
      assert(stats.size > 0, 'Output WAV file should not be empty')
    } finally {
      if (fs.existsSync('test.spc')) fs.unlinkSync('test.spc')
      if (fs.existsSync('output.wav')) fs.unlinkSync('output.wav')
    }
  })

  it('should print an error for an option that isn\'t one, suggesting the one that was meant', () => {
    fs.writeFileSync('test.spc', makeSampleSPCFile())
    try {
      const { status, stderr } = spcConverter('test.spc', 'output.wav', '--lenght=10')
      assert.strictEqual(status, 1)
      assert(stderr.includes('Unknown option --lenght. Did you mean --length?'))
      assert(!fs.existsSync('output.wav'))
      assert(spcConverter('test.spc', 'output.wav', '--xid6length').stderr.includes('Unknown option --xid6length. Did you mean --xid6-length?'))
      const { stderr: unrelated } = spcConverter('test.spc', 'output.wav', '--verbose')
      assert(unrelated.includes('Unknown option --verbose.'))
      assert(!unrelated.includes('Did you mean'))
    } finally {
      fs.unlinkSync('test.spc')
    }
  })

  it('should print an error for an option without a value, or a flag with one', () => {
    const { status, stderr } = spcConverter('test.spc', 'output.wav', '--length', '10')
    assert.strictEqual(status, 1)
    assert(stderr.includes('--length needs to be a number, like --length=120'))
    assert(spcConverter('test.spc', 'output.wav', '--xid6-length=yes').stderr.includes('--xid6-length doesn\'t take a value'))
  })

  it('should print an error for too many arguments', () => {
    const { status, stderr } = spcConverter('test.spc', 'output.wav', 'extra.wav')
    assert.strictEqual(status, 1)
    assert(stderr.includes('Too many arguments: extra.wav.'))
  })
})

describe('did you mean tests', () => {
  it('should measure the Levenshtein distance between two strings', () => {
    assert.strictEqual(didYouMean.levenshtein('kitten', 'sitting'), 3)
    assert.strictEqual(didYouMean.levenshtein('', 'abc'), 3)
    assert.strictEqual(didYouMean.levenshtein('same', 'same'), 0)
    assert.strictEqual(didYouMean.levenshtein('lenght', 'length'), 2) // a swap is two substitutions
  })

  it('should suggest the closest choice, ignoring case, if it\'s close enough to be a typo', () => {
    assert.strictEqual(didYouMean('lenghtSeconds', ['lengthSeconds', 'fadeMilliseconds']), 'lengthSeconds')
    assert.strictEqual(didYouMean('samplerate', ['sampleRate']), 'sampleRate')
    assert.strictEqual(didYouMean('verbose', ['length', 'fade', 'silence', 'rate', 'xid6-length']), undefined)
  })
})

describe('spc-converter library tests', { timeout: 30000 }, () => {
  let SPCPlayer
  before(async () => { SPCPlayer = await require('./loadSpcPlayer')() })
  const seconds = (pcm, sampleRate) => pcm.byteLength / 4 / 2 / sampleRate // interleaved stereo 32 bit floats

  it('should play a song for the length its text format tag says, then fade out for as long as it says', async () => {
    const spc = makeSampleSPCFile()
    spc.write('3', 0xA9, 'ascii') // a single digit text length is only trusted when the artist is where the text format keeps it, as it is here
    spc.write('1500', 0xAC, 'ascii')
    assert.deepStrictEqual(SPCPlayer.getSongLength(spc), { lengthSeconds: 3, fadeMilliseconds: 1500 })
    assert.strictEqual(seconds(await SPCPlayer.renderToPCMBuffer(spc, { silenceSeconds: 0 }), 48000), 4.5)
  })

  it('should play a song for the length its binary format tag says', async () => {
    const spc = makeSampleSPCFile()
    spc.fill(0, 0x9E, 0xD0)
    spc.writeUIntLE(4, 0xA9, 3)
    spc.writeUInt32LE(1000, 0xAC)
    spc.write('Binary Artist', 0xB0, 'ascii')
    assert.deepStrictEqual(SPCPlayer.getSongLength(spc), { lengthSeconds: 4, fadeMilliseconds: 1000 })
    assert.strictEqual(seconds(await SPCPlayer.renderToPCMBuffer(spc), 48000), 5)
  })

  it('should play a song without an ID666 tag for 2.5 minutes, then fade out over 8 seconds, as game-music-emu does', async () => {
    const spc = makeSampleSPCFile()
    spc.writeUInt8(27, 0x23) // 27 means there's no ID666 tag
    assert.deepStrictEqual(SPCPlayer.getSongLength(spc), { lengthSeconds: 150, fadeMilliseconds: 8000 })
    assert.strictEqual(seconds(await SPCPlayer.renderToPCMBuffer(spc, { sampleRate: 32000, silenceSeconds: 0 }), 32000), 158) // the sample file is silent, so it would otherwise end early
  })

  it('should end a song once it has been silent for 6 seconds, keeping a second of the silence, as game-music-emu does', async () => {
    const spc = makeSampleSPCFile() // its program does nothing, so it's silent
    assert.strictEqual(seconds(await SPCPlayer.renderToPCMBuffer(spc, { lengthSeconds: 20, sampleRate: 32000 }), 32000), 1)
    assert.strictEqual(seconds(await SPCPlayer.renderToPCMBuffer(spc, { lengthSeconds: 20, fadeMilliseconds: 0, silenceSeconds: 0, sampleRate: 32000 }), 32000), 20) // or never, with silenceSeconds 0
  })

  it('should take a song\'s length from its xid6 tags, if asked to', async () => {
    const spc = writeSPCID666Tags(makeSampleSPCFile(), { introLength: 64000 * 2, loopLength: 64000, loopCount: 2, endLength: 0, fadeLength: 32000 }) // lengths are in 1/64000ths of a second
    spc.write('9', 0xA9, 'ascii')
    assert.deepStrictEqual(SPCPlayer.getSongLength(spc), { lengthSeconds: 9, fadeMilliseconds: 0 }) // the ID666 tag's, by default
    assert.deepStrictEqual(SPCPlayer.getSongLength(spc, { xid6Length: true }), { lengthSeconds: 4, fadeMilliseconds: 500 }) // the intro, the loop twice, and the end
    assert.strictEqual(seconds(await SPCPlayer.renderToPCMBuffer(spc, { xid6Length: true, silenceSeconds: 0, sampleRate: 32000 }), 32000), 4.5)
  })

  it('should convert sample rates without the distortion linear interpolation adds', () => {
    // an 8 kHz tone at 32000 Hz, converted to 48000 Hz and 22050 Hz, compared to the same tone made at those rates
    const tone = (rate, frames) => Float32Array.from({ length: frames * 2 }, (_, i) => 0.5 * Math.sin(2 * Math.PI * 8000 * Math.floor(i / 2) / rate))
    for (const rate of [48000, 22050]) {
      const converted = resample(tone(32000, 32000), 32000, rate)
      const ideal = tone(rate, rate)
      let error = 0
      for (let i = 2000; i < converted.length - 2000; i++) error += (converted[i] - ideal[i]) ** 2
      const decibels = 20 * Math.log10(Math.sqrt(error / (converted.length - 4000)) / (0.5 / Math.SQRT2))
      assert(decibels < -55, `the error converting to ${rate} Hz is ${decibels.toFixed(1)} dB`) // linear interpolation's is about -13 dB
    }
  })

  it('should play a song for the length and fade given as options, at the sample rate given', async () => {
    const pcm = await SPCPlayer.renderToPCMBuffer(makeSampleSPCFile(), { lengthSeconds: 1, fadeMilliseconds: 250, sampleRate: 44100 })
    assert.strictEqual(seconds(pcm, 44100), 1.25)
  })

  it('should write a WAV file at the sample rate given', async () => {
    const wav = await SPCPlayer.renderToWavBlob(makeSampleSPCFile(), { lengthSeconds: 1, fadeMilliseconds: 0, sampleRate: 32000 })
    assert.strictEqual(wav.toString('ascii', 0, 4), 'RIFF')
    assert.strictEqual(wav.readUInt32LE(24), 32000)
    assert.strictEqual(wav.readUInt32LE(40), 32000 * 2 * 2)
  })

  it('should warn about options it doesn\'t know, suggesting the one that was meant', async (t) => {
    const emitWarning = t.mock.method(process, 'emitWarning', () => {}) // the warnings are recorded rather than printed
    assert.deepStrictEqual(SPCPlayer.getSongLength(makeSampleSPCFile(), { lenghtSeconds: 3 }), { lengthSeconds: 150, fadeMilliseconds: 8000 }) // it's ignored
    assert.deepStrictEqual(emitWarning.mock.calls.map(call => call.arguments[0]), ['spc-converter: ignoring unknown option "lenghtSeconds". Did you mean "lengthSeconds"?'])
  })

  it('should throw an error for a file that isn\'t an SPC file', async () => {
    await assert.rejects(SPCPlayer.renderToPCMBuffer(Buffer.alloc(66048, 0)), /Not an SPC file/)
    await assert.rejects(SPCPlayer.renderToPCMBuffer(makeSampleSPCFile().subarray(0, 1000)), /Not an SPC file/)
  })

  // real SPC files can't be committed, so any in this folder (*.spc is gitignored) are played, to check that they make sound, and fade out at the end
  it('should make sound playing real SPC files, if there are any here', async (t) => {
    const files = fs.readdirSync('.').filter(file => file.endsWith('.spc') && file !== 'test.spc')
    if (!files.length) return t.skip('there are no SPC files here')
    for (const file of files) {
      const pcm = new Float32Array((await SPCPlayer.renderToPCMBuffer(file, { lengthSeconds: 10, fadeMilliseconds: 1000, sampleRate: 32000 })).buffer)
      const rms = (from, to) => Math.sqrt(pcm.subarray(from * 2, to * 2).reduce((sum, sample) => sum + sample * sample, 0) / ((to - from) * 2))
      assert(rms(0, 32000 * 10) > 0.001, `${file} should make sound`)
      assert(rms(32000 * 11 - 100, 32000 * 11) < rms(32000 * 9, 32000 * 10), `${file} should fade out`)
    }
  })
})

function makeSampleSPCFile () {
  // create a buffer for the spc file (66048 bytes)
  const spcBuffer = Buffer.alloc(66048, 0) // fill with zeros

  // populate the spc header (256 bytes)
  spcBuffer.write('SNES-SPC700 Sound File Data v0.30', 0, 33, 'ascii') // magic string
  spcBuffer.writeUInt8(26, 37) // version
  spcBuffer.writeUInt8(26, 38) // version
  spcBuffer.writeUInt8(26, 39) // version
  spcBuffer.writeUInt8(0, 40) // reserved
  spcBuffer.write('Dummy Song', 46, 32, 'ascii') // song title
  spcBuffer.write('Dummy Game', 78, 32, 'ascii') // game title
  spcBuffer.write('Dumper', 110, 16, 'ascii') // dumper
  spcBuffer.write('01/01/2025', 158, 11, 'ascii') // dump date
  spcBuffer.write('Dummy Artist', 177, 32, 'ascii') // artist
  spcBuffer.write('Dummy Comments', 126, 32, 'ascii') // comments
  spcBuffer.writeUInt8(0, 0xD0) // default channel disables
  spcBuffer.writeUInt8(0, 0xD1) // emulator used
  return spcBuffer
}
