// Host layer: builds the `host` object that every language adapter receives.
//
// The file evaluates to a factory `function (bridge, global)`. The bridge is
// the native side - the C++ HostBridge (src/HostBridge.cpp) or a plain
// object in tools/run-samples.mjs - with a few primitive methods: write,
// readLine, readModule, canvas, clear, compile, unit, modules and,
// optionally, format. The factory returns { host, run, installConsole }.
// The contract is described in docs/internals/host.md.
(function (bridge, global) {
    'use strict';

    // Stream numbers - the same as v4script::Stream.
    var STREAMS = { stdout: 0, stderr: 1, warning: 2 };

    // --- Values as text

    // Strings as they are, objects and arrays as JSON (long ones indented),
    // everything else the way JavaScript prints it.
    function defaultFormat(value) {
        if (typeof value === 'string')
            return value;
        if (value === undefined || value === null || typeof value === 'number' || typeof value === 'boolean')
            return String(value);
        if (typeof value === 'symbol')
            return value.toString();
        if (typeof value === 'function')
            return '[function ' + (value.name || 'anonymous') + ']';
        if (value instanceof Error)
            return String(value);
        try {
            var text = JSON.stringify(value);
            if (text !== undefined)
                return text.length > 80 ? JSON.stringify(value, null, 2) : text;
        } catch (error) {
        }
        return String(value);
    }

    // The host may give its own format at any time.
    function format(value) {
        return bridge.hasFormat && bridge.hasFormat() ? String(bridge.format(value)) : defaultFormat(value);
    }

    // --- Output

    var writers = [];

    // A writer collects text that a language prints in pieces and passes
    // it to the host in chunks that end with a line break; the rest goes
    // out on flush (end of a run, before input is read, on request).
    function writer(stream) {
        var code = STREAMS[stream];
        if (code === undefined)
            throw new Error('Unknown output stream: ' + stream);
        var buffer = '';
        var result = {
            write: function (text) {
                buffer += String(text);
                var end = buffer.lastIndexOf('\n');
                if (end < 0)
                    return;
                bridge.write(code, buffer.substring(0, end + 1));
                buffer = buffer.substring(end + 1);
            },
            flush: function () {
                if (buffer.length > 0) {
                    var text = buffer;
                    buffer = '';
                    bridge.write(code, text);
                }
            }
        };
        writers.push(result);
        return result;
    }

    function flushAll() {
        for (var index = 0; index < writers.length; ++index)
            writers[index].flush();
    }

    // --- Input

    // One line from the host without its line break; null at the end of
    // input. Pending output goes first: a prompt must be visible before
    // the program waits for an answer.
    function readLine() {
        flushAll();
        var line = bridge.readLine();
        return line === null || line === undefined ? null : String(line);
    }

    // Standard input as text, shared by all languages of the engine, the
    // way a process has one stdin. Lines come from the host on demand; the
    // end of input is asked again every time (a console may get more).
    function Input() {
        this.buffer = '';
    }

    // Reads one more line into the buffer; false at the end of input.
    Input.prototype.fill = function () {
        var line = readLine();
        if (line === null)
            return false;
        this.buffer += line + '\n';
        return true;
    };

    // The next line without its line break; null at the end of input.
    Input.prototype.readLine = function () {
        var end;
        while ((end = this.buffer.indexOf('\n')) < 0 && this.fill()) {
        }
        if (end < 0) {
            if (this.buffer.length === 0)
                return null;
            end = this.buffer.length;
        }
        var line = this.buffer.substring(0, end);
        this.buffer = this.buffer.substring(end + 1);
        return line;
    };

    // The next UTF-16 code unit; null at the end of input.
    Input.prototype.readChar = function () {
        if (this.buffer.length === 0 && !this.fill())
            return null;
        var character = this.buffer.charAt(0);
        this.buffer = this.buffer.substring(1);
        return character;
    };

    Input.prototype.peekChar = function () {
        if (this.buffer.length === 0 && !this.fill())
            return null;
        return this.buffer.charAt(0);
    };

    // Everything up to the end of input.
    Input.prototype.readAll = function () {
        while (this.fill()) {
        }
        var text = this.buffer;
        this.buffer = '';
        return text;
    };

    // True at the end of input; may wait for the next line.
    Input.prototype.atEnd = function () {
        return this.buffer.length === 0 && !this.fill();
    };

    // Text that is already buffered: reading it never waits.
    Input.prototype.isReady = function () {
        return this.buffer.length > 0;
    };

    // --- Host modules

    function splitWords(name) {
        // "createTable" -> create, Table; "parseURL" -> parse, URL; "x2y" stays one word.
        return String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
            .split(/[\s_\-]+/).filter(function (word) { return word.length > 0; });
    }

    // The same name in the conventions of the languages.
    function nameVariants(name) {
        var words = splitWords(name);
        var lower = words.map(function (word) { return word.toLowerCase(); });
        var capitalized = lower.map(function (word) { return word.charAt(0).toUpperCase() + word.substring(1); });
        return {
            camel: String(name),
            pascal: String(name).charAt(0).toUpperCase() + String(name).substring(1),
            snake: lower.join('_'),
            kebab: lower.join('-'),
            upper: lower.join('').toUpperCase(),
            title: capitalized.join('')
        };
    }

    function makeFunction(module, spec) {
        var parameters = (spec.parameters || []).map(function (parameter) {
            return { name: String(parameter.name), type: String(parameter.type), optional: !!parameter.optional };
        });
        var required = 0;
        while (required < parameters.length && !parameters[required].optional)
            ++required;
        var fn = {
            module: module,
            name: String(spec.name),
            names: nameVariants(spec.name),
            parameters: parameters,
            required: required,
            result: String(spec.result || 'value'),
            getter: !!spec.getter
        };
        // Calls the implementation. Trailing optional arguments that the
        // language left out (undefined or null) are not passed at all.
        fn.invoke = function (args) {
            var object = module.object;
            if (fn.getter)
                return object[fn.name];
            var values = Array.prototype.slice.call(args || []);
            if (values.length > parameters.length)
                values.length = parameters.length;
            while (values.length > required && (values[values.length - 1] === undefined || values[values.length - 1] === null))
                values.pop();
            var target = object[fn.name];
            if (typeof target !== 'function')
                throw new TypeError(module.name + '.' + fn.name + ' is not a function');
            return target.apply(object, values);
        };
        return fn;
    }

    function makeModule(spec) {
        var module = {
            name: String(spec.name),
            names: nameVariants(spec.name),
            object: spec.object,
            global: spec.global !== false,
            functions: []
        };
        module.functions = (spec.functions || []).map(function (fn) { return makeFunction(module, fn); });
        module.find = function (name) {
            for (var index = 0; index < module.functions.length; ++index) {
                if (module.functions[index].name === name)
                    return module.functions[index];
            }
            return null;
        };
        return module;
    }

    // Modules as the bridge has them now: languages read them once, when
    // they load.
    function modules() {
        var list = bridge.modules() || [];
        var result = [];
        for (var index = 0; index < list.length; ++index)
            result.push(makeModule(list[index]));
        return result;
    }

    // --- The host

    var host = {
        version: String(bridge.version || ''),
        global: global,
        format: format,
        writer: writer,
        flush: flushAll,
        readLine: readLine,
        input: new Input(),
        // Text of a module or data file by name; null - there is none.
        readModule: function (name) {
            var text = bridge.readModule(String(name));
            return text === undefined || text === null ? null : String(text);
        },
        // Canvas for graphics (an HTML canvas-like object); null - none.
        canvas: function () {
            var canvas = bridge.canvas();
            return canvas === undefined ? null : canvas;
        },
        // Clears the output (CLS, ClrScr, PAGE).
        clear: function () {
            flushAll();
            bridge.clear();
        },
        // Source unit that runs now (a file, a block of a document).
        unit: function () {
            return String(bridge.unit() || '');
        },
        modules: modules,
        nameVariants: nameVariants,
        // Runs code built by a translator under the address
        // translated/<name>: the stack of an error shows which chunk it
        // came from. Returns the value of the code.
        compile: function (code, name) {
            var result = bridge.compile(String(name), String(code));
            if (result.error !== undefined)
                throw new Error('Invalid translated code (' + name + ', line ' + result.line + '): ' + result.error);
            return result.value;
        },
        schedule: function (callback, delay) {
            return global.setTimeout(callback, delay);
        },
        cancel: function (id) {
            global.clearTimeout(id);
        },
        // Error of a program: text, line in the unit or module and the
        // module name ('' - the unit itself).
        error: function (message, line, source) {
            var error = new Error(String(message));
            error.line = line || 0;
            error.source = source || '';
            return error;
        }
    };

    // Runs code with an adapter: the result is { value } or
    // { error, line, source }.
    function run(runner, code) {
        try {
            var value = runner.run(String(code));
            return { value: value === undefined || value === null ? '' : format(value) };
        } catch (error) {
            var isObject = error !== null && typeof error === 'object';
            return {
                error: isObject && error.message !== undefined ? String(error.message) : format(error),
                line: isObject ? (error.line | 0) : 0,
                source: isObject && error.source ? String(error.source) : ''
            };
        } finally {
            flushAll();
        }
    }

    // A module for JavaScript code: the object under the name of the
    // module and, for a global module, its functions as global functions
    // (getters as global properties). Names that exist stay as they are.
    function exposeModule(spec) {
        var module = makeModule(spec);
        if (!(module.name in global))
            Object.defineProperty(global, module.name, { value: module.object, writable: true, configurable: true });
        if (!module.global)
            return;
        module.functions.forEach(function (fn) {
            if (fn.name in global)
                return;
            if (fn.getter)
                Object.defineProperty(global, fn.name, { get: function () { return fn.invoke([]); }, configurable: true });
            else
                Object.defineProperty(global, fn.name, {
                    value: function () { return fn.invoke(arguments); }, writable: true, configurable: true
                });
        });
    }

    // console and print for engines without their own (v4script::Runtime).
    function installConsole() {
        function join(values) {
            var parts = [];
            for (var index = 0; index < values.length; ++index)
                parts.push(format(values[index]));
            return parts.join(' ') + '\n';
        }
        var out = writer('stdout');
        var err = writer('stderr');
        var warn = writer('warning');
        function to(target) {
            return function () {
                target.write(join(arguments));
                target.flush();
            };
        }
        global.console = {
            log: to(out),
            info: to(out),
            debug: to(out),
            warn: to(warn),
            error: to(err)
        };
        global.print = global.console.log;
    }

    return { host: host, run: run, installConsole: installConsole, exposeModule: exposeModule };
})
