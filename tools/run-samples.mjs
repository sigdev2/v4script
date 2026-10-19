// Quick check of the languages in Node.js. A language loads the way the
// engine loads it (its files from languages.json, the host layer
// js/host/host.js with a bridge of this script) and runs the samples
// tests/samples/<language>/*. The final check is LanguagesTest in the Qt
// engine: V4 is stricter and slower than Node.
//
//   node tools/run-samples.mjs go [part of a file name]
//   node tools/run-samples.mjs go --run file.go [--dump] [--input file]   run a file, --dump shows the JavaScript
//   node tools/run-samples.mjs java --library   translate the whole library of the language (errors in it)
//   node tools/run-samples.mjs wat --wast file.wast|directory   WebAssembly specification tests (.wast)
//   node tools/run-samples.mjs basic --examples [--show]   the examples of the playground (web/examples) run without errors
//   V4SCRIPT_JS=build/js-min node tools/run-samples.mjs go   the same with the minified scripts
//
// Expectations at the end of a sample are line comments of the language:
// "Input:" and lines of standard input, "Output:" and lines of output
// (standard error with "!"), "Value: ...", "Error: ..." (part of the text),
// "Line: N". See docs/testing/README.md.
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

// The interpreters are built for browsers: with `process` they take Node.js
// branches and want its modules. This script keeps its own reference.
const nodeProcess = globalThis.process;
globalThis.process = undefined;
// Programs get the console of the host layer; the script prints with Node's.
const nodeConsole = globalThis.console;
const print = (...values) => nodeConsole.log(...values);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// V4SCRIPT_JS=<directory> takes the scripts from elsewhere (the minified copy).
const JS = nodeProcess.env.V4SCRIPT_JS ? path.resolve(nodeProcess.env.V4SCRIPT_JS) : path.join(ROOT, 'js');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, 'languages.json'), 'utf8'));
const LANGUAGES = Object.fromEntries(MANIFEST.languages.map((language) => [language.id, language]));

function runFile(file) {
    const full = path.join(JS, file);
    return vm.runInThisContext(fs.readFileSync(full, 'utf8'), { filename: full });
}

// Interpreter bundles define globals that cannot be defined twice: they
// load once per process, like once per engine.
const loadedFiles = new Set();
function loadOnce(file) {
    if (!loadedFiles.has(file)) {
        loadedFiles.add(file);
        runFile(file);
    }
}

// The host module "app" of the samples (tests/app-module.js), the same as in
// tests/LanguagesTest.cpp.
function makeAppModule() {
    const file = path.join(ROOT, 'tests', 'app-module.js');
    return vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file })();
}

// A canvas that draws nothing: the examples of the playground draw on the
// canvas of the page, and the global variable canvas is there too.
function makeCanvas() {
    const context = new Proxy({}, {
        get(target, name) {
            if (name in target)
                return target[name];
            if (name === 'createImageData')
                return (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });
            if (name === 'measureText')
                return () => ({ width: 0 });
            return () => undefined;
        }
    });
    return { width: 300, height: 150, getContext: () => context };
}

