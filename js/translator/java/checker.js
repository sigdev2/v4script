// Java: checking - name environments, types from the syntax, classes and
// their members. Expressions, calls and statements are in checker-*.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.Checker)
        return;

    var CompileError = T.CompileError;
    var types = Java.types;

    // An environment: top (a unit or a library compilation unit), class, method, block.
    function Env(kind, parent, fields) {
        this.kind = kind;
        this.parent = parent;
        this.vars = null;
        this.types = null;
        this.typeVars = null;
        if (fields)
            Object.keys(fields).forEach(function (key) { this[key] = fields[key]; }, this);
    }
    Env.prototype.child = function (kind, fields) {
        return new Env(kind, this, fields);
    };
    Env.prototype.declareVar = function (variable) {
        if (this.vars === null)
            this.vars = Object.create(null);
        this.vars[variable.name] = variable;
    };
    Env.prototype.declareType = function (sym) {
        if (this.types === null)
            this.types = Object.create(null);
        this.types[sym.name] = sym;
    };
    // The nearest class and method.
    Env.prototype.enclosing = function (kind) {
        for (var env = this; env !== null; env = env.parent) {
            if (env.kind === kind)
                return env;
        }
        return null;
    };
    Java.Env = Env;

    function Checker(session, source) {
        this.session = session;
        this.symtab = session.symtab;
        this.source = source || '';
    }
    Java.Checker = Checker;

    Checker.prototype.error = function (node, message) {
        throw new CompileError(message, node ? node.line : 0, node ? node.column : 0, this.source);
    };

    Checker.prototype.typeName = function (type) {
        return Java.typeString(type);
    };
    // --- Type names

    // A type by a simple name: a type variable, a local or nested class, a
    // class of the unit or compilation unit, an import, packages without
    // import.
    Checker.prototype.lookupTypeName = function (name, env) {
        for (var current = env; current !== null; current = current.parent) {
            if (current.typeVars !== null && current.typeVars[name] !== undefined)
                return Java.typeVar(current.typeVars[name]);
            if (current.types !== null && current.types[name] !== undefined)
                return current.types[name];
            if (current.kind === 'class') {
                var cls = current.cls;
                if (cls.name === name && !cls.isAnonymous)
                    return cls;
                var member = Java.findMemberType(cls.complete(), name);
                if (member !== null)
                    return member;
            }
            if (current.kind === 'top')
                return this.lookupTopType(name, current);
        }
        return null;
    };

    Checker.prototype.lookupTopType = function (name, top) {
        var symtab = this.symtab;
        if (top.imports[name] !== undefined) {
            var imported = symtab.lookupQualified(top.imports[name]);
            if (imported !== null)
                return imported;
        }
        if (top.pkg !== '') {
            var local = symtab.lookupQualified(top.pkg + '.' + name);
            if (local !== null)
                return local;
        } else {
            var user = top.module ? null : this.session.userClass(name);
            if (user !== null)
                return user;
        }
        var auto = symtab.lookupAuto(name);
        if (auto !== null)
            return auto;
        for (var index = 0; index < top.starImports.length; ++index) {
            var star = symtab.lookupQualified(top.starImports[index] + '.' + name);
            if (star !== null)
                return star;
        }
        // A class from the host file Name.java.
        if (top.pkg === '' && this.session.moduleClass)
            return this.session.moduleClass(name);
        return null;
    };

    // A type from the syntax.
    Checker.prototype.resolveType = function (node, env, allowVar) {
        switch (node.k) {
        case 'prim':
            return types[node.name];
        case 'void':
            return types.void;
        case 'array':
            return Java.arrayType(this.resolveType(node.elem, env));
        case 'wild':
            return Java.wildcard(node.bound === null ? null : this.resolveType(node.bound, env), node.upper);
        case 'ctype':
            if (allowVar && node.parts.length === 1 && node.parts[0].name === 'var' && node.parts[0].args === null &&
                this.lookupTypeName('var', env) === null)
                return null;
            return this.resolveClassType(node, env);
        }
        this.error(node, 'illegal start of type');
    };
    Checker.prototype.resolveClassType = function (node, env) {
        var parts = node.parts;
        var found = this.lookupTypeName(parts[0].name, env);
        var index = 1;
        if (found === null) {
            // A full name: java.util.List.
            var qname = parts[0].name;
            while (index < parts.length && found === null) {
                qname += '.' + parts[index].name;
                ++index;
                found = this.symtab.lookupQualified(qname);
            }
            if (found === null)
                this.error(node, 'cannot find symbol: class ' + (parts.length > 1 ? qname : parts[0].name));
        }
        if (found.kind === 'tvar') {
            if (parts.length > 1 || parts[0].args !== null)
                this.error(node, 'unexpected type arguments');
            return found;
        }
        var sym = found;
        for (; index < parts.length; ++index) {
            var member = Java.findMemberType(sym.complete(), parts[index].name);
            if (member === null)
                this.error(node, 'cannot find symbol: class ' + parts[index].name + ' in ' + sym.displayName);
            sym = member;
        }
        var last = parts[parts.length - 1];
        // The number of type parameters - after the class header.
        if (last.args !== null && last.args.length > 0)
            sym.complete();
        var args = [];
        if (last.args !== null && last.args.length > 0) {
            var self = this;
            args = last.args.map(function (arg) {
                var type = self.resolveType(arg, env);
                if (type.kind === 'prim')
                    self.error(arg, 'unexpected type; required: reference, found: ' + type.name);
                return type;
            });
            if (args.length !== sym.typeParams.length)
                this.error(node, 'wrong number of type arguments; required ' + sym.typeParams.length);
        }
        var type = Java.classType(sym, args);
        if (last.args !== null && last.args.length === 0)
            type.diamond = true;
        return type;
    };

    // Type variables: all names first (the bounds refer to each other).
    Checker.prototype.declareTypeParams = function (nodes, owner, env) {
        var self = this;
        var syms = nodes.map(function (node) { return Java.TypeVarSymbol(node.name, owner); });
        if (syms.length > 0) {
            env.typeVars = Object.create(null);
            syms.forEach(function (sym) { env.typeVars[sym.name] = sym; });
        }
        // A bound may refer to the class itself: Enum<E extends Enum<E>>.
        owner.typeParams = syms;
        nodes.forEach(function (node, index) {
            syms[index].bounds = node.bounds.map(function (bound) { return self.resolveType(bound, env); });
        });
        return syms;
    };
    // --- Classes

    // The class symbol from a declaration (and nested ones); the header
    // and the members come later (complete).
    Checker.prototype.enterClass = function (node, outer, env, qprefix, library) {
        var name = node.name || '';
        var sym = new Java.ClassSymbol(name, qprefix + name, node.kind);
        sym.mods = node.mods || {};
        sym.node = node;
        sym.env = env;
        sym.outer = outer;
        sym.library = !!library;
        sym.checker = this;
        sym.binaryName = sym.qname;
        if (outer !== null) {
            sym.displayName = outer.displayName + '.' + name;
            sym.binaryName = outer.binaryName + '$' + name;
            // Nested interfaces, enums and records are static.
            sym.isInner = node.kind === 'class' && !sym.mods.static && !outer.isInterface();
            if (name !== '')
                outer.memberTypes[name] = sym;
        }
        sym.classEnv = env.child('class', { cls: sym });
        var self = this;
        node.members.forEach(function (member) {
            if (member.k === 'class')
                self.enterClass(member, sym, sym.classEnv, sym.qname + '.', library);
        });
        sym.completer = function (target) { self.completeClass(target); };
        node.sym = sym;
        return sym;
    };

    // The binary name of a local or anonymous class, as javac makes it:
    // Outer$1, Outer$1Local (the counters belong to the top-level class).
    Checker.prototype.nestedBinaryName = function (env, localName) {
        var enclosing = env.enclosing('class');
        var cls = enclosing !== null ? enclosing.cls : null;
        if (cls === null || cls.isSession)
            return localName || '';
        var top = cls;
        while ((top.outer !== null && top.outer !== undefined) || top.enclosingClass) {
            top = top.outer !== null && top.outer !== undefined ? top.outer : top.enclosingClass;
            if (top.isSession)
                break;
        }
        if (localName) {
            top.localNames = top.localNames || Object.create(null);
            top.localNames[localName] = (top.localNames[localName] || 0) + 1;
            return cls.binaryName + '$' + top.localNames[localName] + localName;
        }
        top.anonymousCount = (top.anonymousCount || 0) + 1;
        return cls.binaryName + '$' + top.anonymousCount;
    };

    // The top-level environment: the package and the imports.
    Checker.prototype.topEnv = function (pkg, imports) {
        var top = new Env('top', null, { pkg: pkg, imports: Object.create(null), starImports: [], staticImports: [] });
        var self = this;
        imports.forEach(function (item) {
            if (item.isStatic) {
                // import static Type.member or Type.*
                var owner = item.star ? item.name : item.name.substring(0, item.name.lastIndexOf('.'));
                var sym = self.symtab.lookupQualified(owner);
                if (sym === null)
                    self.error(item, 'cannot find symbol: class ' + owner.substring(owner.lastIndexOf('.') + 1));
                top.staticImports.push({ sym: sym, member: item.star ? null : item.name.substring(item.name.lastIndexOf('.') + 1) });
                return;
            }
            if (item.star) {
                top.starImports.push(item.name);
                return;
            }
            var simple = item.name.substring(item.name.lastIndexOf('.') + 1);
            if (self.symtab.lookupQualified(item.name) === null)
                self.error(item, 'cannot find symbol: class ' + simple);
            top.imports[simple] = item.name;
        });
        // A unit sees the functions of global host modules without import:
        // import static app.App.*
        if (pkg === '') {
            this.session.hostImports.forEach(function (qname) {
                top.staticImports.push({ qname: qname, sym: null, member: null });
            });
        }
        return top;
    };

    // Static members from import static: the methods name or the field name.
    Checker.prototype.staticImported = function (top, name, kind) {
        for (var index = 0; index < top.staticImports.length; ++index) {
            var item = top.staticImports[index];
            if (item.member !== null && item.member !== name)
                continue;
            if (item.sym === null)
                item.sym = this.symtab.classNamed(item.qname);
            var type = item.sym.complete().thisType;
            if (kind === 'method') {
                var methods = Java.findMethods(type, name).filter(function (found) { return found.method.isStatic; });
                if (methods.length > 0)
                    return methods;
            } else {
                var field = Java.findField(type, name);
                if (field !== null && field.field.isStatic)
                    return field;
            }
        }
        return null;
    };

    // A library compilation unit: its top-level classes go into the table.
    Java.enterUnit = function (symtab, tree, pkg, record) {
        var checker = new Checker(symtab.session, T.LIBRARY_SOURCE);
        var top = checker.topEnv(pkg, tree.imports);
        tree.items.forEach(function (item) {
            if (item.k !== 'class')
                throw new Error('Java library unit ' + record.id + ': only classes are allowed');
            var sym = checker.enterClass(item, null, top, pkg + '.', true);
            symtab.register(sym);
            record.classes.push(sym);
        });
        record.checker = checker;
    };
    // The header: type parameters, supertypes; then the member signatures.
    Checker.prototype.completeClass = function (sym) {
        var node = sym.node;
        var env = sym.classEnv;
        var symtab = this.symtab;
        sym.typeParams = this.declareTypeParams(node.typeParams || [], sym, env);
        var self = this;
        var selfType = Java.classType(sym, sym.typeParams.map(Java.typeVar));
        sym.thisType = selfType;
        if (sym.flavor === 'enum') {
            sym.superclass = Java.classType(symtab.classNamed('java.lang.Enum'), [Java.classType(sym, [])]);
        } else if (sym.flavor === 'record') {
            sym.superclass = Java.classType(symtab.classNamed('java.lang.Record'), []);
        } else if (sym.isInterface()) {
            sym.superclass = null;
        } else if (node.superclass) {
            var superType = this.resolveType(node.superclass, env);
            if (superType.kind !== 'class' || superType.sym.isInterface())
                this.error(node.superclass, sym.isAnonymous ? 'interface expected here' : 'no interface expected here');
            superType.sym.complete();
            if (superType.sym.mods.final || superType.sym.flavor === 'enum' || superType.sym.flavor === 'record')
                this.error(node.superclass, 'cannot inherit from final ' + superType.sym.displayName);
            sym.superclass = superType;
        } else if (sym.qname !== 'java.lang.Object') {
            sym.superclass = Java.objectType();
        }
        sym.interfaces = (node.interfaces || []).map(function (item) {
            var iface = self.resolveType(item, env);
            if (iface.kind !== 'class' || !iface.sym.complete().isInterface())
                self.error(item, 'interface expected here');
            return iface;
        });
        if (sym.superclass !== null)
            sym.superclass.sym.complete();
        this.completeMembers(sym);
    };
})(globalThis);
