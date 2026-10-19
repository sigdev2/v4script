// Pascal (Free Pascal, {$mode objfpc}) - the own translator to JavaScript
// (translator/pascal). All units in Pascal are one program: global
// variables, routines, types and classes are shared.
// See docs/internals/pascal.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.pascal);
})
