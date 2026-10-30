// C#: the symbol table of a session - namespaces, user types and the
// library. The library is C# sources (library-*.js) split into units, one
// per top-level type; a unit is parsed when its type is first looked up
// and translated when it is first used at run time.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.Symtab)
        return;

    // Library units: id -> { id, ns, text }; the full name with the arity ->
    // unit id; namespaces; extension methods: namespace -> method name ->
    // [full names of the static classes].
    CS.library = CS.library || { units: Object.create(null), index: Object.create(null), namespaces: Object.create(null),
                                 extensions: Object.create(null), sources: [] };

    var TYPE_LINE = /^(?:(?:public|internal|static|abstract|sealed|readonly|partial|ref|unsafe|file)\s+)*(?:record\s+(?:class\s+|struct\s+)?|class\s+|struct\s+|interface\s+|enum\s+)([A-Za-z_][A-Za-z0-9_]*)\s*(<[^>]*>)?/;
    var DELEGATE_LINE = /^(?:(?:public|internal)\s+)*delegate\s+.*?([A-Za-z_][A-Za-z0-9_]*)\s*(<[^>]*>)?\s*\(/;
    var EXTENSION = /\bstatic\b[^(;{=]*?\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:<[\w\s,]*>)?\s*\(\s*this\b/;

    function arityOf(generic) {
        if (!generic)
            return 0;
        return generic.split(',').length;
    }

    function registerNamespace(qname) {
        var parts = qname.split('.');
        for (var index = 1; index <= parts.length; ++index)
            CS.library.namespaces[parts.slice(0, index).join('.')] = true;
    }

    // A library source: using directives, one file-scoped namespace, then
    // top-level types starting at the beginning of a line (attribute lines
    // before a type belong to it). Every unit keeps the header and the
    // original line numbers.
    CS.addLibrary = function (id, text) {
        var library = CS.library;
        var lines = text.split('\n');
        var header = [];
        var ns = '';
        var index = 0;
        while (index < lines.length && (/^\s*$/.test(lines[index]) || /^(global )?using /.test(lines[index]) ||
                                        /^namespace /.test(lines[index]) || /^\/\//.test(lines[index]))) {
            var nsMatch = /^namespace\s+([A-Za-z0-9_.]+)\s*;/.exec(lines[index]);
            if (nsMatch !== null)
                ns = nsMatch[1];
            header.push(lines[index++]);
        }
        if (ns !== '')
            registerNamespace(ns);
        var starts = [];
        for (; index < lines.length; ++index) {
            var line = lines[index];
            var found = TYPE_LINE.exec(line) || DELEGATE_LINE.exec(line);
            if (found === null)
                continue;
            var start = index;
            while (start > 0 && /^\[/.test(lines[start - 1]))
                --start;
            starts.push({ line: start, name: found[1], arity: arityOf(found[2]) });
        }
        starts.forEach(function (item, number) {
            var end = number + 1 < starts.length ? starts[number + 1].line : lines.length;
            var padding = new Array(item.line - header.length + 1).join('\n');
            var key = CS.arityKey(item.name, item.arity);
            var unitId = id + '/' + key;
            var body = lines.slice(item.line, end);
            library.units[unitId] = { id: unitId, ns: ns, text: header.join('\n') + '\n' + padding + body.join('\n') };
            library.index[(ns === '' ? '' : ns + '.') + key] = unitId;
            body.forEach(function (bodyLine) {
                var extension = EXTENSION.exec(bodyLine);
                if (extension === null)
                    return;
                var byName = library.extensions[ns] = library.extensions[ns] || Object.create(null);
                var owners = byName[extension[1]] = byName[extension[1]] || [];
                var owner = (ns === '' ? '' : ns + '.') + key;
                if (owners.indexOf(owner) < 0)
                    owners.push(owner);
            });
        });
        library.sources.push(id);
    };

    function Symtab(session) {
        this.session = session;
        this.global = new CS.NamespaceSymbol('', null);
        this.loadedUnits = Object.create(null);
        // Library units parsed but not translated yet.
        this.pendingUnits = [];
        this.units = [];
        this.specials = Object.create(null);
        CS.symtab = this;
    }
    CS.Symtab = Symtab;

    // A namespace by its full name; null if neither the library nor the
    // user has it.
    Symtab.prototype.namespace = function (qname) {
        if (qname === '')
            return this.global;
        var parts = qname.split('.');
        var current = this.global;
        for (var index = 0; index < parts.length; ++index) {
            var next = current.namespaces[parts[index]];
            if (next === undefined) {
                if (CS.library.namespaces[parts.slice(0, index + 1).join('.')] !== true)
                    return null;
                next = current.child(parts[index]);
            }
            current = next;
        }
        return current;
    };

    // A namespace of the user (created when declared).
    Symtab.prototype.declareNamespace = function (qname) {
        var current = this.global;
        if (qname === '')
            return current;
        qname.split('.').forEach(function (part) { current = current.child(part); });
        return current;
    };

    // A type in a namespace by name and arity: the user's, then the library's.
    Symtab.prototype.typeIn = function (ns, name, arity) {
        var key = CS.arityKey(name, arity);
        var found = ns.types[key];
        if (found !== undefined)
            return found;
        var qkey = ns.qname === '' ? key : ns.qname + '.' + key;
        var unitId = CS.library.index[qkey];
        if (unitId === undefined)
            return null;
        this.loadUnit(unitId);
        return ns.types[key] || null;
    };

    // Whether a namespace has a type with this name (any arity).
    Symtab.prototype.hasTypeNamed = function (ns, name) {
        if (Object.keys(ns.types).some(function (key) { return key === name || key.indexOf(name + '`') === 0; }))
            return true;
        var prefix = (ns.qname === '' ? '' : ns.qname + '.') + name;
        return Object.keys(CS.library.index).some(function (key) { return key === prefix || key.indexOf(prefix + '`') === 0; });
    };

    // A type by its full name with the arity (System.Collections.Generic.List`1);
    // nested types with '+' (System.Collections.Generic.List`1+Enumerator).
    Symtab.prototype.typeNamed = function (qname) {
        var nested = qname.split('+');
        var outer = nested[0];
        var dot = outer.lastIndexOf('.');
        var nsName = dot < 0 ? '' : outer.substring(0, dot);
        var simple = outer.substring(dot + 1);
        var parts = /^([^`]+)(?:`(\d+))?$/.exec(simple);
        var ns = this.namespace(nsName);
        var sym = ns === null ? null : this.typeIn(ns, parts[1], parts[2] ? Number(parts[2]) : 0);
        for (var index = 1; sym !== null && index < nested.length; ++index) {
            var inner = /^([^`]+)(?:`(\d+))?$/.exec(nested[index]);
            sym.complete();
            sym = sym.nestedTypes[CS.arityKey(inner[1], inner[2] ? Number(inner[2]) : 0)] || null;
        }
        if (sym === null)
            throw new Error('C# library type is missing: ' + qname);
        return sym;
    };

    // A predefined type by keyword: int, string, object...
    Symtab.prototype.special = function (keyword) {
        var known = this.specials[keyword];
        if (known !== undefined)
            return known;
        var sym = this.typeNamed(CS.SPECIAL_NAMES[keyword]);
        sym.special = keyword;
        var type = CS.named(sym, []);
        this.specials[keyword] = type;
        return type;
    };

    Symtab.prototype.loadUnit = function (unitId) {
        if (this.loadedUnits[unitId])
            return;
        this.loadedUnits[unitId] = true;
        var unit = CS.library.units[unitId];
        var tree = CS.parse(unit.text, T.LIBRARY_SOURCE);
        var record = { id: unitId, ns: unit.ns, tree: tree, types: [], compiled: false };
        var checker = new CS.Checker(this.session, T.LIBRARY_SOURCE);
        checker.library = true;
        record.checker = checker;
        checker.enterLibraryUnit(tree, record);
        this.pendingUnits.push(record);
        this.units.push(record);
    };

    // The static classes of a namespace that declare extension methods
    // with this name.
    Symtab.prototype.extensionClasses = function (ns, name) {
        var result = [];
        var byName = CS.library.extensions[ns.qname];
        var self = this;
        if (byName !== undefined && byName[name] !== undefined) {
            byName[name].forEach(function (qname) {
                var sym = self.typeNamed(qname);
                if (result.indexOf(sym) < 0)
                    result.push(sym);
            });
        }
        // Static classes of the user in the namespace.
        Object.keys(ns.types).forEach(function (key) {
            var sym = ns.types[key];
            if (!sym.library && sym.kind === 'class' && sym.mods.static && sym.typeParams.length === 0 &&
                sym.container === ns && sym.hasExtensions && result.indexOf(sym) < 0)
                result.push(sym);
        });
        return result;
    };
})(globalThis);
