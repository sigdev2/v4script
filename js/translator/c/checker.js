// C: checking - the types of declarations, expressions and statements;
// marks the tree for translation: node.type, node.lvalue, node.value (a
// constant), node.obj, node.field, node.opType (the type of the operation
// after conversions).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    if (C.Checker)
        return;

    var types = C.types;
    var big = T.big;
    var CompileError = T.CompileError;

    function Scope(parent) {
        this.parent = parent;
        this.names = Object.create(null);
        this.tags = Object.create(null);
    }
    Scope.prototype.lookup = function (name) {
        for (var scope = this; scope !== null; scope = scope.parent) {
            var found = scope.names[name];
            if (found !== undefined)
                return found;
        }
        return null;
    };
    Scope.prototype.lookupTag = function (name) {
        for (var scope = this; scope !== null; scope = scope.parent) {
            var found = scope.tags[name];
            if (found !== undefined)
                return found;
        }
        return null;
    };
    C.Scope = Scope;

    function FunctionInfo(object, type) {
        this.object = object;
        this.type = type;
        this.locals = [];
        this.labels = Object.create(null);
        this.calls = [];
        this.blocking = false;
        this.async = false;
        this.usesVarargs = false;
        this.jsNames = Object.create(null);
    }
    C.FunctionInfo = FunctionInfo;

    function Checker(session, source) {
        this.session = session;
        this.source = source || '';
        this.scope = null;
        this.func = null;
        this.functions = [];
        this.breakable = 0;
        this.continuable = 0;
        this.switches = [];
    }
    C.Checker = Checker;

    Checker.prototype.error = function (node, message) {
        throw new CompileError(message, node ? node.line : 0, node ? node.column : 0, node && node.file ? node.file : '');
    };

    Checker.prototype.typeName = function (type) {
        return "'" + C.typeString(type) + "'";
    };

    // --- Types from the syntax

    Checker.prototype.baseType = function (specs) {
        if (specs.typedefName !== null) {
            var object = this.scope.lookup(specs.typedefName);
            if (object === null || object.kind !== 'typedef')
                this.error(specs, "unknown type name '" + specs.typedefName + "'");
            return object.type;
        }
        if (specs.record !== null)
            return this.recordType(specs.record);
        if (specs.enumType !== null)
            return this.enumerationType(specs.enumType);
        if (specs.typeofArg !== null) {
            if (specs.typeofArg.typeName)
                return this.typeNameType(specs.typeofArg.typeName);
            this.expr(specs.typeofArg.expr);
            return specs.typeofArg.expr.type;
        }
        if (specs.words.indexOf('_Complex') >= 0)
            this.error(specs, '_Complex is not supported');
        var type = C.typeFromWords(specs.words);
        if (type === null)
            this.error(specs, "cannot combine type specifiers '" + specs.words.join(' ') + "'");
        return type;
    };

    Checker.prototype.recordType = function (node) {
        var record;
        if (node.tag !== null) {
            var existing = node.fields === null ? this.scope.lookupTag(node.tag) : this.scope.tags[node.tag];
            if (existing !== undefined && existing !== null) {
                if (existing.kind !== node.kind)
                    this.error(node, "use of '" + node.tag + "' with tag type that does not match previous declaration");
                if (node.fields !== null && existing.complete && !existing.reopen)
                    this.error(node, 'redefinition of \'' + node.kind + ' ' + node.tag + "'");
                record = existing;
            } else {
                record = C.record(node.kind, node.tag);
                this.scope.tags[node.tag] = record;
            }
        } else {
            record = C.record(node.kind, null);
        }
        if (node.fields !== null) {
            var self = this;
            var fields = [];
            var seen = {};
            node.fields.forEach(function (group) {
                if (group.staticAssert) {
                    self.staticAssert(group.staticAssert);
                    return;
                }
                var base = self.baseType(group.specs);
                if (group.declarators.length === 0) {
                    // An anonymous struct or union inside.
                    if (C.isRecord(base) && group.specs.record !== null && group.specs.record.tag === null) {
                        fields.push({ name: null, type: base, bits: null, anonymous: true });
                        return;
                    }
                    return;
                }
                group.declarators.forEach(function (item) {
                    var type = self.declaratorType(item.declarator, base);
                    var name = item.declarator.name;
                    if (name !== null && seen[name])
                        self.error(item.declarator, "duplicate member '" + name + "'");
                    if (name !== null)
                        seen[name] = true;
                    var bits = null;
                    if (item.width !== null) {
                        if (!C.isInteger(type))
                            self.error(item.declarator, "bit-field '" + name + "' has non-integral type " + self.typeName(type));
                        bits = big.toFloat(self.constantInteger(item.width));
                        if (bits < 0 || bits > type.size * 8)
                            self.error(item.width, "width of bit-field '" + name + "' (" + bits + ' bits) exceeds the width of its type');
                    }
                    if (type.kind === 'function')
                        self.error(item.declarator, "field '" + name + "' declared as a function");
                    if (!self.isComplete(type) && !(type.kind === 'array' && type.length === null))
                        self.error(item.declarator, 'field has incomplete type ' + self.typeName(type));
                    fields.push({ name: name, type: type, bits: bits });
                });
            });
            C.layoutRecord(record, fields);
            // The fields of anonymous nested members are reachable by name (the offset is the sum).
            record.fields.forEach(function (field) {
                if (field.anonymous === undefined && field.name === null && C.isRecord(field.type))
                    field.anonymous = true;
            });
            fields.forEach(function (field, index) {
                if (field.anonymous)
                    record.fields[index].anonymous = true;
            });
        }
        return record;
    };

    Checker.prototype.enumerationType = function (node) {
        var type;
        if (node.tag !== null) {
            var existing = node.items === null ? this.scope.lookupTag(node.tag) : this.scope.tags[node.tag];
            if (existing !== undefined && existing !== null) {
                type = existing;
            } else {
                type = C.enumType(node.tag);
                this.scope.tags[node.tag] = type;
            }
        } else {
            type = C.enumType(null);
        }
        if (node.items !== null) {
            var self = this;
            var next = 0;
            node.items.forEach(function (item) {
                if (item.value !== null)
                    next = self.constantInteger(item.value);
                self.declare({ kind: 'enumconst', name: item.name, type: types.int, value: next, line: item.line }, item);
                next = big.add(next, 1);
            });
            type.complete = true;
        }
        return type;
    };

    Checker.prototype.declaratorType = function (declarator, base) {
        var type = base;
        var self = this;
        declarator.pointers.forEach(function () { type = C.pointer(type); });
        for (var index = declarator.suffixes.length - 1; index >= 0; --index) {
            var suffix = declarator.suffixes[index];
            if (suffix.k === 'array') {
                if (type.kind === 'function')
                    this.error(suffix, "'" + (declarator.name || 'type name') + "' declared as array of functions");
                var length = null;
                var vla = null;
                if (suffix.size !== null) {
                    this.expr(suffix.size);
                    if (!C.isInteger(suffix.size.type))
                        this.error(suffix.size, 'size of array has non-integer type ' + this.typeName(suffix.size.type));
                    if (suffix.size.value !== undefined) {
                        length = big.toFloat(suffix.size.value);
                        if (length < 0)
                            this.error(suffix.size, "'" + (declarator.name || 'array') + "' declared as an array with a negative size");
                        if (length * Math.max(1, type.size) > 256 * 1024 * 1024)
                            this.error(suffix.size, 'array is too large (' + length + ' elements)');
                    } else {
                        if (this.func === null && this.scope.kind !== 'prototype')
                            this.error(suffix.size, 'variable length array declaration not allowed at file scope');
                        vla = suffix.size;
                        length = -1;
                    }
                }
                type = C.array(type, length);
                if (vla !== null)
                    type.vla = vla;
            } else {
                if (type.kind === 'function')
                    this.error(suffix, 'function cannot return function type ' + this.typeName(type));
                if (type.kind === 'array')
                    this.error(suffix, 'function cannot return array type ' + this.typeName(type));
                var params = [];
                // The prototype scope: a parameter is visible in the
                // declarators after it (int n, int a[][n]). Its object becomes
                // the parameter of a definition, so that the sizes refer to it.
                var outer = this.scope;
                this.scope = new Scope(outer);
                this.scope.kind = 'prototype';
                try {
                    suffix.params.forEach(function (param) {
                        if (param.oldStyle) {
                            params.push(types.int);
                            return;
                        }
                        var paramType = self.declaratorType(param.declarator, self.baseType(param.specs));
                        // An array or a function as a parameter is a pointer.
                        if (paramType.kind === 'array')
                            paramType = C.pointer(paramType.of);
                        else if (paramType.kind === 'function')
                            paramType = C.pointer(paramType);
                        if (paramType.kind === 'void')
                            self.error(param, "argument may not have 'void' type");
                        params.push(paramType);
                        var name = param.declarator.name;
                        if (name !== null) {
                            if (param.declarator.paramObject === undefined) {
                                param.declarator.paramObject = { kind: 'var', name: name, type: paramType,
                                                                 storage: 'local', line: param.declarator.line,
                                                                 addressTaken: false };
                            }
                            param.declarator.paramObject.type = paramType;
                            self.scope.names[name] = param.declarator.paramObject;
                        }
                    });
                } finally {
                    this.scope = outer;
                }
                type = C.functionType(type, params, suffix.variadic, suffix.unspecified);
            }
        }
        if (declarator.inner !== null)
            type = this.declaratorType(declarator.inner, type);
        return type;
    };

    Checker.prototype.typeNameType = function (node) {
        return this.declaratorType(node.declarator, this.baseType(node.specs));
    };

    Checker.prototype.isComplete = function (type) {
        if (type.kind === 'void')
            return false;
        if (C.isRecord(type))
            return type.complete;
        if (type.kind === 'array')
            return type.length !== null && this.isComplete(type.of);
        return true;
    };

    // --- Constants

    Checker.prototype.constantInteger = function (node) {
        this.expr(node);
        if (node.value === undefined || !C.isInteger(node.type) && !(node.type.kind === 'pointer'))
            this.error(node, 'expression is not an integer constant expression');
        return typeof node.value === 'number' && !Number.isInteger(node.value) ? big.fromFloat(node.value) : node.value;
    };

    Checker.prototype.staticAssert = function (node) {
        var value = this.constantInteger(node.condition);
        if (big.sign(value) === 0) {
            var message = node.message !== null ? ': ' + T.utf8.decode(T.utf8.fromBytes(node.message.bytes)) : '';
            this.error(node, 'static assertion failed' + message);
        }
    };

    // The value of a constant within its type (truncated, as on assignment).
    function wrapConstant(value, type) {
        if (type.kind === 'float')
            return typeof value === 'number' ? value : big.toFloat(value);
        if (typeof value === 'number' && !Number.isInteger(value))
            value = big.fromFloat(value);
        if (type.kind === 'pointer')
            return big.and(value, big.sub(big.pow(2, 64), 1));
        if (type === types.bool)
            return big.sign(value) !== 0 ? 1 : 0;
        var bits = type.size * 8;
        var modulus = big.pow(2, bits);
        var result = big.mod(value, modulus);
        if (type.signed && big.cmp(result, big.pow(2, bits - 1)) >= 0)
            result = big.sub(result, modulus);
        return result;
    }
    C.wrapConstant = wrapConstant;

    // --- Declarations

    Checker.prototype.declare = function (object, node) {
        var existing = this.scope.names[object.name];
        if (existing !== undefined) {
            var global = this.scope.kind === 'file';
            if (existing.kind === 'func' && object.kind === 'func') {
                if (!C.compatible(existing.type, object.type) && !existing.fromSession)
                    this.error(node, "conflicting types for '" + object.name + "'");
                return null;
            }
            if (global && existing.kind === 'var' && object.kind === 'var' && (existing.extern || object.extern) &&
                C.compatible(existing.type, object.type))
                return null;
            if (!existing.fromSession && !(global && existing.kind === object.kind && existing.kind === 'typedef' &&
                                           C.compatible(existing.type, object.type)))
                this.error(node, "redefinition of '" + object.name + "'" +
                           (existing.kind !== object.kind ? ' as different kind of symbol' : ''));
        }
        this.scope.names[object.name] = object;
        return object;
    };

    Checker.prototype.newLocal = function (name, type, node) {
        return this.addLocal({ kind: 'var', name: name, type: type, storage: 'local', line: node ? node.line : 0,
                               addressTaken: false });
    };

    // A local variable of the function: its name in the generated code.
    Checker.prototype.addLocal = function (object) {
        var name = object.name;
        var used = this.func.jsNames;
        var base = T.jsName(name);
        var jsName = base;
        var counter = 1;
        while (used[jsName] !== undefined)
            jsName = base + '$' + (++counter);
        used[jsName] = true;
        object.jsName = jsName;
        this.func.locals.push(object);
        return object;
    };

    // const of the object itself (not of what it points to).
    function isConstObject(specs, declarator) {
        var levels = [];
        for (var current = declarator; current !== null; current = current.inner)
            levels.push(current);
        for (var index = levels.length - 1; index >= 0; --index) {
            var level = levels[index];
            if (level.suffixes.length > 0)
                return false;
            if (level.pointers.length > 0)
                return !!level.pointers[level.pointers.length - 1].const;
        }
        return !!specs.qualifiers.const;
    }

    // A declaration: variables, typedef, prototypes. Returns the objects.
    Checker.prototype.declaration = function (node) {
        var self = this;
        if (node.k === 'staticassert') {
            this.staticAssert(node);
            return;
        }
        var specs = node.specs;
        var base = this.baseType(specs);
        var global = this.func === null || this.scope.kind === 'file';
        node.objects = [];
        node.declarators.forEach(function (item) {
            var declarator = item.declarator;
            var type = self.declaratorType(declarator, base);
            var name = declarator.name;
            if (specs.storage === 'typedef') {
                self.declare({ kind: 'typedef', name: name, type: type, line: declarator.line }, declarator);
                node.objects.push(null);
                return;
            }
            if (type.kind === 'function') {
                var existing = self.scope.lookup(name);
                var func = existing !== null && existing.kind === 'func' && C.compatible(existing.type, type)
                    ? existing : self.session.functionObject(name, type, declarator);
                self.declare(func, declarator);
                if (self.scope.names[name] === undefined || self.scope.names[name] !== func)
                    self.scope.names[name] = func;
                node.objects.push(null);
                return;
            }
            if (type.kind === 'void')
                self.error(declarator, "variable has incomplete type 'void'");
            var object;
            if (global || specs.storage === 'static' || specs.storage === 'extern') {
                object = { kind: 'var', name: name, type: type, storage: global ? 'global' : (specs.storage === 'extern' ? 'global' : 'static'),
                           line: declarator.line, extern: specs.storage === 'extern', addressTaken: true,
                           isConst: isConstObject(specs, declarator), global: true };
                if (specs.storage === 'extern' && self.func !== null) {
                    var outer = self.session.lookupGlobal(name);
                    if (outer !== null)
                        object = outer;
                }
            } else {
                object = self.newLocal(name, type, declarator);
                object.isConst = isConstObject(specs, declarator);
            }
            // The name is visible in its initializer: T *p = malloc(sizeof *p).
            if (self.declare(object, declarator) === null) {
                // A repeated declaration (extern) is the same object.
                var previous = self.scope.names[name];
                if (specs.storage !== 'extern') {
                    previous.extern = false;
                    if (self.isComplete(type))
                        previous.type = type;
                }
                object = previous;
                type = object.type;
            }
            if (item.init !== null) {
                if (specs.storage === 'extern' && self.func !== null)
                    self.error(declarator, "'extern' variable cannot have an initializer");
                // An array without a length takes it from the initializer.
                self.initializer(item.init, type, declarator);
                if (type.kind === 'array' && type.length === null) {
                    type = C.array(type.of, item.init.inferredLength);
                    object.type = type;
                }
            }
            if (type.kind === 'array' && type.length === null && !object.extern)
                self.error(declarator, 'definition of variable with array type needs an explicit size or an initializer');
            if (!self.isComplete(type) && !(type.kind === 'array' && type.length === -1) && !object.extern)
                self.error(declarator, 'variable has incomplete type ' + self.typeName(type));
            if (type.vla && global)
                self.error(declarator, 'variable length array declaration not allowed at file scope');
            node.objects.push(object);
        });
    };

    // An initializer: { ... } or an expression; a string for char[].
    Checker.prototype.initializer = function (init, type, place) {
        var self = this;
        if (init.k !== 'initlist') {
            if (type.kind === 'array' && init.k === 'string' && C.isInteger(type.of) &&
                (type.of.size === 1 || init.wide)) {
                init.type = C.array(type.of, init.bytes.length + 1);
                init.inferredLength = init.bytes.length + 1;
                if (type.length !== null && type.length >= 0 && init.bytes.length > type.length)
                    this.error(init, 'initializer-string for char array is too long');
                return;
            }
            if (type.kind === 'array')
                this.error(init, 'array initializer must be an initializer list' + (C.isInteger(type.of) ? ' or string literal' : ''));
            this.expr(init);
            this.assignable(init, type, 'initializing');
            return;
        }
        if (C.isScalar(type)) {
            // int x = { 5 };
            if (init.items.length === 0)
                return;
            this.initializer(init.items[0].value, type, place);
            return;
        }
        if (type.kind === 'array') {
            var index = 0, max = 0;
            init.items.forEach(function (item) {
                var designators = item.designators;
                var elemType = type.of;
                if (designators.length > 0) {
                    var first = designators[0];
                    if (first.index === undefined)
                        self.error(item, 'field designator cannot initialize a non-struct, non-union type ' + self.typeName(type));
                    index = big.toFloat(self.constantInteger(first.index));
                    if (first.last !== null)
                        index = big.toFloat(self.constantInteger(first.last));
                    item.position = big.toFloat(first.index.value);
                    item.lastPosition = index;
                    if (type.length !== null && type.length >= 0 && index >= type.length)
                        self.error(item, 'array index ' + index + ' exceeds array bounds');
                    if (designators.length > 1)
                        self.subDesignators(item, designators.slice(1), elemType);
                    else
                        self.initializer(item.value, elemType, item);
                } else {
                    item.position = index;
                    item.lastPosition = index;
                    if (type.length !== null && type.length >= 0 && index >= type.length)
                        self.error(item.value, 'excess elements in array initializer');
                    // Without braces: the elements of nested arrays and structs in a row.
                    self.initializer(item.value, elemType, item);
                }
                ++index;
                max = Math.max(max, index);
            });
            init.inferredLength = max;
            init.type = type;
            return;
        }
        if (C.isRecord(type)) {
            if (!type.complete)
                this.error(init, 'variable has incomplete type ' + this.typeName(type));
            var fieldIndex = 0;
            var named = type.fields.filter(function (field) { return field.name !== null || field.anonymous; });
            init.items.forEach(function (item) {
                if (item.designators.length > 0) {
                    var first = item.designators[0];
                    if (first.field === undefined)
                        self.error(item, 'array designator cannot initialize non-array type ' + self.typeName(type));
                    var path = self.findField(type, first.field);
                    if (path === null)
                        self.error(item, "field designator '" + first.field + "' does not refer to any field in type " +
                                   self.typeName(type));
                    item.fieldPath = path;
                    var field = path[path.length - 1];
                    fieldIndex = named.indexOf(path[0]) + 1;
                    if (item.designators.length > 1)
                        self.subDesignators(item, item.designators.slice(1), field.type);
                    else
                        self.initializer(item.value, field.type, item);
                } else {
                    if (fieldIndex >= named.length)
                        self.error(item.value, 'excess elements in ' + type.kind + ' initializer');
                    var target = named[fieldIndex++];
                    item.fieldPath = [target];
                    self.initializer(item.value, target.type, item);
                    if (type.kind === 'union')
                        fieldIndex = named.length;
                }
            });
            init.type = type;
            return;
        }
        this.error(init, 'invalid initializer for type ' + this.typeName(type));
    };

    // .a.b = x / [1][2] = x: nested designators as a list of one.
    Checker.prototype.subDesignators = function (item, rest, type) {
        var nested = { k: 'initlist', items: [{ designators: rest, value: item.value, line: item.line, column: item.column }],
                       line: item.line, column: item.column };
        item.value = nested;
        this.initializer(nested, type, item);
    };

    // A field by name (in anonymous nested members too): the path of fields or null.
    Checker.prototype.findField = function (record, name) {
        for (var index = 0; index < record.fields.length; ++index) {
            var field = record.fields[index];
            if (field.name === name)
                return [field];
            if (field.anonymous && C.isRecord(field.type)) {
                var inner = this.findField(field.type, name);
                if (inner !== null)
                    return [field].concat(inner);
            }
        }
        return null;
    };

    // A function definition.
    Checker.prototype.functionDefinition = function (node) {
        var self = this;
        var declarator = node.declarator;
        var type = this.declaratorType(declarator, this.baseType(node.specs));
        var name = declarator.name;
        var existing = this.scope.lookup(name);
        var func;
        if (existing !== null && existing.kind === 'func') {
            if (!C.compatible(existing.type, type) && !existing.fromSession)
                this.error(declarator, "conflicting types for '" + name + "'");
            if (existing.definedBy === this)
                this.error(declarator, "redefinition of '" + name + "'");
            func = existing;
            func.type = type;
        } else {
            func = this.session.functionObject(name, type, declarator);
            this.declare(func, declarator);
        }
        this.scope.names[name] = func;
        func.definedBy = this;
        func.isStatic = node.specs.storage === 'static';
        var info = new FunctionInfo(func, type);
        info.node = node;
        node.info = info;
        node.object = func;
        func.info = info;
        this.functions.push(info);
        var savedFunc = this.func;
        var savedScope = this.scope;
        this.func = info;
        this.scope = new Scope(this.scope);
        this.scope.kind = 'function';
        var suffix = C.functionSuffix(declarator);
        info.params = [];
        suffix.params.forEach(function (param, index) {
            var paramType = type.params[index];
            var paramName = param.declarator.name;
            if (paramName === null) {
                info.params.push(null);
                return;
            }
            var object = param.declarator.paramObject !== undefined
                ? self.addLocal(param.declarator.paramObject) : self.newLocal(paramName, paramType, param.declarator);
            object.type = paramType;
            object.param = true;
            info.params.push(object);
            self.declare(object, param.declarator);
        });
        if (type.returns.kind !== 'void' && !this.isComplete(type.returns))
            this.error(declarator, 'incomplete result type ' + this.typeName(type.returns) + ' in function definition');
        this.blockItems(node.body.items);
        Object.keys(info.labels).forEach(function (label) {
            if (!info.labels[label].defined)
                self.error(info.labels[label].node, "use of undeclared label '" + label + "'");
        });
        this.scope = savedScope;
        this.func = savedFunc;
    };

    // --- Statements

    Checker.prototype.blockItems = function (items) {
        for (var index = 0; index < items.length; ++index) {
            var item = items[index];
            if (item.k === 'decl' || item.k === 'staticassert')
                this.declaration(item);
            else
                this.statement(item);
        }
    };

    Checker.prototype.withScope = function (callback) {
        var saved = this.scope;
        this.scope = new Scope(saved);
        this.scope.kind = 'block';
        try {
            callback();
        } finally {
            this.scope = saved;
        }
    };

    Checker.prototype.condition = function (node) {
        this.expr(node);
        var type = this.decayed(node);
        if (!C.isScalar(type))
            this.error(node, 'statement requires expression of scalar type (' + this.typeName(type) + ' invalid)');
    };

    Checker.prototype.statement = function (node) {
        var self = this;
        switch (node.k) {
        case 'block':
            this.withScope(function () { self.blockItems(node.items); });
            return;
        case 'exprstmt':
            this.expr(node.expr);
            return;
        case 'if':
            this.condition(node.cond);
            this.withScope(function () { self.statement(node.then); });
            if (node.otherwise !== null)
                this.withScope(function () { self.statement(node.otherwise); });
            return;
        case 'while':
            this.condition(node.cond);
            this.loopBody(node.body);
            return;
        case 'do':
            this.loopBody(node.body);
            this.condition(node.cond);
            return;
        case 'for':
            this.withScope(function () {
                if (node.init !== null) {
                    if (node.init.k === 'decl')
                        self.declaration(node.init);
                    else
                        self.statement(node.init);
                }
                if (node.cond !== null)
                    self.condition(node.cond);
                if (node.step !== null)
                    self.expr(node.step);
                self.loopBody(node.body);
            });
            return;
        case 'switch': {
            this.expr(node.expr);
            var type = this.decayed(node.expr);
            if (!C.isInteger(type))
                this.error(node.expr, 'statement requires expression of integer type (' + this.typeName(type) + ' invalid)');
            node.opType = C.promote(type);
            var info = { node: node, cases: [], values: {}, hasDefault: false };
            this.switches.push(info);
            ++this.breakable;
            this.withScope(function () { self.statement(node.body); });
            --this.breakable;
            this.switches.pop();
            node.cases = info.cases;
            node.hasDefault = info.hasDefault;
            return;
        }
        case 'case': {
            var current = this.switches[this.switches.length - 1];
            if (current === undefined)
                this.error(node, "'case' statement not in switch statement");
            var value = wrapConstant(this.constantInteger(node.value), current.node.opType);
            var high = node.high !== null ? wrapConstant(this.constantInteger(node.high), current.node.opType) : value;
            var key = big.str(value);
            if (current.values[key])
                this.error(node, "duplicate case value '" + key + "'");
            current.values[key] = true;
            node.caseValue = value;
            node.caseHigh = high;
            current.cases.push(node);
            this.statement(node.stmt);
            return;
        }
        case 'default': {
            var target = this.switches[this.switches.length - 1];
            if (target === undefined)
                this.error(node, "'default' statement not in switch statement");
            if (target.hasDefault)
                this.error(node, 'multiple default labels in one switch');
            target.hasDefault = true;
            target.cases.push(node);
            this.statement(node.stmt);
            return;
        }
        case 'break':
            if (this.breakable === 0)
                this.error(node, "'break' statement not in loop or switch statement");
            return;
        case 'continue':
            if (this.continuable === 0)
                this.error(node, "'continue' statement not in loop statement");
            return;
        case 'return': {
            var fn = this.func;
            var returns = fn.type.returns;
            if (node.expr !== null) {
                this.expr(node.expr);
                if (returns.kind === 'void') {
                    if (this.decayed(node.expr).kind !== 'void')
                        this.error(node, "void function '" + (fn.object ? fn.object.name : 'main') + "' should not return a value");
                } else {
                    this.assignable(node.expr, returns, 'returning');
                }
            } else if (returns.kind !== 'void' && fn.object !== null) {
                this.error(node, "non-void function '" + fn.object.name + "' should return a value");
            }
            return;
        }
        case 'label': {
            var labels = this.func.labels;
            if (labels[node.name] && labels[node.name].defined)
                this.error(node, "redefinition of label '" + node.name + "'");
            labels[node.name] = { defined: true, node: node };
            this.statement(node.stmt);
            return;
        }
        case 'goto':
            this.error(node, 'goto is not supported');
            return;
        case 'empty':
            return;
        case 'decl':
        case 'staticassert':
            this.declaration(node);
            return;
        }
        this.error(node, 'unexpected statement');
    };

    Checker.prototype.loopBody = function (body) {
        var self = this;
        ++this.breakable;
        ++this.continuable;
        this.withScope(function () { self.statement(body); });
        --this.breakable;
        --this.continuable;
    };

    C.functionSuffix = function (declarator) {
        var levels = [];
        for (var current = declarator; current !== null; current = current.inner)
            levels.push(current);
        for (var index = levels.length - 1; index >= 0; --index) {
            if (levels[index].suffixes.length > 0)
                return levels[index].suffixes[0];
        }
        return null;
    };
})(globalThis);
