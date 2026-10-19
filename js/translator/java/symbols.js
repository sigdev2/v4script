// Java: symbols - classes, fields, methods, type variables; member lookup
// along the hierarchy with type arguments substituted.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.ClassSymbol)
        return;

    var classCounter = 0;

    function ClassSymbol(name, qname, flavor) {
        this.kind = 'classsym';
        this.name = name;
        this.qname = qname;
        this.displayName = name;
        this.flavor = flavor;
        this.mods = {};
        this.typeParams = [];
        this.superclass = null;
        this.interfaces = [];
        this.fields = Object.create(null);
        this.methods = Object.create(null);
        this.ctors = [];
        this.memberTypes = Object.create(null);
        this.outer = null;
        this.isInner = false;
        this.isLocal = false;
        this.isAnonymous = false;
        this.library = false;
        this.node = null;
        this.env = null;
        this.state = 'entered';
        this.completer = null;
        this.jsId = name.replace(/[^A-Za-z0-9_]/g, '_') + '$' + (++classCounter);
    }
    ClassSymbol.prototype.isInterface = function () {
        return this.flavor === 'interface' || this.flavor === 'annotation';
    };
    // The header and the member signatures - on first demand.
    ClassSymbol.prototype.complete = function () {
        if (this.state === 'entered' && this.completer !== null) {
            this.state = 'completing';
            this.completer(this);
            this.state = 'complete';
        }
        return this;
    };
    Java.ClassSymbol = ClassSymbol;

    Java.TypeVarSymbol = function (name, owner) {
        return { kind: 'tvarsym', name: name, bounds: [], owner: owner };
    };

    Java.FieldSymbol = function (name, type, owner, mods) {
        return { kind: 'field', name: name, type: type, owner: owner, isStatic: !!mods.static, isFinal: !!mods.final,
                 mods: mods, constant: undefined, jsName: null };
    };

    Java.MethodSymbol = function (name, owner, mods) {
        return { kind: 'method', name: name, owner: owner, mods: mods, typeParams: [], params: [], paramNames: [],
                 varargs: false, returns: Java.types.void, isStatic: !!mods.static, isAbstract: !!mods.abstract,
                 isDefault: !!mods.default, isNative: !!mods.native, isCtor: false, jsName: null, node: null,
                 throwsList: [] };
    };

    // All supertypes (substituted) in order: the type itself, the
    // superclass and its supertypes, then the interfaces.
    Java.supertypeClosure = function (type) {
        var result = [];
        var queue = [type];
        while (queue.length > 0) {
            var current = queue.shift();
            if (result.some(function (seen) { return seen.sym === current.sym; }))
                continue;
            result.push(current);
            queue = queue.concat(Java.directSupertypes(current));
        }
        return result;
    };
    // A field by name: { field, map } (map - the substitution of the class
    // that declares it) or null.
    Java.findField = function (type, name) {
        var closure = Java.supertypeClosure(type);
        for (var index = 0; index < closure.length; ++index) {
            var current = closure[index];
            current.sym.complete();
            var field = current.sym.fields[name];
            if (field !== undefined)
                return { field: field, map: Java.typeMap(current) };
        }
        return null;
    };

    // A signature after substitution - for comparing overrides.
    function erasedParams(method, map) {
        return method.params.map(function (param) {
            return Java.typeString(Java.erasure(Java.subst(param, map)), true);
        }).join(',');
    }
    Java.erasedParams = erasedParams;

    // Methods by name in the whole hierarchy; those overridden in subtypes
    // do not repeat. An element: { method, map, type }.
    Java.findMethods = function (type, name) {
        var closure = Java.supertypeClosure(type);
        var result = [];
        var signatures = [];
        closure.forEach(function (current) {
            current.sym.complete();
            var list = current.sym.methods[name];
            if (list === undefined)
                return;
            var map = Java.typeMap(current);
            list.forEach(function (method) {
                var signature = erasedParams(method, map);
                var existing = signatures.indexOf(signature);
                if (existing >= 0) {
                    // An abstract method of an interface does not hide a method of the class.
                    var previous = result[existing];
                    if (previous.method.isAbstract && !method.isAbstract && !current.sym.isInterface() &&
                        previous.method.owner.isInterface())
                        result[existing] = { method: method, map: map, type: current };
                    return;
                }
                signatures.push(signature);
                result.push({ method: method, map: map, type: current });
            });
        });
        return result;
    };

    // A nested type by name (in supertypes too).
    Java.findMemberType = function (sym, name) {
        var closure = Java.supertypeClosure(Java.classType(sym, []));
        for (var index = 0; index < closure.length; ++index) {
            var found = closure[index].sym.memberTypes[name];
            if (found !== undefined)
                return found;
        }
        return null;
    };

    // The method that implements a functional interface (the only abstract
    // one, except the methods of Object), substituted: { method, map }.
    Java.functionalMethod = function (type) {
        type = Java.resolved(type);
        if (type.kind !== 'class' || !type.sym.isInterface())
            return null;
        var closure = Java.supertypeClosure(type);
        var found = null;
        var objectSym = Java.symtab.object;
        objectSym.complete();
        for (var index = 0; index < closure.length; ++index) {
            var current = closure[index];
            current.sym.complete();
            var names = Object.keys(current.sym.methods);
            for (var nameIndex = 0; nameIndex < names.length; ++nameIndex) {
                var list = current.sym.methods[names[nameIndex]];
                for (var methodIndex = 0; methodIndex < list.length; ++methodIndex) {
                    var method = list[methodIndex];
                    if (!method.isAbstract || method.isStatic)
                        continue;
                    // equals, hashCode, toString are methods of Object.
                    var objectMethods = objectSym.methods[method.name];
                    if (objectMethods !== undefined && objectMethods.some(function (candidate) {
                        return candidate.params.length === method.params.length;
                    }))
                        continue;
                    if (found !== null) {
                        var map = Java.typeMap(current);
                        if (found.method.name === method.name &&
                            erasedParams(found.method, found.map) === erasedParams(method, map))
                            continue;
                        return null;
                    }
                    found = { method: method, map: Java.typeMap(current) };
                }
            }
        }
        return found;
    };
})(globalThis);
