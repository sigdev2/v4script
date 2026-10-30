// C#: completing a type - the header (type parameters, constraints, base
// types) and the members: fields, methods, constructors, properties,
// indexers, events, operators, the synthesized members of records, enums
// and delegates; overrides, interface implementations and the JavaScript
// names of the members.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.completeType)
        return;

    var OPERATOR_NAMES = {
        unary: { '+': 'op_UnaryPlus', '-': 'op_UnaryNegation', '!': 'op_LogicalNot', '~': 'op_OnesComplement',
                 '++': 'op_Increment', '--': 'op_Decrement', 'true': 'op_True', 'false': 'op_False' },
        binary: { '+': 'op_Addition', '-': 'op_Subtraction', '*': 'op_Multiply', '/': 'op_Division', '%': 'op_Modulus',
                  '&': 'op_BitwiseAnd', '|': 'op_BitwiseOr', '^': 'op_ExclusiveOr', '<<': 'op_LeftShift',
                  '>>': 'op_RightShift', '>>>': 'op_UnsignedRightShift', '==': 'op_Equality', '!=': 'op_Inequality',
                  '<': 'op_LessThan', '>': 'op_GreaterThan', '<=': 'op_LessThanOrEqual', '>=': 'op_GreaterThanOrEqual' }
    };
    CS.OPERATOR_NAMES = OPERATOR_NAMES;
    // Operators that must be declared in pairs.
    var PAIRS = { op_Equality: 'op_Inequality', op_Inequality: 'op_Equality', op_LessThan: 'op_GreaterThan',
                  op_GreaterThan: 'op_LessThan', op_LessThanOrEqual: 'op_GreaterThanOrEqual',
                  op_GreaterThanOrEqual: 'op_LessThanOrEqual', op_True: 'op_False', op_False: 'op_True' };
    var PAIR_TEXT = { op_Equality: '==', op_Inequality: '!=', op_LessThan: '<', op_GreaterThan: '>', op_LessThanOrEqual: '<=',
                      op_GreaterThanOrEqual: '>=', op_True: 'true', op_False: 'false' };

    // --- The header

    C.completeType = function (sym) {
        var node = sym.node;
        var scope = sym.scope;
        this.declareConstraints(sym.typeParams, node.constraints || [], scope, sym);
        sym.constraintsChecked = false;
        if (sym.kind === 'enum') {
            var underlying = node.underlying !== null ? this.resolveType(node.underlying, scope) : CS.intType();
            if (!CS.isIntegral(underlying) || CS.isSpecial(underlying, 'char'))
                this.error(node.underlying, 'CS1008', 'Type byte, sbyte, short, ushort, int, uint, long, or ulong expected');
            sym.enumUnderlying = underlying;
            sym.baseType = CS.libraryType('System.Enum');
            sym.interfaces = [];
        } else if (sym.kind === 'delegate') {
            sym.baseType = CS.libraryType('System.MulticastDelegate');
            sym.interfaces = [];
        } else {
            this.completeBaseList(sym, node, scope);
        }
        sym.constraintsChecked = true;
        this.completeMembers(sym);
    };

    // where T : class, new(), IFoo
    C.declareConstraints = function (params, clauses, scope, owner) {
        var self = this;
        // where T : I<T> - the constraints of I need those of T.
        this.deferringConstraints(function () { self.declareConstraintClauses(params, clauses, scope, owner); });
    };

    C.declareConstraintClauses = function (params, clauses, scope, owner) {
        var self = this;
        clauses.forEach(function (clause) {
            var param = null;
            params.forEach(function (candidate) {
                if (candidate.name === clause.name)
                    param = candidate;
            });
            if (param === null)
                self.error(clause, 'CS0699', "'" + (owner.name || '') + "' does not define type parameter '" + clause.name + "'");
            clause.constraints.forEach(function (constraint) {
                switch (constraint.kind) {
                case 'class':
                    param.constraints.class = true;
                    break;
                case 'struct':
                    param.constraints.struct = true;
                    break;
                case 'new':
                    param.constraints.new = true;
                    break;
                case 'unmanaged':
                    param.constraints.unmanaged = true;
                    param.constraints.struct = true;
                    break;
                case 'notnull':
                    param.constraints.notnull = true;
                    break;
                case 'default':
                    break;
                case 'type': {
                    var bound = self.resolveType(constraint.type, scope);
                    param.constraints.types.push(bound);
                    break;
                }
                }
            });
        });
    };

    // The base class and the interfaces of a class, struct or interface.
    C.completeBaseList = function (sym, node, scope) {
        var self = this;
        // class C : I<C> - the constraints of I need the interfaces of C.
        this.deferringConstraints(function () { self.completeBaseTypes(sym, node, scope); });
    };

    // Runs fn and then checks the constraints of the types it constructed.
    C.deferringConstraints = function (fn) {
        var self = this;
        var saved = this.deferredConstraints;
        this.deferredConstraints = [];
        try {
            fn();
        } finally {
            var deferred = this.deferredConstraints;
            this.deferredConstraints = saved;
        }
        deferred.forEach(function (item) { self.checkConstraints(item.type, item.node); });
    };

    C.completeBaseTypes = function (sym, node, scope) {
        var self = this;
        var list = (node.baseList || []).map(function (item) { return { node: item, type: self.resolveType(item, scope) }; });
        // The parts of a partial type: the base class first, each type once.
        if (node.mergedPartial) {
            list = list.filter(function (item, index) {
                return !list.slice(0, index).some(function (other) { return CS.sameType(other.type, item.type); });
            });
            list = list.filter(function (item) { return !CS.isInterface(item.type); })
                .concat(list.filter(function (item) { return CS.isInterface(item.type); }));
        }
        sym.baseType = null;
        sym.interfaces = [];
        list.forEach(function (item, index) {
            var type = item.type;
            if (type.kind !== 'named') {
                if (type.kind === 'tparam')
                    self.error(item.node, 'CS0689', "Cannot derive from '" + type.sym.name + "' because it is a type parameter");
                self.error(item.node, 'CS0527', "Type '" + CS.typeName(type) + "' in interface list is not an interface");
            }
            var baseSym = type.sym.complete();
            if (baseSym.kind === 'interface') {
                sym.interfaces.push(type);
                return;
            }
            if (sym.kind !== 'class' || index > 0) {
                if (sym.kind === 'struct')
                    self.error(item.node, 'CS0527', "Type '" + CS.typeName(type) + "' in interface list is not an interface");
                if (sym.kind === 'interface')
                    self.error(item.node, 'CS0527', "Type '" + CS.typeName(type) + "' in interface list is not an interface");
                self.error(item.node, 'CS1722', "Base class '" + CS.typeName(type) + "' must come before any interfaces");
            }
            if (baseSym.kind !== 'class')
                self.error(item.node, 'CS0509', "'" + CS.symbolTypeName(sym) + "': cannot derive from sealed type '" + CS.typeName(type) + "'");
            if (baseSym.mods.sealed || baseSym.mods.static)
                self.error(item.node, baseSym.mods.static ? 'CS0709' : 'CS0509', baseSym.mods.static
                    ? "'" + CS.symbolTypeName(sym) + "': cannot derive from static class '" + CS.typeName(type) + "'"
                    : "'" + CS.symbolTypeName(sym) + "': cannot derive from sealed type '" + CS.typeName(type) + "'");
            if (sym.isRecord && !baseSym.isRecord && baseSym.special !== 'object')
                self.error(item.node, 'CS8864', 'Records may only inherit from object or another record');
            if (!sym.isRecord && baseSym.isRecord)
                self.error(item.node, 'CS8865', 'Only records may inherit from records.');
            if (CS.derivesFrom(baseSym, sym))
                self.error(item.node, 'CS0146', "Circular base type dependency involving '" + CS.typeName(type) + "' and '" +
                           CS.symbolTypeName(sym) + "'");
            sym.baseType = type;
        });
        if (sym.kind === 'class' && sym.baseType === null && sym.special !== 'object')
            sym.baseType = CS.objectType();
        if (sym.kind === 'struct')
            sym.baseType = CS.libraryType('System.ValueType');
        if (sym.isRecord) {
            var equatable = CS.libraryType('System.IEquatable`1', [CS.selfType(sym)]);
            if (!sym.interfaces.some(function (iface) { return CS.sameType(iface, equatable); }))
                sym.interfaces.push(equatable);
        }
    };

    // --- Members

    C.completeMembers = function (sym) {
        var self = this;
        var node = sym.node;
        sym.fieldOrder = [];
        if (sym.kind === 'enum') {
            this.enumMembers(sym, node);
            this.assignJsNames(sym);
            return;
        }
        if (sym.kind === 'delegate') {
            this.delegateMembers(sym, node);
            this.assignJsNames(sym);
            return;
        }
        if (node.params !== null && node.params !== undefined)
            this.primaryConstructor(sym, node);
        node.members.forEach(function (member) {
            switch (member.k) {
            case 'field':
                self.fieldMembers(sym, member);
                break;
            case 'method':
                self.methodMember(sym, member);
                break;
            case 'ctor':
                self.constructorMember(sym, member);
                break;
            case 'property':
                self.propertyMember(sym, member);
                break;
            case 'indexer':
                self.indexerMember(sym, member);
                break;
            case 'event':
            case 'eventField':
                self.eventMember(sym, member);
                break;
            case 'operator':
                self.operatorMember(sym, member);
                break;
            case 'conversion':
                self.conversionMember(sym, member);
                break;
            case 'dtor':
                break;
            case 'type':
                self.addMemberName(sym, member.name, member, member.sym);
                break;
            }
        });
        if (sym.isRecord)
            this.recordMembers(sym, node);
        this.defaultConstructor(sym);
        this.checkOperatorPairs(sym);
        this.linkOverrides(sym);
        this.assignJsNames(sym);
        if (sym.kind !== 'interface')
            this.implementInterfaces(sym);
    };

    // A name may be declared once per type (methods may be overloaded).
    C.addMemberName = function (sym, name, node, member) {
        var existing = sym.members[name] || [];
        var kind = member.symbolKind;
        existing.forEach(function (other) {
            if (other.synthetic || other.explicitIface || member.explicitIface)
                return;
            if (kind === 'method' && other.symbolKind === 'method')
                return;
            if (kind === 'property' && member.isIndexer && other.isIndexer)
                return;
            this.error(node, 'CS0102', "The type '" + CS.symbolTypeName(sym) + "' already contains a definition for '" + name + "'");
        }, this);
        if (name === sym.name && kind !== 'type' && !member.isCtor)
            this.error(node, 'CS0542', "'" + name + "': member names cannot be the same as their enclosing type");
        if (kind !== 'type')
            sym.addMember(member);
        else
            sym.memberList.push(member);
    };

    C.memberModifiers = function (sym, member) {
        var mods = member.mods || {};
        if (sym.kind === 'interface') {
            // Members of interfaces are public and abstract unless they have a body.
            if (!mods.private && !mods.protected && !mods.internal)
                mods.public = true;
        }
        if (sym.mods.static && !mods.static && !mods.const && member.k !== 'type' && member.k !== 'operator' &&
            member.k !== 'conversion') {
            var what = member.k === 'field' ? member.vars[0].name : (member.name || CS.symbolTypeName(sym));
            this.error(member, member.k === 'ctor' ? 'CS0710' : 'CS0708', member.k === 'ctor'
                ? 'Static classes cannot have instance constructors'
                : "'" + CS.symbolTypeName(sym) + '.' + what + "': cannot declare instance members in a static class");
        }
        return mods;
    };

    C.fieldMembers = function (sym, member) {
        var self = this;
        var mods = this.memberModifiers(sym, member);
        var type = this.resolveType(member.type, sym.scope, { allowVar: true });
        if (type === null)
            this.error(member.type, 'CS0825', "The contextual keyword 'var' may only appear within a local variable declaration or in script code");
        if (sym.kind === 'interface' && !mods.static && !mods.const)
            this.error(member, 'CS0525', 'Interfaces cannot contain instance fields');
        member.vars.forEach(function (variable) {
            var field = CS.FieldSymbol(variable.name, type, sym, mods);
            field.node = variable;
            field.init = variable.init;
            field.declNode = member;
            if (mods.const) {
                if (variable.init === null)
                    self.error(variable, 'CS0145', 'A const field requires a value to be provided');
                field.constantPending = true;
            }
            if (sym.kind === 'struct' && !field.isStatic && variable.init !== null && !sym.hasExplicitCtor)
                field.structInit = true;
            self.addMemberName(sym, variable.name, variable, field);
            if (!field.isStatic)
                sym.fieldOrder.push(field);
        });
    };

    // Parameters of a method, constructor, indexer, delegate or lambda.
    C.parameters = function (nodes, scope, owner) {
        var self = this;
        var seen = Object.create(null);
        return nodes.map(function (node, index) {
            var type = self.resolveType(node.type, scope);
            if (type.kind === 'named' && type.sym.isStatic())
                self.error(node, 'CS0721', "'" + CS.typeName(type) + "': static types cannot be used as parameters");
            var param = CS.ParamSymbol(node.name, type, node.refKind === 'this' ? '' : node.refKind, index);
            if (seen[node.name])
                self.error(node, 'CS0100', "The parameter name '" + node.name + "' is a duplicate");
            seen[node.name] = true;
            param.isParams = node.isParams;
            param.node = node;
            if (node.isParams) {
                if (index !== nodes.length - 1)
                    self.error(node, 'CS0231', 'A params parameter must be the last parameter in a parameter list');
                if (type.kind !== 'array' || type.rank !== 1)
                    self.error(node, 'CS0225', 'The params parameter must be a single dimensional array');
            }
            if (node.defaultValue !== null && node.defaultValue !== undefined) {
                param.hasDefault = true;
                param.defaultNode = node.defaultValue;
                param.defaultScope = scope;
                if (param.refKind === 'ref' || param.refKind === 'out')
                    self.error(node, 'CS1741', 'A ref or out parameter cannot have a default value');
            }
            param.owner = owner;
            return param;
        });
    };

    // The scope of a method: its type parameters.
    C.methodScope = function (method, parentScope, typeParamNodes) {
        var scope = parentScope.child('method', { method: method });
        if (typeParamNodes.length > 0) {
            scope.typeParams = Object.create(null);
            method.typeParams = typeParamNodes.map(function (param, index) {
                var typeParam = CS.TypeParamSymbol(param.name, method, index);
                typeParam.variance = param.variance;
                typeParam.methodLevel = true;
                scope.typeParams[param.name] = typeParam;
                return typeParam;
            });
        }
        return scope;
    };

    // [Name] or [NameAttribute] on a declaration.
    CS.hasAttribute = function (node, name) {
        return (node.attributes || []).some(function (attribute) {
            return attribute.name === name || attribute.name === name + 'Attribute';
        });
    };

    C.methodMember = function (sym, member) {
        var mods = this.memberModifiers(sym, member);
        var method = CS.MethodSymbol(member.name, sym, mods);
        method.node = member;
        if (this.library && CS.hasAttribute(member, 'V4Fiber'))
            method.fiber = true;
        var scope = this.methodScope(method, sym.scope, member.typeParams);
        method.scope = scope;
        this.declareConstraints(method.typeParams, member.constraints, scope, method);
        method.returnType = this.resolveType(member.returnType, scope, { allowVoid: true });
        method.refReturn = !!member.returnType.refReturn;
        method.params = this.parameters(member.params, scope, method);
        if (member.explicitIface !== null) {
            method.explicitIface = this.resolveType(member.explicitIface, sym.scope);
            if (!CS.isInterface(method.explicitIface))
                this.error(member.explicitIface, 'CS0538', "'" + CS.typeName(method.explicitIface) +
                           "' in explicit interface declaration is not an interface");
            method.access = 'private';
        }
        if (sym.kind === 'interface') {
            if (member.body === null && member.expr === null && (!mods.static || mods.abstract) && !mods.extern)
                method.isAbstract = true;
            else if ((!mods.static || mods.virtual) && !mods.private && !mods.sealed)
                method.isVirtual = true;
        }
        var hasBody = member.body !== null || member.expr !== null;
        if (!hasBody && !method.isAbstract && !method.isExtern && !mods.partial)
            this.error(member, 'CS0501', "'" + this.methodText(method) + "' must declare a body because it is not marked abstract, extern, or partial");
        if (hasBody && method.isAbstract && sym.kind !== 'interface')
            this.error(member, 'CS0500', "'" + this.methodText(method) + "' cannot declare a body because it is marked abstract");
        if (method.isAbstract && sym.kind === 'class' && !sym.mods.abstract)
            this.error(member, 'CS0513', "'" + this.methodText(method) + "' is abstract but it is contained in non-abstract type '" +
                       CS.symbolTypeName(sym) + "'");
        if ((method.isVirtual || method.isAbstract || method.isOverride) && method.access === 'private' && sym.kind !== 'interface')
            this.error(member, 'CS0621', "'" + this.methodText(method) + "': virtual or abstract members cannot be private");
        if (member.params.length > 0 && member.params[0].isThis) {
            if (!sym.mods.static || sym.typeParams.length > 0 || (sym.container !== null && sym.container.kind !== 'namespace'))
                this.error(member, 'CS1106', "Extension method must be defined in a non-generic static class");
            method.isExtension = true;
            sym.hasExtensions = true;
        }
        if (mods.partial && !hasBody) {
            // The defining part of a partial method: the implementing part
            // gives the body; without one the calls do nothing.
            method.partialDefinition = true;
        }
        if (mods.partial) {
            var existing = (sym.members[member.name] || []).filter(function (other) {
                return other.symbolKind === 'method' && other.mods.partial &&
                    CS.signatureKey(other, null) === CS.signatureKey(method, null);
            });
            if (existing.length > 0) {
                var defined = existing[0];
                if (hasBody) {
                    defined.node = member;
                    defined.scope = scope;
                    defined.params = method.params;
                    defined.partialDefinition = false;
                }
                return;
            }
        }
        this.addMemberName(sym, member.name, member, method);
    };

    C.constructorMember = function (sym, member) {
        var mods = this.memberModifiers(sym, member);
        if (mods.static) {
            if (member.params.length > 0)
                this.error(member, 'CS0132', "'" + CS.symbolTypeName(sym) + "." + sym.name + "()': a static constructor must be parameterless");
            var cctor = CS.MethodSymbol('.cctor', sym, mods);
            cctor.isCtor = true;
            cctor.isStaticCtor = true;
            cctor.node = member;
            cctor.scope = sym.scope.child('method', { method: cctor });
            sym.staticCtor = cctor;
            return;
        }
        if (sym.kind === 'interface')
            this.error(member, 'CS0526', 'Interfaces cannot contain instance constructors');
        var ctor = CS.MethodSymbol('.ctor', sym, mods);
        ctor.isCtor = true;
        ctor.node = member;
        ctor.isStatic = false;
        ctor.scope = sym.scope.child('method', { method: ctor });
        ctor.params = this.parameters(member.params, ctor.scope, ctor);
        if (sym.primaryCtor && (member.initializer === null || member.initializer.kind !== 'this'))
            this.error(member, 'CS8862', 'A constructor declared in a type with parameter list must have \'this\' constructor initializer.');
        var key = CS.signatureKey(ctor, null);
        var self = this;
        sym.ctors.forEach(function (other) {
            if (CS.signatureKey(other, null) === key)
                self.error(member, 'CS0111', "Type '" + CS.symbolTypeName(sym) + "' already defines a member called '" + sym.name +
                           "' with the same parameter types");
        });
        sym.ctors.push(ctor);
        sym.hasExplicitCtor = true;
    };

    // class Point(int x, int y) and record Point(int X, int Y): the primary
    // constructor; in a class the parameters are captured by the members.
    C.primaryConstructor = function (sym, node) {
        var ctor = CS.MethodSymbol('.ctor', sym, { public: true });
        ctor.isCtor = true;
        ctor.isPrimary = true;
        ctor.node = node;
        ctor.scope = sym.scope.child('method', { method: ctor });
        ctor.params = this.parameters(node.params, ctor.scope, ctor);
        if (sym.mods.abstract)
            ctor.access = 'protected';
        sym.primaryCtor = ctor;
        sym.ctors.push(ctor);
        sym.hasExplicitCtor = true;
        if (!sym.isRecord) {
            // The parameters as hidden fields of the instance.
            var self = this;
            sym.primaryFields = Object.create(null);
            ctor.params.forEach(function (param) {
                var field = CS.FieldSymbol(param.name, param.type, sym, {});
                field.primaryParam = param;
                field.node = param.node;
                sym.primaryFields[param.name] = field;
                sym.fieldOrder.push(field);
                field.jsName = null;
            });
        }
    };

    // A class without constructors has a public parameterless one (protected
    // in an abstract class); a struct always has one.
    C.defaultConstructor = function (sym) {
        if (sym.kind === 'interface' || sym.kind === 'enum' || sym.kind === 'delegate' || sym.mods.static)
            return;
        if (sym.kind === 'struct') {
            var hasParameterless = sym.ctors.some(function (ctor) { return ctor.params.length === 0; });
            if (!hasParameterless) {
                var structCtor = CS.MethodSymbol('.ctor', sym, { public: true });
                structCtor.isCtor = true;
                structCtor.implicit = true;
                structCtor.isDefaultStruct = true;
                sym.ctors.push(structCtor);
            }
            return;
        }
        if (sym.ctors.length > 0)
            return;
        var ctor = CS.MethodSymbol('.ctor', sym, sym.mods.abstract ? { protected: true } : { public: true });
        ctor.isCtor = true;
        ctor.implicit = true;
        sym.ctors.push(ctor);
    };

    // { get; set; } = value, => expression, { get { ... } set { ... } }
    C.propertyMember = function (sym, member) {
        var mods = this.memberModifiers(sym, member);
        var type = this.resolveType(member.type, sym.scope);
        var property = CS.PropertySymbol(member.name, type, sym, mods);
        property.node = member;
        property.refReturn = !!member.type.refReturn;
        if (member.explicitIface !== null) {
            property.explicitIface = this.resolveType(member.explicitIface, sym.scope);
            property.access = 'private';
        }
        this.accessors(sym, property, member, []);
        this.addMemberName(sym, member.name, member, property);
    };

    C.indexerMember = function (sym, member) {
        var mods = this.memberModifiers(sym, member);
        var type = this.resolveType(member.type, sym.scope);
        var property = CS.PropertySymbol('this[]', type, sym, mods);
        property.isIndexer = true;
        property.node = member;
        var scope = sym.scope.child('method', { method: property });
        property.params = this.parameters(member.params, scope, property);
        if (member.explicitIface !== null) {
            property.explicitIface = this.resolveType(member.explicitIface, sym.scope);
            property.access = 'private';
        }
        this.accessors(sym, property, member, property.params);
        sym.addMember(property);
    };

    // The accessor methods of a property or an indexer; an auto-property
    // gets a backing field.
    C.accessors = function (sym, property, member, params) {
        var self = this;
        var mods = property.mods;
        var interfaceMember = sym.kind === 'interface';
        var baseName = property.isIndexer ? 'Item' : property.name;
        function accessor(kind, node) {
            var accessorMods = {};
            Object.keys(mods).forEach(function (key) { accessorMods[key] = mods[key]; });
            var accessMods = node !== null ? node.mods || {} : {};
            if (accessMods.private || accessMods.protected || accessMods.internal) {
                delete accessorMods.public;
                delete accessorMods.private;
                delete accessorMods.protected;
                delete accessorMods.internal;
                Object.keys(accessMods).forEach(function (key) { accessorMods[key] = accessMods[key]; });
            }
            var method = CS.MethodSymbol((kind === 'get' ? 'get_' : 'set_') + baseName, sym, accessorMods);
            method.accessorOf = property;
            if (self.library && kind === 'get' && CS.hasAttribute(member, 'V4Fiber'))
                method.fiber = true;
            method.isInit = kind === 'init';
            method.node = node;
            method.scope = sym.scope.child('method', { method: method });
            method.explicitIface = property.explicitIface;
            if (property.explicitIface)
                method.access = 'private';
            var accessorParams = params.map(function (param) {
                var copy = CS.ParamSymbol(param.name, param.type, param.refKind, param.index);
                copy.isParams = param.isParams;
                copy.hasDefault = param.hasDefault;
                copy.defaultNode = param.defaultNode;
                copy.defaultScope = param.defaultScope;
                copy.owner = method;
                return copy;
            });
            if (kind === 'get') {
                method.returnType = property.type;
                method.refReturn = property.refReturn;
                method.params = accessorParams;
            } else {
                var value = CS.ParamSymbol('value', property.type, '', params.length);
                value.owner = method;
                method.params = accessorParams.concat([value]);
                method.returnType = CS.VOID;
            }
            var bodiless = node === null ? (member.exprBody === null || member.exprBody === undefined) : (node.body === null && node.expr === null);
            if (interfaceMember && bodiless && (!mods.static || mods.abstract))
                method.isAbstract = true;
            else if (interfaceMember && (!mods.static || mods.virtual))
                method.isVirtual = true;
            return method;
        }
        if (member.exprBody !== null && member.exprBody !== undefined) {
            property.getter = accessor('get', null);
            property.getter.exprBody = member.exprBody;
            return;
        }
        var auto = !property.isIndexer && member.accessors.length > 0 && member.accessors.every(function (node) {
            return node.body === null && node.expr === null;
        }) && !mods.abstract && !mods.extern && !interfaceMember;
        var seen = {};
        member.accessors.forEach(function (node) {
            var kind = node.kind;
            if (seen[kind === 'init' ? 'set' : kind])
                self.error(node, 'CS1007', 'Property accessor already defined');
            seen[kind === 'init' ? 'set' : kind] = true;
            var method = accessor(kind, node);
            if (kind === 'get')
                property.getter = method;
            else
                property.setter = method;
            if (!auto && node.body === null && node.expr === null && !method.isAbstract && !mods.abstract && !mods.extern)
                self.error(node, 'CS0501', "'" + self.methodText(method) + "' must declare a body because it is not marked abstract, extern, or partial");
        });
        if (property.getter === null && property.setter === null)
            this.error(member, 'CS0548', "'" + property.name + "': property or indexer must have at least one accessor");
        if (auto) {
            property.isAuto = true;
            var field = CS.FieldSymbol('<' + property.name + '>k__BackingField', property.type, sym,
                                       { static: mods.static, readonly: property.setter === null || property.setter.isInit });
            field.backingOf = property;
            field.init = member.init;
            field.node = member;
            field.declNode = member;
            property.backingField = field;
            if (!field.isStatic)
                sym.fieldOrder.push(field);
            if (property.setter === null && member.init === null)
                property.getOnly = true;
        } else if (member.init !== null && member.init !== undefined) {
            this.error(member, 'CS8050', 'Only auto-implemented properties, or properties that use the \'field\' keyword, can have initializers.');
        }
    };

    C.eventMember = function (sym, member) {
        var self = this;
        var mods = this.memberModifiers(sym, member);
        var type = this.resolveType(member.type, sym.scope);
        if (!CS.isDelegate(type))
            this.error(member, 'CS0066', "'" + CS.symbolTypeName(sym) + '.' + (member.name || member.vars[0].name) +
                       "': event must be of a delegate type");
        var declare = function (name, node, init) {
            var event = CS.EventSymbol(name, type, sym, mods);
            event.node = node;
            ['add', 'remove'].forEach(function (kind) {
                var method = CS.MethodSymbol(kind + '_' + name, sym, mods);
                method.accessorOf = event;
                var value = CS.ParamSymbol('value', type, '', 0);
                value.owner = method;
                method.params = [value];
                method.scope = sym.scope.child('method', { method: method });
                if (sym.kind === 'interface' && !mods.static && member.k === 'eventField')
                    method.isAbstract = true;
                event[kind === 'add' ? 'adder' : 'remover'] = method;
            });
            if (member.k === 'eventField') {
                event.isFieldLike = sym.kind !== 'interface' && !mods.abstract;
                if (event.isFieldLike) {
                    event.adder.synthetic = 'eventAdd';
                    event.remover.synthetic = 'eventRemove';
                    var field = CS.FieldSymbol(name, type, sym, { static: mods.static });
                    field.backingOf = event;
                    field.init = init;
                    field.node = node;
                    event.backingField = field;
                    if (!field.isStatic)
                        sym.fieldOrder.push(field);
                }
            } else {
                if (member.add === null || member.remove === null)
                    self.error(member, 'CS0065', "'" + CS.symbolTypeName(sym) + '.' + name + "': event property must have both add and remove accessors");
                event.adder.node = member.add;
                event.remover.node = member.remove;
            }
            if (member.explicitIface) {
                event.explicitIface = self.resolveType(member.explicitIface, sym.scope);
                event.adder.explicitIface = event.explicitIface;
                event.remover.explicitIface = event.explicitIface;
            }
            self.addMemberName(sym, name, node, event);
        };
        if (member.k === 'eventField')
            member.vars.forEach(function (variable) { declare(variable.name, variable, variable.init); });
        else
            declare(member.name, member, null);
    };

    C.operatorMember = function (sym, member) {
        var mods = member.mods || {};
        var arity = member.params.length;
        var table = arity === 1 ? OPERATOR_NAMES.unary : OPERATOR_NAMES.binary;
        var name = table[member.op];
        if (name === undefined || arity > 2 || arity === 0)
            this.error(member, arity === 1 ? 'CS1019' : 'CS1020', arity === 1 ? 'Overloadable unary operator expected'
                                                                             : 'Overloadable binary operator expected');
        var inInterface = sym.kind === 'interface';
        if (!(mods.public || inInterface) || !mods.static)
            this.error(member, 'CS0558', "User-defined operator '" + CS.symbolTypeName(sym) + '.operator ' + member.op + '(' +
                       ')\' must be declared static and public');
        var method = CS.MethodSymbol(name, sym, mods);
        method.isOperator = true;
        // static abstract and static virtual operators of interfaces (generic math).
        if (inInterface) {
            method.access = 'public';
            if (member.body === null && member.expr === null)
                method.isAbstract = true;
            else if (mods.virtual)
                method.isVirtual = true;
        }
        method.node = member;
        method.scope = sym.scope.child('method', { method: method });
        method.returnType = this.resolveType(member.returnType, method.scope);
        method.params = this.parameters(member.params, method.scope, method);
        var selfType = CS.selfType(sym);
        // In an interface a type parameter of it stands for the type (TSelf).
        var involves = method.params.some(function (param) {
            var type = CS.underlyingNullable(param.type);
            return CS.sameType(type, selfType) || (inInterface && type.kind === 'tparam' && type.sym.owner === sym);
        });
        if (!involves)
            this.error(member, arity === 1 ? 'CS0562' : 'CS0563', arity === 1
                ? 'The parameter of a unary operator must be the containing type'
                : 'One of the parameters of a binary operator must be the containing type');
        sym.addMember(method);
    };

    C.conversionMember = function (sym, member) {
        var mods = member.mods || {};
        var name = member.implicit ? 'op_Implicit' : 'op_Explicit';
        var method = CS.MethodSymbol(name, sym, mods);
        method.isConversion = true;
        method.isOperator = true;
        method.node = member;
        method.scope = sym.scope.child('method', { method: method });
        method.returnType = this.resolveType(member.type, method.scope);
        method.params = this.parameters(member.params, method.scope, method);
        if (method.params.length !== 1)
            this.error(member, 'CS1019', 'Overloadable unary operator expected');
        var selfType = CS.selfType(sym);
        if (!CS.sameType(CS.underlyingNullable(method.returnType), selfType) &&
            !CS.sameType(CS.underlyingNullable(method.params[0].type), selfType))
            this.error(member, 'CS0556', 'User-defined conversion must convert to or from the enclosing type');
        sym.addMember(method);
    };

    C.checkOperatorPairs = function (sym) {
        var self = this;
        Object.keys(PAIRS).forEach(function (name) {
            var list = sym.members[name];
            if (list === undefined)
                return;
            var partner = sym.members[PAIRS[name]];
            if (partner === undefined) {
                var method = list[0];
                if (method.synthetic)
                    return;
                self.error(method.node, 'CS0216', "The operator '" + CS.symbolTypeName(sym) + '.operator ' + PAIR_TEXT[name] + '(' +
                           method.params.map(function (param) { return CS.typeName(param.type); }).join(', ') +
                           ")' requires a matching operator '" + PAIR_TEXT[PAIRS[name]] + "' to also be defined");
            }
        });
    };

    // --- Enums and delegates

    C.enumMembers = function (sym, node) {
        var self = this;
        var type = CS.selfType(sym);
        sym.enumMembers = [];
        node.members.forEach(function (member) {
            var field = CS.FieldSymbol(member.name, type, sym, { public: true, const: true, static: true });
            field.node = member;
            field.init = member.value;
            field.constantPending = true;
            field.enumMember = true;
            self.addMemberName(sym, member.name, member, field);
            sym.enumMembers.push(field);
        });
        sym.isFlags = sym.attributes.some(function (attribute) {
            return attribute.name === 'Flags' || attribute.name === 'FlagsAttribute' || attribute.name === 'System.Flags';
        });
    };

    // The value of every member: the given constant or the previous plus one.
    C.enumValues = function (sym) {
        if (sym.enumValuesDone)
            return;
        sym.enumValuesDone = true;
        var previous = null;
        var self = this;
        sym.enumMembers.forEach(function (field) {
            if (field.init !== null) {
                self.constantOf(field);
            } else if (field.constantPending) {
                field.constantPending = false;
                field.constant = previous === null ? 0 : T.big.add(previous, 1);
                if (!CS.Conversions.constantFits(field.constant, sym.enumUnderlying))
                    self.error(field.node, 'CS0543', "'" + CS.symbolTypeName(sym) + '.' + field.name +
                               "': the enumerator value is too large to fit in its type");
            }
            previous = field.constant;
        });
    };

    C.delegateMembers = function (sym, node) {
        var invoke = CS.MethodSymbol('Invoke', sym, { public: true, virtual: true });
        var scope = this.methodScope(invoke, sym.scope, []);
        invoke.returnType = this.resolveType(node.returnType, scope, { allowVoid: true });
        invoke.refReturn = !!node.returnType.refReturn;
        invoke.params = this.parameters(node.params, scope, invoke);
        invoke.isDelegateInvoke = true;
        invoke.isExtern = true;
        sym.addMember(invoke);
        sym.invoke = invoke;
        this.declareConstraints(sym.typeParams, node.constraints || [], sym.scope, sym);
    };

    // The Invoke method of a delegate type, substituted.
    CS.delegateInvoke = function (type) {
        var sym = type.sym.complete();
        var invoke = sym.invoke;
        var map = CS.typeMap(type);
        return {
            method: invoke,
            params: invoke.params.map(function (param) { return CS.subst(param.type, map); }),
            refKinds: invoke.params.map(function (param) { return param.refKind; }),
            returnType: CS.subst(invoke.returnType, map)
        };
    };

    // --- Records

    // The members a record gets: properties of the positional parameters,
    // Deconstruct, value equality, ToString, the copy for "with".
    C.recordMembers = function (sym, node) {
        var isStruct = sym.kind === 'struct';
        var selfType = CS.selfType(sym);
        sym.recordProperties = [];
        if (sym.primaryCtor) {
            sym.primaryCtor.params.forEach(function (param) {
                var existing = sym.members[param.name];
                if (existing !== undefined) {
                    // A member declared by hand: the parameter initializes it.
                    param.recordMember = existing[0];
                    return;
                }
                var readonly = !isStruct || sym.mods.readonly;
                var property = CS.PropertySymbol(param.name, param.type, sym, { public: true });
                property.node = param.node;
                property.isAuto = true;
                property.recordParam = param;
                ['get', 'set'].forEach(function (kind) {
                    var method = CS.MethodSymbol((kind === 'get' ? 'get_' : 'set_') + param.name, sym, { public: true });
                    method.accessorOf = property;
                    method.scope = sym.scope.child('method', { method: method });
                    if (kind === 'get') {
                        method.returnType = param.type;
                        property.getter = method;
                    } else {
                        var value = CS.ParamSymbol('value', param.type, '', 0);
                        value.owner = method;
                        method.params = [value];
                        method.isInit = readonly;
                        property.setter = method;
                    }
                });
                var field = CS.FieldSymbol('<' + param.name + '>k__BackingField', param.type, sym, { readonly: readonly });
                field.backingOf = property;
                field.init = null;
                field.node = param.node;
                property.backingField = field;
                sym.fieldOrder.push(field);
                param.recordMember = property;
                sym.addMember(property);
                sym.recordProperties.push(property);
            });
            // Deconstruct(out T1 P1, ...).
            if (sym.members.Deconstruct === undefined) {
                var deconstruct = CS.MethodSymbol('Deconstruct', sym, { public: true });
                deconstruct.params = sym.primaryCtor.params.map(function (param, index) {
                    var out = CS.ParamSymbol(param.name, param.type, 'out', index);
                    out.owner = deconstruct;
                    return out;
                });
                deconstruct.synthetic = 'recordDeconstruct';
                deconstruct.scope = sym.scope.child('method', { method: deconstruct });
                sym.addMember(deconstruct);
            }
        }
        function synthesize(name, mods, params, returnType, kind) {
            var existing = (sym.members[name] || []).filter(function (member) {
                return member.symbolKind === 'method' && member.params.length === params.length &&
                    member.params.every(function (param, index) { return CS.sameType(param.type, params[index]); });
            });
            if (existing.length > 0)
                return existing[0];
            var method = CS.MethodSymbol(name, sym, mods);
            method.params = params.map(function (type, index) {
                var param = CS.ParamSymbol(index === 0 ? (name === 'Equals' ? 'other' : 'builder') : 'p' + index, type, '', index);
                param.owner = method;
                return param;
            });
            method.returnType = returnType;
            method.synthetic = kind;
            method.scope = sym.scope.child('method', { method: method });
            sym.addMember(method);
            return method;
        }
        var bool = CS.boolType();
        var objectType = CS.objectType();
        var sealedOrStruct = isStruct || sym.mods.sealed;
        synthesize('ToString', { public: true, override: true }, [], CS.stringType(), 'recordToString');
        synthesize('PrintMembers', sealedOrStruct ? { private: true } : { protected: true, virtual: !sym.baseType.sym.isRecord,
                                                                          override: sym.baseType.sym.isRecord },
                   [CS.libraryType('System.Text.StringBuilder')], bool, 'recordPrintMembers');
        synthesize('Equals', { public: true, override: true }, [objectType], bool, 'recordEqualsObject');
        synthesize('Equals', { public: true, virtual: !sealedOrStruct }, [selfType], bool, 'recordEquals');
        synthesize('GetHashCode', { public: true, override: true }, [], CS.intType(), 'recordHashCode');
        var equality = synthesize('op_Equality', { public: true, static: true }, [selfType, selfType], bool, 'recordOpEquality');
        equality.isOperator = true;
        var inequality = synthesize('op_Inequality', { public: true, static: true }, [selfType, selfType], bool, 'recordOpInequality');
        inequality.isOperator = true;
        if (!isStruct) {
            var clone = CS.MethodSymbol('<Clone>$', sym, { public: true, virtual: !sym.baseType.sym.isRecord,
                                                          override: sym.baseType.sym.isRecord });
            clone.returnType = selfType;
            clone.synthetic = 'recordClone';
            clone.scope = sym.scope.child('method', { method: clone });
            sym.addMember(clone);
            // The copy constructor.
            if (!sym.ctors.some(function (ctor) {
                return ctor.params.length === 1 && CS.sameType(ctor.params[0].type, selfType);
            })) {
                var copy = CS.MethodSymbol('.ctor', sym, { protected: true });
                copy.isCtor = true;
                copy.synthetic = 'recordCopy';
                var original = CS.ParamSymbol('original', selfType, '', 0);
                original.owner = copy;
                copy.params = [original];
                copy.scope = sym.scope.child('method', { method: copy });
                sym.ctors.push(copy);
            }
        }
    };

    // --- Overrides and interfaces

    // An override finds the member it overrides in the base classes.
    C.linkOverrides = function (sym) {
        if (sym.kind !== 'class' && sym.kind !== 'struct')
            return;
        var self = this;
        sym.memberList.forEach(function (member) {
            if (member.symbolKind === 'method' && member.accessorOf === null)
                self.linkMethodOverride(sym, member);
            else if (member.symbolKind === 'property' || member.symbolKind === 'event')
                self.linkPropertyOverride(sym, member);
        });
        // Abstract members of the bases must be overridden in a concrete class.
        if (sym.kind === 'class' && !sym.mods.abstract && sym.baseType !== null)
            this.checkAbstractsImplemented(sym);
    };

    C.linkMethodOverride = function (sym, method) {
        if (!method.isOverride) {
            // A method that hides a base method: new is allowed, otherwise a warning only.
            return;
        }
        var base = sym.baseType;
        var map = null;
        var key = CS.signatureKey(method, null);
        while (base !== null) {
            var baseSym = base.sym.complete();
            map = CS.typeMap(base);
            var candidates = (baseSym.members[method.name] || []).filter(function (candidate) {
                return candidate.symbolKind === 'method' && CS.signatureKey(candidate, map) === key;
            });
            if (candidates.length > 0) {
                var target = candidates[0];
                if (!target.isVirtual && !target.isAbstract && !target.isOverride)
                    this.error(method.node, 'CS0506', "'" + this.methodText(method) + "': cannot override inherited member '" +
                               this.methodText(target) + "' because it is not marked virtual, abstract, or override");
                if (target.isSealed)
                    this.error(method.node, 'CS0239', "'" + this.methodText(method) + "': cannot override inherited member '" +
                               this.methodText(target) + "' because it is sealed");
                var returnType = CS.subst(target.returnType, map);
                if (!CS.sameType(returnType, method.returnType) &&
                    !(CS.isReferenceType(returnType) && CS.Conversions.isImplicitReferenceOrBoxingOrIdentity(method.returnType, returnType)))
                    this.error(method.node, 'CS0508', "'" + this.methodText(method) + "': return type must be '" +
                               CS.typeName(returnType) + "' to match overridden member '" + this.methodText(target) + "'");
                method.overridden = target;
                return;
            }
            base = CS.baseTypeOf(base);
        }
        this.error(method.node, 'CS0115', "'" + this.methodText(method) + "': no suitable method found to override");
    };

    C.linkPropertyOverride = function (sym, property) {
        if (!property.isOverride)
            return;
        var base = sym.baseType;
        while (base !== null) {
            var baseSym = base.sym.complete();
            var candidates = (baseSym.members[property.name] || []).filter(function (candidate) {
                return candidate.symbolKind === property.symbolKind && candidate.isIndexer === property.isIndexer;
            });
            if (candidates.length > 0) {
                var target = candidates[0];
                if (!target.isVirtual && !target.isAbstract && !target.isOverride)
                    this.error(property.node, 'CS0506', "'" + CS.symbolTypeName(sym) + '.' + property.name +
                               "': cannot override inherited member '" + CS.symbolTypeName(target.owner) + '.' + target.name +
                               "' because it is not marked virtual, abstract, or override");
                property.overridden = target;
                var pairs = property.symbolKind === 'event' ? [['adder', 'adder'], ['remover', 'remover']]
                                                            : [['getter', 'getter'], ['setter', 'setter']];
                pairs.forEach(function (pair) {
                    if (property[pair[0]] !== null && property[pair[0]] !== undefined) {
                        var overridden = findAccessor(target, pair[1]);
                        property[pair[0]].isOverride = true;
                        property[pair[0]].overridden = overridden;
                    }
                });
                return;
            }
            base = CS.baseTypeOf(base);
        }
        this.error(property.node, 'CS0115', "'" + CS.symbolTypeName(sym) + '.' + property.name + "': no suitable method found to override");
    };

    // The accessor of a property up the chain of overrides.
    function findAccessor(property, kind) {
        for (var current = property; current !== null && current !== undefined; current = current.overridden) {
            if (current[kind] !== null && current[kind] !== undefined)
                return current[kind];
        }
        return null;
    }

    // A concrete class overrides all abstract members of its bases.
    C.checkAbstractsImplemented = function (sym) {
        var overridden = [];
        var chain = CS.classChain(CS.selfType(sym));
        var self = this;
        chain.forEach(function (type) {
            var current = type.sym.complete();
            current.memberList.forEach(function (member) {
                var methods = [];
                if (member.symbolKind === 'method' && member.accessorOf === null)
                    methods.push(member);
                else if (member.symbolKind === 'property')
                    methods = [member.getter, member.setter].filter(function (item) { return item !== null; });
                else if (member.symbolKind === 'event')
                    methods = [member.adder, member.remover];
                methods.forEach(function (method) {
                    if (method.overridden)
                        overridden.push(method.overridden);
                    if (method.isAbstract && overridden.indexOf(method) < 0 && type.sym !== sym) {
                        var text = method.accessorOf
                            ? CS.symbolTypeName(method.owner) + '.' + (method.accessorOf.isIndexer ? 'this[]' : method.accessorOf.name) +
                              '.' + method.name.substring(0, 3)
                            : self.methodText(method);
                        self.error(sym.node, 'CS0534', "'" + CS.symbolTypeName(sym) + "' does not implement inherited abstract member '" +
                                   text + "'");
                    }
                });
            });
        });
    };

    // The implementation of every interface member: an explicit one, a
    // public member with the same signature in the type or its bases, or a
    // default method of the interface. sym.interfaceMap: [{ iface,
    // member (of the interface), impl }].
    C.implementInterfaces = function (sym) {
        var self = this;
        var selfType = CS.selfType(sym);
        sym.interfaceMap = [];
        CS.interfacesOf(selfType).forEach(function (iface) {
            var ifaceSym = iface.sym.complete();
            var map = CS.typeMap(iface);
            ifaceSym.memberList.forEach(function (member) {
                var methods = [];
                if (member.symbolKind === 'method' && member.accessorOf === null)
                    methods.push(member);
                else if (member.symbolKind === 'property')
                    methods = [member.getter, member.setter].filter(function (item) { return item !== null; });
                else if (member.symbolKind === 'event')
                    methods = [member.adder, member.remover];
                // Static members of interfaces: generic math, natives for the predefined types.
                var nativeStatics = sym.library && sym.special !== undefined;
                methods = methods.filter(function (method) {
                    return !method.isStatic || (!nativeStatics && (method.isAbstract || method.isVirtual));
                });
                if (methods.length > 0 && methods[0].isStatic && sym.kind === 'interface')
                    return;
                methods.forEach(function (method) {
                    var impl = self.findImplementation(sym, iface, method, map);
                    if (impl === null) {
                        if (!method.isAbstract)
                            return;
                        var text = method.accessorOf
                            ? CS.typeName(iface) + '.' + (method.accessorOf.isIndexer ? 'this[' +
                              method.accessorOf.params.map(function (param) { return CS.typeName(CS.subst(param.type, map)); }).join(', ') + ']'
                              : method.accessorOf.name) + (method.accessorOf.symbolKind === 'event' ? '' : '.' + method.name.substring(0, 3))
                            : CS.typeName(iface) + '.' + method.name + '(' + method.params.map(function (param) {
                                return CS.typeName(CS.subst(param.type, map));
                            }).join(', ') + ')';
                        self.error(sym.node, 'CS0535', "'" + CS.symbolTypeName(sym) + "' does not implement interface member '" + text + "'");
                    }
                    sym.interfaceMap.push({ iface: iface, member: method, impl: impl });
                });
            });
        });
    };

    C.findImplementation = function (sym, iface, method, map) {
        var key = CS.signatureKey(method, map);
        var isAccessor = method.accessorOf !== null;
        var name = method.name;
        // Explicit implementations in the type and its bases first.
        var chain = CS.classChain(CS.selfType(sym));
        for (var index = 0; index < chain.length; ++index) {
            var current = chain[index].sym.complete();
            var typeMap = CS.typeMap(chain[index]);
            var list = isAccessor ? accessorsNamed(current, name) : (current.members[name] || []);
            for (var listIndex = 0; listIndex < list.length; ++listIndex) {
                var candidate = list[listIndex];
                if (candidate.symbolKind !== 'method' || !candidate.explicitIface || candidate.isStatic !== method.isStatic)
                    continue;
                var explicitType = CS.subst(candidate.explicitIface, typeMap);
                if (explicitType.sym === iface.sym && CS.signatureKey(candidate, typeMap) === key)
                    return candidate;
            }
        }
        for (var chainIndex = 0; chainIndex < chain.length; ++chainIndex) {
            var type = chain[chainIndex].sym.complete();
            var memberMap = CS.typeMap(chain[chainIndex]);
            var members = isAccessor ? accessorsNamed(type, name) : (type.members[name] || []);
            for (var memberIndex = 0; memberIndex < members.length; ++memberIndex) {
                var member = members[memberIndex];
                if (member.symbolKind !== 'method' || member.explicitIface || member.isStatic !== method.isStatic)
                    continue;
                if (member.access !== 'public' && !(member.accessorOf && member.accessorOf.access === 'public'))
                    continue;
                if (CS.signatureKey(member, memberMap) === key)
                    return member;
            }
        }
        if (!method.isAbstract)
            return null;
        return null;
    };

    function accessorsNamed(sym, name) {
        var result = [];
        sym.memberList.forEach(function (member) {
            if (member.symbolKind === 'property' || member.symbolKind === 'event') {
                [member.getter, member.setter, member.adder, member.remover].forEach(function (accessor) {
                    if (accessor !== null && accessor !== undefined && accessor.name === name)
                        result.push(accessor);
                });
            }
        });
        return result;
    }

    // --- JavaScript names

    // The short text of a type for the names of overloads: Int32, List_String.
    function signaturePart(type) {
        switch (type.kind) {
        case 'named':
            return type.sym.name + (type.args.length > 0 ? '_' + type.args.map(signaturePart).join('_') : '');
        case 'array':
            return signaturePart(type.elem) + 'Arr';
        case 'tparam':
            return type.sym.name;
        case 'dynamic':
            return 'Object';
        }
        return 'X';
    }

    // The names used by the members of the base classes.
    function baseNames(sym, field) {
        var names = Object.create(null);
        var base = sym.baseType;
        while (base !== null) {
            var baseSym = base.sym.complete();
            var used = field ? baseSym.usedFieldNames : baseSym.usedMethodNames;
            if (used !== undefined)
                Object.keys(used).forEach(function (name) { names[name] = true; });
            base = baseSym.baseType;
        }
        return names;
    }

    // Methods: Name$arity, with the parameter types when that clashes; an
    // override takes the name of the overridden method, a member of an
    // interface the name of the interface. Fields: the name, unique along
    // the chain of classes; statics: s$Name.
    C.assignJsNames = function (sym) {
        var inherited = baseNames(sym, false);
        var inheritedFields = baseNames(sym, true);
        sym.usedMethodNames = Object.create(null);
        sym.usedFieldNames = Object.create(null);
        var used = sym.usedMethodNames;
        var fields = sym.usedFieldNames;
        var interfacePrefix = sym.kind === 'interface' ? sym.jsId + '$' : '';
        var methods = [];
        sym.memberList.forEach(function (member) {
            if (member.symbolKind === 'method')
                methods.push(member);
            else if (member.symbolKind === 'property')
                [member.getter, member.setter].forEach(function (method) { if (method !== null) methods.push(method); });
            else if (member.symbolKind === 'event')
                [member.adder, member.remover].forEach(function (method) { methods.push(method); });
        });
        // Groups of the same name and arity decide whether types are needed.
        var groups = Object.create(null);
        methods.forEach(function (method) {
            if (method.isOverride || method.explicitIface)
                return;
            var key = (method.isStatic ? 's:' : '') + method.name + '$' + method.params.length;
            groups[key] = (groups[key] || 0) + 1;
        });
        methods.forEach(function (method) {
            if (method.isOverride && method.overridden) {
                method.jsName = method.overridden.jsName;
                return;
            }
            if (method.explicitIface) {
                // Filled in implementInterfaces: the name of the interface member.
                method.jsName = '$explicit$' + method.name + '$' + method.id;
                return;
            }
            var base = interfacePrefix + T.propertyName(method.name).replace(/[^A-Za-z0-9_$]/g, '_') + '$' + method.params.length;
            var key = (method.isStatic ? 's:' : '') + method.name + '$' + method.params.length;
            var name = base;
            if (groups[key] > 1 || used[name] || (!method.isStatic && inherited[name])) {
                name = base + '$' + method.params.map(function (param) { return signaturePart(param.type); }).join('$');
                if (method.typeParams.length > 0)
                    name += '$' + method.typeParams.length;
            }
            if (used[name] || (!method.isStatic && inherited[name]))
                name += '$' + method.id;
            used[name] = true;
            method.jsName = name;
        });
        sym.memberList.forEach(function (member) {
            if (member.symbolKind === 'property' && member.overridden)
                member.jsName = member.overridden.jsName;
            else if (member.symbolKind === 'property' || member.symbolKind === 'event')
                member.jsName = member.name;
        });
        // Fields (with the backing fields of auto-properties and events).
        var allFields = [];
        sym.memberList.forEach(function (member) {
            if (member.symbolKind === 'field')
                allFields.push(member);
            else if (member.backingField)
                allFields.push(member.backingField);
        });
        if (sym.primaryFields)
            Object.keys(sym.primaryFields).forEach(function (name) { allFields.push(sym.primaryFields[name]); });
        allFields.forEach(function (field) {
            var plain = field.backingOf ? field.backingOf.name : field.name;
            if (field.primaryParam)
                plain = '<' + plain + '>P';
            plain = T.propertyName(plain.replace(/[<>]/g, '_'));
            if (field.isStatic) {
                field.jsName = 's$' + plain;
                return;
            }
            var name = plain;
            if (fields[name] || inheritedFields[name] || /\$/.test(name))
                name = 'f' + sym.id + '$' + plain;
            fields[name] = true;
            field.jsName = name;
        });
        // Constructors: $ctor$arity with types on clashes.
        var ctorGroups = Object.create(null);
        sym.ctors.forEach(function (ctor) {
            ctorGroups[ctor.params.length] = (ctorGroups[ctor.params.length] || 0) + 1;
        });
        var ctorNames = Object.create(null);
        sym.ctors.forEach(function (ctor) {
            var name = '$ctor$' + ctor.params.length;
            if (ctorGroups[ctor.params.length] > 1)
                name += '$' + ctor.params.map(function (param) { return signaturePart(param.type); }).join('$');
            if (ctorNames[name])
                name += '$' + ctor.id;
            ctorNames[name] = true;
            ctor.jsName = name;
        });
        if (sym.staticCtor !== null)
            sym.staticCtor.jsName = '$cctor';
    };

    // The names of interface members on the class: the explicit
    // implementations take the names of the interface members.
    var baseImplementInterfaces = C.implementInterfaces;
    C.implementInterfaces = function (sym) {
        baseImplementInterfaces.call(this, sym);
        sym.interfaceMap.forEach(function (entry) {
            if (entry.impl !== null && entry.impl.explicitIface && entry.impl.owner === sym)
                entry.impl.jsName = entry.member.jsName;
        });
    };
})(globalThis);
