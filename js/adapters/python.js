// Python - Skulpt (Python 3 in JavaScript).
//
// All units in Python are the module __main__ of one interpreter: top-level
// variables and functions are shared. Host modules are Python modules
// (import app) and, when global, built-in functions with the names of
// JavaScript; anything else from JavaScript is reached through the
// built-in object js. Modules and open() read files through the host
// (readModule); input() reads standard input.
(function (host) {
    'use strict';

    var global = host.global;
    var Sk = global.Sk;
    var output = host.writer('stdout');
    // Texts of the files that modules came from: a changed file loads again
    // on the next run.
    var moduleTexts = {};

    function unitFile(unit) {
        return 'unit_' + String(unit).replace(/\W/g, '_');
    }

    function moduleName(path) {
        if (path.indexOf('./') === 0)
            path = path.substring(2);
        return path;
    }

    // Host modules: Skulpt looks for a module in JavaScript at
    // src/lib/<name>.js; the text found there takes its attributes from
    // Sk.v4scriptModules (Skulpt forgets imported modules on every run).
    var hostModules = {};

    function read(path) {
        var files = Sk.builtinFiles.files;
        if (files[path] !== undefined)
            return files[path];
        var hostModule = /^src\/lib\/(\w+)\.js$/.exec(path);
        if (hostModule !== null && hostModules[hostModule[1]] !== undefined)
            return 'var $builtinmodule = function (dict) { return Sk.v4scriptModules[dict.__name__.v](); };';
        // Skulpt modules in JavaScript never come from the host: a ".js" file
        // is a JavaScript library.
        if (path.indexOf('src/') !== 0 && !/\.js$/.test(path)) {
            var name = moduleName(path);
            var text = host.readModule(name);
            if (text !== null) {
                if (/\.py$/.test(name))
                    moduleTexts[name] = text;
                return text;
            }
        }
        throw new Sk.builtin.OSError("File not found: '" + moduleName(path) + "'");
    }

    Sk.configure({
        output: function (text) { output.write(text); },
        read: read,
        __future__: Sk.python3,
        retainGlobals: true,
        execLimit: null,
        yieldLimit: null,
        inputfunTakesPrompt: true,
        inputfun: function (prompt) {
            if (prompt)
                output.write(prompt);
            var line = host.input.readLine();
            if (line === null)
                throw new Sk.builtin.EOFError('EOF when reading a line');
            return line;
        }
    });

    function proxy(value) {
        return Sk.ffi.proxy(value);
    }

    // A JavaScript array in Python is a live list (proxylist); it prints as
    // a usual list, without the type name.
    Object.getPrototypeOf(proxy([])).$r = Sk.builtin.list.prototype.$r;

    Sk.builtins.js = proxy(global);
    // Skulpt defines these exceptions but does not put them into builtins.
    ['EOFError', 'BufferError', 'MemoryError', 'ReferenceError', 'TimeoutError', 'UnboundLocalError',
     'FloatingPointError', 'TabError', 'FileNotFoundError'].forEach(function (name) {
        if (Sk.builtins[name] === undefined && Sk.builtin[name] !== undefined)
            Sk.builtins[name] = Sk.builtin[name];
    });

    // Host modules: getters are functions here - their value may change
    // between calls (the current block of a document, a counter).
    Sk.v4scriptModules = {};
    host.modules().forEach(function (module) {
        var attributes = {};
        module.functions.forEach(function (fn) {
            var callable = proxy(function () { return fn.invoke(arguments); });
            // Skulpt renames identifiers that JavaScript reserves (name, length).
            var key = Sk.fixReserved(fn.name);
            attributes[key] = callable;
            // A global function never hides a built-in one (range, len).
            if (module.global && Sk.builtins[key] === undefined)
                Sk.builtins[key] = callable;
        });
        hostModules[module.name] = true;
        Sk.v4scriptModules[module.name] = function () {
            var copy = {};
            Object.keys(attributes).forEach(function (name) { copy[name] = attributes[name]; });
            return copy;
        };
    });

    function forgetChangedModules() {
        Object.keys(moduleTexts).forEach(function (name) {
            if (host.readModule(name) === moduleTexts[name])
                return;
            delete moduleTexts[name];
            var module = name.replace(/\.py$/, '').replace(/\/__init__$/, '').replace(/\//g, '.');
            try {
                Sk.abstr.objectDelItem(Sk.sysmodules, new Sk.builtin.str(module));
            } catch (error) {
            }
        });
    }

    var VALUE = '__v4script_value__';

    // Value of the last expression, as in interactive Python: if the unit
    // ends with an expression, it is assigned to a service variable and the
    // line numbers do not move.
    function withValue(code, file) {
        var body;
        try {
            var parsed = Sk.parse(file, code);
            body = Sk.astFromParse(parsed.cst, file, parsed.flags).body;
        } catch (error) {
            return null;
        }
        var last = body[body.length - 1];
        if (!last || !(last instanceof Sk.astnodes.Expr) || last.col_offset !== 0)
            return null;
        var lines = code.split('\n');
        var index = last.lineno - 1;
        lines[index] = VALUE + ' = (' + lines[index];
        var changed = lines.join('\n') + '\n)';
        try {
            Sk.parse(file, changed);
        } catch (error) {
            return null;
        }
        return changed;
    }

    function describe(value) {
        if (value === undefined || value === Sk.builtin.none.none$)
            return undefined;
        if (value instanceof Sk.builtin.str)
            return value.v;
        if (value.constructor && value.constructor.prototype.tp$name === 'proxyobject')
            return host.format(Sk.ffi.toJs(value));
        return Sk.misceval.objectRepr(value);
    }

    // A Python error as a host error: the line comes from the frame of the
    // unit, or, if the error is in a module, the line in it and its name.
    function toError(error, file) {
        if (!(error instanceof Sk.builtin.BaseException))
            return error;
        var message = error.tp$name;
        if (error.args && error.args.v && error.args.v.length > 0) {
            var text = Sk.misceval.objectRepr(error.args.v[0]);
            if (error.args.v[0] instanceof Sk.builtin.str)
                text = error.args.v[0].v;
            message += ': ' + text;
        }
        var frames = error.traceback || [];
        var inner = frames[0];
        if (inner && inner.filename && inner.filename.indexOf('./') === 0)
            return host.error(message, inner.lineno, moduleName(inner.filename));
        for (var index = 0; index < frames.length; ++index) {
            if (frames[index].filename === file + '.py')
                return host.error(message, frames[index].lineno);
        }
        return host.error(message, inner ? inner.lineno : 0);
    }

    return {
        run: function (code) {
            var file = unitFile(host.unit());
            forgetChangedModules();
            var changed = withValue(code, file);
            var module;
            try {
                module = Sk.importMainWithBody(file, false, changed === null ? code : changed, false);
            } catch (error) {
                throw toError(error, file);
            }
            if (changed === null)
                return undefined;
            var value = module.$d[VALUE];
            delete module.$d[VALUE];
            return describe(value);
        }
    };
})
