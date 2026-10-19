// Go: the language session - the package main shared by the units, the
// packages of the standard library and of host files, the run of a unit.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    if (Go.language)
        return;

    var rt = Go.runtime;
    var CompileError = T.CompileError;
    var MAX_IMPORT_DEPTH = 32;

    // The field type of js.Value: an opaque JavaScript value.
    Go.types.jsRef = { kind: 'basic', name: 'jsref', info: 'unsafe', num: null, untyped: false };

    var GO_PARAMETER = { string: 'string', number: 'float64', int: 'int', bool: 'bool', value: 'any', array: 'any' };
    var GO_RESULT = { void: '', string: 'string', number: 'float64', int: 'int', bool: 'bool', value: 'js.Value',
                      array: '[]js.Value' };

    // Go source of a host module: functions without bodies, their names
    // exported; optional parameters become "rest ...any".
    function hostSource(module) {
        var lines = ['package ' + module.name, 'import "syscall/js"'];
        module.functions.forEach(function (fn) {
            var parameters = [];
            var count = fn.getter ? 0 : fn.parameters.length;
            for (var index = 0; index < count; ++index) {
                if (fn.parameters[index].optional) {
                    parameters.push('rest ...any');
                    break;
                }
                parameters.push('p' + index + ' ' + GO_PARAMETER[fn.parameters[index].type]);
            }
            var result = GO_RESULT[fn.result];
            lines.push('func ' + fn.names.pascal + '(' + parameters.join(', ') + ')' + (result ? ' ' + result : ''));
        });
        return lines.join('\n');
    }

    function Session(env) {
        this.env = env;
        rt.env = env;
        rt.scheduler = env.scheduler;
        this.main = new Go.Package('main', 'main', '');
        this.packages = Object.create(null);
        this.attachments = Object.create(null);
        this.loading = [];
        this.asyncPossible = false;
        // Host modules are packages with the name of the module; global ones
        // need no import. A standard package of the same name wins.
        this.hostPackages = Object.create(null);
        this.implicitHost = Object.create(null);
        var self = this;
        env.modules.forEach(function (module) {
            if (Object.prototype.hasOwnProperty.call(Go.stdlib, module.name))
                return;
            self.hostPackages[module.name] = hostSource(module);
            Go.natives[module.name] = Go.hostNatives(module);
            if (module.global)
                self.implicitHost[module.name] = module.name;
        });
    }

    Session.prototype.implicitImport = function (name) {
        if (Object.prototype.hasOwnProperty.call(Go.implicitPackages, name))
            return Go.implicitPackages[name];
        return this.implicitHost[name] !== undefined ? this.implicitHost[name] : null;
    };

    Session.prototype.importPackage = function (path, node, source) {
        var std = Object.prototype.hasOwnProperty.call(Go.stdlib, path);
        if (std || this.hostPackages[path] !== undefined) {
            var known = this.packages[path];
            if (known !== undefined)
                return known;
            var pkg = this.compilePackage(path, std ? Go.stdlib[path] : this.hostPackages[path], 'go:' + path, true,
                                          node, source);
            this.packages[path] = pkg;
            return pkg;
        }
        // A package from the host file "name.go".
        var name = path.replace(/^\.\//, '');
        var file = /\.go$/.test(name) ? name : name + '.go';
        var text = this.env.readModule(file);
        if (text === null)
            throw new CompileError('package ' + path + ' is not in std (no attachment ' + file + ')',
                                   node ? node.line : 0, node ? node.column : 0, source || '');
        var cached = this.attachments[file];
        if (cached !== undefined && cached.text === text)
            return cached.pkg;
        if (this.loading.indexOf(file) >= 0)
            throw new CompileError('import cycle not allowed: ' + this.loading.concat([file]).join(' -> '),
                                   node ? node.line : 0, node ? node.column : 0, source || '');
        var compiled = this.compilePackage(path, text, file, false, node, source);
        this.attachments[file] = { text: text, pkg: compiled };
        return compiled;
    };

    // A package from source text: checking, translation, natives, running
    // the variable declarations.
    Session.prototype.compilePackage = function (path, text, source, std, node, importer) {
        if (this.loading.length >= MAX_IMPORT_DEPTH)
            throw new CompileError('imports are nested too deeply', node ? node.line : 0, 0, importer || '');
        this.loading.push(source);
        try {
            var file = Go.parse(text, std ? '' : source);
            var name = file.packageName || path.split('/').pop();
            var pkg = new Go.Package(name, path, std ? '' : source);
            pkg.natives = std;
            if (path === 'syscall/js')
                pkg.scope.insert({ kind: 'typename', name: 'jsref', type: Go.types.jsRef });
            var checker = new Go.Checker(this, pkg);
            checker.source = std ? '' : source;
            checker.checkFile(file, { script: false });
            checker.commit();
            var generator = new Go.Generator(checker);
            var body = generator.file(file);
            this.installNatives(pkg, path);
            this.refreshTypes(pkg);
            var run = this.env.compileChunk(body, ['$go', '$T', '$D', '$m'], [rt, T, generator.constants, pkg.runtime],
                                            std ? '' : source, { library: std });
            var result = run();
            if (T.isGenerator(result))
                this.env.scheduler.runNested(result);
            return pkg;
        } finally {
            this.loading.pop();
        }
    };

    Session.prototype.installNatives = function (pkg, path) {
        var factory = Go.natives[path];
        if (factory === undefined)
            return;
        var context = {
            env: this.env,
            pkg: pkg,
            desc: function (name) { return Go.desc(pkg.scope.lookupLocal(name).type); }
        };
        var table = factory(context);
        var async = table.$async || {};
        Object.keys(table).forEach(function (key) {
            if (key === '$async')
                return;
            var implementation = table[key];
            var dot = key.indexOf('.');
            if (dot < 0) {
                var object = pkg.scope.lookupLocal(key);
                pkg.runtime[object !== null && object.jsName ? object.jsName : T.propertyName(key)] = implementation;
                if (object !== null && async[key]) {
                    object.async = true;
                    object.nativeAsync = true;
                }
                return;
            }
            var typeName = key.substring(0, dot);
            var methodName = key.substring(dot + 1);
            var type = pkg.scope.lookupLocal(typeName).type;
            var desc = Go.desc(type);
            var js = T.propertyName(methodName);
            if (desc.kind === 'struct')
                desc.ctor.prototype[js] = implementation;
            else
                desc.methods[js] = implementation;
            type.methods.forEach(function (method) {
                if (method.name === methodName && async[key]) {
                    method.async = true;
                    method.nativeAsync = true;
                }
            });
        });
    };

    // The method sets of the descriptions - after the unit declares methods.
    Session.prototype.refreshTypes = function (pkg) {
        var names = pkg.scope.names;
        Object.keys(names).forEach(function (name) {
            var object = names[name];
            if (object.kind === 'typename' && object.type.kind === 'named')
                Go.refreshMethods(object.type);
        });
    };

    Session.prototype.runBlock = function (code, blockId) {
        rt.reset();
        this.env.scheduler.reset();
        this.loading = [];
        var file = Go.parse(code, '');
        if (file.packageName !== null && file.packageName !== 'main')
            throw new CompileError('package ' + file.packageName + '; expected package main', 1, 1, '');
        var checker = new Go.Checker(this, this.main);
        var generator, body;
        try {
            checker.checkFile(file, { script: true, blockId: blockId });
            generator = new Go.Generator(checker);
            body = generator.file(file);
        } catch (error) {
            checker.rollback();
            throw error;
        }
        checker.commit();
        this.refreshTypes(this.main);
        var run = this.env.compileChunk(body, ['$go', '$T', '$D', '$m'], [rt, T, generator.constants, this.main.runtime], '');
        try {
            var result = run();
            if (file.top.async)
                return this.runAsync(result);
            return result;
        } catch (error) {
            if (error instanceof rt.GoExit && error.code === 0)
                return undefined;
            throw error;
        }
    };

    // The main fiber: to the end or to a wait for time; then by the timers
    // of the unit.
    Session.prototype.runAsync = function (generator) {
        var env = this.env;
        var value;
        var state = env.scheduler.runMain(generator, function (callback, delay) {
            return env.schedule(function () {
                try {
                    callback();
                } finally {
                    env.out.flush();
                    env.err.flush();
                }
            }, delay);
        }, function (error, result) {
            if (error !== null && error !== undefined) {
                if (!(error instanceof rt.GoExit && error.code === 0))
                    env.reportLate(error);
                return;
            }
            value = result;
        });
        return state === 'done' ? value : undefined;
    };

    Session.prototype.describeError = function (error) {
        if (error instanceof rt.GoExit)
            return error.message;
        return rt.toPanic(error).message;
    };

    Session.prototype.deadlock = function () {
        return new rt.GoPanic(null, 'fatal error: all goroutines are asleep - deadlock!');
    };

    Go.language = {
        id: 'go',
        name: 'Go',
        createSession: function (env) {
            return new Session(env);
        }
    };
    T.languages.go = Go.language;
})(globalThis);
