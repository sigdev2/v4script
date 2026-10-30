// C#: the bodies of a type - methods, accessors, operators, constructors
// with their base(...) and this(...) calls, field and property
// initializers, the static constructor. Library methods are checked at
// their first call (CS.Session.compileLazyMethod).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var C = CS.Checker.prototype;
    if (C.checkTypeBodies)
        return;

    var bound = CS.bound;

    // Every body of a type and its nested types (user code checks all at
    // once; lazy - methods are checked when first called).
    C.checkTypeBodies = function (sym, lazy) {
        sym.complete();
        if (sym.bodiesChecked)
            return;
        sym.bodiesChecked = true;
        var self = this;
        Object.keys(sym.nestedTypes).forEach(function (key) {
            self.checkTypeBodies(sym.nestedTypes[key], lazy);
        });
        if (sym.kind === 'enum') {
            this.enumValues(sym);
            return;
        }
        if (sym.kind === 'delegate')
            return;
        this.checkInitializers(sym);
        sym.memberList.forEach(function (member) {
            var methods = [];
            if (member.symbolKind === 'method')
                methods.push(member);
            else if (member.symbolKind === 'property')
                methods = [member.getter, member.setter].filter(function (item) { return item !== null; });
            else if (member.symbolKind === 'event')
                methods = [member.adder, member.remover];
            methods.forEach(function (method) {
                if (lazy && !method.synthetic)
                    method.lazy = true;
                else
                    self.checkMethodBody(method);
            });
        });
        sym.ctors.forEach(function (ctor) {
            if (lazy && !ctor.implicit && !ctor.synthetic && !ctor.isPrimary)
                ctor.lazy = true;
            else
                self.checkConstructor(ctor);
        });
        if (sym.staticCtor !== null)
            this.checkStaticConstructor(sym.staticCtor);
        if (!lazy)
            this.checkInterfaceConsistency(sym);
    };

    C.checkInterfaceConsistency = function () {
    };

    // The body of a method or an accessor.
    C.checkMethodBody = function (method) {
        if (method.bodyChecked)
            return;
        method.bodyChecked = true;
        var node = method.node;
        if (method.accessorOf !== null) {
            var property = method.accessorOf;
            if (property.isAuto || method.exprBody === undefined && (node === null || (node.body === null && node.expr === null)))
                return;
            var accessorNode = node !== null ? node : { body: null, expr: method.exprBody, line: property.node.line,
                                                        column: property.node.column };
            if (method.exprBody !== undefined && method.exprBody !== null)
                accessorNode = { body: null, expr: method.exprBody, line: method.exprBody.line, column: method.exprBody.column };
            var accessorFn = this.functionInfo(method, 'method', null);
            method.scope.fn = accessorFn;
            method.body = this.bindFunctionBody(method, accessorNode, method.scope, accessorFn);
            method.fn = accessorFn;
            return;
        }
        if (method.synthetic || method.isExtern || method.isAbstract || node === null || node === undefined ||
            (node.body === null && node.expr === null))
            return;
        var fn = this.functionInfo(method, 'method', null);
        method.scope.fn = fn;
        method.body = this.bindFunctionBody(method, node, method.scope, fn);
        method.fn = fn;
    };

    // Field, property and event initializers in the order of declaration.
    C.checkInitializers = function (sym) {
        var self = this;
        sym.instanceInits = [];
        sym.staticInits = [];
        var instanceScope = sym.scope.child('method', { method: null, fieldInit: sym, staticContext: false });
        instanceScope.fn = { kind: 'method', method: null, returnType: CS.VOID, calls: [], returns: [], usesThis: false, init: true };
        var staticScope = sym.scope.child('method', { method: null, fieldInit: sym, staticContext: true });
        staticScope.fn = { kind: 'method', method: null, returnType: CS.VOID, calls: [], returns: [], usesThis: false, init: true };
        sym.initFunctions = [instanceScope.fn, staticScope.fn];
        this.registerFunction(instanceScope.fn, instanceScope);
        this.registerFunction(staticScope.fn, staticScope);
        var members = [];
        sym.memberList.forEach(function (member) {
            if (member.symbolKind === 'field' && member.init !== null && member.init !== undefined && !member.isConst &&
                !member.enumMember)
                members.push(member);
            else if (member.symbolKind === 'property' && member.backingField !== null && member.backingField.init)
                members.push(member.backingField);
            else if (member.symbolKind === 'event' && member.backingField !== null && member.backingField.init)
                members.push(member.backingField);
        });
        // The order of the source: by the line and column of the declarations.
        members.sort(function (left, right) {
            var a = left.node || {}, b = right.node || {};
            return (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0);
        });
        members.forEach(function (field) {
            var scope = field.isStatic ? staticScope : instanceScope;
            var init = field.init;
            var value = init.k === 'arrayInit' ? self.bindArrayInitializer(init, field.type, scope) : self.bindAs(init, scope, field.type);
            (field.isStatic ? sym.staticInits : sym.instanceInits).push({ field: field, value: value, line: init.line });
        });
    };

    // A constructor: the base(...) or this(...) call, then the body.
    C.checkConstructor = function (ctor) {
        if (ctor.bodyChecked)
            return;
        ctor.bodyChecked = true;
        var sym = ctor.owner;
        var node = ctor.node;
        var fn = this.functionInfo(ctor, 'method', null);
        var scope = ctor.scope || (ctor.scope = sym.scope.child('method', { method: ctor }));
        scope.fn = fn;
        ctor.fn = fn;
        this.registerFunction(fn, scope);
        var paramScope = scope.child('block', {});
        var self = this;
        ctor.paramLocals = ctor.params.map(function (param) {
            var local = self.declareLocal(param.name, param.type, paramScope, param.node || node, 'param');
            local.refKind = param.refKind;
            local.param = param;
            local.assigned = true;
            param.local = local;
            return local;
        });
        // The call of another constructor.
        var initializer = null;
        if (sym.kind === 'class' && !ctor.synthetic) {
            if (ctor.isPrimary) {
                var declNode = sym.node;
                if (sym.baseType !== null && !CS.isSpecial(sym.baseType, 'object'))
                    initializer = this.constructorCall('base', declNode.baseArgs || [], ctor, paramScope,
                                                       declNode.baseArgs ? { line: declNode.baseArgsLine || declNode.line,
                                                                             column: declNode.column } : declNode);
            } else if (node !== null && node !== undefined && node.initializer !== null && node.initializer !== undefined) {
                initializer = this.constructorCall(node.initializer.kind, node.initializer.args, ctor, paramScope, node.initializer);
            } else if (sym.baseType !== null && !CS.isSpecial(sym.baseType, 'object')) {
                initializer = this.constructorCall('base', [], ctor, paramScope, node || sym.node);
            }
        } else if (sym.kind === 'struct' && node && node.initializer) {
            if (node.initializer.kind === 'base')
                this.error(node.initializer, 'CS0522', "'" + CS.symbolTypeName(sym) + "': structs cannot call base class constructors");
            initializer = this.constructorCall('this', node.initializer.args, ctor, paramScope, node.initializer);
        }
        ctor.initializer = initializer;
        if (ctor.isPrimary || ctor.implicit || ctor.synthetic || node === null || node === undefined) {
            ctor.body = bound('block', node || sym.node, { statements: [], locals: [] });
            return;
        }
        if (node.body !== null) {
            ctor.body = this.bindBlock(node.body, paramScope);
        } else if (node.expr !== null) {
            var value = this.requireValueOrVoid(this.bindExpr(node.expr, paramScope), node.expr);
            ctor.body = bound('block', node.expr, { statements: [bound('expr', node.expr, { expr: value })], locals: [] });
        } else {
            ctor.body = bound('block', node, { statements: [], locals: [] });
        }
    };

    // base(...) or this(...): overload resolution on the constructors of
    // the base class or of the type itself.
    C.constructorCall = function (kind, argNodes, ctor, scope, node) {
        var sym = ctor.owner;
        var targetType = kind === 'base' ? sym.baseType : CS.selfType(sym);
        var targetSym = targetType.sym.complete();
        // The arguments are bound in a static-like context: this is not available yet.
        var argScope = scope.child('block', {});
        argScope.ctorArguments = true;
        var args = this.bindArguments(argNodes, argScope);
        var candidates = this.accessible(targetSym.ctors.map(function (candidate) {
            return { member: candidate, owner: targetType };
        }), sym).filter(function (entry) { return entry.member !== ctor; });
        if (candidates.length === 0)
            this.error(node, 'CS0122', "'" + CS.symbolTypeName(targetSym) + '.' + targetSym.name + "()' is inaccessible due to its protection level");
        var result = this.resolveOverload(candidates, args, null, node, argScope, { name: targetSym.name, ctor: true });
        this.noteCall(scope, result.method);
        return { kind: kind, ctor: result.method, ownerType: targetType, args: result.args, argOrder: result.argOrder,
                 line: node ? node.line : 0 };
    };

    C.checkStaticConstructor = function (cctor) {
        if (cctor.bodyChecked)
            return;
        cctor.bodyChecked = true;
        var fn = this.functionInfo(cctor, 'method', null);
        cctor.scope.fn = fn;
        cctor.fn = fn;
        this.registerFunction(fn, cctor.scope);
        var node = cctor.node;
        if (node.body !== null)
            cctor.body = this.bindBlock(node.body, cctor.scope);
        else if (node.expr !== null)
            cctor.body = bound('block', node.expr, { statements: [bound('expr', node.expr, {
                expr: this.requireValueOrVoid(this.bindExpr(node.expr, cctor.scope), node.expr) })], locals: [] });
        else
            cctor.body = bound('block', node, { statements: [], locals: [] });
    };
})(globalThis);