function load(language, options) {
    runFile('host/compat.js')(globalThis);
    const info = LANGUAGES[language];
    const files = (info.translator ? MANIFEST.translatorCore : []).concat(info.files);
    for (const file of files)
        loadOnce(file);
    const T = globalThis.V4ScriptTranslator;
    if (nodeProcess.env.TRANSLATOR_DEBUG && T)
        T.debug = (error) => print('DEBUG', error && error.stack);

    const output = [];
    const pending = ['', '', ''];
    const timers = [];
    const modules = options.modules || {};
    const input = options.input || [];
    const appModule = makeAppModule();
    const bridge = {
        version: fs.readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim(),
        write(stream, text) {
            pending[stream] += text;
            let end;
            while ((end = pending[stream].indexOf('\n')) >= 0) {
                output.push((stream === 1 ? '!' : '') + pending[stream].substring(0, end));
                pending[stream] = pending[stream].substring(end + 1);
            }
        },
        readLine: () => input.length > 0 ? input.shift() : null,
        readModule: (name) => Object.prototype.hasOwnProperty.call(modules, name) ? modules[name] : null,
        canvas: () => options.canvas || null,
        clear: () => {},
        unit: () => 'main',
        modules: () => [appModule],
        hasFormat: () => false,
        format: (value) => String(value),
        compile(name, code) {
            if (options.dump)
                print('--- ' + name + '\n' + code);
            return {
                value: vm.runInThisContext(code, {
                    filename: 'file:///v4script/translated/' + encodeURIComponent(name)
                })
            };
        }
    };
    const layer = runFile('host/host.js')(bridge, globalThis);
    layer.installConsole();
    globalThis.setTimeout = (callback) => {
        timers.push(callback);
        return timers.length;
    };
    globalThis.clearTimeout = () => {};
    const languageObject = T && T.languages[language];
    let session = null;
    if (languageObject) {
        const createSession = languageObject.createSession;
        languageObject.createSession = (env) => (session = createSession(env));
    }
    const runner = runFile(info.adapter)(layer.host);
    return {
        session: () => session,
        run(code) {
            output.length = 0;
            const outcome = layer.run(runner, code);
            // Continuation in timers (goroutines that wait for time).
            while (timers.length > 0)
                timers.shift()();
            layer.host.flush();
            for (let stream = 0; stream < pending.length; ++stream) {
                if (pending[stream].length > 0) {
                    output.push((stream === 1 ? '!' : '') + pending[stream]);
                    pending[stream] = '';
                }
            }
            const error = outcome.error !== undefined
                ? { message: outcome.error, line: outcome.line, source: outcome.source } : null;
            return { output: output.slice(), value: outcome.value, error };
        }
    };
}

function expectations(text, comment) {
    const result = { input: [], output: null, value: null, error: null, line: null };
    let section = null;
    for (const line of text.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith(comment)) {
            if (trimmed.length > 0)
                section = null;
            continue;
        }
        const body = trimmed.substring(comment.length).replace(/^ /, '');
        let match;
        if (body === 'Output:') {
            section = 'output';
            result.output = [];
        } else if (body === 'Input:') {
            section = 'input';
        } else if ((match = /^Value: (.*)$/.exec(body))) {
            result.value = match[1];
            section = null;
        } else if ((match = /^Error: (.*)$/.exec(body))) {
            result.error = match[1];
            section = null;
        } else if ((match = /^Line: (\d+)$/.exec(body))) {
            result.line = Number(match[1]);
            section = null;
        } else if (section === 'output') {
            result.output.push(body.replace(/\s+$/, ''));
        } else if (section === 'input') {
            result.input.push(body);
        }
    }
    return result;
}

