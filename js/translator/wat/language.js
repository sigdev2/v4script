// WAT: the language session - the commands of a unit in order, named
// modules are visible to other units (import) and to JavaScript, WASI
// output to the console, modules from host files, the value of a unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.language)
        return;

    var rt = W.rt;
    var hasOwn = Object.prototype.hasOwnProperty;

    function Session(env) {
        this.env = env;
        this.pendingInput = '';
        // A name for import -> the exports { name: { kind, value } }.
        this.registry = {};
        // Names registered from host files in this run.
        this.fromAttachments = {};
        this.loading = {};
        // $id of the script -> an instance; the last one created - for invoke.
        this.instances = {};
        this.current = null;
        this.hostRefs = {};
        this.pending = { 1: '', 2: '' };
        this.started = Date.now();
    }

    // --- Output

    // The bytes of WASI fd_write: whole UTF-8 characters at once, the tail later.
    Session.prototype.writeBytes = function (fd, u8, start, length) {
        var text = this.pending[fd] + T.utf8.fromBytes(Array.prototype.slice.call(u8, start, start + length));
        var cut = text.length;
        // An unfinished sequence at the end - wait for the rest.
        for (var back = 1; back <= 3 && back <= text.length; ++back) {
            var code = text.charCodeAt(text.length - back);
            if ((code & 0xC0) === 0xC0) {
                var need = code >= 0xF0 ? 4 : (code >= 0xE0 ? 3 : 2);
                if (need > back)
                    cut = text.length - back;
                break;
            }
            if ((code & 0xC0) !== 0x80)
                break;
        }
        this.pending[fd] = text.substring(cut);
        var complete = text.substring(0, cut);
        if (complete.length > 0)
            (fd === 2 ? this.env.err : this.env.out).write(T.utf8.decode(complete));
    };

    Session.prototype.flushOutput = function () {
        var self = this;
        [1, 2].forEach(function (fd) {
            if (self.pending[fd].length > 0) {
                (fd === 2 ? self.env.err : self.env.out).write(T.utf8.decode(self.pending[fd]));
                self.pending[fd] = '';
            }
        });
        this.env.out.flush();
        this.env.err.flush();
    };

    Session.prototype.printLine = function (text) {
        this.flushOutput();
        this.env.out.write(text + '\n');
    };

    Session.prototype.monotonic = function () {
        return Date.now() - this.started;
    };

    // --- Modules

    Session.prototype.isStackOverflow = function (error) {
        return error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message));
    };

    // A module under a name for import; jsVisible - in JavaScript too.
    Session.prototype.register = function (name, instance, jsVisible) {
        this.registry[name] = instance.exports;
        if (!jsVisible)
            return;
        var target = this.env.global;
        var object = {};
        Object.keys(instance.exports).forEach(function (key) {
            var entry = instance.exports[key];
            object[key] = entry.kind === 'func' ? rt.jsFunction(entry.value) : entry.value;
        });
        var previous = target[name];
        // Names that are not ours (APIs, JavaScript variables) are not replaced.
        if (previous === undefined || (previous !== null && typeof previous === 'object' && previous.$watModule === true)) {
            Object.defineProperty(object, '$watModule', { value: true });
            target[name] = object;
        }
    };

    // The exported functions of a module become functions in the global
    // JavaScript object (unless someone else has the name).
    Session.prototype.exposeFunctions = function (instance) {
        var target = this.env.global;
        Object.keys(instance.exports).forEach(function (key) {
            var entry = instance.exports[key];
            if (entry.kind !== 'func')
                return;
            var previous = target[key];
            if (previous === undefined || (typeof previous === 'function' && previous.$wasm !== undefined))
                target[key] = rt.jsFunction(entry.value);
        });
    };

    Session.prototype.resolveImport = function (entry, kind, expected, context) {
        var name = entry.module;
        if (!hasOwn.call(this.registry, name)) {
            var host = W.host.resolve(this, entry, kind, expected, context);
            if (host !== undefined)
                return host;
            this.loadAttachment(name, entry);
        }
        if (!hasOwn.call(this.registry, name))
            throw W.unknownImport(entry);
        var exports = this.registry[name];
        if (!hasOwn.call(exports, entry.name))
            throw W.unknownImport(entry);
        return exports[entry.name];
    };

    // import "name" without a module of that name - the host file name.wat.
    Session.prototype.loadAttachment = function (name, entry) {
        var file = /\.wat$/i.test(name) ? name : name + '.wat';
        var text = this.env.readModule(file);
        if (text === null || text === undefined)
            return;
        if (this.loading[file])
            throw W.error('unlinkable', 'circular import of ' + file, entry.line, 0);
        this.loading[file] = true;
        try {
            var forms = W.read(text, file);
            var runner = new W.Runner(this, { source: file });
            var commands = W.parseScript(forms, file);
            var instance = null;
            commands.forEach(function (command) {
                if (command.type !== 'module')
                    throw new T.CompileError('only module fields are allowed in an imported file', command.line, 0, file);
                instance = runner.instantiate(command);
            });
            if (instance === null)
                throw new T.CompileError('no module in ' + file, 1, 0, file);
            this.register(name, instance, false);
            this.fromAttachments[name] = true;
        } finally {
            delete this.loading[file];
        }
    };

    // --- The unit

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        var self = this;
        // Host files are loaded again on every run.
        Object.keys(this.fromAttachments).forEach(function (name) {
            delete self.registry[name];
        });
        this.fromAttachments = {};
        this.pending = { 1: '', 2: '' };
        var forms = W.read(code, '');
        var commands = W.parseScript(forms, '');
        var runner = new W.Runner(this, { source: '' });
        // Translation errors - before anything runs.
        commands.forEach(function (command) {
            if (command.type === 'module')
                runner.prepare(command);
        });
        var lastAction = -1;
        var hasAsserts = false;
        commands.forEach(function (command, index) {
            if (command.type === 'action')
                lastAction = index;
            else if (command.type !== 'module' && command.type !== 'register')
                hasAsserts = true;
        });
        var value;
        try {
            for (var index = 0; index < commands.length; ++index) {
                var command = commands[index];
                var result = runner.execute(command);
                if (command.type === 'module')
                    this.exposeFunctions(this.current);
                if (result === null)
                    continue;
                if (index === lastAction && index === commands.length - 1)
                    value = this.blockValue(result);
                else if (result.values.length > 0)
                    this.printLine(runner.formatValues(result));
            }
            // Without commands: a module exporting _start or main is run.
            if (lastAction < 0 && !hasAsserts && this.current !== null && commands.length > 0 &&
                commands[commands.length - 1].type === 'module') {
                var exports = this.current.exports;
                var entry = exports._start || exports.main;
                if (entry !== undefined && entry.kind === 'func' && entry.value.$type.params.length === 0) {
                    var main = entry.value();
                    value = this.blockValue({ values: entry.value.$type.results.length === 1 ? [main]
                                                      : (entry.value.$type.results.length === 0 ? [] : main),
                                              types: entry.value.$type.results });
                }
            }
        } catch (error) {
            // proc_exit(0) is a normal end of the program.
            if (!(error instanceof rt.Exit) || error.exitCode !== 0)
                throw error;
        } finally {
            this.flushOutput();
        }
        return value;
    };

    // The value for the console: one as a JavaScript value, several as a
    // string, as the results of invoke print.
    Session.prototype.blockValue = function (result) {
        if (result.values.length > 1)
            return result.values.map(function (item, index) {
                return rt.format(item, result.types[index]);
            }).join(' ');
        var values = result.values.map(function (item, index) {
            var type = result.types[index];
            switch (type) {
            case 'i64':
                return typeof item === 'number' ? item : T.i64.str(item);
            case 'f32':
                return Number(W.numbers.formatF32(item).replace('inf', 'Infinity').replace('nan', 'NaN'));
            case 'funcref':
                return item === null ? null : rt.format(item, type);
            }
            return item;
        });
        return values.length === 0 ? undefined : values[0];
    };

    Session.prototype.describeError = function (error) {
        if (this.isStackOverflow(error))
            return 'call stack exhausted';
        if (error instanceof T.LanguageError)
            return error.message;
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name && error.name !== 'Error' ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    Session.prototype.deadlock = function () {
        return new T.LanguageError('deadlock');
    };

    W.Session = Session;
    W.language = {
        id: 'wat',
        name: 'WebAssembly',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.wat = W.language;
})(globalThis);
