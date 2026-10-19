// The engine of the playground: a Web Worker that loads one language the
// way the Qt engine does (its files from languages.json, the host layer
// js/host/host.js with a bridge of this script) and runs one program. The
// page (app.js) talks to it by messages; a new program gets a new worker.
//
// Blocking input: a program reads standard input synchronously, so the
// worker waits on a SharedArrayBuffer (Atomics.wait) until the page writes
// a line into it. Without cross-origin isolation there is no such buffer,
// and input comes only from the lines the page sent with the run.
//
// Messages to the page: output, clear, input (a line is wanted), echo (a
// line of the input sent with the run was read), frame (the picture of the
// canvas), loaded, result (the run returned), finished (no timers are
// left). See docs/playground.md.
'use strict';

const nativeSetTimeout = self.setTimeout.bind(self);
const nativeClearTimeout = self.clearTimeout.bind(self);
const nativeSetInterval = self.setInterval.bind(self);
const nativeClearInterval = self.clearInterval.bind(self);

// The output of a run is cut at this length: a program that prints in an
// endless loop must not fill the memory of the page.
const OUTPUT_LIMIT = 4 * 1024 * 1024;
// Output and pictures go to the page at most this often while code runs.
const POST_INTERVAL_MS = 40;

let manifest = null;
let layer = null;
let runner = null;
let languageId = null;
let unitName = 'main';
let files = {};
let presetInput = [];
let channel = null;
let running = false;

// --- Output

let pendingOutput = [];
let pendingLength = 0;
let outputLength = 0;
let lastOutputPost = 0;

function postOutput() {
    if (pendingOutput.length > 0) {
        self.postMessage({ type: 'output', chunks: pendingOutput });
        pendingOutput = [];
        pendingLength = 0;
    }
    lastOutputPost = Date.now();
}

function write(stream, text) {
    if (outputLength >= OUTPUT_LIMIT)
        return;
    text = String(text);
    outputLength += text.length;
    if (outputLength >= OUTPUT_LIMIT)
        text += '\n[the output is longer than ' + OUTPUT_LIMIT / 1048576 + ' MB: the rest is not shown]\n';
    const last = pendingOutput[pendingOutput.length - 1];
    if (last !== undefined && last[0] === stream)
        last[1] += text;
    else
        pendingOutput.push([stream, text]);
    pendingLength += text.length;
    if (pendingLength > 65536 || Date.now() - lastOutputPost > POST_INTERVAL_MS)
        postOutput();
}

// Everything the page must see before a message: output and the picture.
function post(message) {
    if (layer !== null)
        layer.host.flush();
    surface.present();
    postOutput();
    self.postMessage(message);
}

// --- Input

function readLine() {
    if (presetInput.length > 0) {
        const line = presetInput.shift();
        post({ type: 'echo', text: line });
        return line;
    }
    if (channel === null)
        return null;
    Atomics.store(channel.control, 0, 0);
    post({ type: 'input' });
    Atomics.wait(channel.control, 0, 0);
    const length = Atomics.load(channel.control, 1);
    if (length < 0)
        return null;
    let line = '';
    for (let start = 0; start < length; start += 8192)
        line += String.fromCharCode.apply(null, channel.text.slice(start, Math.min(length, start + 8192)));
    return line;
}

// --- Graphics: an OffscreenCanvas behind a canvas object of the host
// (docs/embedding/canvas.md). Its 2D context is the native one, except that
// drawImage takes image data too, as in Qt. The page gets whole frames.

