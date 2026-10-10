#!/usr/bin/env node

// usage: spc-converter file.spc file.wav [--length=seconds] [--fade=milliseconds] [--xid6-length] [--silence=seconds] [--rate=hz] [--no-amplification]
//
// --length and --fade play the song for a length other than the one its ID666 tag says (or the default, for files without one), --xid6-length takes the length from the file's xid6 tags instead, --silence ends the song after a silence of a length other than 6 seconds (or 0 to never end it early), --rate writes the WAV file at a sample rate other than 48000, and --no-amplification ignores the xid6 amplification tag
const fs = require('fs')
const didYouMean = require('./didYouMean')
console.log(`spc-converter version ${require('./package.json').version}\n`)

// prints an error and exits
function fail (message) {
  console.error(message)
  process.exit(1)
}

// the options that take a number, with the library option each sets and an example value, and the ones that are just flags
const numberOptions = {
  length: { key: 'lengthSeconds', example: 120 },
  fade: { key: 'fadeMilliseconds', example: 5000 },
  silence: { key: 'silenceSeconds', example: 10 },
  rate: { key: 'sampleRate', example: 44100 }
}
const flagOptions = { 'xid6-length': ['xid6Length', true], 'no-amplification': ['amplification', false] } // the option each sets, and to what
const optionNames = [...Object.keys(numberOptions), ...Object.keys(flagOptions)]

// sort the arguments into files and options, reporting any option that isn't one, with a suggestion if it looks like a typo of one
const files = []
const options = {}
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith('-')) {
    files.push(arg)
    continue
  }
  const equals = arg.indexOf('=')
  const name = arg.substring(arg.startsWith('--') ? 2 : 1, equals === -1 ? undefined : equals)
  const value = equals === -1 ? undefined : arg.substring(equals + 1)
  if (numberOptions[name]) {
    const { key, example } = numberOptions[name]
    if (value === undefined || !/^\d+(\.\d+)?$/.test(value) || (name === 'rate' && Number(value) < 1)) fail(`--${name} needs to be a number, like --${name}=${example}`)
    options[key] = Number(value)
  } else if (flagOptions[name] && value === undefined) {
    const [key, setting] = flagOptions[name]
    options[key] = setting
  } else if (flagOptions[name]) {
    fail(`--${name} doesn't take a value; use just --${name}`)
  } else {
    const suggestion = didYouMean(name, optionNames)
    fail(`Unknown option ${equals === -1 ? arg : arg.substring(0, equals)}.${suggestion ? ` Did you mean --${suggestion}?` : ''}`)
  }
}
const [inputFile, outputFile, ...extraFiles] = files

// validate arguments
if (!inputFile || !inputFile.toLowerCase().endsWith('.spc')) fail('Please supply a valid input SPC file as the first argument.')
if (!outputFile || !outputFile.toLowerCase().endsWith('.wav')) fail('This tool outputs .wav files. Please supply a .wav file extension for your output file.')
if (extraFiles.length) fail(`Too many arguments: ${extraFiles.join(' ')}. Options need to be written like --length=120.`)

// check if input file exists
if (!fs.existsSync(inputFile)) fail(`Input file not found: ${inputFile}`)

async function convert () {
  try {
    const SPCPlayer = await require('./loadSpcPlayer')()
    const { lengthSeconds, fadeMilliseconds } = SPCPlayer.getSongLength(inputFile, options)
    console.log(`Converting ${inputFile} to ${outputFile} (${lengthSeconds} seconds, then a ${fadeMilliseconds / 1000} second fade${options.silenceSeconds === 0 ? '' : ', or until it goes silent'})...`)
    const buffer = await SPCPlayer.renderToWavBlob(inputFile, options)
    fs.writeFileSync(outputFile, buffer)
    console.log(`Successfully wrote ${outputFile}`)
  } catch (error) {
    console.error(`Error during conversion: ${error.message}`)
    process.exit(1)
  }
}

convert()
