// C++ - the own translator to JavaScript over the linear memory of C
// (translator/cpp). A unit is a file of the program: declarations are
// shared by all units in C++, top-level statements run in order, then
// main if the unit has it. See docs/internals/cpp.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.cpp);
})
