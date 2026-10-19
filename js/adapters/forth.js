// Forth - the own translator to JavaScript (translator/forth). A unit is text
// for the Forth interpreter; the dictionary and memory are shared by all
// units in Forth. See docs/internals/forth.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.forth);
})
