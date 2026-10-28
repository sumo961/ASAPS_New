/**
 * Runs in libarchive's worker before libarchive itself (2026-10-28: in the
 * desktop app the pages are file: URLs, and a worker cannot read a file: URL
 * — libarchive's .wasm never loaded and a RAR import waited for good).
 *
 * The page sends the .wasm bytes as the first message; Emscripten asks for
 * the .wasm of a file: URL with an XMLHttpRequest, answered here with them.
 * Over http it fetches the .wasm itself and this stays unused.
 */
// The builder's TypeScript has no WebWorker lib; the parts used here.
const scope = self as unknown as {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  addEventListener(type: 'unhandledrejection', listener: (event: PromiseRejectionEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  postMessage(message: unknown): void;
  XMLHttpRequest: unknown;
};

let receiveWasm: (bytes: ArrayBuffer) => void = () => {};
const wasm = new Promise<ArrayBuffer>((resolve) => (receiveWasm = resolve));

scope.addEventListener('message', function first(event: MessageEvent) {
  if (!(event.data?.libarchiveWasm instanceof ArrayBuffer)) return;
  event.stopImmediatePropagation();
  scope.removeEventListener('message', first);
  receiveWasm(event.data.libarchiveWasm);
});

class WasmRequest {
  status = 0;
  response: ArrayBuffer | null = null;
  responseType = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open() {}
  send() {
    void wasm.then((bytes) => {
      this.status = 200;
      this.response = bytes;
      this.onload?.();
    });
  }
}
scope.XMLHttpRequest = WasmRequest;

// libarchive does not pass its own failures on; the page would wait forever.
scope.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason as { message?: string } | undefined;
  scope.postMessage({ libarchiveFailed: reason?.message ?? String(event.reason) });
});
