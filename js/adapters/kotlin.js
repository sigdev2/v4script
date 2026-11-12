// Kotlin - the own translator to JavaScript (translator/kotlin) over the run
// time and the JDK library of Java (translator/java). A unit is a script:
// declarations and statements shared by all units in Kotlin. See
// docs/internals/kotlin.md.
(function (host) {
    'use strict';

    var T = host.global.V4ScriptTranslator;
    return T.createAdapter(host, T.languages.kotlin);
})
