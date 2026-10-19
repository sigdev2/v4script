// Pascal: the compiler of a unit - name scopes, types from declarations,
// constants, variables, routines and assembling the chunk. Expressions
// are in expressions.js, calls in calls.js, statements in statements.js,
// classes in classes.js. Design: docs/internals/pascal.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.Compiler)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var big = T.big;
    var CompileError = T.CompileError;

    // --- Name scopes

    function Scope(kind, parent, owner) {
        this.kind = kind;
        this.parent = parent;
        this.owner = owner || null;
        this.names = Object.create(null);
    }
    Pascal.Scope = Scope;

    Scope.prototype.here = function (name) {
        var symbol = this.names[name];
        return symbol === undefined ? null : symbol;
    };

    Scope.prototype.find = function (name) {
        for (var scope = this; scope !== null; scope = scope.parent) {
            var symbol = scope.here(name);
            if (symbol !== null)
                return symbol;
        }
        return null;
    };

    Scope.prototype.define = function (name, symbol) {
        this.names[name] = symbol;
        return symbol;
    };

    // The scope of the units from uses: the last one included goes first.
    function UnitsScope(parent, units) {
        Scope.call(this, 'units', parent);
        this.units = units;
    }
    UnitsScope.prototype = Object.create(Scope.prototype);
    UnitsScope.prototype.here = function (name) {
        for (var index = this.units.length - 1; index >= 0; --index) {
            var unit = this.units[index];
            var symbol = unit.scope.names[name];
            if (symbol !== undefined)
                return symbol;
            if (unit.name === name)
                return { kind: 'unit', name: name, unit: unit };
            // The implicit unit of a global host module stands for the
            // whole unit of the module: App.Counter.
            if (unit.qualifier === name)
                return { kind: 'unit', name: name, unit: unit.fullUnit };
        }
        return null;
    };
    Pascal.UnitsScope = UnitsScope;

    // --- The value of an expression

    // type - the type; node - a JavaScript expression (null for a constant
    // while the code does not need it); constant - the value of a constant;
    // range - [lo, hi] for integers; ref - the place if the expression is a
    // variable.
    function Value(type, node, extra) {
        this.type = type;
        this.ownNode = node;
        // A function that makes the node when it is first needed (see node).
        this.lazyNode = null;
        this.constant = undefined;
        this.range = null;
        this.ref = null;
        if (extra) {
            for (var key in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, key))
                    this[key] = extra[key];
            }
        }
    }
    Pascal.Value = Value;

    // The node, made on first use for lazy values. One accessor on the
    // prototype: redefining a field of every object as an accessor makes V4
    // crash under some memory layouts.
    Object.defineProperty(Value.prototype, 'node', {
        get: function () {
            if (this.lazyNode !== null) {
                this.ownNode = this.lazyNode();
                this.lazyNode = null;
            }
            return this.ownNode;
        },
        set: function (node) {
            this.ownNode = node;
            this.lazyNode = null;
        },
        configurable: true
    });

    Value.prototype.isConstant = function () {
        return this.constant !== undefined;
    };

    // --- The compiler

    // options: { source - the file name ('' - the unit of code), unit - the
    // Pascal unit being compiled (or null), library - the library of the
    // language }
    function Compiler(session, options) {
        this.session = session;
        this.options = options || {};
        this.source = this.options.source || '';
        this.unit = this.options.unit || null;
        this.prefix = this.unit !== null ? this.unit.js + '$' : '';
        this.constants = [];
        this.constantIndex = new Map();
        // The global declarations of a unit - a layer over the shared scope of the session.
        this.units = session.unitsForCompile(this.unit);
        var unitsScope = new UnitsScope(session.systemScope, this.units);
        this.globalScope = this.unit !== null ? this.unit.scope : session.globalScope;
        this.outerScope = new Scope('outer', unitsScope);
        // The layer of a new unit: its names are visible to the unit at
        // once, to the session after a successful translation (commit).
        this.layer = new Scope('layer', null);
        this.scope = new Scope('global', null);
        this.scope.here = this.layerLookup.bind(this);
        this.scope.parent = unitsScope;
        this.fn = null;
        this.procs = [];
        this.classes = [];
        this.newGlobals = [];
        this.newRoutines = [];
        this.newTypes = [];
        this.mainBody = [];
        this.mainAsync = false;
        this.asyncCalls = [];
        this.allFunctions = [];
        this.forwards = [];
        this.valueStatement = null;
        this.labelCounter = 0;
        this.uniqueCounter = 0;
    }
    Pascal.Compiler = Compiler;

    // The layer of the unit, then the global scope (of the session or of a Pascal unit).
    Compiler.prototype.layerLookup = function (name) {
        var symbol = this.layer.names[name];
        if (symbol !== undefined)
            return symbol;
        symbol = this.globalScope.names[name];
        if (symbol !== undefined)
            return symbol;
        if (this.unit !== null && this.unit.privateScope !== undefined) {
            symbol = this.unit.privateScope.names[name];
            if (symbol !== undefined)
                return symbol;
        }
        return null;
    };

    // --- Errors

    Compiler.prototype.error = function (message, node) {
        throw new CompileError(message, node && node.line ? node.line : 0, node && node.column ? node.column : 0,
                               node && node.source !== undefined ? node.source : this.source);
    };

    Compiler.prototype.notFound = function (node, text) {
        this.error('Identifier not found "' + (text || node.text || node.name) + '"', node);
    };

    Compiler.prototype.incompatible = function (from, to, node) {
        this.error('Incompatible types: got "' + types.display(from) + '" expected "' + types.display(to) + '"', node);
    };

    // --- Chunk constants

    // A value the translator built (a type, a big constant) is $D[n] in
    // the code.
    Compiler.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.idx(J.id('$D'), J.num(index));
    };

    Compiler.prototype.typeRef = function (type) {
        return this.constant(type);
    };

    Compiler.prototype.helper = function (name) {
        return J.mem(J.id('$T'), name);
    };

    Compiler.prototype.unique = function (base) {
        return base + '$' + (++this.uniqueCounter);
    };

    // A temporary of the current function.
    Compiler.prototype.temp = function () {
        return this.fn.temps.temp();
    };

    // The context for T.ops (core): temporaries, helpers, division by zero.
    Compiler.prototype.opsContext = function () {
        var self = this;
        return {
            temp: function () { return self.temp(); },
            helper: function (name) { return self.helper(name); },
            divideByZero: J.call(J.mem(J.id('$R'), 'dz'), [])
        };
    };

    Compiler.prototype.rt = function (name, args) {
        return J.call(J.mem(J.id('$R'), name), args || []);
    };

    // --- Switches ({$R+}, {$mode}) by node

    Compiler.prototype.switches = function (node) {
        return (node && node.sw) || Pascal.DEFAULT_SWITCHES;
    };
    Compiler.prototype.isObjfpc = function (node) {
        var mode = this.switches(node).mode;
        return mode === 'objfpc' || mode === 'delphi';
    };

    // --- Name lookup

    Compiler.prototype.lookup = function (name) {
        return this.scope.find(name);
    };

    // A name declared in this unit (in a Pascal unit also in its interface).
    Compiler.prototype.ownGlobal = function (name) {
        var symbol = this.layer.names[name];
        if (symbol === undefined && this.unit !== null)
            symbol = this.unit.scope.names[name];
        return symbol === undefined ? null : symbol;
    };

    Compiler.prototype.define = function (name, symbol, node) {
        var scope = this.scope;
        var existing = scope.kind === 'global' ? this.ownGlobal(name) : scope.names[name];
        if (existing !== undefined && existing !== null && !(existing.kind === 'routine' && symbol.kind === 'routine'))
            this.error('Duplicate identifier "' + (symbol.text || name) + '"', node);
        if (scope.kind === 'global')
            this.layer.names[name] = symbol;
        else
            scope.define(name, symbol);
        return symbol;
    };

    // --- Functions (routines, the main code)

    function FunctionContext(compiler, kind, proc, parent) {
        this.compiler = compiler;
        this.kind = kind;          // 'main', 'routine', 'method', 'init'
        this.proc = proc;
        this.parent = parent;
        this.temps = new T.FunctionScope('$t');
        this.locals = [];
        this.async = false;
        this.calls = [];
        this.labels = Object.create(null);
        this.hasGoto = false;
        this.loops = [];
        this.handlers = [];
        this.resultVar = null;
        this.selfNode = null;
        this.nested = [];
        this.jsNames = Object.create(null);
    }
    Pascal.FunctionContext = FunctionContext;

    // A JavaScript name for a local name that the function does not use yet.
    FunctionContext.prototype.jsName = function (name) {
        var base = T.jsName(name);
        var candidate = base;
        var counter = 1;
        var taken = function (fn, text) {
            for (; fn !== null && fn !== undefined; fn = fn.parent) {
                if (fn.jsNames[text] !== undefined)
                    return true;
            }
            return false;
        };
        while (taken(this, candidate))
            candidate = base + '$' + (++counter);
        this.jsNames[candidate] = true;
        return candidate;
    };

    // A local variable: the nodes that read and write it are remembered to
    // turn them into box.v if it is passed as var or its address is taken.
    Compiler.prototype.localVar = function (name, text, type, extra) {
        var symbol = {
            kind: 'var', storage: 'local', name: name, text: text, type: type, js: this.fn.jsName(name),
            boxed: false, uses: [], fn: this.fn, isParam: false, initNode: null
        };
        if (extra) {
            for (var key in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, key))
                    symbol[key] = extra[key];
            }
        }
        this.fn.locals.push(symbol);
        return symbol;
    };

    // The node of an access to a local variable.
    Compiler.prototype.localNode = function (symbol) {
        var node = J.id(symbol.js);
        symbol.uses.push(node);
        return node;
    };

    // Rewrites the accesses to variables in boxes: x -> x.v.
    Compiler.prototype.finishLocals = function (fn) {
        fn.locals.forEach(function (symbol) {
            if (!symbol.boxed)
                return;
            if (symbol.declaration !== undefined && symbol.declaration !== null)
                symbol.declaration.init = J.obj([['v', symbol.declaration.init]]);
            symbol.uses.forEach(function (node) {
                var name = node.name;
                node.k = 'mem';
                node.object = { k: 'id', name: name };
                node.name = 'v';
            });
        });
    };

    // Declarations of the locals of the main code (the variables of on E handlers).
    Compiler.prototype.localDeclarations = function (fn) {
        var self = this;
        return fn.locals.filter(function (symbol) { return !symbol.isParam; }).map(function (symbol) {
            symbol.declaration = { k: 'var', kind: 'let', name: symbol.js, init: self.zeroNode(symbol.type) };
            return symbol.declaration;
        });
    };

    // --- Types from declarations

    Compiler.prototype.resolveType = function (node, declared) {
        switch (node.k) {
        case 'name':
            return this.namedType(node);
        case 'string': {
            if (node.size === null)
                return this.switches(node).H ? t.ansistring : t.shortstring;
            var size = this.constInt(node.size);
            if (size < 1 || size > 255)
                this.error('String length must be a value from 1 to 255', node.size);
            return new Pascal.Type('string', { name: null, short: size, size: size + 1 });
        }
        case 'subrange':
            return this.subrangeType(node, declared);
        case 'enum':
            return this.enumType(node, declared);
        case 'array': {
            var element = this.resolveType(node.of);
            for (var index = node.indexes.length - 1; index >= 0; --index) {
                var indexType = this.resolveType(node.indexes[index]);
                if (!types.isOrdinal(indexType))
                    this.error('Ordinal expression expected', node.indexes[index]);
                var count = types.count(indexType);
                if (count > 100000000)
                    this.error('Data element too large', node);
                element = new Pascal.Type('array', { name: null, index: indexType, lo: big.toFloat(types.lo(indexType)),
                                                      length: count, of: element, packed: !!node.packed });
            }
            return element;
        }
        case 'dynarray':
            return new Pascal.Type('dynarray', { name: null, of: this.resolveType(node.of), size: 8 });
        case 'openarray':
            return new Pascal.Type('openarray', { name: null, of: this.resolveType(node.of), size: 8 });
        case 'arrayofconst':
            return this.session.arrayOfConstType();
        case 'record':
            return this.recordType(node, declared);
        case 'set': {
            var of = this.resolveType(node.of);
            if (!types.isOrdinal(of))
                this.error('Ordinal type expected', node.of);
            var lo = big.toFloat(types.lo(of)), hi = big.toFloat(types.hi(of));
            if (lo < 0 || hi > 255)
                this.error('Set elements are not compatible', node.of);
            return new Pascal.Type('set', { name: null, of: of, lo: lo, hi: hi, small: hi < 32 });
        }
        case 'pointer':
            return this.pointerType(node);
        case 'file':
            if (node.of === null)
                return t.file;
            return new Pascal.Type('file', { name: null, of: this.resolveType(node.of), text: false, size: 8 });
        case 'proctype':
            return this.procType(node);
        case 'class':
            return this.classType(node, declared);
        case 'classref': {
            var target = this.resolveType(node.of);
            if (target.kind !== 'class')
                this.error('Class type expected', node.of);
            return new Pascal.Type('classref', { name: null, of: target, size: 8 });
        }
        }
        this.error('type expected', node);
    };

    Compiler.prototype.namedType = function (node) {
        var symbol;
        if (node.unit !== null) {
            var unitSymbol = this.lookup(node.unit);
            if (unitSymbol === null || unitSymbol.kind !== 'unit')
                this.notFound(node, node.unit);
            symbol = unitSymbol.unit.scope.here(node.name);
        } else {
            symbol = this.lookup(node.name);
        }
        if (symbol === null) {
            if (this.pendingTypes !== undefined && this.pendingTypes[node.name] !== undefined)
                return this.pendingTypes[node.name];
            this.notFound(node);
        }
        if (symbol.kind !== 'type')
            this.error('Error in type definition', node);
        if (symbol.byMode !== undefined)
            return symbol.byMode(this.switches(node));
        return symbol.type;
    };

    Compiler.prototype.subrangeType = function (node, declared) {
        var lo = this.constExpr(node.lo);
        var hi = this.constExpr(node.hi);
        if (!types.isOrdinal(lo.type) || !types.isOrdinal(hi.type))
            this.error('Ordinal expression expected', node);
        if (!types.sameOrdinalBase(types.base(lo.type), types.base(hi.type)))
            this.incompatible(hi.type, lo.type, node.hi);
        var low = Pascal.ordinalOf(lo.constant), high = Pascal.ordinalOf(hi.constant);
        if (big.cmp(low, high) > 0)
            this.error('High range limit < low range limit', node);
        return Pascal.subrange(lo.type, low, high, declared ? declared.text : null);
    };

    Compiler.prototype.enumType = function (node, declared) {
        var items = [];
        var type = new Pascal.Type('enum', { name: declared ? declared.text : null, items: items, lo: 0, hi: 0, size: 4 });
        var next = 0;
        var self = this;
        var scoped = this.switches(node).scopedEnums;
        node.items.forEach(function (item) {
            if (item.value !== null) {
                var value = self.constExpr(item.value);
                if (!types.isOrdinal(value.type))
                    self.error('Ordinal expression expected', item.value);
                next = big.toFloat(Pascal.ordinalOf(value.constant));
            }
            items.push({ name: item.name, text: item.text, value: next });
            if (!scoped)
                self.define(item.name, { kind: 'const', name: item.name, text: item.text, type: type, value: next }, item);
            ++next;
        });
        type.lo = items.reduce(function (most, item) { return Math.min(most, item.value); }, items[0].value);
        type.hi = items.reduce(function (most, item) { return Math.max(most, item.value); }, items[0].value);
        type.size = type.hi < 256 && type.lo >= 0 ? 1 : (type.hi < 65536 && type.lo >= 0 ? 2 : 4);
        type.size = 4;
        type.scope = Object.create(null);
        items.forEach(function (item) {
            type.scope[item.name] = { kind: 'const', name: item.name, text: item.text, type: type, value: item.value };
        });
        return type;
    };

    // The name of an enum element by its value (Write, Str, WriteStr).
    Pascal.enumName = function (type, value) {
        var base = types.base(type);
        for (var index = 0; index < base.items.length; ++index) {
            if (base.items[index].value === value)
                return base.items[index].text;
        }
        return null;
    };

    Compiler.prototype.recordType = function (node, declared) {
        var self = this;
        var type = new Pascal.Type('record', { name: declared ? declared.text : null, fields: [], fieldMap: Object.create(null),
                                                 packed: !!node.packed });
        var used = Object.create(null);
        function addField(nameNode, fieldType, variant) {
            if (type.fieldMap[nameNode.name] !== undefined)
                self.error('Duplicate identifier "' + nameNode.text + '"', nameNode);
            var js = T.propertyName(nameNode.name);
            while (used[js] !== undefined)
                js += '$';
            used[js] = true;
            var field = { name: nameNode.name, text: nameNode.text, type: fieldType, js: js, variant: !!variant };
            type.fields.push(field);
            type.fieldMap[nameNode.name] = field;
            return field;
        }
        function addList(list, variant) {
            list.forEach(function (declaration) {
                var fieldType = self.resolveType(declaration.typeNode);
                declaration.names.forEach(function (name) { addField(name, fieldType, variant); });
            });
        }
        addList(node.fields, false);
        if (node.variant !== null) {
            type.variantFields = [];
            var addVariant = function (variant) {
                var tagType = self.resolveType(variant.tagType);
                if (variant.tagName !== null)
                    addField({ name: variant.tagName, text: variant.tagText, line: variant.line, column: variant.column }, tagType, false);
                variant.cases.forEach(function (part) {
                    var before = type.fields.length;
                    addList(part.fields, true);
                    type.variantFields.push(type.fields.slice(before));
                    if (part.variant !== null)
                        addVariant(part.variant);
                });
            };
            addVariant(node.variant);
        }
        if (node.advanced && node.members.length > 0)
            this.error('records with methods are not supported yet', node);
        return type;
    };

    Compiler.prototype.pointerType = function (node) {
        // ^T where T is not declared yet in this type section is resolved at its end.
        if (node.to.k === 'name' && node.to.unit === null && this.pendingPointers !== undefined && this.lookup(node.to.name) === null) {
            var pending = new Pascal.Type('pointer', { name: null, to: null, size: 8, pending: node.to });
            this.pendingPointers.push(pending);
            return pending;
        }
        var target = this.resolveType(node.to);
        return new Pascal.Type('pointer', { name: null, to: target, size: 8 });
    };

    Compiler.prototype.procType = function (node) {
        var params = this.resolveParams(node.params);
        var result = node.resultType !== null ? this.resolveType(node.resultType) : null;
        return new Pascal.Type('proc', { name: null, params: params, result: result, ofObject: node.ofObject, size: node.ofObject ? 16 : 8 });
    };

    // Parameters: [{ name, text, type (null - untyped), mode, defaultValue }]
    Compiler.prototype.resolveParams = function (list) {
        var self = this;
        var params = [];
        list.forEach(function (group) {
            var type = group.typeNode !== null ? self.resolveType(group.typeNode) : null;
            var defaultValue = null;
            if (group.defaultValue !== null) {
                defaultValue = self.constExpr(group.defaultValue);
                if (group.names.length > 1)
                    self.error('Default value can only be assigned to one parameter', group.defaultValue);
            }
            group.names.forEach(function (name) {
                params.push({ name: name.name, text: name.text, type: type, mode: group.mode, defaultValue: defaultValue,
                              line: name.line, column: name.column });
            });
        });
        return params;
    };

    // --- Constants

    // The value of a constant expression (a Value with constant).
    Compiler.prototype.constExpr = function (node) {
        var value = this.compileExpr(node);
        if (!value.isConstant())
            this.error('Illegal expression', node);
        return value;
    };

    Compiler.prototype.constInt = function (node) {
        var value = this.constExpr(node);
        if (!types.isOrdinal(value.type))
            this.error('Ordinal expression expected', node);
        return big.toFloat(Pascal.ordinalOf(value.constant));
    };

    // The ordinal value of a constant: an integer (T.big), a character code, 0/1 for Boolean.
    Pascal.ordinalOf = function (value) {
        if (typeof value === 'boolean')
            return value ? 1 : 0;
        return value;
    };

    // --- Declaration sections

    Compiler.prototype.declare = function (item) {
        switch (item.k) {
        case 'uses':
            this.useUnits(item);
            return;
        case 'label':
            this.declareLabels(item);
            return;
        case 'consts':
            this.declareConsts(item);
            return;
        case 'types':
            this.declareTypes(item);
            return;
        case 'vars':
            this.declareVars(item);
            return;
        case 'routine':
            this.declareRoutine(item);
            return;
        }
        this.error('declaration expected', item);
    };

    Compiler.prototype.useUnits = function (item) {
        var self = this;
        item.units.forEach(function (unitNode) {
            var unit = self.session.loadUnit(unitNode.name, unitNode, self.unit);
            if (unit === null)
                self.error("Can't find unit " + unitNode.text + ' used by ' + (self.unit !== null ? self.unit.text : 'Program'), unitNode);
            if (self.units.indexOf(unit) < 0)
                self.units.push(unit);
        });
    };

    Compiler.prototype.declareLabels = function (item) {
        var self = this;
        item.labels.forEach(function (label) {
            var scope = self.fn !== null && self.fn.kind !== 'main' ? self.scope : null;
            var symbol = { kind: 'label', name: label.name, text: label.text, fn: self.fn, defined: false, used: false, node: label };
            if (scope !== null)
                scope.define(label.name, symbol);
            else
                self.define(label.name, symbol, label);
        });
    };

    Compiler.prototype.declareConsts = function (item) {
        var self = this;
        item.list.forEach(function (node) {
            if (node.typeNode === null) {
                var value = self.constExpr(node.value);
                self.define(node.name, { kind: 'const', name: node.name, text: node.text, type: value.type,
                                          value: value.constant, value0: value }, node);
                return;
            }
            // A typed constant is an initialized variable (it keeps its
            // value between calls, as a static one).
            var type = self.resolveType(node.typeNode);
            self.declareStaticVariable(node.name, node.text, type, node.value, node);
            if (!self.switches(node).J)
                self.lookup(node.name).readOnly = true;
        });
    };

    Compiler.prototype.declareTypes = function (item) {
        var self = this;
        var outerPending = this.pendingPointers;
        var outerTypes = this.pendingTypes;
        this.pendingPointers = [];
        this.pendingTypes = Object.create(null);
        try {
            item.list.forEach(function (node) {
                var existing = self.scope.kind === 'global' ? self.ownGlobal(node.name) : self.scope.names[node.name];
                // A forward class declaration: TFoo = class;
                if (existing !== undefined && existing !== null && existing.kind === 'type' && existing.type.kind === 'class' &&
                    existing.type.forward && node.typeNode.k === 'class' && !node.typeNode.forward) {
                    self.completeClass(existing.type, node.typeNode, node);
                    return;
                }
                var type = self.resolveType(node.typeNode, node);
                if (type.name === null || type.name === undefined || node.typeNode.k === 'name') {
                    // A new name for a type: an anonymous one gets this
                    // name; an alias (TMyInt = Integer) is the same type.
                    if (node.typeNode.k !== 'name')
                        type.name = node.text;
                }
                var symbol = { kind: 'type', name: node.name, text: node.text, type: type };
                self.define(node.name, symbol, node);
                self.pendingTypes[node.name] = type;
            });
            this.pendingPointers.forEach(function (pointer) {
                var target = self.resolveType(pointer.pending);
                pointer.to = target;
                delete pointer.pending;
            });
            Object.keys(this.pendingTypes).forEach(function (name) {
                var type = self.pendingTypes[name];
                if (type.kind === 'class' && type.forward)
                    self.error('Forward type not resolved "' + type.name + '"', item);
            });
        } finally {
            this.pendingPointers = outerPending;
            this.pendingTypes = outerTypes;
        }
    };

    Compiler.prototype.declareVars = function (item) {
        var self = this;
        item.list.forEach(function (node) {
            var type = self.resolveType(node.typeNode);
            if (type.kind === 'openarray')
                self.error('Error in type definition', node.typeNode);
            if (node.init !== null && node.names.length > 1)
                self.error('Only one variable can be initialized', node);
            if (node.absolute !== null)
                self.error('absolute variables are not supported', node);
            node.names.forEach(function (name) {
                if (self.fn === null || self.fn.kind === 'main')
                    self.declareGlobal(name.name, name.text, type, node.init, name);
                else
                    self.declareLocal(name.name, name.text, type, node.init, name);
            });
        });
    };

    // A global variable: in $V of the session (or of the Pascal unit).
    Compiler.prototype.declareGlobal = function (name, text, type, init, node) {
        var js = this.prefix + T.propertyName(name);
        var symbol = { kind: 'var', storage: 'global', name: name, text: text, type: type, js: js };
        this.define(name, symbol, node);
        this.newGlobals.push({ symbol: symbol, node: node });
        if (init !== null && init !== undefined) {
            // The value is set when the unit runs, at the place of the declaration.
            var value = this.typedValue(init, type);
            this.emitGlobalInit(symbol, value, node);
        }
        return symbol;
    };

    Compiler.prototype.emitGlobalInit = function (symbol, value, node) {
        var target = new Pascal.PropRef(symbol.type, J.id('$V'), J.str(symbol.js), true);
        var statement = J.at(J.expr(this.assignTo(target, value, node)), node.line, node.source);
        if (this.fn !== null && this.fn.kind === 'main')
            this.fn.body.push(statement);
        else
            this.initStatements.push(statement);
    };

    // A typed constant or a local constant with a type: lives between
    // calls - a global with a unique name.
    Compiler.prototype.declareStaticVariable = function (name, text, type, init, node) {
        if (this.fn === null || this.fn.kind === 'main') {
            this.declareGlobal(name, text, type, init, node);
            return;
        }
        var js = this.prefix + T.propertyName(name) + '$s' + (++this.uniqueCounter);
        var symbol = { kind: 'var', storage: 'global', name: name, text: text, type: type, js: js };
        this.scope.define(name, symbol);
        this.newGlobals.push({ symbol: symbol, node: node, hidden: true });
        var saved = this.fn;
        // The value is set once, when the unit runs.
        this.fn = this.mainFn;
        try {
            var value = this.typedValue(init, type);
            var target = new Pascal.PropRef(type, J.id('$V'), J.str(js), true);
            this.initStatements.push(J.at(J.expr(this.assignTo(target, value, node)), node.line, node.source));
        } finally {
            this.fn = saved;
        }
    };

    Compiler.prototype.declareLocal = function (name, text, type, init, node) {
        if (this.scope.names[name] !== undefined)
            this.error('Duplicate identifier "' + text + '"', node);
        var symbol = this.localVar(name, text, type);
        this.scope.define(name, symbol);
        if (init !== null && init !== undefined)
            symbol.initNode = { value: init, node: node };
        return symbol;
    };

    // The value of a typed constant: a tuple for arrays and records.
    Compiler.prototype.typedValue = function (node, type) {
        var self = this;
        if (node.k === 'tuple' || node.k === 'recordvalue') {
            if (type.kind === 'array') {
                if (node.k !== 'tuple')
                    this.error('Illegal expression', node);
                if (node.items.length !== type.length)
                    this.error('Wrong number of elements: expected ' + type.length + ', got ' + node.items.length, node);
                var items = node.items.map(function (item) { return self.convertValue(self.typedValue(item, type.of), type.of, item); });
                return new Value(type, J.call(J.mem(this.typeRef(type), 'build'), [J.arr(items.map(function (item) {
                    return item.node;
                }))]));
            }
            if (type.kind === 'dynarray' && node.k === 'tuple') {
                var elements = node.items.map(function (item) { return self.convertValue(self.typedValue(item, type.of), type.of, item); });
                return new Value(type, this.rt('arrayOf', [this.typeRef(type), J.arr(elements.map(function (item) {
                    return item.node;
                }))]));
            }
            if (type.kind === 'record') {
                if (node.k !== 'recordvalue')
                    this.error('Illegal expression', node);
                var pairs = [];
                node.fields.forEach(function (field) {
                    var info = type.fieldMap[field.name];
                    if (info === undefined)
                        self.error('Unknown record field identifier "' + field.text + '"', field);
                    pairs.push([info.js, self.convertValue(self.typedValue(field.value, info.type), info.type, field).node]);
                });
                return new Value(type, J.call(J.mem(this.typeRef(type), 'fromFields'), [J.obj(pairs)]));
            }
            if (node.k === 'tuple' && node.items.length === 1)
                return this.typedValue(node.items[0], type);
            this.error('Illegal expression', node);
        }
        return this.compileExpr(node, type);
    };

    // --- Routines

    // A procedure: the header; the body at once (or after forward).
    function Proc(props) {
        for (var key in props) {
            if (Object.prototype.hasOwnProperty.call(props, key))
                this[key] = props[key];
        }
    }
    Pascal.Proc = Proc;

    Compiler.prototype.makeProc = function (heading, owner) {
        var params = this.resolveParams(heading.params);
        var result = null;
        if (heading.resultType !== null)
            result = this.resolveType(heading.resultType);
        var directives = heading.directives;
        var proc = new Proc({
            name: heading.name, text: heading.text, kind: heading.kind, params: params, result: result,
            owner: owner || null, classMethod: heading.classMethod, isStatic: !!directives['static'],
            virtual: !!(directives.virtual || directives.dynamic), override: !!directives.override,
            abstract: !!directives.abstract, reintroduce: !!directives.reintroduce, overload: !!directives.overload,
            external: !!directives.external, forward: !!directives.forward,
            inline: !!directives.inline, defined: false, async: false, heading: heading, js: null, level: 0, calls: [],
            line: heading.line, source: heading.source
        });
        if (heading.kind === 'function' && result === null)
            this.error('Type identifier expected', heading);
        if (heading.kind === 'constructor' && owner === null)
            this.error('constructor outside of a class', heading);
        return proc;
    };

    Compiler.prototype.signatureText = function (proc) {
        return proc.params.map(function (param) {
            return (param.mode || '') + ':' + (param.type === null ? 'untyped' : Pascal.typeKey(param.type));
        }).join(',') + '=>' + (proc.result ? Pascal.typeKey(proc.result) : '');
    };

    // The key of a type for signatures: the name if there is one, otherwise the kind.
    Pascal.typeKey = function (type) {
        if (type.kind === 'int' && !type.subrangeOf)
            return type.ik;
        if (type.kind === 'string')
            return type.short === null ? 'string' : 'string' + type.short;
        if (type.kind === 'dynarray' || type.kind === 'openarray')
            return type.kind + '<' + Pascal.typeKey(type.of) + '>';
        if (type.kind === 'char')
            return type.wide ? 'widechar' : 'char';
        if (type.kind === 'real')
            return type.rk + (type.name || '');
        return (type.name || type.kind) + '#' + type.id;
    };

    // A routine declaration: a header or a body (with an earlier forward).
    Compiler.prototype.declareRoutine = function (heading) {
        if (heading.className !== null)
            return this.defineMethod(heading);
        if (heading.kind === 'operator')
            this.error('operator overloading is not supported yet', heading);
        var proc = this.makeProc(heading, null);
        var symbol = this.scope.kind === 'global' ? this.ownGlobal(heading.name) : (this.scope.names[heading.name] || null);
        var nested = this.fn !== null && this.fn.kind !== 'main';
        if (symbol !== null && symbol.kind !== 'routine')
            this.error('Duplicate identifier "' + heading.text + '"', heading);
        var previous = null;
        if (symbol !== null) {
            var self = this;
            symbol.procs.forEach(function (existing) {
                if (Pascal.sameParams(existing, proc))
                    previous = existing;
            });
            if (previous !== null && previous.defined && heading.body !== null)
                this.error('Duplicate identifier "' + heading.text + '"', heading);
            // overload is required only in the delphi mode.
            if (previous === null && !proc.overload && !symbol.procs.every(function (procedure) {
                return procedure.overload;
            }) &&
                this.switches(heading).mode === 'delphi')
                this.error('Duplicate identifier "' + heading.text + '"', heading);
        } else {
            // A repeated definition of a routine from another unit replaces it.
            symbol = { kind: 'routine', name: heading.name, text: heading.text, procs: [], global: !nested };
            var replaced = !nested ? this.globalScope.names[heading.name] : undefined;
            if (replaced !== undefined && replaced.kind === 'routine' && this.unit === null)
                symbol.replaces = replaced;
            this.define(heading.name, symbol, heading);
        }
        if (previous !== null) {
            // The body of a routine declared earlier (forward or in the interface).
            if (heading.body === null && !heading.directives.external)
                this.error('Duplicate identifier "' + heading.text + '"', heading);
            previous.heading = heading;
            proc = previous;
        } else {
            proc.level = nested ? this.fn.level + 1 : 0;
            proc.symbol = symbol;
            proc.signature = this.signatureText(proc);
            if (nested) {
                proc.js = this.fn.jsName(heading.name);
                proc.nested = true;
                proc.fn = this.fn;
            } else {
                proc.js = this.globalProcName(heading.name, proc, symbol);
            }
            symbol.procs.push(proc);
            if (!nested)
                this.newRoutines.push(proc);
        }
        if (heading.directives.external) {
            this.bindExternal(proc, heading);
            return proc;
        }
        if (heading.body === null) {
            if (!proc.forward && this.unit === null && !this.inInterface)
                proc.forward = true;
            this.forwards.push(proc);
            return proc;
        }
        this.compileRoutine(proc, heading);
        return proc;
    };

    Pascal.sameParams = function (left, right) {
        if (left.params.length !== right.params.length)
            return false;
        for (var index = 0; index < left.params.length; ++index) {
            var leftParam = left.params[index], rightParam = right.params[index];
            if ((leftParam.mode || '') !== (rightParam.mode || ''))
                return false;
            if (leftParam.type === null || rightParam.type === null) {
                if (leftParam.type !== rightParam.type)
                    return false;
                continue;
            }
            if (!types.equal(leftParam.type, rightParam.type))
                return false;
        }
        return true;
    };

    // The name of a global routine in $P: one signature - one name (calls
    // from other units find the new definition).
    Compiler.prototype.globalProcName = function (name, proc, symbol) {
        var base = this.prefix + 'p$' + name;
        var signature = proc.signature;
        var known = this.session.procNames;
        var key = base + '|' + signature;
        if (known[key] !== undefined)
            return known[key];
        var candidate = base;
        var counter = 1;
        while (this.session.usedProcNames[candidate] !== undefined)
            candidate = base + '$' + (++counter);
        this.session.usedProcNames[candidate] = true;
        known[key] = candidate;
        return candidate;
    };

    // external: a routine of the language library written in JavaScript.
    Compiler.prototype.bindExternal = function (proc, heading) {
        var native = this.session.findNative(this.unit, proc);
        if (native === null)
            this.error('External procedure "' + heading.text + '" is not available', heading);
        proc.native = native;
        proc.defined = true;
    };

    // The body of a routine as a JavaScript function.
    Compiler.prototype.compileRoutine = function (proc, heading) {
        var self = this;
        var body = heading.body;
        var outerFn = this.fn;
        var outerScope = this.scope;
        var fn = new FunctionContext(this, proc.owner !== null ? 'method' : 'routine', proc, outerFn !== null && outerFn.kind !== 'main' ? outerFn : null);
        fn.level = proc.level;
        fn.body = [];
        if (outerFn !== null && outerFn.kind !== 'main')
            Object.keys(outerFn.jsNames).forEach(function (name) { fn.jsNames[name] = true; });
        this.fn = fn;
        var scope = new Scope('routine', this.scope, proc);
        if (proc.owner !== null)
            scope = this.methodScope(proc, scope);
        this.scope = scope;
        try {
            var params = this.declareParams(proc, fn);
            if (proc.result !== null) {
                var resultSymbol = this.localVar('result', 'Result', proc.result, { isResult: true });
                resultSymbol.js = fn.jsName('$r');
                fn.resultVar = resultSymbol;
                if (this.isObjfpc(heading) && scope.names.result === undefined)
                    scope.define('result', resultSymbol);
                // The name of a function in an expression is its result (in objfpc).
                fn.resultName = proc.name;
            }
            body.items.forEach(function (item) {
                if (item.k === 'routine' && item.className !== null)
                    self.error('Illegal expression', item);
                self.declare(item);
            });
            this.checkForwards(heading);
            proc.defined = true;
            var statements = this.compileStatements(body.statements.body);
            var tail = [];
            if (proc.result !== null)
                tail.push(J.ret(this.localNode(fn.resultVar)));
            var full = this.functionBody(fn, statements, tail, body.statements);
            this.finishLocals(fn);
            var jsParams = params.map(function (param) { return param.boxed ? param.js + '$' : param.js; });
            params.forEach(function (param) {
                if (param.boxed)
                    full.unshift(J.let_(param.js, J.obj([['v', J.id(param.js + '$')]])));
            });
            proc.fn = fn;
            proc.jsFunction = J.fn(null, jsParams.concat(params.extra || []), full, false);
            proc.jsFunction.pascalFn = fn;
            fn.jsFunction = proc.jsFunction;
            this.allFunctions.push(fn);
            if (proc.nested) {
                outerFn.nested.push(J.at({ k: 'fndecl', name: proc.js, params: proc.jsFunction.params, body: proc.jsFunction.body,
                                           generator: false, pascalFn: fn }, heading.line, heading.source));
                fn.declaration = outerFn.nested[outerFn.nested.length - 1];
            } else if (proc.owner === null) {
                this.procs.push(proc);
            }
        } finally {
            this.fn = outerFn;
            this.scope = outerScope;
        }
    };

    // The parameters of a routine are locals; a var one (except
    // aggregates) is a pair (object, key).
    Compiler.prototype.declareParams = function (proc, fn) {
        var self = this;
        var list = [];
        var jsParams = [];
        if (proc.owner !== null && !(proc.classMethod && proc.isStatic)) {
            // Self is this of the function; in nested functions it goes through a closure.
            fn.selfNode = J.id('$self');
        }
        proc.params.forEach(function (param) {
            if (self.scope.names[param.name] !== undefined)
                self.error('Duplicate identifier "' + param.text + '"', param);
            var byRef = param.mode === 'var' || param.mode === 'out';
            var symbol;
            if (byRef && !Pascal.passesObject(param.type)) {
                var objectName = fn.jsName(param.name + '$o');
                var keyName = fn.jsName(param.name + '$k');
                symbol = { kind: 'var', storage: 'varparam', name: param.name, text: param.text, type: param.type,
                           objectJs: objectName, keyJs: keyName, mode: param.mode, param: param };
                jsParams.push({ js: objectName, boxed: false }, { js: keyName, boxed: false });
            } else {
                symbol = self.localVar(param.name, param.text, param.type, { isParam: true, mode: param.mode, param: param });
                jsParams.push(symbol);
                if (byRef)
                    symbol.byRefObject = true;
                if ((param.mode === 'const' || param.mode === 'constref') || byRef)
                    symbol.readOnly = param.mode === 'const' || param.mode === 'constref';
            }
            self.scope.define(param.name, symbol);
            list.push(symbol);
        });
        fn.params = list;
        return jsParams;
    };

    // Aggregates (records, static arrays, objects) are passed as var by the
    // object itself; everything else as a pair (object, key).
    Pascal.passesObject = function (type) {
        return type !== null && types.isAggregate(type);
    };

    // The body of a function: declarations of temporaries and locals, statements, the tail.
    Compiler.prototype.functionBody = function (fn, statements, tail, node) {
        var self = this;
        var head = [];
        if (fn.selfNode !== null && fn.kind === 'method')
            head.push(J.var_('$self', J.this_()));
        var locals = fn.locals.filter(function (symbol) { return !symbol.isParam; });
        locals.forEach(function (symbol) {
            var init = self.zeroNode(symbol.type);
            symbol.declaration = { k: 'var', kind: 'let', name: symbol.js, init: init };
            head.push(symbol.declaration);
        });
        // The values of record parameters are copied: the caller does not see changes.
        (fn.params || []).forEach(function (symbol) {
            if (symbol.storage === 'local' && symbol.mode === '' && Pascal.passesObject(symbol.type))
                head.push(J.expr(J.assign(J.id(symbol.js), J.call(J.mem(self.typeRef(symbol.type), 'clone'), [J.id(symbol.js)]))));
        });
        var inits = [];
        locals.forEach(function (symbol) {
            if (symbol.initNode !== null) {
                var value = self.typedValue(symbol.initNode.value, symbol.type);
                inits.push(J.at(J.expr(self.assignTo(self.localRef(symbol), value, symbol.initNode.node)),
                                symbol.initNode.node.line, symbol.initNode.node.source));
            }
        });
        var body = head.concat(fn.nested, inits, statements, tail);
        var temps = fn.temps.declarations();
        // Boxes of locals: let x = {v: ...}.
        return temps.concat(body).map(function (statement) {
            return statement;
        });
    };

    // The zero value of a type in the code.
    Compiler.prototype.zeroNode = function (type) {
        switch (type.kind) {
        case 'int':
        case 'char':
        case 'enum':
        case 'real':
            return J.num(0);
        case 'bool':
            return J.bool(false);
        case 'string':
            return J.str('');
        case 'set':
            return type.small ? J.num(0) : this.constant(Pascal.EMPTY_BIG_SET);
        case 'dynarray':
            return J.call(J.mem(this.typeRef(type), 'empty'), []);
        case 'array':
        case 'record':
        case 'file':
            return J.call(J.mem(this.typeRef(type), 'zero'), []);
        case 'class':
            if (type.isObject)
                return J.call(J.mem(this.typeRef(type), 'zero'), []);
            return J.nul();
        }
        return J.nul();
    };

    Compiler.prototype.checkForwards = function (node) {
        var self = this;
        var scope = this.scope;
        this.forwards = this.forwards.filter(function (proc) {
            if (proc.defined)
                return false;
            if (proc.symbol && scope.names[proc.name] === proc.symbol && proc.nested)
                self.error('Forward declaration not solved "' + proc.text + '"', proc.heading);
            return true;
        });
    };

    // --- The program

    Compiler.prototype.compileProgram = function (file) {
        var self = this;
        var main = new FunctionContext(this, 'main', null, null);
        main.level = -1;
        main.body = [];
        this.fn = main;
        this.mainFn = main;
        this.initStatements = [];
        var last = file.items.length > 0 ? file.items[file.items.length - 1] : null;
        file.items.forEach(function (item) {
            if (item.k === 'stmt' || item.k === 'main') {
                var statement = item.k === 'stmt' ? item.statement : item.body;
                // The last statement of a unit that is an expression is its value.
                self.valueStatementAllowed = item === last && item.k === 'stmt' && statement.k === 'call';
                var compiled;
                try {
                    compiled = self.compileStatement(statement);
                } finally {
                    self.valueStatementAllowed = false;
                }
                compiled.forEach(function (node) { main.body.push(node); });
                return;
            }
            self.declare(item);
        });
        this.forwards.forEach(function (proc) {
            if (!proc.defined)
                self.error('Forward declaration not solved "' + proc.text + '"', proc.heading);
        });
        this.checkClassesComplete();
        this.checkLabels(main);
        this.computeAsync();
        var statements = this.structureBody(main, this.initStatements.concat(main.body));
        var declarations = this.localDeclarations(main);
        this.finishLocals(main);
        var mainBody = main.temps.declarations().concat(declarations, main.nested, statements);
        if (this.blockValueType !== undefined) {
            mainBody.unshift(J.let_('$value'));
            mainBody.push(J.ret(J.id('$value')));
        }
        this.mainAsync = main.async;
        return this.assemble(mainBody, main.async);
    };

    // The chunk: the classes and routines of the unit, then { procs, classes, main }.
    Compiler.prototype.assemble = function (mainBody, mainAsync) {
        var self = this;
        // Strict mode: a method called on nil (Free) gets this = null.
        var body = [J.expr(J.str('use strict'))];
        this.classes.forEach(function (klass) {
            self.emitClass(klass, body);
        });
        var procPairs = [];
        this.procs.forEach(function (proc) {
            var name = proc.js.replace(/\./g, '$');
            body.push(J.at({ k: 'fndecl', name: name, params: proc.jsFunction.params, body: proc.jsFunction.body,
                             generator: proc.jsFunction.generator }, proc.line, proc.source));
            procPairs.push([proc.js, J.id(name)]);
        });
        var classPairs = this.classes.map(function (klass) { return [klass.js, J.id(klass.localJs)]; });
        body.push(J.ret(J.obj([
            ['procs', J.obj(procPairs)],
            ['classes', J.obj(classPairs)],
            ['main', J.fn(null, [], mainBody, mainAsync)]
        ])));
        return body;
    };

    // --- Fibers: a routine waits (Delay, Sleep) or calls one that waits.

    Compiler.prototype.computeAsync = function () {
        var functions = this.allFunctions.concat([this.mainFn]);
        var changed = true;
        while (changed) {
            changed = false;
            functions.forEach(function (fn) {
                if (fn.async)
                    return;
                var waits = fn.calls.some(function (call) {
                    return call.waits || (call.proc !== undefined && call.proc !== null && call.proc.async === true &&
                                          call.direct);
                });
                if (waits) {
                    fn.async = true;
                    if (fn.proc !== null && fn.proc !== undefined && fn.kind === 'routine')
                        fn.proc.async = true;
                    changed = true;
                }
            });
        }
        var self = this;
        functions.forEach(function (fn) {
            if (!fn.async || fn.kind === 'method')
                return;
            if (fn.jsFunction)
                fn.jsFunction.generator = true;
            if (fn.declaration)
                fn.declaration.generator = true;
            fn.calls.forEach(function (call) {
                if (call.node === undefined)
                    return;
                if (call.waits || (call.proc && call.proc.async && call.direct))
                    self.makeYield(call);
            });
        });
        // Calls of waiting routines from plain functions (methods,
        // procedural values) run at once, through runNested.
        functions.forEach(function (fn) {
            if (fn.async && fn.kind !== 'method')
                return;
            fn.calls.forEach(function (call) {
                if (call.node === undefined)
                    return;
                if (call.waits || (call.proc && call.proc.async && call.direct))
                    self.makeNested(call);
            });
        });
    };

    // The call node in place: yield* ... (a call from a fiber).
    Compiler.prototype.makeYield = function (call) {
        var node = call.node;
        var copy = Object.assign({}, node);
        var callee = call.generatorCallee ? call.generatorCallee(copy) : copy;
        Object.keys(node).forEach(function (key) { delete node[key]; });
        node.k = 'yield';
        node.delegate = true;
        node.arg = callee;
    };

    // A waiting call from a plain function: runs at once (runNested).
    Compiler.prototype.makeNested = function (call) {
        var node = call.node;
        var copy = Object.assign({}, node);
        var generator = call.generatorCallee ? call.generatorCallee(copy) : copy;
        Object.keys(node).forEach(function (key) { delete node[key]; });
        node.k = 'call';
        node.callee = J.path('$R.env.scheduler.runNested');
        node.callee = J.mem(J.mem(J.mem(J.id('$R'), 'env'), 'scheduler'), 'runNested');
        node.args = [generator];
    };

    Compiler.prototype.checkLabels = function (fn) {
        var self = this;
        Object.keys(fn.labels).forEach(function (name) {
            var label = fn.labels[name];
            if (label.used && !label.defined)
                self.error('Label used but not defined "' + label.text + '"', label.node);
        });
    };

    // --- A Pascal unit

    Compiler.prototype.compileUnit = function (file) {
        var self = this;
        var main = new FunctionContext(this, 'main', null, null);
        main.level = -1;
        main.body = [];
        this.fn = main;
        this.mainFn = main;
        this.initStatements = [];
        this.inInterface = true;
        file.interfaceItems.forEach(function (item) { self.declare(item); });
        this.inInterface = false;
        // The interface is visible at once and outside; the names of the
        // implementation only to the Pascal unit itself (a new layer).
        var unitScope = this.unit.scope;
        Object.keys(this.layer.names).forEach(function (name) { unitScope.define(name, self.layer.names[name]); });
        var publicLayer = this.layer;
        this.layer = new Scope('implementation', null);
        file.implementationItems.forEach(function (item) { self.declare(item); });
        this.forwards.forEach(function (proc) {
            if (!proc.defined)
                self.error('Forward declaration not solved "' + proc.text + '"', proc.heading);
        });
        this.checkClassesComplete();
        if (file.initialization !== null) {
            file.initialization.forEach(function (statement) {
                self.compileStatement(statement).forEach(function (node) { main.body.push(node); });
            });
        }
        this.checkLabels(main);
        this.computeAsync();
        var statements = this.structureBody(main, this.initStatements.concat(main.body));
        var declarations = this.localDeclarations(main);
        this.finishLocals(main);
        var mainBody = main.temps.declarations().concat(declarations, main.nested, statements);
        void publicLayer;
        return this.assemble(mainBody, main.async);
    };
})(globalThis);
