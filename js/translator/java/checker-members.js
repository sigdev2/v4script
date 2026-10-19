// Java: class members - fields, methods, constructors, implicit members
// of enums and records, names in JavaScript.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var Checker = Java.Checker;
    if (Checker.prototype.completeMembers)
        return;

    var types = Java.types;

    Checker.prototype.addMethod = function (sym, method) {
        (sym.methods[method.name] = sym.methods[method.name] || []).push(method);
    };

    // The signature of a method from its declaration.
    Checker.prototype.methodSymbol = function (node, sym, isCtor) {
        var mods = Object.assign({}, node.mods);
        if (sym.isInterface()) {
            mods.public = true;
            if (!node.body && !mods.static && !mods.default && !mods.private)
                mods.abstract = true;
        }
        var method = Java.MethodSymbol(isCtor ? '<init>' : node.name, sym, mods);
        method.isCtor = !!isCtor;
        method.node = node;
        var env = sym.classEnv.child('method', { method: method, isStatic: !!mods.static });
        method.env = env;
        method.typeParams = this.declareTypeParams(node.typeParams || [], method, env);
        var self = this;
        method.params = node.params.map(function (param) { return self.resolveType(param.type, env); });
        method.paramNames = node.params.map(function (param) { return param.name; });
        method.varargs = node.params.length > 0 && !!node.params[node.params.length - 1].varargs;
        method.returns = isCtor ? types.void : this.resolveType(node.result, env);
        // Natives and library methods that wait (sleep, join, wait) are fibers.
        if ((mods.native || sym.library) && Java.ASYNC_NATIVES[sym.qname + '.' + Java.nativeKey(method)] === true)
            method.async = true;
        if (!isCtor && node.body === null && !mods.abstract && !mods.native)
            this.error(node, 'missing method body, or declare abstract');
        if (!isCtor && node.body !== null && mods.abstract)
            this.error(node, 'abstract methods cannot have a body');
        return method;
    };
    Checker.prototype.completeMembers = function (sym) {
        var self = this;
        var node = sym.node;
        var env = sym.classEnv;
        var selfType = Java.classType(sym, []);
        function addField(name, type, mods, declNode) {
            if (sym.fields[name] !== undefined)
                self.error(declNode, 'variable ' + name + ' is already defined in class ' + sym.displayName);
            var field = Java.FieldSymbol(name, type, sym, mods);
            field.node = declNode;
            sym.fields[name] = field;
            return field;
        }
        (node.constants || []).forEach(function (constant, index) {
            var field = addField(constant.name, selfType, { public: true, static: true, final: true }, constant);
            field.enumConstant = constant;
            field.ordinal = index;
        });
        (node.components || []).forEach(function (component) {
            var field = addField(component.name, self.resolveType(component.type, env), { private: true, final: true }, component);
            field.component = true;
        });
        node.members.forEach(function (member) {
            if (member.k !== 'field')
                return;
            var mods = Object.assign({}, member.mods);
            if (sym.isInterface()) {
                mods.public = true;
                mods.static = true;
                mods.final = true;
            }
            member.vars.forEach(function (variable) {
                addField(variable.name, self.resolveType(variable.type, env), mods, variable).declaration = member;
            });
        });
        node.members.forEach(function (member) {
            if (member.k === 'method') {
                var method = self.methodSymbol(member, sym, false);
                var signature = Java.erasedParams(method, null);
                (sym.methods[method.name] || []).forEach(function (other) {
                    if (Java.erasedParams(other, null) === signature)
                        self.error(member, 'method ' + method.name + '(' + other.params.map(Java.typeString).join(',') +
                                   ') is already defined in ' + (sym.flavor === 'interface' ? 'interface ' : 'class ') +
                                   sym.displayName);
                });
                self.addMethod(sym, method);
                member.sym = method;
            } else if (member.k === 'ctor') {
                var ctor = self.methodSymbol(member, sym, true);
                if (member.compact) {
                    ctor.params = node.components.map(function (component) { return sym.fields[component.name].type; });
                    ctor.paramNames = node.components.map(function (component) { return component.name; });
                    ctor.compact = true;
                }
                sym.ctors.push(ctor);
                member.sym = ctor;
            }
        });
        this.implicitMembers(sym);
        this.assignJsNames(sym);
    };
    // Implicit members: the default constructor, the accessors of a record,
    // values() and valueOf() of an enum.
    Checker.prototype.implicitMembers = function (sym) {
        var self = this;
        var node = sym.node;
        if (sym.flavor === 'record') {
            node.components.forEach(function (component) {
                var field = sym.fields[component.name];
                var declared = (sym.methods[component.name] || []).some(function (method) { return method.params.length === 0; });
                if (!declared) {
                    var accessor = Java.MethodSymbol(component.name, sym, { public: true });
                    accessor.returns = field.type;
                    accessor.accessorOf = field;
                    self.addMethod(sym, accessor);
                }
            });
            var componentTypes = node.components.map(function (component) { return sym.fields[component.name].type; });
            var canonical = sym.ctors.some(function (ctor) {
                return ctor.params.length === componentTypes.length && ctor.params.every(function (type, index) {
                    return Java.sameType(type, componentTypes[index]);
                });
            });
            if (!canonical) {
                var ctor = Java.MethodSymbol('<init>', sym, { public: true });
                ctor.isCtor = true;
                ctor.params = componentTypes;
                ctor.paramNames = node.components.map(function (component) { return component.name; });
                ctor.canonical = true;
                ctor.implicit = true;
                sym.ctors.push(ctor);
            }
        } else if (sym.ctors.length === 0 && !sym.isInterface() && !sym.isAnonymous) {
            var defaultCtor = Java.MethodSymbol('<init>', sym, sym.flavor === 'enum' ? { private: true } : { public: true });
            defaultCtor.isCtor = true;
            defaultCtor.implicit = true;
            sym.ctors.push(defaultCtor);
        }
        if (sym.flavor === 'enum') {
            var selfType = Java.classType(sym, []);
            var values = Java.MethodSymbol('values', sym, { public: true, static: true });
            values.returns = Java.arrayType(selfType);
            values.synthetic = 'enumValues';
            this.addMethod(sym, values);
            var valueOf = Java.MethodSymbol('valueOf', sym, { public: true, static: true });
            valueOf.params = [Java.stringType()];
            valueOf.paramNames = ['name'];
            valueOf.returns = selfType;
            valueOf.synthetic = 'enumValueOf';
            this.addMethod(sym, valueOf);
        }
    };
    // Names in JavaScript: an override takes the name of the overridden
    // method; otherwise name$parameter_count, and with overloads of the same
    // count also the types. toString(), equals(Object), hashCode() as in
    // JavaScript.
    var SPECIAL = { 'toString/0': 'toString', 'equals/1': 'equals', 'hashCode/0': 'hashCode' };

    function descriptor(method) {
        return method.params.map(function (param) {
            return Java.typeString(Java.erasure(param)).replace(/\[\]/g, 'Arr').replace(/[^A-Za-z0-9_]/g, '_');
        }).join('$');
    }

    Checker.prototype.assignJsNames = function (sym) {
        var used = Object.create(null);  // JavaScript name -> signature
        var closure = Java.supertypeClosure(sym.thisType).slice(1);
        var inherited = [];
        closure.forEach(function (type) {
            type.sym.complete();
            var map = Java.typeMap(type);
            Object.keys(type.sym.methods).forEach(function (name) {
                type.sym.methods[name].forEach(function (method) {
                    if (method.jsName !== null) {
                        used[method.jsName] = name + '(' + Java.erasedParams(method, map) + ')';
                        inherited.push({ method: method, map: map });
                    }
                });
            });
        });
        Object.keys(sym.methods).forEach(function (name) {
            sym.methods[name].forEach(function (method) {
                var signature = Java.erasedParams(method, null);
                if (!method.isStatic) {
                    for (var index = 0; index < inherited.length; ++index) {
                        var other = inherited[index];
                        if (!other.method.isStatic && other.method.name === name &&
                            other.method.params.length === method.params.length &&
                            Java.erasedParams(other.method, other.map) === signature) {
                            method.jsName = other.method.jsName;
                            method.overrides = other.method;
                            break;
                        }
                    }
                    if (method.jsName !== null)
                        return;
                }
                var key = name + '/' + method.params.length;
                var candidate = !method.isStatic && SPECIAL[key] !== undefined &&
                    (key !== 'equals/1' || signature === 'java.lang.Object') ? SPECIAL[key]
                                                                             : T.jsName(name) + '$' + method.params.length;
                var full = name + '(' + signature + ')';
                if (used[candidate] !== undefined && used[candidate] !== full)
                    candidate += '$' + descriptor(method);
                method.jsName = candidate;
                used[candidate] = full;
            });
        });
        sym.ctors.forEach(function (ctor, index) {
            ctor.jsName = '$init' + (sym.ctors.length > 1 ? index : '');
        });
        Object.keys(sym.fields).forEach(function (name) {
            var field = sym.fields[name];
            field.jsName = (field.isStatic ? 's$' : '') + T.propertyName(name);
        });
    };
})(globalThis);
