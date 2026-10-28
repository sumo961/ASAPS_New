/**
 * libarchive's worker, handed its .wasm by the page (see
 * libarchiveWasmFromPage). The imports run in this order.
 */
import './libarchiveWasmFromPage';
import 'libarchive.js/dist/worker-bundle.js';
