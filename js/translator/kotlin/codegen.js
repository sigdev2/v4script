// Kotlin: translation into a JavaScript tree - the base: function
// contexts, receivers and this, values between types (boxing as the run
// time of Java does it), classes on $j.defineClass with constructors,
// initialization order, properties with accessors, objects, functions
// with default arguments.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.Generator)
        return;

    var J = T.J;

    function Generator(session, source) {
        this.session = session;
        this.source = source || '';
        this.constants = [];
        this.constantIndex = new Map();
        this.fn = null;
        this.aliasCounter = 0;
        this.localClasses = new Map();
    }
    Kt.Generator = Generator;

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
        return J.mem(J.id('$j'), name);
    };

    Generator.prototype.kt = function (name) {
        return J.mem(J.id('$kt'), name);
    };

    Generator.prototype.temp = function () {
        return J.id(this.fn.scope.temp());
    };

    // --- Function contexts

    // kind: 'method' (has its own this), 'lambda', 'function' (top-level,
    // local), 'run' (the statements of a unit).
    Generator.prototype.pushFunction = function (kind, info) {
        var fn = { kind: kind, parent: this.fn, scope: new T.FunctionScope('$t'), thisAlias: null, hoisted: [], cls: null, pre: [],
                   receivers: [], generator: false, nonLocal: null, ops: null };
        if (info)
            Object.assign(fn, info);
        this.fn = fn;
        return fn;
    };

    Generator.prototype.popFunction = function () {
        var fn = this.fn;
        this.fn = fn.parent;
        return fn;
    };

    // The nearest function that has its own this.
    Generator.prototype.methodOf = function (fn) {
        while (fn !== null && fn.kind !== 'method')
            fn = fn.parent;
        return fn;
    };

    Generator.prototype.thisAlias = function (fn) {
        if (fn.thisAlias === null)
            fn.thisAlias = '$this' + (++this.aliasCounter);
        return fn.thisAlias;
    };

    // The JavaScript this of the method where cls is this: this, an
    // alias in lambdas, $outer for inner classes, the enclosing method for
    // local classes.
    Generator.prototype.thisOf = function (cls) {
        var current = this.fn;
        var method = this.methodOf(current);
        var crossed = method !== current || (method !== null && method.generator);
        while (method !== null) {
            var mine = method.cls;
            if (mine !== null && (mine === cls || this.isSubclassOf(mine, cls))) {
                if (!crossed)
                    return J.this_();
                return J.id(this.thisAlias(method));
            }
            // An inner class: the outer instance.
            if (mine !== null && mine.inner && mine.outer !== null) {
                var expression = crossed ? J.id(this.thisAlias(method)) : J.this_();
                var outer = mine;
                while (outer !== null && outer.inner && outer.outer !== null) {
                    expression = J.mem(expression, '$outer');
                    outer = outer.outer;
                    if (outer === cls || this.isSubclassOf(outer, cls))
                        return expression;
                }
            }
            crossed = true;
            method = this.methodOf(method.parent);
        }
        return J.this_();
    };

    Generator.prototype.isSubclassOf = function (sym, cls) {
        if (sym === cls)
            return true;
        return Kt.asSuper(Kt.classType(sym, sym.typeParams.map(function () { return Kt.STAR; })), cls) !== null;
    };

    // The JavaScript value of an implicit receiver.
    Generator.prototype.receiverValue = function (receiver) {
        switch (receiver.kind) {
        case 'this':
            return this.thisOf(receiver.cls);
        case 'object':
            if (this.fn !== null) {
                var method = this.methodOf(this.fn);
                if (method !== null && method.cls === receiver.cls)
                    return this.thisOf(receiver.cls);
            }
            return this.objectRef(receiver.cls);
        case 'extension':
        case 'lambda':
            if (receiver.jsName === undefined)
                receiver.jsName = '$receiver' + (++this.aliasCounter);
            return J.id(receiver.jsName);
        }
        return J.this_();
    };

    // A reference to a class: a local one is a variable, otherwise $K.
    Generator.prototype.classRef = function (sym) {
        if (this.localClasses.has(sym))
            return J.id(this.localClasses.get(sym));
        if (sym.arrayDescriptor !== undefined)
            return J.nul();
        return J.mem(J.id('$K'), sym.jsId);
    };

    // The instance of an object or a companion.
    Generator.prototype.objectRef = function (sym) {
        if (sym === Kt.builtins.Unit)
            return this.kt('Unit');
        return J.mem(this.classRef(sym), '$instance');
    };

    // --- Values between types

    var BOX = { char: 'boxC', i64: 'boxJ', f64: 'boxD', f32: 'boxF', i16: 'boxS', i8: 'boxB' };
    Kt.BOX = BOX;

    // A value of type from as a value of type to: boxing, unboxing, Unit.
    Generator.prototype.convert = function (js, from, to) {
        from = Kt.resolved(from);
        to = Kt.resolved(to);
        var fromPrim = Kt.isPrimitive(from) ? Kt.primKind(from) : null;
        var toPrim = Kt.isPrimitive(to) ? Kt.primKind(to) : null;
        if (fromPrim !== null && toPrim === null) {
            if (to.kind === 'nothing' || to.kind === 'error')
                return js;
            return this.box(js, fromPrim);
        }
        if (fromPrim === null && toPrim !== null) {
            if (from.kind === 'nothing' || from.kind === 'error' || from.kind === 'dynamic')
                return from.kind === 'dynamic' ? this.fromDynamic(js, toPrim) : js;
            return this.unbox(js, toPrim);
        }
        if (fromPrim !== null && toPrim !== null && fromPrim !== toPrim)
            return js;
        if (Kt.isClass(from, 'Unit') && !Kt.isClass(to, 'Unit') && to.kind !== 'error' && to.kind !== 'nothing' && !from.nullable)
            return this.unitValue(js);
        return js;
    };

    Generator.prototype.box = function (js, kind) {
        if (kind === 'u64')
            return J.call(this.kt('boxUJ'), [js]);
        var name = BOX[kind];
        if (name === undefined)
            return js;
        if (js.k === 'null')
            return js;
        return J.call(this.rt(name), [js]);
    };

    Generator.prototype.unbox = function (js, kind) {
        if (BOX[kind] === undefined && kind !== 'u64')
            return js;
        return J.call(this.kt('unbox'), [js]);
    };

    // A call of a Unit function as a value: kotlin.Unit.
    Generator.prototype.unitValue = function (js) {
        if (js.k === 'undef')
            return this.kt('Unit');
        return J.seq([js, this.kt('Unit')]);
    };

    // A JavaScript value (dynamic) as a primitive.
    Generator.prototype.fromDynamic = function (js, kind) {
        return J.call(this.kt('fromDynamic'), [js, J.str(kind)]);
    };

    // The declared (erased) type of a member: generic parameters are boxed.
    Generator.prototype.declared = function (type) {
        return type === null || type === undefined ? Kt.nullableAny() : type;
    };

    // The declaration at the top of the override chain: its types decide how
    // values pass (an override of next(): T returns a box, as a JVM bridge).
    Kt.rootOf = function (member) {
        var root = member;
        var guard = 0;
        while (root.overrides !== null && root.overrides !== undefined && guard++ < 50)
            root = root.overrides;
        return root;
    };

    // The type a parameter of fn has when it passes (the root's type).
    Generator.prototype.passedParam = function (fn, index) {
        var root = Kt.rootOf(fn);
        var param = root.params[index] || fn.params[index];
        return param === undefined ? Kt.nullableAny() : param.type;
    };

    Generator.prototype.passedReturn = function (fn) {
        var root = Kt.rootOf(fn);
        var type = root.returns !== null ? root.returns : fn.returns;
        return type === null ? Kt.nullableAny() : type;
    };

    // --- Classes

    // The classes of a chunk with supertypes first.
    Generator.prototype.orderClasses = function (list) {
        var ordered = [];
        var inList = new Set(list);
        var visiting = new Set();
        function visit(sym) {
            if (ordered.indexOf(sym) >= 0 || visiting.has(sym))
                return;
            visiting.add(sym);
            sym.supers.forEach(function (superType) {
                var superSym = Kt.resolved(superType).sym;
                if (superSym !== undefined && inList.has(superSym))
                    visit(superSym);
            });
            ordered.push(sym);
        }
        list.forEach(visit);
        return ordered;
    };

    // A class with its nested classes and the classes of enum entries.
    Generator.prototype.collectClasses = function (sym, list) {
        var self = this;
        list.push(sym);
        Object.keys(sym.nested).forEach(function (name) {
            var nested = sym.nested[name];
            if (nested.node !== null && nested.node.k === 'class')
                self.collectClasses(nested, list);
        });
        (sym.node.entries || []).forEach(function (entry) {
            if (entry.sym !== undefined)
                self.collectClasses(entry.sym, list);
        });
        return list;
    };

    Generator.prototype.classMeta = function (sym) {
        var meta = { name: sym.binaryName || sym.fqName, simpleName: sym.anonymous ? '' : sym.name,
                     flavor: sym.kind === 'enum' ? 'enum' : (sym.mods.data ? 'record' : 'class'), isInterface: sym.isInterface(),
                     kotlin: true, kind: sym.kind };
        if (sym.mods.data && sym.dataProps !== undefined) {
            meta.components = sym.dataProps.map(function (prop) { return prop.jsName; });
            meta.componentNames = sym.dataProps.map(function (prop) { return prop.name; });
            meta.componentTypes = sym.dataProps.map(function () { return 'Ljava.lang.Object;'; });
        }
        var functional = sym.isInterface() && sym.mods.fun ? Kt.samType(Kt.classType(sym, sym.typeParams.map(function () { return Kt.STAR; }))) : null;
        if (functional !== null)
            meta.functional = { name: functional.fn.jsName, params: functional.fn.params.map(function () { return 'Ljava.lang.Object;'; }),
                                returns: Kt.isClass(functional.fn.returns, 'Unit') ? 'V' : 'Ljava.lang.Object;' };
        return meta;
    };

    // The statements that define a class (varName - a variable of the chunk).
    Generator.prototype.classDefinition = function (sym, varName) {
        var self = this;
        var classType = J.id(varName);
        var superSym = sym.superclass !== null && sym.superclass !== undefined ? Kt.resolved(sym.superclass).sym : null;
        var superRef = superSym !== null && superSym !== Kt.builtins.Any ? this.classRef(superSym) : J.nul();
        var interfaces = sym.supers.filter(function (type) {
            var other = Kt.resolved(type).sym;
            return other !== undefined && other !== superSym && other.isInterface() && other.arrayDescriptor === undefined;
        }).map(function (type) { return self.classRef(Kt.resolved(type).sym); });
        var out = [J.var_(varName, J.call(this.rt('defineClass'), [J.id('$K'), J.str(sym.jsId), superRef, J.arr(interfaces),
                                                                    this.constant(this.classMeta(sym))]))];
        // Default values of the fields on the prototype.
        this.fieldsOf(sym).forEach(function (prop) {
            out.push(J.expr(J.assign(J.mem(J.mem(classType, 'prototype'), prop.jsName), self.defaultValue(prop.type))));
        });
        return out.concat(this.classMembers(sym, classType));
    };

    // The properties of a class that have a field.
    Generator.prototype.fieldsOf = function (sym) {
        var result = [];
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                if (member.kind === 'prop' && member.hasField && !member.isStatic && member.java === null)
                    result.push(member);
            });
        });
        return result;
    };

    Generator.prototype.defaultValue = function (type) {
        if (type === null || type === undefined)
            return J.nul();
        type = Kt.resolved(type);
        if (!Kt.isPrimitive(type))
            return J.nul();
        return Kt.primKind(type) === 'bool' ? J.bool(false) : J.num(0);
    };

    Generator.prototype.classMembers = function (sym, classType) {
        var self = this;
        var out = [];
        var proto = J.mem(classType, 'prototype');
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                if (member.kind === 'fun') {
                    var value = self.memberFunction(sym, member);
                    if (value !== null)
                        out.push(J.at(J.expr(J.assign(J.mem(proto, member.jsName), value)), member.node ? member.node.line : 0));
                } else {
                    self.propertyAccessors(sym, member, proto).forEach(function (statement) { out.push(statement); });
                }
            });
        });
        sym.ctors.forEach(function (ctor) {
            var line = ctor.node ? ctor.node.line : (sym.node ? sym.node.line : 0);
            out.push(J.at(J.expr(J.assign(J.mem(proto, ctor.jsName), self.constructorFunction(ctor, sym))), line));
        });
        // Delegation to supertypes: class A(b: B) : I by b.
        (sym.delegates || []).forEach(function (delegate, index) {
            out = out.concat(self.delegationMethods(sym, delegate, index, proto));
        });
        if (sym.kind === 'object')
            out.push(J.expr(J.call(this.kt('defineObject'), [classType])));
        if (sym.kind === 'enum')
            out.push(J.expr(J.assign(J.mem(classType, '$clinit'), this.enumInitializer(sym, classType))));
        var statics = this.staticFields(sym, classType);
        out = out.concat(statics);
        return out;
    };

    // The function of a member: a body, a synthetic member (data, enum), abstract (none).
    Generator.prototype.memberFunction = function (sym, fn) {
        if (fn.synthetic !== undefined && fn.synthetic !== null)
            return this.syntheticFunction(sym, fn);
        if (fn.external) {
            var native = this.session.nativeFunction(fn);
            if (native === null)
                throw new Error('Kotlin native is missing: ' + Kt.nativeKey(fn));
            return this.constant(native);
        }
        if (fn.isAbstract || fn.node === null || fn.node.body === null)
            return null;
        if (sym.library)
            return this.lazyMember(sym, fn, J.mem(this.classRef(sym), 'prototype'));
        return this.functionCode(fn, sym);
    };

    // A library method: translated at its first call.
    Generator.prototype.lazyMember = function (sym, fn, holder) {
        var session = this.session;
        var loader = function (target) { return session.compileLazyFunction(fn, target); };
        return J.call(this.kt('lazyFunction'), [holder, J.str(fn.jsName), this.constant(loader)]);
    };

    // componentN, copy, toString, equals, hashCode of data classes; enum values.
    Generator.prototype.syntheticFunction = function (sym, fn) {
        var kind = fn.synthetic.kind;
        var self = this;
        var props = sym.dataProps || [];
        switch (kind) {
        case 'component':
            return J.fn(null, [], [J.ret(this.fieldRead(J.this_(), fn.synthetic.prop))]);
        case 'copy': {
            var params = props.map(function (prop, index) { return '$a' + index; });
            var args = props.map(function (prop, index) {
                return J.cond(J.bin('===', J.id(params[index]), J.undef()), self.fieldRead(J.this_(), prop), J.id(params[index]));
            });
            var ctor = sym.ctors.filter(function (item) { return item.primary; })[0];
            return J.fn(null, params, [J.ret(J.call(J.mem(J.new_(this.classRef(sym), []), ctor.jsName), args))]);
        }
        case 'dataToString':
            return J.fn(null, [], [J.ret(J.call(this.kt('dataToString'), [J.this_(), this.constant(this.dataShape(sym))]))]);
        case 'dataHashCode':
            return J.fn(null, [], [J.ret(J.call(this.kt('dataHashCode'), [J.this_(), this.constant(this.dataShape(sym))]))]);
        case 'dataEquals':
            return J.fn(null, ['other'], [J.ret(J.call(this.kt('dataEquals'), [J.this_(), J.id('other'), this.constant(this.dataShape(sym))]))]);
        }
        return null;
    };

    // The fields of a data class and their kinds (for toString, hashCode, equals).
    Generator.prototype.dataShape = function (sym) {
        if (sym.dataShapeCache !== undefined)
            return sym.dataShapeCache;
        sym.dataShapeCache = {
            name: sym.name,
            object: sym.kind === 'object',
            fields: (sym.dataProps || []).map(function (prop) {
                var type = Kt.resolved(prop.type);
                return { name: prop.name, js: prop.jsName, kind: Kt.isPrimitive(type) ? Kt.primKind(type) : (Kt.isClass(type, 'String') ? 'string' : 'ref'),
                         array: type.kind === 'class' && (type.sym === Kt.builtins.Array || type.sym.arrayDescriptor !== undefined) };
            })
        };
        return sym.dataShapeCache;
    };

    // A field read; for an inherited Kotlin property the getter.
    Generator.prototype.fieldRead = function (object, prop) {
        return J.mem(object, prop.jsName);
    };

    // Getters and setters as methods of the prototype (virtual access, Java).
    Generator.prototype.propertyAccessors = function (sym, prop, proto) {
        var out = [];
        var self = this;
        if (prop.isStatic || prop.java !== null || prop.receiver !== null && sym === null)
            return out;
        // A property of the primary constructor has a parameter node.
        var node = prop.node !== null && prop.node.k === 'property' ? prop.node : null;
        if (prop.isAbstract && !prop.customGetter)
            return out;
        // The getter.
        var getter = null;
        if (prop.mods.external)
            getter = this.constant(this.session.nativeProperty(prop, 'get'));
        else if (node !== null && node.getter !== null && node.getter.body !== null)
            getter = this.accessorFunction(sym, prop, node.getter);
        else if (prop.delegated)
            getter = this.delegateGetter(sym, prop);
        else if (prop.hasField)
            getter = prop.lateinit
                ? J.fn(null, [], [J.ret(J.call(this.kt('lateinit'), [J.mem(J.this_(), prop.jsName), J.str(prop.name)]))])
                : J.fn(null, [], [J.ret(J.mem(J.this_(), prop.jsName))]);
        if (getter !== null && prop.getterName !== null)
            out.push(J.at(J.expr(J.assign(J.mem(proto, prop.getterName), getter)), node !== null ? node.line : 0));
        if (prop.mutable && prop.setterName !== null) {
            var setter = null;
            if (prop.mods.external)
                setter = this.constant(this.session.nativeProperty(prop, 'set'));
            else if (node !== null && node.setter !== null && node.setter.body !== null)
                setter = this.accessorFunction(sym, prop, node.setter);
            else if (prop.delegated)
                setter = this.delegateSetter(sym, prop);
            else if (prop.hasField)
                setter = J.fn(null, ['value'], [J.expr(J.assign(J.mem(J.this_(), prop.jsName), J.id('value')))]);
            if (setter !== null)
                out.push(J.at(J.expr(J.assign(J.mem(proto, prop.setterName), setter)), node !== null ? node.line : 0));
        }
        void self;
        return out;
    };

    // get() or set(value) with field as the backing field.
    Generator.prototype.accessorFunction = function (sym, prop, accessor) {
        var isMember = sym !== null;
        var fn = this.pushFunction(isMember ? 'method' : 'function', { cls: sym, accessorOf: prop, generator: false });
        var params = [];
        if (!isMember && prop.receiver !== null) {
            var receiverName = '$receiver' + (++this.aliasCounter);
            if (accessor.receiverInfo !== null && accessor.receiverInfo !== undefined)
                accessor.receiverInfo.jsName = receiverName;
            params.push(receiverName);
        } else if (isMember && prop.receiver !== null) {
            var memberReceiver = '$receiver' + (++this.aliasCounter);
            if (accessor.receiverInfo !== null && accessor.receiverInfo !== undefined)
                accessor.receiverInfo.jsName = memberReceiver;
            params.push(memberReceiver);
        }
        if (accessor.k === 'setter') {
            accessor.paramVar.jsName = T.jsName(accessor.param);
            params.push(accessor.paramVar.jsName);
        }
        var body;
        var self = this;
        if (accessor.exprBody) {
            body = this.withPre(function () {
                return self.valueAs(accessor.body, accessor.k === 'getter' ? prop.type : Kt.unitType());
            }, function (value) {
                return accessor.k === 'getter' ? J.at(self.returnValue(value), accessor.body.line) : J.at(J.expr(value), accessor.body.line);
            });
        } else {
            body = this.blockStatements(accessor.body);
        }
        this.popFunction();
        return this.functionCode(null, null, fn, params, body);
    };

    // A delegated property: getValue of the delegate in the field name$delegate.
    Generator.prototype.delegateGetter = function (sym, prop) {
        var node = prop.node;
        var holder = sym !== null ? J.this_() : J.id('$kts');
        var delegate = J.mem(sym !== null ? J.this_() : this.topHolder(prop), prop.jsName + '$delegate');
        void holder;
        var fn = this.pushFunction(sym !== null ? 'method' : 'function', { cls: sym });
        var thisRef = sym !== null ? J.this_() : J.nul();
        var value = this.operatorInvocation(node.delegateGet, delegate, [thisRef, this.propertyReference(prop)]);
        value = this.convert(value, this.declared(node.delegateGet.fn.returns), prop.type);
        this.popFunction();
        return this.functionCode(null, null, fn, [], [J.ret(value)]);
    };

    Generator.prototype.delegateSetter = function (sym, prop) {
        var node = prop.node;
        var delegate = J.mem(sym !== null ? J.this_() : this.topHolder(prop), prop.jsName + '$delegate');
        var fn = this.pushFunction(sym !== null ? 'method' : 'function', { cls: sym });
        var thisRef = sym !== null ? J.this_() : J.nul();
        var setFn = node.delegateSet.fn;
        var valueParam = setFn.params[2] !== undefined ? setFn.params[2].type : Kt.nullableAny();
        var call = this.operatorInvocation(node.delegateSet, delegate,
                                           [thisRef, this.propertyReference(prop), this.convert(J.id('value'), prop.type, valueParam)]);
        this.popFunction();
        return this.functionCode(null, null, fn, ['value'], [J.expr(call)]);
    };

    // A KProperty for a delegate: the name.
    Generator.prototype.propertyReference = function (prop) {
        if (prop.referenceObject === undefined)
            prop.referenceObject = this.session.propertyObject(prop.name);
        return this.constant(prop.referenceObject);
    };

    // Methods that forward to a delegate: class A(b: B) : I by b.
    Generator.prototype.delegationMethods = function (sym, delegate, index, proto) {
        var self = this;
        var out = [];
        var field = '$delegate' + index;
        var ifaceType = Kt.resolved(delegate.type);
        Kt.supertypeClosure(ifaceType).forEach(function (type) {
            var owner = type.sym;
            var members = [];
            if (owner.java !== null && owner.java !== undefined && !owner.mappedBuiltin) {
                Object.keys(owner.java.methods).forEach(function (name) {
                    Kt.javaMembers(owner, name, false).forEach(function (member) { members.push(member); });
                });
            } else {
                Object.keys(owner.members).forEach(function (name) {
                    owner.members[name].forEach(function (member) { members.push(member); });
                });
            }
            members.forEach(function (member) {
                var names = member.kind === 'fun' ? [member.jsName] : [member.getterName, member.setterName];
                names.forEach(function (jsName) {
                    if (jsName === null || jsName === undefined)
                        return;
                    // The class's own members win.
                    var own = Object.keys(sym.members).some(function (name) {
                        return sym.members[name].some(function (item) {
                            return item.jsName === jsName || item.getterName === jsName || item.setterName === jsName;
                        });
                    });
                    if (own || out.some(function (statement) { return statement.jsName === jsName; }))
                        return;
                    var forward = J.fn(null, [], [J.ret(J.call(J.mem(J.mem(J.mem(J.this_(), field), jsName), 'apply'),
                                                               [J.mem(J.this_(), field), J.id('arguments')]))]);
                    var statement = J.expr(J.assign(J.mem(proto, jsName), forward));
                    statement.jsName = jsName;
                    out.push(statement);
                });
            });
        });
        void self;
        return out;
    };

    // Enum entries: created at the first use of the class ($clinit).
    Generator.prototype.enumInitializer = function (sym, classType) {
        var self = this;
        var fn = this.pushFunction('function', { cls: sym });
        var body = [];
        sym.node.entries.forEach(function (entry, index) {
            var created = entry.sym !== undefined ? self.classRef(entry.sym) : classType;
            var object = J.call(self.rt('enumConstant'), [classType, J.new_(created, []), J.str(entry.name), J.num(index)]);
            var call = entry.call;
            var ctor = call.fn;
            body = body.concat(self.withPre(function () { return self.callArguments(call); }, function (args) {
                var init;
                if (entry.sym !== undefined) {
                    // An entry with a body: the constructor of the enum on the subclass object.
                    init = J.call(J.mem(J.mem(J.mem(classType, 'prototype'), ctor.jsName), 'call'), [object].concat(args));
                } else {
                    init = J.call(J.mem(object, ctor.jsName), args);
                }
                return J.at(J.expr(J.assign(J.mem(classType, 's$' + T.propertyName(entry.name)), init)), entry.line);
            }));
        });
        this.popFunction();
        return this.functionCode(null, null, fn, [], body);
    };

    // Statics of a class: none besides enum entries (companions are objects).
    Generator.prototype.staticFields = function (sym, classType) {
        void sym;
        void classType;
        return [];
    };

    // --- Constructors

    // $init: the superclass constructor, the property parameters, the
    // initializers and init blocks in order; a secondary constructor calls
    // this(...) first, then its body.
    Generator.prototype.constructorFunction = function (ctor, sym) {
        var self = this;
        var fn = this.pushFunction('method', { cls: sym, ctor: ctor });
        var params = [];
        if (sym.inner && sym.outer !== null) {
            params.push('$outer');
        }
        var paramVars = ctor.paramVars || [];
        ctor.params.forEach(function (param, index) {
            var variable = paramVars[index];
            var name = '$p' + index + '_' + T.jsName(param.name).replace(/\$/g, '');
            if (variable !== undefined)
                variable.jsName = name;
            param.jsName = name;
            params.push(name);
        });
        var body = [];
        if (sym.inner && sym.outer !== null)
            body.push(J.expr(J.assign(J.mem(J.this_(), '$outer'), J.id('$outer'))));
        body = body.concat(this.defaultArguments(ctor, ctor.params.map(function (param) { return param.jsName; })));
        if (ctor.primary) {
            var superCall = this.capture(function () { return self.primarySuperCall(sym); });
            body = body.concat(superCall.pre);
            if (superCall.js !== null)
                body.push(superCall.js);
            // Delegates: class A(b: B) : I by b.
            (sym.node.supers || []).forEach(function (spec) {
                if (spec.delegate !== null && spec.delegate !== undefined) {
                    var index = sym.node.supers.filter(function (other) { return other.delegate !== null; }).indexOf(spec);
                    body = body.concat(self.withPre(function () { return self.valueAs(spec.delegate, spec.resolved); }, function (value) {
                        return J.at(J.expr(J.assign(J.mem(J.this_(), '$delegate' + index), value)), spec.delegate.line);
                    }));
                }
            });
            // Property parameters.
            if (sym.node.primary !== null && sym.node.primary !== undefined) {
                sym.node.primary.params.forEach(function (paramNode, index) {
                    if (paramNode.valVar === null)
                        return;
                    var prop = (sym.members[paramNode.name] || []).filter(function (member) { return member.kind === 'prop'; })[0];
                    body.push(J.expr(J.assign(J.mem(J.this_(), prop.jsName), J.id(ctor.params[index].jsName))));
                });
            }
            body = body.concat(this.initializers(sym));
        } else if (ctor.node.delegation !== null) {
            var delegation = ctor.node.delegation;
            var target = delegation.call.fn;
            var owner = delegation.kind === 'this' ? sym : delegation.call.ctorOf;
            var outerArgs = [];
            if (owner.inner && owner.outer !== null)
                outerArgs.push(delegation.kind === 'this' ? J.id('$outer') : J.mem(J.this_(), '$outer'));
            var own = J.mem(J.mem(this.classRef(owner), 'prototype'), target.jsName);
            if (owner !== Kt.builtins.Any) {
                body = body.concat(this.withPre(function () { return self.callArguments(delegation.call); }, function (args) {
                    return J.at(J.expr(J.call(J.mem(own, 'call'), [J.this_()].concat(outerArgs, args))), delegation.line);
                }));
            }
            if (delegation.kind === 'super')
                body = body.concat(this.initializers(sym));
        } else {
            // No primary constructor, no delegation: super() and the initializers.
            var implicitSuper = this.implicitSuperCall(sym, ctor);
            if (implicitSuper !== null)
                body.push(implicitSuper);
            body = body.concat(this.initializers(sym));
        }
        if (!ctor.primary && ctor.node !== null && ctor.node.body !== null)
            body = body.concat(this.blockStatements(ctor.node.body));
        body.push(J.ret(J.this_()));
        this.popFunction();
        return this.functionCode(null, sym, fn, params, body);
    };

    // The call of the superclass constructor from the supertype list.
    Generator.prototype.primarySuperCall = function (sym) {
        var spec = (sym.node.supers || []).filter(function (item) { return item.superCall !== undefined; })[0];
        if (spec === undefined) {
            if (sym.kind === 'enum' || sym.entryOf !== undefined)
                return null;
            return this.implicitSuperCall(sym, null);
        }
        var result = spec.superCall;
        var superSym = result.ctorOf;
        if (superSym === Kt.builtins.Any)
            return null;
        var args = this.callArguments(result);
        if (superSym.inner && superSym.outer !== null)
            args = [this.thisOf(superSym.outer)].concat(args);
        var method = J.mem(J.mem(this.classRef(superSym), 'prototype'), result.fn.jsName);
        return J.at(J.expr(J.call(J.mem(method, 'call'), [J.this_()].concat(args))), spec.line);
    };

    // super() without arguments (a class whose superclass has a constructor without arguments).
    Generator.prototype.implicitSuperCall = function (sym, ctor) {
        var superType = sym.superclass;
        if (superType === null || superType === undefined)
            return null;
        var superSym = Kt.resolved(superType).sym;
        if (superSym === Kt.builtins.Any || sym.kind === 'enum' || sym.entryOf !== undefined)
            return null;
        var target = ctor !== null && ctor.implicitSuper !== undefined && ctor.implicitSuper !== null ? ctor.implicitSuper
            : superSym.ctors.filter(function (other) { return other.params.length === 0; })[0];
        if (target === undefined)
            return null;
        return J.expr(J.call(J.mem(J.mem(J.mem(this.classRef(superSym), 'prototype'), target.jsName), 'call'), [J.this_()]));
    };

    // Property initializers and init blocks in the order of declaration.
    Generator.prototype.initializers = function (sym) {
        var self = this;
        var body = [];
        sym.node.members.forEach(function (member) {
            if (member.k === 'property' && member.sym !== undefined) {
                var prop = member.sym;
                if (member.init !== null && prop.hasField && !prop.isConst) {
                    body = body.concat(self.withPre(function () { return self.valueAs(member.init, prop.type); }, function (value) {
                        return J.at(J.expr(J.assign(J.mem(J.this_(), prop.jsName), value)), member.line);
                    }));
                } else if (member.delegate !== null) {
                    body = body.concat(self.withPre(function () { return self.expression(member.delegate); }, function (value) {
                        return J.at(J.expr(J.assign(J.mem(J.this_(), prop.jsName + '$delegate'), value)), member.line);
                    }));
                }
            } else if (member.k === 'init') {
                body = body.concat(self.blockStatements(member.body));
            }
        });
        return body;
    };

    // --- Functions

    // A function of the language as a JavaScript function: parameters,
    // defaults, the body; a suspend function is a generator.
    Generator.prototype.functionCode = function (fnSym, sym, fn, params, body) {
        if (fn === null || fn === undefined) {
            fn = this.pushFunction(sym !== null && sym !== undefined && !fnSym.isStatic ? 'method' : 'function',
                                   { cls: sym || null, sym: fnSym, generator: !!fnSym.suspend || !!fnSym.waits,
                                     fiber: !!fnSym.waits && !fnSym.suspend, checkerContext: fnSym.context || null });
            var paramVars = fnSym.paramVars || [];
            params = [];
            var receiverInfo = fnSym.receiverInfo;
            if (fnSym.receiver !== null) {
                var receiverName = '$receiver' + (++this.aliasCounter);
                if (receiverInfo !== undefined)
                    receiverInfo.jsName = receiverName;
                params.push(receiverName);
            }
            var self = this;
            (fnSym.reifiedParams || fnSym.typeParams.filter(function (param) { return param.reified; })).forEach(function (param) {
                param.jsName = '$type_' + T.jsName(param.name);
                params.push(param.jsName);
            });
            var prologue = [];
            fnSym.params.forEach(function (param, index) {
                var variable = paramVars[index];
                var name = T.jsName(param.name);
                if (variable !== undefined)
                    variable.jsName = name;
                param.jsName = name;
                params.push(name);
                var passed = self.passedParam(fnSym, index);
                var converted = self.convert(J.id(name), passed, param.type);
                if (converted.k !== 'id')
                    prologue.push(J.expr(J.assign(J.id(name), converted)));
            });
            fn.returnRepr = this.passedReturn(fnSym);
            if (fnSym.tailrec)
                fn.tailrec = { sym: fnSym, params: params.slice(params.length - fnSym.params.length - (fnSym.receiver !== null ? 1 : 0)) };
            body = prologue.concat(this.defaultArguments(fnSym, fnSym.params.map(function (param) { return param.jsName; })));
            var node = fnSym.node;
            if (node.exprBody && fnSym.tailrec) {
                body = body.concat(this.tailStatements(node.body, fnSym.returns));
            } else if (node.exprBody) {
                var returns = fnSym.returns;
                var unit = Kt.isClass(returns, 'Unit');
                body = body.concat(this.withPre(function () {
                    return self.convert(self.valueAs(node.body, returns), returns, fn.returnRepr);
                }, function (value) {
                    return J.at(unit || Kt.isJump(node.body.type) ? J.expr(value) : self.returnValue(value), node.body.line);
                }));
            } else {
                body = body.concat(this.blockStatements(node.body));
            }
            if (fnSym.tailrec)
                body = this.tailrecLoop(fnSym, params, body);
            this.popFunction();
            void self;
        }
        var head = fn.scope.declarations();
        if (fn.thisAlias !== null)
            head.push(J.var_(fn.thisAlias, J.this_()));
        if (fn.hoisted.length > 0)
            head.push(J.vars(fn.hoisted.map(function (name) { return { name: name, init: null }; }), 'var'));
        var statements = head.concat(body);
        if (fn.nonLocal !== null)
            statements = this.nonLocalTarget(fn, statements);
        var code = J.fn(null, params, statements, fn.generator);
        // A function that waits: a fiber with a wrapper for plain calls.
        if (fn.fiber && !fn.run)
            code = J.call(this.rt('asyncFunction'), [code]);
        return code;
    };

    // A call from a fiber to a method that may wait: yield* its generator.
    Generator.prototype.fiberCall = function (target, name, args) {
        return J.yield_(J.call(this.rt('fiberCall'), [target, J.str(name), J.arr(args)]), true);
    };

    Generator.prototype.mayWait = function (fn) {
        return !!this.fn.fiber && Kt.mayWait(fn, this.session.asyncNames);
    };

    // A value with a call is returned through a temporary: V4 runs a call
    // anywhere in return (return a, b ? f() : c) as a tail call and loses
    // the frame of the function in the error stack.
    Generator.prototype.returnValue = function (value) {
        if (!this.fn.generator && hasCall(value)) {
            var temp = this.temp();
            return J.block([J.expr(J.assign(temp, value)), J.ret(temp)]);
        }
        return J.ret(value);
    };

    function hasCall(node) {
        if (node === null || typeof node !== 'object')
            return false;
        if (Array.isArray(node))
            return node.some(hasCall);
        if (node.k === 'call' || node.k === 'new')
            return true;
        if (node.k === 'fn')
            return false;
        for (var key in node) {
            if (key !== 'k' && hasCall(node[key]))
                return true;
        }
        return false;
    }

    // Default arguments: an omitted argument is undefined.
    Generator.prototype.defaultArguments = function (fnSym, names) {
        var self = this;
        var out = [];
        fnSym.params.forEach(function (param, index) {
            if (!param.hasDefault || param.node === null || param.node.init === null || param.node.init === undefined)
                return;
            var name = J.id(names[index]);
            var fill = self.withPre(function () { return self.valueAs(param.node.init, param.type); }, function (value) {
                return J.expr(J.assign(name, value));
            });
            out.push(J.at(J.if_(J.bin('===', name, J.undef()), J.block(fill)), param.node.init.line));
        });
        // An override takes the defaults of the overridden function: its
        // default expressions with the parameters of the override.
        fnSym.params.forEach(function (param, index) {
            var inherited = param.inheritedDefault;
            if (inherited === undefined || names[index] === undefined)
                return;
            var base = inherited.fn;
            while (base.params[inherited.index].inheritedDefault !== undefined)
                base = base.params[inherited.index].inheritedDefault.fn;
            var init = base.params[inherited.index].node !== null ? base.params[inherited.index].node.init : null;
            if (init === null || init === undefined)
                return;
            if (init.type === undefined) {
                // The overridden function of a class not checked yet (the library).
                var checker = base.checker || (base.owner !== null ? base.owner.checker : null);
                if (checker !== null && checker !== undefined)
                    checker.checkFunctionBody(base);
                if (init.type === undefined)
                    return;
            }
            var saved = (base.paramVars || []).map(function (variable) { return variable.jsName; });
            (base.paramVars || []).forEach(function (variable, position) { variable.jsName = names[position]; });
            var name = J.id(names[index]);
            var fill = self.withPre(function () { return self.valueAs(init, param.type); }, function (value) {
                return J.expr(J.assign(name, value));
            });
            (base.paramVars || []).forEach(function (variable, position) { variable.jsName = saved[position]; });
            out.push(J.if_(J.bin('===', name, J.undef()), J.block(fill)));
        });
        return out;
    };

    // A function that is a target of non-local returns (from inline lambdas).
    Generator.prototype.nonLocalTarget = function (fn, statements) {
        var token = fn.nonLocal;
        var error = '$e' + (++this.aliasCounter);
        var handler = [J.if_(J.and(J.bin('instanceof', J.id(error), this.kt('Return')), J.bin('===', J.mem(J.id(error), 'token'), J.id(token))),
                             J.ret(J.mem(J.id(error), 'value'))),
                       J.throw_(J.id(error))];
        return [J.var_(token, J.obj([]))].concat([J.try_(statements, error, handler, null)]);
    };

    // tailrec: the body in a loop; a tail call assigns the parameters and continues.
    // tailrec: the body is a loop; a call of the function itself in a tail
    // position sets the parameters and goes round (tailStatements).
    Generator.prototype.tailrecLoop = function (fnSym, params, body) {
        void fnSym;
        void params;
        return [J.label('$tailrec', J.while_(J.bool(true), J.block(body.concat([J.brk('$tailrec')]))))];
    };

    // The statements of a value in a tail position of a tailrec function.
    Generator.prototype.tailStatements = function (node, returns) {
        var self = this;
        var info = this.fn.tailrec;
        while (node.k === 'paren')
            node = node.expr;
        if (node.k === 'call' && node.call !== undefined && node.call.fn === info.sym && this.isSelfCall(node.call)) {
            var call = node.call;
            var values = this.capture(function () {
                var args = self.callArguments(call);
                if (info.sym.receiver !== null) {
                    var receiver = call.receiverNode !== null && call.receiverNode !== undefined ? self.expression(call.receiverNode)
                                                                                              : self.implicitReceiver(call);
                    args = [receiver].concat(args);
                }
                return J.arr(args);
            });
            // The new values into temporaries first: an argument may read a parameter.
            var temps = values.js.items.map(function (value) {
                var temp = self.temp();
                values.pre.push(J.expr(J.assign(temp, value === undefined || value.k === 'undef' ? J.undef() : value)));
                return temp;
            });
            // The defaults and conversions of the parameters are at the start of the loop.
            var assigns = temps.map(function (temp, index) { return J.expr(J.assign(J.id(info.params[index]), temp)); });
            return values.pre.concat(assigns, [J.cont('$tailrec')]);
        }
        if (node.k === 'if' && node.otherwise !== null) {
            var test = this.capture(function () { return self.valueAs(node.cond, Kt.booleanType()); });
            return test.pre.concat([J.if_(test.js, J.block(this.tailBlock(node.then, returns)), J.block(this.tailBlock(node.otherwise, returns)))]);
        }
        if (node.k === 'when')
            return this.whenStatement(node, function (branch) { return self.tailBlock(branch.body, returns); });
        return this.withPre(function () {
            return self.convert(self.valueAs(node, returns), returns, self.fn.returnRepr);
        }, function (value) {
            return Kt.isJump(node.type) ? J.expr(value) : J.at(self.returnValue(value), node.line);
        });
    };

    Generator.prototype.tailBlock = function (block, returns) {
        var self = this;
        var valueNode = block.valueNode;
        if (valueNode === undefined || valueNode === null)
            return this.blockStatements(block);
        var out = [];
        block.statements.forEach(function (statement) {
            if (statement !== valueNode)
                out = out.concat(self.statement(statement));
        });
        return out.concat(this.tailStatements(valueNode, returns));
    };

    // gcd(b, a % b) or this.gcd(...): the same receiver (an extension may change it).
    Generator.prototype.isSelfCall = function (call) {
        if (call.fn.receiver !== null)
            return true;
        var receiver = call.receiverNode;
        return receiver === null || receiver === undefined || receiver.k === 'this';
    };

    // --- Top-level declarations

    // The holder of a top-level declaration: $K.$kts (units) or a library facade.
    Generator.prototype.topHolder = function (member) {
        if (member.library)
            return J.mem(J.id('$K'), this.session.facadeId(member.pkg || ''));
        return J.mem(J.id('$K'), '$kts');
    };
})(globalThis);
