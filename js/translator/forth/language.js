// Forth: the language session - one Forth system for all units, running a
// unit with the interpreter, the place of an error, the stack as the value
// of a unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Forth = T.forth;
    if (Forth.language)
        return;

    var EMPTY = Forth.STACK_EMPTY;

    function Session(env) {
        this.env = env;
        this.system = new Forth.System(env);
        this.system.running = false;
    }

    // An error with a place: in translated code the run time finds the
    // place by the stack, otherwise it is the line the interpreter parsed.
    Session.prototype.located = function (error) {
        if (error instanceof T.CompileError || this.env.locate(error) !== null)
            return error;
        var place = this.system.place();
        return new T.CompileError(this.describeError(error), place.line, 0, place.source);
    };

    Session.prototype.runBlock = function (code) {
        var env = this.env;
        var system = this.system;
        var self = this;
        env.scheduler.reset();
        system.reset();
        var input = system.fileInput(code, '');
        var value;
        var finished = false;
        system.running = true;
        try {
            var state = env.scheduler.runMain(this.runInput(input), function (callback, delay) {
                return env.schedule(function () {
                    system.running = true;
                    try {
                        callback();
                    } finally {
                        system.running = false;
                        system.flushOutput();
                        env.err.flush();
                    }
                }, delay);
            }, function (error) {
                if (error !== null && error !== undefined) {
                    system.abandonDefinitions();
                    if (!(error instanceof Forth.ForthExit)) {
                        system.flushOutput();
                        env.reportLate(self.located(error));
                    }
                    return;
                }
                finished = true;
                value = self.stackValue();
            });
            return state === 'done' && finished ? value : undefined;
        } catch (error) {
            system.abandonDefinitions();
            if (error instanceof Forth.ForthExit)
                return this.stackValue();
            throw this.located(error);
        } finally {
            system.running = false;
            system.flushOutput();
        }
    };

    // A whole unit; a definition not finished at the end of the unit is an error.
    Session.prototype.runInput = function* (input) {
        var system = this.system;
        yield* system.interpretInput(input);
        var definition = system.definition;
        if (definition !== null) {
            while (definition.main !== null)
                definition = definition.main;
            var name = definition.word !== null && definition.word.name.length > 0
                ? ': ' + T.utf8.decode(definition.word.name) : '';
            throw new T.CompileError('Unfinished definition' + name + ' (no ;)', definition.line, 0, definition.source);
        }
    };

    // The value of a unit is the stack that is left: <depth> elements, as .S.
    Session.prototype.stackValue = function () {
        var system = this.system;
        var parts = [];
        if (system.sp > EMPTY)
            parts.push(system.describeStack());
        if (system.fp > EMPTY)
            parts.push('F: ' + system.describeFloats());
        return parts.length > 0 ? parts.join('  ') : undefined;
    };

    Session.prototype.describeError = function (error) {
        if (error instanceof T.LanguageError)
            return error.message;
        if (error instanceof RangeError && /stack|call depth|recursion/i.test(String(error.message)))
            return Forth.messageFor(-5);
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name ? error.name + ': ' : '') + error.message;
        return String(error);
    };

    Session.prototype.deadlock = function () {
        return new Forth.ForthError(-21, 'deadlock');
    };

    Forth.language = {
        id: 'forth',
        name: 'Forth',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.forth = Forth.language;
})(globalThis);
