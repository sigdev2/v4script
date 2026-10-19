// BASIC: the language session - the program shared by all units (module
// variables, procedures, records), translation and run of a unit, the
// place of an error.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.language)
        return;

    var CHUNK_PARAMS = ['$B', '$V', '$P', '$D'];

    function Session(env) {
        this.env = env;
        Basic.installHostModules(env.modules);
        this.rt = new Basic.Runtime(env);
        this.rt.session = this;
        this.module = new Basic.Scope('module', null);
        this.types = Object.create(null);
        this.procs = Object.create(null);
        this.shared = Object.create(null);
        this.globals = Object.create(null);
        this.deftypes = new Basic.DefTypes(null);
        this.optionBase = 0;
        // Values of the module variables and procedures: $V and $P in the code.
        this.V = {};
        this.P = {};
        this.functions = new Map();
        this.running = false;
    }

    Session.prototype.attachment = function (name) {
        return this.env.readModule(name);
    };

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        var rt = this.rt;
        var self = this;
        env.scheduler.reset();
        rt.reset();
        rt.files = null;
        var program = Basic.parse(code, '', { attachment: function (name) { return self.attachment(name); } });
        var compiler = new Basic.Compiler(this, program, '');
        var compiled = compiler.compile();
        var made = env.compileChunk(compiled.statements, CHUNK_PARAMS, [rt, this.V, this.P, compiled.constants], '');
        this.commit(compiler, made);
        this.running = true;
        try {
            if (!compiler.mainAsync) {
                made.main();
                return undefined;
            }
            env.scheduler.runMain(made.main(), function (callback, delay) {
                return env.schedule(function () {
                    self.running = true;
                    try {
                        callback();
                    } finally {
                        self.running = false;
                        rt.flush();
                        rt.present();
                        env.err.flush();
                    }
                }, delay);
            }, function (error) {
                if (error !== null && error !== undefined && !(error instanceof Basic.BasicEnd)) {
                    rt.flush();
                    env.reportLate(error);
                }
            });
            return undefined;
        } catch (error) {
            if (error instanceof Basic.BasicEnd)
                return undefined;
            throw error;
        } finally {
            this.running = false;
            rt.flush();
            rt.present();
        }
    };

    // The declarations of a unit join the shared program when the translation succeeds.
    Session.prototype.commit = function (compiler, made) {
        var self = this;
        var V = this.V;
        var rt = this.rt;
        Object.keys(compiler.newTypes).forEach(function (name) {
            self.types[name] = compiler.newTypes[name];
        });
        var layer = compiler.module;
        Object.keys(layer.vars).forEach(function (key) {
            var variable = layer.vars[key];
            var previous = self.module.vars[key];
            if (previous === undefined || previous.type !== variable.type || previous.length !== variable.length ||
                V[variable.js] === undefined)
                V[variable.js] = Basic.defaultValue(Basic.kindOf(variable.type), variable.length,
                                                    typeof variable.type === 'string' ? null : variable.type);
        });
        Object.keys(layer.arrays).forEach(function (key) {
            var array = layer.arrays[key];
            var previous = self.module.arrays[key];
            if (previous === undefined || previous.type !== array.type || previous.length !== array.length ||
                V[array.js] === undefined) {
                var kind = Basic.kindOf(array.type);
                var made = new Basic.BArray(kind, array.length, kind === 'r' ? array.type : null);
                if (array.implicit) {
                    var bounds = [];
                    for (var index = 0; index < Math.max(array.dims, 1); ++index)
                        bounds.push(compiler.optionBase, 10);
                    made.dim(bounds, false, false);
                }
                V[array.js] = made;
            }
        });
        layer.commitInto(this.module);
        Object.keys(compiler.newShared).forEach(function (key) {
            self.shared[key] = true;
        });
        Object.keys(compiler.newGlobals).forEach(function (key) {
            self.globals[key] = true;
        });
        var scheduler = this.env.scheduler;
        Object.keys(compiler.newProcs).forEach(function (key) {
            var proc = compiler.newProcs[key];
            var previous = self.procs[key];
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
            self.P[proc.js] = callable;
            self.procs[key] = proc;
            if (previous !== undefined && previous.signature !== proc.signature)
                self.invalidate(key, proc);
        });
        this.deftypes = compiler.finalDefTypes;
        this.optionBase = compiler.optionBase;
    };

    // The signature of a procedure changed: procedures of other units that
    // call it the old way fail until they run again.
    Session.prototype.invalidate = function (key, changed) {
        var self = this;
        Object.keys(this.procs).forEach(function (name) {
            var proc = self.procs[name];
            if (proc === changed || proc.calls === undefined || proc.calls[key] === undefined ||
                proc.calls[key] === changed.signature)
                return;
            var message = (proc.kind === 'function' ? 'FUNCTION ' : 'SUB ') + proc.display + ' calls ' +
                changed.display + ', which has changed: run its block again';
            var stub = function () {
                throw new Basic.BasicError(51, message);
            };
            stub.gen = function* () {
                return stub();
            };
            self.P[proc.js] = stub;
        });
    };

    Session.prototype.describeError = function (error) {
        if (error instanceof T.LanguageError)
            return error.message;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return 'Out of stack space';
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    Session.prototype.deadlock = function () {
        return new Basic.BasicError(51, 'deadlock');
    };

    Basic.language = {
        id: 'basic',
        name: 'BASIC',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.basic = Basic.language;
})(globalThis);
