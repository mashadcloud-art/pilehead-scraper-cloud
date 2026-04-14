/**
 * bgremove.js — Free local AI background removal using @imgly/background-removal-node
 *
 * No API key, no usage limits — runs the ONNX model entirely on your machine.
 * First call downloads & caches the model (~50 MB), subsequent calls are fast.
 *
 * Usage:
 *   const { removeBg, isAvailable } = require('./bgremove');
 *   const pngBuffer = await removeBg('https://example.com/image.jpg');
 */

'use strict';

let _removeBackground = null;

/**
 * Lazy-load the background removal library (ESM via dynamic import).
 * The model weights are downloaded from NPM the first time and cached.
 */
async function loadLib() {
    if (_removeBackground) return _removeBackground;
    try {
        const mod = await import('@imgly/background-removal-node');
        _removeBackground = mod.removeBackground;
        return _removeBackground;
    } catch (err) {
        throw new Error(
            `Background removal library not available: ${err.message}\n` +
            `Run: npm install @imgly/background-removal-node`
        );
    }
}

/**
 * Remove the background from an image.
 *
 * @param {string|Buffer|ArrayBuffer} source  URL string, or raw image buffer.
 * @param {object} [opts]
 * @param {function} [opts.onProgress]        Optional: called with { current, total, key }
 * @returns {Promise<Buffer>}                 PNG buffer with transparent background.
 */
async function removeBg(source, opts = {}) {
    const removeBackground = await loadLib();

    const config = {
        output: {
            format: 'image/png',
            quality: 1,
        },
    };

    if (typeof opts.onProgress === 'function') {
        config.progress = (key, current, total) => opts.onProgress({ key, current, total });
    }

    // @imgly/background-removal-node accepts URL string, ArrayBuffer, or Blob
    const inputForLib = Buffer.isBuffer(source) ? source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength) : source;

    const resultBlob   = await removeBackground(inputForLib, config);
    const arrayBuffer  = await resultBlob.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Check if the library is installed (doesn't download the model).
 * @returns {boolean}
 */
function isAvailable() {
    try {
        require.resolve('@imgly/background-removal-node');
        return true;
    } catch (_) {
        return false;
    }
}

module.exports = { removeBg, isAvailable };
