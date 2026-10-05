// the C side of spc-converter: blargg's snes_spc emulator (in vendor/snes_spc), which plays SPC files, and its filter, which makes them sound like a real Super Nintendo; compiled to WebAssembly by build-wasm.js
//
// this follows src/spc_player.c in SMW Central's SPC player (https://codeberg.org/Telinc1/smwcentral-spc-player), which this library was first based on, except that errors are returned to the JavaScript side as messages rather than ending the program, so that a file that can't be played can be reported as an error

#include <emscripten.h>
#include <stddef.h>

#include "snes_spc/spc.h"

static SNES_SPC* player = NULL;
static SPC_Filter* filter = NULL;

// loads an SPC file, ready to play from its start; returns null, or a message saying why the file can't be played
EMSCRIPTEN_KEEPALIVE const char* load_spc(const void* spc, long size)
{
	if (!player) player = spc_new();
	if (!filter) filter = spc_filter_new();
	if (!player || !filter) return "Out of memory";

	const char* error = spc_load_spc(player, spc, size);
	if (error) return error;

	spc_clear_echo(player);
	spc_filter_clear(filter);
	return NULL;
}

// plays the next `count` samples (32 kHz, interleaved stereo, so two per frame) into `out`; returns null, or a message saying what went wrong
EMSCRIPTEN_KEEPALIVE const char* play_spc(short* out, int count)
{
	if (!player || !filter) return "No SPC file loaded";

	const char* error = spc_play(player, count, out);
	if (error) return error;

	spc_filter_run(filter, out, count);
	return NULL;
}
