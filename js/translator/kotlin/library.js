// Kotlin: the library index. A library source is split into top-level
// declarations (from a line that starts at column 1 up to the next one),
// indexed by package and name: resolving "map" parses only the
// declarations named map. Every part keeps the package, the imports and
// the line numbers of its source.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Kt = T.kotlin;
    if (Kt.addLibrary)
        return;

    Kt.library = { units: Object.create(null), index: Object.create(null), packages: Object.create(null), order: [] };
    // Natives of the library: owner (a package or a class) -> signature -> function.
    Kt.natives = Kt.natives || Object.create(null);

    var MODIFIER_WORDS = {};
    ('public private internal protected open final abstract sealed data enum inner value inline infix operator suspend ' +
     'tailrec external const lateinit annotation companion expect actual override crossinline noinline reified')
        .split(' ').forEach(function (word) { MODIFIER_WORDS[word] = true; });

    // The kind and the name of a declaration from its text: { kind, name }.
    function declarationName(text) {
        var pos = 0;
        var length = text.length;
        function skipSpace() {
            while (pos < length && /\s/.test(text.charAt(pos)))
                ++pos;
        }
        function word() {
            var start = pos;
            while (pos < length && /[A-Za-z0-9_]/.test(text.charAt(pos)))
                ++pos;
            return text.substring(start, pos);
        }
        function skipBalanced(open, close) {
            var depth = 0;
            for (; pos < length; ++pos) {
                var ch = text.charAt(pos);
                if (ch === open)
                    ++depth;
                else if (ch === close && --depth === 0) {
                    ++pos;
                    return;
                }
            }
        }
        for (;;) {
            skipSpace();
            if (text.charAt(pos) === '@') {
                ++pos;
                word();
                while (text.charAt(pos) === '.') {
                    ++pos;
                    word();
                }
                if (text.charAt(pos) === '(')
                    skipBalanced('(', ')');
                continue;
            }
            var start = pos;
            var current = word();
            if (current === '')
                return null;
            if (MODIFIER_WORDS[current] === true)
                continue;
            switch (current) {
            case 'class':
            case 'interface':
            case 'object':
            case 'typealias':
                skipSpace();
                return { kind: current === 'typealias' ? 'alias' : 'class', name: word() };
            case 'fun':
            case 'val':
            case 'var': {
                skipSpace();
                if (current === 'fun' && text.substring(pos, pos + 9) === 'interface') {
                    pos += 9;
                    skipSpace();
                    return { kind: 'class', name: word() };
                }
                if (text.charAt(pos) === '<')
                    skipBalanced('<', '>');
                // Up to "(" (a function) or ":", "=", "by" (a property) at depth 0;
                // the name is the last identifier after a dot.
                var name = '';
                var depthAngle = 0, depthParen = 0;
                for (; pos < length; ++pos) {
                    var ch = text.charAt(pos);
                    if (ch === '<')
                        ++depthAngle;
                    else if (ch === '>' && text.charAt(pos - 1) !== '-')
                        --depthAngle;
                    else if (ch === '(' && depthAngle === 0) {
                        if (current === 'fun' && depthParen === 0 && /[A-Za-z0-9_]/.test(text.charAt(pos - 1)))
                            break;
                        ++depthParen;
                    } else if (ch === ')' && depthAngle === 0) {
                        --depthParen;
                    } else if (depthAngle === 0 && depthParen === 0 && current !== 'fun' &&
                               (ch === ':' || ch === '=' || ch === '\n' || text.substring(pos, pos + 4) === ' by ')) {
                        break;
                    }
                }
                var head = text.substring(start + current.length, pos).replace(/<[^<>]*(<[^<>]*(<[^<>]*>[^<>]*)*>[^<>]*)*>/g, '');
                var parts = head.split('.');
                name = parts[parts.length - 1].replace(/[^A-Za-z0-9_`]/g, '').replace(/`/g, '');
                return { kind: current === 'fun' ? 'fun' : 'prop', name: name };
            }
            }
            return null;
        }
    }
    Kt.declarationName = declarationName;

    // A source of the library: "package x.y", imports, declarations. The
    // sources are JavaScript template literals, so a Kotlin template
    // "${x}" is written "$\{x}" there.
    Kt.addLibrary = function (id, text) {
        text = text.replace(/\$\\\{/g, '${');
        var library = Kt.library;
        library.units[id] = { id: id, text: null, whole: true };
        var lines = text.split('\n');
        var index = 0;
        var pkg = '';
        var header = [];
        while (index < lines.length && (/^\s*$/.test(lines[index]) || /^package /.test(lines[index]) || /^import /.test(lines[index]) ||
                                        /^\/\//.test(lines[index]))) {
            var match = /^package ([A-Za-z0-9_.]+)/.exec(lines[index]);
            if (match !== null)
                pkg = match[1];
            header.push(lines[index]);
            ++index;
        }
        library.packages[pkg] = true;
        var parts = pkg.split('.');
        for (var count = 1; count <= parts.length; ++count)
            library.packages[parts.slice(0, count).join('.')] = true;
        var starts = [];
        var pendingAnnotation = -1;
        for (; index < lines.length; ++index) {
            var line = lines[index];
            if (line.length === 0 || /^\s/.test(line) || /^[})\]]/.test(line) || /^\/\//.test(line))
                continue;
            if (/^@[A-Za-z]/.test(line) && !/\b(fun|val|var|class|interface|object|typealias)\b/.test(line.replace(/@[A-Za-z.]+(\([^)]*\))?/g, ''))) {
                if (pendingAnnotation < 0)
                    pendingAnnotation = index;
                continue;
            }
            starts.push(pendingAnnotation >= 0 ? pendingAnnotation : index);
            pendingAnnotation = -1;
        }
        var headerText = header.join('\n');
        starts.forEach(function (start, number) {
            var end = number + 1 < starts.length ? starts[number + 1] : lines.length;
            var body = lines.slice(start, end).join('\n');
            var info = declarationName(body);
            if (info === null)
                throw new Error('Kotlin library ' + id + ': cannot find the name of the declaration at line ' + (start + 1));
            var padding = new Array(start - header.length + 1).join('\n');
            var unitId = id + '/' + number;
            library.units[unitId] = { id: unitId, pkg: pkg, text: headerText + '\n' + padding + body, name: info.name, kind: info.kind,
                                      source: id };
            var byPackage = library.index[pkg] = library.index[pkg] || Object.create(null);
            (byPackage[info.name] = byPackage[info.name] || []).push(unitId);
            library.order.push(unitId);
        });
    };

    // The units of the library that declare name in pkg.
    Kt.libraryUnits = function (pkg, name) {
        var byPackage = Kt.library.index[pkg];
        if (byPackage === undefined)
            return [];
        return byPackage[name] || [];
    };

    Kt.isLibraryPackage = function (name) {
        return Kt.library.packages[name] === true;
    };
})(globalThis);
