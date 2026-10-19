// C++: new, delete, throw, typeid, dynamic_cast and user-defined literals
// (continues check.js).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    var Parser = X.Parser;
    if (Object.prototype.hasOwnProperty.call(Parser.prototype, 'newExpr'))
        return;

    var types = X.types;
    var big = T.big;
    var unqual = X.unqual;

    function valueType(ir) {
        return unqual(ir.type);
    }

    // --- new

    Parser.prototype.newExpr = function (node) {
        var type = node.type;
        var self = this;
        if (X.containsAuto(type)) {
            if (node.args === null || node.args.length !== 1)
                this.error(node, "invalid use of 'auto'");
            var only = this.check(node.args[0]);
            type = this.deducePlaceholder(type, only, node);
            node = { k: 'new', type: type, args: [{ k: 'checked', ir: only, line: node.line, file: node.file }],
                     braced: node.braced, arraySize: node.arraySize, placement: node.placement, line: node.line,
                     column: node.column, file: node.file };
        }
        var plain = unqual(type);
        if (X.isRef(type))
            this.error(node, "new cannot be applied to a reference type");
        if (plain.kind === 'function')
            this.error(node, "new cannot be applied to a function type");
        if (plain.isClass && !plain.complete)
            this.error(node, "invalid use of incomplete type '" + X.typeString(plain) + "'");
        if (plain.isClass && plain.abstract)
            this.error(node, "invalid new-expression of abstract class type '" + X.typeString(plain) + "'");
        var placement = null;
        if (node.placement !== null) {
            if (node.placement.length !== 1)
                this.error(node, 'placement new with more than one argument is not supported');
            placement = this.convertScalar(this.decayValue(this.check(node.placement[0])), X.pointerTo(types.void));
        }
        if (node.arraySize !== null) {
            var count = this.check(node.arraySize);
            if (valueType(count).isClass)
                count = this.convertToIntegral(count, node);
            if (!X.isIntegralLike(valueType(count)) && valueType(count).kind !== 'enum')
                this.error(node, "size in array new must have integral type");
            var element = plain;
            var dtor = this.elementDestructor(element);
            var items = null;
            var elementInit = null;
            var zero = false;
            if (node.args !== null && node.braced) {
                items = this.checkListItems(node.args).map(function (item) {
                    return item.k === 'braced' ? self.listInitialize(element, item.items, item, true)
                                               : self.initializeFrom(element, item, item);
                });
                if (element.isClass && !this.isTriviallyDefaultConstructible(element))
                    elementInit = this.valueInitialize(element, node);
                else
                    zero = true;
            } else if (node.args !== null) {
                if (node.args.length > 0)
                    this.error(node, 'parenthesized initializer in array new');
                if (element.isClass && !this.isTriviallyDefaultConstructible(element))
                    elementInit = this.valueInitialize(element, node);
                else
                    zero = true;
            } else if (element.isClass && !this.isTriviallyDefaultConstructible(element)) {
                elementInit = this.defaultInitialize(element, node, false);
            }
            if (elementInit !== null && elementInit.k === 'default')
                elementInit = null;
            return this.ir('new', node, { allocType: element, count: count, cookie: dtor !== null, items: items,
                                          elementInit: elementInit, zero: zero, placement: placement, init: null,
                                          type: X.pointerTo(type), cat: 'prvalue' });
        }
        var init;
        if (node.args === null)
            init = this.defaultInitialize(plain, node, false);
        else if (node.braced)
            init = this.listInitialize(type, node.args, node, false);
        else {
            // T(args...) with an empty pack value-initializes too.
            var args = this.checkArguments(node.args);
            if (args.length === 0)
                init = this.valueInitialize(plain, node);
            else if (plain.isClass)
                init = this.directInitialize(plain, args, node, false);
            else if (args.length === 1)
                init = this.initializeFrom(type, args[0], node, true);
            else
                this.error(node, 'expression list treated as compound expression in initializer');
        }
        if (init !== null && init.k === 'default')
            init = null;
        return this.ir('new', node, { allocType: plain, count: null, init: init, placement: placement,
                                      type: X.pointerTo(type), cat: 'prvalue' });
    };

    // --- delete

    Parser.prototype.deleteExpr = function (node) {
        var operand = this.decayValue(this.check(node.expr));
        var type = valueType(operand);
        if (type.isClass)
            operand = this.classToScalar(operand, null, node, false) || operand;
        type = valueType(operand);
        if (type.kind !== 'pointer')
            this.error(node, "type '" + X.typeString(operand.type) + "' argument given to 'delete', expected pointer");
        var element = unqual(type.to);
        var dtor = null;
        var isVirtual = false;
        if (element.isClass) {
            if (!element.complete)
                this.error(node, "possible problem detected in invocation of delete operator: incomplete type '" +
                           X.typeString(element) + "'");
            dtor = this.destructorOf(element);
            isVirtual = dtor !== null && element.dtor.isVirtual && !node.array;
            if (dtor !== null)
                this.checkAccess(element.dtor, element, node);
        }
        return this.ir('delete', node, { operand: operand, dtor: dtor, virtual: isVirtual, array: node.array,
                                         cookie: node.array && dtor !== null, elemType: element, type: types.void,
                                         cat: 'prvalue' });
    };

    // --- throw

    Parser.prototype.throwExpr = function (node) {
        if (node.expr === null) {
            if (this.func !== null)
                this.func.rethrows = true;
            return this.ir('throw', node, { operand: null, type: types.void, cat: 'prvalue' });
        }
        var value = this.check(node.expr);
        var excType = X.decay(value.type);
        if (excType.isClass && !excType.complete)
            this.error(node, "invalid use of incomplete type '" + X.typeString(excType) + "'");
        if (excType.isClass && excType.abstract)
            this.error(node, "cannot allocate an object of abstract type '" + X.typeString(excType) + "'");
        var operand = this.initializeFrom(excType, value, node);
        var dtor = this.elementDestructor(excType);
        return this.ir('throw', node,
                       { operand: operand, excType: excType, dtor: dtor, type: types.void, cat: 'prvalue' });
    };

    // --- typeid

    Parser.prototype.typeidExpr = function (node) {
        var info = this.session.stdClass('type_info');
        if (info === null)
            this.error(node, "must '#include <typeinfo>' before using 'typeid'");
        var resultType = X.qualify(info, X.CONST);
        if (node.type !== undefined)
            return this.ir('typeid', node, { target: unqual(X.removeRef(node.type)), object: null, type: resultType,
                                             cat: 'lvalue' });
        var operand = this.check(node.expr);
        var type = valueType(operand);
        if (type.isClass && type.polymorphic && this.isGlvalue(operand))
            return this.ir('typeid', node, { target: type, object: operand, type: resultType, cat: 'lvalue' });
        return this.ir('typeid', node, { target: type, object: null, type: resultType, cat: 'lvalue' });
    };

    // --- dynamic_cast

    Parser.prototype.dynamicCast = function (target, operand, node) {
        var self = this;
        function fail(reason) {
            self.error(node, "cannot dynamic_cast '" + self.describeIr(operand) + "' (of type '" +
                       X.typeString(operand.type) + "') to type '" + X.typeString(target) + "' (" + reason + ')');
        }
        if (X.isRef(target)) {
            var to = unqual(target.to);
            var from = valueType(operand);
            if (!to.isClass)
                fail('target is not pointer or reference to class');
            if (!from.isClass)
                fail('source is not of class type');
            if (X.isBaseOf(to, from))
                return this.staticCast(target, operand, node, true);
            if (!from.polymorphic)
                fail('source type is not polymorphic');
            var glvalue = this.materialize(operand);
            var badCast = this.badCastFunction();
            return this.ir('dyncast', node,
                           { operand: glvalue, target: to, toVoid: false, reference: true, badCast: badCast,
                                              type: X.qualify(to, X.cvOf(target.to)),
                                              cat: target.kind === 'lref' ? 'lvalue' : 'xvalue' });
        }
        var pointer = this.decayValue(operand);
        var pointerType = valueType(pointer);
        var toType = unqual(target);
        if (toType.kind !== 'pointer')
            fail('target is not pointer or reference');
        if (pointerType.kind !== 'pointer')
            fail('source is not a pointer');
        var toClass = unqual(toType.to), fromClass = unqual(pointerType.to);
        if (!fromClass.isClass)
            fail('source is not a pointer to class');
        if (toClass.kind === 'void') {
            if (!fromClass.polymorphic)
                fail('source type is not polymorphic');
            return this.ir('dyncast', node, { operand: pointer, target: null, toVoid: true, reference: false,
                                              type: toType, cat: 'prvalue' });
        }
        if (!toClass.isClass)
            fail('target is not pointer or reference to class');
        if (!toClass.complete)
            fail('target is not pointer or reference to complete type');
        if (X.isBaseOf(toClass, fromClass))
            return this.pointerToBase(pointer, toClass, toType, node);
        if (!fromClass.polymorphic)
            fail('source type is not polymorphic');
        return this.ir('dyncast', node, { operand: pointer, target: toClass, toVoid: false, reference: false,
                                          type: toType, cat: 'prvalue' });
    };

    Parser.prototype.describeIr = function (ir) {
        if (ir.k === 'var')
            return ir.obj.name;
        if (ir.k === 'deref' && ir.pointer.k === 'var')
            return '* ' + ir.pointer.obj.name;
        return '...';
    };

    // std::__throw_bad_cast from the library, if it is there.
    Parser.prototype.badCastFunction = function () {
        var space = this.session.stdNamespace();
        var found = space !== null ? X.member(space, '__throw_bad_cast') : undefined;
        if (found === undefined || found.kind !== 'functions')
            return null;
        var func = found.items[0];
        this.useFunction(func, null);
        return func;
    };

    // --- User-defined literals

    Parser.prototype.userLiteral = function (node) {
        var name = 'operator""' + node.suffix;
        var entity = this.lookup(name);
        if (entity === null)
            this.error(node, "unable to find " + (node.literal.k === 'string' ? 'string' :
                                                  (node.literal.k === 'int' ? 'numeric' : 'numeric')) +
                       " literal operator '" + name + "'");
        var literal = node.literal;
        var args;
        if (literal.k === 'string') {
            var string = this.check(literal);
            args = [string, this.constant(big.fromFloat(literal.bytes.length), types.ulong, node)];
        } else if (literal.k === 'int') {
            var integer = this.check(literal);
            var cooked = this.convertScalar(integer, types.ullong);
            var candidates = entity.kind === 'functions' ? entity.items : [entity];
            var takesRaw = candidates.some(function (item) {
                return item.kind === 'func' && item.type.params.length === 1 &&
                    unqual(item.type.params[0]).kind === 'pointer';
            });
            var takesInteger = candidates.some(function (item) {
                return item.kind === 'func' && item.type.params.length === 1 &&
                    X.isIntegral(unqual(item.type.params[0]));
            });
            if (!takesInteger && takesRaw) {
                var bytes = T.utf8.encode(node.raw).split('').map(function (char) { return char.charCodeAt(0); });
                args = [this.stringIr({ bytes: bytes, prefix: '', line: node.line, file: node.file })];
            } else {
                args = [cooked];
            }
        } else {
            var floating = this.check(literal);
            args = [this.convertScalar(floating, types.ldouble)];
        }
        var nameNode = { k: 'name', name: name, qualifier: null, args: null, entity: entity, line: node.line,
                         column: node.column, file: node.file, noAdl: true };
        return this.namedCall(nameNode, args, node);
    };
})(globalThis);
