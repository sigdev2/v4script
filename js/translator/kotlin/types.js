// Kotlin: types - classes with arguments and nullability, type parameters,
// function types, Nothing, flexible types of Java values; subtyping,
// substitution, common supertypes, the text of a type as kotlinc writes it.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.classType)
        return;

    // --- Constructors

    // args: [{ v: '' | 'out' | 'in' | '*', type }]; flexible - a platform type of Java (String!).
    Kt.classType = function (sym, args, nullable, flexible) {
        return { kind: 'class', sym: sym, args: args || [], nullable: !!nullable, flexible: !!flexible };
    };
    Kt.paramType = function (sym, nullable) {
        return { kind: 'param', sym: sym, nullable: !!nullable, flexible: false };
    };
    Kt.funType = function (receiver, params, returns, nullable, suspend) {
        return { kind: 'fun', receiver: receiver, params: params, returns: returns, nullable: !!nullable, suspend: !!suspend,
                 flexible: false };
    };
    Kt.NOTHING = { kind: 'nothing', nullable: false, flexible: false };
    Kt.NULL_TYPE = { kind: 'nothing', nullable: true, flexible: false };
    Kt.ERROR = { kind: 'error', nullable: false, flexible: false };
    Kt.DYNAMIC = { kind: 'dynamic', nullable: true, flexible: false };

    Kt.arg = function (type, variance) {
        return { v: variance || '', type: type };
    };
    Kt.STAR = { v: '*', type: null };

    // An inference variable of a call.
    var ivarCounter = 0;
    Kt.inferenceVar = function (param) {
        return { kind: 'ivar', id: ++ivarCounter, param: param, lower: [], upper: [], eq: [], value: null, nullable: false,
                 flexible: false };
    };

    // --- Nullability

    Kt.isNullable = function (type) {
        type = Kt.resolved(type);
        if (type.kind === 'param')
            return type.nullable || Kt.paramNullable(type.sym);
        return type.nullable || type.kind === 'dynamic';
    };

    // A type parameter without a non-null bound may hold null (T of List<T?>).
    Kt.paramNullable = function (sym) {
        if (sym.bounds.length === 0)
            return true;
        return sym.bounds.every(function (bound) { return Kt.isNullable(bound); });
    };

    Kt.withNullability = function (type, nullable) {
        type = Kt.resolved(type);
        if (type.nullable === nullable && !type.flexible)
            return type;
        switch (type.kind) {
        case 'class':
            return Kt.classType(type.sym, type.args, nullable, false);
        case 'param':
            return { kind: 'param', sym: type.sym, nullable: nullable, flexible: false, notNull: !nullable && type.notNull };
        case 'fun':
            return Kt.funType(type.receiver, type.params, type.returns, nullable, type.suspend);
        case 'nothing':
            return nullable ? Kt.NULL_TYPE : Kt.NOTHING;
        case 'ivar':
            return ivarWithNullability(type, nullable);
        }
        return type;
    };

    // T? of an inference variable T: a view that shares the bounds and the value.
    function ivarWithNullability(ivar, nullable) {
        var base = ivar.base || ivar;
        if (!nullable)
            return base;
        if (base.nullableView === undefined) {
            var view = Object.create(base);
            view.nullable = true;
            view.base = base;
            base.nullableView = view;
        }
        return base.nullableView;
    }

    Kt.makeNullable = function (type) {
        return Kt.withNullability(type, true);
    };

    // T!! - a definitely non-null type: T & Any for a type parameter.
    Kt.makeNotNull = function (type) {
        type = Kt.resolved(type);
        if (type.kind === 'param') {
            if (!type.nullable && type.notNull)
                return type;
            return { kind: 'param', sym: type.sym, nullable: false, flexible: false, notNull: true };
        }
        if (type.kind === 'dynamic' || type.kind === 'error')
            return type;
        return Kt.withNullability(type, false);
    };

    Kt.resolved = function (type) {
        while (type.kind === 'ivar' && type.value !== null) {
            var nullable = type.nullable;
            type = type.value;
            if (nullable && !type.nullable)
                type = Kt.makeNullable(type);
        }
        return type;
    };

    // --- Text

    function argString(arg) {
        if (arg.v === '*')
            return '*';
        return (arg.v ? arg.v + ' ' : '') + Kt.typeString(arg.type);
    }

    // As kotlinc writes types in messages: List<String>?, (Int) -> String.
    Kt.typeString = function (type) {
        type = Kt.resolved(type);
        var suffix = type.flexible ? '!' : (type.nullable ? '?' : '');
        switch (type.kind) {
        case 'class': {
            var name = type.sym.displayName || type.sym.name;
            if (type.args.length > 0)
                name += '<' + type.args.map(argString).join(', ') + '>';
            return name + suffix;
        }
        case 'param':
            return type.sym.name + (type.notNull && !type.nullable ? ' & Any' : suffix);
        case 'fun': {
            var text = '(' + type.params.map(Kt.typeString).join(', ') + ') -> ' + Kt.typeString(type.returns);
            if (type.receiver !== null)
                text = Kt.typeString(type.receiver) + '.' + text;
            if (type.suspend)
                text = 'suspend ' + text;
            return type.nullable ? '(' + text + ')?' : text;
        }
        case 'nothing':
            return type.nullable ? 'Nothing?' : 'Nothing';
        case 'error':
            return 'ERROR';
        case 'dynamic':
            return 'dynamic';
        case 'ivar':
            return type.param.name;
        }
        return '?';
    };

    // --- Substitution

    // map: Map(type parameter symbol -> type).
    Kt.subst = function (type, map) {
        if (map === null || map.size === 0)
            return type;
        type = Kt.resolved(type);
        switch (type.kind) {
        case 'param': {
            var found = map.get(type.sym);
            if (found === undefined)
                return type;
            if (found === null)
                return type;
            if (type.nullable)
                return Kt.makeNullable(found);
            if (type.notNull)
                return Kt.makeNotNull(found);
            return found;
        }
        case 'class':
            if (type.args.length === 0)
                return type;
            return Kt.classType(type.sym, type.args.map(function (arg) {
                return arg.v === '*' ? arg : Kt.arg(Kt.subst(arg.type, map), arg.v);
            }), type.nullable, type.flexible);
        case 'fun':
            return Kt.funType(type.receiver === null ? null : Kt.subst(type.receiver, map),
                              type.params.map(function (param) { return Kt.subst(param, map); }),
                              Kt.subst(type.returns, map), type.nullable, type.suspend);
        }
        return type;
    };

    // The substitution of the parameters of a class by the arguments of a type.
    Kt.typeMap = function (type) {
        var map = new Map();
        var params = type.sym.typeParams;
        params.forEach(function (param, index) {
            var arg = type.args[index];
            if (arg === undefined) {
                map.set(param, param.bounds.length > 0 ? param.bounds[0] : Kt.nullableAny());
            } else if (arg.v === '*') {
                // A star: the bound (for reading).
                map.set(param, param.bounds.length > 0 ? param.bounds[0] : Kt.nullableAny());
            } else {
                map.set(param, arg.type);
            }
        });
        return map;
    };

    // --- Supertypes

    // The direct supertypes of a class type, substituted.
    Kt.directSupertypes = function (type) {
        var sym = type.sym;
        sym.completeHeader();
        var map = Kt.typeMap(type);
        var result = sym.supers.map(function (superType) { return Kt.subst(superType, map); });
        if (result.length === 0 && sym !== Kt.builtins.Any)
            result.push(Kt.anyType());
        return result;
    };

    // The supertype of type with the class sym (Collection<String> for
    // List<String>) or null.
    Kt.asSuper = function (type, sym) {
        type = Kt.resolved(type);
        if (type.kind === 'class') {
            if (type.sym === sym)
                return type;
            if (sym === Kt.builtins.Any)
                return Kt.anyType();
            var supers = Kt.directSupertypes(type);
            for (var index = 0; index < supers.length; ++index) {
                var found = Kt.asSuper(supers[index], sym);
                if (found !== null)
                    return found;
            }
            return null;
        }
        if (type.kind === 'param') {
            var bounds = type.sym.bounds.length > 0 ? type.sym.bounds : [Kt.nullableAny()];
            for (var boundIndex = 0; boundIndex < bounds.length; ++boundIndex) {
                var viaBound = Kt.asSuper(bounds[boundIndex], sym);
                if (viaBound !== null)
                    return viaBound;
            }
            return null;
        }
        if (type.kind === 'fun') {
            if (sym === Kt.builtins.Any)
                return Kt.anyType();
            if (sym === Kt.builtins.Function)
                return Kt.classType(sym, [Kt.arg(type.returns, 'out')], false);
            return null;
        }
        if (type.kind === 'nothing')
            return null;
        return null;
    };

    // All supertypes of a class type in breadth-first order (the type first).
    Kt.supertypeClosure = function (type) {
        var result = [];
        var queue = [type];
        while (queue.length > 0) {
            var current = queue.shift();
            if (result.some(function (seen) { return seen.sym === current.sym; }))
                continue;
            result.push(current);
            queue = queue.concat(Kt.directSupertypes(current));
        }
        return result;
    };

    // --- Equality and subtyping

    Kt.sameType = function (left, right) {
        left = Kt.resolved(left);
        right = Kt.resolved(right);
        if (left === right)
            return true;
        if (left.kind !== right.kind || !!left.nullable !== !!right.nullable)
            return false;
        switch (left.kind) {
        case 'class':
            if (left.sym !== right.sym || left.args.length !== right.args.length)
                return false;
            for (var index = 0; index < left.args.length; ++index) {
                var leftArg = left.args[index], rightArg = right.args[index];
                if (leftArg.v !== rightArg.v)
                    return false;
                if (leftArg.v !== '*' && !Kt.sameType(leftArg.type, rightArg.type))
                    return false;
            }
            return true;
        case 'param':
            return left.sym === right.sym && !!left.notNull === !!right.notNull;
        case 'fun':
            if (left.params.length !== right.params.length || (left.receiver === null) !== (right.receiver === null) ||
                left.suspend !== right.suspend)
                return false;
            if (left.receiver !== null && !Kt.sameType(left.receiver, right.receiver))
                return false;
            for (var paramIndex = 0; paramIndex < left.params.length; ++paramIndex) {
                if (!Kt.sameType(left.params[paramIndex], right.params[paramIndex]))
                    return false;
            }
            return Kt.sameType(left.returns, right.returns);
        case 'nothing':
        case 'error':
        case 'dynamic':
            return true;
        }
        return false;
    };

    // The parameters of a function type with the receiver first.
    Kt.funParams = function (type) {
        return type.receiver !== null ? [type.receiver].concat(type.params) : type.params;
    };

    // The variance of a parameter of a class at declaration.
    function declaredVariance(sym, index) {
        var param = sym.typeParams[index];
        return param === undefined ? '' : (param.variance || '');
    }

    // An argument fits a declared argument: List<out Number> takes List<Int>.
    function argContains(target, source, variance) {
        if (target.v === '*')
            return true;
        if (source.v === '*')
            return target.v === 'out' && Kt.isSubtype(Kt.nullableAny(), target.type);
        var effective = target.v || variance;
        if (effective === 'out') {
            if (source.v === 'in')
                return Kt.isSubtype(Kt.nullableAny(), target.type);
            return Kt.isSubtype(source.type, target.type);
        }
        if (effective === 'in') {
            if (source.v === 'out')
                return false;
            return Kt.isSubtype(target.type, source.type);
        }
        if (source.v !== '' && source.v !== target.v)
            return false;
        return Kt.equalTypes(source.type, target.type);
    }

    // Equal for invariant arguments; flexible types match both nullabilities.
    Kt.equalTypes = function (left, right) {
        left = Kt.resolved(left);
        right = Kt.resolved(right);
        if (left.kind === 'ivar' || right.kind === 'ivar')
            return Kt.equate(left, right);
        if (left.kind === 'error' || right.kind === 'error' || left.kind === 'dynamic' || right.kind === 'dynamic')
            return true;
        if (left.flexible || right.flexible)
            return Kt.isSubtype(Kt.makeNotNull(left), Kt.makeNullable(right)) &&
                Kt.isSubtype(Kt.makeNotNull(right), Kt.makeNullable(left));
        return Kt.isSubtype(left, right) && Kt.isSubtype(right, left);
    };

    Kt.isSubtype = function (sub, sup) {
        sub = Kt.resolved(sub);
        sup = Kt.resolved(sup);
        if (sub === sup)
            return true;
        if (sub.kind === 'error' || sup.kind === 'error' || sub.kind === 'dynamic' || sup.kind === 'dynamic')
            return true;
        if (sub.kind === 'ivar' || sup.kind === 'ivar')
            return Kt.constrain(sub, sup);
        if (sub.kind === 'nothing')
            return !sub.nullable || Kt.isNullable(sup) || sup.flexible;
        // A nullable type fits only a nullable one (a flexible one fits both).
        if (Kt.isNullable(sub) && !sub.flexible && !Kt.isNullable(sup) && !sup.flexible)
            return false;
        if (sup.kind === 'nothing')
            return false;
        if (sub.kind === 'param') {
            if (sup.kind === 'param' && sup.sym === sub.sym)
                return true;
            var bounds = sub.sym.bounds.length > 0 ? sub.sym.bounds : [Kt.nullableAny()];
            var supNotNull = sup.flexible ? Kt.makeNullable(sup) : sup;
            return bounds.some(function (bound) {
                var boundType = sub.nullable ? Kt.makeNullable(bound) : (sub.notNull ? Kt.makeNotNull(bound) : bound);
                if (sub.flexible)
                    boundType = Kt.makeNotNull(boundType);
                return Kt.isSubtype(Kt.isNullable(supNotNull) ? Kt.makeNullable(boundType) : boundType, supNotNull);
            });
        }
        if (sup.kind === 'param')
            return false;
        if (sub.kind === 'fun') {
            if (sup.kind === 'fun') {
                var subParams = Kt.funParams(sub), supParams = Kt.funParams(sup);
                if (subParams.length !== supParams.length || sub.suspend !== sup.suspend)
                    return false;
                for (var index = 0; index < subParams.length; ++index) {
                    if (!Kt.isSubtype(supParams[index], subParams[index]))
                        return false;
                }
                return Kt.isSubtype(sub.returns, sup.returns);
            }
            if (sup.kind === 'class')
                return sup.sym === Kt.builtins.Any || (sup.sym === Kt.builtins.Function &&
                                                        (sup.args.length === 0 || argContains(sup.args[0], Kt.arg(sub.returns), 'out')));
            return false;
        }
        if (sub.kind === 'class' && sup.kind === 'fun')
            return false;
        if (sub.kind === 'class' && sup.kind === 'class') {
            if (sup.sym === Kt.builtins.Any)
                return true;
            var found = Kt.asSuper(Kt.withNullability(sub, false), sup.sym);
            if (found === null)
                return Kt.mappedSubtype(sub, sup);
            for (var argIndex = 0; argIndex < sup.args.length; ++argIndex) {
                if (found.args[argIndex] === undefined)
                    continue;
                if (!argContains(sup.args[argIndex], found.args[argIndex], declaredVariance(sup.sym, argIndex)))
                    return false;
            }
            return true;
        }
        return false;
    };

    // Java types are flexible in mutability too: a Java List<E> takes a
    // Kotlin List<E> and a MutableList<E> (both are java.util.List).
    Kt.mappedSubtype = function (sub, sup) {
        if (!(sub.flexible || sup.flexible) || sub.sym.java === null || sub.sym.java === undefined ||
            sup.sym.java === null || sup.sym.java === undefined)
            return false;
        if (sub.sym.java !== sup.sym.java) {
            var javaSuper = Kt.javaSuperOf(sub.sym, sup.sym.java);
            if (javaSuper === null)
                return false;
        }
        for (var index = 0; index < Math.min(sub.args.length, sup.args.length); ++index) {
            var subArg = sub.args[index], supArg = sup.args[index];
            if (subArg.v === '*' || supArg.v === '*')
                continue;
            if (!Kt.isSubtype(subArg.type, Kt.makeNullable(supArg.type)))
                return false;
        }
        return true;
    };

    // Whether a Kotlin class is a subtype of a Java class by the Java hierarchy.
    Kt.javaSuperOf = function (sym, javaSym) {
        var closure = Kt.supertypeClosure(Kt.classType(sym, []));
        for (var index = 0; index < closure.length; ++index) {
            if (closure[index].sym.java === javaSym)
                return closure[index];
        }
        return null;
    };

    // --- Inference variables: bounds with rollback

    var boundLog = [];

    function addBound(ivar, list, type) {
        ivar[list].push(type);
        boundLog.push([ivar, list]);
    }

    Kt.markBounds = function () {
        return boundLog.length;
    };
    Kt.rollbackBounds = function (mark) {
        while (boundLog.length > mark) {
            var entry = boundLog.pop();
            entry[0][entry[1]].pop();
        }
    };
    Kt.commitBounds = function () {
        boundLog = [];
    };

    // sub <: sup where one side is an unfixed inference variable.
    Kt.constrain = function (sub, sup) {
        if (sub.kind === 'ivar' && sub.value === null) {
            if (sup.kind === 'ivar' && sup.value === null) {
                if ((sub.base || sub) === (sup.base || sup))
                    return !sub.nullable || sup.nullable;
                addBound(sub, 'upper', sup);
                addBound(sup, 'lower', sub);
                return true;
            }
            // T? <: X: T <: X without "?"; X must be nullable.
            if (sub.nullable && !Kt.isNullable(sup) && !sup.flexible)
                return false;
            addBound(sub, 'upper', sub.nullable ? Kt.makeNotNull(sup) : sup);
            return true;
        }
        if (sup.kind === 'ivar' && sup.value === null) {
            // X <: T?: the variable takes X without nullability.
            addBound(sup, 'lower', sup.nullable ? Kt.makeNotNull(sub) : sub);
            return true;
        }
        return Kt.isSubtype(Kt.resolved(sub), Kt.resolved(sup));
    };

    Kt.equate = function (left, right) {
        if (left.kind === 'ivar' && left.value === null) {
            if ((left.base || left) === (right.base || right))
                return left.nullable === right.nullable;
            if (right.kind === 'ivar' && right.value === null) {
                addBound(left, 'eq', right);
                addBound(right, 'eq', left);
                return true;
            }
            return equateVar(left, right);
        }
        if (right.kind === 'ivar' && right.value === null)
            return equateVar(right, left);
        return Kt.equalTypes(left, right);
    };

    // T? = String?: T = String; T? = String is impossible.
    function equateVar(ivar, type) {
        if (ivar.nullable) {
            if (!Kt.isNullable(type) && !type.flexible)
                return false;
            addBound(ivar.base, 'eq', Kt.makeNotNull(type));
            return true;
        }
        addBound(ivar, 'eq', type);
        return true;
    }

    // Whether a type mentions an unfixed inference variable.
    Kt.hasFreeVars = function (type) {
        type = Kt.resolved(type);
        switch (type.kind) {
        case 'ivar':
            return true;
        case 'class':
            return type.args.some(function (arg) { return arg.v !== '*' && Kt.hasFreeVars(arg.type); });
        case 'fun':
            return (type.receiver !== null && Kt.hasFreeVars(type.receiver)) ||
                type.params.some(Kt.hasFreeVars) || Kt.hasFreeVars(type.returns);
        }
        return false;
    };

    // The variables a type mentions.
    Kt.freeVars = function (type, out) {
        out = out || [];
        type = Kt.resolved(type);
        switch (type.kind) {
        case 'ivar':
            if (out.indexOf(type) < 0)
                out.push(type);
            break;
        case 'class':
            type.args.forEach(function (arg) {
                if (arg.v !== '*')
                    Kt.freeVars(arg.type, out);
            });
            break;
        case 'fun':
            if (type.receiver !== null)
                Kt.freeVars(type.receiver, out);
            type.params.forEach(function (param) { Kt.freeVars(param, out); });
            Kt.freeVars(type.returns, out);
            break;
        }
        return out;
    };

    // The value of a variable from its bounds: an equality, else the common
    // supertype of the lower bounds, else the upper bound, else the bound
    // of the type parameter.
    Kt.fixVar = function (ivar) {
        ivar = ivar.base || ivar;
        if (ivar.value !== null)
            return ivar.value;
        // The variables this one takes its value from are fixed first (S of
        // <S, T : S> after T).
        if (!ivar.fixing) {
            ivar.fixing = true;
            ivar.eq.concat(ivar.lower).forEach(function (bound) {
                bound = Kt.resolved(bound);
                if (bound.kind === 'ivar' && bound.value === null && !bound.fixing)
                    Kt.fixVar(bound);
            });
            ivar.fixing = false;
        }
        var value = null;
        var eq = ivar.eq.map(Kt.resolved).filter(function (type) { return type.kind !== 'ivar'; });
        if (eq.length > 0) {
            value = eq[0];
        } else {
            var lower = ivar.lower.map(Kt.resolved).filter(function (type) { return type.kind !== 'ivar'; });
            if (lower.length > 0) {
                value = Kt.commonSupertype(lower);
            } else {
                var upper = ivar.upper.map(Kt.resolved).filter(function (type) { return type.kind !== 'ivar'; });
                if (upper.length > 0) {
                    value = upper[0];
                    for (var index = 1; index < upper.length; ++index) {
                        if (Kt.isSubtype(upper[index], value))
                            value = upper[index];
                    }
                }
            }
        }
        if (value === null) {
            var linked = ivar.eq.concat(ivar.lower).map(Kt.resolved).filter(function (type) { return type.kind === 'ivar' && (type.base || type) !== ivar && type.value !== null; });
            value = linked.length > 0 ? linked[0].value : null;
        }
        if (value === null)
            value = ivar.param.bounds.length > 0 ? ivar.param.bounds[0] : Kt.nullableAny();
        if (value.kind === 'nothing' && !value.nullable && ivar.lower.length > 0 && ivar.upper.length > 0)
            value = ivar.upper[0];
        // A recursive bound (T : Comparable<T>) without other bounds: Comparable<*>.
        value = withoutVar(value, ivar);
        ivar.value = value;
        return value;
    };

    function withoutVar(type, ivar) {
        type = Kt.resolved(type);
        if (type.kind !== 'class' || type.args.length === 0)
            return type;
        var changed = false;
        var args = type.args.map(function (arg) {
            if (arg.v === '*')
                return arg;
            var inner = Kt.resolved(arg.type);
            if (inner.kind === 'ivar' && (inner.base || inner) === ivar) {
                changed = true;
                return Kt.STAR;
            }
            var replaced = withoutVar(inner, ivar);
            if (replaced !== inner)
                changed = true;
            return replaced === inner ? arg : Kt.arg(replaced, arg.v);
        });
        return changed ? Kt.classType(type.sym, args, type.nullable, type.flexible) : type;
    }

    // --- Common supertype

    // The common supertype of the types of branches (if, when, elvis, listOf).
    Kt.commonSupertype = function (list) {
        var types = list.map(Kt.resolved).filter(function (type) { return type.kind !== 'error'; });
        if (types.length === 0)
            return list.length > 0 ? Kt.ERROR : Kt.NOTHING;
        if (types.some(function (type) { return type.kind === 'dynamic'; }))
            return Kt.DYNAMIC;
        var nullable = types.some(function (type) { return Kt.isNullable(type) && !(type.kind === 'param' && !type.nullable); }) ||
            types.some(function (type) { return type.kind === 'nothing' && type.nullable; });
        var proper = types.filter(function (type) { return type.kind !== 'nothing'; });
        if (proper.length === 0)
            return nullable ? Kt.NULL_TYPE : Kt.NOTHING;
        var flexible = proper.every(function (type) { return type.flexible; });
        var notNull = proper.map(function (type) { return Kt.makeNotNull(type); });
        var result = commonNotNull(notNull);
        if (result.kind === 'param' && proper.some(function (type) { return type.kind === 'param' && !type.notNull && !type.nullable; }))
            result = Kt.withNullability(result, false);
        if (result.kind === 'param' && proper.every(function (type) { return type.kind === 'param' && !type.notNull; }))
            result = { kind: 'param', sym: result.sym, nullable: false, flexible: false };
        if (nullable)
            result = Kt.makeNullable(result);
        if (flexible && result.kind === 'class')
            result = Kt.classType(result.sym, result.args, result.nullable, true);
        return result;
    };

    function commonNotNull(types) {
        var first = types[0];
        if (types.every(function (type) { return Kt.isSubtype(type, first); }))
            return first;
        for (var index = 1; index < types.length; ++index) {
            var candidate = types[index];
            if (types.every(function (type) { return Kt.isSubtype(type, candidate); }))
                return candidate;
        }
        if (types.every(function (type) { return type.kind === 'fun'; }))
            return Kt.anyType();
        // The supertypes of the first type in order: the first one common to all.
        var start = first.kind === 'param' ? (first.sym.bounds[0] || Kt.anyType()) : first;
        if (start.kind !== 'class')
            return Kt.anyType();
        var closure = Kt.supertypeClosure(Kt.makeNotNull(start));
        var common = closure.filter(function (candidateType) {
            return types.every(function (type) {
                var asSuper = Kt.asSuper(type, candidateType.sym);
                return asSuper !== null;
            });
        });
        if (common.length === 0)
            return Kt.anyType();
        // A class before interfaces, the most derived first.
        var best = common[0];
        var sym = best.sym;
        var args = sym.typeParams.map(function (param, index) {
            var argTypes = types.map(function (type) {
                var asSuper = Kt.asSuper(type, sym);
                var arg = asSuper.args[index];
                return arg === undefined || arg.v === '*' ? null : arg.type;
            });
            if (argTypes.some(function (type) { return type === null; }))
                return Kt.STAR;
            if (argTypes.every(function (type) { return Kt.sameType(type, argTypes[0]); }))
                return Kt.arg(argTypes[0], '');
            // Comparable<Int> and Comparable<String>: Comparable<*>; a
            // recursive type (Comparable<Comparable<...>>) stops too.
            if (param.variance === 'in' || commonDepth > 4)
                return Kt.STAR;
            ++commonDepth;
            try {
                return Kt.arg(Kt.commonSupertype(argTypes), param.variance === 'out' ? '' : 'out');
            } finally {
                --commonDepth;
            }
        });
        return Kt.classType(sym, args, false);
    }
    var commonDepth = 0;

    // --- Builtin types (the session fills Kt.builtins with the symbols)

    Kt.builtins = Object.create(null);

    Kt.anyType = function () {
        return Kt.classType(Kt.builtins.Any, [], false);
    };
    Kt.nullableAny = function () {
        return Kt.classType(Kt.builtins.Any, [], true);
    };
    Kt.builtinType = function (name, args, nullable) {
        return Kt.classType(Kt.builtins[name], args || [], nullable);
    };
    Kt.unitType = function () {
        return Kt.builtinType('Unit');
    };
    Kt.intType = function () {
        return Kt.builtinType('Int');
    };
    Kt.booleanType = function () {
        return Kt.builtinType('Boolean');
    };
    Kt.stringType = function () {
        return Kt.builtinType('String');
    };

    // The array of a vararg parameter: vararg x: Int - IntArray, vararg x: T - Array<out T>.
    var VARARG_ARRAYS = { i32: 'IntArray', i64: 'LongArray', i16: 'ShortArray', i8: 'ByteArray', f64: 'DoubleArray',
                          f32: 'FloatArray', char: 'CharArray', bool: 'BooleanArray' };
    Kt.varargArray = function (type) {
        var kind = Kt.isPrimitive(type) ? Kt.primKind(type) : null;
        if (kind !== null && VARARG_ARRAYS[kind] !== undefined)
            return Kt.builtinType(VARARG_ARRAYS[kind]);
        return Kt.builtinType('Array', [Kt.arg(type, 'out')]);
    };

    Kt.isClass = function (type, name) {
        type = Kt.resolved(type);
        return type.kind === 'class' && type.sym === Kt.builtins[name];
    };

    // The kind of a primitive: i8 i16 i32 i64 f32 f64 char bool u8 u16 u32 u64, or null.
    Kt.primKind = function (type) {
        type = Kt.resolved(type);
        if (type.kind !== 'class')
            return null;
        return type.sym.prim || null;
    };

    // A value held as a JavaScript primitive without a box (not null, not generic).
    Kt.isPrimitive = function (type) {
        type = Kt.resolved(type);
        return type.kind === 'class' && !!type.sym.prim && !type.nullable;
    };

    var NUMERIC = { i8: 1, i16: 2, i32: 3, i64: 4, f32: 5, f64: 6 };
    Kt.isNumericKind = function (kind) {
        return NUMERIC[kind] !== undefined;
    };
    Kt.isIntegralKind = function (kind) {
        return kind === 'i8' || kind === 'i16' || kind === 'i32' || kind === 'i64';
    };
    Kt.isUnsignedKind = function (kind) {
        return kind === 'u8' || kind === 'u16' || kind === 'u32' || kind === 'u64';
    };
    Kt.numericRank = function (kind) {
        return NUMERIC[kind] || 0;
    };
})(globalThis);
