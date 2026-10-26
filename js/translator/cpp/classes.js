// C++: classes (continues check.js). A completed class has its layout as
// the Itanium ABI gives it for single and multiple non-virtual inheritance:
// the primary (first polymorphic) base at 0, the vtable pointer at 0 of
// every polymorphic class, empty bases folded into offset 0, then fields.
// Virtual functions: every virtual function is identified by its root (the
// function that introduced it); a class maps roots to final overriders,
// and a vtable lists the overriders of the roots of one polymorphic
// subobject. Special members the class does not declare are declared on
// demand (declareImplicitMembers) and defined by codegen.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'completeClass'))
        return;

    var types = X.types;
    var unqual = X.unqual;

    // --- Completion

    Parser.prototype.completeClass = function (cls) {
        this.virtualFunctions(cls);
        this.layoutClass(cls);
        cls.complete = true;
        // A class with a pure virtual final overrider is abstract.
        cls.abstract = false;
        cls.overriders.forEach(function (func) {
            if (func.isPure)
                cls.abstract = true;
        });
        cls.dataMembers.forEach(function (field) {
            if (field.name !== null && field.initTokens === null && X.isRef(field.type))
                cls.hasRefMember = true;
        });
    };

    function sameSignature(left, right) {
        if (left.name !== right.name && !(left.isDtor && right.isDtor))
            return false;
        if (left.isDtor && right.isDtor)
            return true;
        return X.sameParams(left.type, right.type);
    }

    // Virtual functions, their roots and the final overriders of the class.
    Parser.prototype.virtualFunctions = function (cls) {
        var overriders = new Map();
        cls.bases.forEach(function (base) {
            base.type.overriders.forEach(function (func, root) {
                overriders.set(root, func);
            });
        });
        var methods = [];
        Object.keys(cls.members).forEach(function (name) {
            var entity = cls.members[name];
            if (entity.kind === 'functions')
                entity.items.forEach(function (item) {
                    if (item.kind === 'func' && item.owner === cls && item.isMember && !item.isCtor)
                        methods.push(item);
                });
        });
        if (cls.dtor !== null)
            methods.push(cls.dtor);
        var primary = null;
        cls.bases.forEach(function (base) {
            if (primary === null && base.type.polymorphic)
                primary = base;
        });
        cls.primaryBase = primary;
        var slots = primary !== null ? primary.type.slots.slice() : [];
        var self = this;
        methods.forEach(function (method) {
            var roots = [];
            overriders.forEach(function (func, root) {
                if (sameSignature(root, method))
                    roots.push(root);
            });
            if (roots.length > 0) {
                method.isVirtual = true;
                roots.forEach(function (root) {
                    var previous = overriders.get(root);
                    if (previous.final)
                        self.error(method.lazy ? { line: 0 } : null, "virtual function '" +
                                   X.functionSignature(method) +
                                   "' overriding final function");
                    if (!method.isDtor &&
                        X.unqual(X.removeRef(previous.type.returns)) !== X.unqual(X.removeRef(method.type.returns)) &&
                        !covariant(previous.type.returns, method.type.returns))
                        self.error(null, "conflicting return type specified for '" + X.typeString(method.type.returns) +
                                   ' ' +
                                   X.functionSignature(method) + "'");
                    overriders.set(root, method);
                });
                method.root = roots[0];
                if (slots.indexOf(roots[0]) < 0)
                    slots.push(roots[0]);
                return;
            }
            if (method.override)
                self.error(null, "'" + X.typeString(method.type.returns) + ' ' + X.functionSignature(method) +
                           "' marked 'override', but does not override");
            if (method.isVirtual) {
                method.root = method;
                overriders.set(method, method);
                slots.push(method);
            }
        });
        cls.overriders = overriders;
        cls.slots = slots;
        cls.polymorphic = slots.length > 0 || cls.bases.some(function (base) { return base.type.polymorphic; });
    };

    function covariant(base, derived) {
        var a = unqual(X.removeRef(base)), b = unqual(X.removeRef(derived));
        if (a.kind === 'pointer' && b.kind === 'pointer') {
            a = unqual(a.to);
            b = unqual(b.to);
        }
        return a.isClass && b.isClass && X.isBaseOf(a, b);
    }

    // An empty class: no fields, nothing virtual, empty bases.
    function isEmpty(cls) {
        return cls.dataMembers.every(function (field) { return field.bits === 0; }) && !cls.polymorphic &&
            cls.bases.every(function (base) { return isEmpty(base.type); });
    }
    X.isEmptyClass = isEmpty;

    Parser.prototype.layoutClass = function (cls) {
        var offset = 0, align = 1;
        var fields = [];
        var ordered = cls.bases.slice();
        if (cls.primaryBase !== null) {
            ordered.splice(ordered.indexOf(cls.primaryBase), 1);
            ordered.unshift(cls.primaryBase);
        }
        if (cls.polymorphic && cls.primaryBase === null) {
            fields.push({ name: null, type: X.pointerTo(types.void), offset: 0, bits: null, vptr: true });
            offset = 8;
            align = 8;
        }
        var emptyAtZero = [];
        ordered.forEach(function (base) {
            var type = base.type;
            if (isEmpty(type) && emptyAtZero.indexOf(type) < 0 && (offset === 0 || base !== cls.primaryBase)) {
                base.offset = 0;
                emptyAtZero.push(type);
                return;
            }
            offset = Math.ceil(offset / type.align) * type.align;
            base.offset = offset;
            fields.push({ name: null, type: type, offset: offset, bits: null, base: true });
            // The tail padding of a base that is not a POD holds the next
            // members (the Itanium ABI).
            offset += isPodForLayout(type) ? type.size : type.dsize;
            align = Math.max(align, type.align);
        });
        var bitUnit = null;
        var union = cls.kind === 'union';
        var size = offset;
        cls.dataMembers.forEach(function (field) {
            var type = X.isRef(field.type) ? X.pointerTo(types.void) : unqual(field.type);
            if (field.bits !== null) {
                var unitSize = type.size;
                if (field.bits === 0) {
                    bitUnit = null;
                    offset = Math.ceil(offset / unitSize) * unitSize;
                    return;
                }
                if (union) {
                    field.offset = 0;
                    field.bitOffset = 0;
                    size = Math.max(size, unitSize);
                } else if (bitUnit !== null && bitUnit.size === unitSize && bitUnit.used + field.bits <= unitSize * 8) {
                    field.offset = bitUnit.offset;
                    field.bitOffset = bitUnit.used;
                    bitUnit.used += field.bits;
                } else {
                    offset = Math.ceil(offset / type.align) * type.align;
                    bitUnit = { offset: offset, size: unitSize, used: field.bits };
                    field.offset = offset;
                    field.bitOffset = 0;
                    offset += unitSize;
                }
                align = Math.max(align, type.align);
                fields.push({ name: field.name, type: type, offset: field.offset, bitOffset: field.bitOffset,
                              bits: field.bits, field: field });
                return;
            }
            bitUnit = null;
            if (union) {
                field.offset = 0;
                size = Math.max(size, type.size);
            } else {
                // An empty member still takes a byte.
                offset = Math.ceil(offset / Math.max(type.align, 1)) * Math.max(type.align, 1);
                field.offset = offset;
                offset += Math.max(type.size, isEmptyType(type) ? 1 : 0);
            }
            align = Math.max(align, type.align);
            fields.push({ name: field.name, type: type, offset: field.offset, bits: null, field: field,
                          anonymous: field.anonymous });
        });
        if (!union)
            size = offset;
        cls.dsize = Math.max(size, 1);
        size = Math.ceil(size / align) * align;
        if (size === 0)
            size = 1;
        cls.fields = fields;
        cls.size = size;
        cls.align = align;
        // Members of anonymous unions sit at the offset of the union.
        cls.dataMembers.forEach(function (field) {
            if (field.anonymous)
                field.type.dataMembers.forEach(function (inner) {
                    var alias = cls.members[inner.name];
                    if (alias !== undefined && alias.viaAnonymous === field)
                        alias.offset = field.offset + inner.offset;
                });
        });
    };

    // A POD in the sense of C++03, which the layout of bases depends on.
    function isPodForLayout(cls) {
        if (cls.podForLayout !== undefined)
            return cls.podForLayout;
        var userSpecial = cls.ctors.some(function (ctor) { return !ctor.implicit; }) || cls.ctorTemplates.length > 0 ||
            (cls.dtor !== null && !cls.dtor.implicit) || (cls.members['operator='] !== undefined &&
                                                          cls.members['operator='].kind === 'functions' &&
                                                          cls.members['operator='].items.some(function (item) {
                                                              return item.kind === 'func' && !item.implicit;
                                                          }));
        var result = cls.bases.length === 0 && !cls.polymorphic && !userSpecial &&
            cls.dataMembers.every(function (field) {
            if (field.access !== 'public' || X.isRef(field.type))
                return false;
            var type = unqual(field.type);
            while (type.kind === 'array')
                type = unqual(type.of);
            return !type.isClass || isPodForLayout(type);
        });
        cls.podForLayout = result;
        return result;
    }

    function isEmptyType(type) {
        return type.isClass === true && isEmpty(type);
    }

    // The polymorphic subobjects of a class with their offsets: the vtables
    // the class needs ({ offset, cls } - cls gives the slots).
    X.vtableLayout = function (cls) {
        if (cls.vtableLayout !== undefined)
            return cls.vtableLayout;
        var result = [];
        (function walk(current, offset) {
            if (!current.polymorphic)
                return;
            var known = result.some(function (item) { return item.offset === offset; });
            if (!known)
                result.push({ offset: offset, cls: current });
            current.bases.forEach(function (base) { walk(base.type, offset + base.offset); });
        })(cls, 0);
        cls.vtableLayout = result;
        return result;
    };

    // --- Special members

    function implicitMember(cls, name, type, kind) {
        var func = new X.Function(name, type, cls);
        func.implicit = true;
        func.isMember = true;
        func.defined = true;
        func.library = cls.library;
        func.implicitKind = kind;
        func.access = 'public';
        func.params = type.params.map(function (param) {
            return { name: null, type: param, defaultArg: null, defaultTokens: null };
        });
        return func;
    }

    Parser.prototype.findCopyCtor = function (cls) {
        this.declareImplicitMembers(cls);
        var found = null;
        cls.ctors.forEach(function (ctor) {
            if (isCopyCtor(cls, ctor))
                found = ctor;
        });
        return found;
    };

    function isCopyCtor(cls, ctor) {
        var params = ctor.type.params;
        if (params.length < 1 || params[0].kind !== 'lref' || unqual(params[0].to) !== cls)
            return false;
        for (var index = 1; index < ctor.params.length; ++index) {
            if (ctor.params[index].defaultArg === null && ctor.params[index].defaultTokens === null)
                return false;
        }
        return true;
    }

    function isMoveCtor(cls, ctor) {
        var params = ctor.type.params;
        return params.length >= 1 && params[0].kind === 'rref' && unqual(params[0].to) === cls &&
            ctor.params.slice(1).every(function (param) { return param.defaultArg !== null ||
                                                          param.defaultTokens !== null; });
    }

    function assignments(cls) {
        var set = cls.members['operator='];
        return set !== undefined && set.kind === 'functions' ? set.items.filter(function (item) {
            return item.kind === 'func' && item.owner === cls;
        }) : [];
    }

    function isCopyAssign(cls, func) {
        var params = func.type.params;
        return params.length === 1 && (unqual(params[0]) === cls || (params[0].kind === 'lref' &&
                                                                     unqual(params[0].to) === cls));
    }

    function isMoveAssign(cls, func) {
        var params = func.type.params;
        return params.length === 1 && params[0].kind === 'rref' && unqual(params[0].to) === cls;
    }

    // Declares the default constructor, copy and move constructors and
    // assignments and the destructor that the class does not declare.
    Parser.prototype.declareImplicitMembers = function (cls) {
        if (cls.implicitDeclared || !cls.complete)
            return;
        cls.implicitDeclared = true;
        var userCtors = cls.ctors.filter(function (ctor) { return !ctor.implicit; });
        var hasCopyCtor = userCtors.some(function (ctor) { return isCopyCtor(cls, ctor); });
        var hasMoveCtor = userCtors.some(function (ctor) { return isMoveCtor(cls, ctor); });
        var userAssign = assignments(cls);
        var hasCopyAssign = userAssign.some(function (func) { return isCopyAssign(cls, func); });
        var hasMoveAssign = userAssign.some(function (func) { return isMoveAssign(cls, func); });
        var hasDtor = cls.dtor !== null && !cls.dtor.implicit;
        var constRef = X.lref(X.qualify(cls, X.CONST));
        if (userCtors.length === 0 && cls.ctorTemplates.length === 0 && !cls.inheritedCtors) {
            var defaultCtor = implicitMember(cls, cls.name, X.functionType(types.void, [], false), 'default');
            defaultCtor.isCtor = true;
            cls.ctors.push(defaultCtor);
        }
        if (!hasCopyCtor) {
            var copyCtor = implicitMember(cls, cls.name, X.functionType(types.void, [constRef], false), 'copy');
            copyCtor.isCtor = true;
            if (hasMoveCtor || hasMoveAssign)
                copyCtor.deleted = true;
            cls.ctors.push(copyCtor);
        }
        if (!hasCopyCtor && !hasMoveCtor && !hasCopyAssign && !hasMoveAssign && !hasDtor) {
            var moveCtor = implicitMember(cls, cls.name, X.functionType(types.void, [X.rref(cls)], false), 'move');
            moveCtor.isCtor = true;
            cls.ctors.push(moveCtor);
        }
        var assignResult = X.lref(cls);
        if (!hasCopyAssign) {
            var copyAssign = implicitMember(cls, 'operator=', X.functionType(assignResult, [constRef], false),
                                            'copyassign');
            if (hasMoveCtor || hasMoveAssign)
                copyAssign.deleted = true;
            this.addMember(cls, 'operator=', copyAssign);
        }
        if (!hasCopyCtor && !hasMoveCtor && !hasCopyAssign && !hasMoveAssign && !hasDtor) {
            var moveAssign = implicitMember(cls, 'operator=', X.functionType(assignResult, [X.rref(cls)], false),
                                            'moveassign');
            this.addMember(cls, 'operator=', moveAssign);
        }
        if (cls.dtor === null) {
            var dtor = implicitMember(cls, '~' + cls.name, X.functionType(types.void, [], false), 'dtor');
            dtor.isDtor = true;
            cls.dtor = dtor;
            // A destructor that overrides a virtual one is virtual.
            cls.bases.forEach(function (base) {
                if (base.type.dtor !== null && base.type.dtor.isVirtual) {
                    dtor.isVirtual = true;
                    dtor.root = base.type.dtor.root || base.type.dtor;
                }
            });
            if (dtor.isVirtual) {
                cls.overriders.forEach(function (func, root) {
                    if (root.isDtor)
                        cls.overriders.set(root, dtor);
                });
            }
        }
        // Defaulted user declarations behave as implicit ones.
        cls.ctors.concat(assignments(cls), cls.dtor !== null ? [cls.dtor] : []).forEach(function (func) {
            if (func.defaulted && !func.implicit) {
                func.implicit = true;
                func.defined = true;
                if (func.isDtor)
                    func.implicitKind = 'dtor';
                else if (func.isCtor)
                    func.implicitKind = func.type.params.length === 0 ? 'default'
                                                                      : (isMoveCtor(cls, func) ? 'move' : 'copy');
                else
                    func.implicitKind = isMoveAssign(cls, func) ? 'moveassign' : 'copyassign';
            }
        });
        this.decideTrivial(cls);
        this.decideDeleted(cls);
    };

    Parser.prototype.addMember = function (cls, name, func) {
        var set = cls.members[name];
        if (set === undefined || set.kind !== 'functions') {
            set = { kind: 'functions', name: name, items: [] };
            cls.members[name] = set;
        } else if (set.items.some(function (item) { return item.owner !== cls; })) {
            set = { kind: 'functions', name: name,
                    items: set.items.filter(function (item) { return item.owner === cls; }) };
            cls.members[name] = set;
        }
        set.items.push(func);
    };

    // The parts whose special members decide those of the class.
    // The classes of the bases and the members; uninitialized: without the
    // members that have a default member initializer (a default constructor
    // does not construct them by default).
    function subobjectTypes(cls, uninitialized) {
        var list = cls.bases.map(function (base) { return base.type; });
        cls.dataMembers.forEach(function (field) {
            if (field.anonymous || (uninitialized && field.initTokens !== null && field.initTokens !== undefined))
                return;
            var type = unqual(field.type);
            while (type.kind === 'array')
                type = unqual(type.of);
            if (type.isClass)
                list.push(type);
        });
        return list;
    }

    // Whether T(std::move(t)) cannot throw: the selected constructor is
    // noexcept, an implicit one when the constructors of the parts are.
    Parser.prototype.isNothrowMoveConstructible = function (type) {
        var plain = unqual(type);
        while (plain.kind === 'array')
            plain = unqual(plain.of);
        if (!plain.isClass)
            return true;
        if (plain.nothrowMove !== undefined)
            return plain.nothrowMove;
        plain.nothrowMove = true;
        var probe = { k: 'probe', type: plain, cat: 'xvalue', line: 0, file: '' };
        var resolution = this.resolveOverload(this.classCtors(plain), [probe], probe, { ctorOf: plain, silent: true });
        var result = false;
        if (resolution !== null && resolution.best !== null && !resolution.best.deleted) {
            var ctor = resolution.best;
            var self = this;
            if (ctor.implicit)
                result = subobjectTypes(plain).every(function (part) { return self.isNothrowMoveConstructible(part); });
            else
                result = ctor.type.noexcept;
        }
        plain.nothrowMove = result;
        return result;
    };

    Parser.prototype.decideTrivial = function (cls) {
        var self = this;
        var parts = subobjectTypes(cls);
        parts.forEach(function (part) { self.declareImplicitMembers(part); });
        var noVirtual = !cls.polymorphic;
        cls.ctors.forEach(function (ctor) {
            if (!ctor.implicit)
                return;
            if (ctor.implicitKind === 'default')
                ctor.trivial = noVirtual && cls.dataMembers.every(function (field) {
                    return field.initTokens === null || field.initTokens === undefined;
                }) && parts.every(function (part) { return self.isTriviallyDefaultConstructible(part); });
            else
                ctor.trivial = noVirtual && parts.every(function (part) { return self.isTriviallyCopyable(part); });
        });
        assignments(cls).forEach(function (func) {
            if (func.implicit)
                func.trivial = noVirtual && parts.every(function (part) { return self.isTriviallyCopyable(part); });
        });
        if (cls.dtor !== null && cls.dtor.implicit)
            cls.dtor.trivial = !cls.dtor.isVirtual &&
                parts.every(function (part) { return self.isTriviallyDestructible(part); });
    };

    // Implicit members that cannot be defined are deleted.
    Parser.prototype.decideDeleted = function (cls) {
        var self = this;
        var parts = subobjectTypes(cls);
        cls.ctors.forEach(function (ctor) {
            if (!ctor.implicit || ctor.deleted)
                return;
            if (ctor.implicitKind === 'default') {
                var bad = cls.dataMembers.some(function (field) {
                    if (field.initTokens !== null && field.initTokens !== undefined)
                        return false;
                    if (X.isRef(field.type))
                        return true;
                    var plain = unqual(field.type);
                    if (X.isConst(field.type) && !plain.isClass)
                        return true;
                    return false;
                }) || subobjectTypes(cls, true).some(function (part) {
                    var found = self.defaultCtor(part);
                    return found === null || found.deleted;
                });
                if (bad)
                    ctor.deleted = true;
            } else if (ctor.implicitKind === 'copy') {
                if (parts.some(function (part) {
                    var copy = self.findCopyCtor(part);
                    return copy === null || copy.deleted;
                }))
                    ctor.deleted = true;
            } else if (ctor.implicitKind === 'move') {
                // A member that cannot move makes the move use copy: the
                // implicit move constructor is not declared then.
                if (parts.some(function (part) {
                    var move = self.findMoveCtor(part);
                    var copy = self.findCopyCtor(part);
                    return (move === null || move.deleted) && (copy === null || copy.deleted);
                }))
                    ctor.deleted = true;
            }
        });
        assignments(cls).forEach(function (func) {
            if (!func.implicit || func.deleted)
                return;
            if (cls.dataMembers.some(function (field) { return X.isRef(field.type) || (X.isConst(field.type) &&
                                                                                      !unqual(field.type).isClass); }))
                func.deleted = true;
            if (parts.some(function (part) {
                return assignments(part).some(function (item) { return item.deleted && isCopyAssign(part, item); }) &&
                    !assignments(part).some(function (item) { return !item.deleted; });
            }))
                func.deleted = true;
        });
    };

    Parser.prototype.findMoveCtor = function (cls) {
        this.declareImplicitMembers(cls);
        var found = null;
        cls.ctors.forEach(function (ctor) {
            if (isMoveCtor(cls, ctor))
                found = ctor;
        });
        return found;
    };

    Parser.prototype.defaultCtor = function (cls) {
        this.declareImplicitMembers(cls);
        var found = null;
        var self = this;
        cls.ctors.forEach(function (ctor) {
            if (ctor.params.every(function (param) { return self.hasDefault(param); }) && !ctor.type.variadic)
                found = found === null ? ctor : found;
        });
        if (found === null && cls.inheritedCtors) {
            var base = this.defaultCtor(cls.inheritedCtors);
            if (base !== null)
                return base;
        }
        return found;
    };

    Parser.prototype.isTriviallyDefaultConstructible = function (cls) {
        cls = unqual(cls);
        while (cls.kind === 'array')
            cls = unqual(cls.of);
        if (!cls.isClass)
            return true;
        this.declareImplicitMembers(cls);
        var ctor = this.defaultCtor(cls);
        return ctor !== null && ctor.implicit === true && ctor.trivial === true;
    };

    Parser.prototype.isTriviallyCopyable = function (cls) {
        cls = unqual(cls);
        while (cls.kind === 'array')
            cls = unqual(cls.of);
        if (!cls.isClass)
            return true;
        this.declareImplicitMembers(cls);
        var copy = this.findCopyCtor(cls);
        var move = this.findMoveCtor(cls);
        return (copy === null || (copy.implicit && copy.trivial)) && (move === null ||
                                                                      (move.implicit && move.trivial)) &&
            this.isTriviallyDestructible(cls) && assignments(cls).every(function (func) {
                return func.implicit && func.trivial || func.deleted;
            });
    };

    Parser.prototype.isTriviallyDestructible = function (type) {
        type = unqual(type);
        while (type.kind === 'array')
            type = unqual(type.of);
        if (!type.isClass)
            return true;
        this.declareImplicitMembers(type);
        return type.dtor === null || (type.dtor.implicit && type.dtor.trivial === true);
    };

    // The destructor to call for an object of a type, or null (trivial).
    Parser.prototype.destructorOf = function (type) {
        type = unqual(type);
        if (!type.isClass)
            return null;
        this.declareImplicitMembers(type);
        if (this.isTriviallyDestructible(type))
            return null;
        var dtor = type.dtor;
        this.useFunction(dtor, null);
        return dtor;
    };

    // --- Inherited constructors

    Parser.prototype.inheritedConstructors = function (cls) {
        if (cls.inheritedList !== undefined)
            return cls.inheritedList;
        var base = cls.inheritedCtors;
        this.declareImplicitMembers(base);
        var list = [];
        base.ctors.forEach(function (ctor) {
            if (ctor.implicit && (ctor.implicitKind === 'copy' || ctor.implicitKind === 'move' ||
                                  ctor.implicitKind === 'default'))
                return;
            if (isCopyCtor(base, ctor) || isMoveCtor(base, ctor))
                return;
            var func = new X.Function(cls.name, ctor.type, cls);
            func.isCtor = true;
            func.isMember = true;
            func.params = ctor.params;
            func.inheritedFrom = ctor;
            func.defined = true;
            func.library = cls.library;
            func.explicit = ctor.explicit;
            func.access = ctor.access;
            func.deleted = ctor.deleted;
            list.push(func);
        });
        cls.inheritedList = list;
        return list;
    };

    // --- Default member initializers

    // int x = 5; in a class: checked once in the scope of the class, with
    // this (the constructor that uses it).
    Parser.prototype.memberDefaultInit = function (cls, field, node) {
        if (field.defaultIr !== undefined)
            return field.defaultIr;
        if (field.parsingDefault)
            this.error(node, "default member initializer for '" + field.name + "' required before the end of its " +
                       'enclosing class');
        field.parsingDefault = true;
        var self = this;
        var value = this.session.withParser(field.initTokens, cls, this, function (parser) {
            var context = new X.FunctionContext(self.session, null, null);
            context.thisClass = cls;
            context.defaultInit = true;
            parser.func = context;
            var init = parser.initializerSyntax();
            var result = parser.initializeVariable({ name: field.name, type: field.type, storage: 'member' }, init,
                                                   node);
            field.defaultContext = context;
            return result;
        });
        field.parsingDefault = false;
        field.defaultIr = value;
        return value;
    };

    // --- Static members

    X.layoutOf = C.layoutRecord;
})(globalThis);
