// Scheme: ports and input and output. Output goes to the host
// (current-output-port) or to a string; input comes from a string, bytes, a
// file of the host or standard input of the host (current-input-port).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.Port)
        return;

    var NIL = S.NIL, UNSPEC = S.UNSPEC, SString = S.SString, Char = S.Char;
    var def = S.def, defCps = S.defCps;
    var check = S.check;

    // kind: console, string, bytes; text - a string (input), parts - chunks
    // (output), bytes - a Uint8Array (input) or an array (output).
    function Port(options) {
        this.input = !!options.input;
        this.output = !!options.output;
        this.binary = !!options.binary;
        this.kind = options.kind;
        this.open = true;
        this.text = options.text || '';
        this.pos = 0;
        this.parts = [];
        this.bytes = options.bytes || null;
        this.sink = options.sink || null;
        this.name = options.name || '';
        this.line = 1;
        // Standard input: takes the next line of the host; false at the end.
        this.refill = options.refill || null;
        this.$scheme = true;
    }

    // True if the port has text at its position.
    function more(port) {
        if (port.pos < port.text.length)
            return true;
        return port.refill !== null && port.refill();
    }
    Port.prototype.describe = function () {
        return '#<' + (this.binary ? 'binary-' : '') + (this.input ? 'input' : 'output') + '-port' +
            (this.name ? ' ' + this.name : '') + '>';
    };
    Port.prototype.write = function (text) {
        if (this.sink !== null)
            this.sink(text);
        else
            this.parts.push(text);
    };

    // --- Current ports: parameters (parameterize changes them)

    function makePortParameter(port) {
        var param = function ($k, value) {
            if (value !== undefined) {
                param.$param.value = value;
                return $k(UNSPEC);
            }
            return $k(currentValue(param));
        };
        param.$param = { value: port, converter: null };
        return param;
    }
    function currentValue(param) {
        for (var node = S.machine.params; node !== null; node = node.next) {
            if (node.param === param)
                return node.value;
        }
        return param.$param.value;
    }

    // The console ports of a session: created when the session starts (S.setupPorts).
    S.setupPorts = function (session) {
        var stdout = new Port({ output: true, kind: 'console', name: 'stdout',
                                sink: function (text) { session.writeOut(text); } });
        var stderr = new Port({ output: true, kind: 'console', name: 'stderr',
                                sink: function (text) { session.writeErr(text); } });
        var stdin = new Port({
            input: true, kind: 'string', name: 'stdin', text: '',
            refill: function () {
                session.flushConsole();
                var line = session.env.input.readLine();
                if (line === null)
                    return false;
                stdin.text = stdin.text.substring(stdin.pos) + line + '\n';
                stdin.pos = 0;
                return true;
            }
        });
        S.currentOutput = makePortParameter(stdout);
        S.currentError = makePortParameter(stderr);
        S.currentInput = makePortParameter(stdin);
        S.currentOutput.$name = 'current-output-port';
        S.currentError.$name = 'current-error-port';
        S.currentInput.$name = 'current-input-port';
        S.prims['current-output-port'].proc = S.currentOutput;
        S.prims['current-error-port'].proc = S.currentError;
        S.prims['current-input-port'].proc = S.currentInput;
    };

    function outputPort(name, port, binary) {
        if (port === undefined)
            return currentValue(S.currentOutput);
        if (!(port instanceof Port) || !port.output)
            check.fail(name, 'an output port', port);
        if (!port.open)
            throw S.error(name + ': port is closed', [port]);
        if (binary !== undefined && port.binary !== binary)
            check.fail(name, binary ? 'a binary port' : 'a textual port', port);
        return port;
    }
    function inputPort(name, port, binary) {
        if (port === undefined)
            return currentValue(S.currentInput);
        if (!(port instanceof Port) || !port.input)
            check.fail(name, 'an input port', port);
        if (!port.open)
            throw S.error(name + ': port is closed', [port]);
        if (binary !== undefined && port.binary !== binary)
            check.fail(name, binary ? 'a binary port' : 'a textual port', port);
        return port;
    }
    S.outputPort = outputPort;

    // The current value of a port parameter for the built-in procedures.
    def('current-output-port', 0, 0, function () { return currentValue(S.currentOutput); });
    def('current-error-port', 0, 0, function () { return currentValue(S.currentError); });
    def('current-input-port', 0, 0, function () { return currentValue(S.currentInput); });

    // --- Output

    def('display', 1, 2, function (value, port) {
        var target = outputPort('display', port, false);
        target.write(value instanceof SString ? value.s : S.write(value, 'display'));
        return UNSPEC;
    });
    def('write', 1, 2, function (value, port) {
        outputPort('write', port, false).write(S.write(value, 'write'));
        return UNSPEC;
    });
    def('write-shared', 1, 2, function (value, port) {
        outputPort('write-shared', port, false).write(S.write(value, 'shared'));
        return UNSPEC;
    });
    def('write-simple', 1, 2, function (value, port) {
        outputPort('write-simple', port, false).write(S.write(value, 'simple'));
        return UNSPEC;
    });
    def('newline', 0, 1, function (port) {
        outputPort('newline', port, false).write('\n');
        return UNSPEC;
    });
    def('write-char', 1, 2, function (value, port) {
        check.character('write-char', value);
        outputPort('write-char', port, false).write(String.fromCodePoint(value.code));
        return UNSPEC;
    });
    def('write-string', 1, 4, function (text, port, start, end) {
        check.string('write-string', text);
        var target = outputPort('write-string', port, false);
        if (start === undefined)
            target.write(text.s);
        else
            target.write(S.substring('write-string', text, start, end).s);
        return UNSPEC;
    });
    def('write-u8', 1, 2, function (byte, port) {
        if (typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255)
            check.fail('write-u8', 'a byte', byte);
        outputPort('write-u8', port, true).bytes.push(byte);
        return UNSPEC;
    });
    def('write-bytevector', 1, 4, function (bytes, port, start, end) {
        check.bytevector('write-bytevector', bytes);
        var target = outputPort('write-bytevector', port, true);
        var bounds = check.range('write-bytevector', start, end, bytes.length, bytes);
        for (var index = bounds[0]; index < bounds[1]; ++index)
            target.bytes.push(bytes[index]);
        return UNSPEC;
    });
    def('flush-output-port', 0, 1, function (port) {
        var target = outputPort('flush-output-port', port);
        if (target.kind === 'console')
            S.session.flushConsole();
        return UNSPEC;
    });

    // --- String and byte ports

    def('open-input-string', 1, 1, function (text) {
        return new Port({ input: true, kind: 'string', text: check.string('open-input-string', text).s });
    });
    def('open-output-string', 0, 0, function () {
        return new Port({ output: true, kind: 'string' });
    });
    def('get-output-string', 1, 1, function (port) {
        if (!(port instanceof Port) || !port.output || port.binary || port.kind !== 'string')
            check.fail('get-output-string', 'a string output port', port);
        var text = port.parts.join('');
        port.parts = [text];
        return S.str(text);
    });
    def('open-input-bytevector', 1, 1, function (bytes) {
        return new Port({ input: true, binary: true, kind: 'bytes',
                          bytes: check.bytevector('open-input-bytevector', bytes) });
    });
    def('open-output-bytevector', 0, 0, function () {
        return new Port({ output: true, binary: true, kind: 'bytes', bytes: [] });
    });
    def('get-output-bytevector', 1, 1, function (port) {
        if (!(port instanceof Port) || !port.output || !port.binary)
            check.fail('get-output-bytevector', 'a bytevector output port', port);
        return new Uint8Array(port.bytes);
    });

    // --- Reading

    function readChar(name, port, peek) {
        var source = inputPort(name, port, false);
        if (!more(source))
            return S.EOF;
        var code = source.text.codePointAt(source.pos);
        if (!peek)
            source.pos += code > 0xFFFF ? 2 : 1;
        return S.char(code);
    }
    def('read-char', 0, 1, function (port) { return readChar('read-char', port, false); });
    def('peek-char', 0, 1, function (port) { return readChar('peek-char', port, true); });
    def('char-ready?', 0, 1, function (port) {
        var source = inputPort('char-ready?', port, false);
        return source.refill === null || source.pos < source.text.length || S.session.env.input.isReady();
    }, { bool: true });
    def('read-line', 0, 1, function (port) {
        var source = inputPort('read-line', port, false);
        if (!more(source))
            return S.EOF;
        var end = source.text.indexOf('\n', source.pos);
        var line;
        if (end < 0) {
            line = source.text.substring(source.pos);
            source.pos = source.text.length;
        } else {
            line = source.text.substring(source.pos, end);
            source.pos = end + 1;
        }
        if (line.charAt(line.length - 1) === '\r')
            line = line.substring(0, line.length - 1);
        return S.str(line);
    });
    def('read-string', 1, 2, function (requested, port) {
        // R7RS: (read-string k [port]); chibi also takes (read-string port k).
        if (requested instanceof Port) {
            var swap = requested;
            requested = port;
            port = swap;
        }
        check.natural('read-string', requested);
        var source = inputPort('read-string', port, false);
        if (!more(source))
            return S.EOF;
        var result = '';
        for (var count = 0; count < requested && more(source); ++count) {
            var code = source.text.codePointAt(source.pos);
            source.pos += code > 0xFFFF ? 2 : 1;
            result += String.fromCodePoint(code);
        }
        return S.str(result);
    });
    function readByte(name, port, peek) {
        var source = inputPort(name, port, true);
        if (source.pos >= source.bytes.length)
            return S.EOF;
        var value = source.bytes[source.pos];
        if (!peek)
            ++source.pos;
        return value;
    }
    def('read-u8', 0, 1, function (port) { return readByte('read-u8', port, false); });
    def('peek-u8', 0, 1, function (port) { return readByte('peek-u8', port, true); });
    def('u8-ready?', 0, 1, function (port) { inputPort('u8-ready?', port, true); return true; }, { bool: true });
    def('read-bytevector', 1, 2, function (count, port) {
        check.natural('read-bytevector', count);
        var source = inputPort('read-bytevector', port, true);
        if (source.pos >= source.bytes.length)
            return count === 0 ? new Uint8Array(0) : S.EOF;
        var end = Math.min(source.bytes.length, source.pos + count);
        var result = source.bytes.slice(source.pos, end);
        source.pos = end;
        return result;
    });
    def('read-bytevector!', 1, 4, function (bytes, port, start, end) {
        check.bytevector('read-bytevector!', bytes);
        var source = inputPort('read-bytevector!', port, true);
        var bounds = check.range('read-bytevector!', start, end, bytes.length, bytes);
        if (source.pos >= source.bytes.length)
            return bounds[1] === bounds[0] ? 0 : S.EOF;
        var count = Math.min(bounds[1] - bounds[0], source.bytes.length - source.pos);
        for (var index = 0; index < count; ++index)
            bytes[bounds[0] + index] = source.bytes[source.pos + index];
        source.pos += count;
        return count;
    });
    def('read', 0, 1, function (port) {
        var source = inputPort('read', port, false);
        // Standard input: a datum may need more lines.
        for (;;) {
            more(source);
            var reader = new S.Reader(source.text, source.name);
            reader.pos = source.pos;
            var value;
            try {
                value = reader.read();
            } catch (error) {
                if (!(error instanceof S.ReadError))
                    throw error;
                if (source.refill !== null && source.refill())
                    continue;
                source.pos = source.text.length;
                var condition = S.error('read: ' + error.message, []);
                condition.kind = 'read';
                throw condition;
            }
            if (value === S.EOF && source.refill !== null && source.refill())
                continue;
            source.pos = reader.pos;
            return value;
        }
    });
    def('eof-object', 0, 0, function () { return S.EOF; });
    def('eof-object?', 1, 1, function (value) { return value === S.EOF; }, { bool: true });

    // --- Ports: shared parts

    def('port?', 1, 1, function (value) { return value instanceof Port; }, { bool: true });
    def('input-port?', 1, 1, function (value) { return value instanceof Port && value.input; }, { bool: true });
    def('output-port?', 1, 1, function (value) { return value instanceof Port && value.output; }, { bool: true });
    def('textual-port?', 1, 1, function (value) { return value instanceof Port && !value.binary; }, { bool: true });
    def('binary-port?', 1, 1, function (value) { return value instanceof Port && value.binary; }, { bool: true });
    def('input-port-open?', 1, 1, function (value) {
        if (!(value instanceof Port) || !value.input)
            check.fail('input-port-open?', 'an input port', value);
        return value.open;
    }, { bool: true });
    def('output-port-open?', 1, 1, function (value) {
        if (!(value instanceof Port) || !value.output)
            check.fail('output-port-open?', 'an output port', value);
        return value.open;
    }, { bool: true });
    function close(name, test) {
        return function (port) {
            if (!(port instanceof Port) || !test(port))
                check.fail(name, 'a port', port);
            if (port.kind !== 'console')
                port.open = false;
            return UNSPEC;
        };
    }
    def('close-port', 1, 1, close('close-port', function () { return true; }));
    def('close-input-port', 1, 1, close('close-input-port', function (port) { return port.input; }));
    def('close-output-port', 1, 1, close('close-output-port', function (port) { return port.output; }));

    defCps('call-with-port', 2, 2, function ($k, port, proc) {
        if (!(port instanceof Port))
            check.fail('call-with-port', 'a port', port);
        check.procedure('call-with-port', proc);
        return proc(function (result) {
            if (port.kind !== 'console')
                port.open = false;
            return $k(result);
        }, port);
    });

    // The output of a thunk into a string: current-output-port is a string port meanwhile.
    function captureOutput($k, thunk, port, deliver) {
        var machine = S.machine;
        var saved = machine.params;
        machine.params = { param: S.currentOutput, value: port, next: saved };
        return thunk(function (result) {
            machine.params = saved;
            return deliver(result);
        });
    }
    defCps('with-output-to-string', 1, 1, function ($k, thunk) {
        check.procedure('with-output-to-string', thunk);
        var port = new Port({ output: true, kind: 'string' });
        return captureOutput($k, thunk, port, function () { return $k(S.str(port.parts.join(''))); });
    });
    defCps('call-with-output-string', 1, 1, function ($k, proc) {
        check.procedure('call-with-output-string', proc);
        var port = new Port({ output: true, kind: 'string' });
        return proc(function () { return $k(S.str(port.parts.join(''))); }, port);
    });

    // --- Files: read-only files of the host

    function fileError(message, name) {
        var condition = S.error(message, [name]);
        condition.kind = 'file';
        return condition;
    }
    function openAttachment(procName, name, binary) {
        check.string(procName, name);
        var text = S.session.attachmentText(name.s);
        if (text === null)
            throw fileError(procName + ': cannot open file (no such attachment)', name);
        if (!binary)
            return new Port({ input: true, kind: 'string', text: text, name: name.s });
        var bytes = T.utf8.encode(text);
        var array = new Uint8Array(bytes.length);
        for (var index = 0; index < bytes.length; ++index)
            array[index] = bytes.charCodeAt(index);
        return new Port({ input: true, binary: true, kind: 'bytes', bytes: array, name: name.s });
    }
    def('open-input-file', 1, 1, function (name) { return openAttachment('open-input-file', name, false); });
    def('open-binary-input-file', 1, 1, function (name) { return openAttachment('open-binary-input-file', name, true); });
    function noWrite(procName) {
        return function (name) {
            throw fileError(procName + ': files cannot be written (attachments are read-only)', name);
        };
    }
    def('open-output-file', 1, 1, noWrite('open-output-file'));
    def('open-binary-output-file', 1, 1, noWrite('open-binary-output-file'));
    def('delete-file', 1, 1, noWrite('delete-file'));
    def('file-exists?', 1, 1, function (name) {
        check.string('file-exists?', name);
        return S.session.attachmentText(name.s) !== null;
    }, { bool: true });
    defCps('call-with-input-file', 2, 2, function ($k, name, proc) {
        var port = openAttachment('call-with-input-file', name, false);
        check.procedure('call-with-input-file', proc);
        return proc(function (result) {
            port.open = false;
            return $k(result);
        }, port);
    });
    defCps('with-input-from-file', 2, 2, function ($k, name, thunk) {
        var port = openAttachment('with-input-from-file', name, false);
        check.procedure('with-input-from-file', thunk);
        var machine = S.machine;
        var saved = machine.params;
        machine.params = { param: S.currentInput, value: port, next: saved };
        return thunk(function (result) {
            machine.params = saved;
            port.open = false;
            return $k(result);
        });
    });
    defCps('call-with-output-file', 2, 2, function ($k, name) { return noWrite('call-with-output-file')(name); });
    defCps('with-output-to-file', 2, 2, function ($k, name) { return noWrite('with-output-to-file')(name); });

    S.Port = Port;
})(globalThis);
