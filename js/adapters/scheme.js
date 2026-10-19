// Scheme (R7RS-small) - the own translator to JavaScript (translator/scheme).
// A unit is top-level forms; definitions are shared by all units in Scheme.
// See docs/internals/scheme.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.scheme);
})
