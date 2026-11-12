// Kotlin: expressions - literals, names (locals, members of implicit
// receivers, top-level declarations, objects, statics), members, safe
// calls, operators by convention and intrinsics of the primitive types,
// if, when and try as expressions, casts and smart casts, jumps.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    var Checker = Kt.Checker;
    if (Checker.prototype.expr)
        return;

    var big = T.big;

    // --- The entry points

    // The type of an expression; expected - a type or null. The node keeps
    // the type (node.type) and what the translation needs.
    Checker.prototype.expr = function (node, expected, scope) {
        var type = this.exprInner(node, expected || null, scope);
        node.type = type;
        return type;
    };

    // An expression that must fit the expected type.
    Checker.prototype.exprAs = function (node, expected, scope, what) {
        var type = this.expr(node, expected, scope);
        if (expected === null || expected === undefined)
            return type;
        if (Kt.isClass(expected, 'Unit') && what === 'lambda')
            return type;
        if (!this.fits(node, type, expected)) {
            var sam = Kt.samType(expected);
            if (sam !== null && Kt.resolved(type).kind === 'fun' && Kt.isSubtype(type, sam.type)) {
                node.samConversion = sam;
                return type;
            }
            this.mismatch(node, expected, type, what);
        }
        return type;
    };

    // A value fits a type (integer literals fit the narrower types).
    Checker.prototype.fits = function (node, type, expected) {
        if (Kt.isSubtype(type, expected))
            return true;
        var literal = this.literalValue(node);
        if (literal !== null) {
            var target = Kt.makeNotNull(Kt.resolved(expected));
            if (target.kind === 'class' && Kt.literalFits(literal, Kt.primKind(target)))
                return true;
        }
        return false;
    };

    Checker.prototype.exprInner = function (node, expected, scope) {
        switch (node.k) {
        case 'int':
            return this.intLiteral(node, expected);
        case 'float':
            if (expected !== null && Kt.primKind(Kt.makeNotNull(expected)) === 'f32' && !node.single)
                this.error(node, 'the floating-point literal does not conform to the expected type Float.');
            return Kt.builtinType(node.single ? 'Float' : 'Double');
        case 'char':
            return Kt.builtinType('Char');
        case 'bool':
            return Kt.booleanType();
        case 'null':
            return Kt.NULL_TYPE;
        case 'string':
            return this.stringTemplate(node, scope);
        case 'name':
            return this.nameExpr(node, expected, scope);
        case 'this':
            return this.thisExpr(node, scope);
        case 'super':
            this.error(node, 'super is not an expression, it can only be used on the left-hand side of a dot (\'.\').');
            break;
        case 'paren': {
            var inner = this.expr(node.expr, expected, scope);
            node.smartKey = node.expr.smartKey;
            return inner;
        }
        case 'member':
            return this.memberExpr(node, expected, scope);
        case 'call':
            return this.callExpr(node, expected, scope);
        case 'index':
            return this.indexExpr(node, scope);
        case 'binary':
            return this.binaryExpr(node, expected, scope);
        case 'infix':
            return this.infixExpr(node, expected, scope);
        case 'prefix':
            return this.prefixExpr(node, expected, scope);
        case 'postfix':
            return this.postfixExpr(node, scope);
        case 'is':
            this.isExpr(node, scope);
            return Kt.booleanType();
        case 'as':
            return this.asExpr(node, scope);
        case 'if':
            return this.ifExpr(node, expected, scope, true);
        case 'when':
            return this.whenExpr(node, expected, scope, true);
        case 'try':
            return this.tryExpr(node, expected, scope);
        case 'jump':
            return this.jumpExpr(node, scope);
        case 'lambda':
        case 'anonfun':
            return this.functionLiteral(node, expected, scope, { inline: false });
        case 'ref':
            return this.referenceExpr(node, expected, scope);
        case 'objectexpr':
            return this.objectExpression(node, scope);
        case 'collection':
            this.error(node, 'collection literals are only allowed in annotations.');
            break;
        case 'assign':
            this.error(node, 'assignments are not expressions, and only expressions are allowed in this context.');
            break;
        case 'delegateArg':
            // A value the translator passes (thisRef of getValue, the element of a destructuring).
            return node.type;
        case 'property':
        case 'fun':
        case 'class':
        case 'for':
        case 'while':
        case 'dowhile':
        case 'typealias':
            this.error(node, 'expecting an expression.');
            break;
        }
        this.error(node, 'unsupported expression: ' + node.k);
    };

    // --- Literals

    Checker.prototype.integerValue = function (node) {
        if (node.value === undefined) {
            var digits = node.digits;
            var radix = node.radix;
            var value;
            if (radix === 10)
                value = big.parse(digits, 10);
            else
                value = big.parse(digits, radix);
            node.value = value;
        }
        return node.value;
    };

    Checker.prototype.intLiteral = function (node, expected) {
        var value = this.integerValue(node);
        var range = Kt.integerLimits();
        if (node.suffix === 'L') {
            if (big.cmp(value, range.i64[1]) > 0)
                this.error(node, 'value out of range.');
            return Kt.builtinType('Long');
        }
        if (node.suffix === 'u' || node.suffix === 'uL') {
            var target = expected !== null ? Kt.primKind(Kt.makeNotNull(expected)) : null;
            if (node.suffix === 'uL' || target === 'u64' || big.cmp(value, big.parse('4294967295', 10)) > 0)
                return Kt.builtinType('ULong');
            if (target === 'u8')
                return Kt.builtinType('UByte');
            if (target === 'u16')
                return Kt.builtinType('UShort');
            return Kt.builtinType('UInt');
        }
        if (big.cmp(value, range.i64[1]) > 0)
            this.error(node, 'value out of range.');
        var kind = expected !== null ? Kt.primKind(Kt.makeNotNull(expected)) : null;
        if (kind === 'i64' || kind === 'i16' || kind === 'i8') {
            if (!Kt.literalFits(value, kind))
                this.error(node, 'the integer literal does not conform to the expected type ' + Kt.typeString(Kt.makeNotNull(expected)) + '.');
            return Kt.builtinType({ i64: 'Long', i16: 'Short', i8: 'Byte' }[kind]);
        }
        if (Kt.literalFits(value, 'i32'))
            return Kt.intType();
        return Kt.builtinType('Long');
    };

    Checker.prototype.stringTemplate = function (node, scope) {
        var self = this;
        node.parts.forEach(function (part) {
            if (part.kind === 'expr')
                self.expr(part.expr, null, scope);
        });
        return Kt.stringType();
    };

    // --- Names

    // A simple name as a value: a local, a property (member of an implicit
    // receiver, top-level, imported), an object, a companion, an enum
    // entry in when; or a class or a package as a qualifier.
    Checker.prototype.nameExpr = function (node, expected, scope, qualifierAllowed) {
        var found = this.lookupValue(node.name, scope, node);
        if (found === null) {
            if (node.name === 'field' && this.fieldOfAccessor(scope) !== null) {
                var prop = this.fieldOfAccessor(scope);
                node.ref = { kind: 'field', prop: prop };
                return this.propertyType(prop);
            }
            this.error(node, 'unresolved reference \'' + node.name + '\'.');
        }
        node.ref = found;
        switch (found.kind) {
        case 'local': {
            var variable = found.sym;
            this.noteCapture(variable, scope);
            var fact = this.facts.get(variable);
            node.smartKey = variable;
            if (variable.type === null)
                this.error(node, 'variable \'' + variable.name + '\' must be initialized.');
            if (fact !== undefined && this.stableLocal(variable, scope)) {
                node.smartCast = fact;
                return fact;
            }
            return variable.type;
        }
        case 'prop': {
            var type = this.propertyAccessType(found, node);
            var key = this.propertyKey(found);
            if (key !== null) {
                node.smartKey = key;
                var propFact = this.facts.get(key);
                if (propFact !== undefined) {
                    node.smartCast = propFact;
                    return propFact;
                }
            }
            return type;
        }
        case 'object':
            return Kt.classType(found.sym, []);
        case 'class':
            if (!qualifierAllowed) {
                if (found.sym.companion !== null) {
                    node.ref = { kind: 'object', sym: found.sym.companion };
                    return Kt.classType(found.sym.companion, []);
                }
                this.error(node, 'classifier \'' + found.sym.name + '\' does not have a companion object, so it cannot be used as an expression.');
            }
            return Kt.ERROR;
        case 'package':
            if (!qualifierAllowed)
                this.error(node, 'unresolved reference \'' + node.name + '\'.');
            return Kt.ERROR;
        }
        void expected;
        return Kt.ERROR;
    };

    // field inside a property accessor.
    Checker.prototype.fieldOfAccessor = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.accessorOf !== undefined)
                return current.accessorOf;
        }
        return null;
    };

    // A local captured by a lambda or a local function.
    Checker.prototype.noteCapture = function (variable, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.vars !== null && current.vars.get(variable.name) === variable)
                return;
            if (current.kind === 'lambda' || current.kind === 'function')
                variable.captured = true;
        }
    };

    // A local var changed by a lambda is not stable for smart casts.
    Checker.prototype.stableLocal = function (variable, scope) {
        if (!variable.mutable)
            return true;
        if (variable.assignedInLambda)
            return false;
        // A var read in a lambda: only if it is not changed after the capture (simplified: no lambda).
        for (var current = scope; current !== null; current = current.parent) {
            if (current.vars !== null && current.vars.get(variable.name) === variable)
                return true;
            if (current.kind === 'lambda' && !current.inlineLambda)
                return false;
        }
        return true;
    };

    // The key of a stable property for smart casts (a val with a field, no custom getter, final).
    Checker.prototype.propertyKey = function (found) {
        var prop = found.sym;
        if (prop.mutable || prop.customGetter || prop.isOpen || prop.delegated || prop.library || prop.java !== null ||
            prop.isAbstract)
            return null;
        if (found.receiver !== null && found.receiver !== undefined && found.receiver.kind !== 'this' && found.receiver.kind !== 'object')
            return null;
        if (prop.smartId === undefined)
            prop.smartId = 'p' + (++propertyCounter);
        return prop.smartId + (found.receiver !== null && found.receiver !== undefined ? ':' + Kt.receiverKey(found.receiver) : '');
    };
    var propertyCounter = 0;

    // A value by name: { kind: 'local', sym } | { kind: 'prop', sym, map,
    // receiver (implicit) } | { kind: 'object', sym } | { kind: 'class',
    // sym } | { kind: 'package', path } or null.
    Checker.prototype.lookupValue = function (name, scope, node) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.vars !== null && current.vars.has(name))
                return { kind: 'local', sym: current.vars.get(name) };
            if (current.classes !== null && current.classes.has(name)) {
                var local = current.classes.get(name);
                return local.kind === 'object' ? { kind: 'object', sym: local } : { kind: 'class', sym: local };
            }
            var receivers = [];
            if (current.receiver !== null)
                receivers.push(current.receiver);
            if (current.kind === 'class' && current.companionReceiver)
                receivers.push(current.companionReceiver);
            for (var index = 0; index < receivers.length; ++index) {
                var receiver = receivers[index];
                var receiverType = this.receiverType(receiver);
                var props = this.propertiesOf(receiverType, name, scope);
                if (props.length > 0)
                    return { kind: 'prop', sym: props[0].member, map: props[0].map, receiver: receiver, receiverType: receiverType,
                             extension: props[0].member.receiver !== null };
            }
            if (current.kind === 'class' && current.cls !== null) {
                var nested = this.nestedClass(current.cls, name);
                if (nested !== null)
                    return nested.kind === 'object' ? { kind: 'object', sym: nested } : { kind: 'class', sym: nested };
                // Enum entries and statics inside the enum class itself.
                var statics = this.staticsOf(current.cls, name).filter(function (item) { return item.member.kind === 'prop'; });
                if (statics.length > 0)
                    return { kind: 'prop', sym: statics[0].member, map: new Map(), receiver: null, staticOf: current.cls };
            }
            if (current.kind === 'file')
                return this.fileValue(name, current, node);
        }
        return null;
    };

    // Properties of a type by name: members, then extension properties.
    Checker.prototype.propertiesOf = function (type, name, scope) {
        var members = this.membersOf(Kt.makeNotNull(type), name).filter(function (item) { return item.member.kind === 'prop'; });
        if (members.length > 0)
            return members;
        var self = this;
        var extensions = [];
        this.visibleExtensionProperties(name, scope).forEach(function (prop) {
            var mark = Kt.markBounds();
            var map = new Map();
            prop.typeParams.forEach(function (param) { map.set(param, Kt.inferenceVar(param)); });
            if (Kt.isSubtype(type, Kt.subst(prop.receiver, map))) {
                map.forEach(function (value, key) { map.set(key, Kt.fixVar(value)); });
                extensions.push({ member: prop, map: map });
            }
            Kt.rollbackBounds(mark);
        });
        void self;
        return extensions;
    };

    Checker.prototype.visibleExtensionProperties = function (name, scope) {
        var result = [];
        var file = null;
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind === 'class' && current.cls !== null) {
                (current.cls.members[name] || []).forEach(function (member) {
                    if (member.kind === 'prop' && member.receiver !== null)
                        result.push(member);
                });
            }
            if (current.kind === 'file')
                file = current;
        }
        if (file !== null) {
            this.fileLevels(name, file).forEach(function (level) {
                level.forEach(function (decl) {
                    var member = decl.member;
                    if (member !== undefined && member.kind === 'prop' && member.receiver !== null && result.indexOf(member) < 0)
                        result.push(member);
                });
            });
        }
        return result;
    };

    // A top-level value: a property, an object, a class, a package.
    Checker.prototype.fileValue = function (name, file, node) {
        var levels = this.fileLevels(name, file);
        for (var index = 0; index < levels.length; ++index) {
            var level = levels[index];
            for (var itemIndex = 0; itemIndex < level.length; ++itemIndex) {
                var item = level[itemIndex];
                if (item.member !== undefined && item.member.kind === 'prop' && item.member.receiver === null)
                    return { kind: 'prop', sym: item.member, map: new Map(), receiver: null, objectOf: item.objectOf || null };
                if (item.classRef !== undefined)
                    return item.classRef.kind === 'object' ? { kind: 'object', sym: item.classRef } : { kind: 'class', sym: item.classRef };
                if (item.alias !== undefined) {
                    var aliased = this.expandAlias(item.alias, { args: [] }, file);
                    if (aliased.kind === 'class')
                        return aliased.sym.kind === 'object' ? { kind: 'object', sym: aliased.sym } : { kind: 'class', sym: aliased.sym };
                }
            }
        }
        var cls = this.fileTypeName(name, file, true);
        if (cls !== null && cls.kind !== 'tparam' && cls.kind !== 'alias')
            return cls.kind === 'object' ? { kind: 'object', sym: cls } : { kind: 'class', sym: cls };
        if (this.session.isPackage(name))
            return { kind: 'package', path: [name] };
        void node;
        return null;
    };

    // The type of a property access (substituted by the receiver).
    Checker.prototype.propertyAccessType = function (found, node) {
        var prop = found.sym;
        var type = Kt.subst(this.propertyType(prop), found.map || new Map());
        void node;
        return type;
    };

    Checker.prototype.thisExpr = function (node, scope) {
        var receivers = scope.receivers();
        var receiver = null;
        if (node.label === null) {
            receiver = receivers.filter(function (item) { return item.kind !== 'object' || item.cls.kind === 'object'; })[0] || null;
        } else {
            receiver = receivers.filter(function (item) { return item.label === node.label; })[0] || null;
        }
        if (receiver === null || receiver === undefined)
            this.error(node, node.label === null ? '\'this\' is not defined in this context.' : 'unresolved label.');
        node.receiverInfo = receiver;
        node.smartKey = Kt.receiverKey(receiver);
        var fact = this.facts.get(node.smartKey);
        if (fact !== undefined) {
            node.smartCast = fact;
            return fact;
        }
        return receiver.type;
    };

    // --- Members

    // target.name (a property), Foo.name (static, enum entry, companion,
    // nested class), package.name.
    Checker.prototype.memberExpr = function (node, expected, scope) {
        var target = node.target;
        var qualifier = this.qualifier(target, scope);
        if (qualifier !== null) {
            var staticRef = this.qualifiedName(node, qualifier, scope);
            if (staticRef !== null)
                return staticRef;
        }
        var targetType = qualifier !== null && qualifier.type !== undefined ? qualifier.type : this.expr(target, null, scope);
        if (target.k === 'super')
            this.error(target, 'super is not an expression.');
        return this.propertyOnValue(node, targetType, scope);
    };

    // A qualifier: a class, an object, a package, or null for a value.
    Checker.prototype.qualifier = function (node, scope) {
        if (node.k === 'name') {
            var found = this.lookupValue(node.name, scope, node);
            if (found === null)
                return null;
            if (found.kind === 'class') {
                node.ref = found;
                node.type = Kt.ERROR;
                return { kind: 'class', sym: found.sym };
            }
            if (found.kind === 'package') {
                node.ref = found;
                node.type = Kt.ERROR;
                return { kind: 'package', path: found.path };
            }
            if (found.kind === 'object') {
                node.ref = found;
                var objectType = Kt.classType(found.sym, []);
                node.type = objectType;
                return { kind: 'object', sym: found.sym, type: objectType };
            }
            return null;
        }
        if (node.k === 'member') {
            var inner = this.qualifier(node.target, scope);
            if (inner === null)
                return null;
            if (inner.kind === 'package') {
                var path = inner.path.concat([node.name]);
                var cls = this.session.lookupClass(path.join('.'));
                if (cls !== null) {
                    node.ref = { kind: cls.kind === 'object' ? 'object' : 'class', sym: cls };
                    node.type = cls.kind === 'object' ? Kt.classType(cls, []) : Kt.ERROR;
                    return cls.kind === 'object' ? { kind: 'object', sym: cls, type: node.type } : { kind: 'class', sym: cls };
                }
                if (this.session.isPackage(path.join('.'))) {
                    node.ref = { kind: 'package', path: path };
                    node.type = Kt.ERROR;
                    return { kind: 'package', path: path };
                }
                return null;
            }
            if (inner.kind === 'class' || inner.kind === 'object') {
                var nested = this.nestedClass(inner.sym, node.name);
                if (nested !== null) {
                    node.ref = { kind: nested.kind === 'object' ? 'object' : 'class', sym: nested };
                    node.type = nested.kind === 'object' ? Kt.classType(nested, []) : Kt.ERROR;
                    return nested.kind === 'object' ? { kind: 'object', sym: nested, type: node.type } : { kind: 'class', sym: nested };
                }
            }
            return null;
        }
        return null;
    };

    // Foo.name for a class or package qualifier; null when name is a member of a value.
    Checker.prototype.qualifiedName = function (node, qualifier, scope) {
        if (qualifier.kind === 'package') {
            var path = qualifier.path.concat([node.name]);
            var cls = this.session.lookupClass(path.join('.'));
            if (cls !== null) {
                node.ref = cls.kind === 'object' ? { kind: 'object', sym: cls } : { kind: 'class', sym: cls };
                if (cls.kind === 'object')
                    return Kt.classType(cls, []);
                if (cls.companion !== null) {
                    node.ref = { kind: 'object', sym: cls.companion };
                    return Kt.classType(cls.companion, []);
                }
                this.error(node, 'classifier \'' + cls.name + '\' does not have a companion object, so it cannot be used as an expression.');
            }
            var props = this.session.packageDeclarations(path.slice(0, -1).join('.'), node.name, null).filter(function (item) {
                return item.member !== undefined && item.member.kind === 'prop';
            });
            if (props.length > 0) {
                node.ref = { kind: 'prop', sym: props[0].member, map: new Map(), receiver: null };
                return this.propertyType(props[0].member);
            }
            this.error(node, 'unresolved reference \'' + node.name + '\'.');
        }
        if (qualifier.kind === 'class') {
            var sym = qualifier.sym;
            var statics = this.staticsOf(sym, node.name).filter(function (item) { return item.member.kind === 'prop'; });
            if (statics.length > 0) {
                node.ref = { kind: 'prop', sym: statics[0].member, map: new Map(), receiver: null, staticOf: sym };
                return this.propertyType(statics[0].member);
            }
            var nested = this.nestedClass(sym, node.name);
            if (nested !== null) {
                if (nested.kind === 'object') {
                    node.ref = { kind: 'object', sym: nested };
                    return Kt.classType(nested, []);
                }
                if (nested.companion !== null) {
                    node.ref = { kind: 'object', sym: nested.companion };
                    return Kt.classType(nested.companion, []);
                }
                node.ref = { kind: 'class', sym: nested };
                return Kt.ERROR;
            }
            if (sym.companion !== null) {
                // Foo.bar - a member of the companion.
                var companionType = Kt.classType(sym.companion, []);
                node.target.ref = { kind: 'object', sym: sym.companion };
                node.target.type = companionType;
                return this.propertyOnValue(node, companionType, scope);
            }
            this.error(node, 'unresolved reference \'' + node.name + '\'.');
        }
        return null;
    };

    // value.name: a member property, an extension property.
    Checker.prototype.propertyOnValue = function (node, targetType, scope) {
        targetType = Kt.resolved(targetType);
        if (targetType.kind === 'error')
            return Kt.ERROR;
        if (targetType.kind === 'dynamic') {
            node.ref = { kind: 'dynamic' };
            return Kt.DYNAMIC;
        }
        var receiverType = node.safe ? Kt.makeNotNull(targetType) : targetType;
        var props = this.propertiesOf(receiverType, node.name, scope);
        if (props.length === 0) {
            if (this.membersOf(Kt.makeNotNull(targetType), node.name).length > 0)
                this.error({ line: node.nameLine, column: node.nameColumn }, 'function invocation \'' + node.name + '()\' expected.');
            this.error({ line: node.nameLine, column: node.nameColumn }, 'unresolved reference \'' + node.name + '\'.');
        }
        var item = props[0];
        var prop = item.member;
        if (!node.safe && Kt.isNullable(targetType) && !targetType.flexible && (prop.receiver === null || !Kt.isNullable(prop.receiver)))
            this.error({ line: node.opLine || node.nameLine, column: node.nameColumn - 1 }, 'only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type \'' +
                       Kt.typeString(targetType) + '\'.');
        node.ref = { kind: 'prop', sym: prop, map: item.map, receiver: null, explicit: true, extension: prop.receiver !== null,
                     receiverType: receiverType };
        var type = Kt.subst(this.propertyType(prop), item.map);
        if (prop.java !== null && prop.java !== undefined)
            type = flexibleOf(type);
        var key = this.memberKey(node, prop);
        if (key !== null) {
            node.smartKey = key;
            var fact = this.facts.get(key);
            if (fact !== undefined) {
                node.smartCast = fact;
                type = fact;
            }
        }
        if (node.safe)
            type = Kt.makeNullable(type);
        return type;
    };

    function flexibleOf(type) {
        return type;
    }

    // A stable member of a stable value: a.b where a is a local val.
    Checker.prototype.memberKey = function (node, prop) {
        if (prop.mutable || prop.customGetter || prop.isOpen || prop.delegated || prop.library || prop.isAbstract)
            return null;
        var targetKey = node.target.smartKey;
        if (targetKey === undefined || targetKey === null)
            return null;
        if (typeof targetKey === 'object' && targetKey.mutable)
            return null;
        if (prop.smartId === undefined)
            prop.smartId = 'p' + (++propertyCounter);
        return (typeof targetKey === 'object' ? 'v' + (targetKey.id || (targetKey.id = ++propertyCounter)) : targetKey) + '.' + prop.smartId;
    };

    // --- Calls

    Checker.prototype.callExpr = function (node, expected, scope) {
        var callee = node.callee;
        var typeArgs = node.typeArgs === null || node.typeArgs === undefined ? null : this.typeArguments(node.typeArgs, scope);
        var actuals = this.actuals(node);
        var call = { node: node, actuals: actuals, typeArgs: typeArgs, scope: scope, expected: expected, endLine: node.endLine,
                     argsNode: { line: node.argsLine, column: node.argsColumn } };
        if (callee.k === 'name') {
            call.name = callee.name;
            call.nameNode = callee;
            if (callee.typeArgs !== undefined && typeArgs === null)
                call.typeArgs = this.typeArguments(callee.typeArgs, scope);
            var result = this.resolveCall(call);
            return this.finishCall(node, result, null, scope);
        }
        if (callee.k === 'member') {
            call.name = callee.name;
            call.nameNode = { line: callee.nameLine, column: callee.nameColumn };
            if (callee.target.k === 'super')
                return this.superCall(node, call, scope);
            var qualifier = this.qualifier(callee.target, scope);
            if (qualifier !== null && qualifier.kind === 'package') {
                var path = qualifier.path.join('.');
                call.receiverType = null;
                var levels = [];
                var cls = this.session.lookupClass(path + '.' + callee.name);
                if (cls !== null)
                    levels.push([{ classRef: cls }]);
                var decls = this.session.packageDeclarations(path, callee.name, null);
                if (decls.length > 0)
                    levels.push(decls);
                var packageResult = this.resolveWithLevels(call, levels);
                return this.finishCall(node, packageResult, null, scope);
            }
            if (qualifier !== null && qualifier.kind === 'class') {
                call.staticOf = qualifier.sym;
                call.receiverType = null;
                if (qualifier.sym.companion !== null) {
                    // Foo.bar(): statics first, then the companion.
                    var staticLevels = this.explicitLevels(call);
                    var companionType = Kt.classType(qualifier.sym.companion, []);
                    var companionCall = Object.assign({}, call, { staticOf: null, receiverType: companionType });
                    var companionLevels = this.explicitLevels(companionCall).map(function (level) {
                        return level.map(function (item) { return Object.assign({}, item, { companionOf: qualifier.sym }); });
                    });
                    call.receiverType = null;
                    var all = staticLevels.concat(companionLevels);
                    var companionResult = this.resolveWithLevels(Object.assign(call, { receiverType: companionType, staticOrCompanion: true }), all);
                    if (companionResult.staticOf === null && companionResult.fn.owner !== qualifier.sym) {
                        callee.target.ref = { kind: 'object', sym: qualifier.sym.companion };
                        callee.target.type = companionType;
                        return this.finishCall(node, companionResult, callee.target, scope);
                    }
                    return this.finishCall(node, companionResult, null, scope);
                }
                var staticResult = this.resolveCall(call);
                return this.finishCall(node, staticResult, null, scope);
            }
            var receiverType = qualifier !== null && qualifier.type !== undefined ? qualifier.type : this.expr(callee.target, null, scope);
            receiverType = Kt.resolved(receiverType);
            if (receiverType.kind === 'dynamic') {
                this.dynamicArguments(actuals, scope);
                node.dynamicCall = true;
                return Kt.DYNAMIC;
            }
            call.receiverType = callee.safe ? Kt.makeNotNull(receiverType) : receiverType;
            call.safe = callee.safe;
            call.receiverNode = callee.target;
            var memberResult = this.resolveCall(call);
            if (!callee.safe && Kt.isNullable(receiverType) && !receiverType.flexible && receiverType.kind !== 'error' &&
                !(memberResult.fn.receiver !== null && Kt.isNullable(Kt.subst(memberResult.fn.receiver, memberResult.map))) &&
                memberResult.invokeOn === null)
                this.error(call.nameNode, 'only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type \'' +
                           Kt.typeString(receiverType) + '\'.');
            var type = this.finishCall(node, memberResult, callee.target, scope);
            return callee.safe ? Kt.makeNullable(type) : type;
        }
        // An expression called: invoke.
        var valueType = this.expr(callee, null, scope);
        if (Kt.resolved(valueType).kind === 'dynamic') {
            this.dynamicArguments(actuals, scope);
            node.dynamicCall = true;
            return Kt.DYNAMIC;
        }
        call.name = 'invoke';
        call.receiverType = valueType;
        call.receiverNode = callee;
        call.invokeValue = true;
        var candidates = this.invokeCandidates(valueType, call);
        if (candidates.length === 0)
            this.error(node, 'expression \'' + this.exprText(callee) + '\' of type \'' + Kt.typeString(valueType) + '\' cannot be invoked as a function.');
        var levels2 = [candidates.map(function (candidate) {
            return { member: candidate.fn, map: candidate.map, explicit: true, fnType: candidate.fnType };
        })];
        var invokeResult = this.resolveWithLevels(call, levels2);
        invokeResult.valueInvoke = true;
        return this.finishCall(node, invokeResult, callee, scope);
    };

    Checker.prototype.exprText = function (node) {
        switch (node.k) {
        case 'name':
            return node.name;
        case 'member':
            return this.exprText(node.target) + '.' + node.name;
        case 'paren':
            return '(' + this.exprText(node.expr) + ')';
        case 'call':
            return this.exprText(node.callee) + '(...)';
        }
        return '...';
    };

    // Resolution with given levels (like resolveCall).
    Checker.prototype.resolveWithLevels = function (call, levels) {
        var tried = [];
        var self = this;
        for (var index = 0; index < levels.length; ++index) {
            var candidates = this.expandLevel(levels[index], call);
            candidates.forEach(function (candidate) {
                if (candidate.explicit === undefined && levels[index][0] && levels[index][0].explicit)
                    candidate.explicit = true;
            });
            var applicable = [];
            candidates.forEach(function (candidate) {
                var result = self.tryCandidate(candidate, call, false);
                candidate.result = result;
                tried.push(candidate);
                if (result.ok)
                    applicable.push(candidate);
            });
            if (applicable.length > 0)
                return this.completeCall(this.mostSpecific(applicable, call), call);
        }
        return this.callFailure(tried, call);
    };

    Checker.prototype.typeArguments = function (nodes, scope) {
        var self = this;
        return nodes.map(function (arg) {
            if (arg.variance === 'star')
                self.error(arg, 'projections are not allowed for immediate arguments of a supertype.');
            return self.resolveType(arg.type, scope);
        });
    };

    Checker.prototype.dynamicArguments = function (actuals, scope) {
        var self = this;
        actuals.forEach(function (actual) { self.expr(actual.value, null, scope); });
    };

    // The resolved call is stored on the node; the type of the call.
    Checker.prototype.finishCall = function (node, result, receiverNode, scope) {
        node.call = result;
        node.call.receiverNode = receiverNode;
        var fn = result.fn;
        this.noteCallee(fn, node, scope);
        if (fn.isCtor && result.ctorOf !== null && result.ctorOf.inner && !result.ctorOf.anonymous) {
            // An inner class needs an outer instance.
            var outer = result.ctorOf.outer;
            var receivers = scope.receivers();
            var found = receivers.filter(function (item) { return item.kind === 'this' && Kt.asSuper(item.type, outer) !== null; })[0];
            if (receiverNode === null && found === undefined)
                this.error(node, 'constructor of inner class \'' + result.ctorOf.name + '\' can be called only with receiver of containing class.');
            result.outerReceiver = found || null;
        }
        if (fn.suspend && !this.inSuspendContext(scope))
            this.error(node, 'suspend function \'' + fn.name + '\' should be called only from a coroutine or another suspend function.');
        if (result.type.kind === 'nothing' && !result.type.nullable)
            node.jumps = true;
        return result.type;
    };

    // Calls of a function or a lambda: for fibers and recursion.
    Checker.prototype.noteCallee = function (fn, node, scope) {
        if (this.fn !== null)
            this.fn.calls.push({ fn: fn, node: node });
        void scope;
    };

    Checker.prototype.inSuspendContext = function (scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind === 'lambda') {
                if (current.suspend)
                    return true;
                if (!current.inlineLambda)
                    return false;
            }
            if (current.kind === 'function')
                return !!current.suspend;
        }
        return false;
    };

    // super.foo(), super<A>.foo()
    Checker.prototype.superCall = function (node, call, scope) {
        var superNode = node.callee.target;
        var cls = scope.enclosingClass();
        if (cls === null)
            this.error(superNode, '\'super\' is not an expression, it can only be used on the left-hand side of a dot (\'.\').');
        var superType;
        if (superNode.type !== null && superNode.type !== undefined && superNode.type.k !== undefined) {
            superType = this.resolveType(superNode.type, scope);
        } else {
            superType = cls.superclass !== null ? cls.superclass : Kt.anyType();
            // An interface method with a body when the class has no such member in its superclass.
            var fromClass = this.membersOf(superType, call.name).length > 0;
            if (!fromClass) {
                for (var index = 0; index < cls.supers.length; ++index) {
                    if (this.membersOf(cls.supers[index], call.name).length > 0) {
                        superType = cls.supers[index];
                        break;
                    }
                }
            }
        }
        superNode.superType = superType;
        call.receiverType = superType;
        call.superCall = true;
        var result = this.resolveCall(call);
        result.superCall = true;
        result.superType = superType;
        return this.finishCall(node, result, superNode, scope);
    };

    // --- Indexing

    Checker.prototype.indexExpr = function (node, scope) {
        var targetType = this.expr(node.target, null, scope);
        if (Kt.resolved(targetType).kind === 'dynamic') {
            var self = this;
            node.indices.forEach(function (index) { self.expr(index, null, scope); });
            node.dynamicIndex = true;
            return Kt.DYNAMIC;
        }
        var result = this.operatorCall(node, 'get', node.target, targetType, node.indices, scope, null);
        node.call = result;
        return result.type;
    };

    // A call of an operator function on a checked receiver: a member or an extension.
    Checker.prototype.operatorCall = function (node, name, receiverNode, receiverType, args, scope, expected) {
        var actuals = args.map(function (arg) { return { name: null, spread: false, value: arg, line: arg.line, column: arg.column }; });
        var call = { name: name, node: node, actuals: actuals, typeArgs: null, scope: scope, expected: expected,
                     receiverType: receiverType, receiverNode: receiverNode, operator: true };
        if (Kt.isNullable(receiverType) && !Kt.resolved(receiverType).flexible && Kt.resolved(receiverType).kind !== 'dynamic') {
            var nonNull = this.membersOf(Kt.makeNotNull(receiverType), name);
            if (nonNull.length > 0) {
                var operatorName = { get: 'get', set: 'set', contains: 'contains', compareTo: 'compareTo' }[name];
                if (name === 'get' || name === 'set')
                    this.error(node, 'only safe (?.) or non-null asserted (!!.) calls are allowed on a nullable receiver of type \'' +
                               Kt.typeString(receiverType) + '\'.');
                void operatorName;
            }
        }
        var levels = this.explicitLevels(call);
        var self = this;
        levels = levels.map(function (level) {
            return level.filter(function (item) {
                var member = item.member || item.fn;
                return member !== undefined && member.kind === 'fun' && (member.operator || member.java !== null);
            });
        }).filter(function (level) { return level.length > 0; });
        var result = this.resolveWithLevels(call, levels);
        result.receiverNode = receiverNode;
        this.noteCallee(result.fn, node, scope);
        void self;
        return result;
    };

    // --- Operators

    var ARITHMETIC = { '+': 'plus', '-': 'minus', '*': 'times', '/': 'div', '%': 'rem' };
    var COMPARE = { '<': true, '>': true, '<=': true, '>=': true };
    Kt.ARITHMETIC = ARITHMETIC;

    Checker.prototype.binaryExpr = function (node, expected, scope) {
        var op = node.op;
        switch (op) {
        case '&&':
        case '||':
            return this.logicalExpr(node, scope);
        case '?:':
            return this.elvisExpr(node, expected, scope);
        case '==':
        case '!=':
        case '===':
        case '!==':
            return this.equalityExpr(node, scope);
        case 'in':
        case '!in':
            return this.containsExpr(node, scope);
        }
        var leftType = this.expr(node.left, null, scope);
        var rightExpected = null;
        var leftKind = Kt.primKind(leftType);
        if (Kt.isPrimitive(leftType) && Kt.isNumericKind(leftKind) && this.literalValue(node.right) !== null)
            rightExpected = null;
        var rightType = this.expr(node.right, rightExpected, scope);
        if (op === '..' || op === '..<')
            return this.rangeExpr(node, leftType, rightType, scope);
        // A constant expression of literals stays a literal (1 + 2 fits Long).
        var intrinsic = this.primitiveBinary(op, leftType, rightType, node);
        if (intrinsic !== null) {
            node.intrinsic = intrinsic;
            if (COMPARE[op])
                return Kt.booleanType();
            return intrinsic.type;
        }
        if (op === '+' && Kt.isClass(Kt.makeNotNull(leftType), 'String') && !Kt.isNullable(leftType)) {
            node.intrinsic = { kind: 'concat' };
            return Kt.stringType();
        }
        if (COMPARE[op]) {
            var compare = this.operatorCall(node, 'compareTo', node.left, leftType, [node.right], scope, null);
            if (!Kt.isClass(compare.type, 'Int'))
                this.error(node, 'compareTo must return Int.');
            node.call = compare;
            return Kt.booleanType();
        }
        var name = ARITHMETIC[op];
        var result = this.operatorCall(node, name, node.left, leftType, [node.right], scope, expected);
        node.call = result;
        return result.type;
    };

    // The intrinsic of two primitives: { kind: 'arith' | 'compare', type, operand }.
    Checker.prototype.primitiveBinary = function (op, leftType, rightType, node) {
        if (!Kt.isPrimitive(leftType) || !Kt.isPrimitive(rightType))
            return null;
        var left = Kt.primKind(leftType), right = Kt.primKind(rightType);
        if (COMPARE[op]) {
            if (Kt.isNumericKind(left) && Kt.isNumericKind(right))
                return { kind: 'compare', operand: promote(left, right), type: Kt.booleanType() };
            if (left === right && (left === 'char' || left === 'bool' || Kt.isUnsignedKind(left)))
                return { kind: 'compare', operand: left, type: Kt.booleanType() };
            return null;
        }
        if (Kt.isNumericKind(left) && Kt.isNumericKind(right) && ARITHMETIC[op] !== undefined) {
            var kind = promote(left, right);
            if ((op === '/' || op === '%') && Kt.isIntegralKind(kind))
                node.integerDivision = true;
            return { kind: 'arith', operand: kind, type: typeOfKind(kind) };
        }
        if (left === 'char') {
            if (right === 'i32' && (op === '+' || op === '-'))
                return { kind: 'charArith', operand: 'char', type: Kt.builtinType('Char') };
            if (right === 'char' && op === '-')
                return { kind: 'charDiff', operand: 'i32', type: Kt.intType() };
        }
        if (Kt.isUnsignedKind(left) && left === right && ARITHMETIC[op] !== undefined) {
            var unsignedKind = left === 'u64' ? 'u64' : 'u32';
            return { kind: 'unsigned', operand: unsignedKind, type: typeOfKind(unsignedKind) };
        }
        return null;
    };

    // Byte, Short and Int give Int; Long gives Long; Float and Double give the wider one.
    function promote(left, right) {
        var floatKinds = { f32: true, f64: true };
        if (left === 'f64' || right === 'f64')
            return 'f64';
        if (left === 'f32' || right === 'f32')
            return 'f32';
        if (left === 'i64' || right === 'i64')
            return 'i64';
        void floatKinds;
        return 'i32';
    }
    Kt.promote = promote;

    var KIND_TYPES = { i8: 'Byte', i16: 'Short', i32: 'Int', i64: 'Long', f32: 'Float', f64: 'Double', char: 'Char', bool: 'Boolean',
                       u8: 'UByte', u16: 'UShort', u32: 'UInt', u64: 'ULong' };
    function typeOfKind(kind) {
        return Kt.builtinType(KIND_TYPES[kind]);
    }
    Kt.typeOfKind = typeOfKind;

    // a..b, a..<b: IntRange, LongRange, CharRange; otherwise rangeTo.
    Checker.prototype.rangeExpr = function (node, leftType, rightType, scope) {
        var left = Kt.primKind(leftType), right = Kt.primKind(rightType);
        if (Kt.isPrimitive(leftType) && Kt.isPrimitive(rightType)) {
            if (Kt.isIntegralKind(left) && Kt.isIntegralKind(right)) {
                var wide = left === 'i64' || right === 'i64';
                node.intrinsic = { kind: 'range', operand: wide ? 'i64' : 'i32' };
                return Kt.builtinType(wide ? 'LongRange' : 'IntRange');
            }
            if (left === 'char' && right === 'char') {
                node.intrinsic = { kind: 'range', operand: 'char' };
                return Kt.builtinType('CharRange');
            }
            if (left === 'u32' && right === 'u32') {
                node.intrinsic = { kind: 'range', operand: 'u32' };
                return Kt.builtinType('UIntRange');
            }
            if (left === 'u64' && right === 'u64') {
                node.intrinsic = { kind: 'range', operand: 'u64' };
                return Kt.builtinType('ULongRange');
            }
        }
        var name = node.op === '..' ? 'rangeTo' : 'rangeUntil';
        var result = this.operatorCall(node, name, node.left, leftType, [node.right], scope, null);
        node.call = result;
        return result.type;
    };

    Checker.prototype.logicalExpr = function (node, scope) {
        var condition = this.condition(node, scope);
        void condition;
        return Kt.booleanType();
    };

    Checker.prototype.equalityExpr = function (node, scope) {
        var leftType = this.expr(node.left, null, scope);
        var rightType = this.expr(node.right, null, scope);
        var left = Kt.resolved(leftType), right = Kt.resolved(rightType);
        var identity = node.op === '===' || node.op === '!==';
        if (!this.comparable(left, right, identity)) {
            this.error({ line: node.line, column: node.column }, (identity ? 'operator \'' + node.op + '\' cannot be applied to \''
                                                                           : 'operator \'' + node.op + '\' cannot be applied to \'') +
                       Kt.typeString(left) + '\' and \'' + Kt.typeString(right) + '\'.');
        }
        var leftKind = Kt.isPrimitive(left) ? Kt.primKind(left) : null;
        var rightKind = Kt.isPrimitive(right) ? Kt.primKind(right) : null;
        if (leftKind !== null && leftKind === rightKind)
            node.intrinsic = { kind: 'primEquals', operand: leftKind };
        else if (left.kind === 'nothing' || right.kind === 'nothing')
            node.intrinsic = { kind: 'nullCheck' };
        return Kt.booleanType();
    };

    // Whether == of two types can be true (Int and String cannot).
    Checker.prototype.comparable = function (left, right, identity) {
        if (left.kind === 'error' || right.kind === 'error' || left.kind === 'dynamic' || right.kind === 'dynamic')
            return true;
        if (left.kind === 'nothing' || right.kind === 'nothing') {
            if (left.kind === 'nothing' && right.kind === 'nothing')
                return true;
            var other = left.kind === 'nothing' ? right : left;
            return Kt.isNullable(other) || other.flexible || identity === false;
        }
        var leftNotNull = Kt.makeNotNull(left), rightNotNull = Kt.makeNotNull(right);
        if (Kt.isSubtype(leftNotNull, rightNotNull) || Kt.isSubtype(rightNotNull, leftNotNull))
            return true;
        var leftKind = Kt.primKind(leftNotNull), rightKind = Kt.primKind(rightNotNull);
        if (leftKind !== null && rightKind !== null)
            return false;
        // Classes: unrelated final classes cannot be equal.
        if (left.kind === 'class' && right.kind === 'class') {
            var leftSym = left.sym, rightSym = right.sym;
            if (leftSym.isInterface() || rightSym.isInterface())
                return !(leftKind !== null || rightKind !== null) || true;
            if (!leftSym.isOpen() && !rightSym.isOpen())
                return false;
            return true;
        }
        return true;
    };

    // a in b, a !in b: b.contains(a).
    Checker.prototype.containsExpr = function (node, scope) {
        var rightType = this.expr(node.right, null, scope);
        var leftType = this.expr(node.left, null, scope);
        var range = Kt.resolved(rightType);
        if (node.right.intrinsic !== undefined && node.right.intrinsic.kind === 'range' && Kt.isPrimitive(leftType)) {
            var kind = Kt.primKind(leftType);
            if ((Kt.isIntegralKind(kind) && node.right.intrinsic.operand !== 'char') || (kind === 'char' && node.right.intrinsic.operand === 'char')) {
                node.intrinsic = { kind: 'inRange', operand: node.right.intrinsic.operand === 'i64' || kind === 'i64' ? 'i64' : node.right.intrinsic.operand };
                return Kt.booleanType();
            }
        }
        void range;
        var result = this.operatorCall(node, 'contains', node.right, rightType, [node.left], scope, null);
        if (!Kt.isClass(result.type, 'Boolean'))
            this.error(node, 'contains must return Boolean.');
        node.call = result;
        return Kt.booleanType();
    };

    // a ?: b
    Checker.prototype.elvisExpr = function (node, expected, scope) {
        var leftType = this.expr(node.left, expected === null ? null : Kt.makeNullable(expected), scope);
        var key = node.left.smartKey;
        var saved = this.cloneFacts();
        if (key !== undefined && key !== null)
            this.setFact(key, Kt.NULL_TYPE);
        var rightType = this.expr(node.right, expected, scope);
        this.facts = saved;
        var right = Kt.resolved(rightType);
        if (right.kind === 'nothing' && !right.nullable && key !== undefined && key !== null) {
            // x ?: return - x is not null after.
            this.setFact(key, Kt.makeNotNull(leftType));
        }
        var left = Kt.makeNotNull(leftType);
        if (expected !== null && this.literalValue(node.right) !== null && Kt.isSubtype(left, expected))
            return Kt.commonSupertype([left]);
        if (this.literalValue(node.right) !== null && Kt.isPrimitive(left) && Kt.literalFits(this.literalValue(node.right), Kt.primKind(left)))
            return left;
        return Kt.commonSupertype([left, rightType]);
    };

    // --- Infix calls and unary operators

    Checker.prototype.infixExpr = function (node, expected, scope) {
        var leftType = this.expr(node.left, null, scope);
        // A lambda on the right (x to { ... }) is checked with its parameter type.
        var rightType = Kt.isFunctionLiteral(node.right) || node.right.k === 'ref' ? null : this.argumentType(node.right, scope);
        var name = node.name;
        // Bitwise operations and the Boolean ones are intrinsics.
        var left = Kt.primKind(leftType), right = rightType !== null ? Kt.primKind(rightType) : null;
        if (Kt.isPrimitive(leftType) && rightType !== null && Kt.isPrimitive(rightType)) {
            if ((left === 'i32' || left === 'i64') && (name === 'and' || name === 'or' || name === 'xor') && right === left) {
                node.intrinsic = { kind: 'bitwise', op: name, operand: left };
                return typeOfKind(left);
            }
            if ((left === 'i32' || left === 'i64') && (name === 'shl' || name === 'shr' || name === 'ushr') && right === 'i32') {
                node.intrinsic = { kind: 'shift', op: name, operand: left };
                return typeOfKind(left);
            }
            if (left === 'bool' && right === 'bool' && (name === 'and' || name === 'or' || name === 'xor')) {
                node.intrinsic = { kind: 'boolOp', op: name };
                return Kt.booleanType();
            }
            if ((Kt.isUnsignedKind(left)) && left === right && (name === 'and' || name === 'or' || name === 'xor')) {
                node.intrinsic = { kind: 'bitwise', op: name, operand: left === 'u64' ? 'u64' : 'u32' };
                return typeOfKind(left);
            }
        }
        var actuals = [{ name: null, spread: false, value: node.right, line: node.right.line, column: node.right.column }];
        var call = { name: name, node: node, nameNode: { line: node.nameLine, column: node.nameColumn }, actuals: actuals,
                     typeArgs: null, scope: scope, expected: expected, receiverType: leftType, receiverNode: node.left, infix: true };
        var result = this.resolveCall(call);
        if (!result.fn.infix && result.fn.java === null && !result.fn.intrinsic)
            this.error({ line: node.nameLine, column: node.nameColumn }, '\'infix\' modifier is required on \'' + name + '\'.');
        node.call = result;
        node.call.receiverNode = node.left;
        this.noteCallee(result.fn, node, scope);
        return result.type;
    };

    Checker.prototype.prefixExpr = function (node, expected, scope) {
        var op = node.op;
        if (op === '++' || op === '--')
            return this.incrementExpr(node, node.arg, scope, true);
        if (op === '!') {
            var condition = this.condition(node, scope);
            void condition;
            return Kt.booleanType();
        }
        if (op === '-' && this.literalValue(node) !== null && node.arg.k !== 'paren') {
            // -1 is a literal: its type follows the expected type.
            var literal = this.literalValue(node);
            var kind = expected !== null ? Kt.primKind(Kt.makeNotNull(expected)) : null;
            this.expr(node.arg, null, scope);
            node.intrinsic = { kind: 'negate' };
            if ((kind === 'i64' || kind === 'i16' || kind === 'i8') && Kt.literalFits(literal, kind))
                return typeOfKind(kind);
            if (Kt.literalFits(literal, 'i32'))
                return Kt.intType();
            if (Kt.literalFits(literal, 'i64'))
                return Kt.builtinType('Long');
            this.error(node, 'value out of range.');
        }
        var argType = this.expr(node.arg, op === '-' || op === '+' ? expected : null, scope);
        var kindOf = Kt.primKind(argType);
        if (Kt.isPrimitive(argType) && Kt.isNumericKind(kindOf)) {
            node.intrinsic = { kind: op === '-' ? 'negate' : 'plus', operand: kindOf === 'i8' || kindOf === 'i16' ? 'i32' : kindOf };
            return typeOfKind(node.intrinsic.operand);
        }
        var name = op === '-' ? 'unaryMinus' : 'unaryPlus';
        var result = this.operatorCall(node, name, node.arg, argType, [], scope, null);
        node.call = result;
        return result.type;
    };

    // ++x, x++, --x, x--: inc/dec and an assignment.
    Checker.prototype.incrementExpr = function (node, target, scope, prefix) {
        var type = this.assignableType(target, scope);
        var kind = Kt.primKind(type);
        if (Kt.isPrimitive(type) && (Kt.isNumericKind(kind) || kind === 'char')) {
            node.intrinsic = { kind: 'increment', operand: kind };
        } else {
            var name = node.op === '++' ? 'inc' : 'dec';
            var result = this.operatorCall(node, name, target, type, [], scope, null);
            if (!Kt.isSubtype(result.type, type))
                this.mismatch(node, type, result.type, 'assignment');
            node.call = result;
        }
        node.prefix = prefix;
        this.assigned(target, type);
        return type;
    };

    Checker.prototype.postfixExpr = function (node, scope) {
        if (node.op === '!!') {
            var type = this.expr(node.arg, null, scope);
            var key = node.arg.smartKey;
            if (key !== undefined && key !== null)
                this.setFact(key, Kt.makeNotNull(type));
            node.smartKey = key;
            return Kt.makeNotNull(type);
        }
        return this.incrementExpr(node, node.arg, scope, false);
    };

    // --- is, as

    Checker.prototype.isExpr = function (node, scope) {
        var valueType = this.expr(node.expr, null, scope);
        var target = this.resolveType(node.target, scope);
        this.checkTypeTest(node.target, target, valueType);
        node.testType = target;
        return target;
    };

    // A type test of a generic type needs stars: is List<*>.
    Checker.prototype.checkTypeTest = function (typeNode, target, valueType) {
        target = Kt.resolved(target);
        if (target.kind === 'param' && !target.sym.reified)
            this.error(typeNode, 'cannot check for instance of erased type \'' + Kt.typeString(target) + '\'.');
        if (target.kind === 'class' && target.args.some(function (arg) { return arg.v !== '*'; })) {
            // Allowed when the value's type gives the arguments (List<Int> is ArrayList<Int>).
            var fromValue = Kt.asSuper(Kt.makeNotNull(valueType), target.sym);
            if (fromValue === null && !Kt.isSubtype(Kt.makeNotNull(valueType), Kt.makeNotNull(target))) {
                var known = Kt.resolved(valueType);
                if (!(known.kind === 'class' && known.args.length > 0))
                    this.error(typeNode, 'cannot check for instance of erased type \'' + Kt.typeString(target) + '\'.');
            }
        }
    };

    Checker.prototype.asExpr = function (node, scope) {
        var target = this.resolveType(node.target, scope);
        var valueType = this.expr(node.expr, null, scope);
        node.testType = target;
        node.valueType = valueType;
        var key = node.expr.smartKey;
        if (!node.safe && key !== undefined && key !== null)
            this.setFact(key, target);
        return node.safe ? Kt.makeNullable(target) : target;
    };

    // --- Conditions and smart casts

    Checker.prototype.cloneFacts = function () {
        return new Map(this.facts);
    };

    Checker.prototype.setFact = function (key, type) {
        this.facts.set(key, type);
    };

    // A Boolean expression with the facts it gives: { whenTrue, whenFalse } (Maps of new facts).
    Checker.prototype.condition = function (node, scope) {
        var self = this;
        var empty = function () { return new Map(); };
        switch (node.k) {
        case 'paren': {
            var inner = this.condition(node.expr, scope);
            node.type = node.expr.type;
            return inner;
        }
        case 'prefix':
            if (node.op === '!') {
                var argument = this.condition(node.arg, scope);
                var argType = node.arg.type;
                if (!Kt.isClass(argType, 'Boolean') && Kt.resolved(argType).kind !== 'error') {
                    var notCall = this.operatorCall(node, 'not', node.arg, argType, [], scope, null);
                    node.call = notCall;
                    node.type = notCall.type;
                    return { whenTrue: empty(), whenFalse: empty() };
                }
                node.intrinsic = { kind: 'not' };
                node.type = Kt.booleanType();
                return { whenTrue: argument.whenFalse, whenFalse: argument.whenTrue };
            }
            break;
        case 'binary':
            if (node.op === '&&' || node.op === '||') {
                var left = this.conditionAs(node.left, scope);
                var saved = this.cloneFacts();
                var branch = node.op === '&&' ? left.whenTrue : left.whenFalse;
                branch.forEach(function (type, key) { self.setFact(key, type); });
                var right = this.conditionAs(node.right, scope);
                this.facts = saved;
                node.type = Kt.booleanType();
                if (node.op === '&&')
                    return { whenTrue: union(left.whenTrue, right.whenTrue), whenFalse: intersect(left.whenFalse, right.whenFalse) };
                return { whenTrue: intersect(left.whenTrue, right.whenTrue), whenFalse: union(left.whenFalse, right.whenFalse) };
            }
            if (node.op === '==' || node.op === '!=') {
                var type = this.expr(node, null, scope);
                void type;
                var facts = this.equalityFacts(node);
                return node.op === '==' ? facts : { whenTrue: facts.whenFalse, whenFalse: facts.whenTrue };
            }
            break;
        case 'is': {
            var target = this.isExpr(node, scope);
            node.type = Kt.booleanType();
            var key = node.expr.smartKey;
            var result = { whenTrue: empty(), whenFalse: empty() };
            if (key !== undefined && key !== null) {
                var current = node.expr.type;
                var narrowed = this.narrow(current, target);
                (node.negated ? result.whenFalse : result.whenTrue).set(key, narrowed);
                // x !is T where T is nullable: not null in the other branch; is Nothing?...
                if (Kt.isNullable(target) === false && Kt.isNullable(current) && false)
                    void 0;
            }
            return result;
        }
        }
        this.exprAs(node, Kt.booleanType(), scope, 'condition');
        return { whenTrue: empty(), whenFalse: empty() };
    };

    Checker.prototype.conditionAs = function (node, scope) {
        var result = this.condition(node, scope);
        var type = node.type;
        if (type !== undefined && !Kt.isClass(type, 'Boolean') && Kt.resolved(type).kind !== 'error' &&
            !(Kt.resolved(type).kind === 'nothing') && Kt.resolved(type).kind !== 'dynamic' && !Kt.isSubtype(type, Kt.booleanType()))
            this.mismatch(node, Kt.booleanType(), type, 'condition');
        return result;
    };

    function union(left, right) {
        var result = new Map(left);
        right.forEach(function (type, key) {
            var existing = result.get(key);
            result.set(key, existing === undefined ? type : intersectTypes(existing, type));
        });
        return result;
    }

    function intersect(left, right) {
        var result = new Map();
        left.forEach(function (type, key) {
            var other = right.get(key);
            if (other !== undefined)
                result.set(key, Kt.commonSupertype([type, other]));
        });
        return result;
    }

    // Both facts at once: the more specific one.
    function intersectTypes(left, right) {
        if (Kt.isSubtype(left, right))
            return left;
        if (Kt.isSubtype(right, left))
            return right;
        return left;
    }

    // x == null, x != null, null == x, x == value of a non-null type.
    Checker.prototype.equalityFacts = function (node) {
        var whenTrue = new Map(), whenFalse = new Map();
        var leftNull = node.left.k === 'null', rightNull = node.right.k === 'null';
        var value = leftNull ? node.right : (rightNull ? node.left : null);
        if (value !== null) {
            var key = value.smartKey;
            if (key !== undefined && key !== null) {
                whenFalse.set(key, Kt.makeNotNull(value.type));
                whenTrue.set(key, Kt.NULL_TYPE);
            }
            return { whenTrue: whenTrue, whenFalse: whenFalse };
        }
        // x == y where y is not null: x is not null when equal.
        [[node.left, node.right], [node.right, node.left]].forEach(function (pair) {
            var keyOf = pair[0].smartKey;
            if (keyOf !== undefined && keyOf !== null && pair[1].type !== undefined && !Kt.isNullable(pair[1].type) &&
                Kt.isNullable(pair[0].type))
                whenTrue.set(keyOf, Kt.makeNotNull(pair[0].type));
        });
        return { whenTrue: whenTrue, whenFalse: whenFalse };
    };

    // The type of a value known to be of type target too.
    Checker.prototype.narrow = function (current, target) {
        current = Kt.resolved(current);
        target = Kt.resolved(target);
        if (Kt.isSubtype(target, current) || current.kind === 'error')
            return Kt.isNullable(current) ? target : Kt.makeNotNull(target);
        if (Kt.isSubtype(current, target))
            return Kt.isNullable(target) ? current : Kt.makeNotNull(current);
        // A generic target gets the arguments of the current type: List<String> is ArrayList<*> - ArrayList<String>.
        if (target.kind === 'class' && target.args.length > 0 && target.args.every(function (arg) { return arg.v === '*'; }) &&
            current.kind === 'class' && current.args.length > 0) {
            var guess = this.inferSubtypeArgs(target.sym, current);
            if (guess !== null)
                return guess;
        }
        return Kt.isNullable(target) ? target : Kt.makeNotNull(target);
    };

    // ArrayList from List<String>: ArrayList<String> when the parameters line up.
    Checker.prototype.inferSubtypeArgs = function (sym, current) {
        var map = new Map();
        var ivars = sym.typeParams.map(function (param) {
            var ivar = Kt.inferenceVar(param);
            map.set(param, ivar);
            return ivar;
        });
        var candidate = Kt.classType(sym, sym.typeParams.map(function (param) { return Kt.arg(map.get(param)); }));
        var mark = Kt.markBounds();
        var supertype = Kt.asSuper(candidate, current.sym);
        if (supertype === null) {
            Kt.rollbackBounds(mark);
            return null;
        }
        var ok = Kt.isSubtype(supertype, Kt.makeNotNull(current));
        if (!ok) {
            Kt.rollbackBounds(mark);
            return null;
        }
        var args = ivars.map(function (ivar) {
            var bounds = ivar.eq.concat(ivar.lower, ivar.upper);
            return bounds.length > 0 ? Kt.arg(Kt.resolved(bounds[0])) : Kt.STAR;
        });
        Kt.rollbackBounds(mark);
        return Kt.classType(sym, args, false);
    };

    // --- if, when, try as expressions

    // A block as a value: its last statement.
    Checker.prototype.blockValue = function (block, expected, scope, asValue) {
        var statements = block.statements;
        var blockScope = scope.child('block');
        var type = Kt.unitType();
        for (var index = 0; index < statements.length; ++index) {
            var statement = statements[index];
            var last = index === statements.length - 1;
            if (last && asValue && this.isExpression(statement)) {
                type = this.expr(statement, expected, blockScope);
                block.valueNode = statement;
            } else {
                var statementType = this.statement(statement, blockScope);
                if (statementType !== undefined && statementType !== null && Kt.resolved(statementType).kind === 'nothing' &&
                    !Kt.resolved(statementType).nullable) {
                    type = Kt.NOTHING;
                    block.jumps = true;
                    // The rest is unreachable: checked all the same.
                    for (var rest = index + 1; rest < statements.length; ++rest)
                        this.statement(statements[rest], blockScope);
                    return Kt.NOTHING;
                }
                if (last)
                    type = Kt.unitType();
            }
        }
        if (Kt.resolved(type).kind === 'nothing' && !Kt.resolved(type).nullable)
            block.jumps = true;
        return type;
    };

    Checker.prototype.isExpression = function (node) {
        switch (node.k) {
        case 'property':
        case 'fun':
        case 'class':
        case 'for':
        case 'while':
        case 'dowhile':
        case 'assign':
        case 'typealias':
            return false;
        }
        return true;
    };

    // if as an expression (asValue) or a statement.
    Checker.prototype.ifExpr = function (node, expected, scope, asValue) {
        var cond = this.conditionAs(node.cond, scope);
        var saved = this.cloneFacts();
        cond.whenTrue.forEach(function (type, key) { saved.set(key, type); });
        var before = this.cloneFacts();
        this.facts = new Map(before);
        cond.whenTrue.forEach(function (type, key) { this.facts.set(key, type); }, this);
        var thenType = this.blockValue(node.then, expected, scope, asValue && node.otherwise !== null);
        var afterThen = this.facts;
        var thenJumps = isJump(thenType);
        this.facts = new Map(before);
        cond.whenFalse.forEach(function (type, key) { this.facts.set(key, type); }, this);
        var elseType = Kt.unitType();
        var elseJumps = false;
        if (node.otherwise !== null) {
            elseType = this.blockValue(node.otherwise, expected, scope, asValue);
            elseJumps = isJump(elseType);
        }
        var afterElse = this.facts;
        // The facts after the if: of the branch that does not jump.
        if (thenJumps && !elseJumps)
            this.facts = afterElse;
        else if (elseJumps && !thenJumps)
            this.facts = afterThen;
        else
            this.facts = intersect(afterThen, afterElse);
        if (asValue && node.otherwise === null) {
            if (expected !== null && !Kt.isClass(expected, 'Unit') && !Kt.isClass(expected, 'Any'))
                this.error(node, '\'if\' must have both main and \'else\' branches if used as an expression.');
            return Kt.unitType();
        }
        if (!asValue)
            return thenJumps && elseJumps ? Kt.NOTHING : Kt.unitType();
        node.thenType = thenType;
        node.elseType = elseType;
        return this.branchesType([{ type: thenType, node: node.then }, { type: elseType, node: node.otherwise }], expected);
    };

    function isJump(type) {
        type = Kt.resolved(type);
        return type.kind === 'nothing' && !type.nullable;
    }
    Kt.isJump = isJump;

    // The type of branches: the expected type if all fit, else the common supertype.
    Checker.prototype.branchesType = function (branches, expected) {
        var self = this;
        if (expected !== null && expected !== undefined && Kt.resolved(expected).kind !== 'ivar') {
            var allFit = branches.every(function (branch) {
                return self.fits(valueNodeOf(branch.node), branch.type, expected);
            });
            if (allFit)
                return this.branchCommon(branches, expected);
        }
        return this.branchCommon(branches, null);
    };

    function valueNodeOf(block) {
        if (block === null || block === undefined)
            return { k: 'none' };
        if (block.k === 'block')
            return block.valueNode || { k: 'none' };
        return block;
    }

    // Literals in branches take the type of the others (if (c) 1 else 2L - Long).
    Checker.prototype.branchCommon = function (branches, expected) {
        var self = this;
        var types = branches.map(function (branch) { return branch.type; });
        var literalOnly = branches.filter(function (branch) { return self.literalValue(valueNodeOf(branch.node)) === null; });
        if (expected !== null) {
            var target = Kt.makeNotNull(expected);
            if (Kt.isPrimitive(target) && branches.every(function (branch) {
                var value = self.literalValue(valueNodeOf(branch.node));
                return value !== null || isJump(branch.type) || Kt.isSubtype(branch.type, expected);
            })) {
                var nullable = types.some(function (type) { return Kt.isNullable(type); });
                return nullable ? Kt.makeNullable(target) : target;
            }
        }
        if (literalOnly.length > 0 && literalOnly.length < branches.length) {
            var others = Kt.commonSupertype(literalOnly.map(function (branch) { return branch.type; }));
            var otherKind = Kt.isPrimitive(Kt.makeNotNull(others)) ? Kt.primKind(Kt.makeNotNull(others)) : null;
            if (otherKind !== null && branches.every(function (branch) {
                var value = self.literalValue(valueNodeOf(branch.node));
                return value === null || Kt.literalFits(value, otherKind);
            }))
                return others;
        }
        return Kt.commonSupertype(types);
    };

    Checker.prototype.whenExpr = function (node, expected, scope, asValue) {
        var self = this;
        var whenScope = scope.child('block');
        var subjectType = null;
        var subjectKey = null;
        if (node.subject !== null) {
            subjectType = this.expr(node.subject, null, whenScope);
            subjectKey = node.subject.smartKey;
            if (node.subjectVar !== null) {
                var declared = node.subjectVar.type !== null ? this.resolveType(node.subjectVar.type, whenScope) : subjectType;
                if (node.subjectVar.type !== null && !this.fits(node.subject, subjectType, declared))
                    this.mismatch(node.subject, declared, subjectType, 'initializer');
                var variable = Kt.VarSym(node.subjectVar.name, declared, false);
                variable.node = node.subjectVar;
                this.declareLocal(whenScope, variable, node.subjectVar);
                node.subjectVar.sym = variable;
                subjectKey = variable;
                subjectType = declared;
            }
        }
        var before = this.cloneFacts();
        var branchTypes = [];
        var afterFacts = [];
        var hasElse = false;
        var negative = new Map(before);
        node.branches.forEach(function (branch) {
            self.facts = new Map(negative);
            var branchFacts = new Map();
            var allTrue = null;
            if (branch.isElse) {
                hasElse = true;
            } else {
                branch.conds.forEach(function (cond) {
                    var facts = self.whenCondition(cond, node, subjectType, subjectKey, whenScope);
                    allTrue = allTrue === null ? facts.whenTrue : intersect(allTrue, facts.whenTrue);
                    if (branch.conds.length === 1)
                        facts.whenFalse.forEach(function (type, key) { negative.set(key, type); });
                });
                if (allTrue !== null)
                    branchFacts = allTrue;
            }
            self.facts = new Map(negative);
            if (!branch.isElse && branch.conds.length > 1) {
                // Facts of a list of conditions: only those common to all.
                void 0;
            }
            branchFacts.forEach(function (type, key) { self.facts.set(key, type); });
            if (branch.guard !== null) {
                var guard = self.conditionAs(branch.guard, whenScope);
                guard.whenTrue.forEach(function (type, key) { self.facts.set(key, type); });
            }
            var type = self.blockValue(branch.body, expected, whenScope, asValue);
            branchTypes.push({ type: type, node: branch.body });
            if (!isJump(type))
                afterFacts.push(self.facts);
        });
        var exhaustive = hasElse || this.whenExhaustive(node, subjectType);
        node.exhaustive = exhaustive;
        if (!exhaustive)
            afterFacts.push(negative);
        this.facts = afterFacts.length === 0 ? new Map(before) : afterFacts.reduce(function (left, right) { return intersect(left, right); });
        if (asValue) {
            if (!exhaustive) {
                if (node.subject === null)
                    this.error(node, '\'when\' expression must be exhaustive. Add an \'else\' branch.');
                this.error(node, '\'when\' expression must be exhaustive. Add ' + this.missingBranches(node, subjectType) + '.');
            }
            return this.branchesType(branchTypes, expected);
        }
        if (exhaustive && branchTypes.length > 0 && branchTypes.every(function (branch) { return isJump(branch.type); }))
            return Kt.NOTHING;
        return Kt.unitType();
    };

    // One condition of a when branch: { whenTrue, whenFalse }.
    Checker.prototype.whenCondition = function (cond, node, subjectType, subjectKey, scope) {
        var empty = { whenTrue: new Map(), whenFalse: new Map() };
        if (subjectType === null) {
            if (cond.k !== 'exprcond')
                this.error(cond, 'expected condition of type Boolean.');
            return this.conditionAs(cond.expr, scope);
        }
        switch (cond.k) {
        case 'iscond': {
            var target = this.resolveType(cond.type, scope);
            this.checkTypeTest(cond.type, target, subjectType);
            cond.testType = target;
            if (subjectKey === null || subjectKey === undefined)
                return empty;
            var narrowed = this.narrow(subjectType, target);
            var facts = { whenTrue: new Map(), whenFalse: new Map() };
            (cond.negated ? facts.whenFalse : facts.whenTrue).set(subjectKey, narrowed);
            return facts;
        }
        case 'incond': {
            var fake = { k: 'binary', op: 'in', left: { k: 'subject', type: subjectType, line: cond.line, column: cond.column },
                         right: cond.expr, line: cond.line, column: cond.column };
            var rangeType = this.expr(cond.expr, null, scope);
            if (cond.expr.intrinsic !== undefined && cond.expr.intrinsic.kind === 'range' && Kt.isPrimitive(subjectType)) {
                cond.intrinsic = { kind: 'inRange', operand: cond.expr.intrinsic.operand };
            } else {
                var result = this.operatorCall(cond, 'contains', cond.expr, rangeType, [fake.left], scope, null);
                cond.call = result;
            }
            return empty;
        }
        default: {
            var valueType = this.expr(cond.expr, subjectType, scope);
            if (!this.comparable(Kt.resolved(subjectType), Kt.resolved(valueType), false) && !Kt.isSubtype(valueType, subjectType))
                this.error(cond.expr, 'incompatible types \'' + Kt.typeString(valueType) + '\' and \'' + Kt.typeString(subjectType) + '\'.');
            var subjectKind = Kt.isPrimitive(subjectType) ? Kt.primKind(subjectType) : null;
            if (subjectKind !== null && Kt.isPrimitive(valueType) && Kt.primKind(valueType) === subjectKind)
                cond.intrinsic = { kind: 'primEquals', operand: subjectKind };
            if (cond.expr.k === 'null' && subjectKey !== null && subjectKey !== undefined) {
                var nullFacts = { whenTrue: new Map(), whenFalse: new Map() };
                nullFacts.whenFalse.set(subjectKey, Kt.makeNotNull(subjectType));
                return nullFacts;
            }
            return empty;
        }
        }
    };

    // A when without else is exhaustive for Boolean, enums and sealed classes.
    Checker.prototype.whenExhaustive = function (node, subjectType) {
        if (subjectType === null)
            return false;
        var type = Kt.resolved(subjectType);
        var nullable = Kt.isNullable(type);
        var covered = this.coveredCases(node);
        if (nullable && !covered.nullCase)
            return false;
        type = Kt.makeNotNull(type);
        if (Kt.isClass(type, 'Boolean'))
            return covered.values.indexOf('true') >= 0 && covered.values.indexOf('false') >= 0;
        if (type.kind !== 'class')
            return false;
        var sym = type.sym;
        sym.complete();
        if (sym.kind === 'enum')
            return sym.entries.every(function (entry) { return covered.values.indexOf(entry) >= 0; });
        if (sym.mods.sealed)
            return this.sealedCovered(sym, covered.types);
        return covered.types.some(function (target) { return Kt.isSubtype(type, target); });
    };

    Checker.prototype.sealedCovered = function (sym, types) {
        var self = this;
        if (types.some(function (target) { return Kt.asSuper(Kt.classType(sym, []), Kt.resolved(target).sym) !== null &&
                                                  Kt.resolved(target).kind === 'class' && Kt.resolved(target).sym === sym; }))
            return true;
        sym.complete();
        if (sym.sealedSubclasses.length === 0)
            return false;
        return sym.sealedSubclasses.every(function (sub) {
            if (types.some(function (target) {
                target = Kt.resolved(target);
                return target.kind === 'class' && Kt.asSuper(Kt.classType(sub, sub.typeParams.map(function () { return Kt.STAR; })), target.sym) !== null;
            }))
                return true;
            if (sub.mods.sealed)
                return self.sealedCovered(sub, types);
            if (sub.kind === 'object')
                return types.some(function (target) { return Kt.resolved(target).sym === sub; });
            return false;
        });
    };

    // The cases a when covers: constants, types, null.
    Checker.prototype.coveredCases = function (node) {
        var values = [];
        var types = [];
        var nullCase = false;
        node.branches.forEach(function (branch) {
            if (branch.guard !== null)
                return;
            branch.conds.forEach(function (cond) {
                if (cond.k === 'iscond' && !cond.negated) {
                    types.push(cond.testType);
                    if (Kt.isNullable(cond.testType))
                        nullCase = true;
                }
                if (cond.k === 'exprcond') {
                    var expr = cond.expr;
                    while (expr.k === 'paren')
                        expr = expr.expr;
                    if (expr.k === 'null')
                        nullCase = true;
                    if (expr.k === 'bool')
                        values.push(String(expr.value));
                    if (expr.ref !== undefined && expr.ref.kind === 'prop' && expr.ref.sym.enumEntry !== undefined)
                        values.push(expr.ref.sym.name);
                    if (expr.ref !== undefined && expr.ref.kind === 'object')
                        types.push(Kt.classType(expr.ref.sym, []));
                }
            });
        });
        return { values: values, types: types, nullCase: nullCase };
    };

    Checker.prototype.missingBranches = function (node, subjectType) {
        var type = Kt.makeNotNull(Kt.resolved(subjectType));
        var covered = this.coveredCases(node);
        var missing = [];
        if (Kt.isClass(type, 'Boolean')) {
            ['true', 'false'].forEach(function (value) {
                if (covered.values.indexOf(value) < 0)
                    missing.push('\'' + value + '\'');
            });
        } else if (type.kind === 'class' && type.sym.kind === 'enum') {
            type.sym.entries.forEach(function (entry) {
                if (covered.values.indexOf(entry) < 0)
                    missing.push('\'' + entry + '\'');
            });
        } else if (type.kind === 'class' && type.sym.mods.sealed) {
            type.sym.sealedSubclasses.forEach(function (sub) {
                var hit = covered.types.some(function (target) { return Kt.resolved(target).sym === sub; });
                if (!hit)
                    missing.push('\'' + (sub.kind === 'object' ? '' : 'is ') + sub.name + '\'');
            });
        }
        if (Kt.isNullable(subjectType) && !covered.nullCase)
            missing.push('\'null\'');
        if (missing.length === 0)
            return 'an \'else\' branch';
        return 'the ' + missing.join(', ') + ' branch' + (missing.length > 1 ? 'es' : '') + ' or an \'else\' branch';
    };

    Checker.prototype.tryExpr = function (node, expected, scope) {
        var self = this;
        var before = this.cloneFacts();
        var bodyType = this.blockValue(node.body, expected, scope, true);
        var branches = [{ type: bodyType, node: node.body }];
        node.catches.forEach(function (clause) {
            self.facts = new Map(before);
            var catchScope = scope.child('block');
            var type = self.resolveType(clause.type, catchScope);
            if (!Kt.isSubtype(type, Kt.builtinType('Throwable')))
                self.error(clause.type, 'catch parameter type must be a subtype of Throwable.');
            var variable = Kt.VarSym(clause.name, type, false);
            self.declareLocal(catchScope, variable, clause);
            clause.sym = variable;
            clause.catchType = type;
            var clauseType = self.blockValue(clause.body, expected, catchScope, true);
            branches.push({ type: clauseType, node: clause.body });
        });
        this.facts = new Map(before);
        if (node.finalizer !== null)
            this.blockValue(node.finalizer, null, scope, false);
        return this.branchesType(branches, expected);
    };

    // return, break, continue, throw: of type Nothing.
    Checker.prototype.jumpExpr = function (node, scope) {
        switch (node.kind) {
        case 'throw': {
            var type = this.expr(node.value, null, scope);
            if (!Kt.isSubtype(type, Kt.builtinType('Throwable')) && Kt.resolved(type).kind !== 'error')
                this.mismatch(node.value, Kt.builtinType('Throwable'), type, 'argument');
            return Kt.NOTHING;
        }
        case 'return':
            this.returnStatement(node, scope);
            return Kt.NOTHING;
        case 'break':
        case 'continue':
            this.loopJump(node, scope);
            return Kt.NOTHING;
        }
        return Kt.NOTHING;
    };
})(globalThis);
