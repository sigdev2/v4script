// Java - the own translator to JavaScript (translator/java). A unit is a
// jshell snippet: classes, methods, variables and top-level statements
// shared by all units in Java. See docs/internals/java.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.java);
})