const surface = {
    canvas: null,
    context: null,
    object: null,
    proxy: null,
    dirty: false,
    lastFrame: 0,

    get() {
        if (surface.object === null && typeof OffscreenCanvas === 'function')
            surface.create();
        return surface.object === null ? undefined : surface.object;
    },

    create() {
        surface.canvas = new OffscreenCanvas(300, 150);
        surface.object = {
            get width() { return surface.canvas.width; },
            set width(value) { surface.resize(value | 0, surface.canvas.height); },
            get height() { return surface.canvas.height; },
            set height(value) { surface.resize(surface.canvas.width, value | 0); },
            getContext(type) {
                return type === '2d' ? surface.context2d() : null;
            },
            // Qt Quick Canvas has it: BASIC and Pascal call it after a frame.
            requestPaint() {
                surface.present();
            }
        };
    },

    drawImage(image, ...rest) {
        const context = surface.context;
        if (typeof ImageData === 'function' && image instanceof ImageData) {
            const scratch = new OffscreenCanvas(image.width, image.height);
            scratch.getContext('2d').putImageData(image, 0, 0);
            const smoothing = context.imageSmoothingEnabled;
            context.imageSmoothingEnabled = false;
            context.drawImage(scratch, ...rest);
            context.imageSmoothingEnabled = smoothing;
        } else {
            context.drawImage(image === surface.object ? surface.canvas : image, ...rest);
        }
    },

    context2d() {
        if (surface.proxy !== null)
            return surface.proxy;
        const context = surface.canvas.getContext('2d', { willReadFrequently: true });
        surface.context = context;
        surface.touch();
        const wrappers = {};
        surface.proxy = new Proxy({}, {
            get(target, name) {
                if (name === 'canvas')
                    return surface.object;
                const value = context[name];
                if (typeof value !== 'function')
                    return value;
                if (wrappers[name] === undefined) {
                    const method = name === 'drawImage' ? surface.drawImage : value.bind(context);
                    wrappers[name] = (...args) => {
                        const result = method(...args);
                        surface.touch();
                        return result;
                    };
                }
                return wrappers[name];
            },
            set(target, name, value) {
                context[name] = value;
                return true;
            },
            has(target, name) {
                return name in context;
            }
        });
        return surface.proxy;
    },

    resize(width, height) {
        surface.canvas.width = Math.max(1, width);
        surface.canvas.height = Math.max(1, height);
        surface.touch();
    },

    // Something was drawn: a long run shows its frames as it goes.
    touch() {
        surface.dirty = true;
        if (Date.now() - surface.lastFrame > POST_INTERVAL_MS)
            surface.present();
    },

    present() {
        if (!surface.dirty || surface.canvas === null)
            return;
        surface.dirty = false;
        surface.lastFrame = Date.now();
        const width = surface.canvas.width, height = surface.canvas.height;
        const pixels = surface.context !== null ? surface.context.getImageData(0, 0, width, height).data.buffer
                                                 : new ArrayBuffer(width * height * 4);
        self.postMessage({ type: 'frame', width: width, height: height, pixels: pixels }, [pixels]);
    }
};

// --- Timers: the program goes on after its run while timers wait. The
// page learns when the last one is gone.

const timers = new Map();

function afterTask() {
    if (layer !== null)
        layer.host.flush();
    surface.present();
    postOutput();
    // Promise callbacks of the task run before this check.
    nativeSetTimeout(() => {
        if (layer !== null)
            layer.host.flush();
        surface.present();
        postOutput();
        if (running && timers.size === 0) {
            running = false;
            self.postMessage({ type: 'finished' });
        }
    }, 0);
}

function runTask(callback, args) {
    try {
        callback(...args);
    } catch (error) {
        write(1, (error instanceof Error ? String(error) : layer.host.format(error)) + '\n');
    } finally {
        afterTask();
    }
}

self.setTimeout = function (callback, delay, ...args) {
    if (typeof callback !== 'function')
        throw new TypeError('A function is expected');
    const id = nativeSetTimeout(() => {
        timers.delete(id);
        runTask(callback, args);
    }, Number(delay) || 0);
    timers.set(id, false);
    return id;
};

self.setInterval = function (callback, delay, ...args) {
    if (typeof callback !== 'function')
        throw new TypeError('A function is expected');
    const id = nativeSetInterval(() => runTask(callback, args), Number(delay) || 0);
    timers.set(id, true);
    return id;
};

self.clearTimeout = self.clearInterval = function (id) {
    if (!timers.has(id))
        return;
    if (timers.get(id))
        nativeClearInterval(id);
    else
        nativeClearTimeout(id);
    timers.delete(id);
};

// --- Loading

async function fetchText(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('Cannot load ' + url + ': ' + response.status + ' ' + response.statusText);
    return response.text();
}

