// Go: type descriptions for run time. The translator and the translated
// code live in one engine, so a description (desc) is built right from the
// checked type and goes into the code as a constant: structs are classes
// with their own $copy, $set, $eq, interface boxes are classes with the
// methods of the type.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go;
    if (Go.desc)
        return;

    var G = Go.T;
    var types = Go.types;
    var rt = Go.runtime;
    var registry = Object.create(null);
    var nextId = 1;

    function typeKey(type) {
        switch (type.kind) {
        case 'named':
            return 'N' + type.id;
        case 'basic':
            return type.name;
        case 'pointer':
            return '*' + typeKey(type.elem);
        case 'slice':
            return '[]' + typeKey(type.elem);
        case 'array':
            return '[' + type.length + ']' + typeKey(type.elem);
        case 'map':
            return 'map[' + typeKey(type.key) + ']' + typeKey(type.elem);
        case 'chan':
            return 'chan(' + type.dir + ')' + typeKey(type.elem);
        case 'func':
            return 'func(' + type.params.map(function (param) { return typeKey(param.type); }).join(',') +
                (type.variadic ? '...' : '') + ')(' + type.results.map(function (result) { return typeKey(result.type); }).join(',') + ')';
        case 'struct':
            return 'struct{' + type.fields.map(function (field) {
                return (field.embedded ? '~' : '') + field.name + ' ' + typeKey(field.type);
            }).join(';') + '}';
        case 'interface':
            return 'iface{' + G.interfaceMethods(type).map(function (method) {
                return method.name + typeKey(method.type);
            }).join(';') + '}';
        }
        return '?' + type.kind;
    }

    var BASIC_ZERO = { bool: false, string: '' };

    function basicKind(type) {
        return type.name === 'byte' ? 'uint8' : (type.name === 'rune' ? 'int32' : type.name);
    }

    function str(type) {
        return G.typeString(type, true);
    }

    // A type description (one per type: identical types share one object).
    function desc(type) {
        if (type.kind === 'basic' && type.untyped)
            type = G.defaultType(type);
        if (type.kind === 'named' && type.desc !== undefined)
            return type.desc;
        var key = typeKey(type);
        if (type.kind !== 'named' && registry[key] !== undefined)
            return registry[key];
        var descriptor = { id: nextId++, str: str(type), named: type.kind === 'named', methodSet: {}, comparable: G.comparable(type) };
        if (type.kind === 'named') {
            type.desc = descriptor;
            descriptor.name = type.name;
            descriptor.pkg = type.pkg;
        } else {
            registry[key] = descriptor;
        }
        var underlyingType = G.underlying(type);
        switch (underlyingType.kind) {
        case 'basic':
            descriptor.kind = basicKind(underlyingType);
            descriptor.num = underlyingType.num;
            var zero = BASIC_ZERO[underlyingType.info] !== undefined ? BASIC_ZERO[underlyingType.info] : 0;
            descriptor.zero = function () { return zero; };
            descriptor.zeroValue = zero;
            break;
        case 'pointer':
            descriptor.kind = 'ptr';
            descriptor.elem = desc(underlyingType.elem);
            descriptor.zero = nullZero;
            descriptor.zeroValue = null;
            break;
        case 'slice':
            descriptor.kind = 'slice';
            descriptor.elem = desc(underlyingType.elem);
            descriptor.zero = function () { return rt.NIL; };
            descriptor.zeroValue = rt.NIL;
            break;
        case 'array':
            descriptor.kind = 'array';
            descriptor.elem = desc(underlyingType.elem);
            descriptor.len = underlyingType.length;
            makeArray(descriptor, underlyingType);
            break;
        case 'map':
            descriptor.kind = 'map';
            descriptor.key = desc(underlyingType.key);
            descriptor.elem = desc(underlyingType.elem);
            descriptor.zero = nullZero;
            descriptor.zeroValue = null;
            descriptor.keyFn = rt.keyFunction(descriptor.key);
            break;
        case 'chan':
            descriptor.kind = 'chan';
            descriptor.elem = desc(underlyingType.elem);
            descriptor.dir = underlyingType.dir;
            descriptor.zero = nullZero;
            descriptor.zeroValue = null;
            break;
        case 'func':
            descriptor.kind = 'func';
            descriptor.params = underlyingType.params.map(function (param) { return desc(param.type); });
            descriptor.results = underlyingType.results.map(function (result) { return desc(result.type); });
            descriptor.variadic = underlyingType.variadic;
            descriptor.zero = nullZero;
            descriptor.zeroValue = null;
            break;
        case 'interface':
            descriptor.kind = 'iface';
            descriptor.methodNames = G.interfaceMethods(underlyingType).map(function (method) {
                return T.propertyName(method.name);
            });
            descriptor.zero = nullZero;
            descriptor.zeroValue = null;
            break;
        case 'struct':
            descriptor.kind = 'struct';
            makeStruct(descriptor, underlyingType);
            break;
        default:
            descriptor.kind = 'unsafe';
            descriptor.zero = nullZero;
            descriptor.zeroValue = null;
        }
        descriptor.box = rt.makeBox(descriptor);
        if (type.kind === 'named' || type.kind === 'pointer')
            updateMethods(type);
        return descriptor;
    }

    function nullZero() {
        return null;
    }

    function fieldCopyCode(fieldDesc, expression, index) {
        if (fieldDesc.kind === 'struct')
            return expression + '.$copy()';
        if (fieldDesc.kind === 'array')
            return 'D[' + index + '].copy(' + expression + ')';
        return expression;
    }

    function equalCode(fieldDesc, left, right, index) {
        switch (fieldDesc.kind) {
        case 'struct':
            return left + '.$eq(' + right + ')';
        case 'int':
        case 'int64':
        case 'uint':
        case 'uint64':
        case 'uintptr':
            return '(' + left + ' === ' + right + ' || typeof ' + left + " === 'object' && T.i64.eq(" + left + ', ' +
                right + '))';
        case 'array':
        case 'iface':
        case 'ptr':
            return 'rt.equal(D[' + index + '], ' + left + ', ' + right + ')';
        }
        return left + ' === ' + right;
    }

    // The class of a struct: a constructor by fields, a copy, an assignment
    // in place, equality. The code is built with Function - faster than closures.
    function makeStruct(descriptor, underlyingType) {
        var fields = underlyingType.fields.map(function (field, index) {
            return { name: field.name, js: T.propertyName(field.name === '_' ? '_' + index : field.name),
                     embedded: field.embedded, exported: Go.isExported(field.name), type: field.type, desc: null };
        });
        descriptor.fields = fields;
        // Field descriptions may refer to this type (through a pointer):
        // they are filled lazily after the registration.
        fields.forEach(function (field) { field.desc = desc(field.type); });
        var D = fields.map(function (field) { return field.desc; });
        var params = fields.map(function (field, index) { return 'p' + index; });
        var assign = fields.map(function (field, index) { return 'this.' + field.js + ' = p' + index + ';'; }).join('\n');
        var ctor = new Function(params.join(', '), assign);
        ctor.prototype.$t = null;
        var copyArgs = fields.map(function (field, index) {
            return fieldCopyCode(field.desc, 'this.' + field.js, index);
        }).join(', ');
        var setBody = fields.map(function (field, index) {
            if (field.desc.kind === 'struct')
                return 'this.' + field.js + '.$set(o.' + field.js + ');';
            if (field.desc.kind === 'array')
                return 'D[' + index + '].set(this.' + field.js + ', o.' + field.js + ');';
            return 'this.' + field.js + ' = o.' + field.js + ';';
        }).join('\n');
        var eqBody = fields.length === 0 ? 'true' : fields.map(function (field, index) {
            return equalCode(field.desc, 'this.' + field.js, 'o.' + field.js, index);
        }).join(' && ');
        var zeroArgs = fields.map(function (field, index) {
            var fd = field.desc;
            if (fd.kind === 'struct' || fd.kind === 'array')
                return 'D[' + index + '].zero()';
            return 'D[' + index + '].zeroValue';
        }).join(', ');
        var factory = new Function('C', 'D', 'rt', 'T',
            'C.prototype.$copy = function () { return new C(' + copyArgs + '); };\n' +
            'C.prototype.$set = function (o) {\n' + setBody + '\nreturn this; };\n' +
            'C.prototype.$eq = function (o) { return ' + eqBody + '; };\n' +
            'return function () { return new C(' + zeroArgs + '); };');
        descriptor.ctor = ctor;
        descriptor.zero = factory(ctor, D, rt, T);
        descriptor.copy = function (value) { return value.$copy(); };
        descriptor.set = function (target, source) { return target.$set(source); };
    }

    function makeArray(descriptor, underlyingType) {
        var elem = descriptor.elem;
        var length = underlyingType.length;
        var elemCopy = elem.kind === 'struct' ? function (value) { return value.$copy(); }
            : (elem.kind === 'array' ? function (value) { return elem.copy(value); } : null);
        descriptor.copy = function (value) { return rt.copyArray(value, elemCopy); };
        descriptor.set = function (target, source) { return rt.setArray(target, source, elemCopy); };
        descriptor.zero = function () {
            var array = new Array(length);
            if (elem.kind === 'struct' || elem.kind === 'array') {
                for (var index = 0; index < length; ++index)
                    array[index] = elem.zero();
            } else {
                var zero = elem.zeroValue;
                for (var element = 0; element < length; ++element)
                    array[element] = zero;
            }
            return array;
        };
    }

    // The method set of a type with the methods promoted through embedded
    // fields: name -> { method, path: [fields], pointerOnly }.
    function methodSet(type, pointer) {
        var result = Object.create(null);
        var current = [{ type: type, path: [], indirect: pointer }];
        var seen = [];
        var depthNames = {};
        while (current.length > 0) {
            var next = [];
            var found = Object.create(null);
            current.forEach(function (entry) {
                var entryType = entry.type;
                if (seen.indexOf(entryType) >= 0)
                    return;
                seen.push(entryType);
                if (entryType.kind === 'named') {
                    entryType.methods.forEach(function (method) {
                        if (result[method.name] !== undefined || depthNames[method.name])
                            return;
                        if (method.pointerReceiver && !entry.indirect)
                            return;
                        found[method.name] = found[method.name] === undefined
                            ? { method: method, path: entry.path, owner: entryType } : { ambiguous: true };
                    });
                }
                var underlyingType = G.underlying(entryType);
                if (underlyingType.kind === 'interface' && entry.path.length > 0) {
                    G.interfaceMethods(underlyingType).forEach(function (method) {
                        if (result[method.name] !== undefined || depthNames[method.name])
                            return;
                        found[method.name] = found[method.name] === undefined
                            ? { method: method, path: entry.path, owner: entryType, viaInterface: true }
                            : { ambiguous: true };
                    });
                }
                if (underlyingType.kind === 'struct') {
                    underlyingType.fields.forEach(function (field) {
                        depthNames[field.name] = true;
                        if (!field.embedded)
                            return;
                        var embedded = field.type;
                        var viaPointer = false;
                        if (embedded.kind === 'pointer') {
                            embedded = embedded.elem;
                            viaPointer = true;
                        }
                        next.push({ type: embedded, path: entry.path.concat([T.propertyName(field.name)]),
                                    indirect: entry.indirect || viaPointer });
                    });
                }
            });
            Object.keys(found).forEach(function (name) {
                if (!found[name].ambiguous)
                    result[name] = found[name];
                depthNames[name] = true;
            });
            current = next;
        }
        return result;
    }

    function pathCode(path) {
        return path.map(function (name) { return '.' + name; }).join('');
    }

    // Rebuilds the methods of a description: the name set, the methods of
    // the box, the promoted methods of the struct prototype.
    function updateMethods(type) {
        if (type.kind === 'named') {
            var descriptor = type.desc;
            descriptor.methods = descriptor.methods || {};
            var valueSet = methodSet(type, false);
            descriptor.methodSet = {};
            Object.keys(valueSet).forEach(function (name) { descriptor.methodSet[T.propertyName(name)] = true; });
            installForwarders(descriptor.box.prototype, valueSet, 'this.v', false);
            if (descriptor.kind === 'struct') {
                // A pointer to a struct in an interface is the object
                // itself: the prototype has all methods, promoted ones too.
                installForwarders(descriptor.ctor.prototype, methodSet(type, true), 'this', true);
                descriptor.ctor.prototype.$t = desc(G.pointer(type));
            }
            return;
        }
        if (type.kind !== 'pointer' || type.elem.kind !== 'named')
            return;
        var pd = registry[typeKey(type)];
        if (pd === undefined)
            return;
        var set = methodSet(type.elem, true);
        pd.methodSet = {};
        Object.keys(set).forEach(function (name) { pd.methodSet[T.propertyName(name)] = true; });
        // The box of *T: it holds a pointer (for a struct, an object or nil).
        installForwarders(pd.box.prototype, set, 'this.v', false, true);
    }

    // Methods that call a method of the value along the path of embedded
    // fields. self - the expression of the value; skipDirect - the own
    // methods of the struct are on the prototype already; viaPointer - the
    // value is a pointer (a cell for non-structs).
    function installForwarders(proto, set, self, skipDirect, viaPointer) {
        Object.keys(set).forEach(function (name) {
            var entry = set[name];
            if (skipDirect && entry.path.length === 0)
                return;
            proto[T.propertyName(name)] = forwarder(entry, self, viaPointer);
        });
    }

    var ARGUMENTS = 'var a = [r]; for (var i = 0; i < arguments.length; ++i) a.push(arguments[i]); ';

    function forwarder(entry, self, viaPointer) {
        var js = T.propertyName(entry.method.name);
        var owner = entry.owner;
        var ownerIsStruct = entry.viaInterface || G.underlying(owner).kind === 'struct';
        var target = self + pathCode(entry.path);
        if (ownerIsStruct)
            return new Function('return function () { var r = ' + target + '; return r.' + js + '.apply(r, arguments); };')();
        // A non-struct: the method is a function of the description table,
        // the receiver is the value or a pointer to it.
        var receiver;
        if (entry.path.length === 0) {
            if (viaPointer)
                receiver = entry.method.pointerReceiver ? self : self + '.v';
            else
                receiver = self;
        } else if (entry.method.pointerReceiver) {
            var parent = self + pathCode(entry.path.slice(0, -1));
            receiver = 'rt.fieldRef(' + parent + ', "' + entry.path[entry.path.length - 1] + '")';
        } else {
            receiver = target;
        }
        return new Function('D', 'rt', 'return function () { var r = ' + receiver + '; ' + ARGUMENTS + 'return D.methods.' + js +
                            '.apply(null, a); };')(owner.desc || desc(owner), rt);
    }

    // After methods are declared: the descriptions of the type and of the
    // pointer to it are updated (and of the types that embed it - when they
    // are used next).
    Go.refreshMethods = function (named) {
        if (named.desc === undefined)
            return;
        updateMethods(named);
        var pointerKey = typeKey(G.pointer(named));
        if (registry[pointerKey] !== undefined)
            updateMethods(G.pointer(named));
    };

    // The size and alignment of a value of a type in bytes, as in Go on a
    // 64-bit system (the capacity growth of slices needs them).
    function sizeAndAlign(type) {
        var underlyingType = G.underlying(type);
        switch (underlyingType.kind) {
        case 'basic':
            switch (underlyingType.name) {
            case 'bool':
            case 'int8':
            case 'uint8':
                return [1, 1];
            case 'int16':
            case 'uint16':
                return [2, 2];
            case 'int32':
            case 'uint32':
            case 'float32':
                return [4, 4];
            case 'string':
            case 'complex128':
                return [16, 8];
            }
            return [8, 8];
        case 'slice':
            return [24, 8];
        case 'interface':
            return [16, 8];
        case 'array': {
            var elem = sizeAndAlign(underlyingType.elem);
            return [elem[0] * underlyingType.length, elem[1]];
        }
        case 'struct': {
            var offset = 0, align = 1;
            underlyingType.fields.forEach(function (field) {
                var item = sizeAndAlign(field.type);
                offset = Math.ceil(offset / item[1]) * item[1] + item[0];
                align = Math.max(align, item[1]);
            });
            return [Math.ceil(offset / align) * align, align];
        }
        }
        return [8, 8];
    }

    Go.sizeof = function (type) {
        return sizeAndAlign(type)[0];
    };

    Go.desc = desc;
    Go.typeKey = typeKey;
    Go.methodSet = methodSet;

    // Built-in descriptions for run time.
    rt.types = {
        string: desc(types.string),
        int: desc(types.int),
        bool: desc(types.bool),
        float64: desc(types.float64),
        error: null
    };
    // The type of run-time error values (runtime.Error).
    rt.runtimeErrorType = { id: nextId++, str: '*runtime.Error', named: true, kind: 'ptr',
                            methodSet: { Error: true, RuntimeError: true }, comparable: true,
                            elem: { id: nextId++, str: 'runtime.Error', kind: 'struct', fields: [], methodSet: {} } };
})(globalThis);
