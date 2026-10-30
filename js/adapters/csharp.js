// C# - the own translator to JavaScript (translator/csharp). A unit is a
// C# script: types, top-level variables, functions and statements shared
// by all units. See docs/internals/csharp.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.csharp);
})
