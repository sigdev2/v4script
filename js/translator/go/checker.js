// Go: checking names and types. Marks the parse tree for translation:
// node.type, node.mode ('value', 'var' - addressable, 'const', 'type',
// 'builtin', 'novalue', 'pkg', 'mapindex', 'commaok'), node.value (a
// constant), node.obj (the object of a name) and facts about calls and
// field selections.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    if (Go.Checker)
        return;

    var types = Go.types;
    var G = Go.T;
    var big = T.big;
    var rat = T.rat;
    var CompileError = T.CompileError;

    // --- Scopes

    function Scope(parent, kind) {
        this.parent = parent;
        this.kind = kind;
        this.names = Object.create(null);
    }
    Scope.prototype.lookup = function (name) {
        for (var scope = this; scope !== null; scope = scope.parent) {
            var found = scope.names[name];
            if (found !== undefined)
                return found;
        }
        return null;
    };
    Scope.prototype.lookupLocal = function (name) {
        var found = this.names[name];
        return found === undefined ? null : found;
    };
    Scope.prototype.insert = function (object) {
        this.names[object.name] = object;
    };
    Go.Scope = Scope;

    var universe = new Scope(null, 'universe');
    (function () {
        ['bool', 'string', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8', 'uint16', 'uint32', 'uint64',
         'uintptr', 'float32', 'float64', 'complex64', 'complex128', 'byte', 'rune'].forEach(function (name) {
            universe.insert({ kind: 'typename', name: name, type: types[name] });
        });
        var anyType = G.iface([], []);
        anyType.isAny = true;
        Go.anyType = anyType;
        universe.insert({ kind: 'typename', name: 'any', type: anyType });
        var errorType = G.named('error', '', null);
        errorType.underlying = G.iface([{ name: 'Error', type: G.signature([], [{ name: null, type: types.string }], false) }], []);
        errorType.builtin = true;
        Go.errorType = errorType;
        universe.insert({ kind: 'typename', name: 'error', type: errorType });
        var comparableType = G.named('comparable', '', null);
        comparableType.underlying = G.iface([], []);
        comparableType.underlying.comparable = true;
        universe.insert({ kind: 'typename', name: 'comparable', type: comparableType });
        universe.insert({ kind: 'const', name: 'true', type: types.untypedBool, value: true });
        universe.insert({ kind: 'const', name: 'false', type: types.untypedBool, value: false });
        universe.insert({ kind: 'iota', name: 'iota' });
        universe.insert({ kind: 'nil', name: 'nil', type: types.untypedNil });
        ['append', 'cap', 'clear', 'close', 'complex', 'copy', 'delete', 'imag', 'len', 'make', 'max', 'min', 'new',
         'panic', 'print', 'println', 'real', 'recover'].forEach(function (name) {
            universe.insert({ kind: 'builtin', name: name });
        });
    })();
    Go.universe = universe;

    // --- The text of an expression for messages

    function exprString(node) {
        if (!node)
            return '';
        switch (node.k) {
        case 'ident':
            return node.name;
        case 'lit':
            if (node.kind === 'string')
                return T.quote(T.utf8.decode(node.value));
            if (node.kind === 'rune')
                return "'" + String.fromCodePoint(node.value) + "'";
            return node.value;
        case 'paren':
            return '(' + exprString(node.x) + ')';
        case 'sel':
            return exprString(node.x) + '.' + node.name;
        case 'index':
            return exprString(node.x) + '[' + node.indices.map(exprString).join(', ') + ']';
        case 'slice':
            return exprString(node.x) + '[' + exprString(node.low) + ':' + exprString(node.high) +
                (node.max ? ':' + exprString(node.max) : '') + ']';
        case 'assert':
            return exprString(node.x) + '.(' + (node.typeExpr ? exprString(node.typeExpr) : 'type') + ')';
        case 'call':
            return exprString(node.fn) + '(' + node.args.map(exprString).join(', ') + (node.ellipsis ? '...' : '') + ')';
        case 'star':
            return '*' + exprString(node.x);
        case 'unary':
            return node.op + exprString(node.x);
        case 'binary':
            return exprString(node.x) + ' ' + node.op + ' ' + exprString(node.y);
        case 'composite':
            return (node.typeExpr.k === 'elided' ? '' : exprString(node.typeExpr)) + '{…}';
        case 'funclit':
            return 'func literal';
        case 'pointer':
            return '*' + exprString(node.elem);
        case 'slicetype':
            return '[]' + exprString(node.elem);
        case 'arraytype':
            return '[' + (node.length ? exprString(node.length) : '...') + ']' + exprString(node.elem);
        case 'maptype':
            return 'map[' + exprString(node.key) + ']' + exprString(node.value);
        case 'chantype':
            return 'chan ' + exprString(node.elem);
        case 'functype':
            return 'func(...)';
        case 'structtype':
            return 'struct{...}';
        case 'interfacetype':
            return 'interface{...}';
        case 'instance':
            return exprString(node.x) + '[' + node.args.map(exprString).join(', ') + ']';
        }
        return node.k;
    }
    Go.exprString = exprString;

    // --- Checking

    function Checker(session, pkg) {
        this.session = session;
        this.pkg = pkg;              // the package being checked
        this.scope = null;
        this.func = null;            // facts about the function whose body is checked
        this.iota = null;
        this.undo = [];
        this.source = pkg.source || '';
        this.functions = [];         // facts about all functions of the unit (for the fiber analysis)
        this.instances = [];         // instances of generic functions created while checking
        this.lastStatement = null;
    }

    Checker.prototype.error = function (node, message) {
        throw new CompileError(message, node ? node.line : 0, node ? node.column : 0, this.source);
    };

    Checker.prototype.typeName = function (type) {
        return G.typeString(type, true).replace(new RegExp('\\b' + this.pkg.name + '\\.', 'g'),
                                                 this.pkg.name === 'main' ? 'main.' : this.pkg.name + '.');
    };

    // "x (variable of type int)" - as in the messages of the Go compiler.
    Checker.prototype.describe = function (node) {
        var text = exprString(node);
        if (node.mode === 'const') {
            if (G.isUntyped(node.type))
                return text + ' (' + node.type.name + ' constant)';
            var value = G.constantString(node.value, node.type);
            return text === value ? text + ' (constant of type ' + this.typeName(node.type) + ')'
                                  : text + ' (constant ' + value + ' of type ' + this.typeName(node.type) + ')';
        }
        if (node.mode === 'novalue')
            return text + ' (no value)';
        if (node.type === types.untypedNil)
            return 'nil';
        var kind = node.mode === 'var' && (node.k === 'ident') ? 'variable' : 'value';
        return text + ' (' + kind + ' of type ' + this.typeName(node.type) + ')';
    };

    Checker.prototype.openScope = function (kind) {
        this.scope = new Scope(this.scope, kind || 'block');
        return this.scope;
    };

    Checker.prototype.closeScope = function () {
        this.scope = this.scope.parent;
    };

    Checker.prototype.declare = function (object, node) {
        if (object.name === '_')
            return object;
        var existing = this.scope.lookupLocal(object.name);
        if (existing !== null && this.scope.kind !== 'package' && this.scope.kind !== 'block-top')
            this.error(node, object.name + ' redeclared in this block');
        this.scope.insert(object);
        return object;
    };

    // A variable of a function: a unique JavaScript name inside the function.
    Checker.prototype.newVar = function (name, type, node) {
        var object = { kind: 'var', name: name, type: type, line: node ? node.line : 0, boxed: false, global: false };
        if (this.func !== null) {
            var used = this.func.jsNames;
            var base = T.jsName(name === '_' ? '_' : name);
            var jsName = base;
            var counter = 1;
            while (used[jsName] !== undefined)
                jsName = base + '$' + (++counter);
            used[jsName] = true;
            object.jsName = jsName;
            object.func = this.func;
        }
        return object;
    };

    Checker.prototype.globalVar = function (name, type, node) {
        return { kind: 'var', name: name, type: type, line: node ? node.line : 0, boxed: false, global: true,
                 pkg: this.pkg, jsName: T.propertyName(name) };
    };

    // --- Types from the tree

    Checker.prototype.resolveType = function (node) {
        var type = this.typeExpr(node);
        return type;
    };

    Checker.prototype.typeExpr = function (node) {
        switch (node.k) {
        case 'ident': {
            var object = this.scope.lookup(node.name);
            if (object === null)
                object = this.implicitPackage(node.name, node);
            if (object === null)
                this.error(node, 'undefined: ' + node.name);
            if (object.kind !== 'typename')
                this.error(node, node.name + ' is not a type');
            if (object.generic && !this.allowGeneric)
                this.error(node, 'cannot use generic type ' + node.name + ' without instantiation');
            node.obj = object;
            return object.type;
        }
        case 'sel': {
            if (node.x.k !== 'ident')
                this.error(node, exprString(node) + ' is not a type');
            var pkgObject = this.lookupPackage(node.x);
            if (pkgObject === null)
                this.error(node, exprString(node) + ' is not a type');
            var member = pkgObject.pkg.scope.lookupLocal(node.name);
            if (member === null || !isExported(node.name))
                this.error(node, 'undefined: ' + exprString(node));
            if (member.kind !== 'typename')
                this.error(node, exprString(node) + ' is not a type');
            return member.type;
        }
        case 'paren':
            return this.typeExpr(node.x);
        case 'pointer':
        case 'star':
            return G.pointer(this.typeExpr(node.elem || node.x));
        case 'slicetype':
            return G.slice(this.typeExpr(node.elem));
        case 'arraytype': {
            if (node.length === null)
                this.error(node, 'invalid use of [...] array (outside a composite literal)');
            return G.array(this.typeExpr(node.elem), this.arrayLength(node.length));
        }
        case 'maptype': {
            var key = this.typeExpr(node.key);
            var value = this.typeExpr(node.value);
            if (!G.comparable(key) && !G.isTypeParam(key))
                this.error(node.key, 'invalid map key type ' + this.typeName(key));
            return G.map(key, value);
        }
        case 'chantype':
            return G.chan(this.typeExpr(node.elem), node.dir);
        case 'functype':
            return this.signatureType(node.signature, null);
        case 'structtype':
            return this.structType(node);
        case 'interfacetype':
            return this.interfaceType(node);
        case 'instance':
        case 'index':
            return this.instantiateType(node);
        }
        this.error(node, exprString(node) + ' is not a type');
    };

    Checker.prototype.arrayLength = function (node) {
        this.expr(node);
        if (node.mode !== 'const' || !G.isInteger(node.type)) {
            if (node.mode === 'const' && G.isFloat(node.type) && rat.isInteger(node.value))
                return big.toFloat(rat.trunc(node.value));
            this.error(node, 'array length ' + exprString(node) + ' must be constant');
        }
        var length = big.toFloat(node.value);
        if (length < 0)
            this.error(node, 'invalid array length ' + exprString(node));
        if (length > 100000000)
            this.error(node, 'array length ' + exprString(node) + ' is too large');
        return length;
    };

    Checker.prototype.signatureType = function (signature, receiver) {
        var self = this;
        var params = signature.params.map(function (param, index) {
            var type = self.typeExpr(param.type);
            if (signature.variadic && index === signature.params.length - 1)
                type = G.slice(type);
            return { name: param.name, type: type };
        });
        var results = signature.results.map(function (result) {
            return { name: result.name, type: self.typeExpr(result.type) };
        });
        return G.signature(params, results, signature.variadic);
    };

    Checker.prototype.structType = function (node) {
        var self = this;
        var fields = [];
        var seen = {};
        node.fields.forEach(function (field) {
            var type = self.typeExpr(field.type);
            if (field.names === null) {
                var base = type.kind === 'pointer' ? type.elem : type;
                var name = base.kind === 'named' ? base.name : (base.kind === 'basic' ? base.name : null);
                if (name === null)
                    self.error(field, 'embedded field type must be a type name');
                if (seen[name])
                    self.error(field, name + ' redeclared');
                seen[name] = true;
                fields.push({ name: name, type: type, embedded: true, tag: field.tag });
            } else {
                field.names.forEach(function (fieldName) {
                    if (fieldName !== '_' && seen[fieldName])
                        self.error(field, fieldName + ' redeclared');
                    seen[fieldName] = true;
                    fields.push({ name: fieldName, type: type, embedded: false, tag: field.tag });
                });
            }
        });
        return G.struct(fields);
    };

    Checker.prototype.interfaceType = function (node) {
        var self = this;
        var methods = node.methods.map(function (method) {
            return { name: method.name, type: self.signatureType(method.signature, null) };
        });
        var embeds = [];
        var terms = null;
        node.embeds.forEach(function (embedded) {
            if (embedded.k === 'union') {
                var unionTerms = embedded.terms.map(function (term) {
                    return { tilde: term.tilde, type: self.typeExpr(term.type) };
                });
                embeds.push({ kind: 'union', terms: unionTerms });
            } else {
                var type = self.typeExpr(embedded);
                if (G.underlying(type).kind !== 'interface')
                    embeds.push({ kind: 'union', terms: [{ tilde: false, type: type }] });
                else
                    embeds.push(type);
            }
        });
        var result = G.iface(methods, embeds.filter(function (item) { return item.kind !== 'union'; }));
        embeds.forEach(function (item) {
            if (item.kind === 'union')
                terms = terms === null ? item.terms : terms.filter(function (term) {
                    return item.terms.some(function (other) { return G.identical(term.type, other.type); });
                });
        });
        result.terms = terms;
        if (embeds.some(function (item) { return item.kind !== 'union' && G.isComparableConstraint(item); }))
            result.comparable = true;
        return result;
    };

    // --- Packages

    function isExported(name) {
        var first = name.charAt(0);
        return first !== first.toLowerCase() && first === first.toUpperCase();
    }
    Go.isExported = isExported;

    Checker.prototype.lookupPackage = function (identifier) {
        var object = this.scope.lookup(identifier.name);
        if (object === null)
            object = this.implicitPackage(identifier.name, identifier);
        if (object === null || object.kind !== 'pkgname')
            return null;
        identifier.obj = object;
        object.used = true;
        return object;
    };

    // A standard library package without import: in a unit fmt.Println
    // works without the line import "fmt".
    Checker.prototype.implicitPackage = function (name, node) {
        var path = this.session.implicitImport(name);
        if (path === null)
            return null;
        var pkg = this.session.importPackage(path, node, this.source);
        var object = { kind: 'pkgname', name: name, pkg: pkg, implicit: true };
        this.fileScope.insert(object);
        return object;
    };

    // --- Constants

    Checker.prototype.constantBinary = function (node, op, left, right, type) {
        var leftValue = left.value, rightValue = right.value;
        if (G.isBoolean(type) || typeof leftValue === 'boolean') {
            switch (op) {
            case '&&':
                return leftValue && rightValue;
            case '||':
                return leftValue || rightValue;
            case '==':
                return leftValue === rightValue;
            case '!=':
                return leftValue !== rightValue;
            }
        }
        if (typeof leftValue === 'string') {
            switch (op) {
            case '+':
                return leftValue + rightValue;
            case '==':
                return leftValue === rightValue;
            case '!=':
                return leftValue !== rightValue;
            case '<':
                return leftValue < rightValue;
            case '<=':
                return leftValue <= rightValue;
            case '>':
                return leftValue > rightValue;
            case '>=':
                return leftValue >= rightValue;
            }
            this.error(node, 'invalid operation: operator ' + op + ' not defined on ' + this.describe(left));
        }
        if (G.isFloat(type) || rat.is(leftValue) || rat.is(rightValue)) {
            var leftRatio = rat.is(leftValue) ? leftValue : rat.fromInt(leftValue);
            var rightRatio = rat.is(rightValue) ? rightValue : rat.fromInt(rightValue);
            switch (op) {
            case '+':
                return rat.add(leftRatio, rightRatio);
            case '-':
                return rat.sub(leftRatio, rightRatio);
            case '*':
                return rat.mul(leftRatio, rightRatio);
            case '/':
                if (rat.sign(rightRatio) === 0)
                    this.error(node, 'invalid operation: division by zero');
                return rat.div(leftRatio, rightRatio);
            case '==':
                return rat.cmp(leftRatio, rightRatio) === 0;
            case '!=':
                return rat.cmp(leftRatio, rightRatio) !== 0;
            case '<':
                return rat.cmp(leftRatio, rightRatio) < 0;
            case '<=':
                return rat.cmp(leftRatio, rightRatio) <= 0;
            case '>':
                return rat.cmp(leftRatio, rightRatio) > 0;
            case '>=':
                return rat.cmp(leftRatio, rightRatio) >= 0;
            }
            this.error(node, 'invalid operation: operator ' + op + ' not defined on ' + this.describe(left));
        }
        switch (op) {
        case '+':
            return big.add(leftValue, rightValue);
        case '-':
            return big.sub(leftValue, rightValue);
        case '*':
            return big.mul(leftValue, rightValue);
        case '/':
            if (big.sign(rightValue) === 0)
                this.error(node, 'invalid operation: division by zero');
            return big.quot(leftValue, rightValue);
        case '%':
            if (big.sign(rightValue) === 0)
                this.error(node, 'invalid operation: division by zero');
            return big.rem(leftValue, rightValue);
        case '&':
            return big.and(leftValue, rightValue);
        case '|':
            return big.or(leftValue, rightValue);
        case '^':
            return big.xor(leftValue, rightValue);
        case '&^':
            return big.andNot(leftValue, rightValue);
        case '==':
            return big.cmp(leftValue, rightValue) === 0;
        case '!=':
            return big.cmp(leftValue, rightValue) !== 0;
        case '<':
            return big.cmp(leftValue, rightValue) < 0;
        case '<=':
            return big.cmp(leftValue, rightValue) <= 0;
        case '>':
            return big.cmp(leftValue, rightValue) > 0;
        case '>=':
            return big.cmp(leftValue, rightValue) >= 0;
        }
        this.error(node, 'invalid operation: operator ' + op + ' not defined on ' + this.describe(left));
    };

    // The value of a constant converted to a type; an error if it does not fit.
    Checker.prototype.representable = function (node, value, type) {
        var result = G.represent(value, type);
        if (result === undefined) {
            if (G.isInteger(type) && rat.is(value) && !rat.isInteger(value))
                this.error(node, 'cannot use ' + exprString(node) + ' (untyped float constant) as ' + this.typeName(type) +
                           ' value in ' + (this.context || 'assignment') + ' (truncated)');
            if (G.isNumeric(type) && (typeof value === 'number' || typeof value === 'object'))
                this.error(node, 'cannot use ' + exprString(node) + ' (untyped ' + (rat.is(value) ? 'float' : 'int') +
                           ' constant ' + G.constantString(value) + ') as ' + this.typeName(type) + ' value in ' +
                           (this.context || 'assignment') + ' (overflows)');
            return undefined;
        }
        return result;
    };

    // --- Untyped values

    // Converts an untyped value to the type target (or to the default
    // type). Returns the text of an error or null.
    Checker.prototype.convertUntyped = function (node, target) {
        if (!G.isUntyped(node.type))
            return null;
        if (node.type === types.untypedNil) {
            var underlyingType = G.underlying(target);
            if (underlyingType.kind === 'pointer' || underlyingType.kind === 'func' ||
                underlyingType.kind === 'slice' || underlyingType.kind === 'map' || underlyingType.kind === 'chan' ||
                underlyingType.kind === 'interface') {
                node.type = target;
                return null;
            }
            return 'cannot use nil as ' + this.typeName(target) + ' value';
        }
        if (G.isUntyped(target) || G.isInterface(target) || G.isTypeParam(target) && G.underlying(target).kind === 'typeparam') {
            var defaulted = G.defaultType(node.type);
            if (G.isInterface(target) || G.isTypeParam(target)) {
                this.setType(node, defaulted);
                return null;
            }
            return null;
        }
        if (node.mode === 'const') {
            var kind = G.constantKind(target);
            var sourceKind = node.type.info;
            if (kind === null || (kind === 'bool') !== (sourceKind === 'bool') ||
                (kind === 'string') !== (sourceKind === 'string') || kind === 'complex')
                return 'cannot use ' + this.describe(node) + ' as ' + this.typeName(target) + ' value';
            var value = this.representable(node, node.value, target);
            if (value === undefined)
                return 'cannot use ' + this.describe(node) + ' as ' + this.typeName(target) + ' value';
            node.value = value;
            this.setType(node, target);
            return null;
        }
        // A non-constant untyped value: a boolean (a comparison) or a shift.
        var targetKind = G.constantKind(target);
        if (node.type === types.untypedBool) {
            if (targetKind !== 'bool')
                return 'cannot use ' + this.describe(node) + ' as ' + this.typeName(target) + ' value';
        } else if (targetKind !== 'int' && targetKind !== 'float') {
            return 'cannot use ' + this.describe(node) + ' as ' + this.typeName(target) + ' value';
        }
        this.setType(node, target);
        return null;
    };

    // A new type for an untyped expression - and for its parts.
    Checker.prototype.setType = function (node, type) {
        node.type = type;
        if (node.mode === 'const')
            return;
        switch (node.k) {
        case 'paren':
            this.setType(node.x, type);
            break;
        case 'unary':
            if (node.op !== '!')
                this.setType(node.x, type);
            break;
        case 'binary':
            if (['==', '!=', '<', '<=', '>', '>='].indexOf(node.op) < 0) {
                if (node.op === '<<' || node.op === '>>') {
                    this.setType(node.x, type);
                } else {
                    this.setType(node.x, type);
                    this.setType(node.y, type);
                }
            }
            break;
        }
    };

    Checker.prototype.defaultUntyped = function (node) {
        if (G.isUntyped(node.type) && node.type !== types.untypedNil) {
            var target = G.defaultType(node.type);
            if (node.mode === 'const') {
                var value = G.represent(node.value, target);
                if (value === undefined)
                    this.error(node, 'cannot use ' + exprString(node) + ' (untyped ' + node.type.info + ' constant ' +
                               G.constantString(node.value) + ') as ' + this.typeName(target) + ' value in ' +
                               (this.context || 'assignment') + ' (overflows)');
                node.value = value;
            }
            this.setType(node, target);
        }
    };

    // --- Assignability

    // Whether the value node can be assigned to a variable of the type
    // target; converts untyped values. context - "assignment", "argument to f"...
    Checker.prototype.assign = function (node, target, context) {
        if (node.mode === 'novalue')
            this.error(node, exprString(node) + ' (no value) used as value');
        if (node.mode === 'type')
            this.error(node, exprString(node) + ' (type) is not an expression');
        if (node.mode === 'builtin')
            this.error(node, exprString(node) + ' (built-in function) must be called');
        if (node.type.kind === 'tuple')
            this.error(node, 'multiple-value ' + exprString(node) + ' (value of type ' + this.typeName(node.type) +
                       ') in single-value context');
        var reason = this.assignable(node, target);
        if (reason !== null) {
            this.error(node, 'cannot use ' + this.describe(node) + ' as ' + this.typeName(target) + ' value in ' +
                       context + (reason ? ': ' + reason : ''));
        }
    };

    Checker.prototype.assignable = function (node, target) {
        var source = node.type;
        if (G.isUntyped(source)) {
            if (G.isInterface(target) && !G.isTypeParam(target) && source !== types.untypedNil) {
                if (G.interfaceMethods(target).length > 0 && !(G.underlying(target).terms !== null))
                    return '';
                this.defaultUntyped(node);
                return null;
            }
            var saved = this.context;
            var error = this.convertUntyped(node, target);
            this.context = saved;
            return error === null ? null : '';
        }
        if (G.identical(source, target))
            return null;
        var su = G.underlying(source), tu = G.underlying(target);
        if (G.identical(su, tu) && (source.kind !== 'named' || target.kind !== 'named') &&
            !G.isTypeParam(source) && !G.isTypeParam(target))
            return null;
        if (tu.kind === 'interface' && !G.isTypeParam(target)) {
            var missing = G.missingMethod(source, target);
            if (missing === null)
                return null;
            if (missing.pointer)
                return this.typeName(source) + ' does not implement ' + this.typeName(target) + ' (method ' + missing.name +
                    ' has pointer receiver)';
            if (missing.wrongType)
                return this.typeName(source) + ' does not implement ' + this.typeName(target) + ' (wrong type for method ' +
                    missing.name + ')';
            return this.typeName(source) + ' does not implement ' + this.typeName(target) + ' (missing method ' +
                missing.name + ')';
        }
        if (su.kind === 'chan' && tu.kind === 'chan' && su.dir === 'both' && G.identical(su.elem, tu.elem) &&
            (source.kind !== 'named' || target.kind !== 'named'))
            return null;
        return '';
    };

    // Whether T(x) can be converted.
    Checker.prototype.convertible = function (node, target) {
        if (node.mode === 'const' && G.isUntyped(node.type)) {
            var su0 = G.underlying(target);
            if (su0.kind === 'basic' && G.isString(target) && G.isInteger(node.type))
                return true;
        }
        if (this.assignable(node, target) === null)
            return true;
        var source = node.type;
        var su = G.underlying(source), tu = G.underlying(target);
        if (G.identical(su, tu))
            return true;
        if (su.kind === 'pointer' && tu.kind === 'pointer' && G.identical(G.underlying(su.elem), G.underlying(tu.elem)))
            return true;
        if (G.isNumeric(source) && G.isNumeric(target))
            return true;
        if (G.isString(target) && (G.isInteger(source) || isByteOrRuneSlice(su)))
            return true;
        if (G.isString(source) && isByteOrRuneSlice(tu))
            return true;
        if (su.kind === 'slice' && tu.kind === 'array' && G.identical(su.elem, tu.elem))
            return true;
        if (su.kind === 'slice' && tu.kind === 'pointer' && G.underlying(tu.elem).kind === 'array' &&
            G.identical(su.elem, G.underlying(tu.elem).elem))
            return true;
        return false;
    };

    function isByteOrRuneSlice(type) {
        if (type.kind !== 'slice')
            return false;
        var elem = G.underlying(type.elem);
        return elem === types.uint8 || elem === types.int32;
    }

    // --- Expressions

    // Checks an expression whose (single) value is needed.
    Checker.prototype.value = function (node, expected) {
        this.expr(node, expected);
        if (node.mode === 'novalue')
            this.error(node, exprString(node) + ' (no value) used as value');
        if (node.mode === 'type')
            this.error(node, exprString(node) + ' (type) is not an expression');
        if (node.mode === 'builtin')
            this.error(node, exprString(node) + ' (built-in function) must be called');
        if (node.mode === 'pkg')
            this.error(node, 'use of package ' + node.name + ' without selector');
        if (node.type.kind === 'tuple')
            this.error(node, 'multiple-value ' + exprString(node) + ' (value of type ' + this.typeName(node.type) +
                       ') in single-value context');
        if (node.mode === 'commaok' || node.mode === 'mapindex')
            node.mode = node.mode === 'mapindex' ? 'mapindex' : 'value';
        return node;
    };

    Checker.prototype.expr = function (node, expected) {
        if (node.checked === true)
            return node;
        this.exprOnce(node, expected);
        node.checked = true;
        return node;
    };

    Checker.prototype.exprOnce = function (node, expected) {
        switch (node.k) {
        case 'ident':
            return this.identifier(node);
        case 'lit':
            return this.literal(node);
        case 'paren':
            this.expr(node.x, expected);
            node.mode = node.x.mode === 'var' || node.x.mode === 'mapindex' ? 'value' : node.x.mode;
            if (node.x.mode === 'var')
                node.mode = 'var';
            node.type = node.x.type;
            node.value = node.x.value;
            node.obj = node.x.obj;
            return node;
        case 'funclit':
            return this.funcLiteral(node);
        case 'composite':
            return this.composite(node, expected);
        case 'sel':
            return this.selector(node);
        case 'index':
            return this.index(node);
        case 'slice':
            return this.sliceExpr(node);
        case 'assert':
            return this.assertion(node);
        case 'call':
            return this.call(node);
        case 'star':
            return this.star(node);
        case 'unary':
            return this.unary(node, expected);
        case 'binary':
            return this.binary(node, expected);
        case 'pointer':
        case 'slicetype':
        case 'arraytype':
        case 'maptype':
        case 'chantype':
        case 'functype':
        case 'structtype':
        case 'interfacetype':
        case 'instance':
            node.mode = 'type';
            node.type = this.typeExpr(node);
            return node;
        case 'elided':
            this.error(node, 'invalid composite literal type');
        }
        this.error(node, 'unexpected ' + node.k);
    };

    Checker.prototype.identifier = function (node) {
        if (node.name === '_')
            this.error(node, 'cannot use _ as value');
        var object = this.scope.lookup(node.name);
        if (object === null)
            object = this.implicitPackage(node.name, node);
        if (object === null)
            this.error(node, 'undefined: ' + node.name);
        node.obj = object;
        switch (object.kind) {
        case 'var':
            node.mode = 'var';
            node.type = object.type;
            object.used = true;
            if (this.func !== null && object.func !== undefined && object.func !== this.func && !object.global)
                object.captured = true;
            break;
        case 'const':
            node.mode = 'const';
            node.type = object.type;
            node.value = object.value;
            break;
        case 'iota':
            if (this.iota === null)
                this.error(node, 'cannot use iota outside constant declaration');
            node.mode = 'const';
            node.type = types.untypedInt;
            node.value = this.iota;
            break;
        case 'typename':
            node.mode = 'type';
            node.type = object.type;
            if (object.generic)
                node.generic = object;
            break;
        case 'func':
            node.mode = 'value';
            node.type = object.type;
            if (object.generic)
                node.generic = object;
            else
                this.noteCall(object);
            break;
        case 'builtin':
            node.mode = 'builtin';
            node.type = types.invalid;
            break;
        case 'nil':
            node.mode = 'value';
            node.type = types.untypedNil;
            break;
        case 'pkgname':
            node.mode = 'pkg';
            node.type = types.invalid;
            object.used = true;
            break;
        }
        return node;
    };

    Checker.prototype.literal = function (node) {
        node.mode = 'const';
        // The text of a literal stays in raw: a copy (a repeated constant, a
        // generic instance) is checked again.
        if (node.raw === undefined)
            node.raw = node.value;
        node.value = node.raw;
        switch (node.kind) {
        case 'int': {
            var text = node.value.replace(/_/g, '');
            var value;
            if (/^0[xX]/.test(text))
                value = big.parse(text.substring(2), 16);
            else if (/^0[bB]/.test(text))
                value = big.parse(text.substring(2), 2);
            else if (/^0[oO]/.test(text))
                value = big.parse(text.substring(2), 8);
            else if (/^0[0-7]+$/.test(text))
                value = big.parse(text.substring(1), 8);
            else
                value = big.parse(text, 10);
            if (value === null)
                this.error(node, 'invalid number literal ' + node.value);
            node.type = types.untypedInt;
            node.value = value;
            break;
        }
        case 'float': {
            // A constant is an exact fraction: 0.1 + 0.2 == 0.3, as in Go.
            var exact = rat.parse(node.value);
            if (exact === null)
                this.error(node, 'invalid floating-point literal ' + node.value);
            node.type = types.untypedFloat;
            node.value = exact;
            break;
        }
        case 'imag':
            this.error(node, 'complex numbers are not supported');
            break;
        case 'rune':
            node.type = types.untypedRune;
            node.value = node.value;
            break;
        case 'string':
            node.type = types.untypedString;
            node.value = node.value;
            break;
        }
        return node;
    };

    // --- Functions

    function FunctionInfo(parent, signature, node, name) {
        this.parent = parent;
        this.signature = signature;
        this.node = node;
        this.name = name || '';
        this.jsNames = Object.create(null);
        this.blocking = false;     // has channels, select, waits
        this.calls = [];           // the objects of functions called directly
        this.literals = [];        // nested function literals
        this.hasDefer = false;
        this.hasRecover = false;
        this.dynamicCalls = false; // calls of function values and interface methods
        this.async = false;
        this.results = [];         // the objects of named results
        this.labels = Object.create(null);
    }
    Go.FunctionInfo = FunctionInfo;

    Checker.prototype.noteCall = function (object) {
        if (this.func !== null && object.kind === 'func')
            this.func.calls.push(object);
    };

    // The body of a function: parameters, results, statements.
    Checker.prototype.functionBody = function (info, signatureNode, receiver, body) {
        var savedFunc = this.func;
        var savedScope = this.scope;
        var savedLast = this.lastStatement;
        this.func = info;
        this.functions.push(info);
        this.openScope('function');
        var self = this;
        info.params = [];
        if (receiver !== null) {
            var receiverVar = this.newVar(receiver.name || '_', receiver.type, receiver.node);
            receiverVar.receiver = true;
            this.declare(receiverVar, receiver.node);
            info.receiver = receiverVar;
        }
        info.signature.params.forEach(function (param, index) {
            var object = self.newVar(param.name || '_', param.type, signatureNode ? signatureNode.params[index] : null);
            object.param = true;
            info.params.push(object);
            if (param.name !== null)
                self.declare(object, signatureNode.params[index]);
        });
        info.signature.results.forEach(function (result, index) {
            if (result.name === null)
                return;
            var object = self.newVar(result.name, result.type, signatureNode ? signatureNode.results[index] : null);
            object.result = true;
            info.results.push(object);
            self.declare(object, signatureNode.results[index]);
        });
        this.statementList(body.list);
        if (info.signature.results.length > 0 && !this.isTerminatingList(body.list))
            this.error({ line: body.endLine, column: 1 }, 'missing return');
        this.scope = savedScope;
        this.func = savedFunc;
        this.lastStatement = savedLast;
    };

    Checker.prototype.funcLiteral = function (node) {
        var signature = this.signatureType(node.signature, null);
        var info = new FunctionInfo(this.func, signature, node, 'func literal');
        if (this.func !== null)
            this.func.literals.push(info);
        node.info = info;
        this.functionBody(info, node.signature, null, node.body);
        node.mode = 'value';
        node.type = signature;
        return node;
    };

    // --- Composite literals

    Checker.prototype.composite = function (node, expected) {
        var type;
        if (node.typeExpr.k === 'elided') {
            if (expected === undefined || expected === null)
                this.error(node, 'invalid composite literal type: missing type');
            type = expected;
            if (G.underlying(type).kind === 'pointer') {
                // []*T{{...}} - the element &T{...}
                node.addressOf = true;
                type = G.underlying(type).elem;
            }
        } else if (node.typeExpr.k === 'arraytype' && node.typeExpr.length === null) {
            var elem = this.typeExpr(node.typeExpr.elem);
            type = G.array(elem, this.literalLength(node));
        } else {
            type = this.typeExpr(node.typeExpr);
        }
        node.litType = type;
        var underlyingType = G.underlying(type);
        var self = this;
        switch (underlyingType.kind) {
        case 'struct': {
            if (node.elements.length > 0 && node.elements[0].key !== null) {
                var seen = {};
                node.elements.forEach(function (element) {
                    if (element.key === null || element.key.k !== 'ident')
                        self.error(element.value, 'mixture of field:value and value elements in struct literal');
                    var name = element.key.name;
                    var fieldIndex = -1;
                    underlyingType.fields.forEach(function (field, index) {
                        if (field.name === name)
                            fieldIndex = index;
                    });
                    if (fieldIndex < 0)
                        self.error(element.key, 'unknown field ' + name + ' in struct literal of type ' + self.typeName(type));
                    if (seen[name])
                        self.error(element.key, 'duplicate field name ' + name + ' in struct literal');
                    seen[name] = true;
                    element.fieldIndex = fieldIndex;
                    self.element(element.value, underlyingType.fields[fieldIndex].type, 'struct literal');
                });
            } else {
                if (node.elements.length > 0 && node.elements.length !== underlyingType.fields.length)
                    this.error(node.elements.length < underlyingType.fields.length
                                   ? node
                                   : node.elements[underlyingType.fields.length].value,
                               (node.elements.length < underlyingType.fields.length ? 'too few' : 'too many') +
                               ' values in struct literal of type ' + this.typeName(type));
                node.elements.forEach(function (element, index) {
                    if (element.key !== null)
                        self.error(element.value, 'mixture of field:value and value elements in struct literal');
                    element.fieldIndex = index;
                    self.element(element.value, underlyingType.fields[index].type, 'struct literal');
                });
            }
            break;
        }
        case 'array':
        case 'slice': {
            var index = 0;
            var max = 0;
            var used = {};
            node.elements.forEach(function (element) {
                if (element.key !== null) {
                    self.value(element.key);
                    if (element.key.mode !== 'const' || !G.isInteger(element.key.type) && !(G.isFloat(element.key.type) && rat.isInteger(element.key.value)))
                        self.error(element.key, 'index ' + exprString(element.key) + ' must be integer constant');
                    index = big.toFloat(rat.is(element.key.value) ? rat.trunc(element.key.value) : element.key.value);
                }
                if (underlyingType.kind === 'array' && index >= underlyingType.length)
                    self.error(element.value, 'index ' + index + ' out of bounds [0:' + underlyingType.length + ']');
                if (used[index])
                    self.error(element.value, 'duplicate index ' + index + ' in array or slice literal');
                used[index] = true;
                element.index = index;
                self.element(element.value, underlyingType.elem, 'array or slice literal');
                ++index;
                max = Math.max(max, index);
            });
            node.length = underlyingType.kind === 'array' ? underlyingType.length : max;
            break;
        }
        case 'map':
            node.elements.forEach(function (element) {
                if (element.key === null)
                    self.error(element.value, 'missing key in map literal');
                self.element(element.key, underlyingType.key, 'map literal');
                self.element(element.value, underlyingType.elem, 'map literal');
            });
            break;
        default:
            this.error(node, 'invalid composite literal type ' + this.typeName(type));
        }
        node.mode = 'value';
        node.type = node.addressOf ? G.pointer(type) : type;
        return node;
    };

    Checker.prototype.literalLength = function (node) {
        var index = 0, max = 0;
        var self = this;
        node.elements.forEach(function (element) {
            if (element.key !== null) {
                self.value(element.key);
                if (element.key.mode !== 'const')
                    self.error(element.key, 'index must be non-negative integer constant');
                index = big.toFloat(rat.is(element.key.value) ? rat.trunc(element.key.value) : element.key.value);
            }
            ++index;
            max = Math.max(max, index);
        });
        return max;
    };

    Checker.prototype.element = function (node, type, context) {
        if (node.k === 'composite' && node.typeExpr.k === 'elided') {
            this.composite(node, type);
            this.assign(node, type, context);
            return;
        }
        this.value(node, type);
        this.assign(node, type, context);
    };

    // --- Selection of a field, a method, a package name

    Checker.prototype.selector = function (node) {
        if (node.x.k === 'ident') {
            var object = this.scope.lookup(node.x.name);
            if (object === null)
                object = this.implicitPackage(node.x.name, node.x);
            if (object !== null && object.kind === 'pkgname') {
                object.used = true;
                node.x.obj = object;
                var member = object.pkg.scope.lookupLocal(node.name);
                if (member === null || !isExported(node.name))
                    this.error(node, 'undefined: ' + node.x.name + '.' + node.name);
                node.selKind = 'qualified';
                node.obj = member;
                node.pkg = object.pkg;
                switch (member.kind) {
                case 'var':
                    node.mode = 'var';
                    node.type = member.type;
                    break;
                case 'const':
                    node.mode = 'const';
                    node.type = member.type;
                    node.value = member.value;
                    break;
                case 'typename':
                    node.mode = 'type';
                    node.type = member.type;
                    if (member.generic)
                        node.generic = member;
                    break;
                case 'func':
                    node.mode = 'value';
                    node.type = member.type;
                    if (member.generic)
                        node.generic = member;
                    else
                        this.noteCall(member);
                    break;
                }
                return node;
            }
        }
        this.expr(node.x);
        if (node.x.mode === 'type') {
            // A method expression: T.Method is a function with the receiver
            // as its first parameter.
            var methodType = node.x.type;
            var found = G.lookup(methodType, node.name);
            if (found === null || found.kind !== 'method')
                this.error(node, methodType.kind === 'named' || methodType.kind === 'pointer'
                    ? this.typeName(methodType) + '.' + node.name + ' undefined (type ' + this.typeName(methodType) +
                      ' has no method ' + node.name + ')'
                    : exprString(node) + ' undefined');
            node.selKind = 'methodexpr';
            node.method = found.method;
            node.lookup = found;
            var sig = found.method.type;
            node.mode = 'value';
            node.type = G.signature([{ name: null, type: methodType }].concat(sig.params), sig.results, sig.variadic);
            return node;
        }
        if (node.x.mode === 'pkg')
            this.error(node, 'undefined: ' + exprString(node));
        this.value(node.x);
        var type = node.x.type;
        var result = G.lookup(type, node.name);
        if (result === null) {
            if (G.underlying(type).kind === 'pointer' && G.underlying(G.underlying(type).elem).kind === 'interface')
                this.error(node, exprString(node) + ' undefined (type ' + this.typeName(type) +
                           ' is pointer to interface, not interface)');
            this.error(node, exprString(node) + ' undefined (type ' + this.typeName(type) + ' has no field or method ' +
                       node.name + ')');
        }
        if (result.ambiguous)
            this.error(node, 'ambiguous selector ' + exprString(node));
        node.lookup = result;
        if (result.kind === 'field') {
            node.selKind = 'field';
            node.field = result.field;
            node.type = result.field.type;
            // A field is addressable if x is addressable or the selection goes through a pointer.
            node.mode = (node.x.mode === 'var' || result.indirect || G.underlying(type).kind === 'pointer') ? 'var' : 'value';
            return node;
        }
        node.selKind = 'method';
        node.method = result.method;
        node.mode = 'value';
        node.type = result.method.type;
        if (result.interfaceMethod) {
            node.interfaceMethod = true;
            if (this.func !== null)
                this.func.dynamicCalls = true;
        } else {
            this.noteCall(result.method);
            if (result.method.pointerReceiver && !result.indirect && G.underlying(type).kind !== 'pointer') {
                if (node.x.mode !== 'var')
                    this.error(node, 'cannot call pointer method ' + node.name + ' on ' + this.typeName(type));
                this.markAddressTaken(node.x);
            }
        }
        return node;
    };

    // The variable the place node is part of (a struct field, an array
    // element), or null.
    function rootVariable(node) {
        for (;;) {
            while (node.k === 'paren')
                node = node.x;
            if (node.k === 'ident')
                return node.obj && node.obj.kind === 'var' ? node.obj : null;
            if (node.k === 'sel' && node.selKind === 'field' && !node.lookup.indirect &&
                G.underlying(node.x.type).kind !== 'pointer') {
                node = node.x;
                continue;
            }
            if (node.k === 'index' && node.indexKind === 'array' && !node.derefArray) {
                node = node.x;
                continue;
            }
            return null;
        }
    }
    Go.rootVariable = rootVariable;

    // &x: the variable x must live in a cell (except structs and arrays -
    // their object is the address), and assignments must change it in place.
    Checker.prototype.markAddressTaken = function (node) {
        var inner = node;
        while (inner.k === 'paren')
            inner = inner.x;
        if (inner.k === 'ident' && inner.obj && inner.obj.kind === 'var') {
            var underlyingType = G.underlying(inner.obj.type);
            if (underlyingType.kind !== 'struct' && underlyingType.kind !== 'array' && !inner.obj.global)
                inner.obj.boxed = true;
        }
        var root = rootVariable(node);
        if (root !== null) {
            root.addressTaken = true;
            root.mutated = true;
        }
    };

    // A store to the place node: changes the variable it lives in.
    Checker.prototype.markMutated = function (node) {
        var root = rootVariable(node);
        if (root !== null)
            root.mutated = true;
    };

    // --- Index and slice

    Checker.prototype.index = function (node) {
        this.expr(node.x);
        if (node.x.generic || node.x.mode === 'type')
            return this.instantiateExpr(node);
        this.value(node.x);
        if (node.indices.length > 1)
            this.error(node.indices[1], 'unexpected comma; expecting ]');
        var type = node.x.type;
        var underlyingType = G.underlying(type);
        if (underlyingType.kind === 'pointer' && G.underlying(underlyingType.elem).kind === 'array') {
            node.derefArray = true;
            underlyingType = G.underlying(underlyingType.elem);
        }
        switch (underlyingType.kind) {
        case 'basic':
            if (G.isString(type)) {
                this.indexValue(node.index, node.x.mode === 'const' ? node.x.value.length : -1);
                node.indexKind = 'string';
                if (node.x.mode === 'const' && node.index.mode === 'const') {
                    node.mode = 'const';
                    node.value = node.x.value.charCodeAt(big.toFloat(node.index.value));
                    node.type = types.byte;
                    return node;
                }
                node.mode = 'value';
                node.type = types.byte;
                return node;
            }
            break;
        case 'array':
            this.indexValue(node.index, underlyingType.length);
            node.indexKind = 'array';
            node.mode = node.x.mode === 'var' || node.derefArray ? 'var' : 'value';
            node.type = underlyingType.elem;
            return node;
        case 'slice':
            this.indexValue(node.index, -1);
            node.indexKind = 'slice';
            node.mode = 'var';
            node.type = underlyingType.elem;
            return node;
        case 'map':
            this.value(node.index, underlyingType.key);
            this.assign(node.index, underlyingType.key, 'map index');
            node.indexKind = 'map';
            node.mode = 'mapindex';
            node.type = underlyingType.elem;
            return node;
        }
        this.error(node, 'invalid operation: cannot index ' + this.describe(node.x));
    };

    Checker.prototype.indexValue = function (node, length) {
        this.value(node);
        if (node.mode === 'const') {
            if (G.isUntyped(node.type) && G.isFloat(node.type) && rat.isInteger(node.value)) {
                node.value = rat.trunc(node.value);
                node.type = types.untypedInt;
            }
            if (!G.isInteger(node.type))
                this.error(node, 'invalid argument: index ' + this.describe(node) + ' must be integer');
            if (big.sign(node.value) < 0)
                this.error(node, 'invalid argument: index ' + exprString(node) + ' (constant of type int) must not be negative');
            if (length >= 0 && big.cmp(node.value, length) >= 0)
                this.error(node, 'invalid argument: index ' + exprString(node) + ' out of bounds [0:' + length + ']');
            if (G.isUntyped(node.type))
                this.convertUntyped(node, types.int);
            return;
        }
        if (!G.isInteger(node.type))
            this.error(node, 'invalid argument: index ' + this.describe(node) + ' must be integer');
    };

    Checker.prototype.sliceExpr = function (node) {
        this.value(node.x);
        var type = node.x.type;
        var underlyingType = G.underlying(type);
                if (underlyingType.kind === 'pointer' && G.underlying(underlyingType.elem).kind === 'array') {
            node.derefArray = true;
            underlyingType = G.underlying(underlyingType.elem);
        }
        var self = this;
        [node.low, node.high, node.max].forEach(function (item) {
            if (item !== null)
                self.indexValue(item, -1);
        });
        if (G.isString(type)) {
            if (node.max !== null)
                this.error(node, 'invalid operation: 3-index slice of string');
            node.sliceKind = 'string';
            node.mode = 'value';
            node.type = G.isUntyped(type) ? types.string : type;
            return node;
        }
        if (underlyingType.kind === 'array') {
            if (node.x.mode !== 'var' && !node.derefArray)
                this.error(node, 'invalid operation: ' + exprString(node.x) + ' (slice of unaddressable value)');
            node.sliceKind = 'array';
            node.mode = 'value';
            node.type = G.slice(underlyingType.elem);
            return node;
        }
        if (underlyingType.kind === 'slice') {
            node.sliceKind = 'slice';
            node.mode = 'value';
            node.type = type;
            return node;
        }
        this.error(node, 'cannot slice ' + this.describe(node.x));
    };

    // --- Type assertion

    Checker.prototype.assertion = function (node) {
        this.value(node.x);
        if (!G.isInterface(node.x.type))
            this.error(node.x, 'invalid operation: ' + exprString(node.x) + ' (' + this.describe(node.x).replace(/^[^(]*\(/, '').replace(/\)$/, '') +
                       ') is not an interface');
        if (node.typeExpr === null)
            this.error(node, 'invalid syntax tree: use of .(type) outside type switch');
        var target = this.typeExpr(node.typeExpr);
        this.checkAssertable(node, node.x.type, target);
        node.assertType = target;
        node.mode = 'commaok';
        node.type = target;
        return node;
    };

    Checker.prototype.checkAssertable = function (node, ifaceType, target) {
        if (G.isInterface(target))
            return;
        var missing = G.missingMethod(target, ifaceType);
        if (missing !== null)
            this.error(node, 'impossible type assertion: ' + exprString(node.x || node) + '.(' + this.typeName(target) +
                       ')\n\t' + this.typeName(target) + ' does not implement ' + this.typeName(ifaceType) +
                       ' (missing method ' + missing.name + ')');
    };

    // --- Pointers

    Checker.prototype.star = function (node) {
        this.expr(node.x);
        if (node.x.mode === 'type') {
            node.mode = 'type';
            node.type = G.pointer(node.x.type);
            return node;
        }
        this.value(node.x);
        if (node.x.type === types.untypedNil)
            this.error(node, 'invalid operation: cannot indirect nil');
        var underlyingType = G.underlying(node.x.type);
        if (underlyingType.kind !== 'pointer')
            this.error(node, 'invalid operation: cannot indirect ' + this.describe(node.x));
        node.mode = 'var';
        node.type = underlyingType.elem;
        return node;
    };

    // --- Unary operations

    Checker.prototype.unary = function (node, expected) {
        if (node.op === '&') {
            var operand = node.x;
            while (operand.k === 'paren')
                operand = operand.x;
            if (operand.k === 'composite') {
                this.expr(operand, expected && G.underlying(expected).kind === 'pointer' ? G.underlying(expected).elem : undefined);
                node.mode = 'value';
                node.type = G.pointer(operand.type);
                node.compositeAddress = true;
                return node;
            }
            this.value(node.x);
            if (node.x.mode !== 'var')
                this.error(node, 'invalid operation: cannot take address of ' + this.describe(node.x));
            this.markAddressTaken(node.x);
            node.mode = 'value';
            node.type = G.pointer(node.x.type);
            return node;
        }
        if (node.op === '<-') {
            this.value(node.x);
            var underlyingType = G.underlying(node.x.type);
            if (underlyingType.kind !== 'chan')
                this.error(node, 'invalid operation: cannot receive from non-channel ' + this.describe(node.x));
            if (underlyingType.dir === 'send')
                this.error(node, 'invalid operation: cannot receive from send-only channel ' + this.describe(node.x));
            if (this.func !== null)
                this.func.blocking = true;
            node.mode = 'commaok';
            node.type = underlyingType.elem;
            return node;
        }
        this.value(node.x);
        var type = node.x.type;
        switch (node.op) {
        case '!':
            if (!G.isBoolean(type))
                this.error(node, 'invalid operation: operator ! not defined on ' + this.describe(node.x));
            break;
        case '-':
        case '+':
            if (!G.isNumeric(type))
                this.error(node, 'invalid operation: operator ' + node.op + ' not defined on ' + this.describe(node.x));
            break;
        case '^':
            if (!G.isInteger(type))
                this.error(node, 'invalid operation: operator ^ not defined on ' + this.describe(node.x));
            break;
        }
        node.type = type;
        if (node.x.mode === 'const') {
            node.mode = 'const';
            var value = node.x.value;
            switch (node.op) {
            case '!':
                node.value = !value;
                break;
            case '+':
                node.value = value;
                break;
            case '-':
                node.value = rat.is(value) ? rat.neg(value) : big.neg(value);
                break;
            case '^':
                if (G.isUnsigned(type)) {
                    var bits = { u8: 8, u16: 16, u32: 32, u64: 64 }[G.numKind(type)];
                    node.value = big.xor(value, big.sub(big.pow(2, bits), 1));
                } else {
                    node.value = big.not(value);
                }
                break;
            }
            if (!G.isUntyped(type) && G.represent(node.value, type) === undefined)
                this.error(node, 'constant ' + G.constantString(node.value) + ' overflows ' + this.typeName(type));
            return node;
        }
        node.mode = 'value';
        return node;
    };

    // --- Binary operations

    var COMPARISON = { '==': true, '!=': true, '<': true, '<=': true, '>': true, '>=': true };

    Checker.prototype.binary = function (node, expected) {
        var op = node.op;
        if (op === '<<' || op === '>>')
            return this.shift(node, expected);
        this.value(node.x);
        this.value(node.y);
        var left = node.x, right = node.y;
        if (op === '&&' || op === '||') {
            if (!G.isBoolean(left.type))
                this.error(left, 'invalid operation: operator ' + op + ' not defined on ' + this.describe(left));
            if (!G.isBoolean(right.type))
                this.error(right, 'invalid operation: operator ' + op + ' not defined on ' + this.describe(right));
        }
        if (COMPARISON[op]) {
            this.comparison(node, left, right);
            return node;
        }
        // An untyped value is converted to the type of the other operand.
        this.matchTypes(node, left, right);
        if (!G.identical(left.type, right.type) && !(G.isUntyped(left.type) && G.isUntyped(right.type)))
            this.error(node, 'invalid operation: ' + exprString(node) + ' (mismatched types ' +
                       this.typeName(left.type) + ' and ' + this.typeName(right.type) + ')');
        var type = left.type;
        if (G.isUntyped(left.type) && G.isUntyped(right.type))
            type = untypedRank(left.type) >= untypedRank(right.type) ? left.type : right.type;
        var ok;
        switch (op) {
        case '+':
            ok = G.isNumeric(type) || G.isString(type);
            break;
        case '-':
        case '*':
        case '/':
            ok = G.isNumeric(type);
            break;
        case '%':
        case '&':
        case '|':
        case '^':
        case '&^':
            ok = G.isInteger(type);
            break;
        case '&&':
        case '||':
            ok = G.isBoolean(type);
            break;
        }
        if (G.isTypeParam(type))
            ok = this.typeParamSupports(type, op);
        if (!ok)
            this.error(node, 'invalid operation: operator ' + op + ' not defined on ' + this.describe(left));
        node.type = type;
        if (left.mode === 'const' && right.mode === 'const') {
            node.mode = 'const';
            node.value = this.constantBinary(node, op, left, right, type);
            if (!G.isUntyped(type) && G.represent(node.value, type) === undefined)
                this.error(node, 'constant ' + G.constantString(node.value) + ' overflows ' + this.typeName(type));
            if (!G.isUntyped(type))
                node.value = G.represent(node.value, type);
            return node;
        }
        if ((op === '/' || op === '%') && right.mode === 'const' && G.isInteger(type) && big.sign(right.value) === 0)
            this.error(node, 'invalid operation: division by zero');
        node.mode = 'value';
        return node;
    };

    function untypedRank(type) {
        switch (type) {
        case types.untypedInt:
            return 1;
        case types.untypedRune:
            return 2;
        case types.untypedFloat:
            return 3;
        }
        return 0;
    }

    Checker.prototype.matchTypes = function (node, left, right) {
        var leftUntyped = G.isUntyped(left.type), rightUntyped = G.isUntyped(right.type);
        var error = null;
        if (leftUntyped && !rightUntyped) {
            error = this.convertUntyped(left, right.type);
            if (error !== null)
                this.mismatch(node, left, right);
        } else if (rightUntyped && !leftUntyped) {
            error = this.convertUntyped(right, left.type);
            if (error !== null)
                this.mismatch(node, left, right);
        } else if (leftUntyped && rightUntyped && left.type !== right.type && left.type !== types.untypedNil &&
                   right.type !== types.untypedNil) {
            var leftNumeric = G.isNumeric(left.type), rightNumeric = G.isNumeric(right.type);
            if (leftNumeric && rightNumeric) {
                var target = untypedRank(left.type) >= untypedRank(right.type) ? left.type : right.type;
                if (left.mode === 'const' && target === types.untypedFloat && !rat.is(left.value))
                    left.value = rat.fromInt(left.value);
                if (right.mode === 'const' && target === types.untypedFloat && !rat.is(right.value))
                    right.value = rat.fromInt(right.value);
                left.type = target;
                right.type = target;
            } else {
                this.mismatch(node, left, right);
            }
        }
    };

    Checker.prototype.mismatch = function (node, left, right) {
        if (COMPARISON[node.op] && (left.type === types.untypedNil || right.type === types.untypedNil)) {
            this.error(node, 'invalid operation: ' + exprString(node) + ' (mismatched types ' +
                       (left.type === types.untypedNil ? 'untyped nil' : this.typeName(left.type)) + ' and ' +
                       (right.type === types.untypedNil ? 'untyped nil' : this.typeName(right.type)) + ')');
        }
        var untyped = G.isUntyped(left.type) ? left : right;
        var typed = untyped === left ? right : left;
        if (untyped.mode === 'const' && G.isNumeric(untyped.type) && G.isNumeric(typed.type)) {
            this.error(untyped, 'cannot use ' + exprString(untyped) + ' (untyped ' + untyped.type.info + ' constant' +
                       (untyped.k === 'lit' ? '' : ' ' + G.constantString(untyped.value)) + ') as ' + this.typeName(typed.type) +
                       ' value in ' + (G.isInteger(typed.type) && G.isFloat(untyped.type) ? 'expression (truncated)' : 'expression (overflows)'));
        }
        this.error(node, 'invalid operation: ' + exprString(node) + ' (mismatched types ' + this.typeName(left.type) + ' and ' +
                   this.typeName(right.type) + ')');
    };

    Checker.prototype.comparison = function (node, left, right) {
        var op = node.op;
        var ok = false;
        var leftNil = left.type === types.untypedNil, rightNil = right.type === types.untypedNil;
        if (leftNil || rightNil) {
            var other = leftNil ? right : left;
            var underlyingType = G.underlying(other.type);
            var otherKind = underlyingType.kind;
            ok = (op === '==' || op === '!=') &&
                (otherKind === 'slice' || otherKind === 'map' || otherKind === 'func' || otherKind === 'pointer' ||
                 otherKind === 'chan' || otherKind === 'interface' || other.type === types.untypedNil);
            if (!ok)
                this.error(node, 'invalid operation: ' + exprString(node) + ' (mismatched types ' +
                           (leftNil ? 'untyped nil' : this.typeName(left.type)) + ' and ' + (rightNil ? 'untyped nil' : this.typeName(right.type)) + ')');
            if (leftNil && !rightNil)
                left.type = right.type;
            if (rightNil && !leftNil)
                right.type = left.type;
            node.compareType = leftNil ? right.type : left.type;
            node.nilCompare = true;
        } else {
            this.matchTypes(node, left, right);
            var assignable = this.assignable(left, right.type) === null || this.assignable(right, left.type) === null;
            if (!assignable)
                this.error(node, 'invalid operation: ' + exprString(node) + ' (mismatched types ' + this.typeName(left.type) +
                           ' and ' + this.typeName(right.type) + ')');
            if (op === '==' || op === '!=') {
                var leftUnderlying = G.underlying(left.type), rightUnderlying = G.underlying(right.type);
                var onlyNil = { slice: true, map: true, func: true };
                if (onlyNil[leftUnderlying.kind] === true || onlyNil[rightUnderlying.kind] === true)
                    this.error(node, 'invalid operation: ' + exprString(node) + ' (' + this.typeName(left.type).replace(/^\[\].*/, 'slice').replace(/^map\[.*/, 'map').replace(/^func.*/, 'func') +
                               ' can only be compared to nil)');
                if (!G.comparable(left.type))
                    this.error(node, 'invalid operation: ' + exprString(node) + ' (' + this.typeName(left.type) + ' cannot be compared)');
            } else if (!G.ordered(left.type) && !(G.isTypeParam(left.type) && this.typeParamSupports(left.type, '<'))) {
                this.error(node, 'invalid operation: ' + exprString(node) + ' (operator ' + op + ' not defined on ' +
                           this.describe(left) + ')');
            }
            // An interface and a concrete type: comparison through the interface.
            if (G.isInterface(left.type) !== G.isInterface(right.type))
                node.compareType = G.isInterface(left.type) ? left.type : right.type;
            else
                node.compareType = G.isUntyped(left.type) ? right.type : left.type;
        }
        if (G.isUntyped(node.compareType) && left.mode === 'const' && right.mode === 'const')
            node.compareType = G.defaultType(node.compareType);
        if (left.mode === 'const' && right.mode === 'const') {
            node.mode = 'const';
            node.value = this.constantBinary(node, op, left, right, left.type);
        } else {
            node.mode = 'value';
            if (G.isUntyped(left.type) && left.type !== types.untypedNil)
                this.defaultUntyped(left);
            if (G.isUntyped(right.type) && right.type !== types.untypedNil)
                this.defaultUntyped(right);
            if (G.isUntyped(node.compareType))
                node.compareType = left.type;
        }
        node.type = types.untypedBool;
    };

    Checker.prototype.shift = function (node, expected) {
        this.value(node.x);
        this.value(node.y);
        var left = node.x, right = node.y;
        if (right.mode === 'const') {
            if (G.isUntyped(right.type) && G.isFloat(right.type) && rat.isInteger(right.value)) {
                right.value = rat.trunc(right.value);
                right.type = types.untypedInt;
            }
            if (!G.isInteger(right.type))
                this.error(right, 'invalid operation: shift count ' + this.describe(right) + ' must be integer');
            if (big.sign(right.value) < 0)
                this.error(right, 'invalid operation: negative shift count ' + exprString(right));
            if (G.isUntyped(right.type))
                this.convertUntyped(right, types.uint);
        } else if (!G.isInteger(right.type)) {
            this.error(right, 'invalid operation: shift count ' + this.describe(right) + ' must be integer');
        } else if (G.isUntyped(right.type)) {
            this.defaultUntyped(right);
        }
        if (left.mode === 'const') {
            if (G.isUntyped(left.type) && G.isFloat(left.type) && rat.isInteger(left.value)) {
                left.value = rat.trunc(left.value);
                left.type = types.untypedInt;
            }
            if (!G.isInteger(left.type))
                this.error(left, 'invalid operation: shifted operand ' + this.describe(left) + ' must be integer');
            if (right.mode === 'const') {
                var count = big.toFloat(right.value);
                if (count > 10000)
                    this.error(right, 'invalid shift count ' + exprString(right));
                node.mode = 'const';
                node.type = left.type;
                node.value = node.op === '<<' ? big.shl(left.value, count) : big.shr(left.value, count);
                if (!G.isUntyped(left.type)) {
                    if (node.op === '<<' && G.represent(node.value, left.type) === undefined)
                        this.error(node, 'constant ' + G.constantString(node.value) + ' overflows ' + this.typeName(left.type));
                    node.value = G.represent(node.value, left.type);
                }
                return node;
            }
            // A non-constant shift of an untyped constant: the type comes
            // from the context, otherwise int.
            if (G.isUntyped(left.type)) {
                var target = expected && G.isInteger(expected) ? expected : types.int;
                this.convertUntyped(left, target);
            }
        } else if (!G.isInteger(left.type)) {
            this.error(left, 'invalid operation: shifted operand ' + this.describe(left) + ' must be integer');
        }
        node.mode = 'value';
        node.type = left.type;
        return node;
    };

    Checker.prototype.typeParamSupports = function (type, op) {
        var terms = G.typeTerms(type.constraint);
        if (terms === null || terms.length === 0)
            return false;
        return terms.every(function (term) {
            var termType = term.type;
            switch (op) {
            case '+':
                return G.isNumeric(termType) || G.isString(termType);
            case '-':
            case '*':
            case '/':
                return G.isNumeric(termType);
            case '<':
                return G.ordered(termType);
            default:
                return G.isInteger(termType);
            }
        });
    };

    Go.Checker = Checker;
})(globalThis);
