// Scheme: the language session - a unit is read, expanded and translated
// as a whole, then run by the main thread of the machine; libraries
// (define-library, import, .sld host files), eval, load, the value of a
// unit, the place of an error.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.language)
        return;

    var Pair = S.Pair, NIL = S.NIL, Sym = S.Sym, UNSPEC = S.UNSPEC, IR = S.IR;

    // The names of the standard libraries (importing any of them gives all built-ins).
    var STANDARD = ['base', 'case-lambda', 'char', 'complex', 'cxr', 'eval', 'file', 'inexact', 'lazy', 'load',
                    'process-context', 'read', 'repl', 'time', 'write', 'r5rs', 'small'];
    var SRFIS = [1, 2, 6, 8, 9, 11, 13, 16, 18, 23, 27, 28, 30, 39, 62, 69, 87, 95, 132];

    function Library(name, key) {
        this.name = name;
        this.key = key;
        this.top = new S.TopEnv('library ' + key);
        this.exports = new Map();
        this.fns = [];
        this.instantiated = false;
        this.text = null;
        this.loading = false;
        this.$scheme = true;
    }
    Library.prototype.describe = function () {
        return '#<library ' + this.key + '>';
    };

    function Session(env) {
        this.env = env;
        S.session = this;
        this.machine = new S.Machine(this);
        S.machine = this.machine;
        this.running = false;
        this.libraryDefs = Object.create(null);
        this.libraryCells = Object.create(null);
        this.libraries = new Map();
        // Forms that the expander builds itself (define-record-type) refer
        // to built-in procedures through the environment of special forms.
        Object.keys(S.prims).forEach(function (name) {
            S.SYNTAX_ENV.table.set(name, { kind: 'prim', p: S.prims[name] });
        });
        this.readLibrarySource();
        this.standardTable = this.makeEnv('standard').table;
        this.libraryEnv = this.makeEnv('library');
        this.top = this.makeEnv('user');
        var jsCell = new S.Cell('js');
        jsCell.v = env.global;
        this.top.table.set('js', S.globalBinding(jsCell, false));
        S.installHostModules(this);
        S.setupPorts(this);
        // JavaScript objects print as the console shows them.
        S.formatJs = function (value) {
            if (value === null)
                return 'null';
            try {
                var text = env.host.format(value);
                return typeof text === 'string' ? text : String(text);
            } catch (error) {
                return '#<js-object>';
            }
        };
    }

    // The top environment with the built-ins: syntax, procedures, library.
    Session.prototype.makeEnv = function (name) {
        var top = new S.TopEnv(name);
        S.installSyntax(top);
        Object.keys(S.prims).forEach(function (primName) {
            top.table.set(primName, { kind: 'prim', p: S.prims[primName] });
        });
        Object.keys(this.libraryDefs).forEach(function (libName) {
            top.table.set(libName, { kind: 'lazy', name: libName });
        });
        return top;
    };

    Session.prototype.readLibrarySource = function () {
        var self = this;
        S.readAll(S.LIBRARY_SOURCE, '').forEach(function (entry) {
            var form = entry.datum;
            var target = form.cdr.car;
            var name, value;
            if (target instanceof Pair) {
                name = target.car.name;
                value = new Pair(S.LAMBDA_ID, new Pair(target.cdr, form.cdr.cdr));
                S.lines.set(value, entry.line);
            } else {
                name = target.name;
                value = form.cdr.cdr.car;
            }
            self.libraryDefs[name] = { value: value, line: entry.line };
        });
    };

    // A library procedure written in Scheme: translated when first mentioned.
    Session.prototype.libraryCell = function (name) {
        var known = this.libraryCells[name];
        if (known !== undefined)
            return known;
        var definition = this.libraryDefs[name];
        var cell = new S.Cell(name);
        cell.library = true;
        this.libraryCells[name] = cell;
        this.libraryEnv.table.set(name, S.globalBinding(cell, true));
        var ctx = { top: this.libraryEnv, source: '', line: definition.line, session: this, unit: { expansions: 0 } };
        var value = S.expand(definition.value, this.libraryEnv, ctx);
        if (value.t === 'lambda' && value.name === '')
            value.name = name;
        var fns = this.compileEntries([{ ir: IR.gset(cell, value, true, definition.line), line: definition.line,
                                         source: '', define: true }], '', true);
        this.machine.callProcedure(fns[0], []);
        return cell;
    };

    // binding.name - the name of the library definition (the name in the
    // environment may differ after import with rename or prefix).
    S.resolveLazy = function (top, name, binding) {
        var cell = S.session.libraryCell(binding !== undefined ? binding.name : name);
        var binding = S.globalBinding(cell, true);
        top.table.set(name, binding);
        return binding;
    };

    // --- Translation

    Session.prototype.compileEntries = function (entries, source, library) {
        var compiler = new S.Compiler(this, { source: source, library: library });
        var statements = compiler.unit(entries);
        return this.env.compileChunk(statements, ['$S', '$D'], [this.machine, compiler.constants], source,
                                     { library: library });
    };

    Session.prototype.debug = function (code, name) {
        if (S.debugCode)
            S.debugCode(code, name);
    };

    // Top-level definitions in a unit hide the built-in names in advance:
    // the forms of the unit before the definition see the new variable too.
    Session.prototype.prescan = function (forms, top) {
        forms.forEach(function (entry) {
            var form = entry.datum;
            if (!(form instanceof Pair) || !(form.car instanceof Sym) || !(form.cdr instanceof Pair))
                return;
            var head = top.table.get(form.car.name);
            if (head === undefined || head.kind !== 'special')
                return;
            var names = [];
            if (head.name === 'define') {
                var target = form.cdr.car;
                while (target instanceof Pair)
                    target = target.car;
                if (target instanceof Sym)
                    names.push(target.name);
            } else if (head.name === 'define-values') {
                for (var formals = form.cdr.car; formals instanceof Pair; formals = formals.cdr) {
                    if (formals.car instanceof Sym)
                        names.push(formals.car.name);
                }
            }
            names.forEach(function (name) {
                var binding = top.table.get(name);
                if (binding !== undefined && !(binding.kind === 'global' && !binding.imported))
                    S.defineGlobal(top, name);
            });
        });
    };

    // Forms -> entries for compileEntries.
    Session.prototype.expandForms = function (forms, top, source) {
        var self = this;
        var unit = { expansions: 0 };
        var entries = [];
        forms.forEach(function (form) {
            var ctx = { top: top, source: source, line: form.line, session: self, unit: unit };
            S.expandTop(form.datum, top, ctx, entries);
        });
        return entries;
    };

    // --- Running a unit

    Session.prototype.runBlock = function (code) {
        var self = this;
        var env = this.env;
        S.lines.clear();
        var forms = S.readAll(code, '');
        this.prescan(forms, this.top);
        var entries = this.expandForms(forms, this.top, '');
        var fns = this.compileEntries(entries, '', false);
        var count = fns.length;
        var state = { index: 0, value: undefined, halt: null };
        // The continuation of a top-level form is the next form after the
        // current one (as in a REPL): the continuation of an earlier form
        // called later does not repeat the forms between them.
        var formK = function (value) {
            state.value = entries[state.index].define ? undefined : value;
            state.index += 1;
            if (state.index >= count)
                return state.halt(state.value);
            return fns[state.index](formK);
        };
        var main = function (halt) {
            state.halt = halt;
            if (count === 0)
                return halt(undefined);
            return fns[0](formK);
        };
        var finished = false, result;
        this.running = true;
        try {
            var status = this.machine.runMain(main, function (callback, delay) {
                return env.schedule(function () {
                    self.running = true;
                    try {
                        callback();
                    } finally {
                        self.running = false;
                        self.flushConsole();
                    }
                }, delay);
            }, function (error, value) {
                if (error !== null && error !== undefined) {
                    if (!(error instanceof S.ExitSignal)) {
                        self.flushConsole();
                        env.reportLate(self.located(error));
                    }
                    return;
                }
                finished = true;
                result = value;
            });
            return status === 'done' && finished ? this.show(result) : undefined;
        } catch (error) {
            if (error instanceof S.ExitSignal)
                return undefined;
            throw this.located(error);
        } finally {
            this.running = false;
            this.flushConsole();
        }
    };

    // The value of a unit for the console: as write; a JavaScript object as it is.
    Session.prototype.show = function (value) {
        if (value === undefined || value === UNSPEC)
            return undefined;
        if (value instanceof S.Values && value.list.length === 0)
            return undefined;
        if (value !== null && typeof value === 'object' && S.prims['js-object?'].fn(value))
            return value;
        return S.write(value, 'write');
    };

    Session.prototype.writeOut = function (text) {
        this.env.out.write(text);
    };
    Session.prototype.writeErr = function (text) {
        this.env.out.flush();
        this.env.err.write(text);
    };
    Session.prototype.flushConsole = function () {
        this.env.out.flush();
        this.env.err.flush();
    };
    Session.prototype.attachmentText = function (name) {
        return this.env.readModule(name);
    };

    // A Scheme procedure that JavaScript called.
    Session.prototype.callFromJs = function (proc, args) {
        var wasRunning = this.running;
        this.running = true;
        try {
            return this.machine.callProcedure(proc, args);
        } catch (error) {
            if (!wasRunning && !(error instanceof S.ExitSignal) && !(error instanceof T.CompileError))
                throw new Error(this.describeError(error));
            throw error;
        } finally {
            this.running = wasRunning;
            if (!wasRunning)
                this.flushConsole();
        }
    };

    // --- Errors

    S.describeCondition = function (condition) {
        if (!(condition instanceof S.ErrorObject))
            return S.write(condition, 'write');
        var text = condition.message;
        var irritants = S.listToArray(condition.irritants) || [];
        if (irritants.length > 0)
            text += (/:\s*$/.test(text) ? ' ' : ': ') + irritants.map(function (irritant) {
                return S.write(irritant, 'write');
            }).join(' ');
        return text;
    };

    Session.prototype.describeError = function (error) {
        if (error instanceof S.SchemeRaise) {
            if (error.value instanceof S.ErrorObject)
                return S.describeCondition(error.value);
            return 'uncaught exception: ' + S.write(error.value, 'write');
        }
        if (error instanceof S.ErrorObject)
            return S.describeCondition(error);
        if (error instanceof T.LanguageError)
            return error.message;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return 'stack overflow';
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    // An error with a place: by the stack of the translated code, otherwise
    // the last call of a library procedure from user code.
    Session.prototype.located = function (error) {
        if (error instanceof T.CompileError)
            return error;
        var place = this.env.locate(error);
        if (place === null && error instanceof S.SchemeRaise && error.value instanceof S.ErrorObject)
            place = this.env.locate(error.value);
        if (place === null && this.machine.at !== null)
            place = this.machine.at;
        return new T.CompileError(this.describeError(error), place !== null ? place.line : 0, 0,
                                  place !== null ? place.source : '');
    };

    Session.prototype.deadlock = function () {
        return S.error('deadlock: all threads are blocked', []);
    };

    // A translation error at run time (eval, load) is a Scheme condition.
    function compileCondition(error) {
        if (!(error instanceof T.CompileError))
            return error;
        var condition = S.error(error.message, []);
        condition.kind = 'syntax';
        if (error.line > 0)
            condition.place = { line: error.line, source: error.source };
        return condition;
    }

    // The functions of the forms in order: the value of the last one goes to $k.
    function runSequence(fns, $k) {
        function step(index, value) {
            if (index >= fns.length)
                return $k(value);
            return fns[index](function (result) { return step(index + 1, result); });
        }
        return step(0, UNSPEC);
    }

    // --- eval, load, environment

    function topOf(environment) {
        if (environment === undefined)
            return S.session.top;
        if (!(environment instanceof S.EnvironmentObject))
            S.check.fail('eval', 'an environment', environment);
        return environment.top;
    }

    S.defCps('eval', 1, 2, function ($k, expr, environment) {
        var session = S.session;
        var top = topOf(environment);
        var fns;
        try {
            var entries = session.expandForms([{ datum: expr, line: 0 }], top, '');
            fns = session.compileEntries(entries, '', true);
        } catch (error) {
            throw compileCondition(error);
        }
        return runSequence(fns, $k);
    });

    S.defCps('load', 1, 2, function ($k, name, environment) {
        var session = S.session;
        S.check.string('load', name);
        var text = session.attachmentText(name.s);
        if (text === null) {
            var missing = S.error('load: attachment not found', [name]);
            missing.kind = 'file';
            throw missing;
        }
        var top = topOf(environment);
        var fns;
        try {
            var forms = S.readAll(text, name.s);
            session.prescan(forms, top);
            fns = session.compileEntries(session.expandForms(forms, top, name.s), name.s, false);
        } catch (error) {
            throw compileCondition(error);
        }
        return runSequence(fns, function () { return $k(UNSPEC); });
    });

    S.def('interaction-environment', 0, 0, function () { return new S.EnvironmentObject(S.session.top); });
    function standardEnvironment() {
        var top = new S.TopEnv('standard');
        S.session.standardTable.forEach(function (binding, name) { top.table.set(name, binding); });
        return new S.EnvironmentObject(top);
    }
    S.def('scheme-report-environment', 0, 1, standardEnvironment);
    S.def('null-environment', 0, 1, standardEnvironment);
    S.def('environment', 0, -1, function () {
        var session = S.session;
        var top = new S.TopEnv('environment');
        var ctx = { top: top, source: '', line: 0, session: session, unit: { expansions: 0 } };
        var instantiate = [];
        try {
            Array.prototype.forEach.call(arguments, function (spec) {
                session.importSet(spec, ctx, function (name, binding) { top.table.set(name, binding); }, instantiate);
            });
        } catch (error) {
            throw compileCondition(error);
        }
        instantiate.forEach(function (lib) { session.instantiateNow(lib); });
        return new S.EnvironmentObject(top);
    });

    // --- Libraries

    function libraryKey(name) {
        var parts = S.listToArray(name);
        if (parts === null || parts.length === 0)
            return null;
        var texts = [];
        for (var index = 0; index < parts.length; ++index) {
            var part = S.strip(parts[index]);
            if (part instanceof Sym)
                texts.push(part.name);
            else if (typeof part === 'number' && Number.isInteger(part) && part >= 0)
                texts.push(String(part));
            else
                return null;
        }
        return texts;
    }

    function isStandard(parts) {
        if (parts[0] === 'scheme')
            return parts.length === 2 && STANDARD.indexOf(parts[1]) >= 0;
        if (parts[0] === 'srfi')
            return parts.length >= 2 && SRFIS.indexOf(Number(parts[1])) >= 0;
        return false;
    }

    S.libraryExists = function (name, ctx) {
        var parts = libraryKey(name);
        if (parts === null)
            return false;
        if (isStandard(parts) || S.session.libraries.has(parts.join(' ')))
            return true;
        return S.session.attachmentForLibrary(parts) !== null;
    };

    Session.prototype.attachmentForLibrary = function (parts) {
        var base = parts.join('.');
        var names = [base + '.sld', base + '.scm'];
        for (var index = 0; index < names.length; ++index) {
            var text = this.attachmentText(names[index]);
            if (text !== null)
                return { name: names[index], text: text };
        }
        return null;
    };

    // A library by name: a standard one ('standard'), one defined in a unit
    // or in a host file (translated again if the file changed).
    Session.prototype.findLibrary = function (name, ctx, form) {
        var parts = libraryKey(name);
        if (parts === null)
            S.syntaxError('import: bad library name', form, ctx);
        if (isStandard(parts))
            return 'standard';
        var key = parts.join(' ');
        var known = this.libraries.get(key);
        var file = this.attachmentForLibrary(parts);
        if (known !== undefined && (file === null || known.text === file.text || known.text === null))
            return known;
        if (file === null)
            S.syntaxError('import: unknown library (' + key + ')', form, ctx);
        if (known !== undefined && known.loading)
            S.syntaxError('import: circular library import (' + key + ')', form, ctx);
        var forms = S.readAll(file.text, file.name);
        var definition = null;
        forms.forEach(function (entry) {
            var datum = entry.datum;
            if (datum instanceof Pair && datum.car instanceof Sym && datum.car.name === 'define-library') {
                var declared = libraryKey(datum.cdr.car);
                if (declared !== null && declared.join(' ') === key)
                    definition = entry;
            }
        });
        var inner = { top: ctx.top, source: file.name, line: 1, session: this, unit: ctx.unit };
        var library;
        if (definition !== null) {
            inner.line = definition.line;
            library = this.defineLibraryForm(definition.datum, inner);
        } else {
            library = this.moduleLibrary(parts, forms, file.name, ctx.unit);
        }
        library.text = file.text;
        return library;
    };

    // A host file without define-library: everything it defines is exported.
    Session.prototype.moduleLibrary = function (parts, forms, source, unit) {
        var key = parts.join(' ');
        var library = new Library(parts, key);
        this.standardTable.forEach(function (binding, name) { library.top.table.set(name, binding); });
        library.loading = true;
        this.libraries.set(key, library);
        try {
            this.prescan(forms, library.top);
            var entries = this.expandForms(forms, library.top, source);
            library.fns = this.compileEntries(entries, source, false);
        } finally {
            library.loading = false;
        }
        var standard = this.standardTable;
        library.top.table.forEach(function (binding, name) {
            if (standard.get(name) === binding)
                return;
            if (binding.kind === 'global' && !binding.imported)
                library.exports.set(name, S.globalBinding(binding.cell, true));
            else if (binding.kind === 'macro')
                library.exports.set(name, binding);
        });
        return library;
    };

    // (define-library (name ...) declarations...)
    Session.prototype.defineLibraryForm = function (form, ctx) {
        var self = this;
        var items = S.listOf(form, ctx, 'define-library');
        var parts = libraryKey(items[1]);
        if (parts === null)
            S.syntaxError('define-library: bad library name', form, ctx);
        var key = parts.join(' ');
        var library = new Library(parts, key);
        library.loading = true;
        this.libraries.set(key, library);
        var exportSpecs = [];
        var bodyForms = [];
        var instantiate = [];
        function declaration(decl, declCtx) {
            var declItems = S.listOf(decl, declCtx, 'define-library');
            var head = declItems.length > 0 ? S.strip(declItems[0]) : null;
            var name = head instanceof Sym ? head.name : '';
            switch (name) {
            case 'export':
                exportSpecs = exportSpecs.concat(declItems.slice(1));
                return;
            case 'import':
                declItems.slice(1).forEach(function (spec) {
                    self.importSet(spec, declCtx, function (importName, binding) {
                        library.top.table.set(importName, binding);
                    }, instantiate);
                });
                return;
            case 'begin':
                declItems.slice(1).forEach(function (bodyForm) {
                    bodyForms.push({ datum: bodyForm, line: S.lineOf(bodyForm, declCtx), source: declCtx.source });
                });
                return;
            case 'include':
            case 'include-ci':
            case 'include-library-declarations':
                S.includeForms(decl, declCtx, name === 'include-ci').forEach(function (entry) {
                    if (name === 'include-library-declarations') {
                        var inner = Object.create(declCtx);
                        inner.source = entry.source;
                        inner.line = entry.line;
                        declaration(entry.datum, inner);
                    } else {
                        bodyForms.push(entry);
                    }
                });
                return;
            case 'cond-expand':
                S.condExpandForms(decl, library.top, declCtx).forEach(function (inner) { declaration(inner, declCtx); });
                return;
            }
            S.syntaxError('define-library: unknown declaration', decl, declCtx);
        }
        try {
            items.slice(2).forEach(function (decl) { declaration(decl, ctx); });
            var entries = [];
            instantiate.forEach(function (lib) {
                entries.push({ ir: IR.pcall(S.prims['%instantiate'], [IR.constant(lib)], ctx.line), line: ctx.line,
                               source: ctx.source, define: true });
            });
            var unit = { expansions: 0 };
            bodyForms.forEach(function (entry) {
                var bodyCtx = { top: library.top, source: entry.source || ctx.source, line: entry.line, session: self, unit: unit };
                S.expandTop(entry.datum, library.top, bodyCtx, entries);
            });
            library.fns = this.compileEntries(entries, ctx.source, false);
        } finally {
            library.loading = false;
        }
        exportSpecs.forEach(function (spec) {
            var internal, external;
            if (S.isIdentifier(spec)) {
                internal = external = S.nameOf(spec);
            } else {
                var specItems = S.listToArray(spec);
                if (specItems === null || specItems.length !== 3 || S.nameOf(specItems[0]) !== 'rename')
                    S.syntaxError('define-library: bad export', form, ctx);
                internal = S.nameOf(specItems[1]);
                external = S.nameOf(specItems[2]);
            }
            var binding = library.top.table.get(internal);
            if (binding === undefined)
                S.syntaxError('define-library: exported name is not defined: ' + internal, form, ctx);
            if (binding.kind === 'lazy')
                binding = S.resolveLazy(library.top, internal, binding);
            if (binding.kind === 'global')
                binding = S.globalBinding(binding.cell, true);
            library.exports.set(external, binding);
        });
        return library;
    };

    // An import set: bind(name, binding) for every name; the libraries that
    // must run go to instantiate.
    Session.prototype.importSet = function (spec, ctx, bind, instantiate) {
        var map = this.resolveImportSet(S.strip(spec), ctx, instantiate);
        map.forEach(function (binding, name) { bind(name, binding); });
    };

    Session.prototype.resolveImportSet = function (spec, ctx, instantiate) {
        var self = this;
        var items = S.listToArray(spec);
        if (items === null || items.length === 0)
            S.syntaxError('import: bad import set', spec, ctx);
        var head = items[0] instanceof Sym ? items[0].name : '';
        var inner;
        switch (head) {
        case 'only':
            inner = this.resolveImportSet(items[1], ctx, instantiate);
            var only = new Map();
            items.slice(2).forEach(function (id) {
                if (!inner.has(id.name))
                    S.syntaxError('import: only: name not exported: ' + id.name, spec, ctx);
                only.set(id.name, inner.get(id.name));
            });
            return only;
        case 'except':
            inner = this.resolveImportSet(items[1], ctx, instantiate);
            items.slice(2).forEach(function (id) { inner.delete(id.name); });
            return inner;
        case 'prefix':
            inner = this.resolveImportSet(items[1], ctx, instantiate);
            var prefixed = new Map();
            inner.forEach(function (binding, name) { prefixed.set(items[2].name + name, binding); });
            return prefixed;
        case 'rename':
            inner = this.resolveImportSet(items[1], ctx, instantiate);
            items.slice(2).forEach(function (pair) {
                var names = S.listToArray(pair);
                if (names === null || names.length !== 2 || !inner.has(names[0].name))
                    S.syntaxError('import: bad rename', spec, ctx);
                inner.set(names[1].name, inner.get(names[0].name));
                inner.delete(names[0].name);
            });
            return inner;
        }
        var library = this.findLibrary(spec, ctx, spec);
        if (library === 'standard') {
            var all = new Map();
            this.standardTable.forEach(function (binding, name) { all.set(name, binding); });
            return all;
        }
        if (instantiate.indexOf(library) < 0)
            instantiate.push(library);
        return new Map(library.exports);
    };

    // (import set...) at the top level of a unit.
    S.importInto = function (top, form, ctx, out) {
        var session = S.session;
        var instantiate = [];
        S.listOf(form, ctx, 'import').slice(1).forEach(function (spec) {
            session.importSet(spec, ctx, function (name, binding) {
                if (top === session.top && session.standardTable.get(name) === binding && top.table.get(name) === undefined)
                    return;
                top.table.set(name, binding);
            }, instantiate);
        });
        instantiate.forEach(function (library) {
            out.push({ ir: IR.pcall(S.prims['%instantiate'], [IR.constant(library)], ctx.line), line: ctx.line,
                       source: ctx.source, define: true });
        });
    };

    S.defineLibrary = function (form, top, ctx) {
        S.session.defineLibraryForm(form, ctx);
    };

    // The body of a library runs once - before the first import.
    S.defCps('%instantiate', 1, 1, function ($k, library) {
        if (library.instantiated)
            return $k(UNSPEC);
        library.instantiated = true;
        return runSequence(library.fns, function () { return $k(UNSPEC); });
    });
    Session.prototype.instantiateNow = function (library) {
        if (library.instantiated)
            return;
        library.instantiated = true;
        var fns = library.fns;
        this.machine.callProcedure(function ($k) { return runSequence(fns, $k); }, []);
    };

    S.language = {
        id: 'scheme',
        name: 'Scheme',
        createSession: function (env) {
            return new Session(env);
        },
        debug: function (code, name) {
            if (S.debugCode)
                S.debugCode(code, name);
        }
    };
    T.languages.scheme = S.language;
})(globalThis);
