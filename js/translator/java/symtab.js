// Java: the class table of a session and the library. The library is
// sources in Java (library-*.js) split into compilation units; a unit is
// parsed when any of its classes is first used, and translated together
// with the unit of code that pulled it in.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.Symtab)
        return;

    // Library compilation units: id -> { pkg, text }; full class name -> id.
    Java.library = Java.library || { units: Object.create(null), index: Object.create(null), packages: Object.create(null) };

    // Packages a unit sees without import (as jshell).
    Java.AUTO_PACKAGES = ['java.lang', 'java.util', 'java.util.function', 'java.util.stream', 'java.util.concurrent',
                          'java.util.concurrent.atomic', 'java.util.regex', 'java.math', 'java.io', 'js'];

    // A library source is split into compilation units - one per top-level
    // class (a declaration from the start of a line up to the next one):
    // only the class that is used gets parsed and translated. Every
    // compilation unit keeps the imports of the source and the original
    // line numbers.
    Java.addLibrary = function (id, pkg, text) {
        var library = Java.library;
        library.units[id] = { id: id, pkg: pkg, text: null };
        var lines = text.split('\n');
        var header = [];
        var index = 0;
        while (index < lines.length && (/^\s*$/.test(lines[index]) || /^import /.test(lines[index])))
            header.push(lines[index++]);
        var pattern = /^(?:public |abstract |final |sealed |non-sealed )*(?:class|interface|enum|record|@interface) +([A-Za-z0-9_]+)/;
        var starts = [];
        for (; index < lines.length; ++index) {
            var found = pattern.exec(lines[index]);
            if (found !== null)
                starts.push({ line: index, name: found[1] });
        }
        starts.forEach(function (start, number) {
            var end = number + 1 < starts.length ? starts[number + 1].line : lines.length;
            var padding = new Array(start.line - header.length + 1).join('\n');
            var unitId = id + '/' + start.name;
            library.units[unitId] = { id: unitId, pkg: pkg, text: header.join('\n') + '\n' + padding + lines.slice(start.line, end).join('\n') };
            library.index[pkg + '.' + start.name] = unitId;
            (library.packages[pkg] = library.packages[pkg] || []).push(start.name);
        });
    };

    function Symtab(session) {
        this.session = session;
        session.symtab = this;
        this.classes = Object.create(null);
        this.loadedUnits = Object.create(null);
        // Compilation units parsed but not translated yet.
        this.pendingUnits = [];
        this.units = [];
        this.object = null;
        Java.symtab = this;
        this.object = this.classNamed('java.lang.Object');
    }
    Java.Symtab = Symtab;

    Symtab.prototype.lookupQualified = function (qname) {
        var known = this.classes[qname];
        if (known !== undefined)
            return known;
        var unitId = Java.library.index[qname];
        if (unitId === undefined) {
            // A nested class: java.util.Map.Entry.
            var dot = qname.lastIndexOf('.');
            if (dot > 0) {
                var outer = this.lookupQualified(qname.substring(0, dot));
                if (outer !== null) {
                    outer.complete();
                    var member = Java.findMemberType(outer, qname.substring(dot + 1));
                    if (member !== null)
                        return member;
                }
            }
            return null;
        }
        this.loadUnit(unitId);
        return this.classes[qname] || null;
    };

    Symtab.prototype.classNamed = function (qname) {
        var sym = this.lookupQualified(qname);
        if (sym === null)
            throw new Error('Java library class is missing: ' + qname);
        return sym;
    };

    // A simple name from the packages without import.
    Symtab.prototype.lookupAuto = function (name) {
        for (var index = 0; index < Java.AUTO_PACKAGES.length; ++index) {
            var qname = Java.AUTO_PACKAGES[index] + '.' + name;
            if (Java.library.index[qname] !== undefined || this.classes[qname] !== undefined)
                return this.lookupQualified(qname);
        }
        return null;
    };

    Symtab.prototype.loadUnit = function (unitId) {
        if (this.loadedUnits[unitId])
            return;
        this.loadedUnits[unitId] = true;
        var unit = Java.library.units[unitId];
        var tree = Java.parse(unit.text, T.LIBRARY_SOURCE);
        var record = { id: unitId, pkg: unit.pkg, tree: tree, classes: [] };
        Java.enterUnit(this, tree, unit.pkg, record);
        this.pendingUnits.push(record);
        this.units.push(record);
    };

    Symtab.prototype.register = function (sym) {
        this.classes[sym.qname] = sym;
    };
})(globalThis);
