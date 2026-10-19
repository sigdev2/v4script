// Scheme: the execution machine - a trampoline loop, continuations
// (call/cc, dynamic-wind), exception handlers, multiple values, SRFI 18
// threads. The Machine object is $S in the translated code. Design:
// docs/internals/scheme.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.Machine)
        return;

    var Pair = S.Pair, NIL = S.NIL, UNSPEC = S.UNSPEC, Values = S.Values;
    var slice = Array.prototype.slice;

    // --- Built-in procedures

    // fn - a JavaScript function: direct (arguments -> value) or CPS ($k,
    // arguments...). min/max - the argument count (max < 0 - any number).
    function Prim(name, fn, min, max, options) {
        this.name = name;
        this.fn = fn;
        this.min = min;
        this.max = max;
        options = options || {};
        this.cps = !!options.cps;
        this.inline = options.inline || null;
        this.bool = !!options.bool;
        this.library = !!options.library;
        this.proc = null;
        fn.$name = name;
    }

    S.prims = Object.create(null);
    S.Prim = Prim;

    S.def = function (name, min, max, fn, options) {
        var primitive = new Prim(name, fn, min, max, options);
        S.prims[name] = primitive;
        return primitive;
    };
    S.defCps = function (name, min, max, fn, options) {
        options = options || {};
        options.cps = true;
        return S.def(name, min, max, fn, options);
    };
    S.alias = function (name, original) {
        S.prims[name] = S.prims[original];
    };

    function arityText(min, max) {
        if (max === min)
            return min + (min === 1 ? ' argument' : ' arguments');
        if (max < 0)
            return 'at least ' + min + (min === 1 ? ' argument' : ' arguments');
        return min + ' to ' + max + ' arguments';
    }

    function arityError(name, min, max, given) {
        return S.error((name || 'procedure') + ': expected ' + arityText(min, max) + ', got ' + given, []);
    }
    S.arityError = arityError;

    // The procedure value of a built-in procedure (when it is passed as an argument).
    S.procOf = function (primitive) {
        if (primitive.proc !== null)
            return primitive.proc;
        var fn = primitive.fn, min = primitive.min, max = primitive.max, name = primitive.name;
        var proc;
        if (primitive.cps) {
            proc = function ($k) {
                var count = arguments.length - 1;
                if (count < min || (max >= 0 && count > max))
                    throw arityError(name, min, max, count);
                return fn.apply(null, arguments);
            };
        } else if (min === 1 && max === 1) {
            proc = function ($k, argument, $x) {
                if (argument === undefined || $x !== undefined)
                    throw arityError(name, 1, 1, argument === undefined ? 0 : 2);
                return $k(fn(argument));
            };
        } else if (min === 2 && max === 2) {
            proc = function ($k, first, second, $x) {
                if (second === undefined || $x !== undefined)
                    throw arityError(name, 2, 2, second === undefined ? (first === undefined ? 0 : 1) : 3);
                return $k(fn(first, second));
            };
        } else {
            proc = function ($k) {
                var count = arguments.length - 1;
                if (count < min || (max >= 0 && count > max))
                    throw arityError(name, min, max, count);
                return $k(fn.apply(null, slice.call(arguments, 1)));
            };
        }
        proc.$name = name;
        proc.$prim = primitive;
        primitive.proc = proc;
        return proc;
    };

    // --- Control

    function Bounce(procedure, args) {
        this.f = procedure;
        this.a = args;
    }
    // The computation of a level ended (the value is in level.result).
    var HALT = { halt: true };
    // The thread stopped (it waits) - run another one.
    var SUSPEND = { suspend: true };

    // A jump to a continuation of another level (a call from JavaScript inside Scheme).
    function ContinuationJump(cont, value) {
        this.cont = cont;
        this.value = value;
    }

    // raise without a handler: the value is what was raised.
    function SchemeRaise(value, stack) {
        this.value = value;
        this.stack = stack;
    }
    S.SchemeRaise = SchemeRaise;

    // exit: the end of the program.
    function ExitSignal(value) {
        this.value = value;
    }
    S.ExitSignal = ExitSignal;

    function Winder(before, after, parent) {
        this.before = before;
        this.after = after;
        this.parent = parent;
        this.depth = parent === null ? 1 : parent.depth + 1;
    }

    function Handlers(handler, next) {
        this.handler = handler;
        this.next = next;
    }

    // A run level: the program of a unit with threads (threaded) or a call
    // of a Scheme procedure from JavaScript - without switching threads.
    function Level(parent, threaded) {
        this.parent = parent;
        this.threaded = threaded;
        this.alive = true;
        this.result = undefined;
    }

    // --- SRFI 18 threads

    var threadCounter = 0;
    function Thread(thunk, name) {
        this.thunk = thunk;
        this.name = name;
        this.id = ++threadCounter;
        this.state = 'new';        // new, runnable, blocked, terminated
        this.resume = null;        // the Bounce the thread resumes from
        this.winders = null;
        this.handlers = null;
        this.params = null;
        this.result = UNSPEC;
        this.exception = null;     // { value } - if the thread ended with an exception
        this.terminated = false;
        this.joiners = [];
        this.specific = UNSPEC;
        this.wake = 0;
        this.$scheme = true;
    }
    Thread.prototype.describe = function () {
        return '#<thread' + (this.name !== UNSPEC ? ' ' + S.write(this.name, 'display') : '') + '>';
    };

    function Mutex(name) {
        this.name = name;
        this.owner = null;        // a thread or null
        this.locked = false;
        this.abandoned = false;
        this.waiters = [];
        this.specific = UNSPEC;
        this.$scheme = true;
    }
    Mutex.prototype.describe = function () {
        return '#<mutex' + (this.name !== UNSPEC ? ' ' + S.write(this.name, 'display') : '') + '>';
    };

    function ConditionVariable(name) {
        this.name = name;
        this.waiters = [];
        this.specific = UNSPEC;
        this.$scheme = true;
    }
    ConditionVariable.prototype.describe = function () {
        return '#<condition-variable' + (this.name !== UNSPEC ? ' ' + S.write(this.name, 'display') : '') + '>';
    };

    function Time(ms) {
        this.ms = ms;
        this.$scheme = true;
    }
    Time.prototype.describe = function () {
        return '#<time ' + S.N.floatString(this.ms / 1000) + '>';
    };

    S.Thread = Thread;
    S.Mutex = Mutex;
    S.ConditionVariable = ConditionVariable;
    S.Time = Time;

    // --- The machine

    function Machine(session) {
        this.session = session;
        this.d = 0;
        this.N = S.N;
        this.Pair = Pair;
        this.NIL = NIL;
        this.UNSPEC = UNSPEC;
        this.Char = S.Char;
        this.at = null;
        this.level = null;
        this.reset();
    }

    Machine.prototype.reset = function () {
        this.d = 0;
        this.winders = null;
        this.handlers = null;
        this.params = null;
        this.level = null;
        this.current = null;
        this.ready = [];
        this.sleeping = [];
        this.timer = null;
        this.generation = (this.generation || 0) + 1;
        this.at = null;
        this.ticks = 0;
    };

    Machine.prototype.bounce = function (procedure, args) {
        return new Bounce(procedure, args);
    };

    // The arguments after the first from as a list (a lambda with a rest).
    Machine.prototype.rest = function (args, from) {
        var result = NIL;
        for (var index = args.length - 1; index >= from; --index)
            result = new Pair(args[index], result);
        return result;
    };

    // A wrong argument count of a Scheme procedure: params - its
    // parameters (undefined - not passed), extra - an extra argument.
    Machine.prototype.arity = function (fn, params, extra) {
        var name = S.procedureName(fn) || 'anonymous procedure';
        // A procedure with a rest has no parameter $x: fn.length = 1 + params.
        var rest = fn.length === params.length + 1;
        var text = name + ': expected ' + arityText(params.length, rest ? -1 : params.length);
        if (extra !== undefined)
            throw S.error(text + ', got more', []);
        var given = 0;
        while (given < params.length && params[given] !== undefined)
            ++given;
        throw S.error(text + ', got ' + given, []);
    };

    Machine.prototype.primitiveArity = function (name, count) {
        var primitive = S.prims[name];
        throw arityError(name, primitive.min, primitive.max, count);
    };

    Machine.prototype.unbound = function (cell) {
        var global = this.session.env.global;
        if (cell.name in global)
            return S.fromJs(global[cell.name]);
        throw S.error('undefined variable: ' + cell.name, []);
    };

    Machine.prototype.setGlobal = function (cell, value) {
        if (cell.v === undefined)
            throw S.error('set!: undefined variable: ' + cell.name, []);
        cell.v = value;
        return UNSPEC;
    };

    // A call of a value that is not a procedure: a function that reports
    // the error (or a JavaScript function with the same name if the
    // variable is not defined).
    Machine.prototype.badProcedure = function (value, cell) {
        if (value === undefined && cell !== undefined) {
            var global = this.session.env.global;
            if (cell.name in global && typeof global[cell.name] === 'function')
                return S.fromJs(global[cell.name]);
            throw S.error('undefined variable: ' + cell.name, []);
        }
        throw S.error('not a procedure: ' + S.write(value, 'write'), []);
    };

    Machine.prototype.caseLambda = function (clauses, arities, name) {
        var proc = function ($k) {
            var count = arguments.length - 1;
            for (var index = 0; index < clauses.length; ++index) {
                var fixed = arities[index][0];
                if (count === fixed || (arities[index][1] && count >= fixed))
                    return clauses[index].apply(null, arguments);
            }
            throw S.error((name || 'case-lambda') + ': no clause for ' + count +
                          (count === 1 ? ' argument' : ' arguments'), []);
        };
        if (name)
            proc.$name = name;
        return proc;
    };

    // The values for define-values: an array (with a rest - at least count).
    Machine.prototype.valuesOf = function (value, count, rest) {
        var list = value instanceof Values ? value.list : [value];
        if (list.length === count || (rest && list.length >= count))
            return list;
        throw S.error('expected ' + count + (rest ? ' or more' : '') + (count === 1 ? ' value' : ' values') + ', got ' +
                      list.length, []);
    };

    Machine.prototype.tail = function (array, from) {
        return S.arrayToList(array.slice(from));
    };

    // --- Execution

    // The loop of a level: step is a Bounce, HALT or SUSPEND.
    Machine.prototype.execute = function (step, level) {
        for (;;) {
            try {
                if (level.threaded) {
                    for (;;) {
                        while (step instanceof Bounce) {
                            this.d = 0;
                            if (++this.ticks > 40 && this.ready.length > 0) {
                                this.ticks = 0;
                                step = this.switchThread(step);
                                continue;
                            }
                            step = step.f.apply(null, step.a);
                        }
                        if (step === HALT)
                            return HALT;
                        step = this.nextThread();
                        if (step === SUSPEND)
                            return SUSPEND;
                    }
                }
                while (step instanceof Bounce) {
                    this.d = 0;
                    step = step.f.apply(null, step.a);
                }
                if (step === HALT)
                    return HALT;
                throw S.error('internal error: unexpected result ' + String(step), []);
            } catch (error) {
                this.d = 0;
                step = this.recover(error, level);
            }
        }
    };

    // An exception in the loop: a continuation jump, a condition for a
    // Scheme handler or an error outwards. The continuation is the next step
    // of the loop (a Bounce), not a call here: otherwise the rest of the
    // program would run inside catch, and the next exception would bypass
    // the loop.
    Machine.prototype.recover = function (error, level) {
        var self = this;
        if (error instanceof ContinuationJump) {
            if (error.cont.level === level)
                return new Bounce(function () { return self.invokeContinuation(error.cont, error.value); }, []);
            throw error;
        }
        if (error instanceof SchemeRaise || error instanceof ExitSignal)
            throw error;
        var condition = S.toCondition(error);
        if (condition === null)
            throw error;
        if (this.handlers === null)
            throw error;
        return new Bounce(function () {
            return self.raise(function () {
                throw S.error('exception handler returned', []);
            }, condition, false, error);
        }, []);
    };

    // A computation from scratch on a new level: entry($k) is a CPS function.
    Machine.prototype.runLevel = function (entry) {
        var parent = this.level;
        var level = new Level(parent, false);
        this.level = level;
        var savedDepth = this.d;
        var halt = function (value) {
            level.result = value;
            return HALT;
        };
        try {
            var state = this.execute(new Bounce(entry, [halt]), level);
            return state === HALT ? level.result : undefined;
        } finally {
            level.alive = false;
            this.level = parent;
            this.d = savedDepth;
        }
    };

    // A Scheme procedure from JavaScript (or from a built-in procedure): the value.
    Machine.prototype.callProcedure = function (proc, args) {
        if (typeof proc !== 'function')
            throw S.error('not a procedure: ' + S.write(proc, 'write'), []);
        var winders = this.winders, handlers = this.handlers, params = this.params;
        try {
            return this.runLevel(function ($k) {
                return proc.apply(null, [$k].concat(args));
            });
        } finally {
            this.winders = winders;
            this.handlers = handlers;
            this.params = params;
        }
    };

    // --- Threads and the main program

    Machine.prototype.runMain = function (entry, schedule, onFinish) {
        this.reset();
        var self = this;
        var main = new Thread(null, S.str('main'));
        main.state = 'runnable';
        main.main = true;
        this.current = main;
        var level = new Level(null, true);
        this.level = level;
        var generation = this.generation;
        var halt = function (value) {
            level.result = value;
            main.state = 'terminated';
            return HALT;
        };
        main.halt = halt;
        function proceed(step) {
            if (self.generation !== generation)
                return 'stale';
            self.level = level;
            var state;
            try {
                state = self.execute(step, level);
            } catch (error) {
                self.level = null;
                self.ready = [];
                self.sleeping = [];
                throw error;
            }
            if (state === HALT) {
                self.level = null;
                self.ready = [];
                self.sleeping = [];
                onFinish(null, level.result);
                return 'done';
            }
            // All threads wait for time: the continuation goes by a timer of the unit.
            var delay = Math.max(0, self.sleeping[0].wake - Date.now());
            self.level = null;
            self.timer = schedule(function () {
                try {
                    self.wakeSleepers(true);
                    proceed(self.nextThread());
                } catch (error) {
                    onFinish(error);
                }
            }, delay);
            return 'waiting';
        }
        return proceed(new Bounce(entry, [halt]));
    };

    Machine.prototype.saveThread = function (thread) {
        thread.winders = this.winders;
        thread.handlers = this.handlers;
        thread.params = this.params;
    };
    Machine.prototype.loadThread = function (thread) {
        this.current = thread;
        this.winders = thread.winders;
        this.handlers = thread.handlers;
        this.params = thread.params;
    };

    Machine.prototype.switchThread = function (step) {
        var thread = this.current;
        thread.resume = step;
        this.saveThread(thread);
        this.ready.push(thread);
        return this.nextThread();
    };

    // The next ready thread: its Bounce, or SUSPEND - all of them wait for time.
    Machine.prototype.nextThread = function () {
        for (;;) {
            this.wakeSleepers(false);
            if (this.ready.length > 0) {
                var thread = this.ready.shift();
                this.loadThread(thread);
                var step = thread.resume;
                thread.resume = null;
                return step;
            }
            if (this.sleeping.length === 0)
                throw this.deadlock();
            return SUSPEND;
        }
    };

    Machine.prototype.wakeSleepers = function (force) {
        var now = Date.now();
        while (this.sleeping.length > 0 && (force || this.sleeping[0].wake <= now)) {
            var entry = this.sleeping.shift();
            force = false;
            if (entry.thread.state !== 'blocked' || entry.thread.sleepEntry !== entry)
                continue;
            entry.thread.sleepEntry = null;
            this.makeReady(entry.thread, entry.timeout());
        }
    };

    // Inside a call from JavaScript (a nested level) threads do not
    // switch: waiting for another thread is impossible, sleep is a busy loop.
    Machine.prototype.nested = function () {
        return this.level === null || !this.level.threaded;
    };

    Machine.prototype.busyWait = function (milliseconds) {
        var until = Date.now() + Math.max(0, milliseconds);
        while (Date.now() < until) {
            // The watchdog interrupts a wait that is too long.
        }
    };

    Machine.prototype.deadlock = function () {
        return S.error('deadlock: all threads are blocked', []);
    };

    Machine.prototype.makeReady = function (thread, resume) {
        thread.state = 'runnable';
        thread.resume = resume;
        this.ready.push(thread);
    };

    // The current thread waits: wake(value) puts it back into the queue.
    Machine.prototype.block = function (continuation) {
        var thread = this.current;
        if (this.nested() || thread === null)
            throw S.error('cannot wait for another thread inside a call from JavaScript', []);
        thread.state = 'blocked';
        thread.k = continuation;
        this.saveThread(thread);
        return SUSPEND;
    };

    Machine.prototype.wake = function (thread, value) {
        if (thread.state !== 'blocked')
            return;
        thread.sleepEntry = null;
        var continuation = thread.k;
        thread.k = null;
        this.makeReady(thread, new Bounce(continuation, [value]));
    };

    // A thread sleeps until the time wake (ms); timeout() - the continuation by time.
    Machine.prototype.sleepUntil = function (thread, wake, timeout) {
        var entry = { thread: thread, wake: wake, timeout: timeout };
        thread.sleepEntry = entry;
        var index = this.sleeping.length;
        while (index > 0 && this.sleeping[index - 1].wake > wake)
            --index;
        this.sleeping = this.sleeping.slice(0, index).concat([entry], this.sleeping.slice(index));
    };

    Machine.prototype.startThread = function (thread) {
        var self = this;
        thread.state = 'runnable';
        thread.winders = null;
        thread.handlers = null;
        thread.params = this.params;
        var done = function (value) {
            return self.finishThread(thread, value, null);
        };
        thread.resume = new Bounce(function () {
            return self.runThreadBody(thread, done);
        }, []);
        this.ready.push(thread);
    };

    // The body of a thread: an exception without a handler ends only the thread.
    Machine.prototype.runThreadBody = function (thread, done) {
        var self = this;
        this.handlers = new Handlers(function ($k, condition) {
            return self.finishThread(thread, UNSPEC, { value: condition });
        }, null);
        thread.baseHandlers = this.handlers;
        return thread.thunk(done);
    };

    Machine.prototype.finishThread = function (thread, value, exception) {
        thread.state = 'terminated';
        thread.result = value;
        thread.exception = exception;
        var self = this;
        thread.joiners.forEach(function (joiner) { joiner(); });
        thread.joiners = [];
        this.current = null;
        return this.nextThreadOrSuspend();
    };

    Machine.prototype.nextThreadOrSuspend = function () {
        var step = this.nextThread();
        return step;
    };

    // --- Continuations

    Machine.prototype.capture = function (continuation) {
        var self = this;
        var cont = function ($k) {
            var value = arguments.length === 2 ? arguments[1]
                : (arguments.length === 1 ? new Values([]) : new Values(slice.call(arguments, 1)));
            return self.throwTo(cont, value);
        };
        cont.$cont = true;
        cont.k = continuation;
        cont.winders = this.winders;
        cont.handlers = this.handlers;
        cont.params = this.params;
        cont.level = this.level;
        return cont;
    };

    Machine.prototype.throwTo = function (cont, value) {
        if (cont.level !== this.level) {
            if (!cont.level.alive)
                throw S.error('continuation cannot be used after the call from JavaScript that created it returned', []);
            throw new ContinuationJump(cont, value);
        }
        return this.invokeContinuation(cont, value);
    };

    Machine.prototype.invokeContinuation = function (cont, value) {
        var self = this;
        return this.rewind(cont.winders, function () {
            self.handlers = cont.handlers;
            self.params = cont.params;
            return cont.k(value);
        });
    };

    function depthOf(node) {
        return node === null ? 0 : node.depth;
    }

    function commonAncestor(first, second) {
        while (depthOf(first) > depthOf(second))
            first = first.parent;
        while (depthOf(second) > depthOf(first))
            second = second.parent;
        while (first !== second) {
            first = first.parent;
            second = second.parent;
        }
        return first;
    }

    // Leaves dynamic-winds up to the common ancestor and enters target; then() goes on.
    Machine.prototype.rewind = function (target, then) {
        var self = this;
        var current = this.winders;
        if (current === target)
            return then();
        var common = commonAncestor(current, target);
        var entering = [];
        for (var node = target; node !== common; node = node.parent)
            entering.unshift(node);
        function exit(node) {
            if (node === common)
                return enter(0);
            self.winders = node.parent;
            return node.after(function () { return exit(node.parent); });
        }
        function enter(index) {
            if (index === entering.length)
                return then();
            var entry = entering[index];
            self.winders = entry.parent;
            return entry.before(function () {
                self.winders = entry;
                return enter(index + 1);
            });
        }
        return exit(current);
    };

    // --- Exceptions

    // raise: the handler is called with the outer handlers; for raise a
    // return from the handler is a secondary error.
    Machine.prototype.raise = function (continuation, value, continuable, original) {
        var node = this.handlers;
        if (node === null) {
            if (original !== undefined)
                throw original;
            throw new SchemeRaise(value, new Error('raise').stack);
        }
        var self = this;
        this.handlers = node.next;
        if (continuable) {
            return node.handler(function (result) {
                self.handlers = node;
                return continuation(result);
            }, value);
        }
        return node.handler(function () {
            self.handlers = node.next;
            var secondary = S.error('exception handler returned', []);
            return self.raise(continuation, secondary, false);
        }, value);
    };

    Machine.prototype.withHandler = function (continuation, handler, thunk) {
        var self = this;
        var saved = this.handlers;
        this.handlers = new Handlers(handler, saved);
        return thunk(function (value) {
            self.handlers = saved;
            return continuation(value);
        });
    };

    // A JavaScript exception -> a Scheme condition (or null if it is not a
    // run-time error: an interruption by the watchdog is not caught).
    S.toCondition = function (error) {
        if (error instanceof S.ErrorObject)
            return error;
        if (error instanceof T.LanguageError) {
            var made = new S.ErrorObject(error.message, NIL, '');
            made.stack = error.stack;
            return made;
        }
        if (error !== null && typeof error === 'object' && typeof error.message === 'string') {
            var message = /stack|call depth|recursion/i.test(error.message) && error instanceof RangeError
                ? 'stack overflow' : (error.name ? error.name + ': ' : '') + error.message;
            var condition = new S.ErrorObject(message, NIL, 'js');
            condition.stack = error.stack;
            condition.original = error;
            return condition;
        }
        return null;
    };

    S.Machine = Machine;
    S.Bounce = Bounce;
    S.HALT = HALT;
    S.SUSPEND = SUSPEND;
    S.Winder = Winder;
    S.Handlers = Handlers;
    S.ContinuationJump = ContinuationJump;
})(globalThis);
