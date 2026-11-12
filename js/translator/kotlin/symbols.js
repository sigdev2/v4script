// Kotlin: symbols - classes, type parameters, functions, properties,
// variables - and Java classes seen from Kotlin: types of Java members
// become Kotlin types (java.util.List - MutableList, int - Int, an unknown
// nullability - a flexible type), getters become properties.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Java = T.java;
    if (Kt.ClassSym)
        return;

    var classCounter = 0;

    function ClassSym(name, fqName, kind) {
        this.name = name;
        this.fqName = fqName;
        this.displayName = name;
        this.kind = kind;
        this.mods = Object.create(null);
        this.typeParams = [];
        this.supers = [];
        this.superclass = null;
        this.members = Object.create(null);
        this.statics = Object.create(null);
        this.ctors = [];
        this.nested = Object.create(null);
        this.companion = null;
        this.outer = null;
        this.inner = false;
        this.isLocal = false;
        this.anonymous = false;
        this.java = null;
        this.prim = null;
        this.jsId = name.replace(/[^A-Za-z0-9_]/g, '_') + '$k' + (++classCounter);
        this.node = null;
        this.state = 'entered';
        this.completer = null;
        // The header (type parameters, supertypes) completes before the
        // members: a type reference needs only the header.
        this.headerState = 'entered';
        this.headerCompleter = null;
        this.library = false;
        this.sealedSubclasses = [];
        this.entries = [];
        this.pkg = '';
    }
    ClassSym.prototype.isInterface = function () {
        return this.kind === 'interface' || this.kind === 'annotation';
    };
    ClassSym.prototype.isObject = function () {
        return this.kind === 'object';
    };
    ClassSym.prototype.completeHeader = function () {
        if (this.headerState === 'entered' && this.headerCompleter !== null) {
            this.headerState = 'completing';
            this.headerCompleter(this);
            this.headerState = 'complete';
        }
        return this;
    };
    // Supertypes and member signatures - on first demand.
    ClassSym.prototype.complete = function () {
        this.completeHeader();
        if (this.state === 'entered' && this.completer !== null) {
            this.state = 'completing';
            this.completer(this);
            this.state = 'complete';
        }
        return this;
    };
    ClassSym.prototype.isOpen = function () {
        return this.isInterface() || !!this.mods.open || !!this.mods.abstract || !!this.mods.sealed ||
            (this.java !== null && !this.mappedBuiltin && !this.javaFinal);
    };
    ClassSym.prototype.thisType = function () {
        return Kt.classType(this, this.typeParams.map(function (param) { return Kt.arg(Kt.paramType(param)); }), false);
    };
    ClassSym.prototype.addMember = function (member) {
        (this.members[member.name] = this.members[member.name] || []).push(member);
    };
    Kt.ClassSym = ClassSym;

    Kt.TypeParamSym = function (name, owner) {
        return { kind: 'tparam', name: name, bounds: [], variance: '', reified: false, owner: owner };
    };

    Kt.FunSym = function (name, owner, mods) {
        return { kind: 'fun', name: name, owner: owner, mods: mods || {}, typeParams: [], receiver: null, params: [],
                 returns: null, node: null, jsName: null, isCtor: false, java: null, intrinsic: null,
                 isAbstract: false, isOverride: false, overrides: null, facade: null, varargIndex: -1, isStatic: false,
                 library: false };
    };

    Kt.ParamSym = function (name, type) {
        return { kind: 'param', name: name, type: type, hasDefault: false, vararg: false, node: null, jsName: null };
    };

    Kt.PropSym = function (name, owner, mods) {
        return { kind: 'prop', name: name, owner: owner, mods: mods || {}, type: null, mutable: false, receiver: null,
                 typeParams: [], node: null, jsName: null, getterName: null, setterName: null, hasField: true,
                 isConst: false, constValue: undefined, java: null, intrinsic: null, isAbstract: false,
                 isOverride: false, overrides: null, facade: null, isStatic: false, library: false };
    };

    // A local variable or a parameter.
    Kt.VarSym = function (name, type, mutable) {
        return { kind: 'var', name: name, type: type, mutable: !!mutable, jsName: null, node: null, captured: false,
                 assignedInLambda: false };
    };

    // --- Java classes

    // Java classes that are Kotlin builtins: the Kotlin symbol is used.
    var MAPPED = {
        'java.lang.Object': 'Any',
        'java.lang.String': 'String',
        'java.lang.CharSequence': 'CharSequence',
        'java.lang.Comparable': 'Comparable',
        'java.lang.Number': 'Number',
        'java.lang.Throwable': 'Throwable',
        'java.lang.Enum': 'Enum',
        'java.lang.Iterable': 'MutableIterable',
        'java.util.Iterator': 'MutableIterator',
        'java.util.ListIterator': 'MutableListIterator',
        'java.util.Collection': 'MutableCollection',
        'java.util.List': 'MutableList',
        'java.util.Set': 'MutableSet',
        'java.util.Map': 'MutableMap',
        'java.util.Map.Entry': 'MutableEntry',
        'java.lang.Cloneable': 'Cloneable',
        'java.lang.Integer': 'Int',
        'java.lang.Long': 'Long',
        'java.lang.Short': 'Short',
        'java.lang.Byte': 'Byte',
        'java.lang.Double': 'Double',
        'java.lang.Float': 'Float',
        'java.lang.Character': 'Char',
        'java.lang.Boolean': 'Boolean',
        'java.lang.Void': 'Nothing'
    };
    Kt.JAVA_MAPPED = MAPPED;

    var PRIMITIVES = { int: 'Int', long: 'Long', short: 'Short', byte: 'Byte', double: 'Double', float: 'Float', char: 'Char',
                       boolean: 'Boolean' };
    var PRIMITIVE_ARRAYS = { int: 'IntArray', long: 'LongArray', short: 'ShortArray', byte: 'ByteArray', double: 'DoubleArray',
                             float: 'FloatArray', char: 'CharArray', boolean: 'BooleanArray' };

    // The Kotlin symbol of a Java class (a wrapper made once per session).
    Kt.javaClass = function (javaSym) {
        var mapped = MAPPED[javaSym.qname];
        if (mapped !== undefined && Kt.builtins[mapped] !== undefined) {
            // Integer.toBinaryString: the statics of the Java class stay reachable.
            var builtin = Kt.builtins[mapped];
            if (builtin.javaStatics === undefined)
                builtin.javaStatics = function () { return javaClassOf(javaSym); };
            return builtin;
        }
        return javaClassOf(javaSym);
    };

    function javaClassOf(javaSym) {
        var session = Kt.session;
        var known = session.javaClasses.get(javaSym);
        if (known !== undefined)
            return known;
        var sym = new ClassSym(javaSym.name, javaSym.qname, javaSym.isInterface() ? 'interface' : (javaSym.flavor === 'enum' ? 'enum' : 'class'));
        sym.displayName = javaSym.displayName;
        sym.java = javaSym;
        sym.jsId = javaSym.jsId;
        sym.library = true;
        sym.fromJava = true;
        sym.javaFinal = !!javaSym.mods.final;
        sym.mods.abstract = !!javaSym.mods.abstract;
        sym.pkg = javaSym.qname.substring(0, javaSym.qname.length - javaSym.name.length - 1);
        session.javaClasses.set(javaSym, sym);
        javaSym.complete();
        var map = new Map();
        sym.typeParams = javaSym.typeParams.map(function (javaParam) {
            var param = Kt.TypeParamSym(javaParam.name, sym);
            map.set(javaParam, Kt.paramType(param));
            return param;
        });
        sym.javaMap = map;
        sym.headerCompleter = completeJavaClass;
        return sym;
    }

    function completeJavaClass(sym) {
        var javaSym = sym.java;
        var map = sym.javaMap;
        sym.typeParams.forEach(function (param, index) {
            param.bounds = javaSym.typeParams[index].bounds.map(function (bound) { return Kt.fromJava(bound, map, true); })
                .filter(function (bound) { return !Kt.isClass(bound, 'Any'); });
        });
        if (javaSym.superclass !== null) {
            sym.superclass = Kt.makeNotNull(Kt.fromJava(javaSym.superclass, map, false));
            sym.supers.push(sym.superclass);
        }
        javaSym.interfaces.forEach(function (iface) {
            sym.supers.push(Kt.makeNotNull(Kt.fromJava(iface, map, false)));
        });
        Object.keys(javaSym.memberTypes).forEach(function (name) {
            sym.nested[name] = Kt.javaClass(javaSym.memberTypes[name]);
        });
        javaSym.ctors.forEach(function (ctor) {
            if (ctor.mods.private)
                return;
            sym.ctors.push(javaFunction(ctor, sym, map));
        });
        sym.javaMembersLoaded = false;
    }

    // Members of a Java class by name (on demand: a Java class has many).
    Kt.javaMembers = function (sym, name, statics) {
        sym.complete();
        var cache = statics ? (sym.javaStaticCache = sym.javaStaticCache || Object.create(null))
                            : (sym.javaCache = sym.javaCache || Object.create(null));
        if (cache[name] !== undefined)
            return cache[name];
        var javaSym = sym.java;
        var result = [];
        var methods = javaSym.methods[name] || [];
        methods.forEach(function (method) {
            if (method.mods.private || !!method.isStatic !== !!statics)
                return;
            result.push(javaFunction(method, sym, sym.javaMap));
        });
        var field = javaSym.fields[name];
        if (field !== undefined && !field.mods.private && !!field.isStatic === !!statics)
            result.push(javaField(field, sym, sym.javaMap));
        if (!statics) {
            // Synthetic properties: getName() - name, isEmpty() - isEmpty.
            var getter = syntheticProperty(sym, name);
            if (getter !== null)
                result.push(getter);
        }
        cache[name] = result;
        return result;
    };

    function capitalize(name) {
        return name.charAt(0).toUpperCase() + name.substring(1);
    }

    function syntheticProperty(sym, name) {
        var javaSym = sym.java;
        var candidates = [];
        if (/^is[A-Z]/.test(name))
            candidates.push(name);
        candidates.push('get' + capitalize(name));
        for (var index = 0; index < candidates.length; ++index) {
            var getters = (javaSym.methods[candidates[index]] || []).filter(function (method) {
                return !method.isStatic && method.params.length === 0 && !method.mods.private &&
                    Java.resolved(method.returns).kind !== 'void';
            });
            if (getters.length === 0)
                continue;
            var getter = getters[0];
            var prop = Kt.PropSym(name, sym, {});
            prop.type = Kt.fromJava(getter.returns, sym.javaMap, true);
            prop.java = { getter: getter };
            prop.getterName = getter.jsName;
            prop.hasField = false;
            prop.library = true;
            var setters = (javaSym.methods['set' + capitalize(name.replace(/^is(?=[A-Z])/, ''))] || []).filter(function (method) {
                return !method.isStatic && method.params.length === 1 && !method.mods.private;
            });
            if (setters.length > 0) {
                prop.mutable = true;
                prop.java.setter = setters[0];
                prop.setterName = setters[0].jsName;
            }
            return prop;
        }
        return null;
    }

    function javaFunction(method, owner, classMap) {
        var fn = Kt.FunSym(method.isCtor ? '<init>' : method.name, owner, {});
        fn.java = method;
        fn.isCtor = method.isCtor;
        fn.isStatic = method.isStatic;
        fn.isAbstract = method.isAbstract;
        fn.library = true;
        fn.jsName = method.jsName;
        var map = new Map(classMap);
        fn.typeParams = method.typeParams.map(function (javaParam) {
            var param = Kt.TypeParamSym(javaParam.name, fn);
            map.set(javaParam, Kt.paramType(param));
            return param;
        });
        fn.typeParams.forEach(function (param, index) {
            param.bounds = method.typeParams[index].bounds.map(function (bound) { return Kt.fromJava(bound, map, true); })
                .filter(function (bound) { return !Kt.isClass(bound, 'Any'); });
        });
        fn.params = method.params.map(function (javaType, index) {
            var isVararg = method.varargs && index === method.params.length - 1;
            var type = isVararg ? Kt.fromJava(Java.resolved(javaType).elem, map, true) : Kt.fromJava(javaType, map, true);
            var param = Kt.ParamSym(method.paramNames[index] || ('p' + index), type);
            param.vararg = isVararg;
            if (isVararg) {
                // As for Kotlin: the type is the array, the element type is separate.
                fn.varargIndex = index;
                param.javaArray = Java.resolved(javaType);
                param.elementType = Kt.makeNotNullFlexible(type);
                param.type = Kt.varargArray(param.elementType);
            }
            return param;
        });
        fn.returns = method.isCtor ? Kt.unitType() : Kt.fromJava(method.returns, map, true);
        fn.javaMap = map;
        // Natives that wait make the function a fiber.
        fn.waits = !!method.async;
        return fn;
    }

    function javaField(field, owner, map) {
        var prop = Kt.PropSym(field.name, owner, {});
        prop.type = Kt.fromJava(field.type, map, true);
        prop.java = { field: field };
        prop.mutable = !field.isFinal;
        prop.isStatic = field.isStatic;
        prop.jsName = field.jsName;
        prop.library = true;
        if (field.constant !== undefined)
            prop.constValue = field.constant;
        return prop;
    }

    // A Java type as a Kotlin type. flexible - a platform type (from a
    // signature); supertypes are not flexible.
    Kt.fromJava = function (type, map, flexible) {
        type = Java.resolved(type);
        switch (type.kind) {
        case 'prim':
            return Kt.builtinType(PRIMITIVES[type.name]);
        case 'void':
            return Kt.unitType();
        case 'class': {
            var mapped = MAPPED[type.sym.qname];
            var sym = mapped !== undefined ? Kt.builtins[mapped] : Kt.javaClass(type.sym);
            var args = type.args.map(function (arg) { return javaArg(arg, map); });
            if (args.length === 0 && sym.typeParams.length > 0) {
                // A raw type: arguments are stars.
                args = sym.typeParams.map(function () { return Kt.STAR; });
            }
            if (mapped === 'MutableEntry' || sym === Kt.builtins.MutableEntry)
                sym = Kt.builtins.MutableEntry;
            return Kt.classType(sym, args, flexible, flexible);
        }
        case 'array': {
            var elem = Java.resolved(type.elem);
            if (elem.kind === 'prim')
                return Kt.classType(Kt.builtins[PRIMITIVE_ARRAYS[elem.name]], [], flexible, flexible);
            return Kt.classType(Kt.builtins.Array, [Kt.arg(Kt.fromJava(elem, map, flexible), flexible ? 'out' : '')], flexible, flexible);
        }
        case 'tvar': {
            var param = map.get(type.sym);
            if (param === undefined)
                return Kt.nullableAny();
            if (flexible && param.kind === 'param')
                return { kind: 'param', sym: param.sym, nullable: false, flexible: true };
            return param;
        }
        case 'wild':
            return type.bound !== null ? Kt.fromJava(type.bound, map, flexible) : Kt.nullableAny();
        case 'inter':
            return Kt.fromJava(type.types[0], map, flexible);
        case 'null':
            return Kt.NULL_TYPE;
        }
        return Kt.nullableAny();
    };

    function javaArg(arg, map) {
        arg = Java.resolved(arg);
        if (arg.kind === 'wild') {
            if (arg.bound === null)
                return Kt.STAR;
            return Kt.arg(Kt.fromJava(arg.bound, map, true), arg.upper ? 'out' : 'in');
        }
        return Kt.arg(Kt.fromJava(arg, map, true));
    }

    // A Java class by the full name or null.
    Kt.javaClassNamed = function (qname) {
        var javaSym = Kt.session.javaSession.symtab.lookupQualified(qname);
        return javaSym === null ? null : Kt.javaClass(javaSym);
    };

    // The Java method of a functional interface (Runnable, Comparator) as a
    // function type, or null: lambdas convert to such interfaces (SAM).
    Kt.samType = function (type) {
        type = Kt.resolved(type);
        if (type.kind !== 'class')
            return null;
        var sym = type.sym;
        if (sym.java !== null && !sym.mappedBuiltin) {
            if (!sym.java.isInterface())
                return null;
            var functional = Java.functionalMethod(Java.classType(sym.java, []));
            if (functional === null)
                return null;
            sym.complete();
            var method = functional.method;
            var fn = Kt.javaMembers(sym, method.name, false).filter(function (member) {
                return member.kind === 'fun' && member.java === method;
            })[0];
            if (fn === undefined) {
                // An inherited method: from the interface that declares it.
                var owner = Kt.javaClass(method.owner);
                fn = Kt.javaMembers(owner, method.name, false).filter(function (member) {
                    return member.kind === 'fun' && member.java === method;
                })[0];
                if (fn === undefined)
                    return null;
                var ownerType = Kt.asSuper(type, owner);
                return samOf(fn, ownerType === null ? Kt.classType(owner, []) : ownerType);
            }
            return samOf(fn, type);
        }
        if (sym.mods.fun && sym.isInterface()) {
            var abstract = null;
            sym.complete();
            Object.keys(sym.members).forEach(function (name) {
                sym.members[name].forEach(function (member) {
                    if (member.kind === 'fun' && member.isAbstract)
                        abstract = member;
                });
            });
            return abstract === null ? null : samOf(abstract, type);
        }
        return null;
    };

    function samOf(fn, type) {
        var map = Kt.typeMap(type);
        // A wildcard of the interface (Comparator<in T>) gives its bound.
        var params = fn.params.map(function (param) { return Kt.makeNotNullFlexible(Kt.subst(param.type, map)); });
        var returns = Kt.subst(fn.returns, map);
        return { fn: fn, type: Kt.funType(null, params, returns, false, false), iface: type };
    }

    Kt.makeNotNullFlexible = function (type) {
        type = Kt.resolved(type);
        if (type.flexible)
            return Kt.withNullability(type, false);
        return type;
    };
})(globalThis);
