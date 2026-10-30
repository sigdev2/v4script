// C#: checking - scopes, types from the syntax, entering the declarations
// of a unit. Members are in checker-members.js, expressions, calls,
// operators, statements and patterns in checker-*.js. Messages are those
// of csc.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.Checker)
        return;

    var CompileError = T.CompileError;

    // Namespaces a unit sees without using: those of a .NET console project
    // and a few more (see docs/languages/csharp.md).
    CS.IMPLICIT_USINGS = ['System', 'System.Collections.Generic', 'System.IO', 'System.Linq', 'System.Threading',
                          'System.Threading.Tasks', 'System.Text', 'System.Text.RegularExpressions', 'System.Numerics',
                          'System.Diagnostics', 'V4Script'];

    // A scope: namespace (with using directives), type, method, block,
    // lambda.
    function Scope(kind, parent, fields) {
        this.kind = kind;
        this.parent = parent;
        this.locals = null;
        this.typeParams = null;
        if (fields)
            Object.keys(fields).forEach(function (key) { this[key] = fields[key]; }, this);
    }
    Scope.prototype.child = function (kind, fields) {
        return new Scope(kind, this, fields);
    };
    Scope.prototype.declare = function (local) {
        if (this.locals === null)
            this.locals = Object.create(null);
        this.locals[local.name] = local;
    };
    Scope.prototype.enclosing = function (kind) {
        for (var scope = this; scope !== null; scope = scope.parent) {
            if (scope.kind === kind)
                return scope;
        }
        return null;
    };
    // The nearest scope of a function: a method, a local function or a lambda.
    Scope.prototype.functionScope = function () {
        for (var scope = this; scope !== null; scope = scope.parent) {
            if (scope.kind === 'method' || scope.kind === 'lambda')
                return scope;
        }
        return null;
    };
    // The type whose code this is.
    Scope.prototype.currentType = function () {
        var scope = this.enclosing('type');
        return scope === null ? null : scope.sym;
    };
    CS.Scope = Scope;

    function Checker(session, source) {
        this.session = session;
        this.symtab = session.symtab;
        this.source = source || '';
        this.library = false;
        this.deferredConstraints = null;
    }
    CS.Checker = Checker;

    Checker.prototype.error = function (node, code, message) {
        throw new CompileError('error ' + code + ': ' + message, node ? node.line : 0, node ? node.column : 0, this.source);
    };

    // --- Using directives

    // The scope of a namespace: the namespace symbol and the using
    // directives (namespaces, aliases, static types).
    Checker.prototype.namespaceScope = function (ns, usings, parent, implicit) {
        var scope = new Scope('namespace', parent, { ns: ns, usingNamespaces: [], aliases: Object.create(null),
                                                     usingStatic: [], usingNodes: usings });
        var self = this;
        if (implicit) {
            CS.IMPLICIT_USINGS.forEach(function (name) {
                var used = self.symtab.namespace(name);
                if (used !== null)
                    scope.usingNamespaces.push(used);
            });
            (this.session.hostStatics || []).forEach(function (name) {
                scope.usingStatic.push({ qname: name, type: null });
            });
        }
        // The using directives are resolved in the scope of the namespace
        // without them (as in C#: they do not see each other).
        var resolveScope = new Scope('namespace', parent, { ns: ns, usingNamespaces: [], aliases: Object.create(null),
                                                            usingStatic: [] });
        usings.forEach(function (directive) {
            if (directive.alias !== null) {
                scope.aliases[directive.alias] = self.namespaceOrType(directive.target, resolveScope);
                return;
            }
            if (directive.isStatic) {
                var staticType = self.resolveType(directive.target, resolveScope);
                if (staticType.kind !== 'named')
                    self.error(directive, 'CS0138', "A 'using namespace' directive can only be applied to namespaces; '" +
                               CS.typeName(staticType) + "' is a type not a namespace. Consider a 'using static' directive instead");
                scope.usingStatic.push({ qname: null, type: staticType });
                return;
            }
            var target = self.namespaceOrType(directive.target, resolveScope);
            if (target.symbolKind === 'type' || target.kind === 'named')
                self.error(directive, 'CS0138', "A 'using namespace' directive can only be applied to namespaces; '" +
                           (target.kind === 'named' ? CS.typeName(target) : target.qname) +
                           "' is a type not a namespace. Consider a 'using static' directive instead");
            if (scope.usingNamespaces.indexOf(target) < 0)
                scope.usingNamespaces.push(target);
        });
        return scope;
    };

    // A namespace or a type from a name in a using directive.
    Checker.prototype.namespaceOrType = function (node, scope) {
        var found = this.lookupNamespaceOrType(node, scope);
        if (found === null)
            this.error(node, 'CS0246', "The type or namespace name '" + this.nodeName(node) +
                       "' could not be found (are you missing a using directive or an assembly reference?)");
        return found;
    };

    Checker.prototype.nodeName = function (node) {
        switch (node.k) {
        case 'tname':
            return node.name;
        case 'qname':
            return node.right.name;
        case 'alias':
            return node.name.name;
        case 'predef':
            return node.name;
        }
        return '?';
    };

    // A namespace symbol or a type for a name node (tname, qname, alias).
    Checker.prototype.lookupNamespaceOrType = function (node, scope) {
        switch (node.k) {
        case 'predef':
            return CS.special(node.name);
        case 'tname': {
            var arity = node.args === null ? 0 : node.args.length;
            var found = this.lookupSimpleTypeName(node.name, arity, scope, node);
            if (found === null)
                return null;
            if (found.kind === 'namespace')
                return found;
            if (found.kind === 'tparam' || found.kind === 'named' || found.kind === 'array')
                return found;
            return this.constructType(found, node, scope, null);
        }
        case 'alias': {
            if (node.alias !== 'global')
                this.error(node, 'CS0432', "Alias '" + node.alias + "' not found");
            var inner = node.name;
            var innerArity = inner.args === null ? 0 : inner.args.length;
            var global = this.symtab.global;
            if (innerArity === 0) {
                var nsChild = this.symtab.namespace(inner.name);
                if (nsChild !== null)
                    return nsChild;
            }
            var globalType = this.symtab.typeIn(global, inner.name, innerArity);
            return globalType === null ? null : this.constructType(globalType, inner, scope, null);
        }
        case 'qname': {
            var left = this.lookupNamespaceOrType(node.left, scope);
            if (left === null)
                this.error(node.left, 'CS0246', "The type or namespace name '" + this.nodeName(node.left) +
                           "' could not be found (are you missing a using directive or an assembly reference?)");
            var right = node.right;
            var rightArity = right.args === null ? 0 : right.args.length;
            if (left.kind === 'namespace') {
                if (rightArity === 0) {
                    var subNamespace = this.symtab.namespace(left.qname === '' ? right.name : left.qname + '.' + right.name);
                    if (subNamespace !== null)
                        return subNamespace;
                }
                var member = this.symtab.typeIn(left, right.name, rightArity);
                if (member === null) {
                    this.error(right, 'CS0234', "The type or namespace name '" + right.name + "' does not exist in the namespace '" +
                               left.qname + "' (are you missing an assembly reference?)");
                }
                return this.constructType(member, right, scope, null);
            }
            if (left.kind === 'named') {
                var nested = CS.findNestedType(left.sym.complete(), right.name, rightArity);
                if (nested === null)
                    this.error(right, 'CS0426', "The type name '" + right.name + "' does not exist in the type '" +
                               CS.typeName(left) + "'");
                return this.constructType(nested, right, scope, left);
            }
            this.error(node, 'CS0246', "The type or namespace name '" + right.name + "' could not be found");
            break;
        }
        }
        return null;
    };

    // A type symbol with the type arguments of the node: List<int>; outer -
    // the constructed outer type of a nested type.
    Checker.prototype.constructType = function (sym, node, scope, outer) {
        var self = this;
        var args = node.args === null ? [] : node.args;
        if (args.unbound) {
            var unbound = CS.named(sym, sym.allTypeParams.map(CS.typeParam));
            unbound.unbound = true;
            return unbound;
        }
        var own = args.map(function (arg) { return self.resolveType(arg, scope); });
        own.forEach(function (arg, index) {
            if (arg.kind === 'void' || (arg.kind === 'named' && arg.sym.isStatic()))
                self.error(args[index], arg.kind === 'void' ? 'CS1547' : 'CS0718',
                           arg.kind === 'void' ? "Keyword 'void' cannot be used in this context"
                                               : "'" + CS.typeName(arg) + "': static types cannot be used as type arguments");
        });
        if (own.length !== sym.typeParams.length)
            this.arityError(node, sym);
        var type;
        if (sym.allTypeParams.length > sym.typeParams.length) {
            var outerType = outer;
            if (outerType === null) {
                // A nested type of a generic type named from inside it: the
                // outer parameters are the ones in scope.
                outerType = this.enclosingInstance(sym.container, scope);
            }
            type = CS.nestedIn(outerType, sym, own);
        } else {
            type = CS.named(sym, own);
        }
        this.checkConstraints(type, node);
        return type;
    };

    Checker.prototype.arityError = function (node, sym) {
        if (sym.typeParams.length === 0)
            this.error(node, 'CS0308', "The non-generic type '" + CS.symbolTypeName(sym) + "' cannot be used with type arguments");
        this.error(node, 'CS0305', "Using the generic type '" + CS.symbolTypeName(sym) + "' requires " +
                   sym.typeParams.length + ' type arguments');
    };

    // The constructed type of an outer generic type as seen from the scope
    // (its own parameters if the code is inside it).
    Checker.prototype.enclosingInstance = function (outerSym, scope) {
        for (var current = scope; current !== null; current = current.parent) {
            if (current.kind === 'type') {
                for (var sym = current.sym; sym !== null && sym.symbolKind === 'type'; sym = sym.container) {
                    if (sym === outerSym || CS.derivesFrom(sym, outerSym)) {
                        var self = CS.selfType(sym);
                        var found = CS.asSuper(self, outerSym);
                        return found !== null ? found : CS.selfType(outerSym);
                    }
                }
            }
        }
        return CS.selfType(outerSym);
    };

    // where T : ... - the arguments satisfy the constraints.
    Checker.prototype.checkConstraints = function (type, node) {
        if (type.kind !== 'named' || type.args.length === 0)
            return;
        var sym = type.sym;
        if (sym.state === 'completing' || sym.constraintsChecked === false)
            return;
        if (this.deferredConstraints !== null) {
            this.deferredConstraints.push({ type: type, node: node });
            return;
        }
        var map = CS.typeMap(type);
        var self = this;
        sym.allTypeParams.forEach(function (param, index) {
            var arg = type.args[index];
            if (arg === undefined || arg.kind === 'tparam' && arg.sym === param)
                return;
            self.checkConstraint(param, arg, map, node, sym);
        });
    };

    Checker.prototype.checkConstraint = function (param, arg, map, node, owner) {
        var constraints = param.constraints;
        var ownerName = owner.symbolKind === 'type' ? CS.symbolTypeName(owner) : this.methodText(owner);
        if (constraints.struct && !(CS.isValueType(arg) && !CS.isNullableValue(arg)))
            this.error(node, 'CS0453', "The type '" + CS.typeName(arg) + "' must be a non-nullable value type in order to use it as parameter '" +
                       param.name + "' in the generic type or method '" + ownerName + "'");
        if (constraints.class && !CS.isReferenceType(arg))
            this.error(node, 'CS0452', "The type '" + CS.typeName(arg) + "' must be a reference type in order to use it as parameter '" +
                       param.name + "' in the generic type or method '" + ownerName + "'");
        if (constraints.new && !this.hasDefaultConstructor(arg))
            this.error(node, 'CS0310', "'" + CS.typeName(arg) + "' must be a non-abstract type with a public parameterless constructor in order to use it as parameter '" +
                       param.name + "' in the generic type or method '" + ownerName + "'");
        var self = this;
        constraints.types.forEach(function (bound) {
            var target = CS.subst(bound, map);
            if (!CS.Conversions.isImplicitReferenceOrBoxingOrIdentity(arg, target))
                self.error(node, 'CS0311', "The type '" + CS.typeName(arg) + "' cannot be used as type parameter '" + param.name +
                           "' in the generic type or method '" + ownerName + "'. There is no implicit reference conversion from '" +
                           CS.typeName(arg) + "' to '" + CS.typeName(target) + "'.");
        });
    };

    Checker.prototype.hasDefaultConstructor = function (type) {
        if (type.kind === 'tparam')
            return type.sym.constraints.new || type.sym.constraints.struct || type.sym.constraints.unmanaged;
        if (type.kind !== 'named')
            return false;
        var sym = type.sym.complete();
        if (sym.kind === 'struct' || sym.kind === 'enum')
            return true;
        if (sym.kind !== 'class' || sym.mods.abstract || sym.mods.static)
            return false;
        return sym.ctors.some(function (ctor) {
            return ctor.access === 'public' && ctor.params.every(function (param) { return param.hasDefault || param.isParams; });
        });
    };

    // A simple type name: type parameters, nested types of the enclosing
    // types, namespaces from the innermost outward with their using
    // directives, types from host files.
    Checker.prototype.lookupSimpleTypeName = function (name, arity, scope, node) {
        for (var current = scope; current !== null; current = current.parent) {
            if (arity === 0 && current.typeParams !== null && current.typeParams[name] !== undefined)
                return CS.typeParam(current.typeParams[name]);
            if (current.kind === 'type') {
                var sym = current.sym;
                if (arity === 0 && sym.typeParamsByName !== undefined && sym.typeParamsByName[name] !== undefined)
                    return CS.typeParam(sym.typeParamsByName[name]);
                var nested = CS.findNestedType(sym.complete(), name, arity);
                if (nested !== null)
                    return nested;
                continue;
            }
            if (current.kind === 'namespace') {
                var ns = current.ns;
                if (arity === 0 && current.aliases[name] !== undefined)
                    return current.aliases[name];
                if (arity === 0) {
                    var child = this.symtab.namespace(ns.qname === '' ? name : ns.qname + '.' + name);
                    if (child !== null && ns.qname === '' && this.symtab.namespace(name) !== null)
                        return child;
                    if (child !== null && ns.qname !== '')
                        return child;
                }
                var own = this.symtab.typeIn(ns, name, arity);
                if (own !== null)
                    return own;
                var fromUsings = null;
                for (var index = 0; index < current.usingNamespaces.length; ++index) {
                    var used = this.symtab.typeIn(current.usingNamespaces[index], name, arity);
                    if (used !== null && fromUsings !== null && used !== fromUsings)
                        this.error(node, 'CS0104', "'" + name + "' is an ambiguous reference between '" +
                                   CS.runtimeName(fromUsings).replace(/`\d+/, '') + "' and '" + CS.runtimeName(used).replace(/`\d+/, '') + "'");
                    if (used !== null)
                        fromUsings = used;
                }
                if (fromUsings !== null)
                    return fromUsings;
            }
        }
        // A type from the host file Name.cs.
        if (arity === 0 && this.session.moduleType && !this.library) {
            var fromModule = this.session.moduleType(name);
            if (fromModule !== null)
                return fromModule;
        }
        return null;
    };

    // A type from the syntax. options: allowVar (var gives null),
    // allowVoid.
    Checker.prototype.resolveType = function (node, scope, options) {
        var self = this;
        switch (node.k) {
        case 'predef':
            if (node.name === 'void') {
                if (!(options && options.allowVoid))
                    this.error(node, 'CS1547', "Keyword 'void' cannot be used in this context");
                return CS.VOID;
            }
            return CS.special(node.name);
        case 'array': {
            var elem = this.resolveType(node.elem, scope);
            if (elem.kind === 'named' && elem.sym.isStatic())
                this.error(node, 'CS0719', "'" + CS.typeName(elem) + "': array elements cannot be of static type");
            return CS.arrayType(elem, node.rank);
        }
        case 'nullable': {
            var inner = this.resolveType(node.elem, scope);
            // T? of a reference type is an annotation only.
            if (CS.isValueType(inner) && !CS.isNullableValue(inner))
                return CS.nullableOf(inner);
            return inner;
        }
        case 'tuple': {
            var names = node.elems.map(function (elem) { return elem.name; });
            return CS.tupleType(node.elems.map(function (elem) { return self.resolveType(elem.type, scope); }), names);
        }
        case 'tname':
            if (node.name === 'var' && node.args === null && options && options.allowVar) {
                var varType = this.lookupSimpleTypeName('var', 0, scope, node);
                if (varType === null)
                    return null;
            }
            if (node.name === 'dynamic' && node.args === null && this.lookupSimpleTypeName('dynamic', 0, scope, node) === null)
                return CS.DYNAMIC;
            if (node.name === 'nint' || node.name === 'nuint') {
                if (this.lookupSimpleTypeName(node.name, 0, scope, node) === null)
                    return CS.special(node.name === 'nint' ? 'long' : 'ulong');
            }
            break;
        }
        var found = this.lookupNamespaceOrType(node, scope);
        if (found === null)
            this.error(node, 'CS0246', "The type or namespace name '" + this.nodeName(node) +
                       "' could not be found (are you missing a using directive or an assembly reference?)");
        if (found.kind === 'namespace')
            this.error(node, 'CS0118', "'" + found.qname + "' is a namespace but is used like a type");
        return found;
    };

    // --- Entering declarations

    // The types of a unit (or of a namespace) into their namespaces;
    // returns the symbols. scope - the scope of the container.
    Checker.prototype.enterNamespaceMembers = function (members, ns, scope, out) {
        var self = this;
        members.forEach(function (member) {
            if (member.k === 'namespace') {
                var nsScope = scope;
                var current = ns;
                var parts = member.name.split('.');
                parts.forEach(function (part, index) {
                    current = self.symtab.declareNamespace(current.qname === '' ? part : current.qname + '.' + part);
                    nsScope = self.namespaceScope(current, index === parts.length - 1 ? member.usings : [], nsScope, false);
                });
                self.enterNamespaceMembers(member.members, current, nsScope, out);
            } else if (member.k === 'type') {
                var sym = self.enterType(member, ns, scope);
                if (out.indexOf(sym) < 0)
                    out.push(sym);
            }
        });
        return out;
    };

    // A type symbol from a declaration and its nested types; the header and
    // the members come later (complete).
    Checker.prototype.enterType = function (node, container, scope) {
        var kind = node.kind;
        var partial = this.partialPart(node, container);
        if (partial !== null)
            return partial;
        var sym = new CS.TypeSymbol(node.name, kind, container);
        sym.node = node;
        sym.mods = node.mods || {};
        sym.attributes = node.attributes || [];
        sym.library = this.library;
        sym.checker = this;
        sym.isRecord = !!node.record;
        if (sym.isRecord)
            sym.mods.record = true;
        if (this.library && node.name === 'ValueTuple' && container.qname === 'System' && (node.typeParams || []).length > 0)
            sym.isTuple = true;
        // [V4Primitive("kind")] of the library: values of the type are
        // JavaScript values; number, string, boolean, array and function
        // types put their methods on the prototypes of those values.
        if (this.library) {
            sym.attributes.forEach(function (attribute) {
                if (attribute.name !== 'V4Primitive' || attribute.args.length !== 1)
                    return;
                var primitiveKind = attribute.args[0].expr.value;
                if (primitiveKind !== 'object' && primitiveKind !== 'array' && primitiveKind !== 'function')
                    sym.primitive = primitiveKind;
                if (['number', 'string', 'boolean', 'array', 'function'].indexOf(primitiveKind) >= 0)
                    sym.installPrimitive = primitiveKind;
            });
        }
        sym.access = CS.accessOf(sym.mods, container.kind === 'namespace' ? 'internal' : 'private');
        var outerParams = container.symbolKind === 'type' ? container.allTypeParams : [];
        sym.typeParams = (node.typeParams || []).map(function (param, index) {
            var typeParam = CS.TypeParamSymbol(param.name, sym, outerParams.length + index);
            typeParam.variance = param.variance;
            return typeParam;
        });
        sym.allTypeParams = outerParams.concat(sym.typeParams);
        sym.typeParamsByName = Object.create(null);
        sym.typeParams.forEach(function (param) { sym.typeParamsByName[param.name] = param; });
        sym.scope = scope.child('type', { sym: sym });
        var key = CS.arityKey(node.name, sym.typeParams.length);
        if (container.kind === 'namespace') {
            if (container.types[key] !== undefined && this.enteredHere && this.enteredHere.indexOf(container.types[key]) >= 0)
                this.error(node, 'CS0101', "The namespace '" + (container.qname === '' ? '<global namespace>' : container.qname) +
                           "' already contains a definition for '" + node.name + "'");
            container.types[key] = sym;
            if (this.enteredHere)
                this.enteredHere.push(sym);
            sym.qname = container.qname === '' ? node.name : container.qname + '.' + node.name;
        } else {
            if (container.nestedTypes[key] !== undefined)
                this.error(node, 'CS0102', "The type '" + CS.symbolTypeName(container) + "' already contains a definition for '" +
                           node.name + "'");
            container.nestedTypes[key] = sym;
            sym.qname = container.qname + '.' + node.name;
        }
        var self = this;
        (node.members || []).forEach(function (member) {
            if (member.k === 'type')
                self.enterType(member, sym, sym.scope);
        });
        sym.completer = function (target) { self.completeType(target); };
        node.sym = sym;
        return sym;
    };

    // Another part of a partial type of this unit: its members and base
    // types join the first part; null if the node starts a type.
    Checker.prototype.partialPart = function (node, container) {
        if (!node.mods || !node.mods.partial)
            return null;
        var key = CS.arityKey(node.name, (node.typeParams || []).length);
        var sym = container.kind === 'namespace' ? container.types[key] : container.nestedTypes[key];
        if (sym === undefined || !sym.mods.partial || sym.node === node)
            return null;
        if (container.kind === 'namespace' && !(this.enteredHere && this.enteredHere.indexOf(sym) >= 0) && !sym.library)
            return null;
        if (sym.kind !== node.kind)
            this.error(node, 'CS0261', "Partial declarations of '" + CS.symbolTypeName(sym) + "' must be all classes, all record classes, all structs, all record structs, or all interfaces");
        var first = sym.node;
        first.members = first.members.concat(node.members || []);
        first.baseList = (first.baseList || []).concat(node.baseList || []);
        first.constraints = (first.constraints || []).concat(node.constraints || []);
        first.mergedPartial = true;
        Object.keys(node.mods).forEach(function (name) {
            if (node.mods[name])
                sym.mods[name] = node.mods[name];
        });
        sym.attributes = sym.attributes.concat(node.attributes || []);
        sym.access = CS.accessOf(sym.mods, container.kind === 'namespace' ? 'internal' : 'private');
        var self = this;
        (node.members || []).forEach(function (member) {
            if (member.k === 'type')
                self.enterType(member, sym, sym.scope);
        });
        node.sym = sym;
        return sym;
    };

    // A library unit: its types go into the namespace of the unit.
    Checker.prototype.enterLibraryUnit = function (tree, record) {
        var ns = this.symtab.namespace(record.ns) || this.symtab.declareNamespace(record.ns);
        var unitScope = this.namespaceScope(this.symtab.global, tree.usings, null, false);
        var scope = unitScope;
        if (record.ns !== '') {
            var current = this.symtab.global;
            var self = this;
            record.ns.split('.').forEach(function (part) {
                current = current.child(part);
                scope = self.namespaceScope(current, [], scope, false);
            });
        }
        var self2 = this;
        tree.members.forEach(function (member) {
            if (member.k === 'namespace') {
                // A file-scoped namespace: its name is the full one.
                var start = record.types.length;
                self2.enterNamespaceMembers([member], self2.symtab.global, unitScope, record.types);
                record.types.slice(start).forEach(function (sym) { sym.unitRecord = record; });
                return;
            }
            if (member.k !== 'type')
                throw new Error('C# library unit ' + record.id + ': only types are allowed');
            var sym = self2.enterType(member, ns, scope);
            sym.unitRecord = record;
            record.types.push(sym);
        });
    };

    // --- Messages

    // A method as csc names it: Program.F(int, string).
    Checker.prototype.methodText = function (method) {
        var owner = method.owner && method.owner.symbolKind === 'type' && !method.owner.isSession
            ? CS.symbolTypeName(method.owner) + '.' : '';
        var name = method.isCtor ? CS.symbolTypeName(method.owner).replace(/<.*>$/, '').replace(/.*\./, '') : method.name;
        if (method.accessorOf)
            name = (method.accessorOf.isIndexer ? 'this' : method.accessorOf.name) + '.' + method.name.substring(0, 3);
        if (method.isLocal)
            owner = '';
        var typeParams = method.typeParams.length > 0 ? '<' + method.typeParams.map(function (param) { return param.name; }).join(', ') + '>' : '';
        return owner + name + typeParams + '(' + method.params.map(function (param) {
            return (param.isParams ? 'params ' : '') + (param.refKind ? param.refKind + ' ' : '') + CS.typeName(param.type);
        }).join(', ') + ')';
    };
})(globalThis);
