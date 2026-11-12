// Kotlin: the checker - the base. Scopes with implicit receivers, type
// references, declarations of classes, functions and properties with
// their signatures on demand, members of types (Kotlin and Java), names in
// JavaScript. Expressions, calls and statements are in checker-*.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.Checker)
        return;

    // Packages a unit sees without import.
    Kt.DEFAULT_IMPORTS = ['kotlin', 'kotlin.annotation', 'kotlin.collections', 'kotlin.comparisons', 'kotlin.io',
                          'kotlin.ranges', 'kotlin.sequences', 'kotlin.text', 'kotlin.jvm', 'java.lang', 'js'];

    function Checker(session, source) {
        this.session = session;
        this.source = source || '';
        // The function being checked: { sym, returns, kind, parent, ... }.
        this.fn = null;
        // Facts of smart casts: Map(symbol -> narrowed type).
        this.facts = new Map();
        // Functions and lambdas of the unit (for fibers).
        this.functions = [];
        this.lambdaCounter = 0;
    }
    Kt.Checker = Checker;

    Checker.prototype.error = function (node, message) {
        throw new T.CompileError(message, node.line || 0, node.column || 0, this.source);
    };

    Checker.prototype.mismatch = function (node, expected, actual, what) {
        if (what === 'initializer')
            this.error(node, 'initializer type mismatch: expected \'' + Kt.typeString(expected) + '\', actual \'' +
                       Kt.typeString(actual) + '\'.');
        if (what === 'argument')
            this.error(node, 'argument type mismatch: actual type is \'' + Kt.typeString(actual) + '\', but \'' +
                       Kt.typeString(expected) + '\' was expected.');
        if (what === 'return')
            this.error(node, 'return type mismatch: expected \'' + Kt.typeString(expected) + '\', actual \'' +
                       Kt.typeString(actual) + '\'.');
        if (what === 'assignment')
            this.error(node, 'assignment type mismatch: actual type is \'' + Kt.typeString(actual) + '\', but \'' +
                       Kt.typeString(expected) + '\' was expected.');
        this.error(node, 'type mismatch: inferred type is \'' + Kt.typeString(actual) + '\', but \'' +
                   Kt.typeString(expected) + '\' was expected.');
    };

    // --- Scopes

    // kind: 'file', 'class', 'function', 'lambda', 'block'. A scope may
    // bring an implicit receiver: { type, kind: 'this' | 'extension' |
    // 'lambda' | 'object', cls, label, fn }.
    function Scope(parent, kind, props) {
        this.parent = parent;
        this.kind = kind;
        this.vars = null;
        this.funs = null;
        this.classes = null;
        this.typeParams = null;
        this.receiver = null;
        this.cls = null;
        this.fn = null;
        this.label = null;
        if (props)
            Object.assign(this, props);
    }
    Kt.Scope = Scope;

    Scope.prototype.child = function (kind, props) {
        return new Scope(this, kind, props);
    };

    Scope.prototype.declareVar = function (sym) {
        if (this.vars === null)
            this.vars = new Map();
        this.vars.set(sym.name, sym);
    };

    Scope.prototype.declareFun = function (sym) {
        if (this.funs === null)
            this.funs = new Map();
        var list = this.funs.get(sym.name) || [];
        list.push(sym);
        this.funs.set(sym.name, list);
    };

    Scope.prototype.declareClass = function (sym) {
        if (this.classes === null)
            this.classes = new Map();
        this.classes.set(sym.name, sym);
    };

    Scope.prototype.declareTypeParam = function (sym) {
        if (this.typeParams === null)
            this.typeParams = new Map();
        this.typeParams.set(sym.name, sym);
    };

    Scope.prototype.file = function () {
        var scope = this;
        while (scope.kind !== 'file')
            scope = scope.parent;
        return scope;
    };

    Scope.prototype.enclosing = function (kind) {
        var scope = this;
        while (scope !== null && scope.kind !== kind)
            scope = scope.parent;
        return scope;
    };

    // The class whose body encloses the scope (this), or null.
    Scope.prototype.enclosingClass = function () {
        for (var scope = this; scope !== null; scope = scope.parent) {
            if (scope.kind === 'class')
                return scope.cls;
        }
        return null;
    };

    // The implicit receivers from the innermost: [{ type, kind, cls, label, scope }].
    Scope.prototype.receivers = function () {
        var list = [];
        for (var scope = this; scope !== null; scope = scope.parent) {
            if (scope.receiver !== null)
                list.push(scope.receiver);
            if (scope.kind === 'class' && scope.companionReceiver)
                list.push(scope.companionReceiver);
        }
        return list;
    };

    // --- The file scope: imports

    // A file scope: the package, imports, the unit or the library file.
    Checker.prototype.fileScope = function (pkg, imports, library) {
        var scope = new Scope(null, 'file', { pkg: pkg || '', imports: Object.create(null), starImports: [], library: !!library });
        var self = this;
        (imports || []).forEach(function (item) {
            // import kotlinx.coroutines.*: a library that is not there.
            if (!library && !self.session.isPackage(item.path[0]) && self.session.lookupClass(item.path[0]) === null)
                self.error(item, 'unresolved reference \'' + item.path[0] + '\'.');
            if (item.star) {
                scope.starImports.push(item.path.join('.'));
                return;
            }
            var name = item.alias || item.path[item.path.length - 1];
            (scope.imports[name] = scope.imports[name] || []).push({ path: item.path, node: item });
        });
        return scope;
    };

    // --- Type references

    // A type from its tree; options: { allowUnresolved }.
    Checker.prototype.resolveType = function (node, scope) {
        var self = this;
        switch (node.k) {
        case 'type':
            return this.resolveUserType(node, scope);
        case 'ftype': {
            var receiver = node.receiver === null ? null : this.resolveType(node.receiver, scope);
            var params = node.params.map(function (param) { return self.resolveType(param, scope); });
            var returns = this.resolveType(node.returns, scope);
            return Kt.funType(receiver, params, returns, node.nullable, node.suspend);
        }
        case 'dynamic':
            return Kt.DYNAMIC;
        case 'dnn':
            return Kt.makeNotNull(this.resolveType(node.type, scope));
        }
        this.error(node, 'syntax error: Type expected.');
    };

    Checker.prototype.resolveUserType = function (node, scope) {
        var parts = node.parts;
        var self = this;
        var first = parts[0];
        var found = null;
        var index = 1;
        if (parts.length === 1 || !this.isPackagePrefix(first.name, scope)) {
            found = this.lookupTypeName(first.name, scope, first);
            if (found === null)
                this.error(first, 'unresolved reference \'' + first.name + '\'.');
        } else {
            // A qualified name: the longest package prefix, then classes.
            var path = [first.name];
            while (index < parts.length) {
                path.push(parts[index].name);
                var qualified = this.session.lookupClass(path.join('.'));
                ++index;
                if (qualified !== null) {
                    found = qualified;
                    break;
                }
            }
            if (found === null)
                this.error(first, 'unresolved reference \'' + parts.map(function (part) { return part.name; }).join('.') + '\'.');
        }
        var outerArgs = [];
        var partOf = index > 1 ? parts[index - 1] : first;
        for (; index <= parts.length; ++index) {
            if (found.kind === 'tparam') {
                if (partOf.args.length > 0)
                    this.error(partOf, 'type arguments are not allowed for type parameters.');
                return Kt.paramType(found, node.nullable && index === parts.length);
            }
            if (found.kind === 'alias') {
                var aliasType = this.expandAlias(found, partOf, scope);
                if (index === parts.length)
                    return node.nullable ? Kt.makeNullable(aliasType) : aliasType;
                found = aliasType.sym;
            }
            if (index === parts.length)
                break;
            var part = parts[index];
            found.completeHeader();
            var nested = this.nestedClass(found, part.name);
            if (nested === null)
                this.error(part, 'unresolved reference \'' + part.name + '\'.');
            outerArgs = partOf.args;
            found = nested;
            partOf = part;
        }
        void outerArgs;
        var sym = found;
        if (sym.isNothing)
            return node.nullable ? Kt.NULL_TYPE : Kt.NOTHING;
        sym.completeHeader();
        var args = partOf.args.map(function (arg) {
            if (arg.variance === 'star')
                return Kt.STAR;
            return Kt.arg(self.resolveType(arg.type, scope), arg.variance || '');
        });
        if (args.length !== sym.typeParams.length) {
            if (args.length === 0 && sym.typeParams.length > 0 && this.allowRawTypes) {
                args = sym.typeParams.map(function () { return Kt.STAR; });
            } else if (sym.typeParams.length === 0 && args.length > 0) {
                this.error(partOf, 'no type arguments expected for class \'' + sym.name + '\'.');
            } else {
                var count = sym.typeParams.length;
                this.error(partOf, (count === 1 ? 'one type argument' : count + ' type arguments') + ' expected for class \'' +
                           sym.name + '<' + sym.typeParams.map(function (param) {
                               return (param.variance ? param.variance + ' ' : '') + param.name;
                           }).join(', ') + '>\'.');
            }
        }
        return Kt.classType(sym, args, node.nullable);
    };

    Checker.prototype.expandAlias = function (alias, part, scope) {
        var self = this;
        if (alias.type === null)
            alias.type = this.resolveType(alias.node.type, alias.scope);
        if (alias.typeParams.length === 0)
            return alias.type;
        var map = new Map();
        var projections = new Map();
        alias.typeParams.forEach(function (param, index) {
            var arg = part.args[index];
            map.set(param, arg === undefined || arg.variance === 'star' ? Kt.nullableAny() : self.resolveType(arg.type, scope));
            if (arg !== undefined && arg.variance)
                projections.set(param, arg.variance);
        });
        var result = Kt.subst(alias.type, map);
        var original = Kt.resolved(alias.type);
        if (projections.size === 0 || original.kind !== 'class')
            return result;
        // Projections at the use site (Comparator<in T>) go to the arguments that are the alias parameters.
        return Kt.classType(result.sym, result.args.map(function (arg, index) {
            var source = original.args[index];
            if (source === undefined || source.v !== '' || source.type.kind !== 'param' || !projections.has(source.type.sym))
                return arg;
            var variance = projections.get(source.type.sym);
            return variance === 'star' ? Kt.STAR : Kt.arg(arg.type, variance);
        }), result.nullable, result.flexible);
    };

    // A nested class (or the companion's) by name.
    Checker.prototype.nestedClass = function (sym, name) {
        sym.completeHeader();
        if (sym.nested[name] !== undefined)
            return sym.nested[name];
        if (sym.java !== null && sym.java !== undefined) {
            var javaNested = sym.java.memberTypes[name];
            if (javaNested !== undefined)
                return Kt.javaClass(javaNested);
        }
        // Nested classes of supertypes.
        for (var index = 0; index < sym.supers.length; ++index) {
            var superSym = Kt.resolved(sym.supers[index]).sym;
            if (superSym !== undefined) {
                var inherited = this.nestedClass(superSym, name);
                if (inherited !== null)
                    return inherited;
            }
        }
        return null;
    };

    // The first part of a qualified name is a package (kotlin, java...).
    Checker.prototype.isPackagePrefix = function (name, scope) {
        if (this.lookupTypeName(name, scope, null, true) !== null)
            return false;
        return this.session.isPackage(name);
    };

    // A class, type parameter or type alias by a simple name, or null.
    Checker.prototype.lookupTypeName = function (name, scope, node, quiet) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.typeParams !== null && current.typeParams.has(name))
                return current.typeParams.get(name);
            if (current.classes !== null && current.classes.has(name))
                return current.classes.get(name);
            if (current.kind === 'class' && current.cls !== null) {
                var nested = this.nestedClass(current.cls, name);
                if (nested !== null)
                    return nested;
            }
            if (current.kind === 'file')
                return this.fileTypeName(name, current, quiet);
        }
        return null;
    };

    // Imports, the package of the file, star imports, default imports.
    Checker.prototype.fileTypeName = function (name, file, quiet) {
        var session = this.session;
        var explicit = file.imports[name];
        if (explicit !== undefined) {
            for (var index = 0; index < explicit.length; ++index) {
                var path = explicit[index].path;
                var imported = session.lookupClass(path.join('.'));
                if (imported !== null)
                    return imported;
                var alias = session.lookupAlias(path.slice(0, -1).join('.'), path[path.length - 1]);
                if (alias !== null)
                    return alias;
            }
        }
        var own = session.packageClass(file.pkg, name, file);
        if (own !== null)
            return own;
        var packages = file.starImports.concat(session.defaultImports());
        for (var pkgIndex = 0; pkgIndex < packages.length; ++pkgIndex) {
            var found = session.packageClass(packages[pkgIndex], name, null);
            if (found !== null)
                return found;
            // import Outer.* gives the nested classes of Outer.
            var outer = session.lookupClass(packages[pkgIndex]);
            if (outer !== null) {
                var nested = this.nestedClass(outer, name);
                if (nested !== null)
                    return nested;
            }
        }
        void quiet;
        return null;
    };

    // --- Declarations: classes

    // A class symbol from a declaration and its nested classes; the header
    // and the members come at the first use (complete).
    Checker.prototype.enterClass = function (node, outer, scope, pkg, library) {
        var name = node.name || '';
        var fqName = outer !== null ? outer.fqName + '.' + name : (pkg ? pkg + '.' + name : name);
        var sym = new Kt.ClassSym(name, fqName, node.kind === 'entry' ? 'class' : node.kind);
        sym.mods = node.mods || {};
        sym.node = node;
        sym.outer = outer;
        sym.library = !!library;
        sym.pkg = pkg || '';
        sym.checker = this;
        sym.binaryName = outer !== null ? outer.binaryName + '$' + name : fqName;
        if (outer !== null) {
            sym.displayName = outer.displayName + '.' + name;
            sym.inner = !!sym.mods.inner;
            if (name !== '')
                outer.nested[name] = sym;
            if (sym.mods.companion) {
                if (outer.companion !== null)
                    this.error(node, 'only one companion object is allowed per class.');
                outer.companion = sym;
            }
        }
        if (sym.mods.enum)
            sym.kind = 'enum';
        sym.scope = scope;
        var self = this;
        node.members.forEach(function (member) {
            if (member.k === 'class')
                self.enterClass(member, sym, null, pkg, library);
        });
        sym.headerCompleter = function (target) { self.completeClass(target, 'header'); };
        sym.completer = function (target) { self.completeClass(target, 'members'); };
        node.sym = sym;
        return sym;
    };

    // The scope inside a class: type parameters, this, the companion.
    Checker.prototype.classScope = function (sym) {
        if (sym.bodyScope !== undefined)
            return sym.bodyScope;
        var outerScope = sym.outer !== null ? this.classScope(sym.outer) : sym.scope;
        if (sym.outer !== null && !sym.inner && !sym.isLocal) {
            // A nested class does not see this of the outer class.
            outerScope = this.staticScope(sym.outer);
        }
        if (sym.declScope !== undefined)
            outerScope = sym.declScope;
        var header = outerScope.child('header', { cls: sym });
        sym.typeParams.forEach(function (param) { header.declareTypeParam(param); });
        var body = header.child('class', { cls: sym });
        body.receiver = { type: sym.thisType(), kind: 'this', cls: sym, label: sym.name };
        if (sym.companion !== null && sym.companion !== sym)
            body.companionReceiver = { type: Kt.classType(sym.companion, []), kind: 'object', cls: sym.companion,
                                       label: sym.companion.name };
        sym.headerScope = header;
        sym.bodyScope = body;
        return body;
    };

    // The scope of a nested (not inner) class inside its outer class: the
    // companion and the nested classes, but not this.
    Checker.prototype.staticScope = function (sym) {
        if (sym.staticScopeCache !== undefined)
            return sym.staticScopeCache;
        var outer = sym.outer !== null ? this.staticScope(sym.outer) : (sym.declScope !== undefined ? sym.declScope : sym.scope);
        var scope = outer.child('class', { cls: sym, isStatic: true });
        if (sym.kind === 'object')
            scope.receiver = { type: Kt.classType(sym, []), kind: 'object', cls: sym, label: sym.name };
        else if (sym.companion !== null)
            scope.companionReceiver = { type: Kt.classType(sym.companion, []), kind: 'object', cls: sym.companion,
                                        label: sym.companion.name };
        sym.staticScopeCache = scope;
        return scope;
    };

    Checker.prototype.declareTypeParams = function (nodes, owner, scope) {
        var self = this;
        var syms = nodes.map(function (node) {
            var param = Kt.TypeParamSym(node.name, owner);
            param.variance = node.variance || '';
            param.reified = !!node.reified;
            param.node = node;
            scope.declareTypeParam(param);
            return param;
        });
        // A bound may name the owner itself: Enum<E : Enum<E>>.
        if (owner !== null && owner !== undefined && owner.kind !== 'alias')
            owner.typeParams = syms;
        nodes.forEach(function (node, index) {
            syms[index].bounds = node.bounds.map(function (bound) { return self.resolveType(bound, scope); });
        });
        return syms;
    };

    // The header and the member signatures of a class.
    Checker.prototype.completeClass = function (sym, phase) {
        try {
            if (phase === 'header')
                this.completeClassInner(sym);
            else
                this.completeMembers(sym);
        } catch (error) {
            if (error instanceof T.CompileError && this.source === T.LIBRARY_SOURCE && error.message.indexOf('[') !== 0)
                error.message = '[' + sym.fqName + '] ' + error.message;
            throw error;
        }
    };

    Checker.prototype.completeClassInner = function (sym) {
        var node = sym.node;
        var self = this;
        var outerScope = sym.outer !== null ? (sym.inner ? this.classScope(sym.outer) : this.staticScope(sym.outer))
                                            : (sym.declScope !== undefined ? sym.declScope : sym.scope);
        var header = outerScope.child('header', { cls: sym });
        sym.typeParams = this.declareTypeParams(node.typeParams || [], sym, header);
        sym.headerScopeForSupers = header;
        var supers = [];
        var superclass = null;
        node.supers.forEach(function (spec) {
            var type = self.resolveType(spec.type, header);
            if (type.kind !== 'class')
                self.error(spec, 'a supertype is expected.');
            type.sym.completeHeader();
            if (type.nullable)
                self.error(spec.type, 'a supertype cannot be nullable.');
            if (!type.sym.isInterface()) {
                if (superclass !== null)
                    self.error(spec, 'only one class may appear in a supertype list.');
                if (spec.args === null && sym.kind !== 'interface' && !(sym.node.kind === 'entry'))
                    self.error(spec, 'this type has a constructor, so it must be initialized here.');
                if (!type.sym.isOpen() && type.sym !== Kt.builtins.Any)
                    self.error(spec.type, 'this type is final, so it cannot be extended.');
                superclass = type;
                spec.isClass = true;
            } else if (spec.args !== null) {
                self.error(spec, 'this type does not have a constructor.');
            }
            spec.resolved = type;
            supers.push(type);
            if (type.sym.mods.sealed && type.sym.sealedSubclasses.indexOf(sym) < 0)
                type.sym.sealedSubclasses.push(sym);
        });
        if (sym.kind === 'enum') {
            superclass = Kt.classType(Kt.builtins.Enum, [Kt.arg(Kt.classType(sym, []))]);
            supers.unshift(superclass);
        } else if (superclass === null && sym.kind !== 'interface' && sym !== Kt.builtins.Any && !sym.fromJava) {
            superclass = Kt.anyType();
        }
        // The superclass first.
        if (superclass !== null && supers.indexOf(superclass) > 0) {
            supers.splice(supers.indexOf(superclass), 1);
            supers.unshift(superclass);
        }
        if (superclass !== null && supers.indexOf(superclass) < 0 && superclass.sym !== Kt.builtins.Any)
            supers.unshift(superclass);
        sym.supers = supers;
        sym.superclass = superclass;
    };

    // --- Declarations: members

    Checker.prototype.completeMembers = function (sym) {
        var self = this;
        var node = sym.node;
        var scope = this.classScope(sym);
        // The primary constructor and its properties.
        if (node.primary !== null && node.primary !== undefined) {
            var primary = Kt.FunSym('<init>', sym, node.primary.mods || {});
            primary.isCtor = true;
            primary.primary = true;
            primary.node = node.primary;
            primary.params = node.primary.params.map(function (param) { return self.paramSymbol(param, sym.headerScope); });
            primary.typeParams = [];
            primary.returns = Kt.unitType();
            sym.ctors.push(primary);
            node.primary.params.forEach(function (param, index) {
                if (param.valVar === null)
                    return;
                var prop = Kt.PropSym(param.name, sym, param.mods);
                prop.type = primary.params[index].type;
                prop.mutable = param.valVar === 'var';
                prop.node = param;
                prop.fromCtor = primary.params[index];
                prop.isOverride = !!param.mods.override;
                self.checkDuplicateProperty(sym, prop, param);
                sym.addMember(prop);
            });
        }
        node.members.forEach(function (member) {
            switch (member.k) {
            case 'fun': {
                var fn = self.functionSymbol(member, sym, scope);
                sym.addMember(fn);
                member.sym = fn;
                break;
            }
            case 'property': {
                var prop = self.propertySymbol(member, sym, scope);
                self.checkDuplicateProperty(sym, prop, member);
                sym.addMember(prop);
                member.sym = prop;
                break;
            }
            case 'ctor': {
                var ctor = Kt.FunSym('<init>', sym, member.mods);
                ctor.isCtor = true;
                ctor.node = member;
                ctor.params = member.params.map(function (param) { return self.paramSymbol(param, sym.headerScope); });
                ctor.returns = Kt.unitType();
                if (sym.isInterface() || sym.kind === 'object')
                    self.error(member, sym.kind === 'object' ? 'constructors are not allowed for objects.'
                                                             : 'an interface cannot have a constructor.');
                sym.ctors.push(ctor);
                member.sym = ctor;
                break;
            }
            case 'typealias':
                self.error(member, 'nested and local type aliases are not supported.');
                break;
            }
        });
        if (sym.ctors.length === 0 && !sym.isInterface() && sym.kind !== 'object') {
            var implicit = Kt.FunSym('<init>', sym, {});
            implicit.isCtor = true;
            implicit.primary = true;
            implicit.implicit = true;
            implicit.returns = Kt.unitType();
            sym.ctors.push(implicit);
        }
        if (sym.kind === 'object') {
            var objectCtor = Kt.FunSym('<init>', sym, { private: true });
            objectCtor.isCtor = true;
            objectCtor.primary = true;
            objectCtor.implicit = true;
            objectCtor.returns = Kt.unitType();
            sym.ctors.push(objectCtor);
        }
        if (sym.mods.data)
            this.dataMembers(sym);
        if (sym.kind === 'enum')
            this.enumMembers(sym);
        if (sym.mods.value) {
            // A value class is a box of its property (no inline representation):
            // toString, equals and hashCode as a data class has them.
            sym.valueClass = true;
            var node = sym.node;
            if (node.primary !== null && node.primary !== undefined && node.primary.params.length === 1) {
                sym.dataProps = (sym.members[node.primary.params[0].name] || []).filter(function (member) { return member.kind === 'prop'; });
                var self = this;
                [['toString', [], Kt.stringType(), 'dataToString'], ['hashCode', [], Kt.intType(), 'dataHashCode'],
                 ['equals', [Kt.ParamSym('other', Kt.nullableAny())], Kt.booleanType(), 'dataEquals']].forEach(function (item) {
                    var declared = (sym.members[item[0]] || []).some(function (member) {
                        return member.kind === 'fun' && member.params.length === item[1].length;
                    });
                    if (!declared)
                        self.syntheticMember(sym, item[0], item[1], item[2], item[3]);
                });
            }
        }
        sym.ctors.forEach(function (ctor) {
            ctor.hasDefaults = ctor.params.some(function (param) { return param.hasDefault; });
        });
        this.findOverrides(sym);
        this.assignJsNames(sym);
    };

    Checker.prototype.checkDuplicateProperty = function (sym, prop, node) {
        var existing = (sym.members[prop.name] || []).filter(function (member) {
            return member.kind === 'prop' && (member.receiver === null) === (prop.receiver === null);
        });
        if (existing.length > 0 && prop.receiver === null)
            this.error(node, 'conflicting declarations: val ' + prop.name + ': ' + Kt.typeString(prop.type) + ', val ' +
                       prop.name + ': ' + Kt.typeString(existing[0].type || Kt.ERROR) + '.');
    };

    // A parameter of a function or a constructor.
    Checker.prototype.paramSymbol = function (node, scope) {
        var type = node.type === null ? Kt.ERROR : this.resolveType(node.type, scope);
        var param = Kt.ParamSym(node.name, node.mods.vararg ? this.varargArrayType(type) : type);
        param.elementType = type;
        param.vararg = !!node.mods.vararg;
        param.hasDefault = node.init !== null;
        param.node = node;
        param.noinline = !!node.mods.noinline;
        param.crossinline = !!node.mods.crossinline;
        return param;
    };

    Checker.prototype.varargArrayType = function (type) {
        return Kt.varargArray(type);
    };

    // The signature of a function (its body is checked later).
    Checker.prototype.functionSymbol = function (node, owner, scope) {
        var mods = node.mods || {};
        var fn = Kt.FunSym(node.name, owner, mods);
        fn.node = node;
        fn.library = owner !== null ? owner.library : !!scope.file().library;
        var fnScope = scope.child('signature', { fn: fn });
        fn.signatureScope = fnScope;
        fn.typeParams = this.declareTypeParams(node.typeParams, fn, fnScope);
        fn.receiver = node.receiver === null ? null : this.resolveType(node.receiver, fnScope);
        var self = this;
        fn.params = node.params.map(function (param) { return self.paramSymbol(param, fnScope); });
        fn.params.forEach(function (param, index) {
            if (param.vararg)
                fn.varargIndex = index;
        });
        fn.hasDefaults = fn.params.some(function (param) { return param.hasDefault; });
        if (node.returns !== null) {
            fn.returns = this.resolveType(node.returns, fnScope);
        } else if (!node.exprBody || node.body === null) {
            fn.returns = Kt.unitType();
        } else {
            // An expression body: the type comes from the body, on demand.
            fn.returns = null;
            fn.inferReturn = true;
        }
        fn.isAbstract = !!mods.abstract || (owner !== null && owner.isInterface() && node.body === null);
        fn.isOverride = !!mods.override;
        fn.isOpen = !!mods.open || !!mods.abstract || fn.isAbstract || (fn.isOverride && !mods.final);
        fn.inline = !!mods.inline;
        fn.suspend = !!mods.suspend;
        fn.operator = !!mods.operator;
        fn.infix = !!mods.infix;
        fn.tailrec = !!mods.tailrec;
        fn.external = !!mods.external;
        if (owner !== null && owner.isInterface() && node.body !== null)
            fn.isOpen = true;
        if (node.body === null && !fn.isAbstract && !fn.external && !(owner !== null && owner.mappedBuiltin) &&
            !(owner !== null && owner.java !== null && owner.java !== undefined)) {
            this.error(node, 'function \'' + node.name + '\' without a body must be abstract.');
        }
        if (fn.isAbstract && owner !== null && !owner.isInterface() && !owner.mods.abstract && !owner.mods.sealed &&
            owner.kind !== 'enum')
            this.error(node, 'abstract function \'' + node.name + '\' in non-abstract class \'' + owner.name + '\'.');
        return fn;
    };

    // The return type of a function with an expression body (from the body).
    Checker.prototype.returnType = function (fn) {
        if (fn.returns !== null)
            return fn.returns;
        if (fn.inferring)
            this.error(fn.node, 'type checking has run into a recursive problem. Easiest workaround: specify the types of ' +
                       'your declarations explicitly.');
        fn.inferring = true;
        var checker = fn.checker || this;
        var type = checker.inferFunctionBody(fn);
        fn.inferring = false;
        fn.returns = type;
        return type;
    };

    Checker.prototype.propertySymbol = function (node, owner, scope) {
        var mods = node.mods || {};
        var prop = Kt.PropSym(node.name, owner, mods);
        prop.node = node;
        prop.library = owner !== null ? owner.library : !!scope.file().library;
        prop.mutable = node.valVar === 'var';
        var propScope = scope.child('signature', { prop: prop });
        prop.signatureScope = propScope;
        prop.typeParams = this.declareTypeParams(node.typeParams, prop, propScope);
        prop.receiver = node.receiver === null ? null : this.resolveType(node.receiver, propScope);
        prop.isConst = !!mods.const;
        prop.lateinit = !!mods.lateinit;
        prop.isOverride = !!mods.override;
        prop.isAbstract = !!mods.abstract || (owner !== null && owner.isInterface() && node.init === null &&
                                              (node.getter === null || node.getter.body === null) && node.delegate === null);
        prop.isOpen = !!mods.open || prop.isAbstract || (prop.isOverride && !mods.final) || (owner !== null && owner.isInterface());
        prop.delegated = node.delegate !== null;
        prop.customGetter = node.getter !== null && node.getter.body !== null;
        prop.customSetter = node.setter !== null && node.setter.body !== null;
        // A property has a field if it has an initializer, or default
        // accessors, or its accessors mention field.
        prop.hasField = !prop.isAbstract && !prop.delegated && prop.receiver === null && !mods.external &&
            (node.init !== null || !prop.customGetter || (prop.mutable && !prop.customSetter) ||
             mentionsField(node.getter) || mentionsField(node.setter)) && !(owner !== null && owner.isInterface());
        if (node.type !== null) {
            prop.type = this.resolveType(node.type, propScope);
        } else if (node.getter !== null && node.getter.returns !== null) {
            prop.type = this.resolveType(node.getter.returns, propScope);
        } else {
            prop.type = null;
            prop.inferType = true;
            if (node.init === null && !prop.customGetter && node.delegate === null)
                this.error(node, 'this property must either have a type annotation, be initialized or be delegated.');
        }
        if (prop.isAbstract && node.init !== null)
            this.error(node.init, owner !== null && owner.isInterface() ? 'property initializers are not allowed in interfaces.'
                                                                       : 'abstract property cannot have an initializer.');
        if (owner !== null && owner.isInterface() && node.init !== null)
            this.error(node.init, 'property initializers are not allowed in interfaces.');
        if (prop.lateinit && node.init !== null)
            this.error(node, '\'lateinit\' modifier is not allowed on properties with initializer.');
        return prop;
    };

    // The keys of tree nodes that hold children (statements and
    // expressions); annotations of the checker are not followed.
    var CHILD_KEYS = ['items', 'members', 'entries', 'supers', 'args', 'value', 'delegate', 'body', 'init', 'getter', 'setter',
                      'statements', 'target', 'iterable', 'cond', 'left', 'right', 'expr', 'arg', 'callee', 'lambda', 'indices',
                      'parts', 'decl', 'then', 'otherwise', 'subject', 'branches', 'conds', 'guard', 'catches', 'finalizer',
                      'delegation'];

    // Calls visit(node) for the node and its descendants; visit returns
    // false to skip the children of a node.
    Kt.walk = function (node, visit) {
        if (node === null || node === undefined || typeof node !== 'object')
            return;
        if (Array.isArray(node)) {
            for (var index = 0; index < node.length; ++index)
                Kt.walk(node[index], visit);
            return;
        }
        if (node.k === undefined) {
            // An argument { name, value } or a part of a string { kind, expr }.
            if (node.value !== undefined && typeof node.value === 'object')
                Kt.walk(node.value, visit);
            if (node.expr !== undefined)
                Kt.walk(node.expr, visit);
            return;
        }
        if (visit(node) === false)
            return;
        for (var keyIndex = 0; keyIndex < CHILD_KEYS.length; ++keyIndex) {
            var child = node[CHILD_KEYS[keyIndex]];
            if (child !== null && child !== undefined && typeof child === 'object')
                Kt.walk(child, visit);
        }
    };

    function mentionsField(accessor) {
        if (accessor === null || accessor.body === null)
            return false;
        var found = false;
        Kt.walk(accessor.body, function (node) {
            if (found)
                return false;
            if (node.k === 'name' && node.name === 'field') {
                found = true;
                return false;
            }
            return node.k !== 'lambda' && node.k !== 'class';
        });
        return found;
    }
    Kt.mentionsField = mentionsField;

    // The type of a property (from its initializer if it has no type).
    Checker.prototype.propertyType = function (prop) {
        if (prop.type !== null)
            return prop.type;
        if (prop.inferring)
            this.error(prop.node, 'type checking has run into a recursive problem. Easiest workaround: specify the types of ' +
                       'your declarations explicitly.');
        prop.inferring = true;
        var checker = prop.checker || this;
        var type = checker.inferPropertyType(prop);
        prop.inferring = false;
        prop.type = type;
        return type;
    };

    // componentN, copy, equals, hashCode, toString of a data class.
    Checker.prototype.dataMembers = function (sym) {
        var node = sym.node;
        if (sym.kind === 'object') {
            // data object Empty: toString is the name, equals is the type.
            sym.dataProps = [];
            this.syntheticMember(sym, 'toString', [], Kt.stringType(), 'dataToString');
            this.syntheticMember(sym, 'hashCode', [], Kt.intType(), 'dataHashCode');
            this.syntheticMember(sym, 'equals', [Kt.ParamSym('other', Kt.nullableAny())], Kt.booleanType(), 'dataEquals');
            return;
        }
        if (node.primary === null || node.primary === undefined || node.primary.params.length === 0)
            this.error(node, 'data class must have at least one primary constructor parameter.');
        var self = this;
        var props = [];
        node.primary.params.forEach(function (param) {
            if (param.valVar === null)
                self.error(param, 'data class primary constructor must only have property (val / var) parameters.');
            props.push((sym.members[param.name] || []).filter(function (member) { return member.kind === 'prop'; })[0]);
        });
        sym.dataProps = props;
        props.forEach(function (prop, index) {
            var name = 'component' + (index + 1);
            if ((sym.members[name] || []).length > 0)
                return;
            var fn = Kt.FunSym(name, sym, { operator: true });
            fn.returns = prop.type;
            fn.operator = true;
            fn.synthetic = { kind: 'component', prop: prop };
            sym.addMember(fn);
        });
        var copy = Kt.FunSym('copy', sym, {});
        copy.params = props.map(function (prop) {
            var param = Kt.ParamSym(prop.name, prop.type);
            param.hasDefault = true;
            return param;
        });
        copy.hasDefaults = true;
        copy.returns = sym.thisType();
        copy.synthetic = { kind: 'copy' };
        sym.addMember(copy);
        var declares = function (name, count) {
            return (sym.members[name] || []).some(function (member) { return member.kind === 'fun' && member.params.length === count; });
        };
        if (!declares('toString', 0))
            this.syntheticMember(sym, 'toString', [], Kt.stringType(), 'dataToString');
        if (!declares('hashCode', 0))
            this.syntheticMember(sym, 'hashCode', [], Kt.intType(), 'dataHashCode');
        if (!declares('equals', 1))
            this.syntheticMember(sym, 'equals', [Kt.ParamSym('other', Kt.nullableAny())], Kt.booleanType(), 'dataEquals');
    };

    Checker.prototype.syntheticMember = function (sym, name, params, returns, kind) {
        var fn = Kt.FunSym(name, sym, { override: true });
        fn.params = params;
        fn.returns = returns;
        fn.isOverride = true;
        fn.isOpen = true;
        fn.synthetic = { kind: kind };
        if (name === 'equals')
            fn.operator = true;
        sym.addMember(fn);
        return fn;
    };

    // values(), valueOf(), entries of an enum; the entries are static properties.
    Checker.prototype.enumMembers = function (sym) {
        var self = this;
        var selfType = Kt.classType(sym, []);
        sym.entries = sym.node.entries.map(function (entry) { return entry.name; });
        var entryProps = Object.create(null);
        sym.node.entries.forEach(function (entry, index) {
            var prop = Kt.PropSym(entry.name, sym, {});
            prop.type = selfType;
            prop.isStatic = true;
            prop.enumEntry = entry;
            prop.ordinal = index;
            prop.jsName = 's$' + T.propertyName(entry.name);
            if (entryProps[entry.name] !== undefined)
                self.error(entry, 'conflicting declarations: enum entry ' + entry.name + '.');
            entryProps[entry.name] = true;
            (sym.statics[entry.name] = sym.statics[entry.name] || []).push(prop);
            if (entry.members !== null) {
                var body = { k: 'class', kind: 'entry', mods: {}, name: entry.name, typeParams: [], primary: null,
                             supers: [], members: entry.members, entries: [], hasBody: true, line: entry.line,
                             column: entry.column };
                var entrySym = self.enterClass(body, null, sym.scope, sym.pkg, sym.library);
                entrySym.kind = 'class';
                entrySym.entryOf = sym;
                entrySym.anonymous = true;
                entrySym.binaryName = sym.binaryName + '$' + entry.name;
                entrySym.fqName = sym.fqName;
                entrySym.displayName = sym.displayName;
                entrySym.declScope = self.classScope(sym);
                entrySym.headerCompleter = function (target) { self.completeEntryClass(target, sym); };
                entrySym.completer = function (target) { self.completeMembers(target); };
                entry.sym = entrySym;
            }
        });
        var values = Kt.FunSym('values', sym, {});
        values.isStatic = true;
        values.returns = Kt.builtinType('Array', [Kt.arg(selfType)]);
        values.synthetic = { kind: 'enumValues' };
        (sym.statics.values = sym.statics.values || []).push(values);
        var valueOf = Kt.FunSym('valueOf', sym, {});
        valueOf.isStatic = true;
        valueOf.params = [Kt.ParamSym('value', Kt.stringType())];
        valueOf.returns = selfType;
        valueOf.synthetic = { kind: 'enumValueOf' };
        (sym.statics.valueOf = sym.statics.valueOf || []).push(valueOf);
        var entries = Kt.PropSym('entries', sym, {});
        entries.type = Kt.builtinType('List', [Kt.arg(selfType)]);
        entries.isStatic = true;
        entries.hasField = false;
        entries.synthetic = { kind: 'enumEntries' };
        (sym.statics.entries = sym.statics.entries || []).push(entries);
    };

    // The class of an enum entry with a body: a subclass of the enum.
    Checker.prototype.completeEntryClass = function (sym, enumSym) {
        sym.typeParams = [];
        sym.superclass = Kt.classType(enumSym, []);
        sym.supers = [sym.superclass];
        sym.declScope = this.classScope(enumSym);
    };

    // --- Overrides and names in JavaScript

    // The inherited members of the supertypes: [{ member, map }].
    Checker.prototype.inheritedMembers = function (sym, name) {
        var result = [];
        Kt.directSupertypes(sym.thisType()).forEach(function (superType) {
            var closure = Kt.supertypeClosure(Kt.resolved(superType));
            closure.forEach(function (type) {
                var owner = type.sym;
                owner.complete();
                var members = owner.java !== null && owner.java !== undefined && !owner.mappedBuiltin
                    ? Kt.javaMembers(owner, name, false)
                    : (owner.members[name] || []);
                var map = Kt.typeMap(type);
                members.forEach(function (member) {
                    if (!result.some(function (seen) { return seen.member === member; }))
                        result.push({ member: member, map: map, type: type });
                });
            });
        });
        return result;
    };

    // Parameter types equal after substitution (an override); mine - the
    // substitution of fn when it is inherited too.
    function sameSignature(fn, other, map, mine) {
        if (fn.params.length !== other.params.length || (fn.receiver === null) !== (other.receiver === null))
            return false;
        for (var index = 0; index < fn.params.length; ++index) {
            var own = Kt.makeNotNull(mine !== undefined ? Kt.subst(fn.params[index].type, mine) : fn.params[index].type);
            var theirs = Kt.makeNotNull(Kt.subst(other.params[index].type, map));
            if (!Kt.sameType(eraseForOverride(own, fn), eraseForOverride(theirs, other)))
                return false;
        }
        return true;
    }
    Kt.sameSignature = sameSignature;

    // Type parameters of the functions compare by position.
    function eraseForOverride(type, fn) {
        type = Kt.resolved(type);
        if (type.kind === 'param' && type.sym.owner === fn)
            return Kt.nullableAny();
        if (type.kind === 'param' && fn.java !== null && fn.java !== undefined)
            return type.sym.bounds.length > 0 ? Kt.makeNotNull(type.sym.bounds[0]) : Kt.anyType();
        if (type.flexible)
            return Kt.withNullability(type, false);
        return type;
    }

    Checker.prototype.findOverrides = function (sym) {
        var self = this;
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                var inherited = self.inheritedMembers(sym, name).filter(function (item) {
                    if (item.member.isStatic)
                        return false;
                    if (member.kind === 'fun')
                        return item.member.kind === 'fun' && sameSignature(member, item.member, item.map);
                    return item.member.kind === 'prop' && (item.member.receiver === null) === (member.receiver === null);
                });
                // A property may override a Java getter: val size: Int overrides size()/getSize().
                if (member.kind === 'prop' && inherited.length === 0)
                    inherited = self.javaGetterOverrides(sym, member);
                if (inherited.length === 0) {
                    if (member.isOverride && !member.synthetic && sym.node !== null)
                        self.error(member.node || sym.node, '\'' + member.name + '\' overrides nothing.');
                    return;
                }
                var target = inherited[0].member;
                if (!member.isOverride && !member.synthetic && sym.node !== null && !sym.mappedBuiltin) {
                    var what = member.kind === 'fun' ? 'function' : 'property';
                    self.error(member.node || sym.node, '\'' + member.name + '\' hides member of supertype \'' +
                               inherited[0].type.sym.name + '\' and needs an \'override\' modifier.');
                    void what;
                }
                if (target.mods.final || (target.java !== null && target.java !== undefined && target.java.mods &&
                                          target.java.mods.final && !target.java.isStatic)) {
                    if (!sym.mappedBuiltin)
                        self.error(member.node || sym.node, '\'' + member.name + '\' in \'' + inherited[0].type.sym.name +
                                   '\' is final and cannot be overridden.');
                }
                member.overrides = target;
                member.overridden = inherited.map(function (item) { return item.member; });
                // An override of an operator (or infix) function is one too.
                if (member.kind === 'fun' && inherited.some(function (item) { return item.member.operator; }))
                    member.operator = true;
                if (member.kind === 'fun' && inherited.some(function (item) { return item.member.infix; }))
                    member.infix = true;
                // An override takes the default values of the overridden function.
                if (member.kind === 'fun') {
                    inherited.forEach(function (item) {
                        item.member.params.forEach(function (param, index) {
                            var own = member.params[index];
                            if (own !== undefined && param.hasDefault && !own.hasDefault) {
                                own.hasDefault = true;
                                own.inheritedDefault = { fn: item.member, index: index };
                                member.hasDefaults = true;
                            }
                        });
                    });
                }
                if (member.kind === 'prop' && member.type === null && target.type !== null)
                    member.type = Kt.subst(target.type, inherited[0].map);
            });
        });
    };

    Checker.prototype.javaGetterOverrides = function (sym, prop) {
        var name = prop.name;
        var result = [];
        var self = this;
        ['get' + name.charAt(0).toUpperCase() + name.substring(1), name].forEach(function (javaName) {
            self.inheritedMembers(sym, javaName).forEach(function (item) {
                if (item.member.kind === 'fun' && item.member.params.length === 0 && item.member.java !== null && item.member.java !== undefined)
                    result.push(item);
            });
        });
        return result;
    };

    // toString(), equals(Any?), hashCode() keep their JavaScript names (the
    // run time of Java calls them so).
    var SPECIAL = { 'toString/0': 'toString', 'equals/1': 'equals', 'hashCode/0': 'hashCode' };

    function mangledType(type) {
        type = Kt.resolved(type);
        switch (type.kind) {
        case 'class':
            return type.sym.name;
        case 'fun':
            return 'Function' + type.params.length;
        case 'param':
            return type.sym.bounds.length > 0 ? mangledType(type.sym.bounds[0]) : 'Any';
        }
        return 'Any';
    }
    Kt.mangledType = mangledType;

    Checker.prototype.assignJsNames = function (sym) {
        var used = Object.create(null);
        // The names of the supertypes are taken.
        Kt.directSupertypes(sym.thisType()).forEach(function (superType) {
            Kt.supertypeClosure(Kt.resolved(superType)).forEach(function (type) {
                var owner = type.sym;
                Object.keys(owner.members).forEach(function (name) {
                    owner.members[name].forEach(function (member) {
                        if (member.kind === 'fun' && member.jsName !== null)
                            used[member.jsName] = member;
                    });
                });
            });
        });
        var javaFields = this.javaFieldNames(sym);
        Object.keys(sym.members).forEach(function (name) {
            sym.members[name].forEach(function (member) {
                if (member.kind === 'fun') {
                    if (member.overrides !== null) {
                        member.jsName = member.overrides.jsName;
                        return;
                    }
                    var count = member.params.length + (member.receiver !== null ? 1 : 0);
                    var key = name + '/' + count;
                    var candidate = SPECIAL[key] !== undefined && member.receiver === null &&
                        (key !== 'equals/1' || Kt.isClass(member.params[0].type, 'Any'))
                        ? SPECIAL[key] : T.jsName(name) + '$' + count;
                    if (used[candidate] !== undefined && used[candidate] !== member)
                        candidate += '$' + member.params.map(function (param) { return mangledType(param.type); }).join('$');
                    while (used[candidate] !== undefined && used[candidate] !== member)
                        candidate += '_';
                    member.jsName = candidate;
                    used[candidate] = member;
                } else {
                    var accessorBase = name.charAt(0).toUpperCase() + name.substring(1);
                    if (member.overrides !== null) {
                        var target = member.overrides;
                        if (target.kind === 'fun') {
                            // A property over a Java getter.
                            member.getterName = target.jsName;
                        } else {
                            member.getterName = target.getterName;
                            member.setterName = target.setterName;
                        }
                    }
                    if (member.getterName === null)
                        member.getterName = (/^is[A-Z]/.test(name) ? name : 'get' + accessorBase) + '$0';
                    if (member.setterName === null && member.mutable)
                        member.setterName = 'set' + accessorBase.replace(/^Is(?=[A-Z])/, '') + '$1';
                    if (member.jsName === null) {
                        var field = T.propertyName(name);
                        if (javaFields[field] === true)
                            field += '$k';
                        member.jsName = field;
                    }
                }
            });
        });
        sym.ctors.forEach(function (ctor, index) {
            ctor.jsName = '$init' + (sym.ctors.length > 1 ? index : '');
        });
    };

    // The field names of the Java superclasses (Throwable has "message").
    Checker.prototype.javaFieldNames = function (sym) {
        var names = Object.create(null);
        var current = sym.superclass;
        while (current !== null && current !== undefined) {
            var superSym = Kt.resolved(current).sym;
            if (superSym === undefined)
                break;
            superSym.complete();
            if (superSym.java !== null && superSym.java !== undefined) {
                var javaSym = superSym.java;
                while (javaSym !== null && javaSym !== undefined) {
                    javaSym.complete();
                    Object.keys(javaSym.fields).forEach(function (name) {
                        var field = javaSym.fields[name];
                        if (!field.isStatic)
                            names[field.jsName || T.propertyName(name)] = true;
                    });
                    javaSym = javaSym.superclass !== null ? javaSym.superclass.sym : null;
                }
                break;
            }
            current = superSym.superclass;
        }
        return names;
    };

    // --- Members of types

    // The members of a type by name (functions and properties), the
    // overridden ones hidden: [{ member, map, type }].
    Checker.prototype.membersOf = function (type, name) {
        type = Kt.resolved(type);
        if (type.kind === 'param') {
            var bounds = type.sym.bounds.length > 0 ? type.sym.bounds : [Kt.nullableAny()];
            var result = [];
            var self = this;
            bounds.forEach(function (bound) {
                self.membersOf(bound, name).forEach(function (item) {
                    if (!result.some(function (seen) { return seen.member === item.member; }))
                        result.push(item);
                });
            });
            return result;
        }
        if (type.kind === 'fun')
            return this.functionTypeMembers(type, name);
        if (type.kind === 'nothing')
            return [];
        if (type.kind !== 'class')
            return [];
        var found = [];
        var closure = Kt.supertypeClosure(Kt.withNullability(type, false));
        var hidden = [];
        closure.forEach(function (current) {
            var owner = current.sym;
            owner.complete();
            var members;
            if (owner.java !== null && owner.java !== undefined && !owner.mappedBuiltin)
                members = Kt.javaMembers(owner, name, false);
            else
                members = owner.members[name] || [];
            var map = Kt.typeMap(current);
            members.forEach(function (member) {
                if (member.isStatic)
                    return;
                if (hidden.indexOf(member) >= 0)
                    return;
                // A Java method overridden lower in the hierarchy (same erased signature).
                if (member.java !== null && member.java !== undefined && found.some(function (item) {
                    return item.member.kind === member.kind && item.member.java !== null && item.member.java !== undefined &&
                        item.member.jsName === member.jsName;
                }))
                    return;
                found.push({ member: member, map: map, type: current });
                (member.overridden || []).forEach(function (other) { hidden.push(other); });
            });
        });
        return found.filter(function (item) { return hidden.indexOf(item.member) < 0; });
    };

    // invoke of a function type.
    Checker.prototype.functionTypeMembers = function (type, name) {
        if (name !== 'invoke')
            return this.membersOf(Kt.anyType(), name);
        var fn = Kt.FunSym('invoke', null, { operator: true });
        fn.params = Kt.funParams(type).map(function (param, index) { return Kt.ParamSym('p' + (index + 1), param); });
        fn.returns = type.returns;
        fn.operator = true;
        fn.intrinsic = 'invoke';
        fn.suspend = type.suspend;
        return [{ member: fn, map: new Map(), type: type }];
    };

    // Static members of a class: Java statics, enum entries; companion members come separately.
    Checker.prototype.staticsOf = function (sym, name) {
        sym.complete();
        if (sym.java !== null && sym.java !== undefined && !sym.mappedBuiltin)
            return Kt.javaMembers(sym, name, true).map(function (member) { return { member: member, map: new Map(), type: null }; });
        var statics = (sym.statics[name] || []).map(function (member) { return { member: member, map: new Map(), type: null }; });
        // Integer.toBinaryString: the statics of the Java class of a builtin.
        if (statics.length === 0 && sym.javaStatics !== undefined &&
            (sym.companion === null || (sym.companion.complete().members[name] || []).length === 0))
            statics = this.staticsOf(sym.javaStatics(), name);
        return statics;
    };
})(globalThis);
