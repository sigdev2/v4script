// C++: namespaces, scopes and name lookup. A scope has members by name: an
// entity (a variable, a type, a namespace, a template) or an overload set
// { kind: 'functions', items }. Classes and namespaces are scopes
// themselves. Declarations of a unit change shared scopes through the
// transaction of the unit: a unit with an error rolls them back.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.Scope)
        return;

    var hasOwn = Object.prototype.hasOwnProperty;

    // --- Transactions

    function Transaction() {
        this.undo = [];
        // Entities declared in shared scopes: a later unit may redeclare them.
        this.declared = [];
    }
    Transaction.prototype.record = function (object, key) {
        var had = hasOwn.call(object, key);
        var value = object[key];
        this.undo.push(function () {
            if (had)
                object[key] = value;
            else
                delete object[key];
        });
    };
    Transaction.prototype.push = function (array, item) {
        array.push(item);
        this.undo.push(function () {
            var index = array.lastIndexOf(item);
            if (index >= 0)
                array.splice(index, 1);
        });
    };
    Transaction.prototype.onRollback = function (callback) {
        this.undo.push(callback);
    };
    Transaction.prototype.rollback = function () {
        for (var index = this.undo.length - 1; index >= 0; --index)
            this.undo[index]();
        this.undo = [];
    };
    X.Transaction = Transaction;

    // The transaction of the unit being compiled (null - the library).
    X.transaction = null;

    // Changes object[key] so that a rollback restores it.
    X.change = function (object, key, value) {
        if (X.transaction !== null)
            X.transaction.record(object, key);
        object[key] = value;
    };

    X.append = function (array, item) {
        if (X.transaction !== null)
            X.transaction.push(array, item);
        else
            array.push(item);
    };

    // --- Scopes

    function Namespace(name, parent) {
        this.kind = 'namespace';
        this.name = name;
        this.parent = parent;
        this.members = Object.create(null);
        this.usings = [];
        this.inlineNamespace = false;
        this.id = X.newId();
    }
    X.Namespace = Namespace;

    // A block, the parameters of a function, the parameters of a template,
    // a catch clause.
    function Scope(kind, parent) {
        this.kind = kind;
        this.parent = parent;
        this.members = Object.create(null);
        this.usings = [];
    }
    X.Scope = Scope;

    // The scope that keeps declarations made in scope (a template
    // parameter scope keeps nothing: its declaration goes to the parent).
    X.isPersistent = function (scope) {
        return scope.kind === 'namespace' || scope.isClass === true || scope.kind === 'enum';
    };

    // Adds a declaration to a scope. Functions join the overload set of the
    // name.
    X.declare = function (scope, name, entity) {
        // The library declarations of the name come first.
        X.ensure(scope, name);
        var members = scope.members;
        var persistent = X.isPersistent(scope);
        if (persistent && X.transaction !== null)
            X.transaction.declared.push(entity);
        if (entity.kind === 'func' || (entity.kind === 'template' && entity.what === 'function')) {
            var set = members[name];
            if (set === undefined || set.kind !== 'functions') {
                set = { kind: 'functions', name: name, items: [] };
                if (persistent)
                    X.change(members, name, set);
                else
                    members[name] = set;
            }
            if (set.items.indexOf(entity) >= 0)
                return;
            if (persistent)
                X.append(set.items, entity);
            else
                set.items.push(entity);
            return;
        }
        if (persistent)
            X.change(members, name, entity);
        else
            members[name] = entity;
    };

    // Replaces a function of an overload set (a declaration again).
    X.replaceFunction = function (set, old, entity) {
        var index = set.items.indexOf(old);
        if (index < 0)
            return;
        if (X.transaction !== null)
            X.transaction.record(set, 'items');
        set.items = set.items.slice();
        set.items[index] = entity;
    };

    X.removeFunction = function (set, entity) {
        var index = set.items.indexOf(entity);
        if (index < 0)
            return;
        if (X.transaction !== null)
            X.transaction.record(set, 'items');
        set.items = set.items.slice();
        set.items.splice(index, 1);
    };

    // --- Lookup

    // Namespaces nominated by the using-directives of a scope, transitively.
    function nominated(scope) {
        var result = [];
        var queue = scope.usings.slice();
        while (queue.length > 0) {
            var next = queue.shift();
            if (result.indexOf(next) >= 0 || next === scope)
                continue;
            result.push(next);
            next.usings.forEach(function (item) { queue.push(item); });
        }
        return result;
    }
    X.nominated = nominated;

    // Overload sets of one name from several scopes merged into one.
    function merge(found) {
        var functions = found.filter(function (entity) { return entity.kind === 'functions'; });
        var others = [];
        found.forEach(function (entity) {
            if (entity.kind !== 'functions' && others.indexOf(entity) < 0)
                others.push(entity);
        });
        if (others.length === 0) {
            if (functions.length === 1)
                return functions[0];
            var items = [];
            functions.forEach(function (set) {
                set.items.forEach(function (item) {
                    if (items.indexOf(item) < 0)
                        items.push(item);
                });
            });
            return { kind: 'functions', name: functions[0].name, items: items };
        }
        if (others.length === 1 && functions.length === 0)
            return others[0];
        return { kind: 'ambiguous', items: others.concat(functions) };
    }

    // A member of a class or of its bases: { entity, owner, offset } or
    // null. offset is that of the subobject owner in cls.
    X.lookupMember = function (cls, name) {
        var own = cls.members[name];
        if (own !== undefined)
            return { entity: own, owner: cls, offset: 0, path: [] };
        for (var index = 0; index < cls.bases.length; ++index) {
            var base = cls.bases[index];
            var found = X.lookupMember(base.type, name);
            if (found !== null)
                return { entity: found.entity, owner: found.owner, offset: base.offset + found.offset,
                         path: [base].concat(found.path) };
        }
        if (cls.usings.length > 0)
            return lookupUsings(cls, name);
        return null;
    };

    function lookupUsings(scope, name) {
        var found = [];
        nominated(scope).forEach(function (target) {
            X.ensure(target, name);
            var entity = target.members[name];
            if (entity !== undefined)
                found.push(entity);
        });
        return found.length === 0 ? null : { entity: merge(found), owner: scope, offset: 0, path: [] };
    }

    // The declarations of the library with a name are parsed when the name
    // is first looked up in their namespace (Session.loadChunks).
    X.ensure = function (scope, name) {
        var lazy = scope.lazy;
        if (lazy === undefined || lazy === null)
            return;
        var chunks = lazy[name];
        if (chunks !== undefined)
            scope.loadLazy(scope, name, chunks);
    };

    // A member of a namespace (or of another scope) without using-directives.
    X.member = function (scope, name) {
        X.ensure(scope, name);
        return scope.members[name];
    };

    // The entity of a name in one scope (with its using-directives), or null.
    X.lookupIn = function (scope, name) {
        if (scope.isClass === true) {
            var member = X.lookupMember(scope, name);
            return member === null ? null : member.entity;
        }
        X.ensure(scope, name);
        var direct = scope.members[name];
        if (scope.usings.length === 0)
            return direct === undefined ? null : direct;
        var found = direct !== undefined ? [direct] : [];
        nominated(scope).forEach(function (target) {
            X.ensure(target, name);
            var entity = target.members[name];
            if (entity !== undefined)
                found.push(entity);
        });
        if (found.length === 0)
            return null;
        if (direct !== undefined && direct.kind !== 'functions')
            return direct;
        return merge(found);
    };

    // Unqualified lookup from a scope outwards.
    X.lookup = function (scope, name) {
        for (var current = scope; current !== null && current !== undefined; current = current.parent) {
            var found = X.lookupIn(current, name);
            if (found !== null)
                return found;
        }
        return null;
    };

    // The scope a lookup found the name in (for captures of lambdas).
    X.lookupWithScope = function (scope, name) {
        for (var current = scope; current !== null && current !== undefined; current = current.parent) {
            var found = X.lookupIn(current, name);
            if (found !== null)
                return { entity: found, scope: current };
        }
        return null;
    };

    // The innermost enclosing namespace of a scope.
    X.enclosingNamespace = function (scope) {
        while (scope.kind !== 'namespace')
            scope = scope.parent;
        return scope;
    };

    // The innermost enclosing class of a scope or null.
    X.enclosingClass = function (scope) {
        for (var current = scope; current !== null && current !== undefined; current = current.parent) {
            if (current.isClass === true)
                return current;
            if (current.kind === 'namespace')
                return null;
        }
        return null;
    };

    // Whether a class is a base of another (or the same): the offset of the
    // base subobject, or -1. Ambiguity is not checked: the first path wins.
    X.baseOffset = function (derived, base) {
        derived = X.unqual(derived);
        base = X.unqual(base);
        if (derived === base)
            return 0;
        if (!derived.isClass || !base.isClass)
            return -1;
        for (var index = 0; index < derived.bases.length; ++index) {
            var item = derived.bases[index];
            var inner = X.baseOffset(item.type, base);
            if (inner >= 0)
                return item.offset + inner;
        }
        return -1;
    };

    X.isBaseOf = function (base, derived) {
        return X.baseOffset(derived, base) >= 0;
    };
})(globalThis);
