// C++: the language session - the library (preprocessed once per process,
// parsed once per session), the shared namespaces of the units, the memory
// and the function table of C, lazy bodies, vtables and RTTI, the run of a
// unit. A unit is compiled in a transaction: an error rolls back what it
// declared. See docs/internals/cpp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    if (X.language)
        return;

    var rt = C.runtime;
    var types = X.types;
    var utf8 = T.utf8, i64 = T.i64, u64 = T.u64;
    var unqual = X.unqual;

    var CHUNK_PARAMS = ['$c', '$T', '$D', '$M', '$F', '$G', '$V'];

    var PREDEFINED = [
        '#define __cplusplus 201703L', '#define __STDC_HOSTED__ 1', '#define __GNUC__ 13', '#define __GNUC_MINOR__ 3',
        '#define __x86_64__ 1', '#define __linux__ 1', '#define __LP64__ 1', '#define __CHAR_BIT__ 8',
        '#define __SIZEOF_SHORT__ 2', '#define __SIZEOF_INT__ 4', '#define __SIZEOF_LONG__ 8',
        '#define __SIZEOF_LONG_LONG__ 8', '#define __SIZEOF_POINTER__ 8', '#define __SIZEOF_FLOAT__ 4',
        '#define __SIZEOF_DOUBLE__ 8', '#define __V4SCRIPT__ 1', '#define _Noreturn [[noreturn]]', '#define _Bool bool'
    ].join('\n') + '\n';

    // The C headers are included before the C++ ones; the C++ headers fix
    // what differs (NULL, the macros of math.h).
    var C_HEADERS = ['stddef.h', 'stdbool.h', 'stdarg.h', 'stdint.h', 'inttypes.h', 'limits.h', 'float.h', 'errno.h',
                     'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'ctype.h', 'time.h', 'unistd.h', 'js.h'];

    var NATIVE_GLOBALS = { errno: 'errnoAddress', stdin: 'stdinPointer', stdout: 'stdoutPointer',
                           stderr: 'stderrPointer' };

    // Built-in header names a unit may include (they are included already).
    function isStandardHeader(name) {
        return C.headers[name] !== undefined || X.headers[name] !== undefined || X.headerAliases[name] !== undefined;
    }

    // A C header as C++ sees it: wchar_t and static_assert are keywords; a
    // function pointer does not become void* by itself; assert names the
    // function with its signature, as glibc does in C++.
    function cHeader(name) {
        var text = C.headers[name];
        if (text === undefined)
            return undefined;
        text = text.replace('typedef int wchar_t;\n', '').replace('#define static_assert _Static_assert\n', '')
            .replace('__LINE__, __func__))', '__LINE__, __PRETTY_FUNCTION__))');
        if (name === 'js.h')
            text += 'template <class F> inline js_value js_function(F* function) {\n' +
                '    return js_function(reinterpret_cast<void*>(function));\n}\n';
        return text;
    }

    // A text inside the namespaces of a path ('std::+literals').
    function inNamespace(path, text) {
        if (path === '')
            return text;
        var segments = path.split('::');
        return segments.map(function (segment) {
            return segment.charAt(0) === '+' ? 'inline namespace ' + segment.substring(1) + ' {'
                                             : 'namespace ' + segment + ' {';
        }).join(' ') + '\n' + text + '\n' + segments.map(function () { return '}'; }).join(' ');
    }

    // What a session parses at its start: the C headers, the declarations
    // of the library without names (directives, using-directives) and the
    // namespaces of the others.
    function eagerText() {
        var parts = [PREDEFINED + C_HEADERS.map(function (name) { return '#include <' + name + '>'; }).join('\n')];
        X.headerOrder.forEach(function (name) {
            var header = X.headers[name];
            var lines = X.headerLines(header);
            var paths = Object.create(null);
            header.table.forEach(function (entry) {
                if (entry[3] === '')
                    parts.push(inNamespace(entry[0], lines.slice(entry[1] - 1, entry[2]).join('\n')));
                else if (paths[entry[0]] === undefined && entry[0] !== '')
                    paths[entry[0]] = parts.push(inNamespace(entry[0], ''));
            });
        });
        return parts.join('\n') + '\n';
    }

    // The preprocessed start of the library: the same for every session.
    var libraryCache = null;

    function libraryTokens() {
        if (libraryCache !== null)
            return libraryCache;
        var macros = Object.create(null);
        var included = Object.create(null);
        var text = eagerText();
        var tokens = X.tokenize(text, '<built-in>', {
            cpp: true,
            macros: macros,
            include: function (name) {
                var header = cHeader(name);
                if (header === undefined)
                    return null;
                var first = !included[name];
                included[name] = true;
                return { text: first ? header : '', file: name, library: true };
            }
        });
        libraryCache = { tokens: tokens, macros: macros };
        return libraryCache;
    }

    function Unit() {
        this.body = [];
        this.functions = [];
        this.topContext = null;
        this.valueStatement = null;
        this.main = null;
    }

    function Session(env) {
        this.env = env;
        this.memory = new rt.Memory();
        this.memory.runNested = function (generator) {
            return env.scheduler.runNested(generator);
        };
        this.globalNamespace = new X.Namespace(null, null);
        this.globalNamespace.members.__builtin_va_list = { kind: 'typedef', name: '__builtin_va_list',
                                                           type: types.valist };
        this.macros = Object.create(null);
        this.literals = new Map();
        this.argvAddress = 0;
        this.asyncPossible = false;
        this.errnoAddress = this.memory.allocateStatic(4, 4);
        this.hostHeaders = env.modules.map(function (module) {
            var header = C.hostHeader(module);
            return { file: module.names.snake + '.h', text: header.text, names: header.names, global: module.global };
        });
        this.natives = C.libc(this);
        var natives = this.natives;
        var extra = X.natives(this);
        Object.keys(extra).forEach(function (name) { natives[name] = extra[name]; });
        this.stdinPointer = this.pointerTo(this.stdinAddress);
        this.stdoutPointer = this.pointerTo(this.stdoutAddress);
        this.stderrPointer = this.pointerTo(this.stderrAddress);
        this.vtables = [];
        // Library declarations being parsed (loadChunks) and the initializers
        // of their objects that no unit has run yet.
        this.loadingLibrary = 0;
        this.loadingOrders = [];
        this.libraryInit = [];
        this.rttiRecords = new Map();
        this.typeInfos = new Map();
        this.functionsByIndex = [];
        this.memberTemplateNames = Object.create(null);
        this.instantiationDepth = 0;
        this.globalAddresses = Object.create(null);
        this.pending = [];
        this.thunks = [];
        this.unit = null;
        this.c = X.runtime(this);
        this.prelude();
    }

    Session.prototype.pointerTo = function (address) {
        var slot = this.memory.allocateStatic(8, 8);
        this.memory.storePointer(slot, address);
        return slot;
    };

    // --- The library

    Session.prototype.prelude = function () {
        var library = libraryTokens();
        var self = this;
        Object.keys(library.macros).forEach(function (name) { self.macros[name] = library.macros[name]; });
        this.unit = new Unit();
        this.unit.topContext = this.newTopContext();
        X.transaction = null;
        var parser = new X.Parser(this, X.convertTokens(library.tokens),
                                  { scope: this.globalNamespace, library: true });
        parser.translationUnit();
        // The headers of global host modules.
        this.hostHeaders.forEach(function (header) {
            if (header.global)
                self.parseLibraryText(header.text, header.file);
        });
        this.drainPending();
        this.libraryMacros = library.macros;
        this.registerLibrary();
        this.runPrelude();
    };

    // The declarations of the headers wait in their namespaces under the
    // names they declare (X.ensure); the first lookup of a name parses them.
    Session.prototype.registerLibrary = function () {
        var self = this;
        var load = function (scope, name, chunks) { self.loadLazy(scope, name, chunks); };
        var order = 0;
        X.headerOrder.forEach(function (name) {
            var header = X.headers[name];
            header.table.forEach(function (entry) {
                if (entry[3] === '')
                    return;
                var scope = self.namespaceOf(entry[0]);
                if (scope.lazy === undefined) {
                    scope.lazy = Object.create(null);
                    scope.loadLazy = load;
                }
                var chunk = { header: header, first: entry[1], last: entry[2], scope: scope, done: false,
                              order: ++order };
                entry[3].split(' ').forEach(function (key) {
                    var list = scope.lazy[key];
                    if (list === undefined)
                        scope.lazy[key] = [chunk];
                    else
                        list.push(chunk);
                });
            });
        });
    };

    Session.prototype.namespaceOf = function (path) {
        var scope = this.globalNamespace;
        if (path === '')
            return scope;
        path.split('::').forEach(function (segment) {
            scope = scope.members[segment.charAt(0) === '+' ? segment.substring(1) : segment];
        });
        return scope;
    };

    // The declarations of a name: a declaration of the library sees only
    // the ones before it (as if the headers were parsed in order), the
    // others wait for a later lookup.
    Session.prototype.loadLazy = function (scope, name, chunks) {
        var stack = this.loadingOrders;
        var limit = stack.length > 0 ? stack[stack.length - 1] : Infinity;
        var now = [], later = [];
        chunks.forEach(function (chunk) {
            if (!chunk.done)
                (chunk.order < limit ? now : later).push(chunk);
        });
        if (later.length === 0)
            delete scope.lazy[name];
        else
            scope.lazy[name] = later;
        this.loadChunks(now);
    };

    // Library declarations, parsed outside the transaction of the unit:
    // they stay when it fails. The initializers of their objects run at the
    // start of the next unit that compiles (libraryInit).
    Session.prototype.loadChunks = function (chunks) {
        var savedTransaction = X.transaction;
        X.transaction = null;
        ++this.loadingLibrary;
        try {
            for (var index = 0; index < chunks.length; ++index) {
                var chunk = chunks[index];
                if (chunk.done)
                    continue;
                chunk.done = true;
                var text = X.headerLines(chunk.header).slice(chunk.first - 1, chunk.last).join('\n');
                var tokens = X.tokenize(text, chunk.header.name, { cpp: true, macros: this.libraryMacros,
                                                                   line: chunk.first, include: noInclude });
                var parser = new X.Parser(this, tokens, { scope: chunk.scope, library: true });
                this.loadingOrders.push(chunk.order);
                try {
                    parser.declarationsToEnd();
                } catch (error) {
                    // A fault of the library: not an error of the program that a
                    // failed overload or SFINAE could hide.
                    if (error instanceof T.CompileError)
                        throw new Error('C++ library: ' + error.message + ' (' + chunk.header.name + ':' + error.line +
                                        ')');
                    throw error;
                } finally {
                    this.loadingOrders.pop();
                }
            }
        } finally {
            --this.loadingLibrary;
            X.transaction = savedTransaction;
        }
    };

    function noInclude() {
        return null;
    }

    // All of the library at once (run-samples.mjs cpp --library): every
    // declaration and the bodies of the functions that are not templates.
    Session.prototype.compileWholeLibrary = function () {
        var self = this;
        var count = 0;
        X.transaction = null;
        this.unit = new Unit();
        this.unit.topContext = this.newTopContext();
        (function load(scope) {
            if (scope.lazy !== undefined)
                Object.keys(scope.lazy).forEach(function (name) { X.ensure(scope, name); });
            Object.keys(scope.members).forEach(function (name) {
                var entity = scope.members[name];
                if (entity.kind === 'namespace' && entity.parent === scope)
                    load(entity);
            });
        })(this.globalNamespace);
        (function compile(scope) {
            Object.keys(scope.members).forEach(function (name) {
                var entity = scope.members[name];
                var items = entity.kind === 'functions' ? entity.items : [entity];
                items.forEach(function (item) {
                    if (item.kind === 'func' && item.lazy && !item.compiled && item.owner === scope) {
                        self.compileBody(item);
                        ++count;
                    } else if (item.isClass && item.parent === scope && item.complete && item.template === null) {
                        compile(item);
                    } else if (item.kind === 'namespace' && item.parent === scope) {
                        compile(item);
                    }
                });
            });
        })(this.globalNamespace);
        this.drainPending();
        this.unit = null;
        return count;
    };

    Session.prototype.parseLibraryText = function (text, file) {
        var tokens = X.tokenize(text, file, { cpp: true, macros: this.macros, include: function () {
            return { text: '', file: 'js.h', library: true };
        } });
        var parser = new X.Parser(this, X.convertTokens(tokens), { scope: this.globalNamespace, library: true });
        parser.translationUnit();
    };

    // The initializers of the library objects (std::cout...) run once.
    Session.prototype.runPrelude = function () {
        var generator = new X.Generator(this);
        var body = generator.unit(this.unit);
        var memory = this.memory;
        var run = this.env.compileChunk(body, CHUNK_PARAMS, [this.c, T, generator.constants, memory, memory.functions,
                                                             memory.generators, this.vtables], '', { library: true });
        run();
        this.unit = null;
    };

    Session.prototype.isLibraryFile = function (file) {
        if (file === undefined || file === null || file === '')
            return false;
        if (file === '<built-in>' || isStandardHeader(file))
            return true;
        for (var index = 0; index < this.hostHeaders.length; ++index) {
            if (this.hostHeaders[index].file === file)
                return true;
        }
        return false;
    };

    // The source of a line for the line map: the unit, a module or the library.
    Session.prototype.sourceOf = function (file) {
        if (file === undefined || file === null || file === '')
            return undefined;
        if (this.isLibraryFile(file))
            return T.LIBRARY_SOURCE;
        return file;
    };

    Session.prototype.stdNamespace = function () {
        return this.globalNamespace.members.std || null;
    };

    Session.prototype.stdTemplate = function (name) {
        var space = this.stdNamespace();
        var found = space !== null ? X.member(space, name) : undefined;
        return found !== undefined && found.kind === 'template' ? found : null;
    };

    Session.prototype.stdClass = function (name) {
        var space = this.stdNamespace();
        var found = space !== null ? X.member(space, name) : undefined;
        return found !== undefined && found.isClass ? found : null;
    };

    Session.prototype.preprocessOptions = function () {
        var self = this;
        var env = this.env;
        return {
            cpp: true,
            macros: this.macros,
            onceFiles: {},
            include: function (name, system) {
                if (name === 'assert.h' || name === 'cassert')
                    return { text: cHeader('assert.h'), file: 'assert.h', library: true };
                for (var index = 0; index < self.hostHeaders.length; ++index) {
                    var header = self.hostHeaders[index];
                    if (header.file === name)
                        return { text: header.global ? '' : header.text, file: name, library: true };
                }
                var standard = isStandardHeader(name);
                if (standard && system)
                    return { text: '', file: name, library: true };
                var text = env.readModule(name.replace(/^\.\//, ''));
                if (text !== null)
                    return { text: text, file: name, library: false };
                if (standard)
                    return { text: '', file: name, library: true };
                return null;
            },
            warn: function (directive, message) {
                env.warn.write('warning: ' + message + '\n');
            }
        };
    };

    // --- Units

    Session.prototype.newTopContext = function () {
        var context = new X.FunctionContext(this, null, null);
        context.isTop = true;
        return context;
    };

    Session.prototype.unitBody = function () {
        return this.loadingLibrary > 0 ? this.libraryInit : this.unit.body;
    };

    Session.prototype.topContext = function () {
        return this.unit.topContext;
    };

    // --- Bodies of functions

    // The body of a used function is parsed after the current declaration
    // (a queue: no deep recursion of instantiations).
    Session.prototype.requireBody = function (func) {
        if (func.lambdaInvoker !== undefined) {
            this.requireInvoker(func.lambdaInvoker);
            return;
        }
        if (func.native || func.compiled || func.queued || func.deleted)
            return;
        if (func.inheritedFrom !== undefined) {
            this.requireInherited(func);
            return;
        }
        if (func.lambdaInvoker !== undefined) {
            this.requireInvoker(func.lambdaInvoker);
            return;
        }
        if (func.lazy === null || func.lazy === undefined) {
            this.attachNative(func);
            return;
        }
        func.queued = true;
        if (X.transaction !== null)
            X.transaction.onRollback(function () { func.queued = false; });
        this.pending.push(func);
        if (this.unit === null)
            this.drainPending();
    };

    Session.prototype.drainPending = function () {
        while (this.pending.length > 0) {
            var func = this.pending.shift();
            this.compileBody(func);
        }
    };

    Session.prototype.compileBody = function (func) {
        if (func.compiled || func.compiling || func.lazy === null || func.lazy === undefined)
            return;
        func.compiling = true;
        var lazy = func.lazy;
        // The tokens of the body only: the parser may split '>>' in its copy.
        var tokens = lazy.tokens.slice(lazy.start, lazy.end);
        tokens.push(lazy.tokens[lazy.tokens.length - 1]);
        var parser = new X.Parser(this, tokens, { scope: lazy.scope, library: lazy.library || func.library });
        parser.ownsTokens = true;
        try {
            func.body = parser.functionBody(func);
            func.context = parser.func;
            func.compiled = true;
            this.unit.functions.push(func);
        } finally {
            func.compiling = false;
        }
        if (X.transaction !== null)
            X.transaction.onRollback(function () {
                func.compiled = false;
                func.body = null;
                func.context = null;
            });
    };

    Session.prototype.requireImplicit = function (func, parser) {
        if (func.compiled || func.trivial || func.deleted)
            return;
        func.compiled = true;
        if (X.transaction !== null)
            X.transaction.onRollback(function () {
                func.compiled = false;
                func.context = null;
            });
        var builder = new X.Parser(this, X.convertTokens([]), { scope: func.owner, library: true });
        builder.implicitBody(func);
        func.context = builder.func;
        this.unit.functions.push(func);
        if (func.isCtor && func.owner.polymorphic)
            this.requireVirtuals(func.owner, builder);
    };

    Session.prototype.requireInherited = function (func) {
        if (func.compiled)
            return;
        func.compiled = true;
        if (X.transaction !== null)
            X.transaction.onRollback(function () { func.compiled = false; });
        var builder = new X.Parser(this, X.convertTokens([]), { scope: func.owner, library: true });
        var context = new X.FunctionContext(this, func, null);
        context.thisClass = func.owner;
        builder.func = context;
        builder.useFunction(func.inheritedFrom, null);
        var inits = builder.completeInitializers(func.owner, [], func);
        func.fieldInits = inits.fields;
        func.context = null;
        this.unit.functions.push(func);
        if (func.owner.polymorphic)
            this.requireVirtuals(func.owner, builder);
    };

    Session.prototype.requireInvoker = function (invoker) {
        if (invoker.generated)
            return;
        invoker.generated = true;
        if (X.transaction !== null)
            X.transaction.onRollback(function () { invoker.generated = false; });
        this.unit.functions.push(invoker);
        this.requireBody(invoker.lambdaTarget);
    };

    // The functions in the vtables of a class: needed once it is constructed.
    Session.prototype.requireVirtuals = function (cls, parser) {
        if (cls.virtualsRequired)
            return;
        cls.virtualsRequired = true;
        parser.declareImplicitMembers(cls);
        if (X.transaction !== null)
            X.transaction.onRollback(function () { cls.virtualsRequired = false; });
        X.vtableLayout(cls).forEach(function (entry) {
            entry.cls.slots.forEach(function (root) {
                var func = cls.overriders.get(root) || root;
                if (!func.isPure || func.defined)
                    parser.useFunction(func, null);
            });
        });
    };

    // --- Functions in the table

    // Closure types print alike (<lambda(int)>): their ids tell them apart.
    function closureIds(type, seen) {
        if (type === null || type === undefined || typeof type !== 'object' || seen.indexOf(type) >= 0)
            return '';
        seen.push(type);
        var plain = X.unqual(type);
        if (plain.lambda)
            return '#' + plain.id;
        if (plain.to !== undefined)
            return closureIds(plain.to, seen);
        if (plain.of !== undefined)
            return closureIds(plain.of, seen);
        var text = '';
        if (plain.kind === 'function') {
            text += closureIds(plain.returns, seen);
            plain.params.forEach(function (param) { text += closureIds(param, seen); });
        }
        if (plain.templateArgs)
            plain.templateArgs.forEach(function (arg) {
                (arg.kind === 'pack' ? arg.items : [arg]).forEach(function (item) {
                    text += closureIds(item.type, seen);
                });
            });
        if (plain.isClass && plain.parent && plain.parent.isClass)
            text += closureIds(plain.parent, seen);
        return text;
    }

    Session.prototype.uniqueName = function (func) {
        var owner = func.owner;
        var prefix = '';
        if (owner !== null && owner !== undefined && owner !== this.globalNamespace) {
            prefix = X.qualifiedName(owner) + closureIds(owner, []) + '::';
            if (owner.kind === 'namespace' && owner.name === null)
                prefix = '{anonymous}' + owner.id + '::';
        }
        var tags = closureIds(func.type, []);
        (func.templateArgs || []).forEach(function (arg) {
            (arg.kind === 'pack' ? arg.items : [arg]).forEach(function (item) { tags += closureIds(item.type, []); });
        });
        prefix += tags;
        var params = func.type.params.map(function (param) { return X.typeString(param); }).join(', ');
        return prefix + func.name + (func.instanceText ||
                                     '') + '(' + params + (func.type.variadic ? ', ...' : '') + ')' +
            (func.type.cv & X.CONST ? ' const' : '') + (func.type.ref ? ' ' + func.type.ref : '') +
            (func.isCtor || func.isDtor || func.name.indexOf('operator ') === 0 ? '' : ' -> ' +
             X.typeString(func.type.returns));
    };

    Session.prototype.functionIndex = function (func) {
        if (func.index === undefined) {
            func.index = this.memory.registerFunction(func.native ? func.name : this.uniqueName(func));
            this.functionsByIndex[func.index] = func;
        }
        return func.index;
    };

    // A declaration of a library function that C implements.
    Session.prototype.attachNative = function (func) {
        if (func.native || func.owner !== this.globalNamespace)
            return;
        var native = this.natives[func.name];
        if (native === undefined || func.isMember)
            return;
        var index = this.memory.registerFunction(func.name);
        this.memory.define(index, native);
        func.index = index;
        func.native = true;
        func.async = !!C.libcAsync[func.name];
        func.defined = true;
        func.compiled = true;
        this.functionsByIndex[index] = func;
    };

    // The C type of a function at an address (js_function wrappers).
    Session.prototype.functionType = function (address) {
        var index = this.memory.functionIndex(address);
        var func = this.functionsByIndex[index];
        if (func === undefined)
            return null;
        return {
            kind: 'function', returns: X.cTypeOf(unqual(X.removeRef(func.type.returns))),
            params: func.type.params.map(function (param) { return X.cTypeOf(unqual(X.removeRef(param))); }),
            variadic: func.type.variadic, unspecified: false, size: 1, align: 1
        };
    };

    // A thunk: the function called with this moved by delta.
    Session.prototype.thunkIndex = function (func, delta) {
        var name = 'thunk ' + delta + ' ' + this.uniqueName(func);
        var index = this.memory.registerFunction(name);
        if (!this.thunkDefined || !this.thunkDefined[index]) {
            this.thunkDefined = this.thunkDefined || Object.create(null);
            this.thunkDefined[index] = true;
            this.thunks.push({ index: index, func: func, delta: delta });
        }
        this.functionIndex(func);
        return index;
    };

    Session.prototype.takeThunks = function () {
        var list = this.thunks;
        this.thunks = [];
        return list;
    };

    // The number of the vtable of a class for its subobject at offset.
    Session.prototype.vtableIndex = function (cls, offset, generator) {
        if (cls.vtableIndices === undefined)
            cls.vtableIndices = Object.create(null);
        var known = cls.vtableIndices[offset];
        if (known !== undefined)
            return known;
        var self = this;
        var entry = X.vtableLayout(cls).filter(function (item) { return item.offset === offset; })[0];
        var table = entry.cls.slots.map(function (root) {
            var func = cls.overriders.get(root) || root;
            if (func.isPure && !func.defined)
                return self.pureVirtualIndex();
            var ownerOffset = X.baseOffset(cls, func.owner);
            var delta = offset - ownerOffset;
            if (delta === 0)
                return self.functionIndex(func);
            return self.thunkIndex(func, delta);
        });
        table.top = -offset;
        table.rtti = this.rtti(cls);
        var index = this.vtables.length;
        this.vtables.push(table);
        cls.vtableIndices[offset] = index;
        return index;
    };

    Session.prototype.pureVirtualIndex = function () {
        var index = this.memory.registerFunction('__cxa_pure_virtual');
        this.memory.define(index, function () {
            throw new rt.CError('pure virtual method called\nterminate called without an active exception', 134);
        });
        return index;
    };

    // --- RTTI

    Session.prototype.rtti = function (type) {
        type = unqual(type);
        var key = X.typeId(type);
        var found = this.rttiRecords.get(key);
        if (found !== undefined)
            return found;
        var record = { id: key, name: X.typeString(type), mangled: X.mangle(type), cls: null, bases: [], pointee: null,
                       nullptr: type.kind === 'nullptr', type: type };
        this.rttiRecords.set(key, record);
        var self = this;
        if (type.isClass) {
            record.cls = type;
            record.bases = type.bases.map(function (base) {
                return { rtti: self.rtti(base.type), offset: base.offset, isPublic: base.access === 'public' };
            });
        } else if (type.kind === 'pointer') {
            record.pointee = this.rtti(type.to);
        }
        return record;
    };

    // A std::type_info object of a type in static memory.
    Session.prototype.typeInfoAddress = function (record) {
        var found = this.typeInfos.get(record.id);
        if (found !== undefined)
            return found;
        var address = this.memory.allocateStatic(16, 8);
        this.memory.storePointer(address, this.literal(record.mangled, false));
        this.memory.store64(address + 8, record.id);
        this.typeInfos.set(record.id, address);
        return address;
    };

    // --- Objects

    Session.prototype.newGlobal = function (name, type, storage, scope) {
        return { kind: 'var', name: name, type: type, storage: storage, parent: scope, jsName: T.jsName(name),
                 addressTaken: true, isConst: false, extern: false };
    };

    // The address of a namespace variable: the same as an earlier one of
    // the same name and size (earlier units see the new variable).
    Session.prototype.allocateObject = function (object) {
        if (object.address !== undefined)
            return;
        var size = Math.max(X.isRef(object.type) ? 8 : unqual(object.type).size, 1);
        var align = X.isRef(object.type) ? 8 : unqual(object.type).align;
        if (object.storage === 'global') {
            var field = NATIVE_GLOBALS[object.name];
            if (field !== undefined && object.parent === this.globalNamespace) {
                object.address = this[field];
                return;
            }
            var key = (object.parent && object.parent !== this.globalNamespace ? X.qualifiedName(object.parent) +
                       '::' : '') +
                object.name;
            var previous = this.globalAddresses[key];
            if (previous !== undefined && previous.size === size) {
                object.address = previous.address;
                return;
            }
            object.address = this.memory.allocateStatic(size, align);
            this.globalAddresses[key] = { address: object.address, size: size };
            return;
        }
        object.address = this.memory.allocateStatic(size, align);
    };

    Session.prototype.staticGuard = function (object) {
        if (object.guard === undefined)
            object.guard = [false];
        return object.guard;
    };

    // An inline static member with an initializer: initialized by the unit
    // that declares it.
    Session.prototype.staticMemberInit = function (object) {
        if (this.unit !== null)
            this.unit.body.push(object.pendingInit);
    };

    Session.prototype.literal = function (bytes, wide) {
        var list = typeof bytes === 'string' ? bytes.split('').map(function (ch) { return ch.charCodeAt(0); }) : bytes;
        var key = (wide ? 'w' : 'n') + list.join(',');
        var address = this.literals.get(key);
        if (address !== undefined)
            return address;
        var memory = this.memory;
        if (wide) {
            address = memory.allocateStatic((list.length + 1) * 4, 4);
            list.forEach(function (code, index) { memory.I32[(address >> 2) + index] = code; });
        } else {
            address = memory.allocateStatic(list.length + 1, 1);
            memory.writeBytes(address, list, true);
        }
        this.literals.set(key, address);
        return address;
    };

    Session.prototype.argv = function () {
        if (this.argvAddress === 0) {
            var name = this.literal(utf8.encode('main'), false);
            this.argvAddress = this.memory.allocateStatic(16, 8);
            this.memory.storePointer(this.argvAddress, name);
        }
        return this.argvAddress;
    };

    // A parser over tokens (or none) in a scope, for default arguments and
    // member initializers.
    Session.prototype.withParser = function (tokens, scope, parent, callback) {
        var parser = new X.Parser(this, tokens !== null && tokens !== undefined ? tokens : X.convertTokens([]),
                                  { scope: scope, library: parent !== null &&
                                    parent !== undefined ? parent.library : false });
        if (parent !== null && parent !== undefined) {
            parser.func = parent.func;
            parser.packIndex = parent.packIndex;
            parser.isUnevaluated = parent.isUnevaluated;
        }
        return callback(parser);
    };

    // --- Compiling a unit

    function isShownExpression(expr) {
        var type = unqual(expr.type);
        if (type.kind === 'void' || expr.k === 'assign' || expr.k === 'compound' || expr.k === 'incdec')
            return false;
        if (expr.k === 'call' && expr.func.native && X.isIntegral(type))
            return false;
        if (expr.k === 'call' && expr.func.isMember && unqual(expr.type).isClass && X.isRef(expr.func.type.returns))
            return false;
        return true;
    }

    Session.prototype.compile = function (code) {
        var transaction = new X.Transaction();
        var savedMacros = Object.assign(Object.create(null), this.macros);
        X.transaction = transaction;
        this.unit = new Unit();
        this.unit.topContext = this.newTopContext();
        this.pending = [];
        this.thunks = [];
        var unit = this.unit;
        var generator, body;
        try {
            var tokens = X.tokenize(code, '', this.preprocessOptions());
            var parser = new X.Parser(this, tokens, { scope: this.globalNamespace });
            parser.translationUnit();
            // Static members of classes that the bodies compiled now use are
            // initialized before the statements of the unit.
            var statements = unit.body;
            unit.body = [];
            this.drainPending();
            unit.body = this.libraryInit.concat(unit.body, statements);
            unit.main = this.findMain(transaction);
            this.computeAsync(unit);
            var last = unit.body.length > 0 ? unit.body[unit.body.length - 1] : null;
            unit.valueStatement = unit.main === null && last !== null && last.k === 'expr' && last.expr !== undefined &&
                isShownExpression(last.expr) ? last : null;
            generator = new X.Generator(this);
            body = generator.unit(unit);
        } catch (error) {
            transaction.rollback();
            var macros = this.macros;
            Object.keys(macros).forEach(function (name) { delete macros[name]; });
            Object.keys(savedMacros).forEach(function (name) { macros[name] = savedMacros[name]; });
            this.pending = [];
            throw error;
        } finally {
            X.transaction = null;
        }
        transaction.declared.forEach(function (entity) { entity.fromSession = true; });
        this.libraryInit = [];
        return { body: body, constants: generator.constants, async: !!unit.topContext.async };
    };

    // Functions that wait (sleep) or call such functions are generators;
    // indirect and virtual calls wait when a waiting function may be their
    // target.
    Session.prototype.computeAsync = function (unit) {
        var contexts = unit.functions.map(function (func) { return func.context; }).filter(function (context) {
            return context !== null && context !== undefined;
        });
        contexts.push(unit.topContext);
        unit.functions.forEach(function (func) { func.async = false; });
        var possible = this.asyncPossible;
        for (;;) {
            var changed = false;
            contexts.forEach(function (context) {
                if (context.async)
                    return;
                if ((context.dynamicCalls && possible) || context.calls.some(function (func) { return func.async; })) {
                    context.async = true;
                    if (context.func !== null)
                        context.func.async = true;
                    changed = true;
                }
            });
            var nowPossible = possible || unit.functions.some(function (func) {
                return func.async && (func.addressTaken || func.isVirtual || func.lambdaInvoker !== undefined);
            });
            if (nowPossible !== possible) {
                possible = nowPossible;
                changed = true;
            }
            if (!changed)
                break;
        }
        if (unit.main !== null && unit.main.async)
            unit.topContext.async = true;
        this.asyncPossible = possible;
    };

    Session.prototype.findMain = function (transaction) {
        var set = this.globalNamespace.members.main;
        if (set === undefined || set.kind !== 'functions')
            return null;
        var found = null;
        set.items.forEach(function (item) {
            if (item.kind === 'func' && item.defined && transaction.declared.indexOf(item) >= 0)
                found = item;
        });
        if (found !== null && !X.isIntegral(unqual(found.type.returns)))
            throw new T.CompileError("'::main' must return 'int'",
                                     found.lazy ? found.lazy.tokens[found.lazy.start].line : 0, 0, '');
        if (found !== null)
            this.functionIndex(found);
        return found;
    };

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        env.scheduler.reset();
        this.memory.sp = this.memory.stackTop;
        this.resetLibrary();
        var compiled = this.compile(code);
        var memory = this.memory;
        var run = env.compileChunk(compiled.body, CHUNK_PARAMS,
                                   [this.c, T, compiled.constants, memory, memory.functions,
                                                                 memory.generators, this.vtables], '');
        this.unit = null;
        try {
            var result = run();
            if (compiled.async)
                return this.runAsync(result);
            this.runExitHandlers();
            return result;
        } catch (error) {
            if (error instanceof rt.CExit && error.exitCode === 0)
                return undefined;
            throw error;
        } finally {
            this.flushOutput();
        }
    };

    Session.prototype.runAsync = function (generator) {
        var self = this;
        var env = this.env;
        var value;
        var state = env.scheduler.runMain(generator, function (callback, delay) {
            return env.schedule(function () {
                try {
                    callback();
                } finally {
                    self.flushOutput();
                    env.out.flush();
                    env.err.flush();
                }
            }, delay);
        }, function (error, result) {
            if (error === null || error === undefined) {
                try {
                    self.runExitHandlers();
                } catch (exitError) {
                    error = exitError;
                }
            }
            if (error !== null && error !== undefined) {
                if (!(error instanceof rt.CExit && error.exitCode === 0)) {
                    self.flushOutput();
                    env.reportLate(error);
                }
                return;
            }
            value = result;
        });
        return state === 'done' ? value : undefined;
    };

    // --- Errors

    Session.prototype.describeError = function (error) {
        if (error instanceof X.CppException)
            return error.message + this.exceptionWhat(error);
        if (error instanceof T.LanguageError)
            return error.message;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return 'Segmentation fault (stack overflow)';
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    // "\n  what():  text" for an exception derived from std::exception.
    Session.prototype.exceptionWhat = function (record) {
        var base = this.stdClass('exception');
        if (base === null || record.rtti.cls === null)
            return '';
        var offset = X.rttiBaseOffset(record.rtti, this.rtti(base));
        if (offset < 0)
            return '';
        try {
            var what = X.lookupMember(base, 'what').entity.items[0];
            var slot = base.slots.indexOf(what.root || what);
            var address = record.address + offset;
            var vtable = this.vtables[this.memory.loadPointer(address)];
            var text = this.memory.functions[vtable[slot]](address);
            return '\n  what():  ' + utf8.decode(this.memory.cstring(text));
        } catch (error) {
            return '';
        }
    };

    Session.prototype.deadlock = function () {
        return new rt.CError('deadlock', 1);
    };

    // --- The value of a unit in JavaScript

    Session.prototype.loadValue = function (type, address) {
        var memory = this.memory;
        type = unqual(type);
        if (type.kind === 'array' || X.isRecord(type))
            return address;
        var kind = X.kindOf(type);
        memory.check(address, Math.max(1, type.size));
        switch (kind) {
        case 'ptr':
            return memory.loadPointer(address);
        case 'i64':
        case 'u64':
            return memory.load64(address, kind === 'i64');
        case 'i8':
            return memory.I8[address];
        case 'u8':
            return memory.U8[address];
        case 'i16':
            return memory.I16[address >> 1];
        case 'u16':
            return memory.U16[address >> 1];
        case 'i32':
            return memory.I32[address >> 2];
        case 'u32':
            return memory.U32[address >> 2];
        case 'f32':
            return memory.F32[address >> 2];
        case 'f64':
            return memory.F64[address >> 3];
        }
        return undefined;
    };

    Session.prototype.show = function (type, value, depth) {
        type = unqual(type);
        if (type.kind === 'void')
            return undefined;
        if (type === types.bool)
            return value !== 0;
        if (type.kind === 'pointer') {
            var to = unqual(type.to);
            if (to.isClass && to.tag === 'js_object')
                return this.fromHandle(value);
            if (to.kind === 'int' && to.size === 1 && to !== types.bool)
                return value === 0 ? null : utf8.decode(this.memory.cstring(value));
            return value === 0 ? null : '0x' + (value >>> 0).toString(16);
        }
        if (type.kind === 'nullptr')
            return null;
        if (type.kind === 'array') {
            var element = unqual(type.of);
            if (element.kind === 'int' && element.size === 1) {
                var text = '';
                for (var at = 0; at < type.length; ++at) {
                    var byte = this.memory.U8[value + at];
                    if (byte === 0)
                        break;
                    text += String.fromCharCode(byte);
                }
                return utf8.decode(text);
            }
            var items = [];
            for (var index = 0; index < Math.min(type.length, 1000); ++index)
                items.push(depth > 8 ? null : this.show(element, this.loadValue(element, value + index * element.size),
                                                         depth + 1));
            return items;
        }
        if (type.isClass)
            return this.showObject(type, value, depth);
        var kind = X.kindOf(type);
        if (kind === 'i64')
            return typeof value === 'number' ? value : i64.str(value);
        if (kind === 'u64')
            return typeof value === 'number' ? value : u64.str(value);
        return value;
    };

    // std::string as a string, std::vector as an array, other classes as
    // objects of their fields.
    Session.prototype.showObject = function (cls, address, depth) {
        var self = this;
        var name = X.qualifiedName(cls);
        if (name === 'std::string') {
            var data = this.memory.loadPointer(address);
            var length = this.memory.load64(address + 8, false);
            return utf8.decode(this.memory.bytes(data, data + (typeof length === 'number' ? length : 0)));
        }
        if (cls.template !== null && X.qualifiedName(cls.template) === 'std::vector') {
            var element = unqual(cls.templateArgs[0].type);
            var begin = this.memory.loadPointer(address), end = this.memory.loadPointer(address + 8);
            var items = [];
            for (var at = begin; at < end && items.length < 1000; at += Math.max(element.size, 1))
                items.push(depth > 8 ? null : this.show(element, this.loadValue(element, at), depth + 1));
            return items;
        }
        var object = {};
        (function fill(current, base) {
            current.bases.forEach(function (item) { fill(item.type, base + item.offset); });
            current.dataMembers.forEach(function (field) {
                if (field.name === null || field.name.indexOf('__') === 0)
                    return;
                if (X.isRef(field.type)) {
                    object[field.name] = null;
                    return;
                }
                var type = unqual(field.type);
                if (field.bits !== null && field.bits !== undefined) {
                    var unit = self.loadValue(type, base + field.offset) >>> 0;
                    var raw = Math.floor(unit / Math.pow(2, field.bitOffset)) % Math.pow(2, field.bits);
                    if (type.signed && raw >= Math.pow(2, field.bits - 1))
                        raw -= Math.pow(2, field.bits);
                    object[field.name] = raw;
                    return;
                }
                object[field.name] = depth > 8 ? null
                                               : self.show(type, self.loadValue(type, base + field.offset), depth + 1);
            });
        })(cls, address);
        return object;
    };

    X.language = {
        id: 'cpp',
        name: 'C++',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.cpp = X.language;
})(globalThis);
