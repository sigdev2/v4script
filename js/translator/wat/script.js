// WAT: the commands of a .wast script in a unit - module, register,
// invoke, get, assert_return, assert_trap, assert_exhaustion,
// assert_malformed, assert_invalid, assert_unlinkable,
// assert_uninstantiable. Module fields in a row without (module ...) are a
// module too.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.parseScript)
        return;

    var rt = W.rt;
    var i64 = T.i64;

    function fail(message, node, source) {
        throw W.error('malformed', message, node ? node.line : 0, node ? node.col : 0, source);
    }

    function stringOf(token, source) {
        if (token === undefined || token.t !== 'str')
            fail('expected a string' + (token ? ', found ' + (token.v || '(...)') : ''), token, source);
        var text = W.decodeUtf8(token.bytes);
        if (text === null)
            fail('malformed UTF-8 encoding', token, source);
        return text;
    }

    // (invoke $id? "name" const*) or (get $id? "name").
    function parseAction(form, source) {
        var head = W.headOf(form);
        if (head !== 'invoke' && head !== 'get')
            fail('expected (invoke ...) or (get ...)', form, source);
        var cursor = new W.Cursor(form.items, 1);
        var id = cursor.peek() !== undefined && cursor.peek().t === 'id' ? cursor.next().v : null;
        var name = stringOf(cursor.next(), source);
        var args = [];
        while (!cursor.atEnd()) {
            var arg = cursor.next();
            if (arg.t !== 'list')
                fail('unexpected token ' + arg.v, arg, source);
            args.push(arg);
        }
        if (head === 'get' && args.length > 0)
            fail('unexpected token', args[0], source);
        return { kind: head, id: id, name: name, args: args, line: form.line, col: form.col };
    }

    // The list of S-expressions of a unit -> commands.
    W.parseScript = function (forms, source) {
        var commands = [];
        var index = 0;
        while (index < forms.length) {
            var form = forms[index];
            if (form.t !== 'list')
                fail('unexpected token ' + form.v + ' (a module field or a command is expected)', form, source);
            var head = W.headOf(form);
            if (head !== null && W.FIELD_KINDS[head] === 1) {
                var fields = [];
                while (index < forms.length && forms[index].t === 'list' && W.FIELD_KINDS[W.headOf(forms[index])] === 1)
                    fields.push(forms[index++]);
                commands.push({ type: 'module', fields: fields, id: null, line: fields[0].line, implicit: true });
                continue;
            }
            ++index;
            commands.push(W.parseCommand(form, source));
        }
        return commands;
    };

    // (module $id? field*), (module $id? binary "..."*), (module $id? quote "..."*).
    function parseModuleCommand(form, source) {
        var cursor = new W.Cursor(form.items, 1);
        var id = cursor.peek() !== undefined && cursor.peek().t === 'id' ? cursor.next().v : null;
        var command = { type: 'module', id: id, line: form.line, col: form.col };
        if (cursor.isKw('binary') || cursor.isKw('quote')) {
            var kind = cursor.next().v;
            var bytes = [];
            while (!cursor.atEnd()) {
                var token = cursor.next();
                if (token.t !== 'str')
                    fail('unexpected token', token, source);
                for (var byteIndex = 0; byteIndex < token.bytes.length; ++byteIndex)
                    bytes.push(token.bytes[byteIndex]);
            }
            command[kind] = bytes;
            return command;
        }
        command.fields = form.items.slice(cursor.i);
        return command;
    }

    W.parseCommand = function (form, source) {
        var head = W.headOf(form);
        var cursor = new W.Cursor(form.items, 1);
        switch (head) {
        case 'module':
            return parseModuleCommand(form, source);
        case 'register': {
            var name = stringOf(cursor.next(), source);
            var id = cursor.peek() !== undefined && cursor.peek().t === 'id' ? cursor.next().v : null;
            return { type: 'register', name: name, id: id, line: form.line };
        }
        case 'invoke':
        case 'get':
            return { type: 'action', action: parseAction(form, source), line: form.line };
        case 'assert_return': {
            var action = parseAction(cursor.next(), source);
            return { type: 'assert_return', action: action, expected: form.items.slice(2), line: form.line };
        }
        case 'assert_trap':
        case 'assert_exhaustion': {
            var target = cursor.next();
            var message = stringOf(cursor.next(), source);
            var command = { type: head, message: message, line: form.line };
            if (W.headOf(target) === 'module')
                command.module = parseModuleCommand(target, source);
            else
                command.action = parseAction(target, source);
            return command;
        }
        case 'assert_malformed':
        case 'assert_invalid':
        case 'assert_unlinkable':
        case 'assert_uninstantiable': {
            var moduleForm = cursor.next();
            if (W.headOf(moduleForm) !== 'module')
                fail('expected (module ...)', moduleForm || form, source);
            return { type: head, module: parseModuleCommand(moduleForm, source), message: stringOf(cursor.next(), source),
                     line: form.line };
        }
        case 'script':
        case 'input':
        case 'output':
            fail('the command ' + head + ' is not supported', form, source);
            break;
        }
        if (head !== null && W.OPS[head] !== undefined)
            fail('instruction ' + head + ' outside a function: put it into (func ...)', form, source);
        fail('unknown command ' + (head || '(...)'), form, source);
    };

    // --- Execution

    // The references (ref.extern N) of a script are objects equal by their number.
    function hostRef(runner, number) {
        var refs = runner.hostRefs;
        if (refs[number] === undefined)
            refs[number] = { $hostRef: number, toString: function () { return 'ref.extern ' + number; } };
        return refs[number];
    }

    // An argument of invoke: (i32.const 1), (ref.null func), (ref.extern 1).
    function argument(runner, form, source) {
        var head = W.headOf(form);
        if (head === 'ref.extern') {
            var number = W.numbers.u32(form.items[1] ? form.items[1].v : '');
            if (number === null || number === undefined)
                fail('expected a number', form, source);
            return { value: hostRef(runner, number), type: 'externref' };
        }
        if (head === 'ref.host')
            return argument(runner, { t: 'list', items: [{ t: 'kw', v: 'ref.extern' }].concat(form.items.slice(1)) }, source);
        var node = W.parseConstant(form, source);
        switch (node.op) {
        case 'i32.const':
        case 'i64.const':
        case 'f32.const':
        case 'f64.const': {
            var kind = node.op.substring(0, 3);
            if (node.nan !== undefined) {
                var payload = node.nan === 'canonical' ? (kind === 'f32' ? 0x400000 : 0x8000000000000) : node.nan;
                return { value: kind === 'f32' ? rt.nanF32(payload, node.negative) : rt.nanF64(payload, node.negative), type: kind };
            }
            return { value: node.value, type: kind };
        }
        case 'ref.null':
            return { value: null, type: node.ref };
        }
        fail('expected a constant', form, source);
    }

    // A result pattern of assert_return -> a check of the value.
    function expectation(runner, form, source) {
        var head = W.headOf(form);
        if (head === 'ref.func' && form.items.length === 1)
            return { text: '(ref.func)', test: function (value) { return typeof value === 'function'; } };
        if (head === 'ref.extern' && form.items.length === 1)
            return { text: '(ref.extern)', test: function (value) { return value !== null; } };
        if (head === 'either') {
            var options = form.items.slice(1).map(function (item) { return expectation(runner, item, source); });
            return {
                text: '(either ...)',
                test: function (value, type) {
                    return options.some(function (option) { return option.test(value, type); });
                }
            };
        }
        if ((head === 'f32.const' || head === 'f64.const') && form.items[1] !== undefined &&
            (form.items[1].v === 'nan:canonical' || form.items[1].v === 'nan:arithmetic')) {
            return { text: '(' + head + ' ' + form.items[1].v + ')', test: function (value) { return value !== value; } };
        }
        var expected = argument(runner, form, source);
        var text = '(' + head + ' ' + (form.items[1] ? form.items[1].v : '') + ')';
        return {
            text: text,
            test: function (value, type) {
                if (type !== expected.type && !(W.isRef(type) && W.isRef(expected.type) && expected.value === null))
                    return false;
                switch (expected.type) {
                case 'i64':
                    return i64.eq(value, expected.value);
                case 'f32':
                case 'f64':
                    if (expected.value !== expected.value)
                        return value !== value;
                    return value === expected.value && (value !== 0 || 1 / value === 1 / expected.value);
                }
                return value === expected.value;
            }
        };
    }

    function Runner(session, options) {
        this.session = session;
        this.env = session.env;
        this.source = options.source || '';
        // The mode of the spec tests: modules are not visible to JavaScript and by name.
        this.harness = !!options.harness;
        this.onAssert = options.onAssert || null;
        this.hostRefs = session.hostRefs;
    }

    Runner.prototype.error = function (message, line) {
        return new T.CompileError(message, line || 0, 0, this.source);
    };

    // The module of a command: parsing, checking, translation (without running).
    Runner.prototype.prepare = function (command) {
        if (command.prepared !== undefined)
            return command.prepared;
        var fields;
        if (command.quote !== undefined) {
            var text = T.utf8.decode(T.utf8.fromBytes(command.quote));
            try {
                var forms = W.read(text, this.source);
                fields = forms.length === 1 && W.headOf(forms[0]) === 'module' ? forms[0].items.slice(1) : forms;
                if (forms.length === 1 && W.headOf(forms[0]) === 'module' && fields.length > 0 && fields[0].t === 'id') {
                    command.id = command.id || fields[0].v;
                    fields = fields.slice(1);
                }
                command.prepared = W.prepareModule(fields, { source: this.source, id: command.id, line: command.line });
            } catch (error) {
                // Error lines are inside the quote text: the place is the command.
                if (error instanceof T.CompileError)
                    error.line = command.line;
                throw error;
            }
            return command.prepared;
        }
        if (command.binary !== undefined) {
            var module = W.decodeBinary(command.binary, { source: this.source, line: command.line, id: command.id });
            W.validate(module, this.source);
            command.prepared = { module: module, compiled: W.compileModule(module, this.source) };
            return command.prepared;
        }
        command.prepared = W.prepareModule(command.fields, { source: this.source, id: command.id, line: command.line });
        return command.prepared;
    };

    Runner.prototype.instantiate = function (command) {
        var prepared = this.prepare(command);
        return W.instantiate(this.session, prepared.module, prepared.compiled, this.source);
    };

    Runner.prototype.moduleCommand = function (command) {
        var instance = this.instantiate(command);
        var session = this.session;
        session.current = instance;
        if (command.id !== null && command.id !== undefined) {
            session.instances[command.id] = instance;
            if (!this.harness)
                session.register(command.id.substring(1), instance, true);
        }
        return instance;
    };

    Runner.prototype.instanceFor = function (id, line) {
        var session = this.session;
        if (id !== null) {
            if (session.instances[id] === undefined)
                throw this.error('unknown module ' + id, line);
            return session.instances[id];
        }
        if (session.current === null)
            throw this.error('no module to invoke: define one with (module ...)', line);
        return session.current;
    };

    // invoke/get -> { values, types }.
    Runner.prototype.action = function (action) {
        var instance = this.instanceFor(action.id, action.line);
        var entry = instance.exports[action.name];
        if (entry === undefined)
            throw this.error('unknown export ' + JSON.stringify(action.name), action.line);
        if (action.kind === 'get') {
            if (entry.kind !== 'global')
                throw this.error('export ' + JSON.stringify(action.name) + ' is not a global', action.line);
            return { values: [entry.value.value], types: [entry.value.type] };
        }
        if (entry.kind !== 'func')
            throw this.error('export ' + JSON.stringify(action.name) + ' is not a function', action.line);
        var fn = entry.value;
        var type = fn.$type;
        var self = this;
        var args = action.args.map(function (form) {
            return argument(self, form, self.source);
        });
        if (args.length !== type.params.length)
            throw this.error('wrong number of arguments for ' + JSON.stringify(action.name) + ': ' + args.length + ', expected ' +
                             type.params.length, action.line);
        args.forEach(function (arg, index) {
            var expected = type.params[index];
            if (arg.type !== expected && !(arg.value === null && W.isRef(expected)))
                throw self.error('argument ' + (index + 1) + ' of ' + JSON.stringify(action.name) + ' must be ' + expected, action.line);
        });
        var result = fn.apply(null, args.map(function (arg) { return arg.value; }));
        var values = type.results.length === 0 ? [] : (type.results.length === 1 ? [result] : result);
        return { values: values, types: type.results };
    };

    Runner.prototype.check = function (ok, message, line) {
        if (this.onAssert !== null) {
            this.onAssert(ok, message, line);
            return;
        }
        if (!ok)
            throw this.error(message, line);
    };

    // The error an assert_* expects: kind - 'trap', 'exhaustion' or the
    // kind of a module error.
    function classify(session, error) {
        if (error instanceof T.CompileError && error.wasmKind !== undefined)
            return error.wasmKind;
        if (error instanceof rt.Trap)
            return 'trap';
        if (session.isStackOverflow(error))
            return 'exhaustion';
        return 'other';
    }

    function messageOf(session, error) {
        if (session.isStackOverflow(error))
            return 'call stack exhausted';
        return error && error.message !== undefined ? error.message : String(error);
    }

    Runner.prototype.expectFailure = function (command, run, kind) {
        var session = this.session;
        try {
            run();
        } catch (error) {
            var found = classify(session, error);
            if (found === 'other' && !(error instanceof T.LanguageError) && !(error instanceof T.CompileError) &&
                !(error instanceof TypeError))
                throw error;
            var message = messageOf(session, error);
            var matches = found === kind;
            this.check(matches, command.type + ': expected ' + kind + ' "' + command.message + '", got ' +
                       (found === 'other' ? 'error' : found) + ' "' + message + '"', command.line);
            if (matches && this.onMessage)
                this.onMessage(command, message);
            return;
        }
        this.check(false, command.type + ': expected ' + kind + ' "' + command.message + '", but it succeeded', command.line);
    };

    Runner.prototype.formatValues = function (result) {
        return result.values.map(function (value, index) {
            return rt.format(value, result.types[index]);
        }).join(' ');
    };

    // A command; the result is { values, types } for invoke/get, otherwise null.
    Runner.prototype.execute = function (command) {
        var self = this;
        switch (command.type) {
        case 'module':
            this.moduleCommand(command);
            return null;
        case 'register': {
            var instance = this.instanceFor(command.id, command.line);
            this.session.register(command.name, instance, false);
            return null;
        }
        case 'action':
            return this.action(command.action);
        case 'assert_return': {
            var result = this.action(command.action);
            var expected = command.expected.map(function (form) { return expectation(self, form, self.source); });
            var ok = expected.length === result.values.length;
            for (var index = 0; ok && index < expected.length; ++index)
                ok = expected[index].test(result.values[index], result.types[index]);
            this.check(ok, 'assert_return: got ' + (this.formatValues(result) || 'nothing') + ', expected ' +
                       (expected.map(function (item) { return item.text; }).join(' ') || 'nothing'), command.line);
            return null;
        }
        case 'assert_trap':
            this.expectFailure(command, function () {
                if (command.module !== undefined)
                    self.instantiate(command.module);
                else
                    self.action(command.action);
            }, 'trap');
            return null;
        case 'assert_exhaustion':
            this.expectFailure(command, function () { self.action(command.action); }, 'exhaustion');
            return null;
        case 'assert_malformed':
            this.expectFailure(command, function () { self.prepare(command.module); }, 'malformed');
            return null;
        case 'assert_invalid':
            this.expectFailure(command, function () { self.prepare(command.module); }, 'invalid');
            return null;
        case 'assert_unlinkable':
            this.expectFailure(command, function () { self.instantiate(command.module); }, 'unlinkable');
            return null;
        case 'assert_uninstantiable':
            this.expectFailure(command, function () { self.instantiate(command.module); }, 'trap');
            return null;
        }
        throw this.error('unknown command ' + command.type, command.line);
    };

    W.Runner = Runner;
})(globalThis);
