// Lua - fengari (Lua 5.3 in JavaScript) with the module js of fengari-interop.
//
// All units in Lua are one Lua state: global variables and functions are
// shared. A host module is a global table (app.greet("Ann")) and, when
// global, global functions too; anything else from JavaScript is reached
// through js.global (a method call needs the colon:
// js.global:setTimeout(f, 100)). Modules are files "name.lua" of the host
// (require); io.read and io.lines read standard input. How values cross
// between the languages - docs/internals/vendor.md.
(function (host) {
    'use strict';

    var global = host.global;
    var fengari = global.fengari;
    var interop = global.fengariInterop;
    var lua = fengari.lua;
    var lauxlib = fengari.lauxlib;
    var lualib = fengari.lualib;
    var toLua = fengari.to_luastring;

    var output = host.writer('stdout');
    var errors = host.writer('stderr');
    var modules = host.modules();
    var luaState = null;
    var refreshModules = lua.LUA_NOREF;
    var running = null;

    // Host modules: tables of functions that call hostCall(nil, module,
    // function, ...) - a JavaScript function takes `this` first in Lua.
    function moduleSource() {
        var lines = [];
        modules.forEach(function (module, moduleIndex) {
            lines.push(module.name + ' = {}');
            module.functions.forEach(function (fn, fnIndex) {
                lines.push('function ' + module.name + '.' + fn.name + '(...) return hostCall(nil, ' + moduleIndex +
                           ', ' + fnIndex + ', ...) end');
                if (module.global)
                    lines.push(fn.name + ' = ' + module.name + '.' + fn.name);
            });
        });
        return lines;
    }

    // The Lua part: host modules, standard input, modules from the host.
    // No files: fengari would read them with a request to an address.
    var PRELUDE = [
        'local readModule, hostCall = ...',
    ].concat(moduleSource()).concat([
        'function io.lines() return function() return io.read("l") end end',
        'loadfile, dofile = nil, nil',
        'package.path, package.cpath, package.loadlib = "", "", nil',
        'local sources = {}',
        'local function searchHost(name)',
        '    local file = name:gsub("%.", "/") .. ".lua"',
        '    local text = readModule(file)',
        '    if text == nil then return "\\n\\tno file \'" .. file .. "\'" end',
        '    local chunk, message = load(text, "@" .. file)',
        '    if chunk == nil then error(message, 0) end',
        '    sources[name] = { file = file, text = text }',
        '    return chunk, file',
        'end',
        'package.searchers = { package.searchers[1], searchHost }',
        // A changed file loads again on the next require.
        'return function ()',
        '    for name, source in pairs(sources) do',
        '        if readModule(source.file) ~= source.text then',
        '            package.loaded[name], sources[name] = nil, nil',
        '        end',
        '    end',
        'end'
    ]).join('\n');

    function toText(state, index) {
        return lua.lua_tojsstring(state, index);
    }

    function joinArguments(state, separator, first) {
        var parts = [];
        for (var index = first || 1; index <= lua.lua_gettop(state); ++index) {
            lauxlib.luaL_tolstring(state, index);
            parts.push(toText(state, -1));
            lua.lua_pop(state, 1);
        }
        return parts.join(separator);
    }

    function print(state) {
        output.write(joinArguments(state, '\t') + '\n');
        return 0;
    }

    function write(state) {
        output.write(joinArguments(state, ''));
        return 0;
    }

    // file:write(...) of io.stdout and io.stderr: the first argument is the file.
    function fileWrite(target) {
        return function (state) {
            target.write(joinArguments(state, '', 2));
            lua.lua_pushvalue(state, 1);
            return 1;
        };
    }

    // A numeral for io.read("n"): optional sign, decimal or hexadecimal
    // digits, fraction and exponent.
    function readNumber() {
        var input = host.input;
        var character;
        while ((character = input.peekChar()) !== null && /\s/.test(character))
            input.readChar();
        var text = '';
        while ((character = input.peekChar()) !== null && /[0-9a-fA-FxX.+\-pP]/.test(character) && text.length < 200)
            text += input.readChar();
        if (/^[+-]?0[xX][0-9a-fA-F]+$/.test(text))
            return { value: parseInt(text, 16), integer: true };
        if (/^[+-]?\d+$/.test(text))
            return { value: parseInt(text, 10), integer: true };
        if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(text))
            return { value: parseFloat(text), integer: false };
        return null;
    }

    // io.read(...) with the formats of Lua 5.3: "l", "L", "n", "a" (with or
    // without "*") and a number of characters. nil at the end of input.
    function read(state) {
        var input = host.input;
        var count = lua.lua_gettop(state);
        var formats = [];
        for (var index = 1; index <= count; ++index)
            formats.push(lua.lua_type(state, index) === lua.LUA_TNUMBER ? lua.lua_tointeger(state, index)
                                                                       : toText(state, index));
        if (formats.length === 0)
            formats.push('l');
        var pushed = 0;
        for (var number = 0; number < formats.length; ++number) {
            var format = formats[number];
            if (typeof format === 'string')
                format = format.replace(/^\*/, '').charAt(0);
            var ok = true;
            if (typeof format === 'number') {
                if (format === 0) {
                    ok = !input.atEnd();
                    if (ok)
                        lua.lua_pushstring(state, toLua(''));
                } else {
                    var text = '';
                    var character;
                    while (text.length < format && (character = input.readChar()) !== null)
                        text += character;
                    ok = text.length > 0;
                    if (ok)
                        lua.lua_pushstring(state, toLua(text));
                }
            } else if (format === 'l' || format === 'L') {
                var line = input.readLine();
                ok = line !== null;
                if (ok)
                    lua.lua_pushstring(state, toLua(format === 'L' ? line + '\n' : line));
            } else if (format === 'n') {
                var parsed = readNumber();
                ok = parsed !== null;
                if (ok) {
                    if (parsed.integer)
                        lua.lua_pushinteger(state, parsed.value);
                    else
                        lua.lua_pushnumber(state, parsed.value);
                }
            } else if (format === 'a') {
                lua.lua_pushstring(state, toLua(input.readAll()));
            } else {
                return lauxlib.luaL_argerror(state, number + 1, toLua('invalid format'));
            }
            if (!ok) {
                lua.lua_pushnil(state);
                return pushed + 1;
            }
            ++pushed;
        }
        return pushed;
    }

    function readModule(state) {
        var text = host.readModule(toText(state, 1));
        if (text === null)
            lua.lua_pushnil(state);
        else
            lua.lua_pushstring(state, toLua(text));
        return 1;
    }

    function hostCall(moduleIndex, fnIndex) {
        var fn = modules[moduleIndex].functions[fnIndex];
        return fn.invoke(Array.prototype.slice.call(arguments, 2));
    }

    var started = Date.now();

    // os.clock of fengari takes the time from performance, which the Qt
    // engine does not have.
    function clock(state) {
        lua.lua_pushnumber(state, (Date.now() - started) / 1000);
        return 1;
    }

    function setFunction(name, implementation) {
        lua.lua_pushcfunction(luaState, implementation);
        lua.lua_setglobal(luaState, toLua(name));
    }

    function setField(name, implementation) {
        lua.lua_pushcfunction(luaState, implementation);
        lua.lua_setfield(luaState, -2, toLua(name));
    }

    function create() {
        luaState = lauxlib.luaL_newstate();
        lualib.luaL_openlibs(luaState);
        lauxlib.luaL_requiref(luaState, toLua('js'), interop.luaopen_js, 1);
        lua.lua_pop(luaState, 1);
        setFunction('print', print);
        // The browser build of fengari has no io library: an own one with
        // the console and standard input.
        lua.lua_newtable(luaState);
        setField('write', write);
        setField('read', read);
        lua.lua_newtable(luaState);
        setField('write', fileWrite(output));
        lua.lua_setfield(luaState, -2, toLua('stdout'));
        lua.lua_newtable(luaState);
        setField('write', fileWrite(errors));
        lua.lua_setfield(luaState, -2, toLua('stderr'));
        lua.lua_setglobal(luaState, toLua('io'));
        lua.lua_getglobal(luaState, toLua('os'));
        setField('clock', clock);
        lua.lua_pop(luaState, 1);

        if (lauxlib.luaL_loadbuffer(luaState, toLua(PRELUDE), null, toLua('=prelude')) !== lua.LUA_OK)
            throw new Error(toText(luaState, -1));
        lua.lua_pushcfunction(luaState, readModule);
        interop.push(luaState, hostCall);
        if (lua.lua_pcall(luaState, 2, 1, 0) !== lua.LUA_OK)
            throw new Error(toText(luaState, -1));
        refreshModules = lauxlib.luaL_ref(luaState, lua.LUA_REGISTRYINDEX);
    }

    // Error handler: remembers the line of the Lua chunk where the error
    // happened - for Lua errors and for JavaScript exceptions of the host.
    function describeError(state) {
        var place = { line: 0, source: '' };
        var debug = new lua.lua_Debug();
        for (var level = 1; lua.lua_getstack(state, level, debug); ++level) {
            lua.lua_getinfo(state, toLua('Sl'), debug);
            // Functions of host modules live in the prelude: the place is
            // the code that called them.
            if (debug.currentline > 0 && fengari.to_jsstring(debug.source) !== '=prelude') {
                place.line = debug.currentline;
                place.source = fengari.to_jsstring(debug.source);
                break;
            }
        }
        var error = lua.lua_type(state, 1) === lua.LUA_TSTRING ? toText(state, 1) : interop.tojs(state, 1);
        var message;
        if (typeof error === 'string')
            message = error;
        else if (error !== null && typeof error === 'object' && error.message !== undefined)
            message = (error.name ? error.name + ': ' : '') + error.message;
        else
            message = host.format(error);
        interop.push(state, { message: message, line: place.line, source: place.source });
        return 1;
    }

    function toError(message, line, source, chunk) {
        // "chunk:line: text" - the place from the text of a Lua error.
        var match = /^([^\n:]+):(\d+): ([\s\S]*)$/.exec(message);
        if (match !== null) {
            source = match[1];
            line = Number(match[2]);
            message = match[3];
        }
        source = String(source || '');
        if (source.charAt(0) === '@' || source.charAt(0) === '=')
            source = source.substring(1);
        if (source === chunk || source === '')
            return host.error(message, line);
        return host.error(message, line, source);
    }

    function startCall() {
        running = { top: lua.lua_gettop(luaState), ci: luaState.ci, nCcalls: luaState.nCcalls, nny: luaState.nny,
                    errfunc: luaState.errfunc };
    }

    // A run interrupted by the host never returns from lua_pcall: the state
    // stayed in the middle of a call and must go back to its start.
    function repairAfterStop() {
        if (running === null)
            return;
        luaState.ci = running.ci;
        luaState.nCcalls = running.nCcalls;
        luaState.nny = running.nny;
        luaState.errfunc = running.errfunc;
        lua.lua_settop(luaState, running.top);
        running = null;
    }

    function load(code, chunk) {
        // As interactive Lua: first as an expression, to show its value.
        if (lauxlib.luaL_loadbuffer(luaState, toLua('return ' + code), null, toLua('=' + chunk)) === lua.LUA_OK)
            return null;
        lua.lua_pop(luaState, 1);
        if (lauxlib.luaL_loadbuffer(luaState, toLua(code), null, toLua('=' + chunk)) === lua.LUA_OK)
            return null;
        var message = toText(luaState, -1);
        lua.lua_pop(luaState, 1);
        return toError(message, 0, '', chunk);
    }

    // The state is made while the language loads: loading is not the time
    // of a program.
    create();

    return {
        run: function (code) {
            repairAfterStop();
            var chunk = host.unit() || 'main';
            var base = lua.lua_gettop(luaState);

            lua.lua_rawgeti(luaState, lua.LUA_REGISTRYINDEX, refreshModules);
            lua.lua_pcall(luaState, 0, 0, 0);
            lua.lua_settop(luaState, base);

            lua.lua_pushcfunction(luaState, describeError);
            var error = load(code, chunk);
            if (error !== null) {
                lua.lua_settop(luaState, base);
                throw error;
            }
            startCall();
            var status = lua.lua_pcall(luaState, 0, lua.LUA_MULTRET, base + 1);
            running = null;
            if (status !== lua.LUA_OK) {
                var description = interop.tojs(luaState, -1);
                lua.lua_settop(luaState, base);
                if (description !== null && typeof description === 'object' && description.message !== undefined)
                    throw toError(description.message, description.line, description.source, chunk);
                throw toError(String(description), 0, '', chunk);
            }
            var values = [];
            for (var index = base + 2; index <= lua.lua_gettop(luaState); ++index)
                values.push(lua.lua_type(luaState, index) === lua.LUA_TNIL
                    ? 'nil'
                    : host.format(interop.tojs(luaState, index)));
            lua.lua_settop(luaState, base);
            return values.length > 0 ? values.join('\t') : undefined;
        }
    };
})
