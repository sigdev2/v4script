// Perl - Perlito5 (translates Perl 5 to JavaScript and runs it).
//
// All units in Perl are one interpreter: package variables (our) and
// subroutines are shared, my belongs to the unit. A host module is a
// package (app::greet("Ann")) and, when global, subroutines of main with
// the names of JavaScript; JavaScript objects are used with ->:
// $t->value("B2"), $b->title; anything else from JavaScript is js().
// Modules are files "Name.pm" of the host (use, require); <STDIN> reads
// standard input.
(function (host) {
    'use strict';

    var global = host.global;
    var p5pkg = global.p5pkg;
    var output = host.writer('stdout');
    var errors = host.writer('stderr');
    var FILE_NAME = 'main';
    // Texts of the files that modules came from: a changed file loads again.
    var moduleTexts = {};

    function isReference(value) {
        return value instanceof global.p5ArrayRef || value instanceof global.p5HashRef ||
            value instanceof global.p5ScalarRef || value instanceof global.p5GlobRef;
    }

    // A JavaScript object, not a Perl value: a Perl object (bless) has
    // _class_, a package has _is_package_.
    function isNative(value) {
        return value !== null && (typeof value === 'object' || typeof value === 'function') &&
            !isReference(value) && !Object.prototype.hasOwnProperty.call(value, '_class_') &&
            !Object.prototype.hasOwnProperty.call(value, '_is_package_');
    }

    // Perl references to arrays and hashes go to JavaScript as copies of
    // arrays and objects, as host APIs expect: $t->append([["a", 1]]).
    function toJs(value, depth) {
        depth = depth || 0;
        if (depth > 32)
            return value;
        // A Perl subroutine is a function (list, context); JavaScript calls
        // it as a usual function.
        if (typeof value === 'function' && Object.prototype.hasOwnProperty.call(value, '_prototype_')) {
            var sub = value;
            return function () {
                return toJs(sub(Array.prototype.map.call(arguments, function (item) { return toPerl(item); }), ''));
            };
        }
        if (value instanceof global.p5ArrayRef)
            return value._array_.map(function (item) { return toJs(item, depth + 1); });
        if (value instanceof global.p5HashRef) {
            var object = {};
            Object.keys(value._hash_).forEach(function (key) {
                object[key] = toJs(value._hash_[key], depth + 1);
            });
            return object;
        }
        if (value instanceof global.p5ScalarRef)
            return toJs(value._scalar_, depth + 1);
        return value;
    }

    // Plain data: an object without a prototype of its own, methods and
    // accessors.
    function isPlainData(value) {
        if (value === null || typeof value !== 'object' || value === global || isReference(value))
            return false;
        var prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null)
            return false;
        var names = Object.getOwnPropertyNames(value);
        for (var index = 0; index < names.length; ++index) {
            var descriptor = Object.getOwnPropertyDescriptor(value, names[index]);
            if (descriptor.get !== undefined || descriptor.set !== undefined || typeof descriptor.value === 'function')
                return false;
        }
        return true;
    }

    // An array from JavaScript comes to Perl as an array reference
    // (@{$t->rows}), plain data as a hash reference ($p->{x}); both are
    // copies. Other objects stay JavaScript objects ($t->value("B2")).
    function toPerl(value, depth) {
        depth = depth || 0;
        if (Array.isArray(value) && depth <= 32)
            return new global.p5ArrayRef(value.map(function (item) { return toPerl(item, depth + 1); }));
        if (depth <= 32 && isPlainData(value)) {
            var hash = {};
            Object.keys(value).forEach(function (key) {
                hash[key] = toPerl(value[key], depth + 1);
            });
            return new global.p5HashRef(hash);
        }
        return value === undefined ? null : value;
    }

    // A Perl list expands objects as hashes. A Perl hash in Perlito5 is a
    // plain object, while a JavaScript object with a prototype (a canvas, a
    // host object) and the global object js() stay values, like
    // references: setProperty(js(), "x", 1).
    global.p5list_to_a = function (args) {
        var result = [];
        for (var index = 0; index < args.length; ++index) {
            var item = args[index];
            if (item === null || item === undefined || item === global || item._class_ || item._ref_) {
                result.push(item);
            } else if (item instanceof Array) {
                for (var element = 0; element < item.length; ++element)
                    result.push(item[element]);
            } else if (typeof item === 'object' &&
                       (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null)) {
                for (var key in item) {
                    if (Object.prototype.hasOwnProperty.call(item, key)) {
                        result.push(key);
                        result.push(item[key]);
                    }
                }
            } else {
                result.push(item);
            }
        }
        return result;
    };

    var nativeCall = global.p5call;
    global.p5call = function (invocant, method, list, p5want, noParams) {
        if (!isNative(invocant))
            return nativeCall.apply(this, arguments);
        for (var index = 0; index < list.length; ++index)
            list[index] = toJs(list[index]);
        return toPerl(nativeCall.call(this, invocant, method, list, p5want, noParams));
    };

    function text(list) {
        var parts = [];
        for (var index = 0; index < list.length; ++index)
            parts.push(global.p5str(list[index]));
        return parts.join('');
    }

    p5pkg['Perlito5::IO'].print = function (filehandle, list) {
        var name = typeof filehandle === 'string' ? filehandle : String(filehandle && filehandle._ref_ || '');
        (name.indexOf('STDERR') >= 0 ? errors : output).write(text(list));
        return 1;
    };

    // --- Subroutines of JavaScript: the Perl list is the arguments.

    function makeSub(implementation) {
        return function (list, p5want) {
            var result = toPerl(implementation.apply(null, list.map(function (item) { return toJs(item); })));
            if (p5want && result instanceof global.p5ArrayRef)
                return result._array_;
            return result;
        };
    }

    function defineSub(name, implementation) {
        p5pkg.main[name] = makeSub(implementation);
    }

    host.modules().forEach(function (module) {
        var perlPackage = global.p5make_package(module.name);
        module.functions.forEach(function (fn) {
            var sub = makeSub(function () { return fn.invoke(arguments); });
            perlPackage[fn.name] = sub;
            if (module.global)
                p5pkg.main[fn.name] = sub;
        });
    });
    p5pkg.main.js = function () { return global; };
    // Properties of JavaScript objects: $c->width reads one, but writing
    // needs this.
    defineSub('setProperty', function (object, name, value) { object[name] = value; return value; });
    defineSub('getProperty', function (object, name) { return object[name]; });

    // --- Standard input: <STDIN> and <> read lines of the host. Other file
    // handles are files of the host opened for reading.

    var nativeReadline = p5pkg['Perlito5::IO'].readline;

    function isStandardInput(handle) {
        var name = typeof handle === 'string' ? handle : String(handle && handle._ref_ || '');
        return /^(main::)?(STDIN|ARGV)$/.test(name) || handle === p5pkg['main::STDIN'];
    }

    function readStandardLine() {
        var line = host.input.readLine();
        if (line === null)
            return null;
        // $/ undef reads everything that is left.
        return p5pkg.main['v_/'] === null || p5pkg.main['v_/'] === undefined ? line + '\n' + host.input.readAll()
                                                                              : line + '\n';
    }

    p5pkg['Perlito5::IO'].readline = p5pkg['Perlito5::IO'].getline = function (list, p5want) {
        if (!isStandardInput(list[0])) {
            if (typeof nativeReadline === 'function')
                return nativeReadline.apply(this, arguments);
            p5pkg.CORE.die(['readline of this file handle is not supported\n']);
        }
        if (p5want) {
            var lines = [];
            var line;
            while ((line = readStandardLine()) !== null)
                lines.push(line);
            return lines;
        }
        return readStandardLine();
    };

    // Perlito5 in a browser does not know the file handles STDOUT and STDERR
    // and turns print STDERR "x" into print(STDERR("x")): such
    // "subroutines" write.
    p5pkg.main.STDOUT = function (list) { output.write(text(list)); return ''; };
    p5pkg.main.STDERR = function (list) { errors.write(text(list)); return ''; };

    // --- Modules: use and require read files of the host.

    var use = p5pkg['Perlito5::Grammar::Use'];
    var included = p5pkg.main.Hash_INC;

    function die(message) {
        p5pkg.CORE.die([message + '\n']);
    }

    use.filename_lookup = function (list) {
        var file = global.p5str(list[0]);
        if (Object.prototype.hasOwnProperty.call(included, file)) {
            if (included[file])
                return 'done';
            die('Attempt to reload ' + file + ' aborted');
        }
        var source = host.readModule(file);
        if (source === null)
            die("Can't locate " + file);
        included[file] = file;
        return 'todo';
    };

    use.slurp_file = function (list) {
        var file = global.p5str(list[0]);
        var source = host.readModule(file);
        if (source === null)
            die("Can't locate " + file);
        included[file] = file;
        moduleTexts[file] = source;
        return source;
    };

    function forgetChangedModules() {
        Object.keys(moduleTexts).forEach(function (file) {
            if (host.readModule(file) !== moduleTexts[file]) {
                delete moduleTexts[file];
                delete included[file];
            }
        });
    }

    // --- Errors: the text of die without the JavaScript stack. Perlito5 knows
    // line numbers only while translating, and not always exactly; while
    // running it does not.

    function toError(error, compiling) {
        var message = error;
        if (error !== null && typeof error === 'object')
            message = error.v !== undefined ? error.v : (error.message !== undefined ? error.message : error);
        if (message instanceof global.p5HashRef || message instanceof global.p5ArrayRef)
            message = host.format(toJs(message));
        message = String(message).split('\n')[0];
        var line = 0;
        var place = / at \S* line (\d+)\.?$/.exec(message);
        if (place !== null) {
            message = message.substring(0, place.index);
            if (compiling)
                line = Number(place[1]);
        }
        return host.error(message, line);
    }

    var evaluate = eval;

    return {
        run: function (code) {
            forgetChangedModules();
            p5pkg.Perlito5.v_FILE_NAME = FILE_NAME;
            p5pkg.Perlito5.v_LINE_NUMBER = 1;
            var compiled;
            try {
                compiled = p5pkg.Perlito5.compile_p5_to_js(['{' + code + '\n}']);
            } catch (error) {
                throw toError(error, true);
            }
            try {
                evaluate(compiled);
            } catch (error) {
                throw toError(error, false);
            }
            return undefined;
        }
    };
})
