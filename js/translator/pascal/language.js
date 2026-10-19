// Pascal: the language session - the program shared by all units (global
// names, the variables $V, the routines and classes $P), Pascal units from
// the language library and from host files, translation and run of a unit,
// the place and the text of an error.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.language)
        return;

    var J = T.J;
    var utf8 = T.utf8;

    var CHUNK_PARAMS = ['$R', '$V', '$P', '$D', '$T'];

    function Session(env) {
        this.env = env;
        this.V = Object.create(null);
        this.P = Object.create(null);
        this.rt = new Pascal.Runtime(this);
        this.systemScope = Pascal.createSystemScope();
        this.globalScope = new Pascal.Scope('session', null);
        this.units = Object.create(null);
        this.usedUnits = [];
        this.procNames = Object.create(null);
        this.usedProcNames = Object.create(null);
        this.memoryFiles = Object.create(null);
        this.natives = { methods: {}, routines: {} };
        this.running = false;
        this.loading = Object.create(null);
        Pascal.initSystemVariables(this.rt, this.V);
        this.loadSystem();
        this.useHostModules(env.modules);
    }

    // Every host module is a unit (uses App). A global one is used by every
    // program too - without the names of System, which it must not hide.
    Session.prototype.useHostModules = function (modules) {
        var self = this;
        modules.forEach(function (module) {
            var name = module.name.toLowerCase();
            var title = module.names.title;
            Pascal.libraryUnits[name] = Pascal.hostUnit(module, title, null);
            if (!module.global)
                return;
            var hidden = name + '$global';
            Pascal.libraryUnits[hidden] = Pascal.hostUnit(module, title, function (key) {
                return self.systemScope.find(key) !== null;
            });
            var place = { text: title, file: null, line: 0, column: 0, source: '' };
            var unit = self.loadUnit(hidden, place, null);
            unit.qualifier = name;
            unit.fullUnit = self.loadUnit(name, place, null);
            if (self.usedUnits.indexOf(unit) < 0)
                self.usedUnits.push(unit);
        });
    };

    Session.prototype.attachment = function (name) {
        return this.env.readModule(name);
    };

    // The System unit: TObject and TClass come from the source, into the System scope.
    Session.prototype.loadSystem = function () {
        var unit = this.compileUnitText('system', 'System', Pascal.SYSTEM_SOURCE, T.LIBRARY_SOURCE, Pascal.systemNatives(this.rt), true);
        var scope = this.systemScope;
        Object.keys(unit.scope.names).forEach(function (name) {
            scope.define(name, unit.scope.names[name]);
        });
        this.tobject = unit.scope.names.tobject.type;
        this.systemUnit = unit;
    };

    Session.prototype.afterConstructionSlot = function () {
        return this.tobject.methods.afterconstruction[0].slot;
    };

    Session.prototype.getRandSeed = function () {
        return this.V.system$randseed >>> 0;
    };
    Session.prototype.setRandSeed = function (value) {
        this.V.system$randseed = value >>> 0;
    };

    // Pascal units visible to the compiler: a Pascal unit sees only its
    // uses, a program all those included in the session before.
    Session.prototype.unitsForCompile = function (unit) {
        if (unit !== null && unit !== undefined)
            return [];
        return this.usedUnits.slice();
    };

    Session.prototype.arrayOfConstType = function () {
        if (this.arrayOfConst === undefined)
            this.arrayOfConst = new Pascal.Type('arrayofconst', { name: 'Array Of Const', of: null, size: 8 });
        return this.arrayOfConst;
    };

    // --- Pascal units

    // A Pascal unit by name: the language library or the host file "name.pas".
    Session.prototype.loadUnit = function (name, node, fromUnit) {
        if (name === 'system')
            return this.systemUnit;
        var unit = this.units[name];
        if (unit !== undefined) {
            // A Pascal unit from a host file is translated again if the file was replaced.
            if (unit.file === null || unit.file === undefined || this.attachment(unit.file) === unit.sourceText)
                return unit;
        }
        if (this.loading[name])
            throw new T.CompileError('Circular unit reference to ' + node.text, node.line, node.column, node.source);
        var library = Pascal.libraryUnits[name];
        if (library !== undefined) {
            if (library.alias !== undefined)
                return this.loadUnit(library.alias, node, fromUnit);
            unit = this.compileUnitText(name, library.title, library.source, T.LIBRARY_SOURCE,
                                        library.natives ? library.natives(this.rt, this) : null, false, library);
            return unit;
        }
        var text = null, file = null;
        var candidates = [node.file, node.text + '.pas', name + '.pas', node.text + '.pp', name + '.pp', node.text + '.p'];
        for (var index = 0; index < candidates.length && text === null; ++index) {
            if (candidates[index] === null || candidates[index] === undefined)
                continue;
            var read = this.attachment(utf8.decode(candidates[index]));
            if (read !== null && read !== undefined) {
                text = read;
                file = utf8.decode(candidates[index]);
            }
        }
        if (text === null)
            return null;
        var previous = unit;
        unit = this.compileUnitText(name, node.text, text, file, null, false);
        unit.file = file;
        unit.sourceText = text;
        if (previous !== undefined) {
            var at = this.usedUnits.indexOf(previous);
            if (at >= 0)
                this.usedUnits[at] = unit;
        }
        return unit;
    };

    // Translation of a Pascal unit and the run of its chunk (initialization).
    Session.prototype.compileUnitText = function (name, title, text, source, natives, isSystem, library) {
        var self = this;
        this.loading[name] = true;
        try {
            var file = Pascal.parse(text, source, {
                attachment: function (file) { return self.attachment(file); }, unitExpected: true
            });
            var unit = { name: name, text: title, js: name.replace(/\W/g, '_'), scope: new Pascal.Scope('unit', null),
                         natives: natives || { methods: {}, routines: {} }, library: !!library };
            if (library && library.builtins)
                library.builtins(unit.scope);
            var compiler = new Pascal.Compiler(this, { source: source, unit: unit });
            var statements = compiler.compileUnit(file);
            var made = this.env.compileChunk(statements, CHUNK_PARAMS, [this.rt, this.V, this.P, compiler.constants, T], source,
                                             { library: source === T.LIBRARY_SOURCE });
            this.commit(compiler, made, true);
            this.units[name] = unit;
            unit.compiler = compiler;
            if (made.main !== undefined) {
                this.running = true;
                try {
                    var result = made.main();
                    if (T.isGenerator(result))
                        this.env.scheduler.runNested(result);
                } finally {
                    this.running = false;
                }
            }
            if (library && library.after)
                library.after(this, unit);
            return unit;
        } finally {
            delete this.loading[name];
        }
    };

    // An external routine of a Pascal unit: a JavaScript function from the natives of the unit.
    Session.prototype.findNative = function (unit, proc) {
        var natives = unit !== null ? unit.natives : null;
        if (natives === null || natives === undefined)
            return null;
        var native = natives.routines[proc.name];
        if (native === undefined)
            return null;
        if (Array.isArray(native)) {
            var index = proc.symbol ? proc.symbol.procs.indexOf(proc) : 0;
            return native[index] || null;
        }
        return native;
    };

    Session.prototype.findMethodNative = function (unit, type, proc) {
        var natives = unit !== null ? unit.natives : null;
        if (natives === null || natives === undefined)
            return null;
        var native = natives.methods[type.name.toLowerCase() + '.' + proc.name];
        return native === undefined ? null : native;
    };

    // The exception object of SysUtils (or null if the unit is not loaded).
    Session.prototype.makeException = function (className, message) {
        var unit = this.units.sysutils;
        if (unit === undefined)
            return null;
        var symbol = unit.scope.names[className];
        if (symbol === undefined || symbol.kind !== 'type' || symbol.type.K === undefined)
            return null;
        var object = this.rt.alloc(symbol.type.K);
        object.fmessage = message;
        return object;
    };

    // --- The unit of code

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        var rt = this.rt;
        var self = this;
        env.scheduler.reset();
        rt.reset();
        var file, compiler, statements;
        try {
            file = Pascal.parse(code, '', { attachment: function (name) { return self.attachment(name); } });
            if (file.k === 'unit') {
                // A unit of code that is a Pascal unit: other units include it (uses Name).
                delete this.units[file.name.toLowerCase()];
                this.compileUnitText(file.name.toLowerCase(), file.name, code, '', null, false);
                return undefined;
            }
            compiler = new Pascal.Compiler(this, { source: '' });
            statements = compiler.compileProgram(file);
        } catch (error) {
            // An error of the translator itself is not an error of the program.
            if (error instanceof T.CompileError || error instanceof T.LanguageError || (error !== null && typeof error === 'object' && error.$pascal))
                throw error;
            if (T.debug)
                T.debug(error);
            throw new T.CompileError('internal translator error: ' + (error && error.message ? error.message : String(error)), 0, 0, '');
        }
        var made = env.compileChunk(statements, CHUNK_PARAMS, [rt, this.V, this.P, compiler.constants, T], '');
        this.commit(compiler, made, false);
        this.running = true;
        try {
            var result = made.main();
            if (compiler.mainAsync)
                return this.runAsync(result, compiler);
            return result;
        } catch (error) {
            if (error instanceof Pascal.Halt)
                return undefined;
            throw error;
        } finally {
            this.running = false;
            rt.flush();
            rt.present();
        }
    };

    // A unit with Delay: to the end or to a wait; then by timers.
    Session.prototype.runAsync = function (generator) {
        var self = this;
        var env = this.env;
        var rt = this.rt;
        var value;
        var state = env.scheduler.runMain(generator, function (callback, delay) {
            return env.schedule(function () {
                self.running = true;
                try {
                    callback();
                } finally {
                    self.running = false;
                    rt.flush();
                    rt.present();
                }
            }, delay);
        }, function (error, result) {
            if (error !== null && error !== undefined) {
                if (!(error instanceof Pascal.Halt)) {
                    rt.flush();
                    env.reportLate(error);
                }
                return;
            }
            value = result;
        });
        return state === 'done' ? value : undefined;
    };

    // The declarations of a unit join the shared program when the translation succeeds.
    Session.prototype.commit = function (compiler, made, isUnit) {
        var self = this;
        var V = this.V;
        var P = this.P;
        var scheduler = this.env.scheduler;
        if (!isUnit) {
            Object.keys(compiler.layer.names).forEach(function (name) {
                self.globalScope.define(name, compiler.layer.names[name]);
            });
            compiler.units.forEach(function (unit) {
                if (self.usedUnits.indexOf(unit) < 0)
                    self.usedUnits.push(unit);
            });
        }
        // The variables of a unit start from zeros at every run of it.
        compiler.newGlobals.forEach(function (item) {
            V[item.symbol.js] = item.symbol.type.zero();
        });
        compiler.procs.forEach(function (proc) {
            var fn = made.procs[proc.js];
            var callable;
            if (proc.async) {
                callable = function () {
                    return scheduler.runNested(fn.apply(null, arguments));
                };
                callable.gen = fn;
            } else {
                callable = fn;
                fn.gen = function* () {
                    return fn.apply(null, arguments);
                };
            }
            P[proc.js] = callable;
        });
        compiler.newRoutines.forEach(function (proc) {
            if (proc.native !== undefined && proc.native !== null) {
                var native = proc.native;
                if (native.gen === undefined) {
                    native.gen = function* () {
                        return native.apply(null, arguments);
                    };
                }
                P[proc.js] = native;
            }
        });
        // Routines whose signature changed - an error for the old calls.
        compiler.newRoutines.forEach(function (proc) {
            var replaced = proc.symbol && proc.symbol.replaces;
            if (replaced === undefined || replaced === null)
                return;
            replaced.procs.forEach(function (old) {
                if (old.js === proc.js || P[old.js] === undefined || compiler.newRoutines.some(function (routine) {
                    return routine.js === old.js;
                }))
                    return;
                var message = 'the routine "' + old.text + '" has changed: run the blocks that call it again';
                var stub = function () {
                    throw new T.LanguageError(message);
                };
                stub.gen = function* () {
                    return stub();
                };
                P[old.js] = stub;
            });
        });
        Object.keys(made.classes).forEach(function (key) {
            P[key] = made.classes[key];
        });
    };

    Session.prototype.describeError = function (error) {
        if (error !== null && typeof error === 'object' && error.$pascal === true) {
            var name = error.constructor.$name;
            var message = error.fmessage !== undefined ? utf8.decode(String(error.fmessage)) : '';
            if (this.units.sysutils === undefined || error.fmessage === undefined)
                return 'An unhandled exception occurred: ' + name + (message ? ': ' + message : '');
            return name + ': ' + message;
        }
        if (error instanceof T.LanguageError)
            return error.message;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return this.units.sysutils !== undefined ? 'EStackOverflow: Stack overflow' : 'Runtime error 202: Stack overflow';
        if (error instanceof TypeError && /null|undefined/.test(String(error.message)))
            return this.units.sysutils !== undefined ? 'EAccessViolation: Access violation' : 'Runtime error 216: Access violation';
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    Session.prototype.deadlock = function () {
        return new T.LanguageError('deadlock');
    };

    Pascal.language = {
        id: 'pascal',
        name: 'Pascal',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.pascal = Pascal.language;

    // Pascal units of the language library: name -> { title, source, natives(rt, session) }.
    Pascal.libraryUnits = Pascal.libraryUnits || Object.create(null);
    void J;
})(globalThis);
