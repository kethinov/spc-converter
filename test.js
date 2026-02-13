/* eslint-env mocha */
const assert = require('assert')
const { execFileSync } = require('child_process')
const fs = require('fs')

describe('spc-converter command line tests', () => {
  it('should print an error when no arguments are passed', () => {
    try {
      execFileSync('node', ['spc-converter.js'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('Please supply a valid input SPC file'))
    }
  })

  it('should print an error when input file is not an SPC file', () => {
    try {
      execFileSync('node', ['spc-converter.js', 'test.txt', 'output.wav'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('Please supply a valid input SPC file'))
    }
  })

  it('should print an error when output file is not a WAV file', () => {
    fs.writeFileSync('test.spc', Buffer.alloc(66048, 0))
    try {
      execFileSync('node', ['spc-converter.js', 'test.spc', 'output.mp3'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('This tool outputs .wav files'))
    } finally {
      fs.unlinkSync('test.spc')
    }
  })

  it('should print an error when input file does not exist', () => {
    try {
      execFileSync('node', ['spc-converter.js', 'nonexistent.spc', 'output.wav'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
      assert(false, 'Should have thrown an error')
    } catch (err) {
      assert(err.stderr.includes('Input file not found'))
    }
  })

  it('should successfully convert an SPC file to WAV', () => {
    fs.writeFileSync('test.spc', makeSampleSPCFile())
    try {
      const output = execFileSync('node', ['spc-converter.js', 'test.spc', 'output.wav'], { encoding: 'utf8' })
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
