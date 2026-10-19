// The page of the playground: the editor, the examples and the user's own
// programs (kept in localStorage), and the console of a run. A program runs
// in a Web Worker (worker.js), one worker per run; a worker with the
// language already loaded waits for the next run. See docs/playground.md.

import { highlight } from './highlight.js';

const REPOSITORY = 'https://github.com/sigdev2/v4script';
const PROGRAMS_KEY = 'v4script.playground.programs';
const STATE_KEY = 'v4script.playground.state';
const RELOADED_KEY = 'v4script.playground.reloaded';
// The longest line of input a program can get at once.
const INPUT_BUFFER_CHARS = 65536;
// The console keeps the end of the output.
const CONSOLE_LIMIT_CHARS = 1000000;
// A longer program is not highlighted: the editor would lag behind typing.
const HIGHLIGHT_LIMIT_CHARS = 100000;
// The echo of a typed line has no line break where the program ends the
// line itself: BASIC after INPUT (INPUT ; keeps it), Forth programs with CR
// after ACCEPT, as in gforth.
const ENDS_INPUT_LINE = new Set(['basic', 'forth']);
const STREAM_CLASSES = ['stdout', 'stderr', 'warning'];

const JAVASCRIPT = {
    id: 'javascript',
    name: 'JavaScript',
    dialect: 'the JavaScript engine of the browser',
    extensions: ['js'],
    lineComment: '//'
};

const element = (id) => document.getElementById(id);
const ui = {
    language: element('language'),
    program: element('program'),
    run: element('run'),
    stop: element('stop'),
    newProgram: element('new'),
    save: element('save'),
    revert: element('revert'),
    rename: element('rename'),
    remove: element('delete'),
    open: element('open'),
    download: element('download'),
    file: element('file'),
    fileName: element('file-name'),
    modified: element('modified'),
    languageInfo: element('language-info'),
    gutter: element('gutter'),
    highlight: element('highlight'),
    code: element('code'),
    inputPane: element('input-pane'),
    input: element('input'),
    status: element('status'),
    clear: element('clear'),
    screen: element('screen'),
    canvas: element('canvas'),
    console: element('console'),
    output: element('output'),
    prompt: element('prompt'),
    line: element('line'),
    isolation: element('isolation'),
    version: element('version')
};

let manifest = null;
let languages = [];
let examples = [];
let programs = [];
let state = null;
// The open program: { key, kind: 'example' | 'user', language, name, code }.
let opened = null;

// --- Storage: a browser may refuse it (private mode, a full quota).

function readStorage(key, fallback) {
    try {
        const text = localStorage.getItem(key);
        return text === null ? fallback : JSON.parse(text);
    } catch (error) {
        return fallback;
    }
}

function writeStorage(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        setStatus('Cannot save in this browser: ' + error.message, 'failed');
    }
}

let saveTimer = 0;

function saveSoon() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 300);
}

function saveNow() {
    clearTimeout(saveTimer);
    writeStorage(PROGRAMS_KEY, programs);
    writeStorage(STATE_KEY, state);
}

// --- Languages, examples, programs

function languageOf(id) {
    return languages.find((language) => language.id === id) || null;
}

function languageByExtension(name) {
    const extension = String(name).split('.').pop().toLowerCase();
    return languages.find((language) => language.extensions.includes(extension)) || null;
}

function exampleKey(example) {
    return 'example:' + example.language + '/' + example.file;
}

function programKey(program) {
    return 'user:' + program.id;
}

function documentOf(key) {
    if (key.startsWith('example:')) {
        const example = examples.find((item) => exampleKey(item) === key);
        if (example !== undefined) {
            return { key, kind: 'example', language: example.language, name: example.file, title: example.title,
                     code: example.code };
        }
    } else if (key.startsWith('user:')) {
        const program = programs.find((item) => programKey(item) === key);
        if (program !== undefined)
            return { key, kind: 'user', language: program.language, name: program.name, code: program.code };
    }
    return null;
}

function firstDocument(language) {
    const example = examples.find((item) => item.language === language);
    if (example !== undefined)
        return exampleKey(example);
    const program = programs.find((item) => item.language === language);
    return program !== undefined ? programKey(program) : null;
}

function uniqueName(name) {
    const taken = new Set(programs.map((program) => program.name));
    if (!taken.has(name))
        return name;
    const dot = name.lastIndexOf('.');
    const stem = dot > 0 ? name.substring(0, dot) : name;
    const extension = dot > 0 ? name.substring(dot) : '';
    for (let number = 2; ; ++number) {
        if (!taken.has(stem + number + extension))
            return stem + number + extension;
    }
}

