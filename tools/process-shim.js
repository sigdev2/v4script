// The Node.js global process for the Uniter packages: esbuild substitutes
// this export for the uses of process (build-bundles.mjs, inject).
import process from 'process/browser.js';

export { process };
