// C++: implicit conversions and initialization (continues check.js). An
// implicit conversion sequence is { kind: 'standard' | 'user' | 'ellipsis',
// rank (1 exact, 2 promotion, 3 conversion), ... , build() }: build gives
// the converted tree, so ranking (overload.js) and translation use one
// description of the conversion. Initialization gives the tree of the
// initial value: a prvalue (scalars and classes), a glvalue (references),
// arrayinit (arrays).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'conversion'))
        return;

    var types = X.types;
    var big = T.big;
    var unqual = X.unqual;

    var EXACT = 1, PROMOTION = 2, CONVERSION = 3;
    X.EXACT = EXACT;

    function valueType(ir) {
        return unqual(ir.type);
    }

    function standard(rank, build, fields) {
        var ics = { kind: 'standard', rank: rank, build: build, ref: null, bindsRvalue: false, refCv: 0,
                    qualified: false,
                    toBool: false, baseDistance: 0, user: null, second: null };
        if (fields)
            Object.keys(fields).forEach(function (key) { ics[key] = fields[key]; });
        return ics;
    }

    // The number of derivation steps from derived to base, or -1.
    function baseDistance(derived, base) {
        if (derived === base)
            return 0;
        for (var index = 0; index < derived.bases.length; ++index) {
            var inner = baseDistance(derived.bases[index].type, base);
            if (inner >= 0)
                return inner + 1;
        }
        return -1;
    }
    X.baseDistance = baseDistance;

    // cv1 contains cv2.
    function cvContains(outer, inner) {
        return (outer & inner) === inner;
    }

    // --- The implicit conversion of a value to a type
    //
    // options: explicit (direct initialization: explicit constructors and
    // conversion functions count), noUser (no user-defined conversion: the
    // argument of a converting constructor).

    Parser.prototype.conversion = function (target, ir, options) {
        options = options || {};
        if (ir.k === 'braced')
            return this.listConversion(target, ir, options);
        if (ir.k === 'overload')
            return this.overloadConversion(target, ir, options);
        if (X.isRef(target))
            return this.referenceConversion(target, ir, options);
        var to = unqual(target);
        var from = valueType(ir);
        if (to.isClass)
            return this.classConversion(to, ir, options);
        if (from.isClass) {
            if (options.noUser)
                return null;
            return this.conversionFunction(to, ir, options);
        }
        return this.standardConversion(to, ir);
    };

    // A standard conversion between non-class types.
    Parser.prototype.standardConversion = function (to, ir) {
        var self = this;
        var value = this.decayValue(ir);
        var from = valueType(value);
        var decayed = value !== ir;
        if (to.kind === 'array' || to.kind === 'function' || to.kind === 'void')
            return null;
        if (from === to)
            return standard(EXACT, function () { return self.convertScalar(value, to); }, { decayed: decayed });
        if (to === types.bool) {
            if (X.isArithmeticLike(from) || from.kind === 'pointer')
                return standard(CONVERSION, function () { return self.convertScalar(value, to); },
                                { toBool: from.kind === 'pointer' });
            return null;
        }
        if (X.isArithmeticLike(to) && X.isArithmeticLike(from)) {
            var rank = X.promote(from) === to && from !== to && to.kind !== 'float' ? PROMOTION
                : (from === types.float && to === types.double ? PROMOTION : CONVERSION);
            if (to.kind === 'enum')
                return null;
            return standard(rank, function () { return self.convertScalar(value, to); },
                            { narrowing: isNarrowing(from, to, value) });
        }
        if (to.kind === 'enum')
            return null;
        if (to.kind === 'pointer') {
            if (from.kind === 'nullptr' || X.isNullPointerConstant(value))
                return standard(CONVERSION, function () { return self.convertScalar(value, to); },
                                { nullPointer: true });
            if (from.kind !== 'pointer')
                return null;
            var fromTarget = from.to, toTarget = to.to;
            var fromPlain = unqual(fromTarget), toPlain = unqual(toTarget);
            var fromCv = X.cvOf(fromTarget), toCv = X.cvOf(toTarget);
            if (!cvContains(toCv, fromCv)) {
                // Multi-level: T** to const T* const* is not supported; only one level.
                return null;
            }
            var qualified = fromCv !== toCv;
            if (fromPlain === toPlain)
                return standard(EXACT, function () { return self.retype(value, to); }, { qualified: qualified });
            if (toPlain.kind === 'void' && fromPlain.kind !== 'function')
                return standard(CONVERSION, function () { return self.retype(value, to); }, { toVoid: true });
            if (fromPlain.isClass && toPlain.isClass && X.isBaseOf(toPlain, fromPlain))
                return standard(CONVERSION, function () { return self.pointerToBase(value, toPlain, to, ir); },
                                { baseDistance: baseDistance(fromPlain, toPlain) });
            if (multiLevelQualification(from, to))
                return standard(EXACT, function () { return self.retype(value, to); }, { qualified: true });
            return null;
        }
        if (to.kind === 'nullptr')
            return from.kind === 'nullptr' ? standard(EXACT, function () { return value; }) : null;
        return null;
    };

    // T** to const T* const*: qualifications at every level.
    function multiLevelQualification(from, to) {
        var a = from, b = to;
        var constSoFar = true;
        while (a.kind === 'pointer' && b.kind === 'pointer') {
            var aCv = X.cvOf(a.to), bCv = X.cvOf(b.to);
            if (!cvContains(bCv, aCv))
                return false;
            if (aCv !== bCv && !constSoFar)
                return false;
            constSoFar = constSoFar && (bCv & X.CONST) !== 0;
            a = unqual(a.to);
            b = unqual(b.to);
        }
        return a === b;
    }

    function isNarrowing(from, to, ir) {
        if (from.kind === 'float' && to.kind !== 'float')
            return true;
        if (from.kind === 'float' && to.kind === 'float')
            return to.size < from.size && ir.value === undefined;
        if (to.kind === 'float')
            return ir.value === undefined;
        if (to === types.bool)
            return false;
        var fromBase = from.kind === 'enum' ? from.underlying : from;
        if (ir.value !== undefined) {
            var wrapped = X.wrapValue(ir.value, to);
            return big.cmp(wrapped, ir.value) !== 0;
        }
        return fromBase.size > to.size || (fromBase.signed !== to.signed && fromBase.size >= to.size) ||
            (fromBase.signed && !to.signed);
    }

    Parser.prototype.overloadConversion = function (target, ir, options) {
        var to = unqual(X.removeRef(target));
        // std::function<int(int)> f = twice: the function is an lvalue.
        var plain = ir.set.items.filter(function (item) { return item.kind === 'func' && !item.isMember; });
        if (to.isClass && plain.length === 1 && ir.set.items.length === 1) {
            this.useFunction(plain[0], ir);
            plain[0].addressTaken = true;
            var lvalue = this.ir('func', ir, { func: plain[0], type: plain[0].type, cat: 'lvalue' });
            return this.conversion(target, lvalue, options);
        }
        var pointerType = to.kind === 'pointer' && to.to.kind === 'function' ? to : null;
        if (pointerType === null && to.kind === 'function')
            pointerType = X.pointerTo(to);
        if (pointerType === null)
            return null;
        var func = this.selectFunctionByType(ir.set, pointerType.to);
        if (func === null)
            return null;
        var self = this;
        return standard(EXACT, function () {
            self.useFunction(func, ir);
            func.addressTaken = true;
            if (X.isRef(target))
                return self.ir('func', ir, { func: func, type: func.type, cat: 'lvalue' });
            return self.ir('fnaddr', ir, { func: func, type: pointerType, cat: 'prvalue' });
        });
    };

    // --- References

    Parser.prototype.referenceConversion = function (target, ir, options) {
        var self = this;
        var to = target.to;
        var toPlain = unqual(to);
        var toCv = X.cvOf(to);
        var from = valueType(ir);
        var fromCv = X.cvOf(ir.type);
        var isRvalueRef = target.kind === 'rref';
        var constRef = !isRvalueRef && (toCv & X.CONST) !== 0 && (toCv & X.VOLATILE) === 0;
        var related = from === toPlain || (from.isClass && toPlain.isClass && X.isBaseOf(toPlain, from));
        if (toPlain.kind === 'function' && (ir.k === 'func' || from.kind === 'function')) {
            if (ir.k === 'func' && ir.func.type === toPlain)
                return standard(EXACT, function () { return ir; }, { ref: target.kind });
        }
        // Direct binding to a glvalue of a related type.
        if (related && cvContains(toCv, fromCv) && !ir.bitfield) {
            var bindsDirectly = isRvalueRef ? ir.cat !== 'lvalue' : (ir.cat === 'lvalue' || constRef);
            if (bindsDirectly) {
                var distance = from === toPlain ? 0 : baseDistance(from, toPlain);
                return standard(distance === 0 ? EXACT : CONVERSION, function () {
                    var glvalue = ir.cat === 'prvalue' ? self.temporaryOf(ir, ir.type) : ir;
                    if (from !== toPlain)
                        glvalue = self.baseSubobject(glvalue, toPlain, X.baseOffset(from, toPlain), ir);
                    return self.bound(glvalue, target);
                }, { ref: target.kind, bindsRvalue: ir.cat !== 'lvalue', refCv: toCv, baseDistance: distance,
                     qualified: fromCv !== toCv });
            }
            if (!isRvalueRef && ir.cat !== 'lvalue')
                return null;
            if (isRvalueRef && ir.cat === 'lvalue' && (from.isClass || from === toPlain))
                return null;
        }
        // A conversion function giving an lvalue of the type (rare).
        if (!isRvalueRef && !constRef) {
            if (from.isClass && !options.noUser) {
                var lvalueConversion = this.conversionFunction(target, ir, options);
                if (lvalueConversion !== null)
                    return lvalueConversion;
            }
            return null;
        }
        if (related && !cvContains(toCv, fromCv))
            return null;
        // A temporary initialized from the value.
        var inner = this.conversion(toPlain, ir, options);
        if (inner === null)
            return null;
        var result = Object.create(null);
        Object.keys(inner).forEach(function (key) { result[key] = inner[key]; });
        result.ref = target.kind;
        result.bindsRvalue = true;
        result.refCv = toCv;
        result.build = function () {
            var value = inner.build();
            return self.bound(self.temporaryOf(value, toPlain), target);
        };
        return result;
    };

    // A temporary object holding a value (a scalar or a class).
    Parser.prototype.temporaryOf = function (value, type) {
        if (value.cat !== 'prvalue')
            return value;
        return this.ir('temp', value, { init: value, type: type, cat: 'xvalue', dtor: this.elementDestructor(type) });
    };

    // A glvalue bound to a reference type: the category of the reference.
    Parser.prototype.bound = function (glvalue, target) {
        var copy = this.shallowCopy(glvalue);
        copy.cat = target.kind === 'lref' ? 'lvalue' : 'xvalue';
        copy.type = target.to;
        this.markBound(glvalue);
        if (glvalue.value !== undefined && glvalue.k === 'var')
            glvalue.obj.addressNeeded = true;
        delete copy.value;
        return copy;
    };

    // A glvalue bound to a reference must live in memory.
    Parser.prototype.markBound = function (glvalue) {
        switch (glvalue.k) {
        case 'var':
        case 'field':
        case 'glvadj':
            this.markAddressTaken(glvalue);
            return;
        case 'assign':
        case 'compound':
        case 'incdec':
            this.markBound(glvalue.target);
            return;
        case 'cond':
            this.markBound(glvalue.then);
            this.markBound(glvalue.otherwise);
            return;
        case 'comma':
            this.markBound(glvalue.list[glvalue.list.length - 1]);
        }
    };

    // --- Classes

    Parser.prototype.classConversion = function (to, ir, options) {
        var self = this;
        var from = valueType(ir);
        if (!to.complete)
            return null;
        if (from === to || (from.isClass && X.isBaseOf(to, from))) {
            var distance = baseDistance(from, to);
            if (ir.cat === 'prvalue' && from === to)
                return standard(EXACT, function () { return ir; });
            // The copy or move constructor.
            return standard(distance === 0 ? EXACT : CONVERSION, function () {
                var source = from === to ? ir : self.baseSubobject(ir, to, X.baseOffset(from, to), ir);
                return self.copyInitialize(to, source, ir);
            }, { baseDistance: distance, copyCtor: true });
        }
        if (options.noUser)
            return null;
        // Converting constructors of the target and conversion functions of the source.
        var candidates = [];
        var self2 = this;
        this.classCtors(to).forEach(function (ctor) {
            if ((ctor.kind === 'template' ? ctor.explicitCtor : ctor.explicit) && !options.explicit)
                return;
            candidates.push(ctor);
        });
        var best = null;
        if (candidates.length > 0) {
            var resolution = this.resolveOverload(candidates, [ir], ir, { noUser: true, ctorOf: to, silent: true });
            if (resolution !== null && resolution.best !== null)
                best = { kind: 'ctor', resolution: resolution };
        }
        if (from.isClass) {
            var viaFunction = this.conversionFunction(to, ir, options);
            if (viaFunction !== null && best === null)
                return viaFunction;
        }
        if (best === null)
            return null;
        var chosen = best.resolution;
        return { kind: 'user', rank: 4, user: chosen.best, second: null, ref: null, bindsRvalue: false, refCv: 0,
                 qualified: false, toBool: false, baseDistance: 0, build: function () {
                     return self2.constructWith(to, chosen, ir);
                 } };
    };

    // The constructors of a class (implicit ones declared on demand).
    Parser.prototype.classCtors = function (cls) {
        this.declareImplicitMembers(cls);
        var list = cls.ctors.concat(cls.ctorTemplates);
        if (cls.inheritedCtors)
            list = list.concat(this.inheritedConstructors(cls));
        return list;
    };

    // A conversion function of the class of ir to a type.
    Parser.prototype.conversionFunction = function (to, ir, options) {
        var self = this;
        var from = valueType(ir);
        var functions = this.conversionFunctions(from);
        var best = null;
        functions.forEach(function (func) {
            if (func.explicit && !options.explicit &&
                !(options.contextualBool && unqual(X.removeRef(to)) === types.bool))
                return;
            var result = func.type.returns;
            var resultIr = { k: 'probe', type: X.removeRef(result),
                             cat: X.isRef(result) ? (result.kind === 'lref' ? 'lvalue' : 'xvalue')
                                                                                         : 'prvalue',
                             line: ir.line, file: ir.file };
            var second;
            if (X.isRef(to))
                second = self.referenceConversion(to, resultIr, { noUser: true });
            else if (unqual(to).isClass)
                second = unqual(X.removeRef(result)) === unqual(to) ? standard(EXACT, null) : null;
            else
                second = self.standardConversion(unqual(to), resultIr);
            if (second === null)
                return;
            if (!self.objectBinds(func, ir))
                return;
            if (best === null || second.rank < best.second.rank)
                best = { func: func, second: second };
        });
        if (best === null)
            return null;
        var chosen = best;
        return { kind: 'user', rank: 4, user: chosen.func, second: chosen.second, ref: null, bindsRvalue: false,
                 refCv: 0,
                 qualified: false, toBool: false, baseDistance: 0, build: function () {
                     var call = self.callConversion(chosen.func, ir);
                     if (X.isRef(to))
                         return self.referenceConversion(to, call, { noUser: true }).build();
                     if (unqual(to).isClass)
                         return call;
                     return self.standardConversion(unqual(to), call).build();
                 } };
    };

    // The conversion functions of a class and its bases.
    Parser.prototype.conversionFunctions = function (cls) {
        var list = [];
        (function collect(current) {
            current.conversions.forEach(function (func) {
                var hidden = list.some(function (other) { return other.type.returns === func.type.returns; });
                if (!hidden)
                    list.push(func);
            });
            current.bases.forEach(function (base) { collect(base.type); });
        })(cls);
        return list;
    };

    // Whether the object of a value can call a member function (const).
    Parser.prototype.objectBinds = function (func, ir) {
        if (!func.isMember)
            return true;
        if (X.isConst(ir.type) && (func.type.cv & X.CONST) === 0)
            return false;
        if (func.type.ref === '&' && ir.cat !== 'lvalue')
            return false;
        if (func.type.ref === '&&' && ir.cat === 'lvalue')
            return false;
        return true;
    };

    Parser.prototype.callConversion = function (func, ir) {
        var object = ir.cat === 'prvalue' ? this.materialize(ir) : ir;
        return this.memberCall(func, object, [], ir, false);
    };

    // A class value to a scalar through a conversion function (built-in
    // operators, conditions); target null - the only conversion function.
    Parser.prototype.classToScalar = function (ir, target, node, explicit) {
        var from = valueType(ir);
        if (target !== null) {
            var ics = this.conversionFunction(target, ir,
                                              { explicit: explicit, contextualBool: target === types.bool });
            return ics === null ? null : ics.build();
        }
        var functions = this.conversionFunctions(from).filter(function (func) {
            return !func.explicit && !unqual(X.removeRef(func.type.returns)).isClass;
        });
        if (functions.length !== 1)
            return null;
        return this.callConversion(functions[0], ir);
    };

    Parser.prototype.convertToIntegral = function (ir, node) {
        var functions = this.conversionFunctions(valueType(ir)).filter(function (func) {
            var result = unqual(X.removeRef(func.type.returns));
            return X.isIntegralLike(result) || result.kind === 'enum';
        });
        if (functions.length !== 1)
            this.error(node, "switch quantity not an integer");
        return this.callConversion(functions[0], ir);
    };

    // --- Pointers

    Parser.prototype.pointerToBase = function (value, base, to, node) {
        var from = unqual(valueType(value).to);
        var offset = X.baseOffset(from, base);
        if (offset === 0)
            return this.retype(value, to);
        return this.ir('ptradj', node,
                       { operand: value, offset: offset, nullCheck: true, type: unqual(to), cat: 'prvalue' });
    };

    Parser.prototype.implicitPointer = function (value, to, node) {
        var ics = this.standardConversion(unqual(to), value);
        if (ics === null)
            this.error(node, "invalid conversion from '" + X.typeString(value.type) + "' to '" + X.typeString(to) +
                       "'");
        return ics.build();
    };

    // --- Copy-initialization

    // T x = e; arguments; returns. context: 'initialization' (the default),
    // 'assignment', 'argument', 'return'.
    Parser.prototype.initializeFrom = function (target, ir, node, explicit, context) {
        if (ir.k === 'braced')
            return this.listInitialize(target, ir.items, node, true);
        var plain = unqual(target);
        if (plain.kind === 'array' && !X.isRef(target))
            return this.arrayFromExpression(plain, ir, node);
        var ics = this.conversion(target, ir, { explicit: !!explicit });
        if (ics === null)
            this.conversionError(target, ir, node, context);
        return ics.build();
    };

    Parser.prototype.conversionError = function (target, ir, node, context) {
        var from = ir.k === 'overload' ? '<unresolved overloaded function type>' : X.typeString(ir.type);
        var to = X.typeString(target);
        var plain = unqual(X.removeRef(target));
        var where = context === 'assignment' ? 'in assignment' : (context === 'return' ? 'in return'
                                                                  : (context === 'argument' ? 'in argument passing'
                                                                                            : 'in initialization'));
        if (X.isRef(target) && target.kind === 'lref' && !X.isConst(target.to) && ir.cat !== 'lvalue' &&
            unqual(ir.type) === plain)
            this.error(node, "cannot bind non-const lvalue reference of type '" + to + "' to an rvalue of type '" +
                       X.typeString(unqual(ir.type)) + "'");
        if (X.isRef(target) && target.kind === 'rref' && ir.cat === 'lvalue' && unqual(ir.type) === plain)
            this.error(node, "cannot bind rvalue reference of type '" + to + "' to lvalue of type '" +
                       X.typeString(ir.type) + "'");
        if (X.isRef(target) && unqual(ir.type) === plain && !X.isConst(target.to))
            this.error(node, "binding reference of type '" + to + "' to '" + from + "' discards qualifiers");
        if (plain.isClass && !unqual(ir.type).isClass)
            this.error(node, "conversion from '" + from + "' to non-scalar type '" + X.typeString(plain) +
                       "' requested");
        if (plain.isClass && unqual(ir.type).isClass && unqual(ir.type) !== plain)
            this.error(node, "conversion from '" + from + "' to non-scalar type '" + X.typeString(plain) +
                       "' requested");
        if (plain.isClass) {
            this.copyInitialize(plain, ir, node);
            this.error(node, "use of deleted function");
        }
        var fromType = unqual(ir.type);
        if (fromType.kind === 'pointer' && X.isIntegral(plain) || X.isIntegral(fromType) && plain.kind === 'pointer')
            this.error(node, "invalid conversion from '" + from + "' to '" + to + "'");
        if (fromType.kind === 'pointer' && plain.kind === 'pointer')
            this.error(node, "invalid conversion from '" + from + "' to '" + to + "'");
        this.error(node, "cannot convert '" + from + "' to '" + to + "'" + (context === 'argument' ? '' : ' ' + where));
    };

    // A class object from a glvalue or prvalue of its own type: the copy or
    // move constructor (a trivial one is a memory copy).
    Parser.prototype.copyInitialize = function (cls, ir, node) {
        if (ir.cat === 'prvalue' && valueType(ir) === cls)
            return ir;
        this.declareImplicitMembers(cls);
        var resolution = this.resolveOverload(this.classCtors(cls), [ir], node,
                                              { noUser: true, ctorOf: cls, silent: true });
        if (resolution === null || resolution.best === null) {
            var copy = this.findCopyCtor(cls);
            if (copy !== null && copy.deleted)
                this.error(node, "use of deleted function '" + X.functionSignature(copy) + "'");
            this.error(node, "no matching function for call to '" + X.typeString(cls) + '(' + this.argumentText(ir) +
                       ")'");
        }
        return this.constructWith(cls, resolution, node);
    };

    // A copy of an object at an address (catch by value).
    Parser.prototype.copyFromAddress = function (cls, node) {
        var probe = { k: 'probe', type: X.qualify(cls, X.CONST), cat: 'lvalue', line: node.line, file: node.file };
        var resolution = this.resolveOverload(this.classCtors(cls), [probe], node,
                                              { noUser: true, ctorOf: cls, silent: true });
        if (resolution === null || resolution.best === null)
            this.error(node, "no matching function for call to '" + X.typeString(cls) + "(const " + X.typeString(cls) +
                       "&)'");
        return resolution.best;
    };

    // --- Initialization of variables

    Parser.prototype.initializeVariable = function (object, init, node) {
        var ir = this.variableInitializer(object, init, node);
        var type = object.type;
        // const int n = square(4): a constant if square is constexpr.
        if (object.isConst && ir !== null && X.isScalar(unqual(type)) && unqual(type).kind !== 'pointer')
            this.constantIr(ir);
        // int a[] = {1, 2}: the bound comes from the initializer.
        if (type.kind === 'array' && type.length === null && ir !== null && ir.type.kind === 'array' &&
            ir.type.length !== null)
            object.type = X.arrayOf(type.of, ir.type.length);
        return ir;
    };

    Parser.prototype.variableInitializer = function (object, init, node) {
        var type = object.type;
        if (init === null) {
            if (X.isRef(type))
                this.error(node, "'" + object.name + "' declared as reference but not initialized");
            if (X.isConst(type) && !unqual(type).isClass && object.storage === 'local')
                this.error(node, "uninitialized 'const " + object.name + "'");
            return this.defaultInitialize(type, node, object.storage !== 'local');
        }
        switch (init.k) {
        case 'copy': {
            if (init.expr.k === 'string' && unqual(type).kind === 'array')
                return this.arrayFromString(unqual(type), init.expr, node);
            var value = this.check(init.expr);
            return this.initializeFrom(type, value, init.expr);
        }
        case 'braced':
            return this.listInitialize(type, init.items, init, init.copy);
        case 'direct': {
            var args = this.checkArguments(init.args);
            // member() in a constructor: value-initialization (zeros).
            if (args.length === 0 && !X.isRef(type))
                return this.valueInitialize(unqual(type), init);
            if (X.isRef(type) || !unqual(type).isClass) {
                if (args.length !== 1)
                    this.error(node, args.length === 0
                        ? "'" + object.name + "' declared as reference but not initialized"
                        : 'expression list treated as compound expression in initializer');
                return this.initializeFrom(type, args[0], init, true);
            }
            return this.directInitialize(unqual(type), args, init, false);
        }
        }
        this.error(node, 'unexpected initializer');
    };

    // T x; - a class gets its default constructor; isStatic - statics
    // start zeroed.
    Parser.prototype.defaultInitialize = function (type, node, isStatic) {
        var plain = unqual(type);
        if (plain.isClass) {
            this.declareImplicitMembers(plain);
            if (this.isTriviallyDefaultConstructible(plain))
                return isStatic ? null : this.ir('default', node, { type: plain, cat: 'prvalue' });
            return this.directInitialize(plain, [], node, false, true);
        }
        if (plain.kind === 'array' && unqual(plain.of).isClass &&
            !this.isTriviallyDefaultConstructible(unqual(baseElement(plain)))) {
            var element = this.defaultInitialize(plain.of, node, isStatic);
            return this.ir('arrayinit', node, { type: plain, items: [], fill: element, cat: 'prvalue' });
        }
        return null;
    };

    function baseElement(type) {
        while (type.kind === 'array')
            type = unqual(type.of);
        return type;
    }

    // T() and T{}: zero, then the default constructor if a user wrote it.
    Parser.prototype.valueInitialize = function (type, node) {
        var plain = unqual(type);
        if (plain.isClass) {
            this.declareImplicitMembers(plain);
            var ctor = this.defaultCtor(plain);
            if (ctor !== null && !ctor.implicit && !ctor.defaulted)
                return this.directInitialize(plain, [], node, false, true);
            if (this.isTriviallyDefaultConstructible(plain))
                return this.ir('zero', node, { type: plain, cat: 'prvalue' });
            var construct = this.directInitialize(plain, [], node, false, true);
            construct.zeroFirst = true;
            return construct;
        }
        if (plain.kind === 'array')
            return this.ir('zero', node, { type: plain, cat: 'prvalue' });
        if (plain.kind === 'void')
            return this.ir('conv', node, { operand: this.constant(0, types.int, node), from: types.int, to: types.void,
                                           type: types.void, cat: 'prvalue' });
        return this.constant(plain.kind === 'float' ? 0 : big.fromFloat(0), plain, node);
    };

    // T(args) and T x(args): overload resolution among the constructors.
    Parser.prototype.directInitialize = function (cls, args, node, functional, isDefault) {
        if (!cls.complete)
            this.error(node, "invalid use of incomplete type '" + X.typeString(cls) + "'");
        this.declareImplicitMembers(cls);
        if (args.length === 1 && args[0].cat === 'prvalue' && valueType(args[0]) === cls)
            return args[0];
        if (args.length === 0 && functional)
            return this.valueInitialize(cls, node);
        var ctors = this.classCtors(cls);
        if (ctors.length === 0 && args.length === 0)
            return this.ir('default', node, { type: cls, cat: 'prvalue' });
        // An aggregate initialized with parentheses (C++20) is not C++17.
        var resolution = this.resolveOverload(ctors, args, node, { explicit: true, ctorOf: cls });
        return this.constructWith(cls, resolution, node);
    };

    // A construct node from a resolved constructor call.
    Parser.prototype.constructWith = function (cls, resolution, node) {
        var ctor = resolution.best;
        this.useFunction(ctor, node);
        if (ctor.deleted)
            this.error(node, "use of deleted function '" + X.functionSignature(ctor) + "'");
        this.checkAccess(ctor, cls, node);
        var args = this.buildArguments(ctor, resolution, node);
        if (ctor.implicit && ctor.trivial && args.length === 1)
            return this.ir('copy', node, { source: args[0], type: cls, cat: 'prvalue' });
        if (ctor.implicit && ctor.trivial && args.length === 0)
            return this.ir('default', node, { type: cls, cat: 'prvalue' });
        return this.ir('construct', node, { cls: cls, ctor: ctor, args: args, type: cls, cat: 'prvalue' });
    };

    // --- List-initialization

    Parser.prototype.checkListItems = function (items) {
        var self = this;
        var result = [];
        items.forEach(function (item) {
            if (item.k === 'expansion') {
                result = result.concat(self.expandPattern(item.pattern, item));
                return;
            }
            result.push(item.k === 'braced' || item.k === 'designated' ? item : self.check(item));
        });
        return result;
    };

    // T x{...}, T x = {...}, T{...}; copy - copy-list-initialization
    // (explicit constructors are an error).
    Parser.prototype.listInitialize = function (target, syntaxItems, node, copy) {
        var items = this.checkListItems(syntaxItems);
        if (X.isRef(target)) {
            var to = unqual(target.to);
            if (items.length === 1 && items[0].k !== 'braced') {
                var ics = this.referenceConversion(target, items[0], {});
                if (ics !== null)
                    return ics.build();
            }
            var value = this.listInitializeChecked(to, items, node, copy);
            if (target.kind === 'lref' && !X.isConst(target.to))
                this.error(node, "cannot bind non-const lvalue reference of type '" + X.typeString(target) +
                           "' to an rvalue of type '" + X.typeString(to) + "'");
            return this.bound(this.temporaryOf(value, to), target);
        }
        return this.listInitializeChecked(unqual(target), items, node, copy);
    };

    Parser.prototype.listInitializeChecked = function (type, items, node, copy) {
        var self = this;
        if (type.kind === 'array')
            return this.arrayFromList(type, items, node);
        if (type.isClass) {
            if (!type.complete)
                this.error(node, "invalid use of incomplete type '" + X.typeString(type) + "'");
            if (this.isInitializerList(type))
                return this.initializerList(type, items, node);
            this.declareImplicitMembers(type);
            // An initializer_list constructor wins when it can take the items.
            var listCtors = this.classCtors(type).filter(function (ctor) { return self.isInitializerListCtor(ctor); });
            if (listCtors.length > 0 && !(items.length === 0 && this.defaultCtor(type) !== null)) {
                var listArg = { k: 'braced', items: items, line: node.line, file: node.file, checkedItems: true };
                var resolution = this.resolveOverload(listCtors, [listArg], node, { explicit: !copy, ctorOf: type,
                                                                                       silent: true });
                if (resolution !== null && resolution.best !== null)
                    return this.constructWith(type, resolution, node);
            }
            if (items.length === 0 && this.defaultCtor(type) !== null)
                return this.valueInitialize(type, node);
            if (this.isAggregate(type)) {
                if (items.length === 1 && items[0].k !== 'braced' && items[0].k !== 'designated' &&
                    (valueType(items[0]) === type || X.isBaseOf(type, valueType(items[0]))))
                    return this.initializeFrom(type, items[0], node);
                return this.aggregateInitialize(type, items, node);
            }
            var plainItems = items.map(function (item) {
                return item;
            });
            var resolved = this.resolveOverload(this.classCtors(type), plainItems, node, { explicit: true, ctorOf: type,
                                                                                         list: true });
            if (copy && resolved.best.explicit)
                this.error(node, "converting to '" + X.typeString(type) +
                           "' from initializer list would use explicit " +
                           "constructor '" + X.functionSignature(resolved.best) + "'");
            return this.constructWith(type, resolved, node);
        }
        if (items.length === 0)
            return this.valueInitialize(type, node);
        if (items.length > 1)
            this.error(node, "scalar object requires one element in initializer");
        if (items[0].k === 'braced')
            return this.listInitializeChecked(type, this.checkListItems(items[0].items), node, copy);
        var item = items[0];
        var ics = this.conversion(type, item, {});
        if (ics === null)
            this.conversionError(type, item, node);
        if (ics.narrowing)
            this.error(item, "narrowing conversion of '" + this.irText(item) + "' from '" +
                       X.typeString(valueType(item)) +
                       "' to '" + X.typeString(type) + "'");
        return ics.build();
    };

    Parser.prototype.irText = function (ir) {
        if (ir.k === 'var')
            return ir.obj.name;
        if (ir.value !== undefined)
            return typeof ir.value === 'number' ? String(ir.value) : big.str(ir.value);
        return '...';
    };

    // A braced list as an argument: the conversion sequence of the list.
    Parser.prototype.listConversion = function (target, list, options) {
        var self = this;
        var items = list.checkedItems ? list.items : this.checkListItems(list.items);
        var plain = unqual(X.removeRef(target));
        if (plain.isClass && this.isInitializerList(plain)) {
            var element = plain.templateArgs[0].type;
            var worst = EXACT;
            for (var index = 0; index < items.length; ++index) {
                var itemIcs = this.conversion(element, items[index], { noUser: false });
                if (itemIcs === null || itemIcs.narrowing)
                    return null;
                worst = Math.max(worst, itemIcs.rank);
            }
            return standard(worst, function () { return self.initializerList(plain, items, list); }, { list: true });
        }
        if (plain.isClass) {
            if (!plain.complete)
                return null;
            this.declareImplicitMembers(plain);
            var listCtors = this.classCtors(plain).filter(function (ctor) { return self.isInitializerListCtor(ctor); });
            if (listCtors.length > 0) {
                var listArg = { k: 'braced', items: items, line: list.line, file: list.file, checkedItems: true };
                var listResolution = this.resolveOverload(listCtors, [listArg], list, { ctorOf: plain, silent: true,
                                                                                       noUser: true });
                if (listResolution !== null && listResolution.best !== null)
                    return { kind: 'user', rank: 4, user: listResolution.best, second: null,
                             ref: X.isRef(target) ? target.kind : null,
                             bindsRvalue: true, refCv: 0, qualified: false, toBool: false, baseDistance: 0, list: true,
                             build: function () {
                                 return self.wrapListResult(target, self.constructWith(plain, listResolution, list));
                             } };
            }
            if (this.isAggregate(plain)) {
                return { kind: 'user', rank: 4, user: null, second: null, ref: X.isRef(target) ? target.kind : null,
                         bindsRvalue: true, refCv: 0, qualified: false, toBool: false, baseDistance: 0, list: true,
                         aggregate: true,
                         build: function () {
                             return self.wrapListResult(target, self.aggregateInitialize(plain, items, list));
                         } };
            }
            var resolution = this.resolveOverload(this.classCtors(plain), items, list, { ctorOf: plain, silent: true,
                                                                                       noUser: items.length === 1 });
            if (resolution === null || resolution.best === null)
                return null;
            if (resolution.best.explicit)
                return null;
            return { kind: 'user', rank: 4, user: resolution.best, second: null,
                     ref: X.isRef(target) ? target.kind : null,
                     bindsRvalue: true, refCv: 0, qualified: false, toBool: false, baseDistance: 0, list: true,
                     build: function () { return self.wrapListResult(target,
                                                                     self.constructWith(plain, resolution, list)); } };
        }
        if (plain.kind === 'array')
            return null;
        if (items.length === 0)
            return standard(EXACT,
                            function () { return self.wrapListResult(target, self.valueInitialize(plain, list)); });
        if (items.length !== 1 || items[0].k === 'braced')
            return null;
        var inner = this.conversion(plain, items[0], options);
        if (inner === null || inner.narrowing)
            return null;
        var result = this.shallowCopy(inner);
        result.build = function () { return self.wrapListResult(target, inner.build()); };
        return result;
    };

    Parser.prototype.wrapListResult = function (target, value) {
        if (!X.isRef(target))
            return value;
        return this.bound(this.temporaryOf(value, unqual(target.to)), target);
    };

    // --- Aggregates

    // A class is an aggregate: no user constructors, no private or
    // protected data members, no virtual functions, public bases.
    Parser.prototype.isAggregate = function (cls) {
        if (cls.aggregate !== undefined)
            return cls.aggregate;
        var result = cls.ctors.every(function (ctor) { return ctor.implicit || ctor.deleted || ctor.defaulted; }) &&
            cls.ctorTemplates.length === 0 &&
            !cls.polymorphic && !cls.inheritedCtors &&
            cls.dataMembers.every(function (field) { return field.access === 'public'; }) &&
            cls.bases.every(function (base) { return base.access === 'public' && !base.virtual; });
        cls.aggregate = result;
        return result;
    };

    // The parts of an aggregate in order: bases, then fields.
    Parser.prototype.aggregateParts = function (cls) {
        var parts = [];
        cls.bases.forEach(function (base) {
            parts.push({ type: base.type, offset: base.offset, base: true, name: null });
        });
        cls.dataMembers.forEach(function (field) {
            if (field.name === null && !field.anonymous)
                return;
            parts.push({ type: field.type, offset: field.offset, field: field, name: field.name });
        });
        return cls.kind === 'union' ? parts.slice(0, 1).concat(parts.filter(function () { return false; })) : parts;
    };

    Parser.prototype.aggregateInitialize = function (cls, items, node) {
        var cursor = { items: items, index: 0 };
        var result = this.aggregateFrom(cls, cursor, node, true);
        if (cursor.index < items.length)
            this.error(items[cursor.index], "too many initializers for '" + X.typeString(cls) + "'");
        return result;
    };

    // Initializes an aggregate from a cursor over list items; braced - the
    // items are its own list (otherwise braces are elided).
    Parser.prototype.aggregateFrom = function (type, cursor, node, braced) {
        if (type.kind === 'array')
            return this.arrayFromCursor(type, cursor, node, braced);
        var parts = this.aggregateParts(type);
        if (type.kind === 'union' && cursor.index < cursor.items.length &&
            cursor.items[cursor.index].k === 'designated') {
            var designatedName = cursor.items[cursor.index].field;
            parts = type.dataMembers.filter(function (field) {
                return field.name === designatedName;
            }).map(function (field) {
                return { type: field.type, offset: field.offset, field: field, name: field.name };
            });
        }
        var initialized = [];
        var partIndex = 0;
        for (; partIndex < parts.length && cursor.index < cursor.items.length; ++partIndex) {
            var item = cursor.items[cursor.index];
            if (item.k === 'designated') {
                var found = -1;
                for (var search = partIndex; search < parts.length; ++search) {
                    if (parts[search].name === item.field)
                        found = search;
                }
                if (found < 0)
                    this.error(item, "'" + X.typeString(type) + "' has no non-static data member named '" + item.field +
                               "'");
                partIndex = found;
                ++cursor.index;
                var designatedValue = item.value.k === 'braced' ? item.value : this.check(item.value);
                initialized.push({ offset: parts[found].offset, type: parts[found].type, field: parts[found].field,
                                   init: this.memberInitFromItem(parts[found].type, designatedValue, item) });
                continue;
            }
            var part = parts[partIndex];
            initialized.push({ offset: part.offset, type: part.type, field: part.field,
                               init: this.memberFromCursor(part.type, cursor, node) });
        }
        // The rest: default member initializers or value-initialization.
        for (; partIndex < parts.length; ++partIndex) {
            var rest = parts[partIndex];
            if (rest.field && rest.field.initTokens !== null && rest.field.initTokens !== undefined) {
                initialized.push({ offset: rest.offset, type: rest.type, field: rest.field,
                                   init: this.memberDefaultInit(type, rest.field, node) });
            } else if (X.isRef(rest.type)) {
                this.error(node, "uninitialized reference member in '" + X.typeString(rest.type) + "'");
            } else if (unqual(rest.type).isClass && !this.isTriviallyDefaultConstructible(unqual(rest.type))) {
                initialized.push({ offset: rest.offset, type: rest.type, field: rest.field,
                                   init: this.valueInitialize(rest.type, node) });
            }
        }
        return this.ir('aggregate', node, { type: type, items: initialized, cat: 'prvalue' });
    };

    Parser.prototype.memberInitFromItem = function (type, item, node) {
        if (item.k === 'braced')
            return this.listInitialize(type, item.items, item, true);
        if (item.k === 'string' && unqual(type).kind === 'array')
            return this.arrayFromString(unqual(type), item, node);
        return this.initializeFrom(type, item, item);
    };

    // One member of an aggregate from the cursor (with brace elision).
    Parser.prototype.memberFromCursor = function (type, cursor, node) {
        var item = cursor.items[cursor.index];
        var plain = unqual(type);
        if (item.k === 'braced') {
            ++cursor.index;
            return this.listInitialize(type, item.items, item, true);
        }
        if (plain.kind === 'array' && item.k === 'string' && X.isIntegral(unqual(plain.of)) &&
            unqual(plain.of).size === 1) {
            ++cursor.index;
            return this.arrayFromString(plain, item, node);
        }
        if ((plain.kind === 'array' || (plain.isClass && this.isAggregate(plain))) && !X.isRef(type)) {
            // Brace elision: the item belongs to the first element unless it
            // converts to the whole member.
            if (!(plain.isClass && (valueType(item) === plain || this.conversion(type, item, {}) !== null)))
                return this.aggregateFrom(plain, cursor, node, false);
        }
        ++cursor.index;
        if (item.k === 'designated')
            this.error(item, 'designator order does not match the declaration order');
        var ics = this.conversion(type, item, {});
        if (ics === null)
            this.conversionError(type, item, item);
        if (ics.narrowing)
            this.error(item, "narrowing conversion of '" + this.irText(item) + "' from '" +
                       X.typeString(valueType(item)) +
                       "' to '" + X.typeString(unqual(type)) + "'");
        return ics.build();
    };

    // --- Arrays

    Parser.prototype.arrayFromList = function (type, items, node) {
        var cursor = { items: items, index: 0 };
        var result = this.arrayFromCursor(type, cursor, node, true);
        if (cursor.index < items.length)
            this.error(items[cursor.index], "too many initializers for '" + X.typeString(type) + "'");
        return result;
    };

    Parser.prototype.arrayFromCursor = function (type, cursor, node, braced) {
        var element = type.of;
        var values = [];
        var limit = type.length === null ? Infinity : type.length;
        if (cursor.index < cursor.items.length && cursor.items[cursor.index].k === 'string' && braced &&
            X.isIntegral(unqual(element)) && unqual(element).size === 1 && cursor.items.length === 1) {
            ++cursor.index;
            return this.arrayFromString(type, cursor.items[0], node);
        }
        while (values.length < limit && cursor.index < cursor.items.length) {
            if (cursor.items[cursor.index].k === 'designated')
                break;
            values.push(this.memberFromCursor(element, cursor, node));
        }
        var length = type.length === null ? values.length : type.length;
        var fill = null;
        if (values.length < length && unqual(element).isClass && !this.isTriviallyDefaultConstructible(unqual(element)))
            fill = this.valueInitialize(element, node);
        return this.ir('arrayinit', node,
                       { type: X.arrayOf(element, length), items: values, fill: fill, cat: 'prvalue' });
    };

    // char s[] = "text";
    Parser.prototype.arrayFromString = function (type, literal, node) {
        var element = unqual(type.of);
        var string = literal.k === 'string' ? this.stringIr(literal) : literal;
        if (!X.isIntegral(element) || (element.size === 1) === string.wide)
            this.error(node, "array must be initialized with a brace-enclosed initializer");
        var length = type.length === null ? string.bytes.length + 1 : type.length;
        if (string.bytes.length > length)
            this.error(node, "initializer-string for '" + X.typeString(type) + "' is too long");
        return this.ir('arrayinit', node, { type: X.arrayOf(type.of, length), string: string.bytes, wide: string.wide,
                                            items: [], fill: null, cat: 'prvalue' });
    };

    Parser.prototype.arrayFromExpression = function (type, ir, node) {
        if (ir.k === 'string')
            return this.arrayFromString(type, ir, node);
        if (valueType(ir) === type || (valueType(ir).kind === 'array' && unqual(valueType(ir).of) === unqual(type.of)))
            return this.ir('arraycopy', node, { source: ir, type: type, cat: 'prvalue' });
        this.error(node, "array must be initialized with a brace-enclosed initializer");
    };

    // --- std::initializer_list

    Parser.prototype.isInitializerList = function (cls) {
        return cls.template !== null && cls.template.name === 'initializer_list' &&
            X.qualifiedName(cls.template) === 'std::initializer_list';
    };

    Parser.prototype.isInitializerListCtor = function (ctor) {
        if (ctor.kind === 'template') {
            // template <class T> X(std::initializer_list<T>)
            var patterns = ctor.pattern.params;
            if (patterns.length === 0)
                return false;
            var pattern = unqual(X.removeRef(patterns[0]));
            return pattern.kind === 'tspec' && pattern.template.name === 'initializer_list' &&
                ctor.paramInfo.slice(1).every(function (param) {
                    return param.defaultArg !== null || param.defaultTokens !== null;
                });
        }
        var params = ctor.type.params;
        if (params.length === 0)
            return false;
        var first = unqual(X.removeRef(params[0]));
        if (!first.isClass || !this.isInitializerList(first))
            return false;
        for (var index = 1; index < ctor.params.length; ++index) {
            if (!this.hasDefault(ctor.params[index]))
                return false;
        }
        return true;
    };

    Parser.prototype.hasDefault = function (param) {
        return param.defaultArg !== null && param.defaultArg !== undefined ||
            param.defaultTokens !== null && param.defaultTokens !== undefined;
    };

    // The backing array of the items and the list object over it.
    Parser.prototype.initializerList = function (listType, items, node) {
        var element = listType.templateArgs[0].type;
        var self = this;
        var values = items.map(function (item) {
            if (item.k === 'braced')
                return self.listInitialize(element, item.items, item, true);
            var ics = self.conversion(element, item, {});
            if (ics === null)
                self.conversionError(element, item, item);
            if (ics.narrowing)
                self.error(item, "narrowing conversion of '" + self.irText(item) + "' from '" +
                           X.typeString(valueType(item)) + "' to '" + X.typeString(unqual(element)) + "'");
            return ics.build();
        });
        var arrayType = X.arrayOf(X.qualify(unqual(element), X.CONST), values.length);
        var array = this.ir('arrayinit', node, { type: arrayType, items: values, fill: null, cat: 'prvalue' });
        return this.ir('initlist', node,
                       { array: array, length: values.length, type: listType, elemType: unqual(element),
                                           cat: 'prvalue' });
    };

    // --- Returns

    Parser.prototype.initializeReturn = function (type, syntax, tok) {
        if (syntax.k === 'braced')
            return this.listInitialize(type, syntax.items, syntax, true);
        var value = this.check(syntax);
        var plain = unqual(type);
        // return local; moves when it can (the implicit move of C++17).
        if (plain.isClass && !X.isRef(type) && value.k === 'var' && value.obj.storage === 'local' &&
            !X.isRef(value.obj.type) && unqual(value.type) === plain && !value.parenthesized) {
            var moved = this.shallowCopy(value);
            moved.cat = 'xvalue';
            var moveIcs = this.conversion(type, moved, {});
            if (moveIcs !== null && !(moveIcs.copyCtor && false)) {
                var built = moveIcs.build();
                built.returnsLocal = value.obj;
                return built;
            }
        }
        if (plain.isClass && !X.isRef(type) && value.k === 'var' && value.obj.storage === 'local' &&
            X.isRef(value.obj.type) === false && unqual(value.type) !== plain && X.isBaseOf(plain,
                                                                                            unqual(value.type))) {
            var movedBase = this.shallowCopy(value);
            movedBase.cat = 'xvalue';
            var baseIcs = this.conversion(type, movedBase, {});
            if (baseIcs !== null)
                return baseIcs.build();
        }
        return this.initializeFrom(type, value, syntax, false, 'return');
    };

    // Whether a conversion exists (for ?: and probes) - null or the ics.
    Parser.prototype.attemptImplicit = function (type, ir, node) {
        return this.conversion(type, ir, {});
    };

    Parser.prototype.attemptBind = function (target, ir, node) {
        var ics = this.referenceConversion(target, ir, { explicit: true });
        return ics === null ? null : ics.build();
    };

    Parser.prototype.glvalueFromBinding = function (bound, target, node) {
        var copy = this.shallowCopy(bound);
        copy.cat = target.kind === 'lref' ? 'lvalue' : 'xvalue';
        return copy;
    };

    // A reference variable bound to a value (range-for).
    Parser.prototype.bindReference = function (refType, ir, node) {
        return this.initializeFrom(refType, ir, node);
    };

    // --- auto

    Parser.prototype.deduceVariable = function (type, init, node) {
        if (init === null)
            this.error(node, "declaration of 'auto " + node.name + "' has no initializer");
        var value;
        if (init.k === 'braced') {
            var items = this.checkListItems(init.items);
            if (!init.copy && items.length === 1)
                value = items[0];
            else if (init.copy) {
                if (items.length === 0)
                    this.error(node, "unable to deduce 'std::initializer_list<auto>' from '{}'");
                var element = X.decay(items[0].type);
                var listTemplate = this.session.stdTemplate('initializer_list');
                var listType = this.specialize(listTemplate, [{ kind: 'type', type: element }], node);
                return X.qualify(listType, X.cvOf(type));
            } else
                this.error(node, "direct-list-initialization of 'auto' requires exactly one element");
        } else if (init.k === 'copy') {
            value = this.check(init.expr);
            init.expr = { k: 'checked', ir: value, line: init.expr.line, column: init.expr.column,
                          file: init.expr.file };
        } else {
            if (init.args.length !== 1)
                this.error(node, "invalid use of 'auto'");
            value = this.check(init.args[0]);
            init.args[0] = { k: 'checked', ir: value, line: node.line, file: node.file };
        }
        if (init.k === 'braced' && !init.copy) {
            init.k = 'copy';
            init.expr = { k: 'checked', ir: value, line: node.line, file: node.file };
        }
        return this.deducePlaceholder(type, value, node);
    };

    // The type of auto, auto&, const auto&, auto&&, auto* from a value.
    Parser.prototype.deducePlaceholder = function (placeholder, ir, node) {
        if (ir.k === 'overload')
            ir = this.resolveAddress(ir, null, node);
        if (placeholder === X.DECLTYPE_AUTO || unqual(placeholder) === X.DECLTYPE_AUTO) {
            if (ir.cat === 'lvalue' && !(ir.k === 'var' && !ir.parenthesized))
                return X.lref(ir.type);
            if (ir.cat === 'xvalue')
                return X.rref(ir.type);
            return ir.k === 'var' ? ir.obj.type : ir.type;
        }
        var valueTypeOf = valueType(ir).kind === 'void' && unqual(placeholder) === X.AUTO ? types.void : ir.type;
        switch (placeholder.kind) {
        case 'lref':
            if (unqual(placeholder.to) === X.AUTO) {
                var lvalueType = X.qualify(ir.type, X.cvOf(placeholder.to));
                if (ir.cat === 'prvalue' && !X.isConst(lvalueType))
                    this.error(node, "cannot bind non-const lvalue reference of type '" +
                               X.typeString(X.lref(lvalueType)) +
                               "' to an rvalue of type '" + X.typeString(unqual(ir.type)) + "'");
                return X.lref(lvalueType);
            }
            break;
        case 'rref':
            if (placeholder.to === X.AUTO)
                return ir.cat === 'lvalue' ? X.lref(ir.type) : X.rref(ir.type);
            if (unqual(placeholder.to) === X.AUTO)
                return X.rref(X.qualify(unqual(ir.type), X.cvOf(placeholder.to)));
            break;
        case 'pointer': {
            var pointer = X.decay(ir.type);
            if (pointer.kind !== 'pointer')
                this.error(node, "unable to deduce '" + X.typeString(placeholder) + "' from '" + this.irText(ir) + "'");
            return X.qualify(X.pointerTo(X.qualify(pointer.to, X.cvOf(placeholder.to))), placeholder.cv || 0);
        }
        }
        if (unqual(placeholder) === X.AUTO) {
            var decayed = X.decay(valueTypeOf);
            if (decayed.kind === 'nullptr' || true)
                return X.qualify(decayed, placeholder.cv || 0);
        }
        this.error(node, "unable to deduce '" + X.typeString(placeholder) + "'");
    };
})(globalThis);