// A name with the extension of the language.
function normalName(name, language) {
    name = name.trim().replace(/[\\/:*?"<>|]/g, '_');
    const info = languageOf(language);
    if (info !== null && !info.extensions.some((extension) => name.toLowerCase().endsWith('.' + extension)))
        name += '.' + info.extensions[0];
    return name;
}

// Modules and data files of a run: the examples and the user's programs by
// name, the user's ones first.
function files() {
    const result = {};
    for (const example of examples)
        result[example.file] = example.code;
    for (const program of programs)
        result[program.name] = program.code;
    return result;
}

// --- Lists

function fillLanguages() {
    ui.language.textContent = '';
    for (const language of languages) {
        const option = document.createElement('option');
        option.value = language.id;
        option.textContent = language.name;
        ui.language.append(option);
    }
}

function fillPrograms() {
    const language = state.language;
    ui.program.textContent = '';
    const groups = new Map();
    for (const example of examples.filter((item) => item.language === language)) {
        if (!groups.has(example.group)) {
            const group = document.createElement('optgroup');
            group.label = example.group;
            groups.set(example.group, group);
            ui.program.append(group);
        }
        const option = document.createElement('option');
        option.value = exampleKey(example);
        option.textContent = (state.drafts[option.value] !== undefined ? '* ' : '') + example.title;
        groups.get(example.group).append(option);
    }
    const own = programs.filter((item) => item.language === language)
        .sort((a, b) => a.name.localeCompare(b.name));
    if (own.length > 0) {
        const group = document.createElement('optgroup');
        group.label = 'My programs';
        for (const program of own) {
            const option = document.createElement('option');
            option.value = programKey(program);
            option.textContent = program.name;
            group.append(option);
        }
        ui.program.append(group);
    }
    if (opened !== null)
        ui.program.value = opened.key;
}

// --- The open program

function changed() {
    return opened !== null && opened.kind === 'example' && state.drafts[opened.key] !== undefined;
}

function updateHeader() {
    ui.fileName.textContent = opened.name;
    ui.fileName.title = opened.title || '';
    ui.modified.hidden = !changed();
    ui.revert.disabled = !changed();
    ui.rename.disabled = ui.remove.disabled = opened.kind !== 'user';
    const info = languageOf(opened.language);
    const parts = [info.name];
    if (info.dialect)
        parts.push(info.dialect);
    if (info.implementation)
        parts.push(info.implementation + (info.implementationVersion ? ' ' + info.implementationVersion : ''));
    ui.languageInfo.textContent = parts.join(' · ');
    ui.languageInfo.href = info.id === 'javascript' ? REPOSITORY + '/blob/HEAD/docs/languages/README.md#javascript-from-programs'
                                                   : REPOSITORY + '/blob/HEAD/docs/languages/' + info.id + '.md';
    ui.languageInfo.title = 'What ' + info.name + ' supports';
}

function openDocument(key) {
    const next = key === null ? null : documentOf(key);
    if (next === null)
        return;
    opened = next;
    state.language = opened.language;
    state.current[opened.language] = key;
    ui.language.value = opened.language;
    const draft = state.drafts[key];
    setEditorText(draft !== undefined ? draft : opened.code);
    markErrorLine(0);
    fillPrograms();
    updateHeader();
    history.replaceState(null, '', '#' + (opened.kind === 'example' ? opened.language + '/' + opened.name
                                                                     : opened.language));
    saveNow();
    prepareWorker();
}

// The text was edited: an example keeps it as a draft, a program of the
// user is saved.
function edited() {
    const text = ui.code.value;
    if (opened.kind === 'example') {
        const wasChanged = changed();
        if (text === opened.code)
            delete state.drafts[opened.key];
        else
            state.drafts[opened.key] = text;
        if (wasChanged !== changed()) {
            fillPrograms();
            updateHeader();
        }
    } else {
        const program = programs.find((item) => programKey(item) === opened.key);
        program.code = text;
        program.modified = Date.now();
        opened.code = text;
    }
    saveSoon();
}

function addProgram(name, language, code) {
    const program = { id: Date.now().toString(36) + Math.random().toString(36).substring(2, 6), language,
                      name: uniqueName(normalName(name, language)), code, modified: Date.now() };
    programs.push(program);
    openDocument(programKey(program));
}

function newProgram() {
    const info = languageOf(state.language);
    const name = prompt('Name of the new ' + info.name + ' program:', uniqueName('program.' + info.extensions[0]));
    if (name === null || name.trim() === '')
        return;
    addProgram(name, info.id, '');
    ui.code.focus();
}

function saveAs() {
    const name = prompt('Save as my program named:', uniqueName(opened.name));
    if (name === null || name.trim() === '')
        return;
    const text = ui.code.value;
    if (opened.kind === 'example')
        delete state.drafts[opened.key];
    addProgram(name, opened.language, text);
}

function revert() {
    if (!changed() || !confirm('Discard the changes of this example?'))
        return;
    delete state.drafts[opened.key];
    openDocument(opened.key);
}

function rename() {
    const program = programs.find((item) => programKey(item) === opened.key);
    const name = prompt('New name:', program.name);
    if (name === null || name.trim() === '')
        return;
    const normal = normalName(name, program.language);
    if (normal !== program.name && programs.some((item) => item.name === normal)) {
        alert('There is a program named ' + normal + ' already.');
        return;
    }
    program.name = normal;
    openDocument(opened.key);
}

function removeProgram() {
    const index = programs.findIndex((item) => programKey(item) === opened.key);
    if (index < 0 || !confirm('Delete ' + programs[index].name + '? It cannot be undone.'))
        return;
    const language = programs[index].language;
    programs.splice(index, 1);
    delete state.current[language];
    openDocument(firstDocument(language));
    fillPrograms();
}

async function openFile(file) {
    const text = await file.text();
    const language = languageByExtension(file.name) || languageOf(state.language);
    addProgram(file.name, language.id, text);
}

function download() {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([ui.code.value], { type: 'text/plain' }));
    link.download = opened.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// --- The editor: a text area with line numbers. Its text is transparent:
// the highlighted copy under it shows through.

let gutterLines = 0;
let errorLine = 0;
let highlightFrame = 0;

function setEditorText(text) {
    ui.code.value = text;
    ui.code.scrollTop = 0;
    ui.code.scrollLeft = 0;
    updateGutter();
    renderHighlight();
    followScroll();
}

function renderHighlight() {
    cancelAnimationFrame(highlightFrame);
    highlightFrame = 0;
    const text = ui.code.value;
    const plain = text.length > HIGHLIGHT_LIMIT_CHARS;
    ui.code.classList.toggle('plain', plain);
    // The last line of the text area may be empty: the copy needs it too.
    ui.highlight.innerHTML = plain ? '' : highlight(text, opened.language) + '\n';
}

// Typing highlights once per frame, before the frame is drawn.
function highlightSoon() {
    if (highlightFrame === 0)
        highlightFrame = requestAnimationFrame(renderHighlight);
}

function followScroll() {
    ui.gutter.scrollTop = ui.code.scrollTop;
    ui.highlight.style.transform = 'translate(' + -ui.code.scrollLeft + 'px, ' + -ui.code.scrollTop + 'px)';
}

function updateGutter() {
    let lines = 1;
    const text = ui.code.value;
    for (let index = text.indexOf('\n'); index >= 0; index = text.indexOf('\n', index + 1))
        ++lines;
    if (lines === gutterLines)
        return;
    gutterLines = lines;
    renderGutter();
}

function renderGutter() {
    const numbers = [];
    for (let line = 1; line <= gutterLines; ++line)
        numbers.push(line === errorLine ? '<span class="error">' + line + '</span>' : String(line));
    ui.gutter.innerHTML = numbers.join('\n') + '\n\n';
    ui.gutter.scrollTop = ui.code.scrollTop;
}

function markErrorLine(line) {
    errorLine = line;
    renderGutter();
}

function selectLine(line) {
    const lines = ui.code.value.split('\n');
    const index = Math.max(0, Math.min(lines.length, line) - 1);
    let start = 0;
    for (let number = 0; number < index; ++number)
        start += lines[number].length + 1;
    ui.code.focus();
    ui.code.setSelectionRange(start, start + lines[index].length);
    const lineHeight = parseFloat(getComputedStyle(ui.code).lineHeight) || 19;
    ui.code.scrollTop = Math.max(0, (index - 3) * lineHeight);
}

// Typing that keeps the undo history of the text area.
function insertText(text) {
    if (!document.execCommand('insertText', false, text))
        ui.code.setRangeText(text, ui.code.selectionStart, ui.code.selectionEnd, 'end');
    edited();
    updateGutter();
    highlightSoon();
}

function indentSelection(outdent) {
    const code = ui.code;
    const text = code.value;
    const start = text.lastIndexOf('\n', code.selectionStart - 1) + 1;
    let end = code.selectionEnd;
    if (end > start && text.charAt(end - 1) === '\n')
        --end;
    const block = text.substring(start, end);
    const lines = block.split('\n');
    const changedLines = lines.map((line) => outdent ? line.replace(/^( {1,4}|\t)/, '') : '    ' + line);
    code.setSelectionRange(start, end);
    insertText(changedLines.join('\n'));
    code.setSelectionRange(start, start + changedLines.join('\n').length);
}

function editorKey(event) {
    const code = ui.code;
    if (event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        if (event.shiftKey || code.value.substring(code.selectionStart, code.selectionEnd).includes('\n'))
            indentSelection(event.shiftKey);
        else
            insertText('    ');
    } else if (event.key === 'Enter' && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        const text = code.value;
        const lineStart = text.lastIndexOf('\n', code.selectionStart - 1) + 1;
        const indent = /^[ \t]*/.exec(text.substring(lineStart, code.selectionStart))[0];
        event.preventDefault();
        insertText('\n' + indent);
    }
}

// --- Runs

let spare = null;
let active = null;

function createWorker(language) {
    const worker = new Worker('worker.js');
    worker.postMessage({ type: 'load', language });
    return { worker, language };
}

// The next run should not wait for its language to load.
function prepareWorker() {
    if (opened === null || (active !== null && !active.finished))
        return;
    if (spare !== null && spare.language === opened.language)
        return;
    if (spare !== null)
        spare.worker.terminate();
    spare = createWorker(opened.language);
}

function setStatus(text, kind) {
    ui.status.textContent = text;
    ui.status.className = 'status' + (kind ? ' ' + kind : '');
}

function setRunning(running) {
    ui.run.disabled = running;
    ui.stop.disabled = !running;
}

function inputLines() {
    const text = ui.input.value;
    if (text === '')
        return [];
    const lines = text.split(/\r?\n/);
    if (lines[lines.length - 1] === '')
        lines.pop();
    return lines;
}

function run() {
    if (opened === null)
        return;
    finish(active, null);
    clearConsole();
    ui.screen.hidden = true;
    markErrorLine(0);
    const language = opened.language;
    const entry = spare !== null && spare.language === language ? spare : createWorker(language);
    spare = null;
    const shared = self.crossOriginIsolated ? new SharedArrayBuffer(8 + 2 * INPUT_BUFFER_CHARS) : null;
    const current = { worker: entry.worker, language, shared, failed: false, finished: false,
                      started: performance.now(), elapsed: 0 };
    active = current;
    current.worker.onmessage = (event) => receive(current, event.data);
    current.worker.onerror = (event) => {
        event.preventDefault();
        appendText((event.message || 'The worker failed') + '\n', 'error');
        current.failed = true;
        finish(current, 'Failed');
    };
    current.worker.postMessage({ type: 'run', language, code: ui.code.value, unit: opened.name, files: files(),
                                 input: inputLines(), shared });
    setRunning(true);
    setStatus('Running…', 'running');
}

function receive(current, message) {
    if (current !== active)
        return;
    switch (message.type) {
    case 'output':
        for (const [stream, text] of message.chunks)
            appendText(text, STREAM_CLASSES[stream]);
        break;
    case 'clear':
        clearConsole();
        break;
    case 'echo':
        echo(message.text, current.language);
        break;
    case 'input':
        showPrompt();
        setStatus('Waiting for input…', 'running');
        break;
    case 'frame':
        drawFrame(message);
        break;
    case 'result':
        current.elapsed = message.elapsed || 0;
        if (message.error !== undefined) {
            current.failed = true;
            appendError(message);
        } else if (message.value) {
            appendText(ensureLineBreak() + '=> ' + message.value + '\n', 'value');
        }
        setStatus(current.failed ? 'Failed' : 'Running…', current.failed ? 'failed' : 'running');
        break;
    case 'finished':
        finish(current, current.failed ? 'Failed' : 'Finished in ' + formatTime(performance.now() - current.started));
        break;
    }
}

function formatTime(milliseconds) {
    return milliseconds < 1000 ? Math.round(milliseconds) + ' ms' : (milliseconds / 1000).toFixed(1) + ' s';
}

// The run ends: its worker goes, a new one is prepared.
function finish(current, status) {
    if (current === null || current.finished)
        return;
    current.finished = true;
    current.worker.terminate();
    hidePrompt();
    if (current === active) {
        setRunning(false);
        if (status !== null)
            setStatus(status, current.failed ? 'failed' : '');
        prepareWorker();
    }
}

function stop() {
    if (active === null || active.finished)
        return;
    appendText(ensureLineBreak() + '[stopped]\n', 'note');
    finish(active, 'Stopped');
}

// --- The console

let consoleLength = 0;

function atBottom() {
    return ui.console.scrollHeight - ui.console.scrollTop - ui.console.clientHeight < 40;
}

function appendText(text, className) {
    if (text === '')
        return;
    const follow = atBottom();
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    ui.output.append(span);
    consoleLength += text.length;
    while (consoleLength > CONSOLE_LIMIT_CHARS && ui.output.firstChild !== null) {
        consoleLength -= ui.output.firstChild.textContent.length;
        ui.output.firstChild.remove();
    }
    if (follow)
        ui.console.scrollTop = ui.console.scrollHeight;
}

// A line break if the output does not end with one.
function ensureLineBreak() {
    const text = ui.output.lastChild !== null ? ui.output.lastChild.textContent : '';
    return text === '' || text.endsWith('\n') ? '' : '\n';
}

function appendError(message) {
    const span = document.createElement('span');
    span.className = 'error';
    span.append(ensureLineBreak() + 'Error: ' + message.error);
    if (message.line > 0) {
        span.append(' (');
        if (message.source) {
            span.append(message.source + ', line ' + message.line);
        } else {
            const link = document.createElement('a');
            link.href = '#';
            link.textContent = 'line ' + message.line;
            link.addEventListener('click', (event) => {
                event.preventDefault();
                selectLine(message.line);
            });
            span.append(link);
            markErrorLine(message.line);
        }
        span.append(')');
    }
    span.append('\n');
    ui.output.append(span);
    consoleLength += span.textContent.length;
    ui.console.scrollTop = ui.console.scrollHeight;
}

function clearConsole() {
    ui.output.textContent = '';
    consoleLength = 0;
}

function showPrompt() {
    ui.prompt.hidden = false;
    ui.line.value = '';
    ui.line.focus({ preventScroll: true });
    ui.console.scrollTop = ui.console.scrollHeight;
}

function hidePrompt() {
    ui.prompt.hidden = true;
}

// A line of input in the output, as a terminal shows what is typed.
function echo(line, language) {
    appendText(line + (ENDS_INPUT_LINE.has(language) ? '' : '\n'), 'echo');
}

// A typed line (or null for the end of input) goes to the waiting worker.
function sendLine(line) {
    const current = active;
    if (current === null || current.finished || current.shared === null)
        return;
    hidePrompt();
    if (line === null) {
        appendText(ensureLineBreak() + '[end of input]\n', 'note');
    } else {
        line = line.substring(0, INPUT_BUFFER_CHARS);
        echo(line, current.language);
    }
    const control = new Int32Array(current.shared, 0, 2);
    const text = new Uint16Array(current.shared, 8);
    if (line !== null) {
        for (let index = 0; index < line.length; ++index)
            text[index] = line.charCodeAt(index);
    }
    Atomics.store(control, 1, line === null ? -1 : line.length);
    Atomics.store(control, 0, 1);
    Atomics.notify(control, 0);
    setStatus('Running…', 'running');
}

// --- The canvas

const canvasContext = ui.canvas.getContext('2d');

function drawFrame(message) {
    ui.screen.hidden = false;
    if (ui.canvas.width !== message.width || ui.canvas.height !== message.height) {
        ui.canvas.width = message.width;
        ui.canvas.height = message.height;
    }
    const pixels = new Uint8ClampedArray(message.pixels);
    canvasContext.putImageData(new ImageData(pixels, message.width, message.height), 0, 0);
}

// --- Start

// Cross-origin isolation (SharedArrayBuffer for typed input) needs headers
// that GitHub Pages does not send: the service worker adds them, and the
// first visit reloads once to get them. A browser that refuses service
// workers (or never answers) leaves the page without isolation: programs
// read the input box only.
async function isolate() {
    if (self.crossOriginIsolated || !('serviceWorker' in navigator) || !self.isSecureContext)
        return;
    const timeout = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds, false));
    try {
        const registered = navigator.serviceWorker.register('sw.js').then(() => true);
        if (!await Promise.race([registered, timeout(3000)]))
            return;
        if (navigator.serviceWorker.controller !== null || sessionStorage.getItem(RELOADED_KEY) !== null)
            return;
        sessionStorage.setItem(RELOADED_KEY, '1');
        if (!await Promise.race([navigator.serviceWorker.ready.then(() => true), timeout(3000)]))
            return;
        location.reload();
        await new Promise(() => {});
    } catch (error) {
        // No isolation.
    }
}

