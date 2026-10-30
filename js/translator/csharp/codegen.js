// C#: translation of bound trees into a JavaScript tree - the base:
// function contexts, references to types at run time (type arguments of
// generic classes and methods), type definitions with their members,
// constructors, initializers and statics.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.Generator)
        return;

    var J = T.J;

    function Generator(session, source) {
        this.session = session;
        this.source = source || '';
        this.constants = [];
        this.constantIndex = new Map();
        this.fn = null;
        this.aliasCounter = 0;
        // Closed constructed types used by the chunk: variables at its start.
        this.typeCache = new Map();
        this.typeCacheNames = [];
        this.labelCounter = 0;
    }
    CS.Generator = Generator;

    Generator.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.idx(J.id('$D'), J.num(index));
    };

    Generator.prototype.rt = function (name) {
        return J.mem(J.id('$cs'), name);
    };

    Generator.prototype.temp = function () {
        return J.id(this.fn.scope.temp());
    };

    // A function context: kind (method, lambda, local), the type whose code
    // it is, the variable with this.
    Generator.prototype.pushFunction = function (kind, typeSym, method) {
        var fn = { kind: kind, typeSym: typeSym, method: method, parent: this.fn, scope: new T.FunctionScope('$t'),
                   thisAlias: null, typeArgsAlias: null, generator: false, isStatic: method ? !!method.isStatic : false,
                   labels: [], breakTargets: [], hoisted: [] };
        this.fn = fn;
        return fn;
    };

    Generator.prototype.popFunction = function () {
        var fn = this.fn;
        this.fn = fn.parent;
        return fn;
    };

    // The nearest method context (lambdas use its this).
    Generator.prototype.methodContext = function (fn) {
        fn = fn || this.fn;
        while (fn !== null && fn.kind === 'lambda')
            fn = fn.parent;
        return fn;
    };

    // this: in a lambda or a generator through a variable of the method.
    Generator.prototype.thisRef = function () {
        var method = this.methodContext();
        if (method === null)
            return J.this_();
        if (method === this.fn && !this.fn.generator && !this.fn.innerGenerator)
            return J.this_();
        if (method.thisAlias === null)
            method.thisAlias = '$this' + (++this.aliasCounter);
        return J.id(method.thisAlias);
    };

    // The body of a function: temporaries and the alias of this first.
    Generator.prototype.functionCode = function (fn, params, body, isGenerator) {
        var head = fn.scope.declarations();
        // Locals declared inside expressions outside any block (out var, patterns).
        var hoisted = fn.hoisted.filter(function (name, index) { return fn.hoisted.indexOf(name) === index; });
        if (hoisted.length > 0)
            head.push(J.vars(hoisted.map(function (name) { return { name: name, init: null }; }), 'var'));
        if (fn.thisAlias !== null)
            head.push(J.var_(fn.thisAlias, J.this_()));
        return J.fn(null, params, head.concat(body), !!isGenerator);
    };

    // --- Types at run time

    // A type as a run-time value: $K.id, a constructed type, an array type,
    // a type parameter.
    Generator.prototype.typeRef = function (type) {
        switch (type.kind) {
        case 'named': {
            var sym = type.sym;
            if (type.args.length === 0)
                return this.typeSymRef(sym);
            var self = this;
            var open = CS.isOpen(type);
            var build = J.call(this.rt('inst'), [this.typeSymRef(sym), J.arr(type.args.map(function (arg) { return self.typeRef(arg); }))]);
            if (open)
                return build;
            return this.cachedType(type, build);
        }
        case 'array': {
            var array = J.call(this.rt('arrayType'), [this.typeRef(type.elem), J.num(type.rank)]);
            return CS.isOpen(type) ? array : this.cachedType(type, array);
        }
        case 'tparam':
            return this.typeParamRef(type.sym);
        case 'dynamic':
            return this.typeRef(CS.objectType());
        case 'null':
            return this.typeRef(CS.objectType());
        }
        throw new Error('C# codegen: no run-time type for ' + type.kind);
    };

    // A type symbol without arguments: $K.<jsId>.
    Generator.prototype.typeSymRef = function (sym) {
        return J.mem(J.id('$K'), sym.jsId);
    };

    // A closed constructed type: one variable of the chunk, filled at the
    // first use.
    Generator.prototype.cachedType = function (type, build) {
        var key = CS.typeKey(type);
        var name = this.typeCache.get(key);
        if (name === undefined) {
            name = '$ty' + (this.typeCacheNames.length + 1);
            this.typeCache.set(key, name);
            this.typeCacheNames.push(name);
        }
        return J.or(J.id(name), J.assign(J.id(name), build));
    };

    // The declarations of the cached types (at the start of the chunk).
    Generator.prototype.chunkPrologue = function () {
        if (this.typeCacheNames.length === 0)
            return [];
        return [J.vars(this.typeCacheNames.map(function (name) { return { name: name, init: null }; }), 'var')];
    };

    // A type parameter: a hidden parameter of a generic method, or an
    // argument of the constructed type of this.
    Generator.prototype.typeParamRef = function (param) {
        if (param.methodLevel)
            return J.id(this.typeParamName(param));
        var owner = param.owner;
        var method = this.methodContext();
        var holder;
        if (method !== null && method.isStatic) {
            // A static method of a generic type: this is the constructed type.
            holder = J.mem(this.thisRef(), 'prototype');
        } else {
            holder = this.thisRef();
        }
        // The innermost generic class in scope holds the arguments of its outer ones too.
        var typeSym = method !== null ? method.typeSym : owner;
        var source = typeSym !== null && typeSym !== undefined && typeSym.allTypeParams.indexOf(param) >= 0 ? typeSym : owner;
        return J.idx(J.mem(holder, '$ta$' + source.jsId), J.num(source.allTypeParams.indexOf(param)));
    };

    Generator.prototype.typeParamName = function (param) {
        if (param.jsName === null)
            param.jsName = '$tp' + param.id + '_' + param.name.replace(/[^A-Za-z0-9_]/g, '_');
        return param.jsName;
    };

    // --- Classification of types for the code

    // The kind of arithmetic of a type: i8..u64, f32, f64, decimal, char,
    // bool, or null.
    Generator.prototype.numericKind = function (type) {
        if (CS.isEnum(type))
            return this.numericKind(type.sym.complete().enumUnderlying);
        var keyword = CS.keywordOf(type);
        if (keyword === null)
            return null;
        return CS.NUMERIC[keyword] || null;
    };

    // A struct whose values must be copied for a new variable.
    Generator.prototype.isMutableStruct = function (type) {
        if (type.kind !== 'named')
            return false;
        if (CS.isNullableValue(type))
            return this.isMutableStruct(type.args[0]);
        var sym = type.sym;
        if (sym.kind !== 'struct' || sym.special !== undefined)
            return false;
        return CS.structIsMutable(sym);
    };

    // A struct is mutable if it has a field that is not readonly or a
    // mutable struct field (the predefined ones are immutable).
    CS.structIsMutable = function (sym) {
        if (sym.mutableCache !== undefined)
            return sym.mutableCache;
        sym.mutableCache = false;
        sym.complete();
        if (sym.kind !== 'struct' || sym.special !== undefined || sym.mods.readonly || sym.immutable) {
            sym.mutableCache = false;
            return false;
        }
        var mutable = (sym.fieldOrder || []).some(function (field) {
            if (!field.isReadonly)
                return true;
            var type = field.type;
            return type.kind === 'named' && type.sym.kind === 'struct' && CS.structIsMutable(type.sym);
        });
        sym.mutableCache = mutable;
        return mutable;
    };

    // The value of a variable of the type is copied when it is stored.
    Generator.prototype.needsCopy = function (type) {
        return this.isMutableStruct(type) || (type.kind === 'tparam' && !CS.typeParamIsReference(type.sym));
    };

    // An expression that reads a variable (a copy is needed when stored).
    function isVariableRead(expr) {
        switch (expr.k) {
        case 'local':
        case 'field':
        case 'arrayElement':
        case 'fromEndElement':
        case 'this':
            return true;
        case 'property':
            return expr.property.isAuto;
        }
        return false;
    }
    CS.isVariableRead = isVariableRead;

    // The value of an expression for a new variable: struct values that
    // come from variables are copied.
    Generator.prototype.storedValue = function (expr) {
        var value = this.expression(expr);
        return this.copyFor(expr, value);
    };

    Generator.prototype.copyFor = function (expr, value) {
        var type = expr.type;
        if (type === undefined || !isVariableRead(expr))
            return value;
        if (this.isMutableStruct(type)) {
            if (CS.isNullableValue(type)) {
                var temp = this.temp();
                return J.cond(J.bin('===', J.assign(temp, value), J.nul()), J.nul(), J.method(temp, '$copy', []));
            }
            return J.method(value, '$copy', []);
        }
        if (type.kind === 'tparam' && !CS.typeParamIsReference(type.sym))
            return J.call(this.rt('copy'), [this.typeRef(type), value]);
        return value;
    };

    // The default value of a type.
    Generator.prototype.defaultValue = function (type) {
        if (CS.isNullableValue(type))
            return J.nul();
        var kind = this.numericKind(type);
        if (kind === 'decimal')
            return J.mem(J.mem(J.id('$T'), 'csharp'), 'decimal').ZERO ? this.constant(CS.decimal.ZERO) : this.constant(CS.decimal.ZERO);
        if (kind !== null)
            return J.num(0);
        if (CS.isSpecial(type, 'bool'))
            return J.bool(false);
        if (type.kind === 'named' && type.sym.kind === 'struct')
            return J.new_(this.typeRef(type), []);
        if (type.kind === 'tparam' && !CS.typeParamIsReference(type.sym))
            return J.call(this.rt('defaultOf'), [this.typeRef(type)]);
        return J.nul();
    };

    // --- Type definitions

    // The types of a chunk: base types first.
    Generator.prototype.orderTypes = function (list) {
        var ordered = [];
        var inList = new Set(list);
        var visiting = new Set();
        function visit(sym) {
            if (ordered.indexOf(sym) >= 0 || visiting.has(sym))
                return;
            visiting.add(sym);
            var supers = sym.interfaces.map(function (iface) { return iface.sym; });
            if (sym.baseType !== null)
                supers.unshift(sym.baseType.sym);
            // Struct fields need their types defined (default values).
            (sym.fieldOrder || []).forEach(function (field) {
                if (field.type.kind === 'named' && field.type.sym.kind === 'struct')
                    supers.push(field.type.sym);
            });
            supers.forEach(function (superSym) {
                if (inList.has(superSym))
                    visit(superSym);
            });
            ordered.push(sym);
        }
        list.forEach(visit);
        return ordered;
    };

    // A type and its nested types.
    Generator.prototype.collectTypes = function (sym, list) {
        var self = this;
        list.push(sym);
        Object.keys(sym.nestedTypes).forEach(function (key) { self.collectTypes(sym.nestedTypes[key], list); });
        return list;
    };

    // The metadata of a type for the run time.
    Generator.prototype.typeMeta = function (sym) {
        var meta = { name: CS.runtimeName(sym), simpleName: sym.name, kind: sym.kind, generic: sym.allTypeParams.length,
                     mutable: sym.kind === 'struct' && CS.structIsMutable(sym), primitive: !!sym.primitive,
                     namespace: sym.container !== null && sym.container.kind === 'namespace' ? sym.container.qname : null };
        if (sym.allTypeParams.some(function (param) { return param.variance !== null; })) {
            meta.variant = true;
            meta.variance = sym.allTypeParams.map(function (param) { return param.variance; });
        }
        if (sym.kind === 'enum') {
            CS.Checker.prototype.enumValues.call(sym.checker, sym);
            meta.names = sym.enumMembers.map(function (field) { return field.name; });
            meta.values = sym.enumMembers.map(function (field) {
                var value = field.constant;
                return typeof value === 'number' ? value : T.big.str(value);
            });
            meta.flags = !!sym.isFlags;
            meta.underlying = CS.keywordOf(sym.enumUnderlying);
        }
        if (sym.isRecord)
            meta.record = true;
        if (sym.isAnonymous)
            meta.anonymous = sym.anonymousMembers;
        if (sym.installPrimitive)
            meta.install = sym.installPrimitive;
        if (sym.kind === 'delegate') {
            var invoke = sym.invoke;
            meta.invoke = { params: invoke.params.length, returns: invoke.returnType.kind !== 'void' };
        }
        return meta;
    };

    // The definition of a type: the constructor, the instance fields, the
    // members, the interface aliases, the statics.
    Generator.prototype.typeDefinition = function (sym, varName) {
        var self = this;
        var ref = J.id(varName);
        var baseRef = J.nul();
        // An open base (class List<T> : Base<T>): its definition; the
        // constructed types get their bases from $supers.
        if (sym.baseType !== null && sym.kind !== 'interface')
            baseRef = CS.isOpen(sym.baseType) ? this.typeSymRef(sym.baseType.sym)
                : this.withTypeContext(sym, true, function () { return self.typeRef(sym.baseType); });
        var closed = sym.interfaces.filter(function (iface) { return !CS.isOpen(iface); });
        // The interfaces of generic math of library types load when a type
        // test needs them: Int32 would bring two dozen into every program.
        var lazy = closed.filter(function (iface) { return sym.library && /^System\.Numerics\.I/.test(iface.sym.qname); });
        var eager = closed.filter(function (iface) { return lazy.indexOf(iface) < 0; });
        var interfaceRefs = J.arr(eager.map(function (iface) { return self.typeRef(iface); }));
        // The interfaces after the definition: Int32 implements IComparable<int>.
        var out = [J.var_(varName, J.call(this.rt('defineType'), [J.str(sym.jsId), this.constant(this.typeMeta(sym)),
                                                                   this.fieldsFunction(sym), baseRef, J.arr([])])),
                   J.expr(J.assign(J.mem(ref, '$ifaces'), interfaceRefs))];
        if (lazy.length > 0)
            out.push(J.expr(J.call(this.rt('lazyInterfaces'), [ref, J.fn(null, [], [J.ret(J.arr(lazy.map(function (iface) {
                return self.typeRef(iface);
            })))])])));
        // Generic types: their supertypes with the arguments.
        if (sym.allTypeParams.length > 0)
            out.push(J.expr(J.assign(J.mem(ref, '$supers'), this.supersFunction(sym))));
        if (sym.kind === 'struct')
            out = out.concat(this.structMembers(sym, ref));
        if (sym.kind === 'enum') {
            out = out.concat(this.enumMembers(sym, ref));
            return out;
        }
        if (sym.kind === 'delegate')
            return out;
        out = out.concat(this.members(sym, ref));
        return out;
    };

    // Code that runs with the type arguments of a type (its type
    // parameters in its own methods).
    Generator.prototype.withTypeContext = function (sym, isStatic, callback) {
        var saved = this.fn;
        this.pushFunction('method', sym, { isStatic: isStatic });
        try {
            return callback();
        } finally {
            this.fn = saved;
        }
    };

    // $supers: the base type and the interfaces of a constructed type.
    Generator.prototype.supersFunction = function (sym) {
        var self = this;
        var params = sym.allTypeParams.map(function (param) { return '$a' + param.index; });
        var saved = this.fn;
        var fn = this.pushFunction('lambda', sym, { isStatic: true });
        fn.typeArgsByParam = new Map();
        sym.allTypeParams.forEach(function (param) { fn.typeArgsByParam.set(param, J.id('$a' + param.index)); });
        var previous = this.typeParamRef;
        this.typeParamRef = function (param) {
            if (!param.methodLevel && fn.typeArgsByParam.has(param))
                return fn.typeArgsByParam.get(param);
            return previous.call(this, param);
        };
        try {
            var base = sym.baseType !== null && sym.kind !== 'interface' ? this.typeRef(sym.baseType) : J.nul();
            var ifaces = J.arr(sym.interfaces.map(function (iface) { return self.typeRef(iface); }));
            var body = [J.ret(J.obj([['base', base], ['ifaces', ifaces]]))];
            return this.functionCode(fn, params, body, false);
        } finally {
            this.typeParamRef = previous;
            this.fn = saved;
        }
    };

    // $fields(self): the default values of the instance fields; the base
    // ones first.
    Generator.prototype.fieldsFunction = function (sym) {
        var self = this;
        if (sym.kind === 'interface' || sym.kind === 'enum' || sym.kind === 'delegate')
            return J.nul();
        var saved = this.fn;
        var fn = this.pushFunction('method', sym, { isStatic: false });
        var body = [];
        if (sym.baseType !== null && sym.kind === 'class' && !CS.isSpecial(sym.baseType, 'object')) {
            body.push(J.expr(J.call(J.mem(J.mem(J.id('$K'), sym.baseType.sym.jsId), '$fields'), [J.id('$s')])));
        }
        (sym.fieldOrder || []).forEach(function (field) {
            body.push(J.expr(J.assign(J.mem(J.id('$s'), field.jsName), self.defaultValueIn(field.type, J.id('$s'), sym))));
        });
        var code = this.functionCode(fn, ['$s'], body, false);
        this.fn = saved;
        return code;
    };

    // A default value inside $fields: type parameters through the instance.
    Generator.prototype.defaultValueIn = function (type, instance, sym) {
        if (type.kind === 'tparam' && !CS.typeParamIsReference(type.sym) && !type.sym.methodLevel) {
            var owner = sym !== undefined && sym.allTypeParams.indexOf(type.sym) >= 0 ? sym : type.sym.owner;
            return J.call(this.rt('defaultOf'), [J.idx(J.mem(instance, '$ta$' + owner.jsId), J.num(owner.allTypeParams.indexOf(type.sym)))]);
        }
        if (CS.isOpen(type) && type.kind === 'named' && type.sym.kind === 'struct' && !CS.isNullableValue(type)) {
            var saved = this.typeParamRef;
            this.typeParamRef = function (param) {
                if (!param.methodLevel) {
                    // The arguments of the outer types are with those of the type.
                    var holder = sym !== undefined && sym.allTypeParams.indexOf(param) >= 0 ? sym : param.owner;
                    return J.idx(J.mem(instance, '$ta$' + holder.jsId), J.num(holder.allTypeParams.indexOf(param)));
                }
                return saved.call(this, param);
            };
            try {
                return this.defaultValue(type);
            } finally {
                this.typeParamRef = saved;
            }
        }
        return this.defaultValue(type);
    };

    // Structs: $copy, the default equality.
    Generator.prototype.structMembers = function (sym, ref) {
        var self = this;
        var out = [];
        var fields = sym.fieldOrder || [];
        var body = [J.var_('$c', J.new_(J.mem(J.this_(), 'constructor'), []))];
        fields.forEach(function (field) {
            var value = J.mem(J.this_(), field.jsName);
            if (self.isMutableStruct(field.type))
                value = J.method(value, '$copy', []);
            body.push(J.expr(J.assign(J.mem(J.id('$c'), field.jsName), value)));
        });
        body.push(J.ret(J.id('$c')));
        out.push(J.expr(J.assign(J.mem(J.mem(ref, 'prototype'), '$copy'), J.fn(null, [], body))));
        out.push(J.expr(J.assign(J.mem(J.mem(ref, 'prototype'), '$fieldNames'),
                                 this.constant(fields.map(function (field) { return field.jsName; })))));
        return out;
    };

    Generator.prototype.enumMembers = function (sym, ref) {
        var kind = this.numericKind(sym.enumUnderlying);
        var typed = { i8: 'Int8Array', u8: 'Uint8Array', i16: 'Int16Array', u16: 'Uint16Array', i32: 'Int32Array', u32: 'Uint32Array' }[kind];
        var out = [J.expr(J.call(this.rt('defineEnum'), [ref]))];
        if (typed !== undefined)
            out.push(J.expr(J.assign(J.mem(ref, '$typed'), J.id(typed))));
        return out;
    };

    // Methods, accessors, constructors, initializers, statics, aliases.
    Generator.prototype.members = function (sym, ref) {
        var self = this;
        var out = [];
        var proto = J.mem(ref, 'prototype');
        var lazyLibrary = sym.library;
        sym.memberList.forEach(function (member) {
            var methods = [];
            if (member.symbolKind === 'method')
                methods.push(member);
            else if (member.symbolKind === 'property' || member.symbolKind === 'event')
                methods = [member.getter, member.setter, member.adder, member.remover].filter(function (item) {
                    return item !== null && item !== undefined;
                });
            methods.forEach(function (method) {
                var value = self.methodValue(sym, method, ref, lazyLibrary);
                if (value === null)
                    return;
                var holder = method.isStatic ? ref : proto;
                out.push(J.at(J.expr(J.assign(J.mem(holder, method.jsName), value)), method.node ? method.node.line : 0));
            });
        });
        sym.ctors.forEach(function (ctor) {
            var line = ctor.node ? ctor.node.line : (sym.node ? sym.node.line : 0);
            var value;
            if (ctor.isExtern)
                value = self.nativeFunction(sym, ctor);
            else if (ctor.lazy)
                value = self.lazyMethodValue(sym, ctor, proto);
            else
                value = self.constructorFunction(ctor, sym);
            out.push(J.at(J.expr(J.assign(J.mem(proto, ctor.jsName), value)), line));
        });
        // The field initializers and the static part.
        if (sym.instanceInits && sym.instanceInits.length > 0)
            out.push(J.expr(J.assign(J.mem(proto, '$fi$' + sym.jsId), this.initializerFunction(sym, false))));
        // Static fields: default values, then the initialization.
        sym.memberList.forEach(function (member) {
            var field = member.symbolKind === 'field' ? member : member.backingField;
            if (field === null || field === undefined || !field.isStatic || field.isConst || field.enumMember)
                return;
            out.push(J.expr(J.assign(J.mem(ref, field.jsName), self.defaultValue(field.type))));
        });
        out = out.concat(this.staticPart(sym, ref));
        out.push(J.expr(J.call(this.rt('finishType'), [ref, this.constant(this.interfaceAliases(sym))])));
        return out;
    };

    // [interface member name, implementing member name, static] of a type.
    Generator.prototype.interfaceAliases = function (sym) {
        var result = [];
        (sym.interfaceMap || []).forEach(function (entry) {
            if (entry.impl === null || entry.impl.jsName === entry.member.jsName)
                return;
            result.push(entry.member.isStatic ? [entry.member.jsName, entry.impl.jsName, true] : [entry.member.jsName, entry.impl.jsName]);
        });
        return result;
    };

    // The function of a method: its body, a native, a synthesized member
    // of a record or a lazy stub of the library.
    Generator.prototype.methodValue = function (sym, method, ref, lazyLibrary) {
        if (method.isExtern) {
            if (method.isDelegateInvoke)
                return null;
            return this.nativeFunction(sym, method);
        }
        if (method.synthetic)
            return this.syntheticMethod(sym, method, ref);
        if (method.accessorOf !== null && method.accessorOf.isAuto)
            return this.autoAccessor(sym, method, ref);
        if (method.isAbstract)
            return null;
        if (method.partialDefinition)
            return J.fn(null, method.params.map(function (param, index) { return '$a' + index; }), []);
        if (method.lazy && lazyLibrary)
            return this.lazyMethodValue(sym, method, method.isStatic ? ref : J.mem(ref, 'prototype'));
        if (method.body === undefined || method.body === null) {
            if (method.node === null || method.node === undefined)
                return null;
            return null;
        }
        return this.methodFunction(method, sym);
    };

    Generator.prototype.lazyMethodValue = function (sym, method, holder) {
        var session = this.session;
        var loader = function (target) { return session.compileLazyMethod(sym, method, target); };
        return J.call(this.rt('lazyMethod'), [holder, J.str(method.jsName), this.constant(loader), J.bool(!!method.fiber)]);
    };

    // A native: CS.natives['System.Math']['Sqrt(double)'].
    CS.nativeKey = function (method) {
        var name = method.isCtor ? '.ctor' : method.name;
        if (method.typeParams.length > 0)
            name += '<' + method.typeParams.map(function (param) { return param.name; }).join(', ') + '>';
        if (method.explicitIface)
            name = CS.typeName(method.explicitIface) + '.' + name;
        return name + '(' + method.params.map(function (param) {
            return (param.refKind === 'out' || param.refKind === 'ref' ? param.refKind + ' ' : '') + CS.typeName(param.type);
        }).join(', ') + ')';
    };

    Generator.prototype.nativeFunction = function (sym, method) {
        var natives = CS.natives[sym.qname + (sym.typeParams.length > 0 ? '`' + sym.typeParams.length : '')] || CS.natives[sym.qname] || {};
        var key = CS.nativeKey(method);
        if (natives[key] === undefined) {
            // A check of the library (tests) lists all missing natives.
            if (CS.missingNatives !== undefined) {
                CS.missingNatives.push(sym.qname + '.' + key);
                return J.nul();
            }
            throw new Error('C# native is missing: ' + sym.qname + '.' + key);
        }
        return this.constant(natives[key]);
    };

    // The accessors of an auto-property: the backing field.
    Generator.prototype.autoAccessor = function (sym, method, ref) {
        var property = method.accessorOf;
        var field = property.backingField;
        var holder = method.isStatic ? J.this_() : J.this_();
        if (method.name.indexOf('get_') === 0)
            return J.fn(null, [], [J.ret(J.mem(holder, field.jsName))]);
        var value = J.id('value');
        if (this.isMutableStruct(field.type))
            value = J.method(value, '$copy', []);
        return J.fn(null, ['value'], [J.expr(J.assign(J.mem(holder, field.jsName), value))]);
    };

    // A method: type parameters first, then the parameters.
    Generator.prototype.methodFunction = function (method, sym) {
        var saved = this.fn;
        var fn = this.pushFunction('method', sym, method);
        var params = this.parameterNames(method);
        var body = this.functionBody(method.fn, method.body, method);
        var code = this.finishFunction(fn, method.fn, params, body, method);
        this.fn = saved;
        return code;
    };

    Generator.prototype.parameterNames = function (method) {
        var self = this;
        var names = method.typeParams.map(function (param) { return self.typeParamName(param); });
        (method.paramLocals || method.params.map(function (param) { return param.local || null; })).forEach(function (local, index) {
            if (local === null || local === undefined) {
                names.push('$a' + index);
                return;
            }
            names.push(self.localName(local));
        });
        return names;
    };

    // The JavaScript name of a local: the C# name, a suffix for clashes.
    Generator.prototype.localName = function (local) {
        if (local.jsName === null)
            local.jsName = T.jsName(local.name);
        return local.jsName;
    };
})(globalThis);
