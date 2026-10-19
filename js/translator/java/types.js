// Java: types - primitives, classes with arguments, arrays, type
// variables, wildcards, inference variables; subtyping, erasure,
// substitution, boxing.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.types)
        return;

    function primitive(name, kind, rank) {
        return { kind: 'prim', name: name, num: kind, rank: rank };
    }

    var types = {
        boolean: primitive('boolean', null, 0),
        byte: primitive('byte', 'i8', 1),
        short: primitive('short', 'i16', 2),
        char: primitive('char', 'u16', 2),
        int: primitive('int', 'i32', 3),
        long: primitive('long', 'i64', 4),
        float: primitive('float', 'f32', 5),
        double: primitive('double', 'f64', 6),
        void: { kind: 'void', name: 'void' },
        nul: { kind: 'null', name: 'null' }
    };
    Java.types = types;

    // The boxes of the primitives (full class names).
    var BOXES = { boolean: 'java.lang.Boolean', byte: 'java.lang.Byte', short: 'java.lang.Short', char: 'java.lang.Character',
                  int: 'java.lang.Integer', long: 'java.lang.Long', float: 'java.lang.Float', double: 'java.lang.Double' };
    var UNBOXES = {};
    Object.keys(BOXES).forEach(function (name) { UNBOXES[BOXES[name]] = types[name]; });
    Java.BOXES = BOXES;

    Java.classType = function (sym, args) {
        return { kind: 'class', sym: sym, args: args || [] };
    };
    Java.arrayType = function (elem) {
        return { kind: 'array', elem: elem };
    };
    Java.typeVar = function (sym) {
        return { kind: 'tvar', sym: sym };
    };
    Java.wildcard = function (bound, upper) {
        return { kind: 'wild', bound: bound || null, upper: upper !== false };
    };

    var ivarCounter = 0;
    // An inference variable: lower, upper and equality bounds.
    Java.inferenceVar = function (sym) {
        return { kind: 'ivar', id: ++ivarCounter, sym: sym, lower: [], upper: [], eq: [], value: null };
    };

    Java.isPrimitive = function (type) {
        return type.kind === 'prim';
    };
    Java.isNumeric = function (type) {
        return type.kind === 'prim' && type.num !== null;
    };
    Java.isIntegral = function (type) {
        return type.kind === 'prim' && (type.num === 'i8' || type.num === 'i16' || type.num === 'u16' || type.num === 'i32' ||
                                        type.num === 'i64');
    };
    Java.isReference = function (type) {
        return type.kind === 'class' || type.kind === 'array' || type.kind === 'tvar' || type.kind === 'null' ||
            type.kind === 'ivar' || type.kind === 'inter';
    };
    // The primitive of a box or null.
    Java.unboxedType = function (type) {
        if (type.kind === 'class')
            return UNBOXES[type.sym.qname] || null;
        if (type.kind === 'ivar' && type.value !== null)
            return Java.unboxedType(type.value);
        return null;
    };

    Java.boxedType = function (symtab, type) {
        return Java.classType(symtab.classNamed(BOXES[type.name]), []);
    };

    // A type as javac writes it: List<Integer>, int[], ? extends T.
    Java.typeString = function (type, qualified) {
        switch (type.kind) {
        case 'prim':
        case 'void':
        case 'null':
            return type.name === 'null' ? '<nulltype>' : type.name;
        case 'class': {
            var name = qualified ? type.sym.qname : type.sym.displayName;
            if (type.args.length === 0)
                return name;
            return name + '<' + type.args.map(function (arg) { return Java.typeString(arg, qualified); }).join(',') + '>';
        }
        case 'array':
            return Java.typeString(type.elem, qualified) + '[]';
        case 'tvar':
            return type.sym.name;
        case 'wild':
            if (type.bound === null)
                return '?';
            return '? ' + (type.upper ? 'extends ' : 'super ') + Java.typeString(type.bound, qualified);
        case 'ivar':
            return type.value !== null ? Java.typeString(type.value, qualified) : type.sym.name;
        case 'inter':
            return type.types.map(function (item) { return Java.typeString(item, qualified); }).join('&');
        }
        return '?';
    };

    // An inference variable gives its value if it is found already.
    Java.resolved = function (type) {
        while (type.kind === 'ivar' && type.value !== null)
            type = type.value;
        return type;
    };

    Java.erasure = function (type) {
        type = Java.resolved(type);
        switch (type.kind) {
        case 'class':
            return type.args.length === 0 ? type : Java.classType(type.sym, []);
        case 'array':
            return Java.arrayType(Java.erasure(type.elem));
        case 'tvar':
            return type.sym.bounds.length > 0 ? Java.erasure(type.sym.bounds[0]) : Java.objectType();
        case 'wild':
            return type.upper && type.bound !== null ? Java.erasure(type.bound) : Java.objectType();
        case 'inter':
            return Java.erasure(type.types[0]);
        case 'ivar':
            return Java.objectType();
        }
        return type;
    };

    // map: Map(type variable symbol -> type).
    Java.subst = function (type, map) {
        if (map === null || map.size === 0)
            return type;
        switch (type.kind) {
        case 'tvar': {
            var found = map.get(type.sym);
            return found !== undefined ? found : type;
        }
        case 'class':
            if (type.args.length === 0)
                return type;
            return Java.classType(type.sym, type.args.map(function (arg) { return Java.subst(arg, map); }));
        case 'array':
            return Java.arrayType(Java.subst(type.elem, map));
        case 'wild':
            return type.bound === null ? type : Java.wildcard(Java.subst(type.bound, map), type.upper);
        case 'inter':
            return { kind: 'inter', types: type.types.map(function (item) { return Java.subst(item, map); }) };
        }
        return type;
    };
    // The current symbol table of the session (the session sets it before the check).
    Java.symtab = null;

    Java.objectType = function () {
        return Java.classType(Java.symtab.object, []);
    };
    Java.stringType = function () {
        return Java.classType(Java.symtab.classNamed('java.lang.String'), []);
    };

    // Substitutes the class parameters with type arguments (a raw type -
    // without substitution: erasure).
    Java.typeMap = function (type) {
        var map = new Map();
        var params = type.sym.typeParams;
        if (type.args.length === params.length) {
            // A simplified wildcard capture: ? extends B and ? super B are B,
            // ? is the bound of the parameter.
            params.forEach(function (param, index) {
                var arg = Java.resolved(type.args[index]);
                if (arg.kind === 'wild')
                    arg = arg.bound !== null ? arg.bound : (param.bounds.length > 0 ? Java.erasure(param.bounds[0]) : Java.objectType());
                map.set(param, arg);
            });
        } else if (params.length > 0) {
            params.forEach(function (param) { map.set(param, Java.erasure(Java.typeVar(param))); });
        }
        return map;
    };

    // The direct supertypes of a class type, substituted.
    Java.directSupertypes = function (type) {
        var sym = type.sym;
        sym.complete();
        var map = Java.typeMap(type);
        var result = [];
        if (sym.superclass !== null)
            result.push(Java.subst(sym.superclass, map));
        sym.interfaces.forEach(function (iface) { result.push(Java.subst(iface, map)); });
        if (result.length === 0 && sym !== Java.symtab.object)
            result.push(Java.objectType());
        return result;
    };

    // The supertype of type with the class sym (List<String> for
    // ArrayList<String> and List) or null.
    Java.asSuper = function (type, sym) {
        type = Java.resolved(type);
        if (type.kind === 'class') {
            if (type.sym === sym)
                return type;
            var supers = Java.directSupertypes(type);
            for (var index = 0; index < supers.length; ++index) {
                var found = Java.asSuper(supers[index], sym);
                if (found !== null)
                    return found;
            }
            return null;
        }
        if (type.kind === 'tvar') {
            var bounds = type.sym.bounds.length > 0 ? type.sym.bounds : [Java.objectType()];
            for (var boundIndex = 0; boundIndex < bounds.length; ++boundIndex) {
                var viaBound = Java.asSuper(bounds[boundIndex], sym);
                if (viaBound !== null)
                    return viaBound;
            }
            return null;
        }
        if (type.kind === 'inter') {
            for (var partIndex = 0; partIndex < type.types.length; ++partIndex) {
                var part = Java.asSuper(type.types[partIndex], sym);
                if (part !== null)
                    return part;
            }
            return null;
        }
        if (type.kind === 'array' && sym === Java.symtab.object)
            return Java.objectType();
        return null;
    };

    Java.sameType = function (left, right) {
        left = Java.resolved(left);
        right = Java.resolved(right);
        if (left === right)
            return true;
        if (left.kind !== right.kind)
            return false;
        switch (left.kind) {
        case 'prim':
        case 'void':
        case 'null':
            return left.name === right.name;
        case 'class':
            if (left.sym !== right.sym || left.args.length !== right.args.length)
                return false;
            for (var index = 0; index < left.args.length; ++index) {
                if (!Java.sameType(left.args[index], right.args[index]))
                    return false;
            }
            return true;
        case 'array':
            return Java.sameType(left.elem, right.elem);
        case 'tvar':
            return left.sym === right.sym;
        case 'wild':
            return left.upper === right.upper && (left.bound === null ? right.bound === null : right.bound !== null && Java.sameType(left.bound, right.bound));
        }
        return false;
    };
    // --- Bounds of inference variables with rollback (a trial check of the
    // applicability of an overload must not leave them).

    var boundLog = [];

    function addBound(ivar, list, type) {
        ivar[list].push(type);
        boundLog.push([ivar, list]);
    }

    Java.markBounds = function () {
        return boundLog.length;
    };
    Java.rollbackBounds = function (mark) {
        while (boundLog.length > mark) {
            var entry = boundLog.pop();
            entry[0][entry[1]].pop();
        }
    };
    Java.commitBounds = function () {
        boundLog = [];
    };

    function isObject(type) {
        return type.kind === 'class' && type.sym === Java.symtab.object;
    }

    // Equality that records bounds: List<α> = List<String> gives α = String.
    Java.equate = function (left, right) {
        left = Java.resolved(left);
        right = Java.resolved(right);
        if (left === right)
            return true;
        if (left.kind === 'ivar' && right.kind === 'ivar') {
            addBound(left, 'eq', right);
            addBound(right, 'eq', left);
            return true;
        }
        if (left.kind === 'ivar') {
            addBound(left, 'eq', right);
            return true;
        }
        if (right.kind === 'ivar') {
            addBound(right, 'eq', left);
            return true;
        }
        if (left.kind === 'class' && right.kind === 'class' && left.sym === right.sym) {
            if (left.args.length === 0 || right.args.length === 0)
                return true;
            for (var index = 0; index < left.args.length; ++index) {
                if (!Java.equate(left.args[index], right.args[index]))
                    return false;
            }
            return true;
        }
        if (left.kind === 'array' && right.kind === 'array')
            return Java.equate(left.elem, right.elem);
        if (left.kind === 'wild' && right.kind === 'wild' && left.upper === right.upper)
            return left.bound === null || right.bound === null
                ? left.bound === right.bound
                : Java.equate(left.bound, right.bound);
        return Java.sameType(left, right);
    };

    // The type argument targ contains sarg (List<? extends Number> from
    // List<Integer>).
    Java.contains = function (targ, sarg) {
        targ = Java.resolved(targ);
        sarg = Java.resolved(sarg);
        if (targ.kind === 'wild') {
            if (targ.bound === null)
                return true;
            if (targ.upper) {
                var upper = sarg.kind === 'wild' ? (sarg.upper && sarg.bound !== null ? sarg.bound : Java.objectType()) : sarg;
                return Java.isSubtype(upper, targ.bound);
            }
            if (sarg.kind === 'wild')
                return !sarg.upper && sarg.bound !== null && Java.isSubtype(targ.bound, sarg.bound);
            return Java.isSubtype(targ.bound, sarg);
        }
        if (sarg.kind === 'wild' && targ.kind !== 'ivar')
            return false;
        return Java.equate(targ, sarg);
    };
    // Widening of a primitive (int -> long -> float -> double, char -> int).
    var WIDENING = {
        byte: { short: 1, int: 1, long: 1, float: 1, double: 1 },
        short: { int: 1, long: 1, float: 1, double: 1 },
        char: { int: 1, long: 1, float: 1, double: 1 },
        int: { long: 1, float: 1, double: 1 },
        long: { float: 1, double: 1 },
        float: { double: 1 }
    };
    Java.isPrimitiveWidening = function (from, to) {
        return from.name === to.name || (WIDENING[from.name] !== undefined && WIDENING[from.name][to.name] === 1);
    };

    // Combining bounds: a new lower bound is checked against the upper
    // ones (TreeMap<α,β> <: Map<K,D> gives α = K, β = D), a new upper one
    // against the lower ones. Incompatibility with a known bound (without
    // variables) is a failure. The depth is limited: bounds refer to each
    // other.
    var incorporationDepth = 0;

    function incorporate(pairs) {
        if (incorporationDepth > 8)
            return true;
        ++incorporationDepth;
        try {
            for (var index = 0; index < pairs.length; ++index) {
                var lower = pairs[index][0], upper = pairs[index][1];
                var proper = Java.isProper(lower) && Java.isProper(upper);
                if (!Java.isSubtype(lower, upper) && proper)
                    return false;
            }
            return true;
        } finally {
            --incorporationDepth;
        }
    }

    // Subtyping (recording the bounds of inference variables).
    Java.isSubtype = function (subtype, supertype) {
        subtype = Java.resolved(subtype);
        supertype = Java.resolved(supertype);
        if (subtype === supertype)
            return true;
        if (supertype.kind === 'ivar') {
            if (subtype.kind === 'prim')
                return false;
            addBound(supertype, 'lower', subtype);
            return incorporate(supertype.upper.map(function (upper) { return [subtype, upper]; }));
        }
        if (subtype.kind === 'ivar') {
            addBound(subtype, 'upper', supertype);
            return incorporate(subtype.lower.map(function (lower) { return [lower, supertype]; }));
        }
        if (subtype.kind === 'prim' || supertype.kind === 'prim')
            return subtype.kind === 'prim' && supertype.kind === 'prim' && Java.isPrimitiveWidening(subtype, supertype);
        if (subtype.kind === 'null')
            return supertype.kind !== 'void';
        if (supertype.kind === 'inter')
            return supertype.types.every(function (part) { return Java.isSubtype(subtype, part); });
        if (subtype.kind === 'wild')
            return Java.isSubtype(subtype.upper && subtype.bound !== null ? subtype.bound : Java.objectType(),
                                  supertype);
        if (isObject(supertype))
            return subtype.kind !== 'void';
        if (subtype.kind === 'tvar') {
            if (supertype.kind === 'tvar' && supertype.sym === subtype.sym)
                return true;
            var bounds = subtype.sym.bounds.length > 0 ? subtype.sym.bounds : [Java.objectType()];
            return bounds.some(function (bound) { return Java.isSubtype(bound, supertype); });
        }
        if (subtype.kind === 'inter')
            return subtype.types.some(function (part) { return Java.isSubtype(part, supertype); });
        if (subtype.kind === 'array') {
            if (supertype.kind === 'array') {
                var subElement = Java.resolved(subtype.elem), superElement = Java.resolved(supertype.elem);
                if (subElement.kind === 'prim' || superElement.kind === 'prim')
                    return subElement.kind === 'prim' && superElement.kind === 'prim' &&
                        subElement.name === superElement.name;
                return Java.isSubtype(subElement, superElement);
            }
            return supertype.kind === 'class' && (supertype.sym.qname === 'java.lang.Cloneable' || supertype.sym.qname === 'java.io.Serializable');
        }
        if (supertype.kind === 'class') {
            var sup = Java.asSuper(subtype, supertype.sym);
            if (sup === null)
                return false;
            if (supertype.args.length === 0 || sup.args.length === 0)
                return true;
            for (var index = 0; index < supertype.args.length; ++index) {
                if (!Java.contains(supertype.args[index], sup.args[index]))
                    return false;
            }
            return true;
        }
        return false;
    };
    // A type without unresolved inference variables.
    Java.isProper = function (type) {
        type = Java.resolved(type);
        switch (type.kind) {
        case 'ivar':
            return false;
        case 'class':
            return type.args.every(Java.isProper);
        case 'array':
            return Java.isProper(type.elem);
        case 'wild':
            return type.bound === null || Java.isProper(type.bound);
        case 'inter':
            return type.types.every(Java.isProper);
        }
        return true;
    };

    function boxIfPrimitive(type) {
        return type.kind === 'prim' ? Java.boxedType(Java.symtab, type) : type;
    }

    // The least common supertype (simplified: the first supertype of the
    // first type that all the others convert to).
    Java.lub = function (list) {
        list = list.map(Java.resolved).filter(function (type) { return type.kind !== 'null'; }).map(boxIfPrimitive);
        if (list.length === 0)
            return Java.types.nul;
        var first = list[0];
        if (list.every(function (type) { return Java.sameType(type, first); }))
            return first;
        for (var index = 0; index < list.length; ++index) {
            var candidate = list[index];
            if (list.every(function (type) { return Java.isSubtypeNoBounds(type, candidate); }))
                return candidate;
        }
        if (first.kind !== 'class')
            return Java.objectType();
        // The supertypes of the first one breadth first: the class before the interfaces.
        var queue = Java.directSupertypes(first);
        var seen = [];
        while (queue.length > 0) {
            var next = queue.shift();
            if (seen.some(function (type) { return type.sym === next.sym; }))
                continue;
            seen.push(next);
            if (!isObject(next) && list.every(function (type) { return Java.isSubtypeNoBounds(type, next); }))
                return next;
            queue = queue.concat(Java.directSupertypes(next));
        }
        return Java.objectType();
    };

    // A check without recording bounds.
    Java.isSubtypeNoBounds = function (subtype, supertype) {
        var mark = Java.markBounds();
        var result = Java.isSubtype(subtype, supertype);
        Java.rollbackBounds(mark);
        return result;
    };

    // Whether the type contains the inference variable ivar.
    function mentions(type, ivar) {
        type = Java.resolved(type);
        switch (type.kind) {
        case 'ivar':
            return type === ivar;
        case 'class':
            return type.args.some(function (arg) { return mentions(arg, ivar); });
        case 'array':
            return mentions(type.elem, ivar);
        case 'wild':
            return type.bound !== null && mentions(type.bound, ivar);
        case 'inter':
            return type.types.some(function (item) { return mentions(item, ivar); });
        }
        return false;
    }

    // A type by the bounds known already, fixing nothing (for overload
    // resolution while a nested call is unresolved): null if it fails.
    Java.provisional = function (type, seen) {
        type = Java.resolved(type);
        switch (type.kind) {
        case 'ivar': {
            seen = seen || [];
            if (seen.indexOf(type) >= 0)
                return null;
            seen.push(type);
            var candidates = type.eq.concat(type.lower);
            for (var index = 0; index < candidates.length; ++index) {
                var found = Java.provisional(candidates[index], seen);
                if (found !== null && found.kind !== 'null') {
                    seen.pop();
                    return found;
                }
            }
            seen.pop();
            return null;
        }
        case 'class': {
            if (type.args.length === 0)
                return type;
            var args = [];
            for (var argumentIndex = 0; argumentIndex < type.args.length; ++argumentIndex) {
                var arg = Java.provisional(type.args[argumentIndex], seen);
                if (arg === null)
                    return null;
                args.push(arg);
            }
            return Java.classType(type.sym, args);
        }
        case 'array': {
            var elem = Java.provisional(type.elem, seen);
            return elem === null ? null : Java.arrayType(elem);
        }
        case 'wild': {
            if (type.bound === null)
                return type;
            var bound = Java.provisional(type.bound, seen);
            return bound === null ? null : Java.wildcard(bound, type.upper);
        }
        }
        return type;
    };

    // The value of an inference variable by its bounds. Variables equal to
    // each other (K = α) are resolved together, with shared bounds. A bound
    // with other variables (R = List<T>) is fine: they are resolved first.
    Java.resolveVar = function (ivar) {
        if (ivar.value !== null)
            return ivar.value;
        if (ivar.resolving)
            return Java.objectType();
        var group = [ivar];
        for (var index = 0; index < group.length; ++index) {
            group[index].eq.forEach(function (type) {
                type = Java.resolved(type);
                if (type.kind === 'ivar' && type.value === null && group.indexOf(type) < 0)
                    group.push(type);
            });
        }
        group.forEach(function (member) { member.resolving = true; });
        try {
            var value = resolveGroup(group);
            group.forEach(function (member) {
                if (member.value === null)
                    member.value = value;
            });
            return ivar.value;
        } finally {
            group.forEach(function (member) { member.resolving = false; });
        }
    };

    function resolveGroup(group) {
        var mentionsGroup = function (type) { return group.some(function (member) { return mentions(type, member); }); };
        var collect = function (list) {
            var result = [];
            group.forEach(function (member) {
                member[list].forEach(function (type) {
                    type = Java.resolved(type);
                    if (type.kind === 'ivar' && group.indexOf(type) >= 0)
                        return;
                    result.push(type);
                });
            });
            return result;
        };
        var value = null;
        var eqAll = collect('eq');
        var eq = eqAll.filter(Java.isProper);
        if (eq.length === 0)
            eq = eqAll.filter(function (type) { return !mentionsGroup(type); }).map(Java.finalType);
        if (eq.length > 0) {
            value = eq[0];
        } else {
            var lower = collect('lower').filter(function (type) { return !mentionsGroup(type); }).map(Java.finalType);
            if (lower.length > 0) {
                value = Java.lub(lower);
                if (value.kind === 'null')
                    value = null;
            }
            if (value === null) {
                var upper = collect('upper').filter(function (type) { return Java.isProper(type) && !isObject(type); });
                for (var index = 0; index < upper.length && value === null; ++index) {
                    var candidate = upper[index];
                    if (upper.every(function (type) { return Java.isSubtypeNoBounds(candidate, type); }))
                        value = candidate;
                }
                if (value === null && upper.length > 0)
                    value = upper[0];
            }
            for (var memberIndex = 0; memberIndex < group.length && value === null; ++memberIndex) {
                var sym = group[memberIndex].sym;
                if (sym && sym.bounds && sym.bounds.length > 0)
                    value = Java.erasure(sym.bounds[0]);
            }
        }
        if (value === null)
            value = Java.objectType();
        if (value.kind === 'wild')
            value = value.upper && value.bound !== null ? value.bound : Java.objectType();
        return value;
    }

    // A type with all inference variables replaced by their values.
    Java.finalType = function (type) {
        type = Java.resolved(type);
        switch (type.kind) {
        case 'ivar':
            return Java.finalType(Java.resolveVar(type));
        case 'class':
            return type.args.length === 0 ? type : Java.classType(type.sym, type.args.map(Java.finalType));
        case 'array':
            return Java.arrayType(Java.finalType(type.elem));
        case 'wild':
            return type.bound === null ? type : Java.wildcard(Java.finalType(type.bound), type.upper);
        case 'inter':
            return { kind: 'inter', types: type.types.map(Java.finalType) };
        }
        return type;
    };
    // The constant value fits the primitive type (byte b = 10).
    function fitsConstant(value, type) {
        if (typeof value !== 'number' || !Number.isInteger(value))
            return false;
        switch (type.name) {
        case 'byte':
            return value >= -128 && value <= 127;
        case 'short':
            return value >= -32768 && value <= 32767;
        case 'char':
            return value >= 0 && value <= 65535;
        }
        return false;
    }

    // Method invocation conversion: strict - without boxing, otherwise with it.
    Java.isConvertible = function (source, target, strict) {
        source = Java.resolved(source);
        target = Java.resolved(target);
        if (source.kind === 'prim' && target.kind === 'prim')
            return Java.isPrimitiveWidening(source, target);
        if (source.kind === 'prim') {
            if (strict)
                return false;
            return Java.isSubtype(Java.boxedType(Java.symtab, source), target);
        }
        if (target.kind === 'prim') {
            if (strict)
                return false;
            var unboxed = Java.unboxedType(source);
            if (unboxed === null && source.kind === 'tvar') {
                for (var index = 0; index < source.sym.bounds.length && unboxed === null; ++index)
                    unboxed = Java.unboxedType(source.sym.bounds[index]);
            }
            return unboxed !== null && Java.isPrimitiveWidening(unboxed, target);
        }
        return Java.isSubtype(source, target);
    };

    // Assignment: as a method invocation plus narrowing of constants.
    Java.isAssignable = function (sourceType, targetType, constant) {
        sourceType = Java.resolved(sourceType);
        targetType = Java.resolved(targetType);
        if (constant !== undefined && sourceType.kind === 'prim' && (sourceType.name === 'int' || sourceType.name === 'char' || sourceType.name === 'short' ||
                                                                    sourceType.name === 'byte')) {
            if (targetType.kind === 'prim' && fitsConstant(constant, targetType))
                return true;
            var target = Java.unboxedType(targetType);
            if (target !== null && (target.name === 'byte' || target.name === 'short' || target.name === 'char') &&
                fitsConstant(constant, target))
                return true;
        }
        return Java.isConvertible(sourceType, targetType, false);
    };

    // Binary numeric promotion: double, float, long or int.
    Java.binaryPromotion = function (left, right) {
        var names = [left.name, right.name];
        if (names.indexOf('double') >= 0)
            return types.double;
        if (names.indexOf('float') >= 0)
            return types.float;
        if (names.indexOf('long') >= 0)
            return types.long;
        return types.int;
    };

    Java.unaryPromotion = function (type) {
        return type.name === 'byte' || type.name === 'short' || type.name === 'char' ? types.int : type;
    };

    // The primitive of a value: the primitive itself or the unboxed type.
    Java.primitiveOf = function (type) {
        type = Java.resolved(type);
        if (type.kind === 'prim')
            return type;
        var unboxed = Java.unboxedType(type);
        if (unboxed === null && type.kind === 'tvar') {
            for (var index = 0; index < type.sym.bounds.length && unboxed === null; ++index)
                unboxed = Java.unboxedType(type.sym.bounds[index]);
        }
        return unboxed;
    };
})(globalThis);