function bind() {
    ui.language.addEventListener('change', () => {
        state.language = ui.language.value;
        const key = documentOf(state.current[state.language] || '') !== null ? state.current[state.language]
                                                                             : firstDocument(state.language);
        if (key !== null)
            openDocument(key);
        else
            addProgram('program', state.language, '');
    });
    ui.program.addEventListener('change', () => openDocument(ui.program.value));
    ui.run.addEventListener('click', run);
    ui.stop.addEventListener('click', stop);
    ui.newProgram.addEventListener('click', newProgram);
    ui.save.addEventListener('click', saveAs);
    ui.revert.addEventListener('click', revert);
    ui.rename.addEventListener('click', rename);
    ui.remove.addEventListener('click', removeProgram);
    ui.open.addEventListener('click', () => ui.file.click());
    ui.file.addEventListener('change', () => {
        if (ui.file.files.length > 0)
            openFile(ui.file.files[0]);
        ui.file.value = '';
    });
    ui.download.addEventListener('click', download);
    ui.clear.addEventListener('click', clearConsole);
    ui.code.addEventListener('input', () => {
        edited();
        updateGutter();
        highlightSoon();
    });
    ui.code.addEventListener('scroll', followScroll);
    ui.code.addEventListener('keydown', editorKey);
    ui.input.addEventListener('input', () => {
        state.input = ui.input.value;
        saveSoon();
    });
    ui.inputPane.addEventListener('toggle', () => {
        state.inputOpen = ui.inputPane.open;
        saveSoon();
    });
    ui.prompt.addEventListener('submit', (event) => {
        event.preventDefault();
        sendLine(ui.line.value);
    });
    ui.line.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && (event.key === 'd' || event.key === 'z')) {
            event.preventDefault();
            sendLine(null);
        }
    });
    ui.console.addEventListener('click', () => {
        if (!ui.prompt.hidden && window.getSelection().isCollapsed)
            ui.line.focus({ preventScroll: true });
    });
    document.addEventListener('keydown', (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
            event.preventDefault();
            if (!ui.run.disabled)
                run();
        } else if ((event.ctrlKey || event.metaKey) && event.key === 's') {
            event.preventDefault();
            saveAs();
        } else if (event.key === 'Escape' && !ui.stop.disabled) {
            stop();
        }
    });
    window.addEventListener('beforeunload', saveNow);
}