const [language, ...rest] = nodeProcess.argv.slice(2);
if (!LANGUAGES[language]) {
    print('usage: node run-samples.mjs <' + Object.keys(LANGUAGES).join('|') +
                '> [filter | --run file [--dump] [--input file] | --library | --wast path | --examples [--show]]');
    nodeProcess.exit(2);
}
if (rest[0] === '--library') {
    // The whole library of the language at once: errors in its sources.
    const session = load(language, {}).session();
    const started = Date.now();
    const count = session.compileWholeLibrary();
    print('library compiled: ' + count + ' (' + (Date.now() - started) + ' ms)');
    nodeProcess.exit(0);
}
if (rest[0] === '--wast') {
    // assert_* commands count one by one; an error does not stop the file.
    const files = fs.statSync(rest[1]).isDirectory()
        ? fs.readdirSync(rest[1]).filter((name) => name.endsWith('.wast')).sort().map((name) => path.join(rest[1], name))
        : [rest[1]];
    let totalPass = 0, totalFail = 0;
    for (const file of files) {
        const session = load(language, {}).session();
        const Wat = globalThis.V4ScriptTranslator.wat;
        let pass = 0;
        const failures = [];
        const runner = new Wat.Runner(session, {
            source: '', harness: true,
            onAssert(ok, message, line) {
                if (ok)
                    ++pass;
                else
                    failures.push(line + ': ' + message);
            }
        });
        let commands = [];
        try {
            commands = Wat.parseScript(Wat.read(fs.readFileSync(file, 'utf8'), ''), '');
        } catch (error) {
            failures.push('parse: ' + error.message);
        }
        for (const command of commands) {
            try {
                runner.execute(command);
                if (command.type === 'module' || command.type === 'action' || command.type === 'register')
                    ++pass;
            } catch (error) {
                failures.push(command.line + ': ' + command.type + ': ' + (error && error.message));
            }
        }
        totalPass += pass;
        totalFail += failures.length;
        print((failures.length > 0 ? 'FAIL ' : 'ok   ') + path.basename(file) + ': ' + pass + ' passed, ' +
                    failures.length + ' failed');
        failures.slice(0, 10).forEach((failure) => print('   ' + failure));
    }
    print(totalPass + ' passed, ' + totalFail + ' failed');
    nodeProcess.exit(totalFail > 0 ? 1 : 0);
}
if (rest[0] === '--examples') {
    // The examples of the playground (web/examples) run without an error,
    // with the input given in its index; the other examples are their files.
    const examples = path.join(ROOT, 'web', 'examples');
    const index = JSON.parse(fs.readFileSync(path.join(examples, 'index.json'), 'utf8'));
    const modules = {};
    for (const [id, groups] of Object.entries(index)) {
        for (const example of groups.flatMap((group) => group.examples))
            modules[example.file] = fs.readFileSync(path.join(examples, id, example.file), 'utf8');
    }
    let failed = 0, passed = 0;
    for (const example of (index[language] || []).flatMap((group) => group.examples)) {
        const started = Date.now();
        const canvas = makeCanvas();
        globalThis.canvas = canvas;
        const result = load(language, { input: (example.input || []).slice(), modules, canvas })
            .run(modules[example.file]);
        if (result.error) {
            ++failed;
            print('FAIL ' + example.file + ': ' + result.error.message + ' (line ' + result.error.line + ')');
        } else {
            ++passed;
            print('ok   ' + example.file + ' (' + (Date.now() - started) + ' ms)');
        }
        if (rest.includes('--show'))
            result.output.forEach((line) => print('     ' + line));
    }
    print(passed + ' passed, ' + failed + ' failed');
    nodeProcess.exit(failed > 0 ? 1 : 0);
}
if (rest[0] === '--run') {
    const inputIndex = rest.indexOf('--input');
    const input = inputIndex >= 0 ? fs.readFileSync(rest[inputIndex + 1], 'utf8').split(/\r?\n/) : [];
    if (input.length > 0 && input[input.length - 1] === '')
        input.pop();
    const session = load(language, { dump: rest.includes('--dump'), input });
    const result = session.run(fs.readFileSync(rest[1], 'utf8'));
    result.output.forEach((line) => print(line));
    if (result.error)
        print('ERROR ' + result.error.message + ' (line ' + result.error.line + ')');
    else if (result.value !== '')
        print('=> ' + result.value);
    nodeProcess.exit(0);
}

const directory = path.join(ROOT, 'tests', 'samples', language);
let failed = 0, passed = 0;
for (const file of fs.readdirSync(directory).sort()) {
    if (rest[0] && !file.includes(rest[0]))
        continue;
    const text = fs.readFileSync(path.join(directory, file), 'utf8');
    const expected = expectations(text, LANGUAGES[language].lineComment);
    const started = Date.now();
    const result = load(language, { input: expected.input.slice() }).run(text);
    const problems = [];
    const seen = result.output.map((line) => line.replace(/\s+$/, ''));
    if (expected.output !== null && JSON.stringify(seen) !== JSON.stringify(expected.output)) {
        for (let index = 0; index < Math.max(seen.length, expected.output.length); ++index) {
            if (seen[index] !== expected.output[index])
                problems.push('  line ' + (index + 1) + ': got ' + JSON.stringify(seen[index]) + ', want ' +
                              JSON.stringify(expected.output[index]));
        }
    }
    if (expected.error !== null) {
        if (result.error === null || !result.error.message.includes(expected.error))
            problems.push('  error: got ' + (result.error ? result.error.message : 'none') + ', want ' + expected.error);
        else if (expected.line !== null && result.error.line !== expected.line)
            problems.push('  error line: got ' + result.error.line + ', want ' + expected.line);
    } else if (result.error !== null) {
        problems.push('  unexpected error: ' + result.error.message + ' (line ' + result.error.line + ')');
    }
    if (expected.value !== null && String(result.value) !== expected.value)
        problems.push('  value: got ' + result.value + ', want ' + expected.value);
    if (problems.length > 0) {
        ++failed;
        print('FAIL ' + file + '\n' + problems.join('\n'));
    } else {
        ++passed;
        print('ok   ' + file + ' (' + (Date.now() - started) + ' ms)');
    }
}
print(passed + ' passed, ' + failed + ' failed');
nodeProcess.exitCode = failed > 0 ? 1 : 0;
