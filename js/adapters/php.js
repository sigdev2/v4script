// PHP - Uniter (translates PHP to JavaScript and runs it synchronously).
//
// All units in PHP are one environment: global variables, functions and
// classes are shared. A host module is a namespace (app\greet("Ann")) and,
// when global, functions with the names of JavaScript; JavaScript objects
// are used with ->; anything else from JavaScript is the global variable
// $js. include and require read files of the host; fgets(STDIN),
// readline() and friends read standard input. "<?php" at the start of a
// unit may be left out.
(function (host) {
    'use strict';

    var global = host.global;
    var uniter = global.uniterPhp;
    var output = host.writer('stdout');
    var errors = host.writer('stderr');
    var warnings = host.writer('warning');
    var parser = uniter.phpToAST.create(null, { captureAllBounds: true });
    var environment = null;
    var UNIT_PATH = 'main';
    var modules = host.modules();

    function compile(code, path) {
        var ast = parser.parse(code);
        var source = uniter.phpToJS.transpile(ast, { bare: true, lineNumbers: true, mode: 'sync', path: path });
        return uniter.phpRuntime.compile(new Function('return ' + source)());
    }

    function withOpeningTag(code) {
        // The tag is on the line of the code: line numbers stay.
        return /^\s*<\?php/.test(code) ? code : '<?php ' + code;
    }

    // include and require: the file of the host with this name.
    function include(path, promise) {
        var name = String(path).replace(/^(\.?\/)+/, '');
        var text = host.readModule(name);
        if (text === null) {
            promise.reject(new Error('no file ' + name));
            return;
        }
        try {
            promise.resolve(compile(withOpeningTag(text), name));
        } catch (error) {
            promise.reject(error);
        }
    }

    // Constants that Uniter lacks: the value is PHP text.
    var CONSTANTS = {
        M_PI: '3.141592653589793', M_E: '2.718281828459045', M_SQRT2: '1.4142135623730951',
        PHP_EOL: '"\\n"', PHP_FLOAT_EPSILON: 'pow(2, -52)',
        STR_PAD_LEFT: '0', STR_PAD_RIGHT: '1', STR_PAD_BOTH: '2',
        SORT_REGULAR: '0', SORT_NUMERIC: '1', SORT_STRING: '2',
        JSON_PRETTY_PRINT: '128', JSON_UNESCAPED_SLASHES: '64', JSON_UNESCAPED_UNICODE: '256',
        STDIN: '__v4script_stream(0)', STDOUT: '__v4script_stream(1)', STDERR: '__v4script_stream(2)'
    };

    // Host modules: PHP functions that call $__v4script->call(module,
    // function, arguments); optional parameters default to null.
    function moduleFunctions(module, moduleIndex, inNamespace) {
        return module.functions.map(function (fn, fnIndex) {
            var parameters = fn.getter ? [] : fn.parameters.map(function (parameter, index) {
                return '$' + parameter.name + (index >= fn.required ? ' = null' : '');
            });
            var declaration = 'function ' + fn.name + '(' + parameters.join(', ') + ') { global $__v4script; ' +
                'return $__v4script->call(' + moduleIndex + ', ' + fnIndex + ', func_get_args()); }';
            // A global function cannot replace a built-in one (log, range):
            // then it is only in the namespace of the module.
            return inNamespace ? declaration : 'if (!function_exists("' + fn.name + '")) { ' + declaration + ' }';
        });
    }

    var hostBridge = {
        call: function (moduleIndex, fnIndex, args) {
            return modules[moduleIndex].functions[fnIndex].invoke(args || []);
        }
    };

    // Global host functions, constants and formatted output that Uniter
    // lacks.
    var PRELUDE = [
        '<?php',
        'ini_set("display_errors", "Off");',
        // Uniter does not parse "...$values": arguments come from func_get_args.
        'function printf($format) { $text = call_user_func_array("sprintf", func_get_args()); echo $text; ' +
            'return strlen($text); }',
        'function vsprintf($format, $values) { ' +
            'return call_user_func_array("sprintf", array_merge([$format], array_values($values))); }',
        'function vprintf($format, $values) { $text = vsprintf($format, $values); echo $text; return strlen($text); }'
    ].concat(Object.keys(CONSTANTS).map(function (name) {
        return 'if (!defined("' + name + '")) { define("' + name + '", ' + CONSTANTS[name] + '); }';
    })).concat(modules.reduce(function (lines, module, index) {
        return module.global ? lines.concat(moduleFunctions(module, index, false)) : lines;
    }, [])).join('\n');

    // Standard streams: resources of Uniter whose streams are the host.
    // fwrite and feof of Uniter work with them; fgets, fgetc, readline and
    // stream_get_contents are added (Uniter has no such functions).
    function streamFunctions(internals) {
        var values = internals.valueFactory;
        var input = {
            isEof: function () { return host.input.atEnd(); },
            write: function () { return values.createPresent(null); },
            close: function () { return values.createPresent(null); }
        };
        function writing(target) {
            return {
                isEof: function () { return false; },
                write: function (text) {
                    target.write(String(text));
                    return values.createPresent(null);
                },
                close: function () { return values.createPresent(null); }
            };
        }
        var resources = [input, writing(output), writing(errors)].map(function (stream) {
            return values.createResource('stream', { stream: stream });
        });

        function typed(signature, implementation) {
            return internals.typeFunction(signature, implementation);
        }

        function isInput(value) {
            return value !== undefined && value !== null && value.getType() === 'resource' &&
                value.getResource().stream === input;
        }

        function textOrFalse(text) {
            return text === null ? values.createBoolean(false) : values.createString(text);
        }

        var functions = {
            __v4script_stream: typed('mixed $number : mixed', function (number) {
                return resources[number.getNative()];
            }),
            fgets: typed('mixed $stream, mixed $length = null : mixed', function (handle) {
                if (!isInput(handle))
                    return values.createBoolean(false);
                var line = host.input.readLine();
                return textOrFalse(line === null ? null : line + '\n');
            }),
            fgetc: typed('mixed $stream : mixed', function (handle) {
                return textOrFalse(isInput(handle) ? host.input.readChar() : null);
            }),
            readline: typed('mixed $prompt = null : mixed', function (prompt) {
                var text = prompt === undefined || prompt === null ? null : prompt.getNative();
                if (text !== null && text !== undefined)
                    output.write(String(text));
                return textOrFalse(host.input.readLine());
            }),
            stream_get_contents: typed('mixed $stream : mixed', function (handle) {
                return textOrFalse(isInput(handle) ? host.input.readAll() : null);
            }),
            file_get_contents: typed('mixed $filename : mixed', function (name) {
                var file = String(name.getNative());
                return textOrFalse(file === 'php://stdin' ? host.input.readAll() : host.readModule(file));
            })
        };
        // A function that Uniter has cannot be declared again.
        Object.keys(functions).forEach(function (name) {
            if (internals.globalNamespace.hasFunction(name))
                delete functions[name];
        });
        return functions;
    }

    function create() {
        // Regular expressions preg_* are a separate addon of Uniter (pcremu).
        environment = uniter.phpRuntime.createEnvironment({ include: include }, [
            uniter.pcre,
            { functionGroups: [uniter.library, streamFunctions] }
        ]);
        environment.getStdout().on('data', function (text) { output.write(text); });
        // A fatal error comes as an exception, warnings only here.
        environment.getStderr().on('data', function (text) {
            text = String(text);
            if (/^PHP (Fatal|Parse) error:/.test(text))
                return;
            warnings.write(text.replace(/^PHP /, '').replace(/ {2}/, ' ').replace(/ in (unknown|main) on line /, ' on line '));
        });
        environment.expose(global, 'js');
        environment.expose(hostBridge, '__v4script');
        compile(PRELUDE, 'prelude')({}, environment).execute();
        // Every module is also a namespace: app\greet("Ann").
        modules.forEach(function (module, index) {
            compile(['<?php', 'namespace ' + module.name + ';'].concat(moduleFunctions(module, index, true)).join('\n'),
                    'prelude')({}, environment).execute();
        });
    }

    // "PHP Fatal error:  Uncaught Error: text in main on line 3" without the
    // prefix and the place; the place goes to the line and module of the
    // error.
    function toError(error) {
        if (error === null || typeof error !== 'object' || typeof error.getLineNumber !== 'function')
            return error;
        var message = String(error.message || error)
            .replace(/^PHP (Fatal|Parse) error:\s*/, '')
            .replace(/^Uncaught /, '')
            .replace(/ in \S+:\d+$/, '')
            .replace(/ in \S+ on line \d+$/, '');
        var line = Number(error.getLineNumber()) || 0;
        var path = typeof error.getFilePath === 'function' ? error.getFilePath() : null;
        if (path && path !== UNIT_PATH && path !== '(program)' && path !== '(unknown)' && path !== 'unknown')
            return host.error(message, line, path);
        return host.error(message, line);
    }

    function describe(value) {
        if (value === undefined || value === null || typeof value.getNative !== 'function')
            return undefined;
        var type = value.getType ? value.getType() : '';
        if (type === 'null')
            return undefined;
        return value.getNative();
    }

    // The environment is made while the language loads: loading is not the
    // time of a program.
    create();

    return {
        run: function (code) {
            var module;
            try {
                module = compile(withOpeningTag(code), UNIT_PATH);
            } catch (error) {
                throw toError(error);
            }
            try {
                return describe(module({}, environment).execute());
            } catch (error) {
                throw toError(error);
            }
        }
    };
})