async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok)
        throw new Error('Cannot load ' + url + ': ' + response.status);
    return response.json();
}

async function start() {
    await isolate();
    try {
        [manifest, examples] = await Promise.all([fetchJson('languages.json'), fetchJson('examples.json')]);
    } catch (error) {
        setStatus(error.message, 'failed');
        return;
    }
    languages = manifest.languages.concat([JAVASCRIPT]);
    programs = readStorage(PROGRAMS_KEY, []).filter((program) => languageOf(program.language) !== null);
    state = Object.assign({ language: 'basic', current: {}, drafts: {}, input: '', inputOpen: false },
                          readStorage(STATE_KEY, {}));
    ui.version.textContent = 'v4script ' + manifest.version;
    ui.isolation.hidden = self.crossOriginIsolated;
    ui.isolation.textContent = 'No cross-origin isolation in this browser: programs read only the Standard input box.';
    ui.input.value = state.input;
    ui.inputPane.open = state.inputOpen || !self.crossOriginIsolated;
    fillLanguages();
    bind();

    if (languageOf(state.language) === null)
        state.language = 'basic';
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    ui.run.disabled = false;
    setStatus('');
}

// #language opens the last program of the language, #language/example.ext
// that example.
function openFromHash() {
    const [language, file] = decodeURIComponent(location.hash.substring(1)).split('/');
    if (opened !== null && opened.language === language && (file === undefined || opened.name === file))
        return;
    if (languageOf(language) !== null)
        state.language = language;
    let key = file ? 'example:' + state.language + '/' + file : null;
    if (key === null || documentOf(key) === null)
        key = documentOf(state.current[state.language] || '') !== null ? state.current[state.language]
                                                                        : firstDocument(state.language);
    if (key === null)
        addProgram('program', state.language, '');
    else
        openDocument(key);
}

start();
