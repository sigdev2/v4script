// Go - the own translator to JavaScript (translator/go). A unit is a file of
// package main: declarations are shared by all units in Go, top-level
// statements run in order, then init and main if the unit has them.
// See docs/internals/go.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.go);
})
