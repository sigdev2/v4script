// BASIC: translation of a unit into JavaScript - names and their types,
// variables of the module and of procedures, expressions with the
// arithmetic of QBasic (INTEGER and LONG overflow, SINGLE through
// Math.fround), procedure calls with parameters by reference. Statements
// are in statements.js, built-in functions in builtins.js. Design:
// docs/internals/basic.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.Compiler)
        return;

    var J = T.J;
    var CompileError = T.CompileError;
    var SUFFIXES = Basic.SUFFIXES;

    var TYPE_NAMES = { i: 'INTEGER', l: 'LONG', f: 'SINGLE', d: 'DOUBLE', s: 'STRING', o: 'OBJECT' };
    var RANK = { i: 1, l: 2, f: 3, d: 4 };
    var LIMITS = { i: [-32768, 32767], l: [-2147483648, 2147483647] };

    function kindOf(type) {
        return typeof type === 'string' ? type : 'r';
    }
    Basic.kindOf = kindOf;

    function isNumeric(type) {
        return type === 'i' || type === 'l' || type === 'f' || type === 'd';
    }
    Basic.isNumeric = isNumeric;

    function typeName(type) {
        return typeof type === 'string' ? TYPE_NAMES[type] : type.display;
    }

    // The JavaScript name of a variable: kind + type + name (dots become "$").
    function mangle(name) {
        return name.replace(/\./g, '$').replace(/[^\w$\u0080-￿]/g, '_');
    }

    function typeChar(type) {
        return typeof type === 'string' ? type : 'r';
    }

    function jsName(prefix, name, type) {
        return prefix + typeChar(type) + '_' + mangle(name);
    }
    Basic.jsName = jsName;

    // --- Variables and scopes

    // A variable: { key, name, display, type, length (STRING * n), array,
    // dims, js, storage: 'module' | 'local' | 'static' | 'param' | 'result',
    // byval }. In the code of a unit a module variable is a local copy or
    // $V.<js> (when procedures see it: SHARED, DEF FN).
    function Variable(key, name, display, type, options) {
        this.key = key;
        this.name = name;
        this.display = display;
        this.type = type;
        this.length = options.length || 0;
        this.array = !!options.array;
        this.dims = options.dims === undefined ? -1 : options.dims;
        this.js = options.js;
        this.storage = options.storage;
        this.byval = !!options.byval;
        this.implicit = !!options.implicit;
        this.isStatic = !!options.isStatic;
    }
    Basic.Variable = Variable;

    // A scope: the module (shared by the units, a layer over the session) or a procedure.
    function Scope(kind, parent) {
        this.kind = kind;
        this.parent = parent || null;
        this.vars = Object.create(parent && kind === 'layer' ? parent.vars : null);
        this.arrays = Object.create(parent && kind === 'layer' ? parent.arrays : null);
        this.declared = Object.create(parent && kind === 'layer' ? parent.declared : null);
        this.declaredArrays = Object.create(parent && kind === 'layer' ? parent.declaredArrays : null);
        this.consts = Object.create(parent && kind === 'layer' ? parent.consts : null);
        // Module variables that the procedure sees (SHARED): key -> module variable.
        this.shared = Object.create(null);
        this.sharedArrays = Object.create(null);
        this.deftypes = null;
    }
    Basic.Scope = Scope;

    Scope.prototype.commitInto = function (target) {
        var self = this;
        ['vars', 'arrays', 'declared', 'declaredArrays', 'consts'].forEach(function (field) {
            Object.keys(self[field]).forEach(function (key) {
                target[field][key] = self[field][key];
            });
        });
    };

    function DefTypes(base) {
        this.map = base ? Object.assign({}, base.map) : {};
    }
    DefTypes.prototype.typeOf = function (name) {
        var letter = name.charAt(0);
        return this.map[letter] || 'f';
    };
    DefTypes.prototype.apply = function (node) {
        var map = this.map;
        node.ranges.forEach(function (range) {
            var from = range.from.charCodeAt(0), to = range.to.charCodeAt(0);
            if (to < from) {
                var swap = from;
                from = to;
                to = swap;
            }
            for (var code = from; code <= to; ++code)
                map[String.fromCharCode(code)] = node.type;
        });
    };
    Basic.DefTypes = DefTypes;

    // --- The compiler of a unit

    function Compiler(session, program, source) {
        this.session = session;
        this.program = program;
        this.source = source || '';
        this.constants = [];
        this.constantIndex = new Map();
        this.module = new Scope('layer', session.module);
        this.types = Object.create(session.types);
        this.procs = Object.create(session.procs);
        this.newProcs = Object.create(null);
        this.newTypes = Object.create(null);
        // Module variables that the procedures of this unit now see.
        this.newShared = Object.create(null);
        this.newGlobals = Object.create(null);
        this.optionBase = session.optionBase;
        this.deftypes = new DefTypes(session.deftypes);
        this.data = new Basic.DataSet(program.data.map(function (item) {
            return { value: item.value, quoted: item.quoted, line: item.line, source: item.source };
        }));
        this.unit = null;
        this.chunk = [];
    }
    Basic.Compiler = Compiler;

    Compiler.prototype.fail = function (message, node) {
        node = node || {};
        throw new CompileError(message, node.line || 0, node.column || 0,
                               node.source !== undefined ? node.source : this.source);
    };

    // A value the translator built (a record description, data): in the
    // code it is the chunk variable $cN.
    Compiler.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.id('$c' + index);
    };

    Compiler.prototype.isShared = function (key) {
        return this.session.shared[key] === true || this.newShared[key] === true;
    };

    Compiler.prototype.markShared = function (key) {
        this.newShared[key] = true;
    };

    // DIM SHARED and COMMON SHARED: all procedures see the variable.
    Compiler.prototype.isGlobal = function (key) {
        return this.session.globals[key] === true || this.newGlobals[key] === true;
    };

    Compiler.prototype.markGlobal = function (key) {
        this.newGlobals[key] = true;
        this.newShared[key] = true;
    };

    // --- Types

    // The type of an "AS ..." parse node: a kind string or a record description.
    Compiler.prototype.resolveType = function (spec, node) {
        if (spec.base === 'record') {
            var record = this.types[spec.record];
            if (record === undefined)
                this.fail('Type not defined', spec.token || node);
            return { type: record, length: 0 };
        }
        if (spec.base === 'any')
            this.fail('Advanced feature unavailable', node);
        var length = spec.length || 0;
        if (spec.lengthConstant) {
            var constant = this.lookupConst(spec.lengthConstant.value);
            if (constant === null || !isNumeric(constant.type) || constant.value < 1)
                this.fail('Expected: positive integer', spec.lengthConstant);
            length = Math.round(constant.value);
        }
        return { type: spec.base, length: length };
    };

    Compiler.prototype.defineTypes = function () {
        var self = this;
        this.program.types.forEach(function (node) {
            if (Object.prototype.hasOwnProperty.call(self.newTypes, node.name))
                self.fail('Duplicate definition', node);
            var record = new Basic.RecordType(node.name, node.display);
            var names = Object.create(null);
            node.fields.forEach(function (field) {
                if (names[field.name])
                    self.fail('Duplicate definition', field);
                names[field.name] = true;
                var resolved = self.resolveType(field.type, field);
                if (resolved.type === record)
                    self.fail('Type not defined', field);
                if (resolved.type === 's' && resolved.length === 0)
                    self.fail('Expected: STRING * n', field);
                var kind = kindOf(resolved.type);
                record.fields.push({ name: field.name, display: field.display, js: 'f_' + mangle(field.name), kind: kind,
                                     length: resolved.length, record: kind === 'r' ? resolved.type : null,
                                     type: resolved.type });
                record.size += Basic.sizeOf(kind, resolved.length, kind === 'r' ? resolved.type : null);
            });
            self.newTypes[node.name] = record;
            self.types[node.name] = record;
        });
    };

    Compiler.prototype.field = function (record, name, node) {
        for (var index = 0; index < record.fields.length; ++index) {
            if (record.fields[index].name === name)
                return record.fields[index];
        }
        this.fail('Element not defined', node);
    };

    // --- Procedures: signatures

    Compiler.prototype.paramList = function (params, deftypes, node) {
        var self = this;
        var seen = Object.create(null);
        return params.map(function (param) {
            if (seen[param.name + param.suffix])
                self.fail('Duplicate definition', param);
            seen[param.name + param.suffix] = true;
            var type, length = 0;
            if (param.type !== null) {
                var resolved = self.resolveType(param.type, param);
                type = resolved.type;
                if (resolved.length > 0)
                    self.fail('Expected: , or )', param);
            } else if (param.suffix !== '') {
                type = SUFFIXES[param.suffix];
            } else {
                type = deftypes.typeOf(param.name);
            }
            return { name: param.name, display: param.display, suffix: param.suffix, type: type, length: length,
                     array: param.array, byval: param.byval, line: param.line, column: param.column,
                     source: param.source, explicit: param.type !== null };
        });
    };

    function signature(proc) {
        return proc.kind + ':' + (proc.type ? typeChar(proc.type) : '') + '(' + proc.params.map(function (param) {
            return typeChar(param.type) + (typeof param.type === 'string' ? '' : param.type.name) +
                (param.array ? '()' : '') + (param.byval ? 'v' : '');
        }).join(',') + ')';
    }
    Basic.signature = signature;

    Compiler.prototype.procedureDefTypes = function (node) {
        var deftypes = new DefTypes(this.session.deftypes);
        (node.defs || []).forEach(function (def) { deftypes.apply(def); });
        return deftypes;
    };

    Compiler.prototype.declareProcedures = function () {
        var self = this;
        this.program.procedures.forEach(function (node) {
            var key = node.k === 'def' ? 'fn:' + node.name : node.name;
            if (self.newProcs[key] !== undefined)
                self.fail('Duplicate definition', node);
            var deftypes = self.procedureDefTypes(node);
            var proc = {
                key: key, name: node.name, display: node.display, kind: node.k === 'def' ? 'def' : node.k,
                type: null, params: self.paramList(node.params, deftypes, node), node: node, deftypes: deftypes,
                async: false, js: (node.k === 'def' ? 'd_' : 'p_') + mangle(node.name)
            };
            if (proc.kind !== 'sub')
                proc.type = node.suffix !== '' ? SUFFIXES[node.suffix] : deftypes.typeOf(node.name);
            if (proc.kind === 'def')
                proc.params.forEach(function (param) {
                    if (param.array)
                        self.fail('Expected: identifier', param);
                    param.byval = true;
                });
            if (proc.kind !== 'def') {
                if (self.types[node.name] !== undefined)
                    self.fail('Duplicate definition', node);
            }
            proc.signature = signature(proc);
            self.newProcs[key] = proc;
            self.procs[key] = proc;
        });
        // DECLARE: checks that it matches the definition.
        this.program.declares.forEach(function (node) {
            var proc = self.procs[node.name];
            var deftypes = new DefTypes(self.session.deftypes);
            var params = self.paramList(node.params, deftypes, node);
            if (proc === undefined)
                return;
            if (proc.kind !== node.kind || proc.params.length !== params.length)
                self.fail('Argument-count mismatch', node);
        });
    };

    Compiler.prototype.lookupProc = function (name) {
        var proc = this.procs[name];
        return proc !== undefined ? proc : null;
    };

    // --- Constants

    Compiler.prototype.lookupConst = function (name) {
        var scope = this.unit !== null ? this.unit.scope : null;
        if (scope !== null && scope !== this.module && scope.consts[name] !== undefined)
            return scope.consts[name];
        var found = this.module.consts[name];
        return found !== undefined ? found : null;
    };

    Compiler.prototype.defineConst = function (scope, item, local) {
        var expression = this.expr(item.value);
        if (expression.c === undefined)
            this.fail('Invalid constant', item.value);
        var type = expression.t === 'b' ? 'i' : expression.t;
        var value = expression.t === 'b' ? (expression.c ? -1 : 0) : expression.c;
        if (item.suffix !== '') {
            var target = SUFFIXES[item.suffix];
            if ((target === 's') !== (type === 's'))
                this.fail('Type mismatch', item);
            value = this.convertConstant(value, type, target, item);
            type = target;
        }
        if (Object.prototype.hasOwnProperty.call(scope.consts, item.name) && local)
            this.fail('Duplicate definition', item);
        if (scope.declared[item.name] !== undefined && Object.prototype.hasOwnProperty.call(scope.declared, item.name))
            this.fail('Duplicate definition', item);
        scope.consts[item.name] = { type: type, value: value, display: item.display };
    };

    Compiler.prototype.convertConstant = function (value, from, to, node) {
        try {
            switch (to) {
            case 'i': return Basic.cint(value);
            case 'l': return Basic.clng(value);
            case 'f': return Basic.csng(value);
            }
            return value;
        } catch (error) {
            this.fail(error.message, node);
        }
    };

    // --- A translation unit: the main code of a unit or a procedure

    function Unit(compiler, kind, proc) {
        this.compiler = compiler;
        this.kind = kind;                 // 'main' | 'sub' | 'function' | 'def'
        this.proc = proc || null;
        this.scope = kind === 'main' ? compiler.module : new Scope('procedure', null);
        this.temps = new T.FunctionScope('$t');
        this.items = [];
        this.labelCount = 0;
        this.labels = Object.create(null);
        this.loops = [];
        this.async = false;
        this.machine = false;
        this.errorMode = false;
        this.endLabel = 0;
        // Variables the code refers to: js -> variable.
        this.used = Object.create(null);
        this.usedArrays = Object.create(null);
        this.locals = [];
        this.statics = [];
        // Names that get assigned (for the soft names of the API).
        this.assigned = Object.create(null);
        this.deftypes = null;
        this.calls = Object.create(null);
        this.isStaticProc = false;
        this.statementStarts = [];
        this.lineNumbers = Object.create(null);
        this.lastLineNumber = 0;
    }
    Basic.Unit = Unit;

    Unit.prototype.newLabel = function () {
        return ++this.labelCount;
    };

    Compiler.prototype.temp = function () {
        return this.unit.temps.temp();
    };

    // --- Variables: lookup and creation

    // The key of a simple variable: name|type. A name declared "AS type"
    // has that type; a suffix must match it.
    Compiler.prototype.scalarKey = function (scope, name, suffix, node) {
        var declared = scope.declared[name];
        if (declared === undefined && scope !== this.module) {
            var moduleKey = this.module.declared[name];
            if (moduleKey !== undefined && this.isGlobal(moduleKey))
                declared = moduleKey;
        }
        if (suffix !== '') {
            var key = name + '|' + SUFFIXES[suffix];
            if (declared !== undefined && declared !== key)
                this.fail('Duplicate definition', node);
            return key;
        }
        if (declared !== undefined)
            return declared;
        return name + '|' + this.unit.deftypes.typeOf(name);
    };

    Compiler.prototype.arrayKey = function (scope, name, suffix, node) {
        var declared = scope.declaredArrays[name];
        if (declared === undefined && scope !== this.module) {
            var moduleKey = this.module.declaredArrays[name];
            if (moduleKey !== undefined && this.isGlobal(moduleKey))
                declared = moduleKey;
        }
        if (suffix !== '') {
            var key = name + '|' + SUFFIXES[suffix];
            if (declared !== undefined && declared !== key)
                this.fail('Duplicate definition', node);
            return key;
        }
        if (declared !== undefined)
            return declared;
        return name + '|' + this.unit.deftypes.typeOf(name);
    };

    function keyType(key) {
        return key.substring(key.indexOf('|') + 1);
    }

    // A module variable by its key (created in the layer of the unit).
    Compiler.prototype.moduleVariable = function (key, name, display, type, length) {
        var found = this.module.vars[key];
        if (found !== undefined)
            return found;
        var variable = new Variable(key, name, display, type, { js: jsName('v', name, type), storage: 'module',
                                                                length: length });
        this.module.vars[key] = variable;
        return variable;
    };

    Compiler.prototype.moduleArray = function (key, name, display, type, length, dims, implicit) {
        var found = this.module.arrays[key];
        if (found !== undefined)
            return found;
        var variable = new Variable(key, name, display, type, { js: jsName('a', name, type), storage: 'module',
                                                                array: true, dims: dims, length: length,
                                                                implicit: implicit });
        this.module.arrays[key] = variable;
        return variable;
    };

    // A simple variable or a record by name in the current scope (created
    // when first mentioned, as in BASIC).
    Compiler.prototype.variable = function (name, suffix, display, node) {
        var unit = this.unit;
        var scope = unit.scope;
        var key = this.scalarKey(scope, name, suffix, node);
        if (unit.kind === 'main') {
            var found = scope.vars[key];
            if (found === undefined) {
                // Only DIM ... AS creates a record.
                var type = keyType(key);
                if (type === 'r')
                    this.fail('Type not defined', node);
                found = this.moduleVariable(key, name, display || name, type, 0);
            }
            return this.useModule(found);
        }
        var local = scope.vars[key];
        if (local !== undefined)
            return local;
        var shared = scope.shared[key];
        if (shared !== undefined)
            return shared;
        if (this.isGlobal(key) && this.module.vars[key] !== undefined)
            return this.module.vars[key];
        if (unit.kind === 'def') {
            // DEF FN sees the module variables.
            var moduleVar = this.module.vars[key];
            if (moduleVar === undefined)
                moduleVar = this.moduleVariable(key, name, display || name, keyType(key), 0);
            this.markShared(key);
            return moduleVar;
        }
        var localType = keyType(key);
        return this.declareLocal(scope, key, name, display || name, localType === 'r' ? null : localType, 0, false);
    };

    Compiler.prototype.useModule = function (variable) {
        if (this.unit.kind === 'main')
            this.unit.used[variable.js] = variable;
        return variable;
    };

    Compiler.prototype.declareLocal = function (scope, key, name, display, type, length, isStatic) {
        var unit = this.unit;
        var variable = new Variable(key, name, display, type, {
            js: jsName('v', name, type), storage: isStatic || unit.isStaticProc ? 'static' : 'local', length: length,
            isStatic: isStatic || unit.isStaticProc
        });
        scope.vars[key] = variable;
        if (variable.storage === 'static')
            unit.statics.push(variable);
        else
            unit.locals.push(variable);
        return variable;
    };

    Compiler.prototype.declareLocalArray = function (scope, key, name, display, type, length, dims, isStatic, implicit) {
        var unit = this.unit;
        var variable = new Variable(key, name, display, type, {
            js: jsName('a', name, type), storage: isStatic || unit.isStaticProc ? 'static' : 'local', array: true,
            dims: dims, length: length, implicit: implicit, isStatic: isStatic || unit.isStaticProc
        });
        scope.arrays[key] = variable;
        if (variable.storage === 'static')
            unit.statics.push(variable);
        else
            unit.locals.push(variable);
        return variable;
    };

    // An array by name; dims - the number of indices used (for an implicit
    // array 0..10).
    Compiler.prototype.array = function (name, suffix, display, node, dims, create) {
        var unit = this.unit;
        var scope = unit.scope;
        var key = this.arrayKey(scope, name, suffix, node);
        var found = scope.arrays[key];
        if (found === undefined && unit.kind !== 'main')
            found = scope.sharedArrays[key];
        if (found === undefined && unit.kind !== 'main' && this.isGlobal(key))
            found = this.module.arrays[key];
        if (found === undefined && unit.kind === 'def') {
            found = this.module.arrays[key];
            if (found === undefined)
                found = this.moduleArray(key, name, display || name, keyType(key), 0, dims, true);
        }
        if (found === undefined) {
            if (!create)
                return null;
            var type = keyType(key);
            if (type === 'r')
                this.fail('Array not defined', node);
            if (unit.kind === 'main')
                found = this.moduleArray(key, name, display || name, type, 0, dims, true);
            else
                found = this.declareLocalArray(scope, key, name, display || name, type, 0, dims, false, true);
        }
        if (found.dims < 0 && dims >= 0)
            found.dims = dims;
        if (dims >= 0 && found.dims >= 0 && found.dims !== dims)
            this.fail('Wrong number of dimensions', node);
        if (found.storage === 'module') {
            if (unit.kind === 'main')
                unit.usedArrays[found.js] = found;
        }
        return found;
    };

    // A reference to a variable in the code.
    Compiler.prototype.varRef = function (variable) {
        if (variable.storage === 'module') {
            if (this.unit.kind === 'main' && !this.isShared(variable.key))
                return J.id(variable.js);
            return J.mem(J.id('$V'), variable.js);
        }
        if (variable.storage === 'result')
            return J.id('$r');
        return J.id(variable.js);
    };

    Compiler.prototype.arrayRef = function (variable) {
        if (variable.storage === 'module' && this.unit.kind !== 'main') {
            this.unit.usedArrays[variable.js] = variable;
            return J.id(variable.js);
        }
        return J.id(variable.js);
    };

    // --- Expressions
    //
    // The result: { t: type ('i' 'l' 'f' 'd' 's' 'o', a record description
    // or 'b' - a JavaScript boolean), j: node, u: a float not checked for
    // overflow, c: the value of a constant, lv: can be taken by reference }.

    function E(type, node, extra) {
        var result = { t: type, j: node, u: false, c: undefined };
        if (extra) {
            for (var key in extra)
                result[key] = extra[key];
        }
        return result;
    }
    Basic.E = E;

    function literal(value, type) {
        var node;
        if (type === 's')
            node = J.str(value);
        else if (value < 0 || (value === 0 && 1 / value < 0))
            node = J.un('-', J.num(-value));
        else
            node = J.num(value);
        return E(type, node, { c: value });
    }
    Basic.literal = literal;

    Compiler.prototype.expr = function (node) {
        switch (node.k) {
        case 'num':
            return literal(node.value, node.kind);
        case 'str':
            return literal(node.value, 's');
        case 'paren':
            var inner = this.expr(node.arg);
            return E(inner.t, inner.j, { u: inner.u, c: inner.c });
        case 'neg':
            return this.negate(this.value(this.expr(node.arg)), node);
        case 'not':
            return this.not(this.expr(node.arg), node);
        case 'bin':
            return this.binary(node);
        case 'ref':
            return this.reference(node);
        case 'array':
            this.fail('Expected: expression', node);
        }
        this.fail('Expected: expression', node);
    };

    // A BASIC value: true/false are -1 and 0.
    Compiler.prototype.value = function (expression) {
        if (expression.t === 'b') {
            if (expression.c !== undefined)
                return literal(expression.c ? -1 : 0, 'i');
            return E('i', J.cond(expression.j, J.un('-', J.num(1)), J.num(0)));
        }
        return expression;
    };

    // A float after arithmetic - checked for overflow.
    Compiler.prototype.checked = function (expression) {
        expression = this.value(expression);
        if (!expression.u)
            return expression;
        return E(expression.t, J.method(J.id('$B'), 'fin', [expression.j]), { c: expression.c });
    };

    Compiler.prototype.numeric = function (expression, node) {
        expression = this.value(expression);
        if (expression.t === 'o')
            return E('d', J.method(J.id('$B'), 'on', [expression.j]));
        if (!isNumeric(expression.t))
            this.fail('Type mismatch', node);
        return expression;
    };

    Compiler.prototype.string = function (expression, node) {
        if (expression.t === 'o')
            return E('s', J.method(J.id('$B'), 'os', [expression.j]));
        if (expression.t !== 's')
            this.fail('Type mismatch', node);
        return expression;
    };

    // A value converted to a type (assignment, argument): rounding to an
    // integer with a check, SINGLE through Math.fround.
    Compiler.prototype.convert = function (expression, type, node, length) {
        expression = this.value(expression);
        if (typeof type !== 'string') {
            if (expression.t !== type)
                this.fail('Type mismatch', node);
            return expression;
        }
        if (type === 'o')
            return this.toJsValue(expression, node);
        if (type === 's') {
            expression = this.string(expression, node);
            if (length > 0)
                return E('s', J.call(J.path('$B.fixed'), [expression.j, J.num(length)]));
            return expression;
        }
        expression = this.numeric(expression, node);
        if (expression.c !== undefined && expression.t !== 'o') {
            var constant = expression.c;
            return this.fold(function () { return literal(constantValue(constant, type), type); }, node, type);
        }
        var from = expression.t;
        switch (type) {
        case 'i':
            if (from === 'i')
                return expression;
            if (from === 'l')
                return E('i', this.rangeCheck(expression.j, 'i'));
            return E('i', J.method(J.id('$B'), 'cint', [expression.j]));
        case 'l':
            if (from === 'i' || from === 'l')
                return E('l', expression.j);
            return E('l', J.method(J.id('$B'), 'clng', [expression.j]));
        case 'f':
            if (from === 'f')
                return this.checked(expression);
            if (from === 'i')
                return E('f', expression.j);
            if (from === 'l')
                return E('f', J.call(J.path('Math.fround'), [expression.j]));
            return E('f', J.method(J.id('$B'), 'csng', [expression.j]));
        case 'd':
            return E('d', this.checked(expression).j);
        }
        this.fail('Type mismatch', node);
    };

    // A constant converted to a type; an error is a BasicError.
    function constantValue(value, type) {
        switch (type) {
        case 'i': return Basic.cint(value);
        case 'l': return Basic.clng(value);
        case 'f': return Basic.csng(value);
        }
        return value;
    }

    // Range check of an integer: (temporary = x) > max || temporary < min ? ov() : temporary.
    Compiler.prototype.rangeCheck = function (node, kind) {
        var limits = LIMITS[kind];
        var temporary = J.id(this.temp());
        return J.cond(J.or(J.bin('>', J.assign(temporary, node), J.num(limits[1])),
                           J.bin('<', temporary, J.un('-', J.num(-limits[0])))),
                      J.method(J.id('$B'), 'ov', []), temporary);
    };

    Compiler.prototype.negate = function (expression, node) {
        if (expression.t === 'o')
            expression = this.numeric(expression, node);
        if (!isNumeric(expression.t))
            this.fail('Type mismatch', node);
        if (expression.c !== undefined) {
            var value = -expression.c;
            if (expression.t === 'i' && value > 32767 || expression.t === 'l' && value > 2147483647)
                return E(expression.t, J.method(J.id('$B'), 'e', [J.num(6)]));
            return literal(value === 0 ? 0 : value, expression.t);
        }
        if (expression.t === 'i' || expression.t === 'l') {
            var limit = expression.t === 'i' ? 32768 : 2147483648;
            var temporary = J.id(this.temp());
            return E(expression.t, J.cond(J.bin('===', J.assign(temporary, expression.j), J.un('-', J.num(limit))), J.method(J.id('$B'), 'ov', []),
                                          J.bin('-', J.num(0), temporary)));
        }
        return E(expression.t, J.un('-', expression.j), { u: expression.u });
    };

    // Logical operations: bitwise on integers; on comparisons - JavaScript
    // booleans without short-circuit evaluation (both sides always).
    Compiler.prototype.not = function (expression, node) {
        if (expression.t === 'b')
            return E('b', T.negate(expression.j), { c: expression.c === undefined ? undefined : !expression.c });
        var operand = this.toInteger(expression, node);
        if (operand.c !== undefined)
            return literal(~operand.c, operand.t);
        return E(operand.t, J.un('~', operand.j));
    };

    // An integer for a logical operation: INTEGER or LONG, a float is rounded.
    Compiler.prototype.toInteger = function (expression, node, wide) {
        expression = this.numeric(this.value(expression), node);
        var target = expression.t === 'i' && !wide ? 'i' : 'l';
        return this.convert(expression, target, node);
    };

    var COMPARE = { '=': '===', '<>': '!==', '<': '<', '>': '>', '<=': '<=', '>=': '>=' };
    var LOGICAL = { AND: true, OR: true, XOR: true, EQV: true, IMP: true };

    Compiler.prototype.binary = function (node) {
        var op = node.op;
        if (LOGICAL[op])
            return this.logical(node);
        var left = this.value(this.expr(node.left));
        var right = this.value(this.expr(node.right));
        if (COMPARE[op] !== undefined)
            return this.compare(op, left, right, node);
        if (op === '+' && (left.t === 's' || right.t === 's'))
            return this.concat(left, right, node);
        if (op === '+' && left.t === 'o' && right.t === 'o')
            return E('o', J.method(J.id('$B'), 'oadd', [left.j, right.j]));
        left = this.numeric(left, node);
        right = this.numeric(right, node);
        switch (op) {
        case '+':
        case '-':
        case '*':
            return this.arithmetic(op, left, right, node);
        case '/':
            return this.divide(left, right, node);
        case '\\':
        case 'MOD':
            return this.integerDivide(op, left, right, node);
        case '^':
            return this.power(left, right, node);
        }
        this.fail('Syntax error', node);
    };

    // The type of the result: the larger of the operands.
    function widest(left, right) {
        return RANK[left] >= RANK[right] ? left : right;
    }

    // Constant folding; an error (division by zero, overflow) happens at
    // run time, as in QBasic: ON ERROR can catch it.
    Compiler.prototype.fold = function (callback, node, type) {
        try {
            return callback();
        } catch (error) {
            if (error instanceof Basic.BasicError)
                return E(type || 'd', J.method(J.id('$B'), 'e', [J.num(error.code)]));
            throw error;
        }
    };

    // An operand converted to a float type: LONG to SINGLE is rounded.
    Compiler.prototype.toFloat = function (expression, type) {
        if (type === 'f' && expression.t === 'l')
            return J.call(J.path('Math.fround'), [expression.j]);
        if (type === 'f' && expression.t === 'd')
            return J.method(J.id('$B'), 'csng', [expression.j]);
        return expression.j;
    };

    Compiler.prototype.arithmetic = function (op, left, right, node) {
        var type = widest(left.t, right.t);
        var self = this;
        if (left.c !== undefined && right.c !== undefined) {
            return this.fold(function () {
                var leftConstant = left.c, rightConstant = right.c;
                var result = op === '+' ? leftConstant + rightConstant
                    : (op === '-' ? leftConstant - rightConstant : leftConstant * rightConstant);
                if ((type === 'i' || type === 'l') && result !== constantValue(result, type))
                    Basic.fail(6);
                if (type === 'f')
                    return literal(Basic.csng(result), 'f');
                return literal(type === 'd' ? Basic.finite(result) : result, type);
            }, node, type);
        }
        if (type === 'i' || type === 'l')
            return E(type, this.rangeCheck(J.bin(op, left.j, right.j), type));
        var leftFloat = this.toFloat(left, type), rightFloat = this.toFloat(right, type);
        var operation = J.bin(op, leftFloat, rightFloat);
        if (type === 'f')
            operation = J.call(J.path('Math.fround'), [operation]);
        return E(type, operation, { u: true });
    };

    // "/": SINGLE if the operands are INTEGER and SINGLE; DOUBLE if there is
    // a LONG or a DOUBLE.
    function divisionType(left, right) {
        return left === 'd' || right === 'd' || left === 'l' || right === 'l' ? 'd' : 'f';
    }

    Compiler.prototype.divide = function (left, right, node) {
        var type = divisionType(left.t, right.t);
        if (left.c !== undefined && right.c !== undefined) {
            return this.fold(function () {
                if (right.c === 0)
                    Basic.fail(11);
                var quotient = left.c / right.c;
                return literal(type === 'f' ? Basic.csng(quotient) : Basic.finite(quotient), type);
            }, node, type);
        }
        var dividend = this.toFloat(left, type);
        var divisor;
        if (right.c !== undefined && right.c !== 0) {
            divisor = this.toFloat(right, type);
        } else {
            var temporary = J.id(this.temp());
            divisor = J.cond(J.bin('===', J.assign(temporary, this.toFloat(right, type)), J.num(0)),
                             J.method(J.id('$B'), 'dz', []), temporary);
        }
        var operation = J.bin('/', dividend, divisor);
        if (type === 'f')
            operation = J.call(J.path('Math.fround'), [operation]);
        return E(type, operation, { u: true });
    };

    // "\" and MOD: the operands are rounded to integers.
    Compiler.prototype.integerDivide = function (op, left, right, node) {
        var wide = !(left.t === 'i' && right.t === 'i');
        var type = wide ? 'l' : 'i';
        var leftValue = this.convert(left, type, node), rightValue = this.convert(right, type, node);
        if (leftValue.c !== undefined && rightValue.c !== undefined) {
            var runtime = Basic.Runtime.prototype;
            return this.fold(function () {
                var folded = op === 'MOD'
                    ? runtime.mod(leftValue.c, rightValue.c)
                    : runtime.idiv(leftValue.c, rightValue.c, wide);
                return literal(folded, type);
            }, node, type);
        }
        if (op === 'MOD')
            return E(type, J.method(J.id('$B'), 'mod', [leftValue.j, rightValue.j]));
        return E(type, J.method(J.id('$B'), 'idiv', [leftValue.j, rightValue.j, J.bool(wide)]));
    };

    Compiler.prototype.power = function (left, right, node) {
        var type = divisionType(left.t, right.t);
        if (left.c !== undefined && right.c !== undefined) {
            return this.fold(function () {
                var result = Basic.Runtime.prototype.pow(left.c, right.c);
                return literal(type === 'f' ? Basic.csng(result) : Basic.finite(result), type);
            }, node, type);
        }
        var operation = J.method(J.id('$B'), 'pow', [this.toFloat(left, type), this.toFloat(right, type)]);
        if (type === 'f')
            operation = J.call(J.path('Math.fround'), [operation]);
        return E(type, operation, { u: true });
    };

    Compiler.prototype.concat = function (left, right, node) {
        left = this.string(left, node);
        right = this.string(right, node);
        if (left.c !== undefined && right.c !== undefined)
            return literal(left.c + right.c, 's');
        return E('s', J.bin('+', left.j, right.j));
    };

    Compiler.prototype.compare = function (op, left, right, node) {
        var jsOp = COMPARE[op];
        if (left.t === 's' || right.t === 's') {
            left = this.string(left, node);
            right = this.string(right, node);
        } else if (left.t === 'o' && right.t === 'o') {
            return E('b', J.method(J.id('$B'), 'ocmp', [left.j, right.j, J.str(jsOp)]));
        } else {
            left = this.checked(this.numeric(left, node));
            right = this.checked(this.numeric(right, node));
        }
        if (left.c !== undefined && right.c !== undefined) {
            var leftConstant = left.c, rightConstant = right.c;
            var result = op === '=' ? leftConstant === rightConstant
                : op === '<>' ? leftConstant !== rightConstant
                : op === '<' ? leftConstant < rightConstant
                : op === '>' ? leftConstant > rightConstant
                : op === '<=' ? leftConstant <= rightConstant
                : leftConstant >= rightConstant;
            return E('b', J.bool(result), { c: result });
        }
        return E('b', J.bin(jsOp, left.j, right.j));
    };

    Compiler.prototype.logical = function (node) {
        var op = node.op;
        var left = this.expr(node.left);
        var right = this.expr(node.right);
        if (left.t === 'b' && right.t === 'b') {
            var leftNode = left.j, rightNode = right.j;
            if (left.c !== undefined && right.c !== undefined) {
                var leftConstant = left.c, rightConstant = right.c;
                var result = op === 'AND' ? leftConstant && rightConstant
                    : op === 'OR' ? leftConstant || rightConstant
                    : op === 'XOR' ? leftConstant !== rightConstant
                    : op === 'EQV' ? leftConstant === rightConstant
                    : !leftConstant || rightConstant;
                return E('b', J.bool(result), { c: result });
            }
            switch (op) {
            case 'AND': return E('b', J.bin('&', leftNode, rightNode));
            case 'OR': return E('b', J.bin('|', leftNode, rightNode));
            case 'XOR': return E('b', J.bin('^', leftNode, rightNode));
            case 'EQV': return E('b', J.not(J.bin('^', leftNode, rightNode)));
            }
            return E('b', J.bin('|', T.negate(leftNode), rightNode));
        }
        var wide = this.value(left).t !== 'i' || this.value(right).t !== 'i';
        var leftInteger = this.toInteger(left, node, wide), rightInteger = this.toInteger(right, node, wide);
        var type = wide ? 'l' : 'i';
        if (leftInteger.c !== undefined && rightInteger.c !== undefined) {
            var leftBits = leftInteger.c, rightBits = rightInteger.c;
            var value = op === 'AND' ? leftBits & rightBits
                : op === 'OR' ? leftBits | rightBits
                : op === 'XOR' ? leftBits ^ rightBits
                : op === 'EQV' ? ~(leftBits ^ rightBits)
                : ~leftBits | rightBits;
            return literal(value, type);
        }
        switch (op) {
        case 'AND': return E(type, J.bin('&', leftInteger.j, rightInteger.j));
        case 'OR': return E(type, J.bin('|', leftInteger.j, rightInteger.j));
        case 'XOR': return E(type, J.bin('^', leftInteger.j, rightInteger.j));
        case 'EQV': return E(type, J.un('~', J.bin('^', leftInteger.j, rightInteger.j)));
        }
        return E(type, J.bin('|', J.un('~', leftInteger.j), rightInteger.j));
    };

    // The condition of IF, WHILE, UNTIL: a JavaScript boolean.
    Compiler.prototype.condition = function (node) {
        var expression = this.expr(node);
        if (expression.t === 'b')
            return expression.j;
        if (expression.t === 'o')
            return J.method(J.id('$B'), 'otrue', [expression.j]);
        expression = this.checked(this.numeric(expression, node));
        if (expression.c !== undefined)
            return J.bool(expression.c !== 0);
        return J.bin('!==', expression.j, J.num(0));
    };

    // --- References: variables, elements, fields, functions, object members

    // A name with dots: the prefix is a record or an object, then fields.
    Compiler.prototype.splitDotted = function (node) {
        if (node.name.indexOf('.') < 0)
            return null;
        var unit = this.unit;
        var scope = unit.scope;
        var whole = node.name;
        // The whole name is a variable, a constant or an array: so it is.
        if (scope.declared[whole] !== undefined || scope.consts[whole] !== undefined || this.lookupConst(whole) !== null ||
            scope.vars[this.scalarKeyQuiet(scope, whole, node.suffix)] !== undefined ||
            (unit.kind !== 'main' && scope.shared[this.scalarKeyQuiet(scope, whole, node.suffix)] !== undefined) ||
            scope.declaredArrays[whole] !== undefined)
            return null;
        var dot = whole.indexOf('.');
        var head = whole.substring(0, dot);
        var headDisplay = node.display.substring(0, dot);
        var parts = node.display.substring(dot + 1).split('.');
        var base = this.objectBase(head, headDisplay, node);
        if (base === null)
            return null;
        var chain = parts.map(function (part, index) {
            var last = index === parts.length - 1;
            return { name: part, suffix: last ? node.suffix : '', args: last ? node.args : null, line: node.line,
                     column: node.column, source: node.source };
        });
        return { base: base, chain: chain.concat(node.chain) };
    };

    Compiler.prototype.scalarKeyQuiet = function (scope, name, suffix) {
        if (suffix !== '')
            return name + '|' + SUFFIXES[suffix];
        if (scope.declared[name] !== undefined)
            return scope.declared[name];
        if (scope !== this.module && this.module.declared[name] !== undefined && this.isGlobal(this.module.declared[name]))
            return this.module.declared[name];
        return name + '|' + this.unit.deftypes.typeOf(name);
    };

    // The start of a chain "a.b": a record, a JavaScript object, an API name; null - none.
    Compiler.prototype.objectBase = function (name, display, node) {
        var unit = this.unit;
        var scope = unit.scope;
        var declared = scope.declared[name];
        if (declared === undefined && unit.kind !== 'main') {
            var sharedKey = Object.keys(scope.shared).filter(function (key) { return key.split('|')[0] === name; })[0];
            if (sharedKey !== undefined)
                declared = sharedKey;
            else if (this.module.declared[name] !== undefined && this.isGlobal(this.module.declared[name]))
                declared = this.module.declared[name];
        }
        if (declared !== undefined) {
            var type = keyType(declared);
            if (type === 'r' || type === 'o') {
                var variable = this.variable(name, '', display, node);
                return E(variable.type, this.varRef(variable), { variable: variable, lv: true });
            }
            return null;
        }
        if (unit.kind === 'function' && unit.proc.name === name)
            return null;
        var api = this.apiObject(name, node);
        if (api !== null)
            return api;
        return null;
    };

    Compiler.prototype.reference = function (node) {
        if (node.keyword)
            return this.builtinCall(node);
        var dotted = this.splitDotted(node);
        if (dotted !== null)
            return this.chain(dotted.base, dotted.chain, node);
        var base = this.referenceBase(node);
        if (node.chain.length > 0)
            return this.chain(base, node.chain, node);
        return base;
    };

    // A name with or without arguments, without a chain after it.
    Compiler.prototype.referenceBase = function (node) {
        var unit = this.unit;
        var name = node.name, suffix = node.suffix;
        var args = node.args;
        // Built-in functions are reserved names.
        var builtin = Basic.builtins[name + suffix];
        if (builtin !== undefined && !(builtin.soft && this.isUserName(name, suffix, args !== null)))
            return this.builtinCall(node, builtin);
        // DEF FN.
        if (name.substring(0, 2) === 'fn' && unit.scope.vars[this.scalarKeyQuiet(unit.scope, name, suffix)] === undefined) {
            var def = this.lookupProc('fn:' + name);
            if (def === null)
                this.fail('Function not defined', node);
            return this.callProcedure(def, args || [], node, false);
        }
        // FUNCTION (inside itself without arguments it is a call too).
        var proc = this.lookupProc(name);
        if (proc !== null && proc.kind === 'function') {
            if (suffix !== '' && SUFFIXES[suffix] !== proc.type)
                this.fail('Duplicate definition', node);
            return this.callProcedure(proc, args || [], node, false);
        }
        if (proc !== null && proc.kind === 'sub')
            this.fail('Duplicate definition', node);
        var constant = this.lookupConst(name);
        if (constant !== null && args === null) {
            if (suffix !== '' && SUFFIXES[suffix] !== constant.type)
                this.fail('Duplicate definition', node);
            return literal(constant.value, constant.type);
        }
        if (args !== null) {
            // A JavaScript object with arguments: a function call or an element.
            var objectVar = this.objectVariable(name, suffix);
            if (objectVar !== null)
                return E('o', J.method(J.id('$B'), 'ja', [this.varRef(objectVar), J.arr(this.jsArguments(args))]));
            return this.element(node);
        }
        var variable = this.variable(name, suffix, node.display, node);
        return E(variable.type, this.varRef(variable), { variable: variable, lv: true });
    };

    // The object variable (AS OBJECT) with this name or null.
    Compiler.prototype.objectVariable = function (name, suffix) {
        if (suffix !== '')
            return null;
        var scope = this.unit.scope;
        var key = scope.declared[name];
        if (key === undefined && this.unit.kind !== 'main') {
            key = Object.keys(scope.shared).filter(function (candidate) {
                return candidate.split('|')[0] === name;
            })[0];
            if (key !== undefined && keyType(key) === 'o')
                return scope.shared[key];
            var moduleKey = this.module.declared[name];
            if (moduleKey !== undefined && keyType(moduleKey) === 'o' && this.isGlobal(moduleKey))
                return this.module.vars[moduleKey];
            return null;
        }
        if (key === undefined || keyType(key) !== 'o')
            return null;
        return this.variable(name, '', name, {});
    };

    // A user name (variable, array) that hides a soft API name.
    Compiler.prototype.isUserName = function (name, suffix, withArgs) {
        var unit = this.unit;
        var scope = unit.scope;
        if (withArgs)
            return scope.declaredArrays[name] !== undefined || scope.arrays[this.scalarKeyQuiet(scope, name, suffix)] !== undefined ||
                unit.assigned[name] === 'array';
        return scope.declared[name] !== undefined || unit.assigned[name] === 'scalar' ||
            scope.vars[this.scalarKeyQuiet(scope, name, suffix)] !== undefined;
    };

    // An array element: { e, lvalue }.
    Compiler.prototype.element = function (node) {
        var lv = this.elementLvalue(node);
        return E(lv.type, J.seq(lv.setup.concat([lv.get])), { lvalue: lv, lv: true });
    };

    // Indices converted to integers: floats are rounded.
    Compiler.prototype.subscript = function (arg) {
        if (arg.k === 'array')
            this.fail('Expected: expression', arg);
        var expression = this.numeric(this.value(this.expr(arg)), arg);
        if (expression.t === 'i' || expression.t === 'l')
            return expression.j;
        return this.convert(expression, 'l', arg).j;
    };

    // A place to assign to: { type, length, setup: [expressions], get, set(j) }.
    Compiler.prototype.elementLvalue = function (node) {
        var array = this.array(node.name, node.suffix, node.display, node, node.args.length, true);
        var ref = this.arrayRef(array);
        var setup = [];
        var index;
        var self = this;
        if (node.args.length === 1) {
            var subscript = this.subscript(node.args[0]);
            var offset = J.id(this.temp());
            // (offset = i - a.l0) >>> 0 < a.n0 ? offset : $B.sub()
            index = J.cond(J.bin('<', J.bin('>>>', J.assign(offset, J.bin('-', subscript, J.mem(ref, 'l0'))), J.num(0)),
                                 J.mem(ref, 'n0')),
                           offset, J.method(J.id('$B'), 'sub', []));
        } else if (node.args.length === 2) {
            index = J.method(ref, 'ix2', [this.subscript(node.args[0]), this.subscript(node.args[1])]);
        } else {
            index = J.method(ref, 'index', [J.arr(node.args.map(function (arg) { return self.subscript(arg); }))]);
        }
        var slot = J.id(this.temp());
        setup.push(J.assign(slot, index));
        var cell = J.idx(J.mem(ref, 'd'), slot);
        return {
            type: array.type, length: array.length, setup: setup, get: cell, array: array,
            set: function (value) { return J.assign(cell, value); }
        };
    };

    // A chain of ".field" and ".member(...)" after the base.
    Compiler.prototype.chain = function (base, chain, node) {
        var current = base;
        for (var index = 0; index < chain.length; ++index) {
            var link = chain[index];
            if (current.t === 'o') {
                current = this.member(current, link);
                continue;
            }
            if (typeof current.t === 'string')
                this.fail('Expected: end-of-statement', link);
            var field = this.field(current.t, link.name.toLowerCase(), link);
            if (link.suffix !== '' && SUFFIXES[link.suffix] !== field.type)
                this.fail('Type mismatch', link);
            if (link.args !== null) {
                if (field.type !== 'o')
                    this.fail('Expected: end-of-statement', link);
                var holder = J.mem(current.j, field.js);
                current = E('o', J.method(J.id('$B'), 'ja', [holder, J.arr(this.jsArguments(link.args))]));
                continue;
            }
            current = E(field.type, J.mem(current.j, field.js), { field: field, lv: true, holder: current });
        }
        return current;
    };

    // A member of a JavaScript object: a property or a method call.
    Compiler.prototype.member = function (object, link) {
        var name = link.name;
        if (link.args !== null)
            return E('o', J.method(J.id('$B'), 'jc', [object.j, J.str(name), J.arr(this.jsArguments(link.args))]),
                     { call: true });
        return E('o', J.method(J.id('$B'), 'jg', [object.j, J.str(name)]), { member: { object: object, name: name } });
    };

    // Arguments for JavaScript: numbers, strings, objects; a whole BASIC
    // array becomes a JavaScript array, a record becomes an object.
    Compiler.prototype.jsArguments = function (args) {
        var self = this;
        return args.map(function (arg) {
            if (arg.k === 'array') {
                var array = self.array(arg.name, arg.suffix, arg.display, arg, -1, false);
                if (array === null)
                    self.fail('Array not defined', arg);
                return J.method(J.id('$B'), 'arrayToJs', [self.arrayRef(array)]);
            }
            return self.toJsValue(self.expr(arg), arg).j;
        });
    };

    Compiler.prototype.toJsValue = function (expression, node) {
        expression = this.value(expression);
        if (expression.t === 'o')
            return expression;
        if (expression.t === 's')
            return E('o', expression.j);
        if (isNumeric(expression.t))
            return E('o', this.checked(expression).j);
        return E('o', J.method(J.id('$B'), 'recordToJs', [expression.j, this.constant(expression.t)]));
    };

    // --- Places to assign to

    // A place by reference (LET, INPUT, READ, SWAP, an argument by reference).
    Compiler.prototype.lvalue = function (node) {
        if (node.k !== 'ref')
            this.fail('Expected: variable', node);
        var unit = this.unit;
        var self = this;
        // The result of a function inside the function.
        if (unit.proc !== null && (unit.kind === 'function' || unit.kind === 'def') && node.name === unit.proc.name &&
            node.args === null && node.chain.length === 0) {
            if (node.suffix !== '' && SUFFIXES[node.suffix] !== unit.proc.type)
                this.fail('Duplicate definition', node);
            var result = J.id('$r');
            return { type: unit.proc.type, length: 0, setup: [], get: result,
                     set: function (value) { return J.assign(result, value); } };
        }
        if (Basic.builtins[node.name + node.suffix] !== undefined && !Basic.builtins[node.name + node.suffix].soft)
            this.fail('Expected: variable', node);
        if (this.lookupConst(node.name) !== null && node.chain.length === 0 && node.args === null)
            this.fail('Duplicate definition', node);
        var proc = this.lookupProc(node.name);
        if (proc !== null && node.chain.length === 0)
            this.fail('Duplicate definition', node);
        var expression = this.reference(node);
        if (expression.lvalue !== undefined)
            return expression.lvalue;
        if (expression.member !== undefined) {
            var holder = expression.member;
            return { type: 'o', length: 0, setup: [], get: expression.j, member: true,
                     set: function (value) {
                         return J.method(J.id('$B'), 'js', [holder.object.j, J.str(holder.name), value]);
                     } };
        }
        if (expression.field !== undefined) {
            var field = expression.field;
            var temporary = J.id(this.temp());
            var cell = J.mem(temporary, field.js);
            var setup = [J.assign(temporary, expression.holder.lvalue !== undefined ? J.seq(expression.holder.lvalue.setup.concat([expression.holder.lvalue.get]))
                                                                    : expression.holder.j)];
            return { type: field.type, length: field.length, setup: setup, get: cell,
                     set: function (value) { return J.assign(cell, value); } };
        }
        if (expression.variable !== undefined) {
            var variable = expression.variable;
            var ref = this.varRef(variable);
            return { type: variable.type, length: variable.length, setup: [], get: ref, variable: variable,
                     set: function (value) { return J.assign(ref, value); } };
        }
        if (expression.call)
            this.fail('Expected: =', node);
        this.fail('Expected: variable', node);
    };

    // Assigns a value to a place: records are copied field by field.
    Compiler.prototype.assignTo = function (lv, expression, node) {
        if (typeof lv.type !== 'string') {
            expression = this.value(expression);
            if (expression.t !== lv.type)
                this.fail('Type mismatch', node);
            return J.seq(lv.setup.concat([J.method(this.constant(lv.type), 'assign', [lv.get, expression.j])]));
        }
        var value = this.convert(expression, lv.type, node, lv.length);
        return J.seq(lv.setup.concat([lv.set(value.j)]));
    };

    // --- Procedure calls

    // Arguments by reference: the place of the argument, the value after the call is $B.o[i].
    Compiler.prototype.callArguments = function (proc, args, node) {
        if (args.length !== proc.params.length)
            this.fail('Argument-count mismatch', node);
        var self = this;
        var values = [], setup = [], writeback = [];
        proc.params.forEach(function (param, index) {
            var arg = args[index];
            if (param.array) {
                var name = arg.k === 'array' ? arg : (arg.k === 'ref' && arg.args === null && arg.chain.length === 0 ? arg : null);
                if (name === null)
                    self.fail('Parameter type mismatch', arg);
                var array = self.array(name.name, name.suffix, name.display, name, -1, false);
                if (array === null)
                    self.fail('Array not defined', arg);
                if (array.type !== param.type)
                    self.fail('Parameter type mismatch', arg);
                values.push(self.arrayRef(array));
                return;
            }
            if (arg.k === 'array')
                self.fail('Parameter type mismatch', arg);
            if (typeof param.type !== 'string') {
                var record = self.value(self.expr(arg));
                if (record.t !== param.type)
                    self.fail('Parameter type mismatch', arg);
                values.push(record.j);
                return;
            }
            var byReference = !param.byval && arg.k === 'ref' && self.isPlace(arg);
            if (!byReference) {
                values.push(self.convert(self.expr(arg), param.type, arg).j);
                return;
            }
            var lv = self.lvalue(arg);
            if (lv.member)
                return values.push(self.convert(self.expr(arg), param.type, arg).j);
            if (lv.type !== param.type)
                self.fail('Parameter type mismatch', arg);
            setup = setup.concat(lv.setup);
            values.push(lv.get);
            writeback.push({ lv: lv, index: index });
        });
        return { values: values, setup: setup, writeback: writeback };
    };

    // The argument is a variable, an element or a field (not an expression or a call).
    Compiler.prototype.isPlace = function (node) {
        if (node.k !== 'ref' || node.keyword)
            return false;
        if (Basic.builtins[node.name + node.suffix] !== undefined && !Basic.builtins[node.name + node.suffix].soft)
            return false;
        if (this.lookupConst(node.name) !== null && node.args === null)
            return false;
        var proc = this.lookupProc(node.name);
        if (proc !== null)
            return false;
        if (node.name.substring(0, 2) === 'fn' && this.lookupProc('fn:' + node.name) !== null)
            return false;
        if (node.chain.some(function (link) { return link.args !== null; }))
            return false;
        if (node.args !== null && this.objectVariable(node.name, node.suffix) !== null)
            return false;
        var dotted = this.splitDotted(node);
        if (dotted !== null && dotted.base.t === 'o')
            return false;
        return true;
    };

    Compiler.prototype.callTarget = function (proc, async) {
        var fn = J.mem(J.id('$P'), proc.js);
        if (async)
            return J.mem(fn, 'gen');
        return fn;
    };

    // A procedure call in an expression (FUNCTION, DEF FN) or as a statement.
    Compiler.prototype.callProcedure = function (proc, args, node, statement) {
        var unit = this.unit;
        if (proc.kind === 'def' && unit.kind !== 'main' && unit.kind !== 'def')
            this.fail('Function not defined', node);
        this.dependsOn(proc);
        var call = this.callArguments(proc, args, node);
        var async = unit.async && proc.async;
        var invoke = J.call(this.callTarget(proc, async), call.values);
        if (async)
            invoke = J.yield_(invoke, true);
        var outs = J.mem(J.id('$B'), 'o');
        var backs = call.writeback.map(function (item) {
            return item.lv.set(J.idx(outs, J.num(item.index)));
        });
        if (statement)
            return E(proc.type || 'i', J.seq(call.setup.concat([invoke]).concat(backs)), { statementBacks: backs.length });
        if (backs.length === 0 && call.setup.length === 0)
            return E(proc.type, invoke);
        var temporary = J.id(this.temp());
        return E(proc.type, J.seq(call.setup.concat([J.assign(temporary, invoke)]).concat(backs).concat([temporary])));
    };

    // A procedure of this unit calls another one: when its signature
    // changes, the caller is outdated (language.js).
    Compiler.prototype.dependsOn = function (proc) {
        if (this.unit.proc !== null)
            this.unit.calls[proc.key] = proc.signature;
    };
})(globalThis);
