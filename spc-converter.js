#!/usr/bin/env node

const fs = require('fs')
const inputFile = process.argv[2]
const outputFile = process.argv[3]
console.log(`spc-converter version ${require('./package.json').version}\n`)

// validate arguments
if (!inputFile || !inputFile.endsWith('.spc')) {
  console.error('Please supply a valid input SPC file as the first argument.')
  process.exit(1)
}

if (!outputFile || !outputFile.endsWith('.wav')) {
  console.error('This tool outputs .wav files. Please supply a .wav file extension for your output file.')
  process.exit(1)
}

// check if input file exists
if (!fs.existsSync(inputFile)) {
  console.error(`Input file not found: ${inputFile}`)
  process.exit(1)
}

async function convert () {
  try {
    const SPCPlayer = await require('./loadSpcPlayer')()
    console.log(`Converting ${inputFile} to ${outputFile}...`)
    const buffer = await SPCPlayer.renderToWavBlob(inputFile)
    fs.writeFileSync(outputFile, buffer)
    console.log(`Successfully wrote ${outputFile}`)
  } catch (error) {
    console.error(`Error during conversion: ${error.message}`)
    process.exit(1)
  }
}

convert()