// A file whose value is needed (the host layer, an adapter): it ends with
// an expression.
async function evaluateFile(file) {
    const url = new URL('js/' + file, self.location.href).href;
    return (0, eval)(await fetchText(url) + '\n//# sourceURL=' + url);
}

function lineOf(error, url) {
    const stack = error !== null && typeof error === 'object' ? String(error.stack || '') : '';
    const at = stack.indexOf(url + ':');
    if (at >= 0)
        return Number(/^\d+/.exec(stack.substring(at + url.length + 1)) || 0);
    return error !== null && typeof error === 'object' ? Number(error.lineNumber) || 0 : 0;
}

// Plain JavaScript in the global scope of the worker, as Runtime runs it.
const javascriptRunner = {
    run(code) {
        const url = 'file:///v4script/' + encodeURIComponent(unitName);
        try {
            return (0, eval)(code + '\n//# sourceURL=' + url);
        } catch (error) {
            throw layer.host.error(error instanceof Error ? String(error) : layer.host.format(error),
                                   lineOf(error, url));
        }
    }
};

const bridge = {
    version: '',
    write: write,
    readLine: readLine,
    readModule: (name) => Object.prototype.hasOwnProperty.call(files, name) ? files[name] : null,
    canvas: () => surface.get(),
    clear: () => post({ type: 'clear' }),
    unit: () => unitName,
    modules: () => [],
    hasFormat: () => false,
    format: (value) => String(value),
    compile(name, code) {
        const url = 'file:///v4script/translated/' + encodeURIComponent(name);
        try {
            return { value: (0, eval)(code + '\n//# sourceURL=' + url) };
        } catch (error) {
            if (error instanceof SyntaxError)
                return { error: error.message, line: lineOf(error, url) };
            throw error;
        }
    }
};

// A worker loads one language once: a run may come while it loads.
let loading = null;

function load(id) {
    if (loading === null) {
        languageId = id;
        loading = loadLanguage(id);
    }
    if (languageId !== id)
        return Promise.reject(new Error('The worker has loaded ' + languageId + ' already'));
    return loading;
}

async function loadLanguage(id) {
    manifest = JSON.parse(await fetchText('languages.json'));
    bridge.version = manifest.version || '';
    (await evaluateFile('host/compat.js'))(self);
    layer = (await evaluateFile('host/host.js'))(bridge, self);
    layer.installConsole();
    self.canvas = surface.get();
    if (id === 'javascript') {
        runner = javascriptRunner;
    } else {
        const info = manifest.languages.find((language) => language.id === id);
        if (info === undefined)
            throw new Error('Unknown language: ' + id);
        const scripts = (info.translator ? manifest.translatorCore : []).concat(info.files);
        // Plain scripts: their globals stay, as in the Qt engine.
        importScripts(...scripts.map((file) => 'js/' + file));
        runner = (await evaluateFile(info.adapter))(layer.host);
    }
}

async function run(message) {
    unitName = message.unit || 'main';
    files = message.files || {};
    presetInput = (message.input || []).slice();
    channel = message.shared ? {
        control: new Int32Array(message.shared, 0, 2),
        text: new Uint16Array(message.shared, 8)
    } : null;
    running = true;
    const started = performance.now();
    const outcome = layer.run(runner, message.code);
    const elapsed = Math.round(performance.now() - started);
    post(outcome.error !== undefined
        ? { type: 'result', error: outcome.error, line: outcome.line, source: outcome.source, elapsed: elapsed }
        : { type: 'result', value: outcome.value, elapsed: elapsed });
    afterTask();
}

self.onmessage = async (event) => {
    const message = event.data;
    try {
        await load(message.language);
    } catch (error) {
        self.postMessage({ type: message.type === 'run' ? 'result' : 'loaded', error: String(error && error.message || error),
                           line: 0, source: '' });
        if (message.type === 'run')
            self.postMessage({ type: 'finished' });
        return;
    }
    if (message.type === 'load')
        self.postMessage({ type: 'loaded' });
    else if (message.type === 'run')
        await run(message);
};
