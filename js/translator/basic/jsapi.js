// BASIC: JavaScript values (the type OBJECT) and host modules, helpers of
// the translated code: GOSUB and RETURN, the ON ERROR trap, END, arrays.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Basic = T.basic;
    if (Basic.jsapi)
        return;
    Basic.jsapi = true;

    var Runtime = Basic.Runtime;
    var BasicError = Basic.BasicError;
    var fail = Basic.fail;

    function jsErrorText(error) {
        if (error !== null && typeof error === 'object' && error.message !== undefined)
            return (error.name && error.name !== 'Error' ? error.name + ': ' : '') + error.message;
        return String(error);
    }

    // A JavaScript call: an exception becomes a BASIC error (code 5) with its text.
    Runtime.prototype.guard = function (callback) {
        try {
            return callback();
        } catch (error) {
            if (error instanceof T.LanguageError || error instanceof Basic.BasicEnd)
                throw error;
            var failure = new BasicError(5, jsErrorText(error));
            if (error !== null && typeof error === 'object' && /translated\//.test(String(error.stack || '')))
                failure.stack = error.stack;
            throw failure;
        }
    };

    function target(value, what) {
        if (value === null || value === undefined)
            throw new BasicError(5, what + ': the value is null');
        return value;
    }

    // --- OBJECT values in BASIC

    // A number from a JavaScript value: true is -1, a string with a number is the number.
    Runtime.prototype.on = function (value) {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'boolean')
            return value ? -1 : 0;
        if (value === null || value === undefined)
            return 0;
        if (typeof value === 'string' && value.trim().length > 0 && isFinite(Number(value)))
            return Number(value);
        fail(13);
    };

    Runtime.prototype.os = function (value) {
        if (typeof value === 'string')
            return value;
        if (value === null || value === undefined)
            return '';
        if (typeof value === 'number' || typeof value === 'boolean')
            return String(value);
        return this.env.host.format(value);
    };

    // PRINT of a JavaScript value: as the console shows it.
    Runtime.prototype.oshow = function (value) {
        if (typeof value === 'string')
            return value;
        return this.env.host.format(value);
    };

    // PRINT of a JavaScript value: a number as a BASIC number (with spaces).
    Runtime.prototype.po = function (value) {
        if (typeof value === 'number' && isFinite(value))
            this.pn(value, Number.isInteger(value) && Math.abs(value) <= 2147483647 ? 'l' : 'd');
        else
            this.ps(this.oshow(value));
    };

    Runtime.prototype.otrue = function (value) {
        if (typeof value === 'number')
            return value !== 0;
        return !!value;
    };

    Runtime.prototype.oadd = function (left, right) {
        return left + right;
    };

    Runtime.prototype.ocmp = function (left, right, op) {
        switch (op) {
        case '===': return left === right;
        case '!==': return left !== right;
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        }
        return left >= right;
    };

    // --- Object members

    Runtime.prototype.jg = function (object, name) {
        object = target(object, name);
        return this.guard(function () { return object[name]; });
    };

    Runtime.prototype.js = function (object, name, value) {
        object = target(object, name);
        this.guard(function () { object[name] = value; });
    };

    Runtime.prototype.jc = function (object, name, args) {
        object = target(object, name);
        var fn = object[name];
        if (typeof fn !== 'function')
            throw new BasicError(5, "'" + name + "' is not a function");
        return this.guard(function () { return fn.apply(object, args); });
    };

    // An object with arguments: a function is called, otherwise an element.
    Runtime.prototype.ja = function (object, args) {
        object = target(object, 'value');
        if (typeof object === 'function')
            return this.guard(function () { return object.apply(null, args); });
        if (args.length !== 1)
            fail(5);
        return this.guard(function () { return object[args[0]]; });
    };

    Runtime.prototype.jsi = function (object, args, value) {
        object = target(object, 'value');
        if (args.length !== 1)
            fail(5);
        this.guard(function () { object[args[0]] = value; });
    };

    Runtime.prototype.jnew = function (constructor, args) {
        constructor = target(constructor, 'JSNEW');
        return this.guard(function () {
            return new (Function.prototype.bind.apply(constructor, [null].concat(args)))();
        });
    };

    Runtime.prototype.jtype = function (value) {
        return value === null ? 'null' : typeof value;
    };

    Runtime.prototype.jnull = function (value) {
        return value === null || value === undefined;
    };

    // A BASIC array becomes a JavaScript array (nested ones for several dimensions).
    Runtime.prototype.arrayToJs = function (array) {
        if (!array.dimensioned)
            return [];
        var data = array.d, counts = array.counts;
        var self = this;
        var convert = function (value) {
            return array.kind === 'r' ? self.recordToJs(value, array.record) : value;
        };
        var build = function (dimension, offset) {
            var result = [];
            var stride = 1;
            for (var index = dimension + 1; index < counts.length; ++index)
                stride *= counts[index];
            for (var element = 0; element < counts[dimension]; ++element) {
                if (dimension === counts.length - 1)
                    result.push(convert(data[offset + element]));
                else
                    result.push(build(dimension + 1, offset + element * stride));
            }
            return result;
        };
        return build(0, 0);
    };

    Runtime.prototype.recordToJs = function (record, type) {
        var object = {};
        var self = this;
        type.fields.forEach(function (field) {
            var value = record[field.js];
            object[field.display] = field.kind === 'r' ? self.recordToJs(value, field.record) : value;
        });
        return object;
    };

    // --- Host modules

    Runtime.prototype.hostCall = function (moduleIndex, fnIndex, args) {
        var fn = this.env.modules[moduleIndex].functions[fnIndex];
        this.flush();
        var result = this.guard(function () { return fn.invoke(args); });
        switch (fn.result) {
        case 'string':
            return result === null || result === undefined ? '' : String(result);
        case 'number':
        case 'int':
            return Number(result) || 0;
        case 'bool':
            return result ? -1 : 0;
        }
        return result;
    };

    Runtime.prototype.hostModule = function (moduleIndex) {
        return this.env.modules[moduleIndex].object;
    };

    // JSFUNCTION("name"): a BASIC procedure as a JavaScript function; the
    // arguments are converted to the parameter types, a FUNCTION returns
    // its value.
    Runtime.prototype.jfunction = function (name) {
        var session = this.session;
        var key = name.toLowerCase();
        var proc = session.procs[key];
        if (proc === undefined || proc.kind === 'def')
            throw new BasicError(5, 'JSFUNCTION: procedure not defined: ' + name);
        var made = session.functions.get(key);
        if (made !== undefined)
            return made;
        var self = this;
        made = function () {
            var current = session.procs[key];
            var args = [];
            for (var index = 0; index < current.params.length; ++index) {
                var param = current.params[index];
                var value = arguments[index];
                if (param.array || typeof param.type !== 'string')
                    throw new BasicError(5, 'JSFUNCTION: unsupported parameter type');
                args.push(self.fromJs(value, param.type));
            }
            try {
                var result = session.P[current.js].apply(null, args);
                return current.kind === 'function' ? result : undefined;
            } finally {
                if (!session.running)
                    self.flush();
            }
        };
        session.functions.set(key, made);
        return made;
    };

    Runtime.prototype.fromJs = function (value, type) {
        switch (type) {
        case 's': return this.os(value);
        case 'o': return value === undefined ? null : value;
        case 'i': return Basic.cint(this.on(value));
        case 'l': return Basic.clng(this.on(value));
        case 'f': return Basic.csng(this.on(value));
        }
        return Basic.finite(this.on(value));
    };

    // --- Control

    Runtime.prototype.sub = function () {
        fail(9);
    };

    Runtime.prototype.back = function (stack) {
        if (stack.length === 0)
            fail(3);
        return stack.pop();
    };

    Runtime.prototype.onIndex = function (value) {
        if (value < 0 || value > 255)
            fail(5);
        return value;
    };

    Runtime.prototype.raise = function (code) {
        if (code < 1 || code > 255)
            fail(5);
        fail(code);
    };

    Runtime.prototype.end = function () {
        throw new Basic.BasicEnd();
    };

    // The ON ERROR trap: an error that can be caught goes to the handler.
    Runtime.prototype.trap = function (error, handler, active, current, tables) {
        if (handler === 0 || active || error instanceof Basic.BasicEnd)
            throw error;
        var code;
        if (error instanceof BasicError) {
            if (!error.trappable)
                throw error;
            code = error.code;
        } else if (error instanceof T.LanguageError) {
            code = 5;
        } else if (error instanceof RangeError) {
            throw error;
        } else {
            code = 5;
        }
        this.err = code;
        this.erl = tables.erl[current] || 0;
        return handler;
    };

    Runtime.prototype.array = function (kind, length, record) {
        return new Basic.BArray(kind, length, record);
    };

    // _DISPLAY: the picture goes to the canvas now and lets others run (the canvas updates).
    Runtime.prototype.display = function* () {
        this.displayNow();
        this.env.scheduler.sleep(0);
        yield;
    };

    Runtime.prototype.displayNow = function () {
        this.flush();
        this.present();
    };

    Runtime.prototype.clearProgram = function () {};

    // --- Files: read-only files of the host. Open files live until CLOSE
    // or the next run of the unit.

    Runtime.prototype.openFiles = function () {
        if (this.files === undefined || this.files === null)
            this.files = Object.create(null);
        return this.files;
    };

    Runtime.prototype.file = function (number) {
        var file = this.openFiles()[number];
        if (file === undefined)
            fail(52);
        return file;
    };

    Runtime.prototype.fileOpen = function (name, mode, number) {
        if (number < 1 || number > 255)
            fail(52);
        var files = this.openFiles();
        if (files[number] !== undefined)
            fail(55);
        if (mode === 'OUTPUT' || mode === 'APPEND')
            fail(70);
        if (mode !== 'INPUT')
            fail(73);
        var text = name.length > 0 ? this.env.readModule(name) : null;
        if (text === null)
            fail(53);
        files[number] = { name: name, text: text.replace(/\r\n/g, '\n'), position: 0 };
    };

    Runtime.prototype.fileClose = function (numbers) {
        var files = this.openFiles();
        if (numbers.length === 0) {
            this.files = null;
            return;
        }
        numbers.forEach(function (number) { delete files[number]; });
    };

    Runtime.prototype.freeFile = function () {
        var files = this.openFiles();
        for (var number = 1; number <= 255; ++number) {
            if (files[number] === undefined)
                return number;
        }
        fail(67);
    };

    Runtime.prototype.fileWriteLine = function (number) {
        this.file(number);
        fail(54);
    };

    Runtime.prototype.fileEOF = function (number) {
        var file = this.file(number);
        return file.position >= file.text.length ? -1 : 0;
    };

    Runtime.prototype.fileLOF = function (number) {
        return this.file(number).text.length;
    };

    Runtime.prototype.fileLOC = function (number) {
        return Math.ceil(this.file(number).position / 128);
    };

    Runtime.prototype.fileLine = function (number) {
        var file = this.file(number);
        if (file.position >= file.text.length)
            fail(62);
        var end = file.text.indexOf('\n', file.position);
        if (end < 0)
            end = file.text.length;
        var line = file.text.substring(file.position, end);
        file.position = end + 1;
        return line;
    };

    Runtime.prototype.fileReadChars = function (number, count) {
        var file = this.file(number);
        if (file.position + count > file.text.length)
            fail(62);
        var text = file.text.substr(file.position, count);
        file.position += count;
        return text;
    };

    // A field of INPUT #: a string in quotes or up to a comma or the end of
    // the line; a number also ends at a space.
    Runtime.prototype.fileField = function (number, numeric) {
        var file = this.file(number);
        var text = file.text;
        var at = file.position;
        while (at < text.length && (text.charAt(at) === ' ' || text.charAt(at) === '\t' ||
                                    (text.charAt(at) === '\n' && numeric)))
            ++at;
        if (at >= text.length) {
            if (file.position >= text.length)
                fail(62);
            file.position = at;
            return numeric ? '0' : '';
        }
        var value;
        if (!numeric && text.charAt(at) === '"') {
            var close = text.indexOf('"', at + 1);
            if (close < 0)
                close = text.length;
            value = text.substring(at + 1, close);
            at = close + 1;
            while (at < text.length && text.charAt(at) !== ',' && text.charAt(at) !== '\n')
                ++at;
        } else {
            var start = at;
            while (at < text.length && text.charAt(at) !== ',' && text.charAt(at) !== '\n' &&
                   !(numeric && (text.charAt(at) === ' ' || text.charAt(at) === '\t')))
                ++at;
            value = text.substring(start, at).replace(/\s+$/, '');
            while (numeric && at < text.length && (text.charAt(at) === ' ' || text.charAt(at) === '\t'))
                ++at;
        }
        if (at < text.length && (text.charAt(at) === ',' || text.charAt(at) === '\n'))
            ++at;
        file.position = at;
        return value;
    };
})(globalThis);
