// C#: the natives of Console and the console streams, File (the files of
// the host, written files kept in memory), Math and MathF, Convert,
// BitConverter, Environment, Random, Type and Activator, TextInfo.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    var natives = CS.natives;
    if (natives['System.Console'])
        return;

    var i64 = T.i64, u64 = T.u64, big = T.big;
    var decimal = CS.decimal;

    function rt() {
        return CS.rt;
    }

    function env() {
        return CS.rt.session.env;
    }

    function fail(name, message, inner) {
        return rt().exception(name, message, inner);
    }

    function unboxed(value) {
        return value !== null && typeof value === 'object' && value.$boxed === true ? value.v : value;
    }

    // --- Console: the streams of the host unless SetOut, SetError, SetIn

    function consoleState() {
        var runtime = rt();
        if (runtime.console === undefined)
            runtime.console = { out: null, err: null, input: null, outWriter: null, errWriter: null, inReader: null,
                                foreground: 7, background: 0, title: '', cursorVisible: true };
        return runtime.console;
    }

    function writerMethod(name, key) {
        var runtime = rt();
        var cache = runtime.writerNames || (runtime.writerNames = Object.create(null));
        if (cache[key] === undefined)
            cache[key] = runtime.methodByKey(name, key);
        return cache[key];
    }

    function writeOut(text) {
        var state = consoleState();
        if (state.out !== null) {
            state.out[writerMethod('System.IO.TextWriter', 'Write(string)')](text);
            return;
        }
        hostWrite(false, text);
    }

    function writeErr(text) {
        var state = consoleState();
        if (state.err !== null) {
            state.err[writerMethod('System.IO.TextWriter', 'Write(string)')](text);
            return;
        }
        hostWrite(true, text);
    }

    // Console.Out and Console.Error of .NET flush every write: the text of
    // both keeps its order (Out goes to the host by lines).
    function hostWrite(error, text) {
        if (!error) {
            env().out.write(text);
            return;
        }
        env().out.flush();
        env().err.write(text);
        env().err.flush();
    }

    function textOf(kind, value) {
        switch (kind) {
        case 'bool':
            return value ? 'True' : 'False';
        case 'char':
            return String.fromCharCode(value);
        case 'chars':
            return value === null || value === undefined ? '' : CS.charsToString(value, 0, value.length);
        case 'decimal':
            return decimal.str(value);
        case 'double':
            return CS.formatDouble(value, false);
        case 'float':
            return CS.formatDouble(value, true);
        case 'long':
            return i64.str(value);
        case 'ulong':
            return u64.str(value);
        case 'object':
            return rt().objectString(value);
        case 'string':
            return value === null || value === undefined ? '' : value;
        }
        return String(value);
    }

    var WRITE_KINDS = [['bool', 'bool'], ['char', 'char'], ['char[]', 'chars'], ['decimal', 'decimal'], ['double', 'double'],
                       ['float', 'float'], ['int', 'int'], ['uint', 'uint'], ['long', 'long'], ['ulong', 'ulong'],
                       ['object', 'object'], ['string', 'string']];

    var consoleTable = natives['System.Console'] = {
        'get_Out()': function () {
            var state = consoleState();
            if (state.out !== null)
                return state.out;
            if (state.outWriter === null) {
                var Writer = rt().type('System.IO.ConsoleWriter');
                state.outWriter = new Writer().$ctor$1(false);
            }
            return state.outWriter;
        },
        'get_Error()': function () {
            var state = consoleState();
            if (state.err !== null)
                return state.err;
            if (state.errWriter === null) {
                var Writer = rt().type('System.IO.ConsoleWriter');
                state.errWriter = new Writer().$ctor$1(true);
            }
            return state.errWriter;
        },
        'get_In()': function () {
            var state = consoleState();
            if (state.input !== null)
                return state.input;
            if (state.inReader === null) {
                var Reader = rt().type('System.IO.ConsoleReader');
                state.inReader = new Reader().$ctor$0();
            }
            return state.inReader;
        },
        'SetOut(TextWriter)': function (writer) {
            if (writer === null || writer === undefined)
                throw CS.argNull('newOut');
            var state = consoleState();
            env().out.flush();
            state.out = writer === state.outWriter ? null : writer;
        },
        'SetError(TextWriter)': function (writer) {
            if (writer === null || writer === undefined)
                throw CS.argNull('newError');
            var state = consoleState();
            state.err = writer === state.errWriter ? null : writer;
        },
        'SetIn(TextReader)': function (reader) {
            if (reader === null || reader === undefined)
                throw CS.argNull('newIn');
            var state = consoleState();
            state.input = reader === state.inReader ? null : reader;
        },
        'WriteLine()': function () { writeOut('\n'); },
        'WriteLine(char[], int, int)': function (chars, index, count) { writeOut(charsRange(chars, index, count) + '\n'); },
        'Write(char[], int, int)': function (chars, index, count) { writeOut(charsRange(chars, index, count)); },
        'WriteLine(string, object)': function (format, a) { writeOut(CS.composite(format, [a]) + '\n'); },
        'WriteLine(string, object, object)': function (format, a, b) { writeOut(CS.composite(format, [a, b]) + '\n'); },
        'WriteLine(string, object, object, object)': function (format, a, b, c) { writeOut(CS.composite(format, [a, b, c]) + '\n'); },
        'WriteLine(string, object[])': function (format, args) { writeOut(CS.composite(format, args === null ? [null] : args) + '\n'); },
        'Write(string, object)': function (format, a) { writeOut(CS.composite(format, [a])); },
        'Write(string, object, object)': function (format, a, b) { writeOut(CS.composite(format, [a, b])); },
        'Write(string, object, object, object)': function (format, a, b, c) { writeOut(CS.composite(format, [a, b, c])); },
        'Write(string, object[])': function (format, args) { writeOut(CS.composite(format, args === null ? [null] : args)); },
        'ReadLine()': function () {
            var state = consoleState();
            if (state.input !== null)
                return state.input[writerMethod('System.IO.TextReader', 'ReadLine()')]();
            env().out.flush();
            return env().input.readLine();
        },
        'Read()': function () {
            var state = consoleState();
            if (state.input !== null)
                return state.input[writerMethod('System.IO.TextReader', 'Read()')]();
            var ch = env().input.readChar();
            return ch === null ? -1 : ch.charCodeAt(0);
        },
        'ReadKey()': function () { return readKey(); },
        'ReadKey(bool)': function () { return readKey(); },
        'get_KeyAvailable()': function () { return env().input.isReady(); },
        'Clear()': function () { env().clear(); },
        'Beep()': function () { },
        'ResetColor()': function () {
            var state = consoleState();
            state.foreground = 7;
            state.background = 0;
        },
        'get_ForegroundColor()': function () { return consoleState().foreground; },
        'set_ForegroundColor(ConsoleColor)': function (color) { consoleState().foreground = color; },
        'get_BackgroundColor()': function () { return consoleState().background; },
        'set_BackgroundColor(ConsoleColor)': function (color) { consoleState().background = color; },
        'get_Title()': function () { return consoleState().title; },
        'set_Title(string)': function (title) { consoleState().title = title; },
        'get_CursorVisible()': function () { return consoleState().cursorVisible; },
        'set_CursorVisible(bool)': function (visible) { consoleState().cursorVisible = visible; },
        'get_CursorLeft()': function () { return 0; },
        'set_CursorLeft(int)': function () { },
        'get_CursorTop()': function () { return 0; },
        'set_CursorTop(int)': function () { },
        'get_WindowWidth()': function () { return 80; },
        'set_WindowWidth(int)': function () { },
        'get_WindowHeight()': function () { return 25; },
        'set_WindowHeight(int)': function () { },
        'get_BufferWidth()': function () { return 80; },
        'set_BufferWidth(int)': function () { },
        'SetCursorPosition(int, int)': function () { },
        'get_OutputEncoding()': function () { return rt().type('System.Text.Encoding').s$UTF8; },
        'set_OutputEncoding(Encoding)': function () { },
        'get_InputEncoding()': function () { return rt().type('System.Text.Encoding').s$UTF8; },
        'set_InputEncoding(Encoding)': function () { },
        'get_IsOutputRedirected()': function () { return true; },
        'get_IsInputRedirected()': function () { return true; }
    };
    WRITE_KINDS.forEach(function (pair) {
        consoleTable['WriteLine(' + pair[0] + ')'] = function (value) { writeOut(textOf(pair[1], value) + '\n'); };
        consoleTable['Write(' + pair[0] + ')'] = function (value) { writeOut(textOf(pair[1], value)); };
    });

    function charsRange(chars, index, count) {
        if (chars === null || chars === undefined)
            throw CS.argNull('buffer');
        if (index < 0 || count < 0 || chars.length - index < count)
            throw CS.argError('Offset and length were out of bounds for the array or count is greater than the number of elements from index to the end of the source collection.');
        return CS.charsToString(chars, index, count);
    }

    function readKey() {
        env().out.flush();
        var ch = env().input.readChar();
        if (ch === null)
            throw fail('System.InvalidOperationException',
                       'Cannot read keys when either application does not have a console or when console input has been redirected. Try Console.Read.');
        var code = ch.charCodeAt(0);
        var key = code >= 97 && code <= 122 ? code - 32 : (code === 10 ? 13 : code);
        var Info = rt().type('System.ConsoleKeyInfo');
        return new Info().$ctor$5(code === 10 ? 13 : code, key, code >= 65 && code <= 90, false, false);
    }

    // The console writers write to the host directly (not through SetOut).
    natives['System.IO.ConsoleWriter'] = {
        'Write(char)': function (code) { hostWrite(this._error, String.fromCharCode(code)); },
        'Write(string)': function (text) { hostWrite(this._error, text === null || text === undefined ? '' : text); },
        'Flush()': function () { (this._error ? env().err : env().out).flush(); }
    };

    natives['System.IO.ConsoleReader'] = {
        'Peek()': function () {
            var ch = env().input.peekChar();
            return ch === null ? -1 : ch.charCodeAt(0);
        },
        'Read()': function () {
            var ch = env().input.readChar();
            return ch === null ? -1 : ch.charCodeAt(0);
        },
        'ReadLine()': function () {
            env().out.flush();
            return env().input.readLine();
        },
        'ReadToEnd()': function () { return env().input.readAll(); }
    };

    // --- Files: the host's files (read only), written files in memory

    function files() {
        var runtime = rt();
        if (runtime.files === undefined)
            runtime.files = Object.create(null);
        return runtime.files;
    }

    function checkPath(path) {
        if (path === null || path === undefined)
            throw CS.argNull('path');
        if (path.length === 0)
            throw CS.argError('The value cannot be an empty string.', 'path');
        return path;
    }

    function readFile(path) {
        checkPath(path);
        var written = files()[path];
        if (written !== undefined)
            return written;
        var text = env().readModule(path);
        if (text === null || text === undefined)
            throw fail('System.IO.FileNotFoundException', "Could not find file '" + path + "'.");
        return text;
    }
    CS.readFile = readFile;

    function splitLines(text) {
        var lines = text.split(/\r\n|\r|\n/);
        if (lines.length > 0 && lines[lines.length - 1] === '')
            lines.pop();
        return lines;
    }

    natives['System.IO.File'] = {
        'Exists(string)': function (path) {
            if (path === null || path === undefined || path.length === 0)
                return false;
            if (files()[path] !== undefined)
                return true;
            var text = env().readModule(path);
            return text !== null && text !== undefined;
        },
        'ReadAllText(string)': function (path) { return readFile(path).replace(/^\uFEFF/, ''); },
        'ReadAllLines(string)': function (path) { return CS.stringArray(splitLines(readFile(path).replace(/^\uFEFF/, ''))); },
        'WriteAllText(string, string)': function (path, text) { files()[checkPath(path)] = text === null || text === undefined ? '' : text; },
        'AppendAllText(string, string)': function (path, text) {
            checkPath(path);
            var old = '';
            try {
                old = readFile(path);
            } catch (error) {
                if (!rt().isException(error))
                    throw error;
            }
            files()[path] = old + (text === null || text === undefined ? '' : text);
        },
        'WriteAllLines(string, string[])': function (path, lines) {
            if (lines === null || lines === undefined)
                throw CS.argNull('contents');
            files()[checkPath(path)] = Array.prototype.map.call(lines, function (line) { return (line || '') + '\n'; }).join('');
        }
    };

    // --- Math

    function roundEven(value) {
        if (!isFinite(value))
            return value;
        var rounded = Math.round(value);
        if (Math.abs(value % 1) === 0.5)
            rounded = 2 * Math.round(value / 2);
        return rounded === 0 && (value < 0 || 1 / value < 0) ? -0 : rounded;
    }
    CS.roundEven = roundEven;

    var POWERS_OF_TEN = [1, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15];

    function roundTo(value, digits, mode) {
        if (!(digits >= 0 && digits <= 15))
            throw CS.argRange('digits', 'Rounding digits must be between 0 and 15, inclusive.');
        if (!(mode >= 0 && mode <= 4))
            throw CS.argError("The value '" + mode + "' is not a valid MidpointRounding value.", 'mode');
        if (Math.abs(value) < 1e16) {
            var power = POWERS_OF_TEN[digits];
            var scaled = value * power;
            switch (mode) {
            case 0:
                scaled = roundEven(scaled);
                break;
            case 1: {
                var whole = Math.trunc(scaled);
                var fraction = scaled - whole;
                if (Math.abs(fraction) >= 0.5)
                    whole += Math.sign(fraction);
                scaled = whole;
                break;
            }
            case 2:
                scaled = Math.trunc(scaled);
                break;
            case 3:
                scaled = Math.floor(scaled);
                break;
            case 4:
                scaled = Math.ceil(scaled);
                break;
            }
            value = scaled / power;
        }
        return value;
    }

    function signOf(value) {
        if (value !== value)
            throw fail('System.ArithmeticException', 'Function does not accept floating point Not-a-Number values.');
        return value > 0 ? 1 : (value < 0 ? -1 : 0);
    }

    function negateMin() {
        return fail('System.OverflowException', 'Negating the minimum value of a twos complement number is invalid.');
    }

    function clampCheck(min, max, greater) {
        if (greater)
            throw CS.argError("'" + rt().objectString(min) + "' cannot be greater than " + rt().objectString(max) + '.');
    }

    function bits(value) {
        var view = new DataView(new ArrayBuffer(8));
        view.setFloat64(0, value);
        return view;
    }

    function fromBits(view) {
        return view.getFloat64(0);
    }

    function nextUp(value, direction) {
        if (value !== value || value === direction * Infinity)
            return value;
        if (value === 0)
            return direction * 5e-324;
        var view = bits(value);
        var hi = view.getUint32(0), lo = view.getUint32(4);
        var up = (value > 0) === (direction > 0);
        if (up) {
            lo = (lo + 1) >>> 0;
            if (lo === 0)
                hi = (hi + 1) >>> 0;
        } else {
            if (lo === 0)
                hi = (hi - 1) >>> 0;
            lo = (lo - 1) >>> 0;
        }
        view.setUint32(0, hi);
        view.setUint32(4, lo);
        return fromBits(view);
    }

    var mathTable = natives['System.Math'] = {
        'Abs(int)': function (value) {
            if (value === -2147483648)
                throw negateMin();
            return Math.abs(value);
        },
        'Abs(long)': function (value) {
            if (i64.is(value) && value.hi === -2147483648 && value.lo === 0)
                throw negateMin();
            return i64.cmp(value, 0) < 0 ? i64.neg(value) : value;
        },
        'Abs(short)': function (value) {
            if (value === -32768)
                throw negateMin();
            return Math.abs(value);
        },
        'Abs(sbyte)': function (value) {
            if (value === -128)
                throw negateMin();
            return Math.abs(value);
        },
        'Abs(double)': Math.abs,
        'Abs(float)': Math.abs,
        'Abs(decimal)': function (value) { return value.n ? decimal.neg(value) : value; },
        'Pow(double, double)': function (x, y) {
            if (x === 1 || (x === -1 && !isFinite(y)))
                return 1;
            return Math.pow(x, y);
        },
        'Sqrt(double)': Math.sqrt,
        'Cbrt(double)': Math.cbrt,
        'Exp(double)': Math.exp,
        'Log(double)': Math.log,
        'Log(double, double)': function (a, newBase) {
            if (a !== a)
                return a;
            if (newBase !== newBase)
                return newBase;
            if (newBase === 1 || (a !== 1 && (newBase === 0 || newBase === Infinity)))
                return NaN;
            return Math.log(a) / Math.log(newBase);
        },
        'Log10(double)': Math.log10,
        'Log2(double)': Math.log2,
        'Sin(double)': Math.sin,
        'Cos(double)': Math.cos,
        'Tan(double)': Math.tan,
        'Asin(double)': Math.asin,
        'Acos(double)': Math.acos,
        'Atan(double)': Math.atan,
        'Atan2(double, double)': Math.atan2,
        'Sinh(double)': Math.sinh,
        'Cosh(double)': Math.cosh,
        'Tanh(double)': Math.tanh,
        'Asinh(double)': Math.asinh,
        'Acosh(double)': Math.acosh,
        'Atanh(double)': Math.atanh,
        'Floor(double)': Math.floor,
        'Floor(decimal)': function (value) { return decimal.round(value, 0, 'floor'); },
        'Ceiling(double)': Math.ceil,
        'Ceiling(decimal)': function (value) { return decimal.round(value, 0, 'ceiling'); },
        'Truncate(double)': Math.trunc,
        'Truncate(decimal)': function (value) { return decimal.round(value, 0, 'zero'); },
        'Round(double)': roundEven,
        'Round(double, int)': function (value, digits) { return roundTo(value, digits, 0); },
        'Round(double, MidpointRounding)': function (value, mode) { return roundTo(value, 0, mode); },
        'Round(double, int, MidpointRounding)': roundTo,
        'Round(decimal)': function (value) { return CS.decimalRound(value, 0, 0); },
        'Round(decimal, int)': function (value, digits) { return CS.decimalRound(value, digits, 0); },
        'Round(decimal, MidpointRounding)': function (value, mode) { return CS.decimalRound(value, 0, mode); },
        'Round(decimal, int, MidpointRounding)': function (value, digits, mode) { return CS.decimalRound(value, digits, mode); },
        'Sign(int)': function (value) { return value > 0 ? 1 : (value < 0 ? -1 : 0); },
        'Sign(long)': function (value) { return i64.cmp(value, 0); },
        'Sign(double)': signOf,
        'Sign(float)': signOf,
        'Sign(decimal)': function (value) { return decimal.sign(value); },
        'Sign(short)': function (value) { return value > 0 ? 1 : (value < 0 ? -1 : 0); },
        'Sign(sbyte)': function (value) { return value > 0 ? 1 : (value < 0 ? -1 : 0); },
        'BigMul(int, int)': function (a, b) { return i64.mul(a, b); },
        'DivRem(int, int, out int)': function (a, b, result) {
            var quotient = rt().idiv(a, b);
            result.v = rt().imod(a, b);
            return quotient;
        },
        'DivRem(long, long, out long)': function (a, b, result) {
            var quotient = rt().i64.divide(a, b);
            result.v = rt().i64.remainder(a, b);
            return quotient;
        },
        'DivRem(int, int)': function (a, b) {
            var Int32 = rt().type('System.Int32');
            var Tuple = rt().inst(rt().type('System.ValueTuple`2'), [Int32, Int32]);
            return rt().tuple(Tuple, [rt().idiv(a, b), rt().imod(a, b)]);
        },
        'IEEERemainder(double, double)': function (x, y) {
            if (x !== x || y !== y || !isFinite(x) || y === 0)
                return NaN;
            if (!isFinite(y))
                return x;
            var result = x - y * roundEven(x / y);
            return result === 0 ? (x < 0 || 1 / x < 0 ? -0 : 0) : result;
        },
        'Hypot(double, double)': Math.hypot,
        'FusedMultiplyAdd(double, double, double)': function (x, y, z) { return x * y + z; },
        'CopySign(double, double)': function (x, y) {
            var negative = y < 0 || (y === 0 && 1 / y < 0) || (y !== y && bits(y).getUint8(0) >= 128);
            return negative ? -Math.abs(x) : Math.abs(x);
        },
        'MaxMagnitude(double, double)': function (x, y) {
            var ax = Math.abs(x), ay = Math.abs(y);
            if (ax > ay || ax !== ax)
                return x;
            if (ax === ay)
                return x < 0 || (x === 0 && 1 / x < 0) ? y : x;
            return y;
        },
        'MinMagnitude(double, double)': function (x, y) {
            var ax = Math.abs(x), ay = Math.abs(y);
            if (ax < ay || ax !== ax)
                return x;
            if (ax === ay)
                return x < 0 || (x === 0 && 1 / x < 0) ? x : y;
            return y;
        },
        'BitIncrement(double)': function (value) { return nextUp(value, 1); },
        'BitDecrement(double)': function (value) { return nextUp(value, -1); },
        'ScaleB(double, int)': function (x, n) { return x * Math.pow(2, n); },
        'ILogB(double)': function (x) {
            if (x !== x)
                return 2147483647;
            if (x === 0)
                return -2147483648;
            if (!isFinite(x))
                return 2147483647;
            return Math.floor(Math.log2(Math.abs(x)));
        }
    };

    function compareMax(compare) {
        return [function (a, b) { return compare(a, b) >= 0 ? a : b; }, function (a, b) { return compare(a, b) <= 0 ? a : b; }];
    }

    [['int'], ['uint'], ['short'], ['ushort'], ['byte'], ['sbyte']].forEach(function (item) {
        mathTable['Max(' + item[0] + ', ' + item[0] + ')'] = function (a, b) { return a >= b ? a : b; };
        mathTable['Min(' + item[0] + ', ' + item[0] + ')'] = function (a, b) { return a <= b ? a : b; };
    });
    var longPair = compareMax(i64.cmp), ulongPair = compareMax(u64.cmp), decimalPair = compareMax(decimal.cmp);
    mathTable['Max(long, long)'] = longPair[0];
    mathTable['Min(long, long)'] = longPair[1];
    mathTable['Max(ulong, ulong)'] = ulongPair[0];
    mathTable['Min(ulong, ulong)'] = ulongPair[1];
    mathTable['Max(decimal, decimal)'] = decimalPair[0];
    mathTable['Min(decimal, decimal)'] = decimalPair[1];
    function doubleMax(a, b) {
        if (a !== a)
            return a;
        if (a === b)
            return a === 0 && 1 / a < 0 ? b : a;
        return a > b ? a : b;
    }
    function doubleMin(a, b) {
        if (a !== a)
            return a;
        if (a === b)
            return a === 0 && 1 / a < 0 ? a : b;
        return a < b ? a : b;
    }
    mathTable['Max(double, double)'] = doubleMax;
    mathTable['Min(double, double)'] = doubleMin;
    mathTable['Max(float, float)'] = doubleMax;
    mathTable['Min(float, float)'] = doubleMin;
    mathTable['Clamp(int, int, int)'] = function (value, min, max) {
        clampCheck(min, max, min > max);
        return value < min ? min : (value > max ? max : value);
    };
    mathTable['Clamp(byte, byte, byte)'] = mathTable['Clamp(int, int, int)'];
    mathTable['Clamp(long, long, long)'] = function (value, min, max) {
        clampCheck(min, max, i64.cmp(min, max) > 0);
        return i64.cmp(value, min) < 0 ? min : (i64.cmp(value, max) > 0 ? max : value);
    };
    mathTable['Clamp(double, double, double)'] = function (value, min, max) {
        if (min > max)
            throw CS.argError("'" + CS.formatDouble(min, false) + "' cannot be greater than " + CS.formatDouble(max, false) + '.');
        return value < min ? min : (value > max ? max : value);
    };
    mathTable['Clamp(float, float, float)'] = function (value, min, max) {
        if (min > max)
            throw CS.argError("'" + CS.formatDouble(min, true) + "' cannot be greater than " + CS.formatDouble(max, true) + '.');
        return value < min ? min : (value > max ? max : value);
    };
    mathTable['Clamp(decimal, decimal, decimal)'] = function (value, min, max) {
        if (decimal.cmp(min, max) > 0)
            throw CS.argError("'" + decimal.str(min) + "' cannot be greater than " + decimal.str(max) + '.');
        return decimal.cmp(value, min) < 0 ? min : (decimal.cmp(value, max) > 0 ? max : value);
    };

    function single(fn) {
        return function () { return Math.fround(fn.apply(null, arguments)); };
    }

    natives['System.MathF'] = {
        'Abs(float)': Math.abs,
        'Max(float, float)': doubleMax,
        'Min(float, float)': doubleMin,
        'Pow(float, float)': single(mathTable['Pow(double, double)']),
        'Sqrt(float)': single(Math.sqrt),
        'Sin(float)': single(Math.sin),
        'Cos(float)': single(Math.cos),
        'Tan(float)': single(Math.tan),
        'Atan2(float, float)': single(Math.atan2),
        'Exp(float)': single(Math.exp),
        'Log(float)': single(Math.log),
        'Floor(float)': Math.floor,
        'Ceiling(float)': Math.ceil,
        'Round(float)': roundEven,
        'Round(float, int)': function (value, digits) {
            if (!(digits >= 0 && digits <= 6))
                throw CS.argRange('digits', 'Rounding digits must be between 0 and 6, inclusive.');
            return Math.fround(roundTo(value, digits, 0));
        },
        'Truncate(float)': Math.trunc,
        'Sign(float)': signOf
    };

    // --- Convert

    var RANGES = { int: [-2147483648, 2147483647, 'an Int32'], short: [-32768, 32767, 'an Int16'], byte: [0, 255, 'an unsigned byte'],
                   sbyte: [-128, 127, 'a signed byte'], uint: [0, 4294967295, 'a UInt32'], ushort: [0, 65535, 'a UInt16'],
                   char: [0, 65535, 'a character'] };
    var KIND_OF = { int: 'i32', short: 'i16', byte: 'u8', sbyte: 'i8', uint: 'u32', ushort: 'u16', long: 'i64', ulong: 'u64' };

    function overflow(name) {
        return fail('System.OverflowException', 'Value was either too large or too small for ' + name + '.');
    }

    // A double to an integer type: rounded half to even, checked.
    function doubleTo(target, value) {
        var rounded = roundEven(value);
        if (target === 'long' || target === 'ulong') {
            if (!(rounded >= (target === 'long' ? -9223372036854775808 : 0) && rounded < (target === 'long' ? 9223372036854775808 : 18446744073709551616)))
                throw overflow(target === 'long' ? 'an Int64' : 'a UInt64');
            return target === 'long' ? i64.fromFloat(rounded) : u64.fromFloat(rounded);
        }
        var range = RANGES[target];
        if (!(rounded >= range[0] && rounded <= range[1]))
            throw overflow(range[2]);
        return rounded + 0;
    }

    function integerTo(target, value, signedSource) {
        var number = typeof value === 'number' ? value : (signedSource ? T.i64ToBig(value, true) : T.i64ToBig(value, false));
        if (target === 'long' || target === 'ulong') {
            var bigValue = typeof number === 'number' ? big.fromFloat(number) : number;
            var low = target === 'long' ? big.neg(big.pow(2, 63)) : 0;
            var high = target === 'long' ? big.sub(big.pow(2, 63), 1) : big.sub(big.pow(2, 64), 1);
            if (big.cmp(bigValue, low) < 0 || big.cmp(bigValue, high) > 0)
                throw overflow(target === 'long' ? 'an Int64' : 'a UInt64');
            return T.bigToI64(bigValue, target === 'long');
        }
        var range = RANGES[target];
        var asNumber = typeof number === 'number' ? number : big.toFloat(number);
        if (!(asNumber >= range[0] && asNumber <= range[1]))
            throw overflow(range[2]);
        return asNumber;
    }

    function decimalTo(target, value) {
        var rounded = CS.decimalRound(value, 0, 0);
        return integerTo(target, T.bigToI64 !== undefined && (target === 'long' || target === 'ulong') ? decimal.truncate(rounded) : big.toFloat(decimal.truncate(rounded)), true);
    }

    function stringTo(target, text) {
        if (text === null || text === undefined)
            return target === 'long' || target === 'ulong' ? 0 : 0;
        return CS.parseInteger(text, 7, KIND_OF[target]);
    }

    // Convert.ToInt32(object) and others: IConvertible values by their type.
    function objectTo(target, value) {
        if (value === null || value === undefined)
            return target === 'double' || target === 'float' ? 0 : (target === 'decimal' ? decimal.ZERO : (target === 'bool' ? false : 0));
        var type = rt().typeOf(value);
        var raw = unboxed(value);
        var name = type.$kind === 'enum' ? 'System.Int32' : type.$name;
        var source;
        switch (name) {
        case 'System.String':
            source = 'string';
            break;
        case 'System.Boolean':
            source = 'bool';
            break;
        case 'System.Char':
            source = 'char';
            break;
        case 'System.Double':
        case 'System.Single':
            source = 'double';
            break;
        case 'System.Decimal':
            source = 'decimal';
            break;
        case 'System.Int64':
            source = 'long';
            break;
        case 'System.UInt64':
            source = 'ulong';
            break;
        case 'System.Int32':
        case 'System.Int16':
        case 'System.SByte':
        case 'System.Byte':
        case 'System.UInt16':
        case 'System.UInt32':
            source = 'int';
            break;
        default:
            throw fail('System.InvalidCastException', "Unable to cast object of type '" + rt().typeName(type) + "' to type 'System.IConvertible'.");
        }
        return convertValue(source, target, raw);
    }

    function convertValue(source, target, value) {
        if (target === 'double' || target === 'float') {
            var number;
            switch (source) {
            case 'string':
                return CS.parseFloating(value, 167 | 64, target === 'float');
            case 'bool':
                return value ? 1 : 0;
            case 'char':
                throw fail('System.InvalidCastException', "Invalid cast from 'Char' to '" + (target === 'float' ? 'Single' : 'Double') + "'.");
            case 'decimal':
                number = decimal.toNumber(value);
                break;
            case 'long':
                number = i64.toFloat(value);
                break;
            case 'ulong':
                number = u64.toFloat(value);
                break;
            default:
                number = value;
            }
            return target === 'float' ? Math.fround(number) : number;
        }
        if (target === 'decimal') {
            switch (source) {
            case 'string':
                return CS.parseDecimal(value, 111);
            case 'bool':
                return value ? decimal.ONE : decimal.ZERO;
            case 'char':
                throw fail('System.InvalidCastException', "Invalid cast from 'Char' to 'Decimal'.");
            case 'double':
                return rt().dec.fromDouble(value);
            case 'decimal':
                return value;
            case 'ulong':
                return decimal.fromUnsigned(value);
            default:
                return decimal.fromInteger(value);
            }
        }
        if (target === 'bool') {
            switch (source) {
            case 'string':
                return natives['System.Boolean']['Parse(string)'](value);
            case 'bool':
                return value;
            case 'char':
                throw fail('System.InvalidCastException', "Invalid cast from 'Char' to 'Boolean'.");
            case 'decimal':
                return !decimal.isZero(value);
            case 'long':
            case 'ulong':
                return !i64.eq(value, 0);
            default:
                return value !== 0;
            }
        }
        if (target === 'char') {
            switch (source) {
            case 'string':
                return natives['System.Char']['Parse(string)'](value);
            case 'bool':
            case 'double':
            case 'decimal':
                throw fail('System.InvalidCastException', "Invalid cast from '" + { bool: 'Boolean', double: 'Double', decimal: 'Decimal' }[source] + "' to 'Char'.");
            case 'char':
                return value;
            default:
                return integerTo('char', value, source !== 'ulong');
            }
        }
        if (target === 'string')
            return rt().objectString(value);
        switch (source) {
        case 'string':
            return stringTo(target, value);
        case 'bool':
            return value ? 1 : 0;
        case 'char':
            return integerTo(target, value, true);
        case 'double':
            return doubleTo(target, value);
        case 'decimal':
            return decimalTo(target, value);
        case 'ulong':
            return integerTo(target, value, false);
        default:
            return integerTo(target, value, true);
        }
    }

    // Convert.ToInt32(string, fromBase): the digits are the bits of the type.
    function parseBase(text, fromBase, target) {
        if (fromBase !== 2 && fromBase !== 8 && fromBase !== 10 && fromBase !== 16)
            throw CS.argError('Invalid Base.', 'fromBase');
        if (text === null || text === undefined)
            return 0;
        if (fromBase === 10) {
            var tenKind = { int: 'i32', long: 'i64', short: 'i16', byte: 'u8', sbyte: 'i8', uint: 'u32', ulong: 'u64', ushort: 'u16' }[target];
            return CS.parseInteger(text, 7, tenKind);
        }
        var body = text;
        if (body.length === 0)
            throw fail('System.ArgumentOutOfRangeException', "Index was out of range. Must be non-negative and less than the size of the collection. (Parameter 'startIndex')");
        if (body.charAt(0) === '-')
            throw CS.argError('String cannot contain a minus sign if the base is not 10.');
        if (fromBase === 16 && /^0[xX]/.test(body))
            body = body.substring(2);
        var match = (fromBase === 16 ? /^[0-9A-Fa-f]+/ : (fromBase === 8 ? /^[0-7]+/ : /^[01]+/)).exec(body);
        if (match === null)
            throw fail('System.FormatException', 'Could not find any recognizable digits.');
        if (match[0].length !== body.length)
            throw fail('System.FormatException', 'Additional non-parsable characters are at the end of the string.');
        var value = big.parse(match[0], fromBase);
        var width = { int: 32, long: 64, short: 16, byte: 8, sbyte: 8, uint: 32, ulong: 64, ushort: 16 }[target];
        if (big.cmp(value, big.pow(2, width)) >= 0)
            throw overflow({ int: 'an Int32', long: 'an Int64', short: 'an Int16', byte: 'an unsigned byte', sbyte: 'a signed byte',
                             uint: 'a UInt32', ulong: 'a UInt64', ushort: 'a UInt16' }[target]);
        var signed = target === 'int' || target === 'long' || target === 'short' || target === 'sbyte';
        if (signed && big.cmp(value, big.pow(2, width - 1)) >= 0)
            value = big.sub(value, big.pow(2, width));
        return width === 64 ? T.bigToI64(value, signed) : big.toFloat(value);
    }

    function toBase(value, toBaseValue, width) {
        if (toBaseValue !== 2 && toBaseValue !== 8 && toBaseValue !== 10 && toBaseValue !== 16)
            throw CS.argError('Invalid Base.', 'toBase');
        if (toBaseValue === 10)
            return width === 64 ? i64.str(value) : String(value);
        if (width === 64)
            return u64.str(u64.fromSigned(value), toBaseValue);
        var unsigned = value < 0 ? value + Math.pow(2, width) : value;
        return unsigned.toString(toBaseValue);
    }

    var BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

    function toBase64(bytes) {
        if (bytes === null || bytes === undefined)
            throw CS.argNull('inArray');
        var out = '';
        for (var index = 0; index < bytes.length; index += 3) {
            var a = bytes[index], b = index + 1 < bytes.length ? bytes[index + 1] : 0, c = index + 2 < bytes.length ? bytes[index + 2] : 0;
            var triple = (a << 16) | (b << 8) | c;
            out += BASE64.charAt((triple >> 18) & 63) + BASE64.charAt((triple >> 12) & 63) +
                (index + 1 < bytes.length ? BASE64.charAt((triple >> 6) & 63) : '=') + (index + 2 < bytes.length ? BASE64.charAt(triple & 63) : '=');
        }
        return out;
    }

    function fromBase64(text) {
        if (text === null || text === undefined)
            throw CS.argNull('s');
        var clean = text.replace(/[\s]/g, '');
        if (clean.length % 4 !== 0 || /[^A-Za-z0-9+\/=]/.test(clean) || /=[^=]/.test(clean))
            throw fail('System.FormatException', 'The input is not a valid Base-64 string as it contains a non-base 64 character, more than two padding characters, or an illegal character among the padding characters.');
        var bytes = [];
        for (var index = 0; index < clean.length; index += 4) {
            var values = [];
            for (var position = 0; position < 4; ++position) {
                var ch = clean.charAt(index + position);
                values.push(ch === '=' ? -1 : BASE64.indexOf(ch));
            }
            var triple = (values[0] << 18) | (values[1] << 12) | ((values[2] < 0 ? 0 : values[2]) << 6) | (values[3] < 0 ? 0 : values[3]);
            bytes.push((triple >> 16) & 255);
            if (values[2] >= 0)
                bytes.push((triple >> 8) & 255);
            if (values[3] >= 0)
                bytes.push(triple & 255);
        }
        return rt().arrayOf(rt().type('System.Byte'), bytes);
    }

    var convertTable = natives['System.Convert'] = {
        'ToInt32(string, int)': function (text, fromBase) { return parseBase(text, fromBase, 'int'); },
        'ToInt64(string, int)': function (text, fromBase) { return parseBase(text, fromBase, 'long'); },
        'ToByte(string, int)': function (text, fromBase) { return parseBase(text, fromBase, 'byte'); },
        'ToInt32(string, IFormatProvider)': function (text) { return stringTo('int', text); },
        'ToDouble(string, IFormatProvider)': function (text) { return text === null ? 0 : CS.parseFloating(text, 167 | 64, false); },
        'ToDecimal(string, IFormatProvider)': function (text) { return text === null ? decimal.ZERO : CS.parseDecimal(text, 111); },
        'ToString(int, int)': function (value, base) { return toBase(value, base, 32); },
        'ToString(long, int)': function (value, base) { return toBase(value, base, 64); },
        'ToString(short, int)': function (value, base) { return toBase(value, base, 16); },
        'ToString(byte, int)': function (value, base) { return toBase(value, base, 8); },
        'ToString(double, IFormatProvider)': function (value) { return CS.formatDouble(value, false); },
        'ToBase64String(byte[])': toBase64,
        'FromBase64String(string)': fromBase64,
        'ToHexString(byte[])': function (bytes) {
            if (bytes === null || bytes === undefined)
                throw CS.argNull('inArray');
            var out = '';
            for (var index = 0; index < bytes.length; ++index)
                out += (bytes[index] < 16 ? '0' : '') + bytes[index].toString(16).toUpperCase();
            return out;
        },
        'FromHexString(string)': function (text) {
            if (text === null || text === undefined)
                throw CS.argNull('s');
            if (text.length % 2 !== 0 || /[^0-9A-Fa-f]/.test(text))
                throw fail('System.FormatException', text.length % 2 !== 0
                    ? 'The input is not a valid hex string as its length is not a multiple of 2.'
                    : 'The input is not a valid hex string as it contains a non-hex character.');
            var bytes = [];
            for (var index = 0; index < text.length; index += 2)
                bytes.push(parseInt(text.substr(index, 2), 16));
            return rt().arrayOf(rt().type('System.Byte'), bytes);
        },
        'ChangeType(object, Type)': function (value, typeObject) {
            if (typeObject === null || typeObject === undefined)
                throw CS.argNull('conversionType');
            var type = typeObject.$type;
            var target = { 'System.Int32': 'int', 'System.Int64': 'long', 'System.Int16': 'short', 'System.Byte': 'byte',
                           'System.SByte': 'sbyte', 'System.UInt32': 'uint', 'System.UInt64': 'ulong', 'System.UInt16': 'ushort',
                           'System.Double': 'double', 'System.Single': 'float', 'System.Decimal': 'decimal', 'System.Boolean': 'bool',
                           'System.Char': 'char', 'System.String': 'string' }[type.$name];
            if (target === undefined) {
                if (value === null || value === undefined || rt().is(value, type))
                    return value;
                throw fail('System.InvalidCastException', "Object must implement IConvertible.");
            }
            if (value === null || value === undefined) {
                if (type.$struct)
                    throw fail('System.InvalidCastException', "Null object cannot be converted to a value type.");
                return null;
            }
            return rt().box(type, objectTo(target, value));
        }
    };

    // The overloads of the conversions by the parameter type.
    var SOURCES = { string: 'string', double: 'double', float: 'double', decimal: 'decimal', long: 'long', ulong: 'ulong',
                    uint: 'int', int: 'int', short: 'int', byte: 'int', sbyte: 'int', ushort: 'int', char: 'char', bool: 'bool' };
    var TARGETS = { ToInt32: 'int', ToInt64: 'long', ToInt16: 'short', ToByte: 'byte', ToSByte: 'sbyte', ToUInt32: 'uint',
                    ToUInt64: 'ulong', ToUInt16: 'ushort', ToDouble: 'double', ToSingle: 'float', ToDecimal: 'decimal',
                    ToBoolean: 'bool', ToChar: 'char', ToString: 'string' };
    Object.keys(TARGETS).forEach(function (method) {
        var target = TARGETS[method];
        Object.keys(SOURCES).forEach(function (parameter) {
            var source = SOURCES[parameter];
            var key = method + '(' + parameter + ')';
            if (convertTable[key] !== undefined)
                return;
            if (target === 'string') {
                convertTable[key] = function (value) {
                    switch (parameter) {
                    case 'string':
                        return value;
                    case 'bool':
                        return value ? 'True' : 'False';
                    case 'char':
                        return String.fromCharCode(value);
                    case 'double':
                        return CS.formatDouble(value, false);
                    case 'float':
                        return CS.formatDouble(value, true);
                    case 'decimal':
                        return decimal.str(value);
                    case 'long':
                        return i64.str(value);
                    case 'ulong':
                        return u64.str(value);
                    }
                    return String(value);
                };
                return;
            }
            convertTable[key] = function (value) {
                if (source === 'string' && (value === null || value === undefined))
                    return target === 'decimal' ? decimal.ZERO : (target === 'bool' ? false : 0);
                if (target === 'char' && source === 'string' && (value === null || value === undefined))
                    throw CS.argNull('value');
                return convertValue(source, target, value);
            };
        });
        convertTable[method + '(object)'] = function (value) { return target === 'string' ? (value === null || value === undefined ? '' : rt().objectString(value)) : objectTo(target, value); };
    });
    convertTable['ToChar(string)'] = function (text) {
        if (text === null || text === undefined)
            throw CS.argNull('value');
        return natives['System.Char']['Parse(string)'](text);
    };

    // --- BitConverter (little endian)

    function bytesOf(size, write) {
        var view = new DataView(new ArrayBuffer(size));
        write(view);
        var bytes = [];
        for (var index = 0; index < size; ++index)
            bytes.push(view.getUint8(index));
        return rt().arrayOf(rt().type('System.Byte'), bytes);
    }

    function viewOf(bytes, start, size) {
        if (bytes === null || bytes === undefined)
            throw CS.argNull('value');
        if (start < 0 || start >= bytes.length)
            throw CS.argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
        if (start > bytes.length - size)
            throw CS.argError('Destination array is not long enough to copy all the items in the collection. Check array index and length.', 'value');
        var view = new DataView(new ArrayBuffer(size));
        for (var index = 0; index < size; ++index)
            view.setUint8(index, bytes[start + index]);
        return view;
    }

    function longFromView(view) {
        return i64.fromUnsigned(u64.or(u64.shl(view.getUint32(4, true), 32), view.getUint32(0, true)));
    }

    natives['System.BitConverter'] = {
        'GetBytes(int)': function (value) { return bytesOf(4, function (view) { view.setInt32(0, value, true); }); },
        'GetBytes(long)': function (value) {
            return bytesOf(8, function (view) {
                view.setInt32(0, typeof value === 'number' ? value | 0 : value.lo, true);
                view.setInt32(4, typeof value === 'number' ? Math.floor(value / 4294967296) | 0 : value.hi, true);
            });
        },
        'GetBytes(short)': function (value) { return bytesOf(2, function (view) { view.setInt16(0, value, true); }); },
        'GetBytes(double)': function (value) { return bytesOf(8, function (view) { view.setFloat64(0, value, true); }); },
        'GetBytes(float)': function (value) { return bytesOf(4, function (view) { view.setFloat32(0, value, true); }); },
        'GetBytes(bool)': function (value) { return bytesOf(1, function (view) { view.setUint8(0, value ? 1 : 0); }); },
        'GetBytes(char)': function (value) { return bytesOf(2, function (view) { view.setUint16(0, value, true); }); },
        'ToInt32(byte[], int)': function (bytes, start) { return viewOf(bytes, start, 4).getInt32(0, true); },
        'ToInt64(byte[], int)': function (bytes, start) { return longFromView(viewOf(bytes, start, 8)); },
        'ToInt16(byte[], int)': function (bytes, start) { return viewOf(bytes, start, 2).getInt16(0, true); },
        'ToDouble(byte[], int)': function (bytes, start) { return viewOf(bytes, start, 8).getFloat64(0, true); },
        'ToString(byte[])': function (bytes) {
            if (bytes === null || bytes === undefined)
                throw CS.argNull('value');
            return Array.prototype.map.call(bytes, function (value) { return (value < 16 ? '0' : '') + value.toString(16).toUpperCase(); }).join('-');
        },
        'DoubleToInt64Bits(double)': function (value) {
            var view = new DataView(new ArrayBuffer(8));
            view.setFloat64(0, value, true);
            return longFromView(view);
        },
        'Int64BitsToDouble(long)': function (value) {
            var view = new DataView(new ArrayBuffer(8));
            view.setInt32(0, typeof value === 'number' ? value | 0 : value.lo, true);
            view.setInt32(4, typeof value === 'number' ? Math.floor(value / 4294967296) | 0 : value.hi, true);
            return view.getFloat64(0, true);
        },
        'SingleToInt32Bits(float)': function (value) {
            var view = new DataView(new ArrayBuffer(4));
            view.setFloat32(0, value, true);
            return view.getInt32(0, true);
        },
        'Int32BitsToSingle(int)': function (value) {
            var view = new DataView(new ArrayBuffer(4));
            view.setInt32(0, value, true);
            return view.getFloat32(0, true);
        }
    };

    // --- Environment

    var started = Date.now();

    natives['System.Environment'] = {
        'Exit(int)': function (code) {
            env().out.flush();
            throw new CS.ProgramExit(code);
        },
        'FailFast(string)': function (message) {
            throw new CS.FatalError('Process terminated. ' + (message === null || message === undefined ? '' : message));
        },
        'get_TickCount()': function () { return (Date.now() - started + 1000000) | 0; },
        'get_TickCount64()': function () { return Date.now() - started + 1000000; },
        'GetEnvironmentVariable(string)': function (name) {
            if (name === null || name === undefined)
                throw CS.argNull('variable');
            return null;
        },
        'GetCommandLineArgs()': function () { return CS.stringArray(['main']); },
        'get_HasShutdownStarted()': function () { return false; }
    };

    natives['System.Random'] = {
        'GenerateSeed()': function () { return Math.floor(Math.random() * 2147483647); }
    };

    // --- Type

    function typeOfObject(object) {
        return object.$type;
    }

    function simpleName(type) {
        if (type.$kind === 'array')
            return simpleName(type.$elem) + '[' + new Array(type.$rank).join(',') + ']';
        var full = type.$name;
        return full.substring(Math.max(full.lastIndexOf('+'), full.lastIndexOf('.')) + 1);
    }

    var CORE_ASSEMBLY = 'System.Private.CoreLib, Version=8.0.0.0, Culture=neutral, PublicKeyToken=7cec85d7bea7798e';
    var USER_ASSEMBLY = 'main, Version=0.0.0.0, Culture=neutral, PublicKeyToken=null';

    function assemblyOf(type) {
        while (type.$kind === 'array')
            type = type.$elem;
        var namespace = type.$meta !== undefined ? type.$meta.namespace : null;
        return namespace !== null && namespace !== undefined && (namespace === 'System' || namespace.indexOf('System.') === 0)
            ? CORE_ASSEMBLY : USER_ASSEMBLY;
    }

    function fullName(type) {
        if (type.$kind === 'array')
            return fullName(type.$elem) + '[' + new Array(type.$rank).join(',') + ']';
        if (type.$args !== null && type.$args !== undefined && type.$def !== null)
            return type.$name + '[' + type.$args.map(function (arg) { return '[' + fullName(arg) + ', ' + assemblyOf(arg) + ']'; }).join(',') + ']';
        return type.$name;
    }

    function interfacesOf(type) {
        var list = [];
        (function add(current) {
            if (current === null || current === undefined)
                return;
            (current.$ifaces || []).forEach(function (iface) {
                if (list.indexOf(iface) < 0) {
                    list.push(iface);
                    add(iface);
                }
            });
            add(current.$base);
        })(type);
        return list;
    }

    function baseOf(type) {
        if (type.$kind === 'interface')
            return null;
        if (type.$kind === 'array')
            return rt().type('System.Array');
        var base = type.$base;
        return base === null || base === undefined ? null : base;
    }

    var PRIMITIVES = ['System.Boolean', 'System.Byte', 'System.SByte', 'System.Int16', 'System.UInt16', 'System.Int32', 'System.UInt32',
                      'System.Int64', 'System.UInt64', 'System.Char', 'System.Double', 'System.Single', 'System.IntPtr', 'System.UIntPtr'];
    var TYPE_CODES = { 'System.Boolean': 3, 'System.Char': 4, 'System.SByte': 5, 'System.Byte': 6, 'System.Int16': 7, 'System.UInt16': 8,
                       'System.Int32': 9, 'System.UInt32': 10, 'System.Int64': 11, 'System.UInt64': 12, 'System.Single': 13,
                       'System.Double': 14, 'System.Decimal': 15, 'System.DateTime': 16, 'System.String': 18 };

    function typeArray(list) {
        return rt().arrayOf(rt().type('System.Type'), list.map(function (type) { return rt().typeObject(type); }));
    }

    natives['System.RuntimeType'] = {
        'get_Name()': function () { return simpleName(typeOfObject(this)); },
        'get_FullName()': function () { return fullName(typeOfObject(this)); },
        'get_Namespace()': function () {
            var type = typeOfObject(this);
            while (type.$kind === 'array')
                type = type.$elem;
            return type.$meta !== undefined && type.$meta.namespace !== undefined ? type.$meta.namespace : null;
        },
        'get_IsValueType()': function () { return !!typeOfObject(this).$struct; },
        'get_IsClass()': function () {
            var kind = typeOfObject(this).$kind;
            return kind === 'class' || kind === 'delegate' || kind === 'array';
        },
        'get_IsInterface()': function () { return typeOfObject(this).$kind === 'interface'; },
        'get_IsEnum()': function () { return typeOfObject(this).$kind === 'enum'; },
        'get_IsArray()': function () { return typeOfObject(this).$kind === 'array'; },
        'get_IsPrimitive()': function () { return PRIMITIVES.indexOf(typeOfObject(this).$name) >= 0; },
        'get_IsAbstract()': function () {
            var type = typeOfObject(this);
            return type.$kind === 'interface' || (type.$meta !== undefined && !!type.$meta.abstract);
        },
        'get_IsSealed()': function () {
            var type = typeOfObject(this);
            return type.$struct || type.$kind === 'delegate' || type.$kind === 'array' || (type.$meta !== undefined && !!type.$meta.sealed);
        },
        'get_IsGenericType()': function () {
            var type = typeOfObject(this);
            return (type.$args !== null && type.$args !== undefined) || (type.$meta !== undefined && type.$meta.generic > 0);
        },
        'get_IsGenericTypeDefinition()': function () {
            var type = typeOfObject(this);
            return type.$meta !== undefined && type.$meta.generic > 0 && (type.$args === null || type.$args === undefined);
        },
        'get_ContainsGenericParameters()': function () {
            var type = typeOfObject(this);
            return type.$meta !== undefined && type.$meta.generic > 0 && (type.$args === null || type.$args === undefined);
        },
        'get_BaseType()': function () {
            var base = baseOf(typeOfObject(this));
            return base === null ? null : rt().typeObject(base);
        },
        'GetGenericArguments()': function () {
            var type = typeOfObject(this);
            return typeArray(type.$args || []);
        },
        'GetGenericTypeDefinition()': function () {
            var type = typeOfObject(this);
            if (type.$def !== null && type.$def !== undefined)
                return rt().typeObject(type.$def);
            if (type.$meta !== undefined && type.$meta.generic > 0)
                return this;
            throw fail('System.InvalidOperationException', 'This operation is only valid on generic types.');
        },
        'GetElementType()': function () {
            var type = typeOfObject(this);
            return type.$kind === 'array' ? rt().typeObject(type.$elem) : null;
        },
        'GetInterfaces()': function () { return typeArray(interfacesOf(typeOfObject(this))); },
        'GetArrayRank()': function () {
            var type = typeOfObject(this);
            if (type.$kind !== 'array')
                throw CS.argError('Must be an array type.');
            return type.$rank;
        },
        'IsAssignableFrom(Type)': function (other) {
            if (other === null || other === undefined)
                return false;
            return rt().isAssignable(typeOfObject(other), typeOfObject(this));
        },
        'IsInstanceOfType(object)': function (value) { return rt().is(value, typeOfObject(this)); },
        'IsSubclassOf(Type)': function (other) {
            if (other === null || other === undefined)
                throw CS.argNull('c');
            var target = typeOfObject(other);
            for (var current = baseOf(typeOfObject(this)); current !== null && current !== undefined; current = baseOf(current)) {
                if (current === target)
                    return true;
            }
            return false;
        },
        'MakeGenericType(Type[])': function (args) {
            var type = typeOfObject(this);
            if (type.$meta === undefined || !(type.$meta.generic > 0) || (type.$args !== null && type.$args !== undefined))
                throw fail('System.InvalidOperationException', rt().typeName(type) + ' is not a GenericTypeDefinition. MakeGenericType may only be called on a type for which Type.IsGenericTypeDefinition is true.');
            if (args === null || args === undefined)
                throw CS.argNull('typeArguments');
            if (args.length !== type.$meta.generic)
                throw CS.argError('The number of generic arguments provided doesn\'t equal the arity of the generic type definition.', 'instantiation');
            return rt().typeObject(rt().inst(type, Array.prototype.map.call(args, typeOfObject)));
        },
        'MakeArrayType()': function () { return rt().typeObject(rt().arrayType(typeOfObject(this), 1)); },
        'get_AssemblyQualifiedName()': function () {
            var type = typeOfObject(this);
            return fullName(type) + ', ' + assemblyOf(type);
        },
        'ToString()': function () { return rt().typeName(typeOfObject(this)); }
    };

    natives['System.Type'] = {
        'GetType(string)': function (name) {
            if (name === null || name === undefined)
                throw CS.argNull('typeName');
            var found = rt().byName[name];
            if (found === undefined) {
                rt().session.loadLibraryType(name);
                found = rt().byName[name];
            }
            if (found === undefined)
                found = rt().userTypeNamed(name);
            return found === undefined || found === null ? null : rt().typeObject(found);
        },
        'GetTypeCode(Type)': function (typeObject) {
            if (typeObject === null || typeObject === undefined)
                return 0;
            var type = typeOfObject(typeObject);
            if (type.$kind === 'enum')
                type = rt().type({ i8: 'System.SByte', u8: 'System.Byte', i16: 'System.Int16', u16: 'System.UInt16', i32: 'System.Int32',
                                   u32: 'System.UInt32', i64: 'System.Int64', u64: 'System.UInt64' }[CS.NUMERIC[type.$meta.underlying || 'int']] ||
                                 'System.Int32');
            return TYPE_CODES[type.$name] || 1;
        }
    };

    function createInstance(type, args) {
        if (type.$struct && args.length === 0)
            return rt().box(type, rt().defaultOf(type));
        if (type.$meta !== undefined && (type.$meta.abstract || type.$kind === 'interface'))
            throw fail('System.MissingMethodException', "Cannot dynamically create an instance of type '" + rt().typeName(type) +
                       "'. Reason: Cannot create an abstract class.");
        var object = new type();
        var prefix = '$ctor$' + args.length;
        var names = [];
        for (var proto = Object.getPrototypeOf(object); proto !== null && proto !== Object.prototype; proto = Object.getPrototypeOf(proto)) {
            if (proto.constructor !== type && proto.constructor !== type.$def)
                break;
            Object.getOwnPropertyNames(proto).forEach(function (name) {
                if ((name === prefix || name.indexOf(prefix + '$') === 0) && names.indexOf(name) < 0)
                    names.push(name);
            });
        }
        if (names.length === 0)
            throw fail('System.MissingMethodException', args.length === 0
                ? "Cannot dynamically create an instance of type '" + rt().typeName(type) + "'. Reason: No parameterless constructor defined."
                : "Constructor on type '" + rt().typeName(type) + "' not found.");
        return object[names[0]].apply(object, args.map(unboxed));
    }

    natives['System.Activator'] = {
        'CreateInstance<T>()': function (type) {
            if (type.$struct)
                return rt().defaultOf(type);
            return createInstance(type, []);
        },
        'CreateInstance(Type)': function (typeObject) {
            if (typeObject === null || typeObject === undefined)
                throw CS.argNull('type');
            return createInstance(typeOfObject(typeObject), []);
        },
        'CreateInstance(Type, object[])': function (typeObject, args) {
            if (typeObject === null || typeObject === undefined)
                throw CS.argNull('type');
            return createInstance(typeOfObject(typeObject), args === null || args === undefined ? [] : Array.prototype.slice.call(args));
        }
    };

    // TextInfo.ToTitleCase: the first letter of a word up, the rest down;
    // words in capitals stay.
    natives['System.Globalization.TextInfo'] = {
        'ToTitleCase(string)': function (text) {
            if (text === null || text === undefined)
                throw CS.argNull('str');
            return text.replace(/[A-Za-zÀ-ɏͰ-ӿ']+/g, function (word) {
                if (word === word.toUpperCase() && word.length > 1 && /[A-ZÀ-Þ]/.test(word))
                    return word;
                return word.charAt(0).toUpperCase() + word.substring(1).toLowerCase();
            });
        }
    };
})(globalThis);
