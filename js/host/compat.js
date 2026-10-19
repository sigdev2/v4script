// Compatibility of the Qt 6.4 JavaScript engine (V4) with modern JavaScript.
//
// Runs once per engine, before any other code. Defines globalThis, adds the
// ES2019-2022 built-ins that V4 lacks and fixes its bugs: split by an
// expression that matches the empty string ('abc'.split(/(?:)/) gives five
// empty strings), substr and endsWith with an explicit undefined. The
// interpreters of other languages stumbled over them. Everything added is
// non-enumerable, like the built-ins. A second run does nothing.
(function (global) {
    'use strict';

    if (global.__v4scriptCompat)
        return;
    Object.defineProperty(global, '__v4scriptCompat', { value: true, configurable: true });
    // globalThis came to JavaScript later than Qt 6.4 supported it.
    if (global.globalThis === undefined)
        Object.defineProperty(global, 'globalThis', { value: global, writable: true, configurable: true });

    function define(object, name, value) {
        if (object[name] === undefined)
            Object.defineProperty(object, name, { value: value, writable: true, configurable: true });
    }

    function toInteger(value) {
        var number = Number(value);
        return isNaN(number) ? 0 : Math.trunc(number);
    }

    // --- String.prototype.split by the algorithm of the standard (@@split):
    // matches are searched from every position, an empty match where the
    // previous part ended is skipped.
    var nativeSplit = String.prototype.split;
    Object.defineProperty(String.prototype, 'split', {
        value: function split(separator, limit) {
            if (!(separator instanceof RegExp))
                return nativeSplit.call(this, separator, limit);
            var text = String(this);
            var result = [];
            var maximum = limit === undefined ? 0xFFFFFFFF : limit >>> 0;
            if (maximum === 0)
                return result;
            var expression = new RegExp(separator.source,
                                        separator.flags.replace('g', '').replace('y', '') + 'g');
            if (text.length === 0) {
                expression.lastIndex = 0;
                var empty = expression.exec(text);
                return empty !== null && empty.index === 0 ? [] : [text];
            }
            var start = 0;
            var position = 0;
            while (position < text.length) {
                expression.lastIndex = position;
                var match = expression.exec(text);
                if (match === null || match.index >= text.length)
                    break;
                var end = match.index + match[0].length;
                if (end === start || (match[0].length === 0 && match.index === start)) {
                    position = match.index + 1;
                    continue;
                }
                result.push(text.slice(start, match.index));
                if (result.length === maximum)
                    return result;
                for (var group = 1; group < match.length; ++group) {
                    result.push(match[group]);
                    if (result.length === maximum)
                        return result;
                }
                start = end;
                position = match[0].length === 0 ? end + 1 : end;
            }
            result.push(text.slice(start));
            return result;
        },
        writable: true,
        configurable: true
    });

    // V4 takes an explicit undefined length or end for zero, while the
    // standard reads it as "to the end": 'abc'.substr(1, undefined) gives ''
    // instead of 'bc'.
    var nativeSubstr = String.prototype.substr;
    Object.defineProperty(String.prototype, 'substr', {
        value: function substr(start, length) {
            return length === undefined ? nativeSubstr.call(this, start) : nativeSubstr.call(this, start, length);
        },
        writable: true,
        configurable: true
    });

    var nativeEndsWith = String.prototype.endsWith;
    Object.defineProperty(String.prototype, 'endsWith', {
        value: function endsWith(search, end) {
            return end === undefined ? nativeEndsWith.call(this, search) : nativeEndsWith.call(this, search, end);
        },
        writable: true,
        configurable: true
    });

    // --- RegExp.prototype.source: V4 puts a backslash before every slash,
    // even an escaped one (/\//.source is "\\\\/"), and an expression built
    // again from its source looks for a backslash. Uniter builds its lexer
    // so, and PHP comments did not parse. The getter takes the native text
    // back and escapes slashes as the standard does.
    var nativeSource = Object.getOwnPropertyDescriptor(RegExp.prototype, 'source');
    if (nativeSource !== undefined && typeof nativeSource.get === 'function' && /\//.source !== '\\/') {
        Object.defineProperty(RegExp.prototype, 'source', {
            get: function source() {
                var text = nativeSource.get.call(this).replace(/\\\//g, '/');
                var result = '';
                for (var index = 0; index < text.length; ++index) {
                    var character = text.charAt(index);
                    if (character === '\\') {
                        result += character + text.charAt(index + 1);
                        ++index;
                    } else {
                        result += character === '/' ? '\\/' : character;
                    }
                }
                return result;
            },
            configurable: true
        });
        Object.defineProperty(RegExp.prototype, 'toString', {
            value: function toString() {
                return '/' + this.source + '/' + this.flags;
            },
            writable: true,
            configurable: true
        });
    }

    // --- Object

    define(Object, 'fromEntries', function fromEntries(entries) {
        var object = {};
        var iterator = entries[Symbol.iterator]();
        for (var step = iterator.next(); !step.done; step = iterator.next())
            object[step.value[0]] = step.value[1];
        return object;
    });

    define(Object, 'hasOwn', function hasOwn(object, key) {
        return Object.prototype.hasOwnProperty.call(Object(object), key);
    });

    // --- Array

    function flatten(target, source, depth) {
        for (var index = 0; index < source.length; ++index) {
            if (!(index in source))
                continue;
            var value = source[index];
            if (depth > 0 && Array.isArray(value))
                flatten(target, value, depth - 1);
            else
                target.push(value);
        }
        return target;
    }

    define(Array.prototype, 'flat', function flat(depth) {
        return flatten([], Object(this), depth === undefined ? 1 : toInteger(depth));
    });

    define(Array.prototype, 'flatMap', function flatMap(callback, thisArgument) {
        return flatten([], Array.prototype.map.call(Object(this), callback, thisArgument), 1);
    });

    function at(index) {
        var object = Object(this);
        var length = object.length >>> 0;
        var position = toInteger(index);
        if (position < 0)
            position += length;
        if (position < 0 || position >= length)
            return undefined;
        return typeof object === 'string' || object instanceof String ? String(object).charAt(position)
                                                                        : object[position];
    }

    define(Array.prototype, 'at', at);
    define(String.prototype, 'at', at);

    define(Array.prototype, 'findLast', function findLast(predicate, thisArgument) {
        var object = Object(this);
        for (var index = (object.length >>> 0) - 1; index >= 0; --index) {
            if (predicate.call(thisArgument, object[index], index, object))
                return object[index];
        }
        return undefined;
    });

    define(Array.prototype, 'findLastIndex', function findLastIndex(predicate, thisArgument) {
        var object = Object(this);
        for (var index = (object.length >>> 0) - 1; index >= 0; --index) {
            if (predicate.call(thisArgument, object[index], index, object))
                return index;
        }
        return -1;
    });

    // --- String

    define(String.prototype, 'trimStart', function trimStart() {
        return String(this).replace(/^[\s\uFEFF\xA0]+/, '');
    });
    define(String.prototype, 'trimEnd', function trimEnd() {
        return String(this).replace(/[\s\uFEFF\xA0]+$/, '');
    });
    define(String.prototype, 'trimLeft', String.prototype.trimStart);
    define(String.prototype, 'trimRight', String.prototype.trimEnd);

    define(String.prototype, 'replaceAll', function replaceAll(search, replacement) {
        if (search instanceof RegExp) {
            if (!search.global)
                throw new TypeError('replaceAll must be called with a global RegExp');
            return String(this).replace(search, replacement);
        }
        var escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return String(this).replace(new RegExp(escaped, 'g'),
                                    typeof replacement === 'function' ? replacement
                                                                      : String(replacement));
    });

    define(String.prototype, 'matchAll', function matchAll(expression) {
        var flags = expression instanceof RegExp ? expression.flags : 'g';
        if (expression instanceof RegExp && flags.indexOf('g') < 0)
            throw new TypeError('matchAll must be called with a global RegExp');
        var pattern = new RegExp(expression, flags.indexOf('g') < 0 ? flags + 'g' : flags);
        var text = String(this);
        var matches = [];
        var match;
        while ((match = pattern.exec(text)) !== null) {
            matches.push(match);
            if (match[0] === '')
                ++pattern.lastIndex;
        }
        return matches[Symbol.iterator]();
    });

    // --- Promise

    define(Promise.prototype, 'finally', function (callback) {
        return this.then(function (value) {
            return Promise.resolve(callback()).then(function () { return value; });
        }, function (reason) {
            return Promise.resolve(callback()).then(function () { throw reason; });
        });
    });

    define(Promise, 'allSettled', function allSettled(promises) {
        return Promise.all(Array.from(promises, function (promise) {
            return Promise.resolve(promise).then(function (value) {
                return { status: 'fulfilled', value: value };
            }, function (reason) {
                return { status: 'rejected', reason: reason };
            });
        }));
    });

    define(Promise, 'any', function any(promises) {
        var list = Array.from(promises);
        return new Promise(function (resolve, reject) {
            var errors = [];
            var pending = list.length;
            if (pending === 0)
                reject(new Error('All promises were rejected'));
            list.forEach(function (promise, index) {
                Promise.resolve(promise).then(resolve, function (reason) {
                    errors[index] = reason;
                    if (--pending === 0) {
                        var error = new Error('All promises were rejected');
                        error.errors = errors;
                        reject(error);
                    }
                });
            });
        });
    });

    define(global, 'queueMicrotask', function queueMicrotask(callback) {
        Promise.resolve().then(callback);
    });
})
