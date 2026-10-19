// C++: the standard library as C++ source. Headers are registered here in
// the order they are included (every unit sees all of them, as if it
// included them); the texts and the tables of their declarations are in
// the library-*.js files that follow (tools/build-cpp-library.mjs writes the
// tables). A session parses a declaration when one of its names is first
// looked up and a body when the function is first used, so the library
// costs little until it is used. See docs/internals/cpp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var X = T.cpp;
    if (X.headers)
        return;

    X.headers = Object.create(null);
    X.headerOrder = [];
    // Names that a unit may include: they are included already.
    X.headerAliases = Object.create(null);
    ['bits/stdc++.h', 'cstdio', 'cstdlib', 'cstring', 'cmath', 'cctype', 'climits', 'cfloat', 'cstdint', 'cinttypes',
     'cstddef', 'cstdarg', 'ctime', 'cerrno', 'ciso646', 'cstdbool', 'iostream', 'ostream', 'istream', 'sstream',
     'fstream', 'iomanip', 'ios', 'iosfwd', 'string', 'string_view', 'vector', 'map', 'set', 'unordered_map',
     'unordered_set', 'algorithm', 'numeric', 'memory', 'utility', 'functional', 'tuple', 'array', 'deque', 'list',
     'forward_list', 'stack', 'queue', 'iterator', 'limits', 'type_traits', 'initializer_list', 'exception',
     'stdexcept', 'new', 'typeinfo', 'chrono', 'thread', 'random', 'bitset', 'optional', 'ratio']
        .forEach(function (name) { X.headerAliases[name] = true; });

    // A header: the C++ text and the table of its top-level declarations
    // [namespace, first line, last line, names] (tools/build-cpp-library.mjs).
    // Inline namespaces in the path have '+': 'std::+literals'.
    X.addHeader = function (name, table, text) {
        X.headers[name] = { name: name, table: table, text: text, lines: null };
        X.headerOrder.push(name);
    };

    X.headerLines = function (header) {
        if (header.lines === null)
            header.lines = header.text.split('\n');
        return header.lines;
    };
})(globalThis);
