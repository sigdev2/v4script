// C#: symbols - namespaces, types, type parameters and members; member
// lookup along the hierarchy with hiding, base types and interfaces of
// constructed types, accessibility.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.TypeSymbol)
        return;

    var idCounter = 0;

    function NamespaceSymbol(name, parent) {
        this.kind = 'namespace';
        this.name = name;
        this.parent = parent;
        this.qname = parent === null || parent.qname === '' ? name : parent.qname + '.' + name;
        this.namespaces = Object.create(null);
        // name or name`arity -> TypeSymbol
        this.types = Object.create(null);
    }
    NamespaceSymbol.prototype.child = function (name) {
        var found = this.namespaces[name];
        if (found === undefined)
            found = this.namespaces[name] = new NamespaceSymbol(name, this);
        return found;
    };
    CS.NamespaceSymbol = NamespaceSymbol;

    // The key of a type in its container: Name or Name`2.
    CS.arityKey = function (name, arity) {
        return arity > 0 ? name + '`' + arity : name;
    };

    // kind: class, struct, interface, enum, delegate.
    function TypeSymbol(name, kind, container) {
        this.symbolKind = 'type';
        this.name = name;
        this.kind = kind;
        this.container = container;
        this.typeParams = [];
        // Type parameters of the outer types, then the own ones.
        this.allTypeParams = [];
        this.baseType = null;
        this.interfaces = [];
        // name -> [members declared here]
        this.members = Object.create(null);
        this.memberList = [];
        this.ctors = [];
        this.staticCtor = null;
        this.nestedTypes = Object.create(null);
        this.mods = {};
        this.attributes = [];
        this.node = null;
        this.library = false;
        this.state = 'entered';
        this.completer = null;
        this.qname = container === null || container.kind !== 'namespace' || container.qname === ''
            ? (container !== null && container.kind !== 'namespace' ? container.qname + '.' + name : name)
            : container.qname + '.' + name;
        this.id = ++idCounter;
        this.jsId = name.replace(/[^A-Za-z0-9_]/g, '_') + '$' + this.id;
    }
    TypeSymbol.prototype.complete = function () {
        if (this.state === 'entered' && this.completer !== null) {
            this.state = 'completing';
            this.completer(this);
            this.state = 'complete';
        }
        return this;
    };
    TypeSymbol.prototype.isStatic = function () {
        return this.mods.static === true;
    };
    TypeSymbol.prototype.addMember = function (member) {
        (this.members[member.name] = this.members[member.name] || []).push(member);
        this.memberList.push(member);
    };
    // The full name with the arity: System.Collections.Generic.List`1.
    TypeSymbol.prototype.key = function () {
        return CS.arityKey(this.qname, this.typeParams.length);
    };
    CS.TypeSymbol = TypeSymbol;

    CS.TypeParamSymbol = function (name, owner, index) {
        return { symbolKind: 'typeparam', name: name, owner: owner, index: index, variance: null, id: ++idCounter,
                 constraints: { class: false, struct: false, new: false, unmanaged: false, notnull: false, types: [] },
                 jsName: null };
    };

    // access: public, private, protected, internal, protected internal,
    // private protected.
    function accessOf(mods, fallback) {
        if (mods.public)
            return 'public';
        if (mods.protected && mods.internal)
            return 'protected internal';
        if (mods.private && mods.protected)
            return 'private protected';
        if (mods.protected)
            return 'protected';
        if (mods.internal)
            return 'internal';
        if (mods.private)
            return 'private';
        return fallback;
    }
    CS.accessOf = accessOf;

    CS.FieldSymbol = function (name, type, owner, mods) {
        return { symbolKind: 'field', name: name, type: type, owner: owner, isStatic: !!mods.static || !!mods.const,
                 isConst: !!mods.const, isReadonly: !!mods.readonly, constant: undefined, jsName: null, node: null,
                 access: accessOf(mods, owner.kind === 'interface' ? 'public' : 'private'), mods: mods };
    };

    CS.MethodSymbol = function (name, owner, mods) {
        return { symbolKind: 'method', name: name, owner: owner, mods: mods, typeParams: [], params: [],
                 returnType: CS.VOID, refReturn: false, isStatic: !!mods.static, isVirtual: !!mods.virtual,
                 isAbstract: !!mods.abstract, isOverride: !!mods.override, isSealed: !!mods.sealed, isNew: !!mods.new,
                 isExtern: !!mods.extern, isAsync: !!mods.async, isExtension: false, isCtor: false, isOperator: false,
                 isConversion: false, accessorOf: null, overridden: null, explicitIface: null, jsName: null,
                 node: null, access: accessOf(mods, owner.kind === 'interface' ? 'public' : 'private'), id: ++idCounter };
    };

    CS.ParamSymbol = function (name, type, refKind, index) {
        return { symbolKind: 'param', name: name, type: type, refKind: refKind || '', isParams: false, hasDefault: false,
                 defaultValue: undefined, index: index, jsName: null };
    };

    CS.PropertySymbol = function (name, type, owner, mods) {
        return { symbolKind: 'property', name: name, type: type, owner: owner, mods: mods, getter: null, setter: null,
                 params: [], isIndexer: false, isStatic: !!mods.static, isVirtual: !!mods.virtual,
                 isAbstract: !!mods.abstract, isOverride: !!mods.override, isSealed: !!mods.sealed, isNew: !!mods.new,
                 isAuto: false, isRequired: !!mods.required, backingField: null, overridden: null, explicitIface: null,
                 jsName: null, node: null, refReturn: false,
                 access: accessOf(mods, owner.kind === 'interface' ? 'public' : 'private'), id: ++idCounter };
    };

    CS.EventSymbol = function (name, type, owner, mods) {
        return { symbolKind: 'event', name: name, type: type, owner: owner, mods: mods, adder: null, remover: null,
                 isStatic: !!mods.static, isVirtual: !!mods.virtual, isAbstract: !!mods.abstract,
                 isOverride: !!mods.override, isFieldLike: false, backingField: null, jsName: null, node: null,
                 access: accessOf(mods, owner.kind === 'interface' ? 'public' : 'private'), id: ++idCounter };
    };

    CS.LocalSymbol = function (name, type, kind) {
        return { symbolKind: 'local', name: name, type: type, kind: kind || 'local', refKind: '', isConst: false,
                 constant: undefined, jsName: null, captured: false, byRef: false, id: ++idCounter, assigned: false,
                 readonly: false };
    };

    // --- Base types and interfaces

    // The base class of a type (constructed), or null for object,
    // interfaces and type parameters without a class bound.
    CS.baseTypeOf = function (type) {
        if (type.kind === 'named') {
            var sym = type.sym.complete();
            if (sym.baseType === null)
                return null;
            return CS.subst(sym.baseType, CS.typeMap(type));
        }
        if (type.kind === 'array')
            return CS.libraryType('System.Array');
        if (type.kind === 'tparam')
            return CS.effectiveBaseClass(type.sym);
        return null;
    };

    // The effective base class of a type parameter.
    CS.effectiveBaseClass = function (sym) {
        if (sym.constraints.struct || sym.constraints.unmanaged)
            return CS.libraryType('System.ValueType');
        for (var index = 0; index < sym.constraints.types.length; ++index) {
            var bound = sym.constraints.types[index];
            if (bound.kind === 'named' && (bound.sym.kind === 'class' || bound.sym.kind === 'delegate'))
                return bound;
            if (bound.kind === 'array')
                return bound;
            if (bound.kind === 'tparam') {
                var outer = CS.effectiveBaseClass(bound.sym);
                if (!CS.isSpecial(outer, 'object'))
                    return outer;
            }
        }
        return CS.objectType();
    };

    // All interfaces of a type (constructed), base interfaces included,
    // without repeats.
    CS.interfacesOf = function (type) {
        var result = [];
        function add(iface) {
            for (var index = 0; index < result.length; ++index) {
                if (CS.sameType(result[index], iface))
                    return;
            }
            result.push(iface);
            var sym = iface.sym.complete();
            var map = CS.typeMap(iface);
            sym.interfaces.forEach(function (base) { add(CS.subst(base, map)); });
        }
        if (type.kind === 'named') {
            var sym = type.sym.complete();
            var map = CS.typeMap(type);
            sym.interfaces.forEach(function (iface) { add(CS.subst(iface, map)); });
            var base = CS.baseTypeOf(type);
            if (base !== null)
                CS.interfacesOf(base).forEach(add);
        } else if (type.kind === 'tparam') {
            type.sym.constraints.types.forEach(function (bound) {
                if (CS.isInterface(bound))
                    add(bound);
                else if (bound.kind === 'tparam')
                    CS.interfacesOf(bound).forEach(add);
                else if (bound.kind === 'named')
                    CS.interfacesOf(bound).forEach(add);
            });
        } else if (type.kind === 'array') {
            var elem = type.elem;
            if (type.rank === 1) {
                ['System.Collections.Generic.IList`1', 'System.Collections.Generic.IReadOnlyList`1'].forEach(function (name) {
                    add(CS.libraryType(name, [elem]));
                });
            }
            CS.interfacesOf(CS.libraryType('System.Array')).forEach(add);
        }
        return result;
    };

    // The chain of classes: the type, its base, ... object.
    CS.classChain = function (type) {
        var chain = [];
        var current = type;
        while (current !== null) {
            chain.push(current);
            current = CS.baseTypeOf(current);
        }
        return chain;
    };

    // The supertype of type whose symbol is sym (List<int> for
    // IList<int> and List`1), or null.
    CS.asSuper = function (type, sym) {
        if (type.kind === 'named' && type.sym === sym)
            return type;
        if (type.kind === 'named' || type.kind === 'tparam' || type.kind === 'array') {
            if (sym.kind === 'interface') {
                var ifaces = CS.interfacesOf(type);
                for (var index = 0; index < ifaces.length; ++index) {
                    if (ifaces[index].sym === sym)
                        return ifaces[index];
                }
                return null;
            }
            var base = CS.baseTypeOf(type);
            while (base !== null) {
                if (base.kind === 'named' && base.sym === sym)
                    return base;
                base = CS.baseTypeOf(base);
            }
        }
        return null;
    };

    // Whether sym derives from (or is) other: classes only.
    CS.derivesFrom = function (sym, other) {
        for (var current = sym; current !== null; current = current.baseType === null ? null : current.baseType.sym) {
            if (current === other)
                return true;
            current.complete();
        }
        return false;
    };

    // --- Accessibility

    // The type whose members the code is in (fromType) may use member.
    CS.isAccessible = function (member, fromType, receiverType) {
        var access = member.access;
        if (access === 'public' || access === 'internal' || access === 'protected internal')
            return true;
        var owner = member.owner;
        // A member is visible in its type and the types nested in it.
        for (var current = fromType; current !== null && current !== undefined; current = current.container) {
            if (current.symbolKind !== 'type')
                break;
            if (current === owner || (current.original !== undefined && current.original === owner))
                return true;
            if ((access === 'protected' || access === 'private protected') && CS.derivesFrom(current, owner)) {
                return true;
            }
        }
        return false;
    };

    // --- Member lookup

    // Members by name in a type and its bases, hidden ones removed: a
    // non-method hides everything with its name, a method hides methods with
    // its signature. Overrides are left out (the overridden member stands
    // for them). Element: { member, owner: the constructed declaring type }.
    CS.lookupMembers = function (type, name) {
        var result = [];
        var types = lookupOrder(type);
        var hiddenAll = false;
        var hiddenSignatures = [];
        for (var index = 0; index < types.length && !hiddenAll; ++index) {
            var current = types[index];
            var sym = current.sym.complete();
            var list = sym.members[name];
            if (list === undefined)
                continue;
            var levelHidesAll = false;
            var levelSignatures = [];
            for (var memberIndex = 0; memberIndex < list.length; ++memberIndex) {
                var member = list[memberIndex];
                if (member.symbolKind === 'method' && member.isOverride)
                    continue;
                if ((member.symbolKind === 'property' || member.symbolKind === 'event') && member.isOverride)
                    continue;
                if (member.explicitIface !== null && member.explicitIface !== undefined)
                    continue;
                if (member.symbolKind === 'method') {
                    var signature = CS.signatureKey(member, CS.typeMap(current));
                    if (hiddenSignatures.indexOf(signature) >= 0)
                        continue;
                    levelSignatures.push(signature);
                } else {
                    levelHidesAll = true;
                }
                result.push({ member: member, owner: current });
            }
            hiddenSignatures = hiddenSignatures.concat(levelSignatures);
            // Interfaces: members of base interfaces stay (a derived one with
            // the same name hides them only on the same path - simplified).
            if (levelHidesAll && !(current.sym.kind === 'interface'))
                hiddenAll = true;
        }
        return result;
    };

    // The types whose members are looked up: the class chain, then the
    // interfaces (for interfaces and type parameters), then object.
    function lookupOrder(type) {
        if (type.kind === 'named' && type.sym.kind === 'interface') {
            var order = [type].concat(CS.interfacesOf(type));
            order.push(CS.objectType());
            return order;
        }
        if (type.kind === 'tparam') {
            var chain = CS.classChain(CS.effectiveBaseClass(type.sym));
            return CS.interfacesOf(type).concat(chain);
        }
        // Arrays: the members of System.Array (not those of their interfaces).
        if (type.kind === 'array')
            return CS.classChain(CS.libraryType('System.Array'));
        if (type.kind === 'dynamic')
            return [CS.objectType()];
        if (type.kind !== 'named')
            return [];
        return CS.classChain(type);
    }
    CS.lookupOrder = lookupOrder;

    // The signature of a method for hiding and overriding: the parameter
    // types (after substitution, method type parameters by position) and
    // ref kinds.
    CS.signatureKey = function (method, map) {
        var methodMap = new Map();
        method.typeParams.forEach(function (param, index) {
            methodMap.set(param, { kind: 'tparam', sym: { name: '!!' + index, id: -1 - index, constraints: param.constraints } });
        });
        return method.name + '`' + method.typeParams.length + '(' + method.params.map(function (param) {
            var type = CS.subst(CS.subst(param.type, map), methodMap);
            return (param.refKind === 'out' || param.refKind === 'ref' || param.refKind === 'in' ? 'ref ' : '') +
                CS.signatureTypeKey(type);
        }).join(',') + ')';
    };

    CS.signatureTypeKey = function (type) {
        if (type.kind === 'tparam' && type.sym.id < 0)
            return type.sym.name;
        if (type.kind === 'dynamic')
            return CS.typeKey(CS.objectType());
        if (type.kind === 'named' && type.args.length > 0)
            return type.sym.jsId + '<' + type.args.map(CS.signatureTypeKey).join(',') + '>';
        if (type.kind === 'array')
            return CS.signatureTypeKey(type.elem) + '[' + type.rank + ']';
        return CS.typeKey(type);
    };

    // The nested type by name and arity in a type or its bases.
    CS.findNestedType = function (sym, name, arity) {
        var key = CS.arityKey(name, arity);
        for (var current = sym; current !== null; current = current.baseType !== null ? current.baseType.sym : null) {
            current.complete();
            var found = current.nestedTypes[key];
            if (found !== undefined)
                return found;
        }
        return null;
    };

    // The constructed type of a nested type reached through a constructed
    // outer type: List<int>.Enumerator.
    CS.nestedIn = function (outerType, nestedSym, ownArgs) {
        var outerArgs = outerType.kind === 'named' ? outerType.args : [];
        var needed = nestedSym.allTypeParams.length - nestedSym.typeParams.length;
        var args = outerArgs.slice(0, needed);
        while (args.length < needed)
            args.push(CS.typeParam(nestedSym.allTypeParams[args.length]));
        return CS.named(nestedSym, args.concat(ownArgs || []));
    };
})(globalThis);
