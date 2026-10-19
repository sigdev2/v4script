// Pascal: classes and objects. A class is a JavaScript constructor: K.$init
// sets the instance fields, the methods are on the prototype (virtual
// ones in one slot along the chain of overrides, static ones in a slot of
// their class), class methods and class vars are on K itself.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    var Compiler = Pascal.Compiler;
    if (Compiler.prototype.classType)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var Value = Pascal.Value;
    var PropRef = Pascal.PropRef;

    var classCounter = 0;

    // --- Declaration

    Compiler.prototype.classType = function (node, declared) {
        var isObject = node.kind === 'object';
        var name = declared ? declared.text : 'class';
        var type = new Pascal.Type('class', {
            name: name, isObject: isObject, parent: null, fields: [], fieldMap: Object.create(null),
            methods: Object.create(null), properties: Object.create(null), defaultProperty: null,
            constants: Object.create(null), forward: false, complete: false, serial: ++classCounter,
            js: null, localJs: null, size: 8, unit: this.unit, compiler: this
        });
        type.js = this.prefix + 'c$' + (declared ? declared.name : 'anon' + type.serial);
        if (node.forward) {
            type.forward = true;
            type.forwardNode = node;
            return type;
        }
        this.completeClass(type, node, declared);
        return type;
    };

    Compiler.prototype.completeClass = function (type, node, declared) {
        var self = this;
        type.forward = false;
        if (node.parent !== null) {
            var parent = this.resolveType(node.parent);
            if (parent.kind !== 'class' || parent.isObject !== type.isObject)
                this.error(type.isObject ? 'Object type expected' : 'Class type expected', node.parent);
            if (parent.forward)
                this.error('Forward type not resolved "' + parent.name + '"', node.parent);
            if (parent === type)
                this.error('Illegal recursive class definition', node.parent);
            type.parent = parent;
        } else if (!type.isObject) {
            type.parent = this.session.tobject;
        }
        if (node.interfaces.length > 0)
            this.error('interfaces are not supported yet', node.interfaces[0]);
        type.isAbstract = node.isAbstract;
        type.localJs = '$k' + type.serial;
        // The JavaScript names of fields differ from the fields of the ancestors.
        type.usedFieldJs = Object.create(null);
        if (type.parent !== null && type.parent !== undefined)
            Object.keys(type.parent.usedFieldJs || {}).forEach(function (key) { type.usedFieldJs[key] = true; });
        type.ownMethods = [];
        // The class name is visible to its members at once (fields of type TFoo, TFoo.Create).
        var classScope = new Pascal.Scope('classdecl', this.scope, type);
        var saved = this.scope;
        this.scope = classScope;
        if (declared)
            classScope.define(declared.name, { kind: 'type', name: declared.name, text: declared.text, type: type });
        try {
            node.members.forEach(function (member) {
                switch (member.k) {
                case 'field':
                    self.addClassField(type, member.field);
                    return;
                case 'method':
                    self.addClassMethod(type, member.heading, member.visibility);
                    return;
                case 'property':
                    self.addClassProperty(type, member);
                    return;
                case 'consts':
                    member.section.list.forEach(function (item) {
                        var value = self.constExpr(item.value);
                        type.constants[item.name] = { kind: 'const', name: item.name, text: item.text, type: value.type, value: value.constant };
                        classScope.define(item.name, type.constants[item.name]);
                    });
                    return;
                case 'types':
                    member.section.list.forEach(function (item) {
                        var nested = self.resolveType(item.typeNode, item);
                        if (!nested.name)
                            nested.name = item.text;
                        type.constants[item.name] = { kind: 'type', name: item.name, text: item.text, type: nested };
                        classScope.define(item.name, type.constants[item.name]);
                    });
                    return;
                }
            });
        } finally {
            this.scope = saved;
        }
        type.complete = true;
        this.classes.push(type);
        this.newTypes.push(type);
        return type;
    };

    Compiler.prototype.addClassField = function (type, declaration) {
        var self = this;
        var fieldType = this.resolveType(declaration.typeNode);
        declaration.names.forEach(function (name) {
            if (type.fieldMap[name.name] !== undefined || type.methods[name.name] !== undefined)
                self.error('Duplicate identifier "' + name.text + '"', name);
            var js = (declaration.classVar ? 'cv$' : '') + T.propertyName(name.name);
            while (type.usedFieldJs[js] !== undefined)
                js += '$';
            type.usedFieldJs[js] = true;
            var field = { kind: 'field', name: name.name, text: name.text, type: fieldType, js: js, owner: type,
                          classVar: !!declaration.classVar, visibility: declaration.visibility };
            type.fields.push(field);
            type.fieldMap[name.name] = field;
        });
    };

    Compiler.prototype.addClassMethod = function (type, heading, visibility) {
        var proc = this.makeProc(heading, type);
        proc.visibility = visibility;
        proc.signature = this.signatureText(proc);
        var own = type.methods[heading.name] || [];
        own.forEach(function (existing) {
            if (Pascal.sameParams(existing, proc))
                throw new T.CompileError('Duplicate identifier "' + heading.text + '"', heading.line, heading.column, heading.source);
        });
        if (heading.kind === 'destructor' && heading.name === 'destroy' && !proc.override && !proc.virtual && type.parent)
            proc.hidesDestroy = true;
        // The slot: an override takes the slot of the ancestor, a new
        // virtual one gets its own, a static one its own in the class.
        var inherited = type.parent ? this.findMethodInClass(type.parent, heading.name) : null;
        var base = null;
        if (inherited !== null) {
            inherited.forEach(function (candidate) {
                if (base === null && (candidate.virtual || candidate.override) && Pascal.sameParams(candidate, proc))
                    base = candidate;
            });
        }
        // In an object (TP) a repeated virtual overrides the method of the ancestor.
        if (type.isObject && proc.virtual && base !== null)
            proc.override = true;
        if (proc.override) {
            if (base === null)
                this.error('There is no method in an ancestor class to be overridden: "' + this.methodTitle(type, proc) + '"', heading);
            if (!types.equal(base.result || t.void, proc.result || t.void) && base.result !== proc.result)
                this.error('Function result types do not match', heading);
            proc.slot = base.slot;
            proc.virtual = true;
            proc.overridden = base;
            proc.classMethod = base.classMethod;
        } else {
            var slotBase = 'm$' + heading.name;
            if (proc.virtual)
                proc.slot = slotBase + '$v' + type.serial + (own.length > 0 ? '$' + own.length : '');
            else
                proc.slot = slotBase + '$' + type.serial + (own.length > 0 ? '$' + own.length : '');
        }
        if (proc.abstract && !proc.virtual)
            this.error('Abstract methods should be virtual', heading);
        proc.defined = proc.abstract || !!heading.directives.external;
        if (heading.directives.external) {
            proc.native = this.session.findMethodNative(this.unit, type, proc);
            if (proc.native === null)
                this.error('External method "' + this.methodTitle(type, proc) + '" is not available', heading);
        }
        own.push(proc);
        type.methods[heading.name] = own;
        type.ownMethods.push(proc);
        return proc;
    };

    Compiler.prototype.methodTitle = function (type, proc) {
        return (proc.kind === 'function' ? 'function ' : (proc.kind === 'procedure' ? 'procedure ' : proc.kind + ' ')) +
            type.name + '.' + proc.text + '(' + proc.params.map(function (param) { return types.display(param.type); }).join(';') + ')' +
            (proc.result ? ':' + types.display(proc.result) : '') + ';';
    };

    Compiler.prototype.addClassProperty = function (type, node) {
        var self = this;
        var params = this.resolveParams(node.params);
        var propertyType;
        if (node.typeNode === null) {
            // A redeclared property of an ancestor (to raise the visibility).
            var inherited = type.parent ? this.findMember(type.parent, node.name) : null;
            if (inherited === null || inherited.kind !== 'property')
                this.error('Property type expected', node);
            type.properties[node.name] = inherited.property;
            return;
        }
        propertyType = this.resolveType(node.typeNode);
        var property = { kind: 'property', name: node.name, text: node.text, type: propertyType, params: params,
                         read: null, write: null, index: null, owner: type, classProperty: node.classProperty };
        if (node.index !== null) {
            var index = this.constExpr(node.index);
            property.index = index;
        }
        if (node.read !== null)
            property.read = this.propertyAccessor(type, node.read, property, false, node);
        if (node.write !== null)
            property.write = this.propertyAccessor(type, node.write, property, true, node);
        if (node.read === null && node.write === null)
            this.error('Illegal symbol for property access', node);
        type.properties[node.name] = property;
        if (node.isDefault) {
            if (params.length === 0)
                this.error('Only array properties can be default', node);
            type.defaultProperty = property;
        }
        void self;
    };

    // read/write of a property: a field (a field of a field too) or a method.
    Compiler.prototype.propertyAccessor = function (type, accessor, property, write, node) {
        if (accessor.k !== 'name') {
            // FPoint.X, FArr[2] - a path from a field.
            return { kind: 'path', node: accessor };
        }
        var member = this.findMember(type, accessor.name);
        if (member === null)
            this.error('Unknown class field or method identifier "' + accessor.text + '"', accessor);
        if (member.kind === 'field') {
            if (property.params.length > 0)
                this.error('Illegal symbol for property access', accessor);
            if (!types.equal(member.field.type, property.type) && member.field.type !== property.type)
                this.error('Illegal symbol for property access', accessor);
            return { kind: 'field', field: member.field };
        }
        if (member.kind === 'method') {
            var count = property.params.length + (property.index !== null ? 1 : 0) + (write ? 1 : 0);
            var found = null;
            member.procs.forEach(function (proc) {
                if (found === null && proc.params.length === count && (write ? proc.result === null : proc.result !== null))
                    found = proc;
            });
            if (found === null)
                this.error('Illegal symbol for property access', accessor);
            return { kind: 'method', proc: found };
        }
        this.error('Illegal symbol for property access', accessor);
        void node;
    };

    // --- Member lookup

    Compiler.prototype.findMethodInClass = function (type, name) {
        for (var owner = type; owner !== null && owner !== undefined; owner = owner.parent) {
            if (owner.methods[name] !== undefined)
                return owner.methods[name];
        }
        return null;
    };

    // A member of a class with its ancestors: { kind: 'field' | 'method' | 'property' | 'const' | 'type' }.
    Compiler.prototype.findMember = function (type, name) {
        for (var owner = type; owner !== null && owner !== undefined; owner = owner.parent) {
            if (owner.fieldMap[name] !== undefined)
                return { kind: 'field', field: owner.fieldMap[name], owner: owner };
            if (owner.properties[name] !== undefined)
                return { kind: 'property', property: owner.properties[name], owner: owner };
            if (owner.methods[name] !== undefined) {
                // Overloads along the whole chain (overload).
                var procs = owner.methods[name].slice();
                var overload = procs.some(function (proc) { return proc.overload; });
                if (overload) {
                    for (var up = owner.parent; up !== null && up !== undefined; up = up.parent) {
                        (up.methods[name] || []).forEach(function (proc) {
                            if (!procs.some(function (own) { return Pascal.sameParams(own, proc); }))
                                procs.push(proc);
                        });
                    }
                }
                return { kind: 'method', procs: procs, owner: owner };
            }
            if (owner.constants[name] !== undefined)
                return { kind: owner.constants[name].kind, symbol: owner.constants[name], owner: owner };
        }
        return null;
    };

    // All instance fields (with the fields of the ancestors) - for copying objects.
    Pascal.Type.prototype.instanceFields = function () {
        var list = [];
        for (var owner = this; owner !== null && owner !== undefined; owner = owner.parent)
            list = owner.fields.filter(function (field) { return !field.classVar; }).concat(list);
        return list;
    };

    Pascal.Type.prototype.makeObject = function () {
        var classType = this.K;
        var object = new classType();
        classType.$init(object);
        return object;
    };

    // A class in the code: in its own chunk a local variable, otherwise $P.
    Compiler.prototype.classNode = function (type) {
        if (this.classes.indexOf(type) >= 0)
            return J.id(type.localJs);
        return J.mem(J.id('$P'), type.js);
    };

    // --- Methods in a class body

    // The scope of a method: parameters and locals, then the class members.
    Compiler.prototype.methodScope = function (proc, routineScope) {
        var owner = proc.owner;
        var compiler = this;
        var classScope = new Pascal.Scope('class', routineScope.parent, owner);
        classScope.here = function (name) {
            if (name === 'self')
                return { kind: 'self', owner: owner, proc: proc };
            var member = compiler.findMember(owner, name);
            if (member === null)
                return null;
            if (member.kind === 'const' || member.kind === 'type')
                return member.symbol;
            return { kind: 'member', member: member, owner: owner, proc: proc };
        };
        routineScope.parent = classScope;
        return routineScope;
    };

    // Self in the code (in nested functions through the closure $self).
    Compiler.prototype.selfNode = function () {
        return J.id('$self');
    };

    var symbolValue = Compiler.prototype.symbolValue;
    Compiler.prototype.symbolValue = function (symbol, node, expected, asCallee) {
        if (symbol.kind === 'self') {
            if (symbol.proc.classMethod) {
                var refType = this.classRefType(symbol.owner);
                return new Value(refType, this.selfNode());
            }
            var value = new Value(symbol.owner, this.selfNode());
            return value;
        }
        if (symbol.kind === 'member' && !asCallee && this.isObjfpc(node)) {
            var result = this.resultOf(symbol);
            if (result !== null)
                return result;
        }
        return symbolValue.call(this, symbol, node, expected, asCallee);
    };

    // A class member without an object: a field, a method, a property of Self.
    Compiler.prototype.memberOfSelf = function (symbol, node, expected) {
        var member = symbol.member;
        var classMethod = symbol.proc.classMethod;
        var selfNode = this.selfNode();
        if (classMethod) {
            if (member.kind === 'field' && !member.field.classVar)
                this.error('Only class methods, class properties and class variables can be accessed in class methods', node);
            if (member.kind === 'method' && !member.procs.some(function (proc) { return proc.classMethod; }))
                this.error('Only class methods, class properties and class variables can be accessed in class methods', node);
        }
        if (classMethod)
            return this.memberAccess({ node: selfNode, classRef: true, type: this.classRefType(symbol.owner) }, member, node, expected, symbol.owner);
        return this.memberAccess({ node: selfNode, classRef: false, type: symbol.owner }, member, node, expected, symbol.owner);
    };

    // obj.Member.
    Compiler.prototype.classMember = function (object, type, node, expected) {
        var member = this.findMember(type, node.name);
        if (member === null)
            this.error('identifier idents no member "' + node.text + '"', node);
        return this.memberAccess({ node: object.node, classRef: false, type: type, value: object }, member, node, expected, type);
    };

    // TFoo.Member or class-reference.Member.
    Compiler.prototype.classRefMember = function (object, refType, node, expected, staticClass) {
        var type = refType.of;
        var member = this.findMember(type, node.name);
        if (member === null)
            this.error('identifier idents no member "' + node.text + '"', node);
        return this.memberAccess({ node: object.node, classRef: true, type: refType, staticClass: staticClass || null, value: object },
                                 member, node, expected, type);
    };

    // Access to a member through an object or a class.
    Compiler.prototype.memberAccess = function (target, member, node, expected, staticType) {
        switch (member.kind) {
        case 'field': {
            var field = member.field;
            if (field.classVar) {
                var classRef = new PropRef(field.type, this.classNode(field.owner), J.str(field.js));
                return this.refValue(classRef);
            }
            if (target.classRef)
                this.error('Only class methods, class properties and class variables can be accessed in class methods', node);
            var ref = new PropRef(field.type, target.node, J.str(field.js));
            return this.refValue(ref);
        }
        case 'property':
            return this.propertyValue(target, member.property, node);
        case 'method':
            return { kind: 'method', procs: member.procs, selfNode: target.node, classRef: target.classRef,
                     staticClass: target.staticClass || null, node: node, ownerType: staticType };
        case 'const':
            return this.constValue(member.symbol.type, member.symbol.value, node);
        case 'type':
            return { kind: 'type', type: member.symbol.type, node: node };
        }
        this.error('Illegal qualifier', node);
    };

    // --- Properties

    Compiler.prototype.propertyValue = function (target, property, node) {
        if (property.params.length > 0) {
            // The indices are in the next [ ].
            return { kind: 'indexedProperty', target: target, property: property, node: node,
                     type: property.type };
        }
        if (target.classRef && !property.classProperty)
            this.error('Only class methods, class properties and class variables can be accessed in class methods', node);
        var ref = new Pascal.PropertyRef(this, target.node, property, [], node);
        return this.refValue(ref);
    };

    var compileIndex = Compiler.prototype.compileIndex;
    Compiler.prototype.compileIndex = function (node) {
        var object = this.compileExpr(node.object);
        if (object.kind === 'indexedProperty') {
            var property = object.property;
            if (node.indexes.length !== property.params.length)
                this.error('Wrong number of parameters specified for call to "' + property.text + '"', node);
            var self = this;
            var args = node.indexes.map(function (indexNode, index) {
                return self.convertValue(self.compileValue(indexNode, property.params[index].type), property.params[index].type, indexNode).node;
            });
            return this.refValue(new Pascal.PropertyRef(this, object.target.node, property, args, node));
        }
        return compileIndex.call(this, node);
    };

    // obj[i] - the default property.
    Compiler.prototype.defaultProperty = function (object, type, rest, node) {
        var property = null;
        for (var owner = type; owner !== null && owner !== undefined && property === null; owner = owner.parent)
            property = owner.defaultProperty;
        if (property === null)
            this.error('Illegal qualifier', node);
        var self = this;
        var indexes = rest.slice(0, property.params.length);
        if (indexes.length !== property.params.length)
            this.error('Wrong number of parameters specified for call to "' + property.text + '"', node);
        var args = indexes.map(function (indexNode, index) {
            return self.convertValue(self.compileValue(indexNode, property.params[index].type), property.params[index].type, indexNode).node;
        });
        return this.refValue(new Pascal.PropertyRef(this, object.node, property, args, node));
    };

    Compiler.prototype.propertyRead = function (ref) {
        var property = ref.property;
        var accessor = property.read;
        if (accessor === null)
            this.error('No member is provided to access property', ref.node);
        return this.accessorRead(ref.object, property, accessor, ref.indexArgs, ref.node);
    };

    Compiler.prototype.accessorRead = function (objectNode, property, accessor, indexArgs, node) {
        if (accessor.kind === 'field') {
            var field = accessor.field;
            if (field.classVar)
                return J.mem(this.classNode(field.owner), field.js);
            return J.mem(objectNode, field.js);
        }
        if (accessor.kind === 'path')
            return this.accessorPath(objectNode, property, accessor.node, node).get();
        var args = (property.index !== null ? [property.index.node] : []).concat(indexArgs);
        var call = this.methodCallNode(accessor.proc, objectNode, args, false, false);
        return call;
    };

    Compiler.prototype.propertyWrite = function (ref, value) {
        var property = ref.property;
        var accessor = property.write;
        if (accessor === null)
            this.error('No member is provided to access property', ref.node);
        if (accessor.kind === 'field') {
            var field = accessor.field;
            if (field.classVar)
                return J.assign(J.mem(this.classNode(field.owner), field.js), value);
            return J.assign(J.mem(ref.object, field.js), value);
        }
        if (accessor.kind === 'path')
            return this.accessorPath(ref.object, property, accessor.node, ref.node).set(value);
        var args = (property.index !== null ? [property.index.node] : []).concat(ref.indexArgs, [value]);
        return this.methodCallNode(accessor.proc, ref.object, args, false, false);
    };

    // read FPoint.X - a path from a field of the object.
    Compiler.prototype.accessorPath = function (objectNode, property, path, node) {
        var savedScope = this.scope;
        var owner = property.owner;
        var compiler = this;
        var scope = new Pascal.Scope('class', this.scope, owner);
        scope.here = function (name) {
            var member = compiler.findMember(owner, name);
            if (member === null || member.kind !== 'field')
                return null;
            return { kind: 'pathfield', field: member.field };
        };
        this.scope = scope;
        try {
            var value = this.compilePath(objectNode, path);
            return value.ref;
        } finally {
            this.scope = savedScope;
        }
        void node;
    };

    Compiler.prototype.compilePath = function (objectNode, path) {
        if (path.k === 'name') {
            var symbol = this.scope.here(path.name);
            if (symbol === null)
                this.error('Unknown class field or method identifier "' + path.text + '"', path);
            return this.refValue(new PropRef(symbol.field.type, objectNode, J.str(symbol.field.js)));
        }
        if (path.k === 'member') {
            var base = this.compilePath(objectNode, path.object);
            if (base.type.kind !== 'record')
                this.error('Illegal qualifier', path);
            return this.recordField(base, base.type, path);
        }
        if (path.k === 'index') {
            var holder = this.compilePath(objectNode, path.object);
            var current = holder;
            for (var index = 0; index < path.indexes.length; ++index)
                current = this.indexValue(current, path.indexes[index], path, path.indexes.slice(index));
            return current;
        }
        this.error('Illegal symbol for property access', path);
    };

    // --- Method calls

    // The node of a method call. virtualCall - through the object (dispatch).
    Compiler.prototype.methodCallNode = function (proc, selfNode, args, classRefSelf, inheritedCall) {
        var owner = proc.owner;
        if (proc.classMethod) {
            if (proc.isStatic)
                return J.call(J.mem(this.classNode(owner), proc.slot), args);
            var classSelf = classRefSelf ? selfNode : this.rt('classOf', [selfNode]);
            if (proc.virtual && !inheritedCall)
                return J.call(J.mem(classSelf, proc.slot), args);
            return J.call(J.mem(J.mem(this.classNode(owner), proc.slot), 'call'), [classSelf].concat(args));
        }
        if (proc.virtual && !inheritedCall)
            return J.call(J.mem(selfNode, proc.slot), args);
        return J.call(J.mem(J.mem(J.mem(this.classNode(owner), 'prototype'), proc.slot), 'call'), [selfNode].concat(args));
    };

    Compiler.prototype.callMethod = function (callee, args, node, statement, expected) {
        var procs = callee.procs;
        if (callee.classRef && !callee.procs.some(function (proc) { return proc.classMethod || proc.kind === 'constructor'; }))
            this.error('Only class methods, class properties and class variables can be accessed in class methods', node);
        var values = this.compileArgs(args, Pascal.argumentHints(procs, args.length));
        var candidates = procs;
        if (callee.classRef)
            candidates = procs.filter(function (proc) { return proc.classMethod || proc.kind === 'constructor'; });
        var proc = this.chooseOverload(candidates, values, node, procs[0].text);
        var jsArgs = this.passArgs(proc, values, args, node);
        return this.invokeMethod(proc, callee, jsArgs, node, statement, false);
    };

    // Calls the chosen method: a constructor called on a class makes a new object.
    Compiler.prototype.invokeMethod = function (proc, callee, jsArgs, node, statement, inheritedCall) {
        var selfNode = callee !== null ? callee.selfNode : this.selfNode();
        var classRef = callee !== null ? callee.classRef : false;
        if (proc.abstract && inheritedCall)
            this.error('Abstract methods can\'t be called directly', node);
        var callNode;
        if (proc.kind === 'constructor' && classRef) {
            // TFoo.Create(...): a new instance, the constructor, the instance is the result.
            var objectName = this.temp();
            var allocate = J.assign(J.id(objectName), this.rt('alloc', [selfNode]));
            var constructorCall = proc.virtual ? J.call(J.mem(J.id(objectName), proc.slot), jsArgs)
                : J.call(J.mem(J.mem(J.mem(this.classNode(proc.owner), 'prototype'), proc.slot), 'call'), [J.id(objectName)].concat(jsArgs));
            var afterConstruction = J.call(J.mem(J.id(objectName), this.session.afterConstructionSlot()), []);
            callNode = J.seq([allocate, constructorCall, afterConstruction, J.id(objectName)]);
            var resultType = callee.staticClass !== null && callee.staticClass !== undefined ? callee.staticClass :
                (callee.type && callee.type.kind === 'classref' ? callee.type.of : proc.owner);
            return new Value(resultType, callNode);
        }
        callNode = this.methodCallNode(proc, selfNode, jsArgs, classRef, inheritedCall);
        if (proc.kind === 'constructor') {
            // A constructor called on an object (inherited Create, Self.Create) is a method.
            return new Value(proc.owner, J.seq([callNode, selfNode]));
        }
        if (proc.result === null) {
            if (!statement)
                this.error('Illegal expression', node);
            return new Value(t.void, callNode);
        }
        var value = new Value(proc.result, callNode);
        value.range = types.range(proc.result);
        value.wide = types.isWide(proc.result);
        value.call = true;
        return value;
    };

    // inherited Name(args) or inherited;
    Compiler.prototype.compileInherited = function (node, expected, statement) {
        var fn = this.fn;
        var current = fn !== null ? fn.proc : null;
        for (var outer = fn; outer !== null && outer !== undefined && (current === null || current.owner === null); outer = outer.parent)
            current = outer.proc;
        if (current === null || current === undefined || current.owner === null)
            this.error('inherited is only allowed in methods', node);
        var owner = current.owner;
        var parent = owner.parent;
        var name = node.name !== null ? node.name : current.name;
        if (parent === null || parent === undefined)
            this.error('There is no inherited method "' + (node.text || current.text) + '"', node);
        var member = this.findMember(parent, name);
        var callee = { kind: 'method', selfNode: current.classMethod ? this.selfNode() : this.selfNode(),
                       classRef: !!current.classMethod, node: node, staticClass: null };
        if (member === null) {
            if (node.name === null)
                return new Value(t.void, J.empty ? J.num(0) : J.num(0));
            this.error('Identifier not found "' + node.text + '"', node);
        }
        if (member.kind === 'property') {
            var target = { node: this.selfNode(), classRef: false, type: parent };
            return this.propertyValue(target, member.property, node);
        }
        if (member.kind === 'field')
            return this.refValue(new PropRef(member.field.type, this.selfNode(), J.str(member.field.js)));
        if (member.kind !== 'method')
            this.error('Illegal expression', node);
        var procs = member.procs;
        var proc;
        var values;
        var argNodes;
        if (node.name === null || (node.args === null && node.name === current.name && current.params.length > 0 && false)) {
            // inherited; - the same method with the same parameters.
            proc = null;
            procs.forEach(function (candidate) {
                if (proc === null && Pascal.sameParams(candidate, current))
                    proc = candidate;
            });
            if (proc === null || proc.abstract)
                return new Value(t.void, J.num(0), { emptyInherited: true });
            var self = this;
            var jsArgs = [];
            fn.params.forEach(function (symbol) {
                if (symbol.storage === 'varparam')
                    jsArgs.push(J.id(symbol.objectJs), J.id(symbol.keyJs));
                else
                    jsArgs.push(self.localNode(symbol));
            });
            var made = this.invokeMethod(proc, callee, jsArgs, node, true, true);
            if (made.type === t.void || statement)
                return made;
            return made;
        }
        argNodes = node.args || [];
        values = this.compileArgs(argNodes, Pascal.argumentHints(procs, argNodes.length));
        proc = this.chooseOverload(procs, values, node, procs[0].text);
        return this.invokeMethod(proc, callee, this.passArgs(proc, values, argNodes, node), node, statement, true);
    };

    // --- Method implementations: procedure TFoo.Bar; begin ... end;

    Compiler.prototype.defineMethod = function (heading) {
        var self = this;
        var path = heading.className.split('.');
        var symbol = this.lookup(path[0]);
        var type = symbol !== null && symbol.kind === 'type' ? symbol.type : null;
        for (var index = 1; type !== null && index < path.length; ++index) {
            var nested = type.constants ? type.constants[path[index]] : undefined;
            type = nested !== undefined && nested.kind === 'type' ? nested.type : null;
        }
        if (type === null || type.kind !== 'class')
            this.error('Identifier not found "' + heading.classText + '"', heading);
        var own = type.methods[heading.name];
        if (own === undefined)
            this.error('method identifier expected', heading);
        var params = this.resolveParams(heading.params);
        var proc = null;
        if (own.length === 1 && (heading.params.length === 0 && own[0].params.length > 0 && !own[0].overload)) {
            proc = own[0];
        } else {
            own.forEach(function (candidate) {
                if (proc === null && Pascal.sameParams(candidate, { params: params }))
                    proc = candidate;
            });
        }
        if (proc === null)
            this.error('function header doesn\'t match any method of this class "' + heading.text + '"', heading);
        if (proc.implemented)
            this.error('Duplicate identifier "' + heading.text + '"', heading);
        if (proc.abstract)
            this.error('Abstract methods can\'t have a body', heading);
        if (heading.resultType !== null && proc.result !== null) {
            var result = this.resolveType(heading.resultType);
            if (!types.equal(result, proc.result) && result !== proc.result)
                this.error('function header doesn\'t match the previous declaration "' + heading.text + '"', heading);
        }
        proc.implemented = true;
        proc.defined = true;
        proc.heading.body = heading.body;
        // The parameters take the names of the implementation (they may differ in case).
        proc.implementationHeading = heading;
        var body = { body: heading.body, params: proc.params };
        void body;
        this.compileMethodBody(proc, heading);
        void self;
        return proc;
    };

    Compiler.prototype.compileMethodBody = function (proc, heading) {
        var saved = proc.heading;
        var copy = Object.assign({}, saved, { body: heading.body, line: heading.line, source: heading.source, sw: heading.sw });
        this.compileRoutine(proc, copy);
        proc.heading = saved;
        if (this.classes.indexOf(proc.owner) < 0) {
            // A method of a class from another unit: the body goes onto its
            // prototype when the chunk runs.
            this.externalMethods = this.externalMethods || [];
            this.externalMethods.push(proc);
        }
    };

    // All methods of the classes of the unit are implemented.
    Compiler.prototype.checkClassesComplete = function () {
        var self = this;
        this.classes.forEach(function (type) {
            type.ownMethods.forEach(function (proc) {
                if (!proc.defined && !proc.implemented)
                    self.error('Forward declaration not solved "' + self.methodTitle(type, proc) + '"', proc.heading);
            });
        });
    };

    // --- The code of classes in a chunk

    Compiler.prototype.emitClass = function (type, body) {
        var self = this;
        var parentNode = type.parent !== null && type.parent !== undefined ? this.classNode(type.parent) : J.nul();
        // Instance fields: zeros by their types.
        var initBody = [];
        if (type.parent !== null && type.parent !== undefined)
            initBody.push(J.expr(J.call(J.mem(parentNode, '$init'), [J.id('o')])));
        type.fields.forEach(function (field) {
            if (!field.classVar)
                initBody.push(J.expr(J.assign(J.mem(J.id('o'), field.js), self.zeroNode(field.type))));
        });
        var init = J.fn(null, ['o'], initBody, false);
        body.push(J.var_(type.localJs, this.rt('defineClass', [parentNode, J.str(type.name), init])));
        body.push(J.expr(J.assign(J.mem(this.typeRef(type), 'K'), J.id(type.localJs))));
        var classNode = J.id(type.localJs);
        type.fields.forEach(function (field) {
            if (field.classVar)
                body.push(J.expr(J.assign(J.mem(classNode, field.js), self.zeroNode(field.type))));
        });
        type.ownMethods.forEach(function (proc) {
            var target = proc.classMethod ? classNode : J.mem(classNode, 'prototype');
            var fn;
            if (proc.abstract)
                fn = J.fn(null, [], [J.expr(self.rt('abstractError', []))], false);
            else if (proc.native !== undefined && proc.native !== null)
                fn = self.constant(proc.native);
            else
                fn = proc.jsFunction;
            if (fn === undefined || fn === null)
                return;
            body.push(J.at(J.expr(J.assign(J.mem(target, proc.slot), fn)), proc.line, proc.source));
        });
    };

    // Methods of classes from other units (bodies declared later).
    var assemble = Compiler.prototype.assemble;
    Compiler.prototype.assemble = function (mainBody, mainAsync) {
        var self = this;
        var extra = [];
        (this.externalMethods || []).forEach(function (proc) {
            var classNode = self.classNode(proc.owner);
            var target = proc.classMethod ? classNode : J.mem(classNode, 'prototype');
            extra.push(J.at(J.expr(J.assign(J.mem(target, proc.slot), proc.jsFunction)), proc.line, proc.source));
        });
        var result = assemble.call(this, mainBody, mainAsync);
        if (extra.length > 0)
            result.splice.apply(result, [result.length - 1, 0].concat(extra));
        return result;
    };
})(globalThis);
