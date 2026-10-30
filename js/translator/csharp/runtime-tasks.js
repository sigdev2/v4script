// C#: fibers of the run time - tasks and async methods (an async method
// is a generator: it runs at once until it awaits a task that is not
// complete, then goes on when the task completes), iterators, threads,
// Monitor, Interlocked. Methods that wait ([V4Fiber]) are generators for
// fibers and run nested from plain code. See docs/internals/csharp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var R = CS.Runtime.prototype;
    if (R.async)
        return;

    var natives = CS.natives = CS.natives || {};
    var i64 = T.i64;

    function rt() {
        return CS.rt;
    }

    function scheduler() {
        return CS.rt.session.env.scheduler;
    }

    // --- Fibers

    // A generator as it is; a plain value becomes a generator with it.
    CS.fiberValue = function (value) {
        if (T.isGenerator(value))
            return value;
        // Not as a tail call: in V4 a tail call of a generator gives undefined.
        var generator = (function* () { return value; })();
        return generator;
    };

    R.fiber = function (value) {
        return CS.fiberValue(value);
    };

    // A generator from plain code runs at once (waits for time in place).
    R.sync = function (value) {
        if (T.isGenerator(value))
            return scheduler().runNested(value);
        return value;
    };

    // A function that waits: plain calls run it nested, fibers call $gen.
    R.fiberFunction = function (gen) {
        var self = this;
        var wrapper = function () { return self.sync(gen.apply(this, arguments)); };
        wrapper.$gen = gen;
        return wrapper;
    };

    CS.fiberNative = function (gen) {
        var wrapper = function () { return CS.rt.sync(gen.apply(this, arguments)); };
        wrapper.$gen = gen;
        return wrapper;
    };

    // object.name(args) from a fiber: the generator of a fiber method or
    // the value of a plain one.
    R.genOf = function (target, name, args) {
        if (target === null || target === undefined)
            throw this.nullReference();
        var fn = target[name];
        if (typeof fn !== 'function')
            throw this.nullReference();
        if (fn.$gen !== undefined)
            return fn.$gen.apply(target, args);
        return this.fiber(fn.apply(target, args));
    };

    R.genApply = function (fn, self, args) {
        if (fn === null || fn === undefined)
            throw this.nullReference();
        if (fn.$gen !== undefined)
            return fn.$gen.apply(self, args);
        if (fn.$list !== undefined) {
            var runtime = this;
            return (function* () {
                var result;
                for (var index = 0; index < fn.$list.length; ++index)
                    result = yield* runtime.genApply(fn.$list[index], self, args);
                return result;
            })();
        }
        return this.fiber(fn.apply(self, args));
    };

    // --- Tasks: $state 0 waiting, 1 done, 2 faulted, 3 canceled, -1 not
    // started (new Task(action)); $result, $error, $waiters, $then.

    var taskCounter = 0;

    R.newTask = function (resultType) {
        var Task = resultType === null || resultType === undefined ? this.type('System.Threading.Tasks.Task')
            : this.inst(this.type('System.Threading.Tasks.Task`1'), [resultType]);
        var task = new Task();
        task.$state = 0;
        task.$result = resultType === null || resultType === undefined ? undefined : this.defaultOf(resultType);
        task.$error = null;
        task.$waiters = [];
        task.$then = [];
        task.$taskId = 0;
        return task;
    };

    R.isTask = function (value) {
        return value !== null && typeof value === 'object' && value.$state !== undefined && value.$waiters !== undefined;
    };

    function finish(task, state, value) {
        if (task.$state !== 0 && task.$state !== -1)
            return false;
        task.$state = state;
        if (state === 1)
            task.$result = value;
        else
            task.$error = value;
        var waiters = task.$waiters;
        task.$waiters = [];
        var sched = scheduler();
        waiters.forEach(function (fiber) { sched.wakeUp(fiber, undefined); });
        var then = task.$then;
        task.$then = [];
        then.forEach(function (callback) { callback(task); });
        return true;
    }

    R.completeTask = function (task, result) { return finish(task, 1, result); };
    R.failTask = function (task, error) { return finish(task, 2, error); };
    R.cancelTask = function (task, error) {
        return finish(task, 3, error || this.exception('System.Threading.Tasks.TaskCanceledException'));
    };

    // The end of the body of a task: an OperationCanceledException cancels it.
    R.settleTask = function (task, error) {
        var converted = this.caught(error);
        if (this.is(converted, this.type('System.OperationCanceledException')))
            this.cancelTask(task, converted);
        else
            this.failTask(task, converted);
    };

    // Runs a generator as a task: synchronously until its first wait.
    R.startTask = function (task, generator, immediate) {
        var self = this;
        var body = function* () {
            try {
                var result = yield* generator;
                self.completeTask(task, result);
            } catch (error) {
                self.settleTask(task, error);
            }
        };
        var sched = scheduler();
        var fiber = sched.spawn(body(), 'task');
        if (immediate) {
            sched.ready.pop();
            sched.step(fiber);
        }
        return task;
    };

    // An async method: generator is the body; the result is a Task, a
    // Task<T> or a ValueTask.
    R.async = function (generator, resultType, valueTask) {
        var task = this.startTask(this.newTask(resultType), generator(), true);
        if (valueTask)
            return this.valueTask(task, resultType);
        return task;
    };

    R.valueTask = function (task, resultType) {
        var Type = resultType === null || resultType === undefined ? this.type('System.Threading.Tasks.ValueTask')
            : this.inst(this.type('System.Threading.Tasks.ValueTask`1'), [resultType]);
        var value = new Type();
        value._task = task;
        return value;
    };

    // async void: an exception ends the program (as on the thread pool).
    R.asyncVoid = function (generator) {
        var sched = scheduler();
        var fiber = sched.spawn(generator(), 'async void');
        sched.ready.pop();
        sched.step(fiber);
    };

    var YIELD = {};

    // The task behind an awaitable: tasks, value tasks, awaiters.
    R.taskOf = function (value) {
        if (value === null || value === undefined)
            throw this.nullReference();
        if (this.isTask(value))
            return value;
        if (value._task !== undefined) {
            if (value._task === null)
                return { $state: 1, $result: value._result, $waiters: [], $then: [] };
            return value._task;
        }
        if (value.constructor !== undefined && value.constructor.$name === 'System.Runtime.CompilerServices.YieldAwaitable+YieldAwaiter')
            return YIELD;
        return null;
    };

    function taskResult(task) {
        switch (task.$state) {
        case 1:
            return task.$result;
        case 2:
            throw CS.rt.thrown(task.$error);
        case 3:
            throw CS.rt.thrown(task.$error);
        }
        throw new Error('C# runtime: the task is not complete');
    }

    // await value inside an async generator.
    R.await = function* (value) {
        var task = this.taskOf(value);
        if (task === YIELD) {
            yield;
            return undefined;
        }
        if (task === null)
            return yield* this.awaitCustom(value);
        if (task.$state === -1 || task.$state === 0) {
            var fiber = scheduler().park();
            task.$waiters.push(fiber);
            yield;
        }
        return taskResult(task);
    };

    // An awaiter of another type: IsCompleted, OnCompleted, GetResult.
    R.awaitCustom = function* (awaiter) {
        var completed = typeof awaiter.get_IsCompleted$0 === 'function' ? awaiter.get_IsCompleted$0() : false;
        if (!completed) {
            var fiber = scheduler().park();
            var sched = scheduler();
            var onCompleted = awaiter[this.memberName('System.Runtime.CompilerServices.INotifyCompletion', 'OnCompleted', 1)];
            onCompleted.call(awaiter, this.lambda(this.type('System.Action'), function () { sched.wakeUp(fiber, undefined); }));
            yield;
        }
        return typeof awaiter.GetResult$0 === 'function' ? awaiter.GetResult$0() : undefined;
    };

    // await outside a generator: waits in place.
    R.awaitSync = function (value) {
        var self = this;
        return this.sync((function* () { return yield* self.await(value); })());
    };

    // Wait() and Result: the exception comes in an AggregateException.
    function* waitTask(task, millis) {
        if (task.$state === -1 || task.$state === 0) {
            var sched = scheduler();
            var fiber = millis !== undefined && millis >= 0 ? sched.sleep(millis) : sched.park();
            task.$waiters.push(fiber);
            yield;
            task.$waiters = task.$waiters.filter(function (other) { return other !== fiber; });
            sched.sleeping = sched.sleeping.filter(function (other) { return other !== fiber; });
            if (task.$state === 0 || task.$state === -1)
                return false;
        }
        if (task.$state === 2 || task.$state === 3)
            throw aggregate([task.$error]);
        return true;
    }

    function aggregate(errors) {
        var runtime = rt();
        var Aggregate = runtime.type('System.AggregateException');
        var list = runtime.arrayOf(runtime.type('System.Exception'), errors.slice());
        var object = new Aggregate();
        return object[runtime.methodByKey('System.AggregateException', '.ctor(Exception[])')](list);
    }

    function timeoutOf(millis) {
        if (millis < -1)
            throw CS.argRange('millisecondsTimeout', 'The timeout must represent a value between -1 and Int32.MaxValue, inclusive.');
        return millis;
    }

    function delayTask(millis, token) {
        var runtime = rt();
        if (millis < -1)
            throw CS.argRange('millisecondsDelay', "The value needs to be either -1 (signifying an infinite timeout), 0 or a positive integer.");
        var task = runtime.newTask(null);
        if (token !== undefined && isCanceled(token)) {
            runtime.cancelTask(task);
            return task;
        }
        if (millis === 0) {
            runtime.completeTask(task, undefined);
            return task;
        }
        var sched = scheduler();
        var fiber = null;
        var body = function* () {
            if (millis < 0) {
                fiber = sched.park();
                yield;
            } else {
                fiber = sched.sleep(millis);
                yield;
            }
            runtime.completeTask(task, undefined);
        };
        sched.spawn(body(), 'delay');
        if (token !== undefined && token._source !== null && token._source !== undefined) {
            onCancel(token, function () {
                if (runtime.cancelTask(task) && fiber !== null) {
                    sched.sleeping = sched.sleeping.filter(function (other) { return other !== fiber; });
                }
            });
        }
        return task;
    }

    function isCanceled(token) {
        return token !== null && token !== undefined && token._source !== null && token._source !== undefined && token._source._canceled;
    }

    function onCancel(token, callback) {
        var runtime = rt();
        var source = token._source;
        var action = runtime.lambda(runtime.type('System.Action'), callback);
        source[runtime.methodByKey('System.Threading.CancellationTokenSource', 'Register(Action)')](action);
    }

    // Task.Run: the function runs in a new fiber; a task it returns is awaited.
    function runTask(fn, resultType, unwrap, token) {
        var runtime = rt();
        var task = runtime.newTask(resultType);
        if (token !== undefined && isCanceled(token)) {
            runtime.cancelTask(task);
            return task;
        }
        if (fn === null || fn === undefined)
            throw CS.argNull(resultType === null ? 'action' : 'function');
        var generator = (function* () {
            var value = yield* runtime.genApply(fn, null, []);
            if (unwrap) {
                if (value === null || value === undefined)
                    throw runtime.exception('System.Threading.Tasks.TaskCanceledException');
                value = yield* runtime.await(value);
            }
            return value;
        })();
        return runtime.startTask(task, generator, false);
    }

    function whenAll(tasks, resultType) {
        var runtime = rt();
        if (tasks === null || tasks === undefined)
            throw CS.argNull('tasks');
        var list = Array.prototype.slice.call(tasks);
        list.forEach(function (task) {
            if (task === null || task === undefined)
                throw CS.argError('The tasks argument included a null value.', 'tasks');
        });
        var arrayType = resultType !== null ? resultType : null;
        var task = runtime.newTask(arrayType === null ? null : runtime.arrayType(arrayType, 1));
        var remaining = list.length;
        var settle = function () {
            if (remaining > 0)
                return;
            var errors = [];
            var canceled = false;
            list.forEach(function (item) {
                if (item.$state === 2)
                    errors.push(item.$error);
                else if (item.$state === 3)
                    canceled = true;
            });
            if (errors.length > 0) {
                runtime.failTask(task, errors[0]);
                task.$errors = errors;
            } else if (canceled) {
                runtime.cancelTask(task);
            } else {
                runtime.completeTask(task, arrayType === null ? undefined
                    : runtime.arrayOf(arrayType, list.map(function (item) { return item.$result; })));
            }
        };
        list.forEach(function (item) {
            if (item.$state === 1 || item.$state === 2 || item.$state === 3) {
                --remaining;
            } else {
                item.$then.push(function () {
                    --remaining;
                    settle();
                });
            }
        });
        settle();
        return task;
    }

    function whenAny(tasks, taskType) {
        var runtime = rt();
        if (tasks === null || tasks === undefined)
            throw CS.argNull('tasks');
        var list = Array.prototype.slice.call(tasks);
        if (list.length === 0)
            throw CS.argError('The tasks argument contains no tasks.', 'tasks');
        var task = runtime.newTask(taskType);
        for (var index = 0; index < list.length; ++index) {
            if (list[index].$state > 0) {
                runtime.completeTask(task, list[index]);
                return task;
            }
        }
        list.forEach(function (item) {
            item.$then.push(function () { runtime.completeTask(task, item); });
        });
        return task;
    }

    function continueWith(task, fn, resultType) {
        var runtime = rt();
        if (fn === null || fn === undefined)
            throw CS.argNull('continuationAction');
        var next = runtime.newTask(resultType);
        var start = function () {
            runtime.startTask(next, (function* () { return yield* runtime.genApply(fn, null, [task]); })(), false);
        };
        if (task.$state > 0)
            start();
        else
            task.$then.push(start);
        return next;
    }

    function resultTypeOf(task) {
        var type = task.constructor;
        return type.$args !== null && type.$args !== undefined ? type.$args[0] : null;
    }

    natives['System.Threading.Tasks.Task'] = {
        '.ctor(Action)': function (action) {
            this.$state = -1;
            this.$waiters = [];
            this.$then = [];
            this.$error = null;
            this.$action = action;
            return this;
        },
        '.ctor(Action, CancellationToken)': function (action) {
            return natives['System.Threading.Tasks.Task']['.ctor(Action)'].call(this, action);
        },
        'get_Id()': function () {
            if (!this.$taskId)
                this.$taskId = ++taskCounter;
            return this.$taskId;
        },
        'get_Status()': function () {
            switch (this.$state) {
            case -1:
                return 0;
            case 0:
                return this.$running ? 3 : 1;
            case 1:
                return 5;
            case 2:
                return 7;
            case 3:
                return 6;
            }
            return 1;
        },
        'get_Exception()': function () {
            if (this.$state !== 2)
                return null;
            return aggregate(this.$errors || [this.$error]);
        },
        'Start()': function () {
            if (this.$state !== -1)
                throw rt().exception('System.InvalidOperationException', 'Start may not be called on a task that was already started.');
            this.$state = 0;
            var runtime = rt();
            var action = this.$action;
            runtime.startTask(this, (function* () { return yield* runtime.genApply(action, null, []); })(), false);
        },
        'Wait()': CS.fiberNative(function* () { yield* waitTask(this); }),
        'Wait(int)': CS.fiberNative(function* (millis) { return yield* waitTask(this, timeoutOf(millis)); }),
        'Wait(TimeSpan)': CS.fiberNative(function* (span) { return yield* waitTask(this, timeoutOf(Math.floor(spanMillis(span)))); }),
        'Wait(CancellationToken)': CS.fiberNative(function* () { yield* waitTask(this); }),
        'ContinueWith(Action<Task>)': function (fn) { return continueWith(this, fn, null); },
        'ContinueWith<TResult>(Func<Task, TResult>)': function (resultType, fn) { return continueWith(this, fn, resultType); },
        'Run(Action)': function (fn) { return runTask(fn, null, false); },
        'Run(Action, CancellationToken)': function (fn, token) { return runTask(fn, null, false, token); },
        'Run<TResult>(Func<TResult>)': function (resultType, fn) { return runTask(fn, resultType, false); },
        'Run<TResult>(Func<TResult>, CancellationToken)': function (resultType, fn, token) { return runTask(fn, resultType, false, token); },
        'Run(Func<Task>)': function (fn) { return runTask(fn, null, true); },
        'Run(Func<Task>, CancellationToken)': function (fn, token) { return runTask(fn, null, true, token); },
        'Run<TResult>(Func<Task<TResult>>)': function (resultType, fn) { return runTask(fn, resultType, true); },
        'Run<TResult>(Func<Task<TResult>>, CancellationToken)': function (resultType, fn, token) { return runTask(fn, resultType, true, token); },
        'Delay(int)': function (millis) { return delayTask(millis); },
        'Delay(int, CancellationToken)': function (millis, token) { return delayTask(millis, token); },
        'WhenAll(Task[])': function (tasks) { return whenAll(tasks, null); },
        'WhenAll<TResult>(Task<TResult>[])': function (resultType, tasks) { return whenAll(tasks, resultType); },
        'WhenAny(Task[])': function (tasks) { return whenAny(tasks, rt().type('System.Threading.Tasks.Task')); },
        'WhenAny<TResult>(Task<TResult>[])': function (resultType, tasks) {
            return whenAny(tasks, rt().inst(rt().type('System.Threading.Tasks.Task`1'), [resultType]));
        },
        'WaitAll(Task[])': CS.fiberNative(function* (tasks) {
            var all = whenAll(tasks, null);
            yield* waitTask(all);
        }),
        'WaitAny(Task[])': CS.fiberNative(function* (tasks) {
            var any = whenAny(tasks, rt().type('System.Threading.Tasks.Task'));
            yield* waitTask(any);
            return Array.prototype.indexOf.call(tasks, any.$result);
        }),
        'FromResult<TResult>(TResult)': function (resultType, value) {
            var task = rt().newTask(resultType);
            rt().completeTask(task, value);
            return task;
        },
        'FromException(Exception)': function (error) {
            var task = rt().newTask(null);
            rt().failTask(task, error);
            return task;
        },
        'FromException<TResult>(Exception)': function (resultType, error) {
            var task = rt().newTask(resultType);
            rt().failTask(task, error);
            return task;
        },
        'FromCanceled(CancellationToken)': function () {
            var task = rt().newTask(null);
            rt().cancelTask(task);
            return task;
        }
    };

    function spanMillis(span) {
        return span === null || span === undefined ? 0 : i64.toFloat(span._ticks) / 10000;
    }

    natives['System.Threading.Tasks.Task`1'] = {
        '.ctor(Func<TResult>)': function (fn) {
            return natives['System.Threading.Tasks.Task']['.ctor(Action)'].call(this, fn);
        },
        'get_Result()': CS.fiberNative(function* () {
            yield* waitTask(this);
            return this.$result;
        }),
        'ContinueWith(Action<Task<TResult>>)': function (fn) { return continueWith(this, fn, null); },
        'ContinueWith<TNewResult>(Func<Task<TResult>, TNewResult>)': function (resultType, fn) { return continueWith(this, fn, resultType); }
    };

    natives['System.Threading.Tasks.TaskCompletionSource`1'] = {
        'NewTask()': function () { return rt().newTask(this.prototype['$ta$' + this.$def.$id][0]); },
        'TrySetResult(TResult)': function (value) { return rt().completeTask(this._task, value); },
        'TrySetException(Exception)': function (error) {
            if (error === null || error === undefined)
                throw CS.argNull('exception');
            return rt().failTask(this._task, error);
        },
        'TrySetCanceled()': function () { return rt().cancelTask(this._task); }
    };

    function awaiterResult(awaiter) {
        var task = awaiter._task;
        if (task.$state === 0 || task.$state === -1)
            return rt().sync((function* () { return yield* rt().await(task); })());
        return taskResult(task);
    }

    function awaiterOnCompleted(continuation) {
        var task = this._task;
        if (task.$state > 0) {
            continuation();
            return;
        }
        task.$then.push(function () { continuation(); });
    }

    natives['System.Runtime.CompilerServices.TaskAwaiter'] = {
        'GetResult()': function () { awaiterResult(this); },
        'OnCompleted(Action)': awaiterOnCompleted
    };

    natives['System.Runtime.CompilerServices.TaskAwaiter`1'] = {
        'GetResult()': function () { return awaiterResult(this); },
        'OnCompleted(Action)': awaiterOnCompleted
    };

    natives['System.Runtime.CompilerServices.YieldAwaitable.YieldAwaiter'] = {
        'OnCompleted(Action)': function (continuation) {
            var runtime = rt();
            scheduler().spawn((function* () { yield* runtime.genApply(continuation, null, []); })(), 'yield');
        }
    };

    // --- Iterators

    function iteratorType(name, elementType) {
        return rt().inst(rt().type(name), [elementType]);
    }

    R.enumerable = function (elementType, generator) {
        var Iterator = iteratorType('System.Runtime.CompilerServices.Iterator`1', elementType);
        var iterator = new Iterator();
        iterator.$fn = generator;
        iterator.$gen = null;
        iterator.$fresh = true;
        iterator.$current = this.defaultOf(elementType);
        return iterator;
    };

    R.enumerator = function (elementType, generator) {
        var iterator = this.enumerable(elementType, generator);
        iterator.$fresh = false;
        return iterator;
    };

    natives['System.Runtime.CompilerServices.Iterator`1'] = {
        'GetEnumerator()': function () {
            if (this.$fresh && this.$gen === null) {
                this.$fresh = false;
                return this;
            }
            var copy = new this.constructor();
            copy.$fn = this.$fn;
            copy.$gen = null;
            copy.$fresh = false;
            copy.$current = this.$current;
            return copy;
        },
        'MoveNext()': function () {
            this.$fresh = false;
            if (this.$done)
                return false;
            if (this.$gen === null)
                this.$gen = this.$fn();
            var state = this.$gen.next();
            if (state.done) {
                this.$done = true;
                return false;
            }
            this.$current = state.value;
            return true;
        },
        'get_Current()': function () { return this.$current; },
        'Dispose()': function () {
            if (this.$gen !== null && !this.$done) {
                this.$done = true;
                this.$gen.return(undefined);
            }
        }
    };

    // async iterators: yield return gives an item marker; other yields
    // are waits of the scheduler.
    function Item(value) {
        this.value = value;
    }

    R.item = function (value) {
        return new Item(value);
    };

    R.asyncIterator = function (elementType, generator) {
        var Iterator = iteratorType('System.Runtime.CompilerServices.AsyncIterator`1', elementType);
        var iterator = new Iterator();
        iterator.$fn = generator;
        iterator.$gen = null;
        iterator.$current = this.defaultOf(elementType);
        iterator.$elementType = elementType;
        return iterator;
    };

    natives['System.Runtime.CompilerServices.AsyncIterator`1'] = {
        'GetAsyncEnumerator(CancellationToken)': function () {
            if (this.$gen === null && !this.$started) {
                this.$started = true;
                return this;
            }
            var copy = new this.constructor();
            copy.$fn = this.$fn;
            copy.$gen = null;
            copy.$started = true;
            copy.$current = rt().defaultOf(this.$elementType);
            copy.$elementType = this.$elementType;
            return copy;
        },
        'MoveNextAsync()': function () {
            var runtime = rt();
            var self = this;
            var Boolean = runtime.type('System.Boolean');
            var task = runtime.newTask(Boolean);
            if (this.$done) {
                runtime.completeTask(task, false);
                return runtime.valueTask(task, Boolean);
            }
            if (this.$gen === null)
                this.$gen = this.$fn();
            var generator = this.$gen;
            var drive = function* () {
                var resume;
                for (;;) {
                    var state = generator.next(resume);
                    resume = undefined;
                    if (state.done) {
                        self.$done = true;
                        return false;
                    }
                    if (state.value instanceof Item) {
                        self.$current = state.value.value;
                        return true;
                    }
                    resume = yield state.value;
                }
            };
            runtime.startTask(task, drive(), true);
            return runtime.valueTask(task, Boolean);
        },
        'get_Current()': function () { return this.$current; },
        'DisposeAsync()': function () {
            if (this.$gen !== null && !this.$done) {
                this.$done = true;
                this.$gen.return(undefined);
            }
            return rt().valueTask(null, null);
        }
    };

    // --- Threads: foreground threads keep the program until they end.

    var threadCounter = 1;

    R.resetThreads = function () {
        this.threads = [];
    };

    R.hasPendingFibers = function () {
        return (this.threads || []).some(function (thread) { return thread.$started && !thread.$done && !isBackground(thread); });
    };

    R.awaitFibers = function* () {
        for (;;) {
            var pending = (this.threads || []).filter(function (thread) {
                return thread.$started && !thread.$done && !isBackground(thread);
            });
            if (pending.length === 0)
                return;
            var fiber = scheduler().park();
            pending[0].$joiners.push(fiber);
            yield;
        }
    };

    function isBackground(thread) {
        var name = rt().memberName('System.Threading.Thread', 'get_IsBackground', 0);
        return thread[name]();
    }

    function newThread(thread, start, parameterized) {
        if (start === null || start === undefined)
            throw CS.argNull('start');
        thread.$start = start;
        thread.$parameterized = parameterized;
        thread.$started = false;
        thread.$done = false;
        thread.$joiners = [];
        thread.$id = ++threadCounter;
        thread.$name = null;
        return thread;
    }

    function wakeAll(list) {
        var sched = scheduler();
        list.forEach(function (fiber) {
            sched.sleeping = sched.sleeping.filter(function (other) { return other !== fiber; });
            sched.wakeUp(fiber, undefined);
        });
    }

    function startThread(thread, args) {
        var runtime = rt();
        if (thread.$started)
            throw runtime.exception('System.Threading.ThreadStateException', 'Thread is running or terminated; it cannot restart.');
        thread.$started = true;
        (runtime.threads = runtime.threads || []).push(thread);
        var body = function* () {
            try {
                yield* runtime.genApply(thread.$start, null, args);
            } finally {
                thread.$done = true;
                var joiners = thread.$joiners;
                thread.$joiners = [];
                wakeAll(joiners);
            }
        };
        var fiber = scheduler().spawn(body(), thread.$name || 'thread');
        fiber.thread = thread;
        thread.$fiber = fiber;
    }

    function* joinThread(thread, millis) {
        if (!thread.$started)
            throw rt().exception('System.Threading.ThreadStateException', 'Thread has not been started.');
        if (thread.$done)
            return true;
        var sched = scheduler();
        var fiber = millis !== undefined && millis >= 0 ? sched.sleep(millis) : sched.park();
        thread.$joiners.push(fiber);
        yield;
        thread.$joiners = thread.$joiners.filter(function (other) { return other !== fiber; });
        return thread.$done;
    }

    function currentThread() {
        var runtime = rt();
        var fiber = scheduler().current;
        if (fiber !== null && fiber !== undefined && fiber.thread !== undefined)
            return fiber.thread;
        if (runtime.mainThread === undefined) {
            var Thread = runtime.type('System.Threading.Thread');
            var thread = new Thread();
            thread.$start = null;
            thread.$started = true;
            thread.$done = false;
            thread.$joiners = [];
            thread.$id = 1;
            thread.$name = null;
            runtime.mainThread = thread;
        }
        return runtime.mainThread;
    }

    natives['System.Threading.Thread'] = {
        '.ctor(ThreadStart)': function (start) { return newThread(this, start, false); },
        '.ctor(ParameterizedThreadStart)': function (start) { return newThread(this, start, true); },
        '.ctor(ThreadStart, int)': function (start) { return newThread(this, start, false); },
        'Start()': function () { startThread(this, this.$parameterized ? [null] : []); },
        'Start(object)': function (value) {
            if (!this.$parameterized)
                throw rt().exception('System.InvalidOperationException', 'The thread was created with a ThreadStart delegate that does not accept a parameter.');
            startThread(this, [value]);
        },
        'Join()': CS.fiberNative(function* () { yield* joinThread(this); }),
        'Join(int)': CS.fiberNative(function* (millis) { return yield* joinThread(this, timeoutOf(millis)); }),
        'Sleep(int)': CS.fiberNative(function* (millis) {
            timeoutOf(millis);
            var sched = scheduler();
            if (millis < 0)
                sched.park();
            else
                sched.sleep(millis);
            yield;
        }),
        'Yield()': CS.fiberNative(function* () {
            yield;
            return true;
        }),
        'get_CurrentThread()': currentThread,
        'get_Name()': function () { return this.$name === undefined ? null : this.$name; },
        'set_Name(string)': function (name) {
            if (this.$name !== null && this.$name !== undefined)
                throw rt().exception('System.InvalidOperationException', 'This property has already been set and cannot be modified.');
            this.$name = name;
        },
        'get_IsAlive()': function () { return this.$started && !this.$done; },
        'get_ManagedThreadId()': function () { return this.$id; },
        'get_ThreadState()': function () {
            if (!this.$started)
                return 8;
            if (this.$done)
                return 16;
            return this.$fiber !== undefined && this.$fiber.waiting ? 32 : 0;
        }
    };

    // --- Monitor: fibers take turns; Wait gives the turn until Pulse.

    natives['System.Threading.Monitor'] = {
        'Enter(object)': function (value) { rt().lockOn(value); },
        'Exit(object)': function (value) { rt().lockOn(value); },
        'TryEnter(object)': function (value) {
            rt().lockOn(value);
            return true;
        },
        'IsEntered(object)': function (value) {
            rt().lockOn(value);
            return true;
        },
        'Wait(object)': CS.fiberNative(function* (value) {
            rt().lockOn(value);
            var fiber = scheduler().park();
            (value.$monitorWaiters = value.$monitorWaiters || []).push(fiber);
            yield;
            return true;
        }),
        'Wait(object, int)': CS.fiberNative(function* (value, millis) {
            rt().lockOn(value);
            var sched = scheduler();
            var fiber = millis >= 0 ? sched.sleep(millis) : sched.park();
            (value.$monitorWaiters = value.$monitorWaiters || []).push(fiber);
            fiber.pulsed = false;
            yield;
            var pulsed = fiber.pulsed;
            value.$monitorWaiters = (value.$monitorWaiters || []).filter(function (other) { return other !== fiber; });
            return pulsed || millis < 0;
        }),
        'Pulse(object)': function (value) {
            rt().lockOn(value);
            var waiters = value.$monitorWaiters || [];
            if (waiters.length > 0) {
                value.$monitorWaiters = waiters.slice(1);
                waiters[0].pulsed = true;
                wakeAll([waiters[0]]);
            }
        },
        'PulseAll(object)': function (value) {
            rt().lockOn(value);
            var waiters = value.$monitorWaiters || [];
            value.$monitorWaiters = [];
            waiters.forEach(function (fiber) { fiber.pulsed = true; });
            wakeAll(waiters);
        }
    };

    function exchange(ref, value) {
        var old = ref.v;
        ref.v = value;
        return old;
    }

    function compareExchange(equals) {
        return function (ref, value, comparand) {
            var old = ref.v;
            if (equals(old, comparand))
                ref.v = value;
            return old;
        };
    }

    var same = function (left, right) { return left === right; };

    natives['System.Threading.Interlocked'] = {
        'Increment(ref int)': function (ref) { return (ref.v = (ref.v + 1) | 0); },
        'Increment(ref long)': function (ref) { return (ref.v = i64.add(ref.v, 1)); },
        'Decrement(ref int)': function (ref) { return (ref.v = (ref.v - 1) | 0); },
        'Decrement(ref long)': function (ref) { return (ref.v = i64.sub(ref.v, 1)); },
        'Add(ref int, int)': function (ref, value) { return (ref.v = (ref.v + value) | 0); },
        'Add(ref long, long)': function (ref, value) { return (ref.v = i64.add(ref.v, value)); },
        'Exchange(ref int, int)': exchange,
        'Exchange(ref long, long)': exchange,
        'Exchange(ref double, double)': exchange,
        'Exchange(ref object, object)': exchange,
        'Exchange<T>(ref T, T)': function (type, ref, value) { return exchange(ref, value); },
        'CompareExchange(ref int, int, int)': compareExchange(same),
        'CompareExchange(ref long, long, long)': compareExchange(function (left, right) { return i64.eq(left, right); }),
        'CompareExchange(ref double, double, double)': compareExchange(same),
        'CompareExchange(ref object, object, object)': compareExchange(same),
        'CompareExchange<T>(ref T, T, T)': function (type, ref, value, comparand) { return compareExchange(same)(ref, value, comparand); },
        'Read(ref long)': function (ref) { return ref.v; }
    };

    natives['System.Threading.CancellationTokenSource'] = {
        'CancelAfter(int)': function (millis) {
            if (millis < -1)
                throw CS.argRange('millisecondsDelay', "The value needs to be either -1 (signifying an infinite timeout), 0 or a positive integer.");
            var source = this;
            var runtime = rt();
            var generation = (this.$cancelGeneration = (this.$cancelGeneration || 0) + 1);
            if (millis < 0)
                return;
            var cancel = source[runtime.methodByKey('System.Threading.CancellationTokenSource', 'Cancel()')];
            scheduler().spawn((function* () {
                scheduler().sleep(millis);
                yield;
                if (source.$cancelGeneration === generation)
                    cancel.call(source);
            })(), 'cancel');
        }
    };
})(globalThis);
