// Prolog - Tau Prolog (ISO Prolog in JavaScript).
//
// All units in Prolog are one session: a unit adds its clauses (and
// replaces the predicates it defines again), and its queries "?- Goal."
// run in order, their answers printed to the output. A host module is a
// library of predicates (app: greet/2, counter/1, ...; names in snake_case,
// the result as the last argument), loaded at start when the module is
// global; anything else from JavaScript is the library js (apply/4,
// get_prop/3, set_prop/3). consult/1 and open/3 read files of the host,
// user_input is standard input.
(function (host) {
    'use strict';

    var global = host.global;
    var pl = global.pl;
    var output = host.writer('stdout');
    var errors = host.writer('stderr');
    var warnings = host.writer('warning');
    var MAX_ANSWERS = 100;
    var session = null;

    // --- Callbacks of Tau come through setTimeout(..., 0): during a run they
    // are queued and run at once, so that the unit gets its answers before
    // the run ends.

    var pending = null;

    function synchronously(action) {
        var savedTimeout = global.setTimeout;
        var outer = pending;
        pending = [];
        global.setTimeout = function (callback) {
            pending.push(callback);
            return 0;
        };
        try {
            var result = action();
            while (pending.length > 0)
                pending.shift()();
            return result;
        } finally {
            global.setTimeout = savedTimeout;
            pending = outer;
        }
    }

    // --- Streams: output to the host, standard input from the host, files
    // of the host read-only.

    function makeStream(device, mode, alias) {
        return new pl.type.Stream(device, mode, alias, 'text', false, 'reset');
    }

    function readOnlyFile(text) {
        return {
            get: function (length, position) {
                if (position >= text.length)
                    return 'end_of_stream';
                return text.substring(position, position + length);
            },
            eof: function (position) {
                return position >= text.length;
            },
            get_byte: function (position) {
                return position >= text.length ? 'end_of_stream' : text.charCodeAt(position) & 0xFF;
            },
            put: function () { return false; },
            put_byte: function () { return false; },
            flush: function () { return true; },
            close: function () { return true; }
        };
    }

    function moduleName(path) {
        return String(path).replace(/^(\.?\/)+/, '');
    }

    var fileSystem = {
        open: function (path, type, mode) {
            if (mode !== 'read')
                return false;
            var text = host.readModule(moduleName(path));
            return text === null ? null : readOnlyFile(text);
        }
    };

    // Standard input: Tau asks for text by position (and may ask for the
    // same position again to peek), so everything read stays in a buffer.
    function standardInput() {
        var buffer = '';
        function fill(position) {
            while (position >= buffer.length) {
                var line = host.input.readLine();
                if (line === null)
                    return false;
                buffer += line + '\n';
            }
            return true;
        }
        return {
            get: function (length, position) {
                if (!fill(position))
                    return 'end_of_stream';
                fill(position + length - 1);
                return buffer.substring(position, position + length);
            },
            eof: function (position) {
                return !fill(position);
            },
            get_byte: function (position) {
                return fill(position) ? buffer.charCodeAt(position) & 0xFF : 'end_of_stream';
            },
            put: function () { return false; },
            put_byte: function () { return false; },
            flush: function () { return true; },
            close: function () { return true; }
        };
    }

    // --- Predicates of the host modules

    function unify(thread, point, value, target) {
        thread.prepend([new pl.type.State(point.goal.replace(new pl.type.Term('=', [value, target])),
                                          point.substitution, point)]);
    }

    function fromJs(value) {
        return pl.fromJavaScript.apply(value);
    }

    function callHost(thread, point, atom, compute, hasResult) {
        var value;
        try {
            value = compute();
        } catch (error) {
            thread.throw_error(pl.error.javascript(String(error && error.message || error), atom.indicator));
            return;
        }
        if (!hasResult) {
            thread.success(point);
            return;
        }
        // A function without a value fails, as a predicate that found nothing.
        if (value === null || value === undefined)
            return;
        unify(thread, point, fromJs(value), atom.args[atom.args.length - 1]);
    }

    function argument(atom, index) {
        return atom.args[index].toJavaScript();
    }

    // greet(Name, Greeting): parameters first, the result last; optional
    // parameters give predicates of several arities.
    function hostPredicates(module) {
        var predicates = {};
        module.functions.forEach(function (fn) {
            var hasResult = fn.result !== 'void';
            var first = fn.getter ? 0 : fn.required;
            var last = fn.getter ? 0 : fn.parameters.length;
            for (var count = first; count <= last; ++count)
                predicates[fn.names.snake + '/' + (count + (hasResult ? 1 : 0))] = makePredicate(fn, count, hasResult);
        });
        return predicates;
    }

    function makePredicate(fn, count, hasResult) {
        return function (thread, point, atom) {
            callHost(thread, point, atom, function () {
                var values = [];
                for (var index = 0; index < count; ++index)
                    values.push(argument(atom, index));
                return fn.invoke(values);
            }, hasResult);
        };
    }

    // consult/1 and include of the browser Tau would look for an element of
    // the page and a file by address; here they read a file of the host.
    function consultHost(thread, point, atom) {
        var source = atom.args[0];
        var module = 'user';
        if (source.indicator === ':/2') {
            module = source.args[0].id;
            source = source.args[1];
        }
        if (pl.type.is_variable(source)) {
            thread.throw_error(pl.error.instantiation(atom.indicator));
            return;
        }
        if (!pl.type.is_atom(source)) {
            thread.throw_error(pl.error.type('atom', source, atom.indicator));
            return;
        }
        var name = moduleName(source.id);
        var text = host.readModule(name);
        if (text === null && !/\.(pl|pro)$/.test(name))
            text = host.readModule(name + '.pl');
        if (text === null && !/\.(pl|pro)$/.test(name))
            text = host.readModule(name + '.pro');
        if (text === null) {
            thread.throw_error(pl.error.existence('source_sink', source, atom.indicator));
            return;
        }
        thread.consult(text, {
            context_module: module,
            text: true, html: false, url: false, file: false, script: false,
            success: function () {
                thread.success(point);
                thread.again();
            },
            error: function (error) {
                thread.throw_error(error);
                thread.again();
            }
        });
        return true;
    }

    function create() {
        session = pl.create();
        session.streams.user_output = makeStream({
            put: function (text) { output.write(text); return true; },
            flush: function () { return true; }
        }, 'append', 'user_output');
        session.streams.user_error = makeStream({
            put: function (text) { errors.write(text); return true; },
            flush: function () { return true; }
        }, 'append', 'user_error');
        session.streams.user_input = makeStream(standardInput(), 'read', 'user_input');
        session.standard_output = session.current_output = session.streams.user_output;
        session.standard_error = session.streams.user_error;
        session.standard_input = session.current_input = session.streams.user_input;
        session.file_system = fileSystem;
        pl.modules.system.rules['consult/1'] = consultHost;

        var prelude = ':- use_module(library(lists)).\n:- use_module(library(js)).\n:- use_module(library(format)).\n' +
                      ':- use_module(library(random)).\n:- use_module(library(statistics)).\n';
        host.modules().forEach(function (module) {
            var predicates = hostPredicates(module);
            new pl.type.Module(module.name, predicates, Object.keys(predicates));
            if (module.global)
                prelude += ':- use_module(library(' + module.name + ')).\n';
        });
        consult(prelude, 0);
    }

    // --- Text of a unit: clauses and queries "?- Goal."

    var SYMBOL_CHARS = '+-*/\\^<>=~:.?@#&$';

    function isLayout(character) {
        return character === undefined || /\s/.test(character);
    }

    // Clauses of a unit in order: { text, line, start, end }. A clause ends
    // with a dot followed by a space, the end of the text or a comment,
    // outside quotes and comments and not inside a symbol atom (=..).
    function splitClauses(code) {
        var clauses = [];
        var line = 1;
        var start = -1;
        var startLine = 0;
        for (var index = 0; index < code.length; ++index) {
            var character = code.charAt(index);
            if (character === '\n') {
                ++line;
                continue;
            }
            if (character === '%') {
                while (index + 1 < code.length && code.charAt(index + 1) !== '\n')
                    ++index;
                continue;
            }
            if (character === '/' && code.charAt(index + 1) === '*') {
                var close = code.indexOf('*/', index + 2);
                var end = close < 0 ? code.length : close + 2;
                line += code.substring(index, end).split('\n').length - 1;
                index = end - 1;
                continue;
            }
            if (start < 0) {
                if (isLayout(character))
                    continue;
                start = index;
                startLine = line;
            }
            if (character === '0' && code.charAt(index + 1) === '\'') {
                index += code.charAt(index + 2) === '\\' ? 3 : 2;
                continue;
            }
            if (character === '\'' || character === '"' || character === '`') {
                for (++index; index < code.length; ++index) {
                    var next = code.charAt(index);
                    if (next === '\n')
                        ++line;
                    if (next === '\\') {
                        ++index;
                    } else if (next === character) {
                        if (code.charAt(index + 1) !== character)
                            break;
                        ++index;
                    }
                }
                continue;
            }
            if (character === '.' && SYMBOL_CHARS.indexOf(code.charAt(index - 1)) < 0 &&
                (isLayout(code.charAt(index + 1)) || code.charAt(index + 1) === '%')) {
                clauses.push({ text: code.substring(start, index + 1), line: startLine, start: start, end: index + 1 });
                start = -1;
            }
        }
        if (start >= 0)
            clauses.push({ text: code.substring(start), line: startLine, start: start, end: code.length });
        return clauses;
    }

    // Spaces instead of the text: line numbers of other clauses stay.
    function blank(text) {
        return text.replace(/[^\n]/g, ' ');
    }

    // --- Errors

    function describe(term) {
        return term.toString({ session: session, quoted: true });
    }

    // An error of Tau is a term error(Error, Where); the line comes from the
    // details of a syntax error, if any.
    function toError(term, line) {
        if (pl.type.is_term(term) && term.indicator === 'throw/1')
            term = term.args[0];
        var message = describe(term);
        if (pl.type.is_term(term) && term.indicator === 'error/2') {
            message = describe(term.args[0]);
            var details = term.args[1];
            while (pl.type.is_term(details) && details.indicator === './2') {
                var item = details.args[0];
                if (pl.type.is_term(item) && item.indicator === 'line/1' && pl.type.is_number(item.args[0]))
                    line += item.args[0].value - 1;
                if (pl.type.is_term(item) && item.indicator === 'found/1')
                    message += ', found ' + describe(item.args[0]);
                details = details.args[1];
            }
        }
        return host.error(message, line);
    }

    // An interrupted run did not reach its end, and its call stayed in the
    // answer queue of Tau: new ones would wait for it forever.
    function forgetStoppedCalls() {
        session.thread.__calls = [];
    }

    function consult(text, firstLine) {
        forgetStoppedCalls();
        var failure = null;
        synchronously(function () {
            session.consult(text, {
                text: true, html: false, url: false, file: false, script: false,
                success: function () {},
                error: function (error) { failure = error; }
            });
        });
        var warnings = session.thread.warnings || [];
        session.thread.warnings = [];
        warnings.forEach(function (warning) {
            warnings.write('Warning: ' + describe(warning) + '\n');
        });
        if (failure !== null)
            throw toError(failure, firstLine);
    }

    function query(goal, line) {
        forgetStoppedCalls();
        var failure = null;
        synchronously(function () {
            session.query(goal, { success: function () {}, error: function (error) { failure = error; } });
        });
        if (failure !== null)
            throw toError(failure, line);
        var count = 0;
        for (;;) {
            var outcome = null;
            synchronously(function () {
                session.answer({
                    success: function (answer) { outcome = { answer: answer }; },
                    fail: function () { outcome = { done: true }; },
                    error: function (error) { outcome = { error: error }; },
                    limit: function () { outcome = { done: true }; }
                });
            });
            if (outcome === null || outcome.done)
                break;
            if (outcome.error !== undefined) {
                output.flush();
                throw toError(outcome.error, line);
            }
            output.flush();
            output.write(pl.format_answer(outcome.answer, session, { quoted: true }) + '\n');
            if (++count >= MAX_ANSWERS) {
                output.write('...\n');
                return;
            }
        }
        output.flush();
        if (count === 0)
            output.write('false\n');
    }

    // The session is made while the language loads: loading is not the time
    // of a program.
    create();

    return {
        run: function (code) {
            var clauses = splitClauses(code);
            var program = code;
            var queries = [];
            for (var index = clauses.length - 1; index >= 0; --index) {
                var clause = clauses[index];
                if (clause.text.indexOf('?-') !== 0)
                    continue;
                queries.unshift({ goal: clause.text.substring(2), line: clause.line });
                program = program.substring(0, clause.start) + blank(clause.text) + program.substring(clause.end);
            }
            if (/\S/.test(program))
                consult(program, 1);
            queries.forEach(function (item) {
                query(item.goal, item.line);
            });
            return undefined;
        }
    };
})
