// Java: translation into a JavaScript tree - the base: function contexts,
// this, classes and their members.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.Generator)
        return;

    var J = T.J;

    function Generator(session, source) {
        this.session = session;
        this.source = source || '';
        this.constants = [];
        this.constantIndex = new Map();
        this.fn = null;
        this.aliasCounter = 0;
        this.localClasses = new Map();
    }
    Java.Generator = Generator;

    Generator.prototype.constant = function (value) {
        var index = this.constantIndex.get(value);
        if (index === undefined) {
            index = this.constants.length;
            this.constants.push(value);
            this.constantIndex.set(value, index);
        }
        return J.idx(J.id('$D'), J.num(index));
    };

    Generator.prototype.rt = function (name) {
        return J.mem(J.id('$j'), name);
    };

    Generator.prototype.temp = function () {
        return J.id(this.fn.scope.temp());
    };
    // A function context: the class, the kind (method, lambda), the variable with this.
    Generator.prototype.pushFunction = function (cls, kind, parent) {
        var fn = { cls: cls, kind: kind, parent: parent, scope: new T.FunctionScope('$t'), thisAlias: null,
                   hoisted: [], async: false, method: null };
        this.fn = fn;
        return fn;
    };

    // The nearest method function (not a lambda): this lives there.
    Generator.prototype.methodContext = function (fn) {
        while (fn !== null && fn.kind === 'lambda')
            fn = fn.parent;
        return fn;
    };

    Generator.prototype.thisAlias = function (method) {
        if (method.thisAlias === null)
            method.thisAlias = '$this' + (++this.aliasCounter);
        return method.thisAlias;
    };
    // this of the current class or of the outer one depth levels up.
    Generator.prototype.thisRef = function (depth) {
        var method = this.methodContext(this.fn);
        // In a fiber through a variable: in a V4 generator finally after
        // return sees another this.
        var expression = method === this.fn && !method.async ? J.this_() : J.id(this.thisAlias(method));
        var cls = method.cls;
        for (var level = 0; level < depth; ++level) {
            if ((cls.isLocal || cls.isAnonymous) && method.parent !== null) {
                // A local class: the outer instance is this of the method
                // where it is declared.
                var outerMethod = this.methodContext(method.parent);
                expression = J.id(this.thisAlias(outerMethod));
                method = outerMethod;
                cls = outerMethod.cls;
            } else {
                expression = J.mem(expression, '$outer');
                cls = cls.outer;
                method = { cls: cls, kind: 'method', parent: null, thisAlias: null };
            }
        }
        return expression;
    };

    // A reference to a class: a local one is a variable, otherwise the table $K.
    Generator.prototype.classRef = function (sym) {
        if (this.localClasses.has(sym))
            return J.id(this.localClasses.get(sym));
        return J.mem(J.id('$K'), sym.jsId);
    };

    Generator.prototype.defaultValue = function (type) {
        type = Java.resolved(type);
        if (type.kind !== 'prim')
            return J.nul();
        return type.name === 'boolean' ? J.bool(false) : J.num(0);
    };
    // The classes of a chunk - supertypes before subtypes.
    Generator.prototype.orderClasses = function (list) {
        var ordered = [];
        var inList = new Set(list);
        var visiting = new Set();
        function visit(sym) {
            if (ordered.indexOf(sym) >= 0 || visiting.has(sym))
                return;
            visiting.add(sym);
            var supers = sym.interfaces.map(function (iface) { return iface.sym; });
            if (sym.superclass !== null)
                supers.unshift(sym.superclass.sym);
            supers.forEach(function (superSym) {
                if (inList.has(superSym))
                    visit(superSym);
            });
            ordered.push(sym);
        }
        list.forEach(visit);
        return ordered;
    };

    // A class and its nested (not local) classes, the subclasses of enum
    // constants.
    Generator.prototype.collectClasses = function (sym, list) {
        var self = this;
        list.push(sym);
        Object.keys(sym.memberTypes).forEach(function (name) { self.collectClasses(sym.memberTypes[name], list); });
        (sym.node.constants || []).forEach(function (constant) {
            if (constant.subclass)
                self.collectClasses(constant.subclass, list);
        });
        return list;
    };

    Generator.prototype.classMeta = function (sym) {
        var meta = { name: sym.binaryName || sym.qname, simpleName: sym.isAnonymous ? '' : sym.name, flavor: sym.flavor,
                     isInterface: sym.isInterface() };
        // A functional interface: the method and the descriptors - for lambdas in JavaScript.
        var functional = sym.isInterface() ? Java.functionalMethod(sym.thisType) : null;
        if (functional !== null) {
            var method = functional.method;
            meta.functional = {
                name: method.jsName,
                params: method.params.map(function (param) { return Java.descriptor(param); }),
                returns: Java.resolved(method.returns).kind === 'void' ? 'V' : Java.descriptor(method.returns)
            };
        }
        if (sym.flavor === 'record') {
            meta.components = sym.node.components.map(function (component) { return sym.fields[component.name].jsName; });
            meta.componentNames = sym.node.components.map(function (component) { return component.name; });
            meta.componentTypes = sym.node.components.map(function (component) { return Java.descriptor(sym.fields[component.name].type); });
        }
        return meta;
    };
    // A class definition (statements); varName - the chunk variable.
    Generator.prototype.classDefinition = function (sym, varName) {
        var self = this;
        var classType = J.id(varName);
        var superRef = sym.superclass !== null ? this.classRef(sym.superclass.sym) : J.nul();
        var interfaces = J.arr(sym.interfaces.map(function (iface) { return self.classRef(iface.sym); }));
        var out = [J.var_(varName, J.call(this.rt('defineClass'), [J.id('$K'), J.str(sym.jsId), superRef, interfaces,
                                                                  this.constant(this.classMeta(sym))]))];
        Object.keys(sym.fields).forEach(function (name) {
            var field = sym.fields[name];
            var holder = field.isStatic ? classType : J.mem(classType, 'prototype');
            out.push(J.expr(J.assign(J.mem(holder, field.jsName), self.defaultValue(field.type))));
        });
        return out.concat(this.classMethods(sym, classType));
    };

    // The key of a native: name(parameter types after erasure).
    Java.nativeKey = function (method) {
        return (method.isCtor ? '<init>' : method.name) + '(' + method.params.map(function (param) {
            return Java.typeString(Java.erasure(param));
        }).join(',') + ')';
    };

    Generator.prototype.nativeFunction = function (sym, method) {
        var natives = Java.natives[sym.qname] || {};
        var key = Java.nativeKey(method);
        if (natives[key] === undefined)
            throw new Error('Java native is missing: ' + sym.qname + '.' + key);
        return this.constant(natives[key]);
    };
    // The body of a method if it has one: a native, a record field accessor, values()...
    Generator.prototype.methodValue = function (sym, method, classType) {
        if (method.isNative)
            return this.nativeFunction(sym, method);
        if (method.accessorOf !== undefined)
            return J.fn(null, [], [J.ret(J.mem(J.this_(), method.accessorOf.jsName))]);
        if (method.synthetic === 'enumValues')
            return J.fn(null, [], [J.ret(J.call(this.rt('enumValues'), [classType]))]);
        if (method.synthetic === 'enumValueOf')
            return J.fn(null, ['name'], [J.ret(J.call(this.rt('enumValueOf'), [classType, J.id('name')]))]);
        if (method.lazy) {
            var session = this.session;
            var loader = function (holder) { return session.compileLazyMethod(sym, method, holder); };
            var holder = method.isStatic ? classType : J.mem(classType, 'prototype');
            return J.call(this.rt('lazyMethod'),
                          [holder, J.str(method.jsName), this.constant(loader), J.bool(!!method.async)]);
        }
        if (method.node !== null && method.node.body)
            return this.methodCode(method, sym);
        return null;
    };

    Generator.prototype.classMethods = function (sym, classType) {
        var self = this;
        var out = [];
        Object.keys(sym.methods).forEach(function (name) {
            sym.methods[name].forEach(function (method) {
                var value = self.methodValue(sym, method, classType);
                if (value === null)
                    return;
                var holder = method.isStatic ? classType : J.mem(classType, 'prototype');
                out.push(J.at(J.expr(J.assign(J.mem(holder, method.jsName), value)), method.node ? method.node.line : 0));
            });
        });
        sym.ctors.forEach(function (ctor) {
            if (ctor.isNative) {
                out.push(J.expr(J.assign(J.mem(classType, ctor.jsName), self.nativeFunction(sym, ctor))));
                return;
            }
            var line = ctor.node ? ctor.node.line : (sym.node ? sym.node.line : 0);
            out.push(J.at(J.expr(J.assign(J.mem(J.mem(classType, 'prototype'), ctor.jsName), self.constructorFunction(ctor, sym))), line));
        });
        var fieldInit = this.fieldInitializer(sym);
        if (fieldInit !== null)
            out.push(J.expr(J.assign(J.mem(J.mem(classType, 'prototype'), '$fi'), fieldInit)));
        var staticInit = this.staticInitializer(sym, classType);
        if (staticInit !== null)
            out.push(J.expr(J.assign(J.mem(classType, '$clinit'), staticInit)));
        return out;
    };
    // A function: at the start - temporaries, an alias of this, pattern variables.
    Generator.prototype.functionCode = function (fn, params, body) {
        var head = fn.scope.declarations();
        if (fn.thisAlias !== null)
            head.push(J.var_(fn.thisAlias, J.this_()));
        if (fn.hoisted.length > 0)
            head.push(J.vars(fn.hoisted.map(function (name) { return { name: name, init: null }; }), 'var'));
        return J.fn(null, params, head.concat(body), fn.async);
    };

    Generator.prototype.methodCode = function (method, sym) {
        var saved = this.fn;
        var fn = this.pushFunction(sym, 'method', saved);
        fn.method = method;
        fn.async = !!method.async;
        var params = method.paramVars.map(function (variable) { return variable.jsName; });
        var body = this.statements(method.node.body.statements);
        var code = this.functionCode(fn, params, body);
        this.fn = saved;
        return fn.async ? this.asyncFunction(code) : code;
    };

    // An inner (not static, not local) class keeps the outer instance.
    function hasOuter(sym) {
        return sym.isInner && !sym.isLocal && !sym.isAnonymous;
    }
    Java.hasOuter = hasOuter;
    // A constructor: [$outer], parameters; this(...) or the superclass
    // constructor and the field initializers; the body; return this.
    Generator.prototype.constructorFunction = function (ctor, sym) {
        var self = this;
        var saved = this.fn;
        var fn = this.pushFunction(sym, 'method', saved);
        fn.method = ctor;
        var params = [];
        var body = [];
        if (hasOuter(sym)) {
            params.push('$outer');
            body.push(J.expr(J.assign(J.mem(J.this_(), '$outer'), J.id('$outer'))));
        }
        var paramNames = ctor.paramVars !== undefined && !ctor.anonymous
            ? ctor.paramVars.map(function (variable) { return variable.jsName; })
            : ctor.params.map(function (param, index) { return '$a' + index; });
        params = params.concat(paramNames);
        var explicit = ctor.explicitCall || null;
        if (explicit !== null && explicit.kind === 'this') {
            // Not through this: a subclass has another constructor with the same name.
            var outerArgs = hasOuter(sym) ? [J.id('$outer')] : [];
            var own = J.mem(J.mem(this.classRef(sym), 'prototype'), explicit.method.jsName);
            body.push(J.expr(J.call(J.mem(own, 'call'), [J.this_()].concat(outerArgs, this.callArguments(explicit)))));
        } else {
            var superCall = this.superConstructorCall(ctor, sym, explicit, paramNames);
            if (superCall !== null)
                body.push(J.expr(superCall));
            if (this.hasFieldInitializer(sym))
                body.push(J.expr(J.call(J.mem(J.this_(), '$fi'), [])));
        }
        if (ctor.canonical && ctor.implicit) {
            ctor.paramNames.forEach(function (name, index) {
                body.push(J.expr(J.assign(J.mem(J.this_(), sym.fields[name].jsName), J.id(paramNames[index]))));
            });
        }
        if (ctor.node && ctor.node.body) {
            var statements = explicit !== null ? ctor.node.body.statements.slice(1) : ctor.node.body.statements;
            body = body.concat(this.statements(statements));
            if (ctor.compact) {
                ctor.paramNames.forEach(function (name, index) {
                    body.push(J.expr(J.assign(J.mem(J.this_(), sym.fields[name].jsName), J.id(paramNames[index]))));
                });
            }
        }
        body.push(J.ret(J.this_()));
        var code = this.functionCode(fn, params, body);
        this.fn = saved;
        return code;
    };
    Generator.prototype.superConstructorCall = function (ctor, sym, explicit, paramNames) {
        if (sym.superclass === null || sym.flavor === 'enum' || sym.flavor === 'record')
            return null;
        var superSym = sym.superclass.sym;
        // An enum constant with a body calls the constructor of the enum.
        if (superSym === Java.symtab.object || (superSym.flavor === 'enum' && !ctor.anonymous))
            return null;
        var target, args;
        if (ctor.anonymous) {
            target = ctor.superCtor;
            args = paramNames.map(function (name) { return J.id(name); });
        } else if (explicit !== null) {
            target = explicit.method;
            args = this.callArguments(explicit);
        } else {
            target = ctor.implicitSuper;
            if (target === undefined || target === null)
                return null;
            args = target.varargs ? [this.emptyVarargs(target)] : [];
        }
        if (hasOuter(superSym)) {
            var outer = hasOuter(sym) ? J.mem(J.this_(), '$outer') : this.thisRef(1);
            if (explicit !== null && explicit.outer !== null)
                outer = this.expression(explicit.outer);
            args = [outer].concat(args);
        }
        var method = J.mem(J.mem(this.classRef(superSym), 'prototype'), target.jsName);
        return J.call(J.mem(method, 'call'), [J.this_()].concat(args));
    };

    Generator.prototype.hasFieldInitializer = function (sym) {
        if (sym.isInterface())
            return false;
        return sym.node.members.some(function (member) {
            return (member.k === 'field' && !member.mods.static && member.vars.some(function (variable) { return variable.init !== null; })) ||
                (member.k === 'initializer' && !member.isStatic);
        });
    };
    // $fi: field initializers and initializer blocks in order.
    Generator.prototype.fieldInitializer = function (sym) {
        if (!this.hasFieldInitializer(sym))
            return null;
        var self = this;
        var saved = this.fn;
        var fn = this.pushFunction(sym, 'method', saved);
        fn.method = { isCtor: false, isInit: true };
        var body = [];
        sym.node.members.forEach(function (member) {
            if (member.k === 'field' && !member.mods.static) {
                member.vars.forEach(function (variable) {
                    if (variable.init === null)
                        return;
                    var field = sym.fields[variable.name];
                    var value = self.valueAs(variable.init, field.type);
                    body.push(J.at(J.expr(J.assign(J.mem(J.this_(), field.jsName), value)), variable.line));
                });
            } else if (member.k === 'initializer' && !member.isStatic) {
                body = body.concat(self.statements(member.body.statements));
            }
        });
        var code = this.functionCode(fn, [], body);
        this.fn = saved;
        return code;
    };
    // $clinit: enum constants, static fields and blocks in order.
    Generator.prototype.staticInitializer = function (sym, classType) {
        var self = this;
        var constants = sym.node.constants || [];
        var members = sym.node.members.filter(function (member) {
            return (member.k === 'field' && (member.mods.static || sym.isInterface()) &&
                    member.vars.some(function (variable) { return variable.init !== null; })) ||
                (member.k === 'initializer' && member.isStatic);
        });
        if (constants.length === 0 && members.length === 0)
            return null;
        var saved = this.fn;
        var fn = this.pushFunction(sym, 'method', saved);
        fn.method = { isCtor: false, isInit: true, isStatic: true };
        var body = [];
        constants.forEach(function (constant, index) {
            var created = constant.subclass ? self.classRef(constant.subclass) : classType;
            var object = J.call(self.rt('enumConstant'),
                                [classType, J.new_(created, []), J.str(constant.name), J.num(index)]);
            var ctorName = constant.subclass ? '$init' : constant.method.jsName;
            var init = J.call(J.mem(object, ctorName), self.callArguments(constant));
            body.push(J.at(J.expr(J.assign(J.mem(classType, sym.fields[constant.name].jsName), init)), constant.line));
        });
        members.forEach(function (member) {
            if (member.k === 'initializer') {
                body = body.concat(self.statements(member.body.statements));
                return;
            }
            member.vars.forEach(function (variable) {
                if (variable.init === null)
                    return;
                var field = sym.fields[variable.name];
                body.push(J.at(J.expr(J.assign(J.mem(classType, field.jsName), self.valueAs(variable.init, field.type))), variable.line));
            });
        });
        var code = this.functionCode(fn, [], body);
        this.fn = saved;
        return code;
    };
})(globalThis);
