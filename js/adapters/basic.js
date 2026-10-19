// BASIC (QBasic) - the own translator to JavaScript (translator/basic). All
// units in BASIC are one program: module variables, procedures and records
// are shared. See docs/internals/basic.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.basic);
})
