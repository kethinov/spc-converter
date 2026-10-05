// compiles the SPC emulator to WebAssembly: src/spc_converter.c and blargg's snes_spc 0.9.0 (the vendor/snes_spc git submodule, an archive of http://slack.net/~ant/libs/audio.html) into spc-emulator.js, a single file with the WebAssembly embedded in it, which loadSpcPlayer.js loads
//
// snes_spc comes with two DSP emulators: the cycle accurate one in snes_spc/, which is the one built here, and a faster, less accurate one in fast_dsp/, which is the one SMW Central's player (which this library was first based on) and game-music-emu use
//
// uses Emscripten (emcc) if it's installed, and otherwise runs this same script in Emscripten's official docker image (which has node), so all that's needed to build is docker; it works the same on linux, macos, and windows
//
// spc-emulator.js isn't kept in git: it's built before publishing (the prepack script) and before testing if it's missing (the pretest and precoverage scripts, which run this with --if-missing)
//
// usage: npm run build
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const EMSCRIPTEN_VERSION = '4.0.17' // the version the docker image is pinned to, so builds come out the same
const ROOT = __dirname
const SNES_SPC = path.join(ROOT, 'vendor', 'snes_spc', 'snes_spc')
const OUTPUT = path.join(ROOT, 'spc-emulator.js')
const WINDOWS = process.platform === 'win32'

if (process.argv.includes('--if-missing') && fs.existsSync(OUTPUT)) process.exit(0)

if (!fs.existsSync(path.join(SNES_SPC, 'spc.h'))) fail('snes_spc\'s source isn\'t here; run: git submodule update --init')

// emscripten's commands are batch files on windows, which have to be named in full to be run without a shell
const emcc = WINDOWS ? 'emcc.bat' : 'emcc'
const emxx = WINDOWS ? 'em++.bat' : 'em++'

if (!works(emcc, ['--version'])) {
  if (!works('docker', ['--version'])) fail('Building needs either Emscripten (emcc) or docker installed')
  console.log(`emcc isn't installed, so building in the emscripten/emsdk:${EMSCRIPTEN_VERSION} docker image`)
  // the image runs as root, so on linux and macos it runs as this user instead, so the files it writes belong to them; docker desktop on windows takes care of that itself
  const user = typeof process.getuid === 'function' ? ['-u', `${process.getuid()}:${process.getgid()}`] : []
  run('docker', ['run', '--rm', ...user, '-e', 'EM_CACHE=/tmp/emscripten-cache', '-v', `${ROOT}:/src`, '-w', '/src', `emscripten/emsdk:${EMSCRIPTEN_VERSION}`, 'node', 'build-wasm.js'])
  process.exit(0)
}

const build = fs.mkdtempSync(path.join(os.tmpdir(), 'spc-converter-build-'))
try {
  // the c side includes "snes_spc/spc.h", and snes_spc's own sources include each other by name
  run(emcc, ['-O3', '-c', path.join(ROOT, 'src', 'spc_converter.c'), '-I', path.dirname(SNES_SPC), '-o', path.join(build, 'spc_converter.o')])
  for (const source of fs.readdirSync(SNES_SPC).filter(file => file.endsWith('.cpp'))) {
    run(emxx, ['-O3', '-c', path.join(SNES_SPC, source), '-I', SNES_SPC, '-o', path.join(build, source.replace(/\.cpp$/, '.o'))])
  }
  run(emxx, [
    '-O3', ...fs.readdirSync(build).map(file => path.join(build, file)), '-o', OUTPUT,
    '--minify', '0', // the javascript is left readable, for debugging; the webassembly is still fully optimized
    '-s', 'MODULARIZE=1', '-s', 'EXPORT_NAME=createSpcEmulator',
    '-s', 'SINGLE_FILE=1', '-s', 'ENVIRONMENT=node,web', '-s', 'FILESYSTEM=0', '-s', 'ALLOW_MEMORY_GROWTH=1',
    '-s', 'EXPORTED_FUNCTIONS=[\'_load_spc\',\'_play_spc\',\'_malloc\',\'_free\']',
    '-s', 'EXPORTED_RUNTIME_METHODS=[\'HEAP16\',\'HEAPU8\',\'UTF8ToString\']'
  ])
} finally {
  fs.rmSync(build, { recursive: true, force: true })
}
console.log('Built spc-emulator.js')

// runs a command; windows batch files (like emscripten's commands there) can only be run through a shell, so they're run through one, with each argument quoted, since paths can have spaces in them
function spawn (command, args, options) {
  if (command.endsWith('.bat')) return spawnSync([command, ...args].map(arg => `"${arg}"`).join(' '), { ...options, shell: true })
  return spawnSync(command, args, options)
}

// whether a command can be run
function works (command, args) {
  return spawn(command, args, { stdio: 'ignore' }).status === 0
}

// runs a command, showing its output, and stops if it fails
function run (command, args) {
  const result = spawn(command, args, { stdio: 'inherit', cwd: ROOT })
  if (result.error) fail(`Couldn't run ${command}: ${result.error.message}`)
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function fail (message) {
  console.error(message)
  process.exit(1)
}
