// C#: translation of constructors (field initializers run before the
// call of the base constructor, as in C#), the static part of a type
// (lazy when it has a static constructor or initializers with effects),
// and the members synthesized for records.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var G = CS.Generator.prototype;
    if (G.constructorFunction)
        return;

    var J = T.J;

    // $ctor...(params): [hidden fields of the primary constructor], field
    // initializers, base(...) or this(...), the body; returns this.
    G.constructorFunction = function (ctor, sym) {
        var self = this;
        var saved = this.fn;
        var fn = this.pushFunction('method', sym, ctor);
        var params = ctor.synthetic === 'recordCopy' ? ['original'] : (ctor.paramLocals || []).map(function (local) {
            return self.localName(local);
        });
        if (ctor.implicit && params.length === 0)
            params = [];
        var body = [];
        if (ctor.synthetic === 'recordCopy') {
            body = this.recordCopyBody(sym);
        } else {
            var initializer = ctor.initializer || null;
            var callsThis = initializer !== null && initializer.kind === 'this';
            if (!callsThis) {
                // Primary constructor parameters of a class are hidden fields.
                if (ctor.isPrimary && sym.primaryFields) {
                    ctor.params.forEach(function (param) {
                        var field = sym.primaryFields[param.name];
                        body.push(J.expr(J.assign(J.mem(J.this_(), field.jsName), J.id(self.localName(param.local)))));
                    });
                }
                // The properties of a positional record.
                if (ctor.isPrimary && sym.isRecord) {
                    ctor.params.forEach(function (param) {
                        var member = param.recordMember;
                        var value = J.id(self.localName(param.local));
                        if (member.symbolKind === 'property' && member.backingField !== null)
                            body.push(J.expr(J.assign(J.mem(J.this_(), member.backingField.jsName), value)));
                        else if (member.symbolKind === 'field')
                            body.push(J.expr(J.assign(J.mem(J.this_(), member.jsName), value)));
                        else if (member.symbolKind === 'property')
                            body.push(J.expr(J.call(J.mem(J.this_(), CS.findSetter(member).jsName), [value])));
                    });
                }
                if (sym.instanceInits && sym.instanceInits.length > 0)
                    body.push(J.expr(J.call(J.mem(J.this_(), '$fi$' + sym.jsId), [])));
            }
            if (initializer !== null)
                body.push(J.at(J.expr(this.constructorCall(initializer)), initializer.line));
            if (ctor.body !== undefined && ctor.body !== null)
                body = body.concat(this.blockStatements(ctor.body));
        }
        body.push(J.ret(J.this_()));
        var code = this.functionCode(fn, params, body, false);
        this.fn = saved;
        return code;
    };

    // base(args) or this(args): the other constructor called on this.
    G.constructorCall = function (initializer) {
        var target = initializer.ctor;
        var args = this.callArguments({ args: initializer.args, argOrder: initializer.argOrder });
        var holder;
        if (initializer.ownerType.args.length > 0 && !CS.isOpen(initializer.ownerType))
            holder = J.mem(this.typeRef(initializer.ownerType), 'prototype');
        else
            holder = J.mem(this.typeSymRef(target.owner), 'prototype');
        return J.call(J.mem(J.mem(holder, target.jsName), 'call'), [J.this_()].concat(args));
    };

    // $fi$<id>: the field initializers of the instance in their order.
    G.initializerFunction = function (sym, isStatic) {
        var self = this;
        var saved = this.fn;
        var fn = this.pushFunction('method', sym, { isStatic: isStatic, isInit: true });
        var body = [];
        var list = isStatic ? sym.staticInits : sym.instanceInits;
        list.forEach(function (item) {
            var holder = isStatic ? J.this_() : J.this_();
            body.push(J.at(J.expr(J.assign(J.mem(holder, item.field.jsName), self.storedValue(item.value))), item.line));
        });
        var code = this.functionCode(fn, [], body, false);
        this.fn = saved;
        return code;
    };

    // The static part: initializers and the static constructor. With a
    // static constructor or initializers that compute something, it runs
    // at the first use of the type (lazyStatics); constant initializers
    // run at once.
    G.staticPart = function (sym, ref) {
        var self = this;
        var inits = sym.staticInits || [];
        var cctor = sym.staticCtor;
        if (inits.length === 0 && cctor === null)
            return [];
        var lazy = cctor !== null || inits.some(function (item) {
            return item.value.constant === undefined && item.value.k !== 'literal' && item.value.k !== 'default';
        });
        var saved = this.fn;
        var fn = this.pushFunction('method', sym, cctor !== null ? cctor : { isStatic: true, isInit: true });
        fn.isStatic = true;
        var body = [];
        inits.forEach(function (item) {
            body.push(J.at(J.expr(J.assign(J.mem(J.this_(), item.field.jsName), self.storedValue(item.value))), item.line));
        });
        if (cctor !== null && cctor.body)
            body = body.concat(this.blockStatements(cctor.body));
        var init = this.functionCode(fn, [], body, false);
        this.fn = saved;
        if (sym.allTypeParams.length > 0) {
            // Generic types: the statics of every constructed type.
            var fields = this.staticFieldNames(sym);
            var methods = this.staticMethodNames(sym);
            return [J.expr(J.assign(J.mem(ref, '$staticsOf'), J.fn(null, ['$c'], [
                J.expr(J.call(this.rt('genericStatics'), [ref, J.id('$c'), this.constant(fields), this.constant(methods), init]))
            ])))];
        }
        if (!lazy)
            return [J.expr(J.call(J.mem(init, 'call'), [ref]))];
        return [J.expr(J.call(this.rt('lazyStatics'), [ref, this.constant(this.staticFieldNames(sym)),
                                                       this.constant(this.staticMethodNames(sym)), init]))];
    };

    G.staticFieldNames = function (sym) {
        var names = [];
        sym.memberList.forEach(function (member) {
            var field = member.symbolKind === 'field' ? member : member.backingField;
            if (field !== null && field !== undefined && field.isStatic && !field.isConst && !field.enumMember)
                names.push(field.jsName);
        });
        return names;
    };

    G.staticMethodNames = function (sym) {
        var names = [];
        sym.memberList.forEach(function (member) {
            var methods = member.symbolKind === 'method' ? [member]
                : [member.getter, member.setter, member.adder, member.remover].filter(function (item) {
                    return item !== null && item !== undefined;
                });
            methods.forEach(function (method) {
                if (method.isStatic && !method.isAbstract && names.indexOf(method.jsName) < 0)
                    names.push(method.jsName);
            });
        });
        return names;
    };

    // --- Records

    G.syntheticMethod = function (sym, method, ref) {
        switch (method.synthetic) {
        case 'eventAdd':
        case 'eventRemove': {
            // A field-like event: the delegate in its field, combined.
            var field = J.mem(J.this_(), method.accessorOf.backingField.jsName);
            var combined = J.call(this.rt(method.synthetic === 'eventAdd' ? 'combine' : 'removeDelegate'), [field, J.id('value')]);
            return J.fn(null, ['value'], [J.expr(J.assign(field, combined))]);
        }
        case 'recordToString':
            return J.fn(null, [], [J.ret(J.call(this.rt('recordToString'), [J.this_(), J.str(sym.name)]))]);
        case 'recordPrintMembers':
            return this.printMembersFunction(sym, method);
        case 'recordEqualsObject': {
            var typed = CS.lookupMembers(CS.selfType(sym), 'Equals').filter(function (entry) {
                return entry.member.synthetic === 'recordEquals' || (entry.member.params.length === 1 &&
                                                                       CS.sameType(entry.member.params[0].type, CS.selfType(sym)));
            })[0];
            var selfRef = sym.allTypeParams.length > 0 ? J.mem(J.this_(), 'constructor') : this.typeSymRef(sym);
            return J.fn(null, ['other'], [J.ret(J.and(J.call(this.rt('is'), [J.id('other'), selfRef]),
                                                       J.method(J.this_(), typed.member.jsName, [J.call(this.rt('unboxed'), [J.id('other')])])))]);
        }
        case 'recordEquals':
            return this.recordEqualsFunction(sym, method);
        case 'recordHashCode':
            return this.recordHashFunction(sym);
        case 'recordOpEquality':
        case 'recordOpInequality': {
            var equals = CS.lookupMembers(CS.selfType(sym), 'Equals').filter(function (entry) {
                return entry.member.synthetic === 'recordEquals' || (entry.member.params.length === 1 &&
                                                                       CS.sameType(entry.member.params[0].type, CS.selfType(sym)));
            })[0].member;
            var test = sym.kind === 'struct'
                ? J.method(J.id('left'), equals.jsName, [J.id('right')])
                : J.or(J.bin('===', J.id('left'), J.id('right')), J.and(J.bin('!==', J.id('left'), J.nul()),
                                                                        J.method(J.id('left'), equals.jsName, [J.id('right')])));
            return J.fn(null, ['left', 'right'], [J.ret(method.synthetic === 'recordOpEquality' ? test : J.not(test))]);
        }
        case 'recordClone': {
            var copy = sym.ctors.filter(function (ctor) { return ctor.synthetic === 'recordCopy' || (ctor.params.length === 1 &&
                CS.sameType(ctor.params[0].type, CS.selfType(sym))); })[0];
            return J.fn(null, [], [J.ret(J.method(J.new_(J.mem(J.this_(), 'constructor'), []), copy.jsName, [J.this_()]))]);
        }
        case 'recordDeconstruct': {
            var params = method.params.map(function (param, index) { return '$o' + index; });
            var body = sym.primaryCtor.params.map(function (param, index) {
                var member = param.recordMember;
                var read = member.symbolKind === 'property'
                    ? (member.backingField !== null ? J.mem(J.this_(), member.backingField.jsName)
                                                    : J.method(J.this_(), CS.findGetter(member).jsName, []))
                    : J.mem(J.this_(), member.jsName);
                return J.expr(J.assign(J.mem(J.id(params[index]), 'v'), read));
            });
            return J.fn(null, params, body);
        }
        }
        throw new Error('C# codegen: unknown synthesized member ' + method.synthetic);
    };

    // The members a record prints: public instance fields and readable
    // properties in the order of declaration (EqualityContract excluded).
    G.printedMembers = function (sym) {
        var result = [];
        sym.memberList.forEach(function (member) {
            if (member.isStatic || member.access !== 'public' || member.explicitIface)
                return;
            if (member.symbolKind === 'field' && !member.isConst)
                result.push(member);
            else if (member.symbolKind === 'property' && !member.isIndexer && CS.findGetter(member) !== null &&
                     member.name !== 'EqualityContract' && !member.isOverride)
                result.push(member);
        });
        // The order of the source: positional properties first.
        result.sort(function (left, right) {
            var a = left.node || {}, b = right.node || {};
            return (a.line || 0) - (b.line || 0) || (a.column || 0) - (b.column || 0);
        });
        return result;
    };

    // PrintMembers(builder): "Name = value, ..."; the base record first.
    G.printMembersFunction = function (sym, method) {
        var self = this;
        var body = [];
        var members = this.printedMembers(sym);
        var builder = J.id('builder');
        var printed = J.id('$printed');
        body.push(J.var_('$printed', J.bool(false)));
        var base = sym.baseType !== null && sym.baseType.sym.isRecord ? sym.baseType : null;
        if (base !== null) {
            var basePrint = CS.lookupMembers(base, 'PrintMembers')[0].member;
            body.push(J.expr(J.assign(printed, J.call(J.mem(J.mem(J.mem(this.typeSymRef(base.sym), 'prototype'), basePrint.jsName), 'call'),
                                                      [J.this_(), builder]))));
        }
        var saved = this.fn;
        this.pushFunction('method', sym, { isStatic: false });
        members.forEach(function (member) {
            var read = member.symbolKind === 'field' ? J.mem(J.this_(), member.jsName)
                : (member.isAuto && member.backingField !== null ? J.mem(J.this_(), member.backingField.jsName)
                                                                 : J.method(J.this_(), CS.findGetter(member).jsName, []));
            var text = self.stringValue(read, member.type);
            if (!CS.isValueType(member.type) && member.type.kind !== 'tparam')
                text = J.call(self.rt('objectString'), [read]);
            body.push(J.expr(J.call(self.rt('appendMember'), [builder, printed, J.str(member.name + ' = '), text])));
            body.push(J.expr(J.assign(printed, J.bool(true))));
        });
        this.fn = saved;
        body.push(J.ret(printed));
        return J.fn(null, ['builder'], body);
    };

    // Equals(R other): the same type and equal fields (EqualityComparer<T>).
    G.recordEqualsFunction = function (sym, method) {
        var self = this;
        var other = J.id('other');
        var tests = [];
        var base = sym.baseType !== null && sym.baseType.sym.isRecord ? sym.baseType : null;
        if (sym.kind !== 'struct') {
            tests.push(J.bin('!==', other, J.nul()));
            if (base !== null) {
                var baseEquals = CS.lookupMembers(base, 'Equals').filter(function (entry) {
                    return entry.member.synthetic === 'recordEquals' || (entry.member.params.length === 1 &&
                                                                           CS.sameType(entry.member.params[0].type, base));
                })[0].member;
                tests.push(J.call(J.mem(J.mem(J.mem(this.typeSymRef(base.sym), 'prototype'), baseEquals.jsName), 'call'), [J.this_(), other]));
            } else {
                tests.push(J.bin('===', J.mem(J.this_(), 'constructor'), J.mem(other, 'constructor')));
            }
        }
        var saved = this.fn;
        this.pushFunction('method', sym, { isStatic: false });
        (sym.fieldOrder || []).forEach(function (field) {
            if (field.isStatic)
                return;
            tests.push(J.call(self.rt('equalsOf'), [self.typeRef(field.type), J.mem(J.this_(), field.jsName), J.mem(other, field.jsName)]));
        });
        this.fn = saved;
        var test = tests.length === 0 ? J.bool(true) : tests.reduce(function (left, right) { return J.and(left, right); });
        if (sym.kind !== 'struct')
            test = J.or(J.bin('===', J.this_(), other), test);
        return J.fn(null, ['other'], [J.ret(test)]);
    };

    G.recordHashFunction = function (sym) {
        var self = this;
        var body = [J.var_('$h', J.num(sym.kind === 'struct' ? 0 : 17))];
        var base = sym.baseType !== null && sym.baseType.sym.isRecord ? sym.baseType : null;
        if (base !== null) {
            var baseHash = CS.lookupMembers(base, 'GetHashCode')[0].member;
            body.push(J.expr(J.assign(J.id('$h'), J.call(J.mem(J.mem(J.mem(this.typeSymRef(base.sym), 'prototype'), baseHash.jsName), 'call'),
                                                         [J.this_()]))));
        }
        var saved = this.fn;
        this.pushFunction('method', sym, { isStatic: false });
        (sym.fieldOrder || []).forEach(function (field) {
            if (field.isStatic)
                return;
            body.push(J.expr(J.assign(J.id('$h'), J.call(self.rt('combineHash'), [J.id('$h'), J.call(self.rt('hashOf'), [
                self.typeRef(field.type), J.mem(J.this_(), field.jsName)])]))));
        });
        this.fn = saved;
        body.push(J.ret(J.id('$h')));
        return J.fn(null, [], body);
    };

    // The copy constructor of a record: all fields (the base ones by its copy).
    G.recordCopyBody = function (sym) {
        var body = [];
        var base = sym.baseType !== null && sym.baseType.sym.isRecord ? sym.baseType : null;
        if (base !== null) {
            var baseCopy = base.sym.ctors.filter(function (ctor) {
                return ctor.synthetic === 'recordCopy' || (ctor.params.length === 1 && CS.sameType(ctor.params[0].type, base));
            })[0];
            body.push(J.expr(J.call(J.mem(J.mem(J.mem(this.typeSymRef(base.sym), 'prototype'), baseCopy.jsName), 'call'),
                                    [J.this_(), J.id('original')])));
        }
        var self = this;
        (sym.fieldOrder || []).forEach(function (field) {
            var value = J.mem(J.id('original'), field.jsName);
            if (self.isMutableStruct(field.type))
                value = J.method(value, '$copy', []);
            body.push(J.expr(J.assign(J.mem(J.this_(), field.jsName), value)));
        });
        return body;
    };
})(globalThis);
