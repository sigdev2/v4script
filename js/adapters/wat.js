// WebAssembly (text format WAT) - the own translator to JavaScript
// (translator/wat). A unit is modules and .wast script commands; named
// modules are visible to other units. See docs/internals/wat.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.wat);
})
