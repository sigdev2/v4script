// Adapter of a translated language to the host: running a unit, errors with
// the line of the unit or module, output, continuation in timers.
//
// A language (frontend) gives createSession(env) -> { runBlock(code, unit),
// describeError(error) }. The session lives as long as the engine:
// declarations of all units of one language are shared. The contract is
// described in docs/internals/translator.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    if (T.session)
        return;
    T.session = true;

    var J = T.J;

    T.languages = T.languages || {};

    var chunkCounter = 0;

    function Environment(host, language) {
        this.host = host;
        this.language = language;
        this.global = host.global;
        this.out = host.writer('stdout');
        this.warn = host.writer('warning');
        this.err = host.writer('stderr');
        // Standard input, shared with the other languages of the engine.
        this.input = host.input;
        // Host modules as they were when the language loaded.
        this.modules = host.modules();
        // Line maps of the code chunks: chunk name -> { map, source }.
        this.chunks = {};
        var self = this;
        this.scheduler = new T.Scheduler({
            deadlock: function () { return self.session.deadlock(); }
        });
    }

    // Text of a module or data file, or null.
    Environment.prototype.readModule = function (name) {
        return this.host.readModule(name);
    };

    // Canvas for graphics, or null.
    Environment.prototype.canvas = function () {
        return this.host.canvas();
    };

    // Clears the output (CLS, ClrScr, PAGE).
    Environment.prototype.clear = function () {
        this.out.flush();
        this.err.flush();
        this.host.clear();
    };

    // Compiles statements as the body of function (params) { ... } and calls
    // it with args. source - name of the module ('' - the unit): errors name
    // the place by it. options.library - code of the language library: the
    // place of an error is searched further down the stack, in user code.
    Environment.prototype.compileChunk = function (statements, params, args, source, options) {
        var name = this.language.id + '.' + (++chunkCounter);
        var wrapper = [J.expr(J.fn(null, params, statements))];
        var printed = T.print(wrapper);
        this.chunks[name] = { map: printed.map, source: source || '', library: !!(options && options.library) };
        if (this.language.debug)
            this.language.debug(printed.code, name);
        var factory = this.host.compile(printed.code, name);
        return factory.apply(null, args);
    };

    // Place of an error by the stack: the first frame in translated code.
    Environment.prototype.locate = function (error) {
        var stack = error !== null && typeof error === 'object' ? String(error.stack || '') : '';
        var pattern = /translated\/([^:\s\/]+):(\d+)/g;
        var found;
        while ((found = pattern.exec(stack)) !== null) {
            var chunk = this.chunks[decodeURIComponent(found[1])];
            if (chunk === undefined || chunk.library)
                continue;
            var position = T.mapLine(chunk.map, Number(found[2]));
            if (position !== null && position.source === T.LIBRARY_SOURCE)
                continue;
            if (position !== null)
                return { line: position.line, source: position.source !== undefined ? position.source : chunk.source };
        }
        return null;
    };

    // Error for the host: text of the language and the place.
    Environment.prototype.toHostError = function (error) {
        if (T.debug)
            T.debug(error);
        if (error instanceof T.CompileError)
            return this.host.error(error.message, error.line, error.source || '');
        var message = this.session.describeError(error);
        var place = this.locate(error);
        return this.host.error(message, place !== null ? place.line : 0, place !== null ? place.source : '');
    };

    // A timer of the host: the program goes on when all fibers wait for time.
    Environment.prototype.schedule = function (callback, delay) {
        return this.host.schedule(callback, delay);
    };

    // An error in a continuation (the run has ended): a line on standard
    // error.
    Environment.prototype.reportLate = function (error) {
        var hostError = this.toHostError(error);
        var text = hostError.message;
        if (hostError.line > 0)
            text += hostError.source ? ' (' + hostError.source + ', line ' + hostError.line + ')' : ' (line ' + hostError.line + ')';
        this.out.flush();
        this.err.write(text + '\n');
        this.err.flush();
    };

    T.createAdapter = function (host, language) {
        var env = new Environment(host, language);
        env.session = language.createSession(env);
        return {
            run: function (code) {
                try {
                    return env.session.runBlock(code, host.unit());
                } catch (error) {
                    throw env.toHostError(error);
                }
            }
        };
    };
})(globalThis);
