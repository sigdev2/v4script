// Go: types, constants and the compatibility rules (identity,
// assignability, conversion, method sets).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Go = T.go = T.go || {};
    if (Go.types)
        return;

    var big = T.big;
    var rat = T.rat;

    // --- Built-in types

    function basic(name, info, num, untyped) {
        return { kind: 'basic', name: name, info: info, num: num || null, untyped: !!untyped };
    }

    var types = {
        bool: basic('bool', 'bool'),
        string: basic('string', 'string'),
        int: basic('int', 'int', 'i64'),
        int8: basic('int8', 'int', 'i8'),
        int16: basic('int16', 'int', 'i16'),
        int32: basic('int32', 'int', 'i32'),
        int64: basic('int64', 'int', 'i64'),
        uint: basic('uint', 'int', 'u64'),
        uint8: basic('uint8', 'int', 'u8'),
        uint16: basic('uint16', 'int', 'u16'),
        uint32: basic('uint32', 'int', 'u32'),
        uint64: basic('uint64', 'int', 'u64'),
        uintptr: basic('uintptr', 'int', 'u64'),
        float32: basic('float32', 'float', 'f32'),
        float64: basic('float64', 'float', 'f64'),
        complex64: basic('complex64', 'complex'),
        complex128: basic('complex128', 'complex'),
        untypedBool: basic('untyped bool', 'bool', null, true),
        untypedInt: basic('untyped int', 'int', null, true),
        untypedRune: basic('untyped rune', 'int', null, true),
        untypedFloat: basic('untyped float', 'float', null, true),
        untypedString: basic('untyped string', 'string', null, true),
        untypedNil: basic('untyped nil', 'nil', null, true),
        invalid: basic('invalid type', 'invalid')
    };
    // byte and rune are other names of uint8 and int32.
    types.byte = types.uint8;
    types.rune = types.int32;

    var RANGES = {
        i8: [-128, 127], i16: [-32768, 32767], i32: [-2147483648, 2147483647],
        u8: [0, 255], u16: [0, 65535], u32: [0, 4294967295]
    };
    var INT64_MIN = big.neg(big.pow(2, 63)), INT64_MAX = big.sub(big.pow(2, 63), 1);
    var UINT64_MAX = big.sub(big.pow(2, 64), 1);

    function underlying(type) {
        while (type.kind === 'named')
            type = type.underlying;
        if (type.kind === 'typeparam')
            return type.core || type;
        return type;
    }

    function isBasic(type, info) {
        var underlyingType = underlying(type);
        return underlyingType.kind === 'basic' && (info === undefined || underlyingType.info === info);
    }

    function isInteger(type) { return isBasic(type, 'int'); }
    function isFloat(type) { return isBasic(type, 'float'); }
    function isNumeric(type) { return isInteger(type) || isFloat(type); }
    function isString(type) { return isBasic(type, 'string'); }
    function isBoolean(type) { return isBasic(type, 'bool'); }
    function isUntyped(type) { return type.kind === 'basic' && type.untyped; }
    function isUnsigned(type) {
        var underlyingType = underlying(type);
        return underlyingType.kind === 'basic' && underlyingType.num !== null && underlyingType.num.charAt(0) === 'u';
    }
    function isInterface(type) { return underlying(type).kind === 'interface'; }
    function isTypeParam(type) { return type.kind === 'typeparam'; }

    // The kind of a number for T.ops: i64, u8, f64...
    function numKind(type) {
        var underlyingType = underlying(type);
        if (underlyingType.kind !== 'basic')
            return null;
        if (underlyingType.num !== null)
            return underlyingType.num;
        if (underlyingType === types.untypedFloat)
            return 'f64';
        if (underlyingType === types.untypedInt)
            return 'i64';
        if (underlyingType === types.untypedRune)
            return 'i32';
        return null;
    }

    function defaultType(type) {
        switch (type) {
        case types.untypedBool:
            return types.bool;
        case types.untypedInt:
            return types.int;
        case types.untypedRune:
            return types.rune;
        case types.untypedFloat:
            return types.float64;
        case types.untypedString:
            return types.string;
        }
        return type;
    }

    // --- Composite types

    function pointer(elem) { return { kind: 'pointer', elem: elem }; }
    function slice(elem) { return { kind: 'slice', elem: elem }; }
    function array(elem, length) { return { kind: 'array', elem: elem, length: length }; }
    function map(key, elem) { return { kind: 'map', key: key, elem: elem }; }
    function chan(elem, dir) { return { kind: 'chan', elem: elem, dir: dir || 'both' }; }
    function tuple(list) { return { kind: 'tuple', types: list }; }
    // params, results: [{ name, type }]
    function signature(params, results, variadic) {
        return { kind: 'func', params: params, results: results, variadic: !!variadic };
    }
    // fields: [{ name, type, embedded, tag }]
    function struct(fields) { return { kind: 'struct', fields: fields }; }

    var namedCounter = 0;
    function named(name, pkg, underlyingType) {
        return { kind: 'named', name: name, pkg: pkg, underlying: underlyingType || null, methods: [],
                 id: ++namedCounter };
    }

    // methods: [{ name, type }] - own ones; embeds - embedded types.
    function iface(methods, embeds) {
        var result = { kind: 'interface', methods: methods, embeds: embeds || [], all: null, terms: null,
                       comparable: false };
        return result;
    }

    // The full list of the methods of an interface (with embedded ones), by name.
    function interfaceMethods(type) {
        var underlyingType = underlying(type);
        if (underlyingType.all !== null)
            return underlyingType.all;
        var all = [];
        var seen = {};
        underlyingType.methods.forEach(function (method) {
            seen[method.name] = true;
            all.push(method);
        });
        underlyingType.embeds.forEach(function (embedded) {
            var embeddedType = underlying(embedded);
            if (embeddedType.kind !== 'interface')
                return;
            interfaceMethods(embeddedType).forEach(function (method) {
                if (!seen[method.name]) {
                    seen[method.name] = true;
                    all.push(method);
                }
            });
        });
        all.sort(function (left, right) { return left.name < right.name ? -1 : (left.name > right.name ? 1 : 0); });
        underlyingType.all = all;
        return all;
    }

    // The type set of a constraint: null - any type, otherwise [{ tilde, type }].
    function typeTerms(type) {
        var underlyingType = underlying(type);
        if (underlyingType.kind !== 'interface')
            return [{ tilde: false, type: type }];
        var terms = underlyingType.terms;
        underlyingType.embeds.forEach(function (embedded) {
            if (embedded.kind === 'union')
                terms = intersectTerms(terms, embedded.terms);
            else if (underlying(embedded).kind === 'interface')
                terms = intersectTerms(terms, typeTerms(embedded));
            else
                terms = intersectTerms(terms, [{ tilde: false, type: embedded }]);
        });
        return terms;
    }

    function intersectTerms(left, right) {
        if (left === null)
            return right;
        if (right === null)
            return left;
        return left.filter(function (leftTerm) {
            return right.some(function (rightTerm) {
                return identical(leftTerm.tilde ? underlying(leftTerm.type) : leftTerm.type,
                                 rightTerm.tilde ? underlying(rightTerm.type) : rightTerm.type) ||
                    (rightTerm.tilde && identical(underlying(leftTerm.type), rightTerm.type));
            });
        });
    }

    function isComparableConstraint(type) {
        var underlyingType = underlying(type);
        if (underlyingType.kind !== 'interface')
            return false;
        if (underlyingType.comparable)
            return true;
        return underlyingType.embeds.some(function (embedded) {
            return embedded.kind !== 'union' && isComparableConstraint(embedded);
        });
    }

    // --- Identity

    function identical(left, right) {
        if (left === right)
            return true;
        if (left.kind !== right.kind)
            return false;
        switch (left.kind) {
        case 'basic':
            return left.name === right.name;
        case 'named':
            if (left.origin && right.origin && left.origin === right.origin)
                return left.typeArgs.every(function (arg, index) { return identical(arg, right.typeArgs[index]); });
            return false;
        case 'pointer':
        case 'slice':
            return identical(left.elem, right.elem);
        case 'array':
            return left.length === right.length && identical(left.elem, right.elem);
        case 'map':
            return identical(left.key, right.key) && identical(left.elem, right.elem);
        case 'chan':
            return left.dir === right.dir && identical(left.elem, right.elem);
        case 'func':
            return left.variadic === right.variadic && left.params.length === right.params.length &&
                left.results.length === right.results.length &&
                left.params.every(function (param, index) {
                    return identical(param.type, right.params[index].type);
                }) &&
                left.results.every(function (result, index) {
                    return identical(result.type, right.results[index].type);
                });
        case 'struct':
            return left.fields.length === right.fields.length && left.fields.every(function (field, index) {
                var other = right.fields[index];
                return field.name === other.name && field.embedded === other.embedded && identical(field.type, other.type);
            });
        case 'interface': {
            var leftMethods = interfaceMethods(left), rightMethods = interfaceMethods(right);
            if (leftMethods.length !== rightMethods.length)
                return false;
            if (left.terms !== null || right.terms !== null || left.comparable !== right.comparable)
                return false;
            return leftMethods.every(function (method, index) {
                return method.name === rightMethods[index].name && identical(method.type, rightMethods[index].type);
            });
        }
        case 'tuple':
            return left.types.length === right.types.length &&
                left.types.every(function (type, index) { return identical(type, right.types[index]); });
        case 'typeparam':
            return false;
        }
        return false;
    }

    // --- Type notation

    function typeString(type, qualify) {
        switch (type.kind) {
        case 'basic':
            return type.name;
        case 'named': {
            var name = (type.pkg && qualify !== false ? type.pkg + '.' : '') + type.name;
            if (type.typeArgs)
                name += '[' + type.typeArgs.map(function (arg) { return typeString(arg, qualify); }).join(',') + ']';
            return name;
        }
        case 'pointer':
            return '*' + typeString(type.elem, qualify);
        case 'slice':
            return '[]' + typeString(type.elem, qualify);
        case 'array':
            return '[' + type.length + ']' + typeString(type.elem, qualify);
        case 'map':
            return 'map[' + typeString(type.key, qualify) + ']' + typeString(type.elem, qualify);
        case 'chan':
            return (type.dir === 'recv' ? '<-chan ' : (type.dir === 'send' ? 'chan<- ' : 'chan ')) +
                typeString(type.elem, qualify);
        case 'func':
            return 'func' + signatureString(type, qualify);
        case 'struct':
            if (type.fields.length === 0)
                return 'struct {}';
            return 'struct { ' + type.fields.map(function (field) {
                return field.embedded ? typeString(field.type, qualify) : field.name + ' ' + typeString(field.type, qualify);
            }).join('; ') + ' }';
        case 'interface': {
            var methods = interfaceMethods(type);
            if (methods.length === 0 && type.terms === null && !type.comparable)
                return type.isAny ? 'any' : 'interface {}';
            if (type.isAny)
                return 'any';
            var parts = methods.map(function (method) { return method.name + signatureString(method.type, qualify); });
            if (type.terms !== null)
                parts.push(type.terms.map(function (term) { return (term.tilde ? '~' : '') + typeString(term.type, qualify); }).join(' | '));
            return 'interface { ' + parts.join('; ') + ' }';
        }
        case 'tuple':
            return '(' + type.types.map(function (item) { return typeString(item, qualify); }).join(', ') + ')';
        case 'typeparam':
            return type.name;
        }
        return '?';
    }

    function signatureString(sig, qualify) {
        var params = sig.params.map(function (param, index) {
            var text = typeString(param.type, qualify);
            if (sig.variadic && index === sig.params.length - 1)
                text = '...' + typeString(param.type.elem, qualify);
            return text;
        }).join(', ');
        var text = '(' + params + ')';
        if (sig.results.length === 1)
            text += ' ' + typeString(sig.results[0].type, qualify);
        else if (sig.results.length > 1)
            text += ' (' + sig.results.map(function (result) { return typeString(result.type, qualify); }).join(', ') + ')';
        return text;
    }

    // --- Fields and methods

    // Looks up a field or a method name of a type: { kind: 'field'|'method',
    // path: [indices of embedded fields], field|method, indirect, owner }
    // or null; ambiguous - when several are found at one depth.
    function lookup(type, name) {
        var isPointer = false;
        var start = type;
        if (type.kind === 'pointer') {
            isPointer = true;
            start = type.elem;
        } else if (underlying(type).kind === 'pointer' && type.kind !== 'named') {
            isPointer = true;
            start = underlying(type).elem;
        }
        var current = [{ type: start, path: [], indirect: isPointer }];
        var seen = [];
        while (current.length > 0) {
            var found = [];
            var next = [];
            current.forEach(function (entry) {
                var entryType = entry.type;
                if (seen.indexOf(entryType) >= 0)
                    return;
                seen.push(entryType);
                if (entryType.kind === 'named') {
                    var methods = entryType.methods;
                    for (var index = 0; index < methods.length; ++index) {
                        if (methods[index].name === name) {
                            found.push({ kind: 'method', path: entry.path, method: methods[index], indirect: entry.indirect,
                                         owner: entryType });
                        }
                    }
                }
                var underlyingType = underlying(entryType);
                if (underlyingType.kind === 'struct') {
                    underlyingType.fields.forEach(function (field, fieldIndex) {
                        if (field.name === name)
                            found.push({ kind: 'field', path: entry.path.concat([fieldIndex]), field: field,
                                         indirect: entry.indirect, owner: entryType });
                        if (field.embedded) {
                            var embedded = field.type;
                            var viaPointer = false;
                            if (embedded.kind === 'pointer') {
                                embedded = embedded.elem;
                                viaPointer = true;
                            }
                            next.push({ type: embedded, path: entry.path.concat([fieldIndex]),
                                        indirect: entry.indirect || viaPointer });
                        }
                    });
                } else if (underlyingType.kind === 'interface' && !(entry.path.length === 0 && isPointer)) {
                    interfaceMethods(underlyingType).forEach(function (method) {
                        if (method.name === name)
                            found.push({ kind: 'method', path: [], method: method, indirect: false, owner: entryType,
                                         interfaceMethod: true });
                    });
                }
            });
            if (found.length === 1)
                return found[0];
            if (found.length > 1)
                return { ambiguous: true };
            current = next;
        }
        return null;
    }

    // What the type lacks to implement an interface: null - nothing,
    // otherwise { name, pointer: *T has the method }.
    function missingMethod(type, ifaceType) {
        var methods = interfaceMethods(ifaceType);
        for (var index = 0; index < methods.length; ++index) {
            var wanted = methods[index];
            if (isInterface(type)) {
                var has = interfaceMethods(type).some(function (method) {
                    return method.name === wanted.name && identical(method.type, wanted.type);
                });
                if (!has)
                    return { name: wanted.name };
                continue;
            }
            var found = lookup(type, wanted.name);
            if (found === null || found.ambiguous || found.kind !== 'method')
                return { name: wanted.name };
            if (!identical(found.method.type, wanted.type))
                return { name: wanted.name, wrongType: found.method.type };
            // A method with a pointer receiver belongs only to *T (unless T
            // is a pointer or the method is promoted through an embedded pointer).
            if (found.method.pointerReceiver && type.kind !== 'pointer' && !found.indirect)
                return { name: wanted.name, pointer: true };
        }
        return null;
    }

    function comparable(type) {
        var underlyingType = underlying(type);
        switch (underlyingType.kind) {
        case 'basic':
            return underlyingType.info !== 'nil';
        case 'pointer':
        case 'chan':
        case 'interface':
            return true;
        case 'struct':
            return underlyingType.fields.every(function (field) { return comparable(field.type); });
        case 'array':
            return comparable(underlyingType.elem);
        case 'typeparam':
            return true;
        }
        return false;
    }

    function ordered(type) {
        var underlyingType = underlying(type);
        return underlyingType.kind === 'basic' &&
            (underlyingType.info === 'int' || underlyingType.info === 'float' || underlyingType.info === 'string');
    }

    // --- Constants
    //
    // The value of a constant: integers are T.big (a number or a Big),
    // floats are numbers, strings are bytes, booleans are boolean.

    function constantKind(type) {
        var underlyingType = underlying(type);
        if (underlyingType.kind !== 'basic')
            return null;
        return underlyingType.info;
    }

    // Does the value fit the type? Returns the converted value or
    // undefined.
    function represent(value, type) {
        var underlyingType = underlying(type);
        if (underlyingType.kind !== 'basic')
            return undefined;
        switch (underlyingType.info) {
        case 'bool':
            return typeof value === 'boolean' ? value : undefined;
        case 'string':
            return typeof value === 'string' ? value : undefined;
        case 'int': {
            var integer = value;
            if (typeof value === 'boolean' || typeof value === 'string')
                return undefined;
            if (rat.is(value)) {
                if (!rat.isInteger(value))
                    return undefined;
                integer = rat.trunc(value);
            }
            if (underlyingType.untyped)
                return integer;
            var range = RANGES[underlyingType.num];
            if (range !== undefined)
                return big.cmp(integer, range[0]) >= 0 && big.cmp(integer, range[1]) <= 0 ? integer : undefined;
            if (underlyingType.num === 'i64')
                return big.cmp(integer, INT64_MIN) >= 0 && big.cmp(integer, INT64_MAX) <= 0 ? integer : undefined;
            return big.cmp(integer, 0) >= 0 && big.cmp(integer, UINT64_MAX) <= 0 ? integer : undefined;
        }
        case 'float': {
            if (typeof value === 'boolean' || typeof value === 'string')
                return undefined;
            var exact = rat.is(value) ? value : rat.fromInt(value);
            if (underlyingType.untyped)
                return exact;
            // A typed constant is the value rounded to the type.
            var number = rat.toFloat(exact);
            if (underlyingType.num === 'f32')
                number = Math.fround(number);
            if (!isFinite(number))
                return undefined;
            return rat.fromFloat(number);
        }
        }
        return undefined;
    }

    function constantString(value, type) {
        if (typeof value === 'boolean')
            return String(value);
        if (typeof value === 'string')
            return T.quote(T.utf8.decode(value));
        if (rat.is(value)) {
            if (rat.isInteger(value))
                return big.str(rat.trunc(value));
            var number = rat.toFloat(value);
            return isFinite(number) ? String(number) : rat.str(value);
        }
        return big.str(value);
    }

    Go.types = types;
    Go.T = {
        underlying: underlying,
        isInteger: isInteger,
        isFloat: isFloat,
        isNumeric: isNumeric,
        isString: isString,
        isBoolean: isBoolean,
        isUntyped: isUntyped,
        isUnsigned: isUnsigned,
        isInterface: isInterface,
        isTypeParam: isTypeParam,
        isBasic: isBasic,
        numKind: numKind,
        defaultType: defaultType,
        pointer: pointer,
        slice: slice,
        array: array,
        map: map,
        chan: chan,
        tuple: tuple,
        signature: signature,
        struct: struct,
        named: named,
        iface: iface,
        interfaceMethods: interfaceMethods,
        typeTerms: typeTerms,
        isComparableConstraint: isComparableConstraint,
        identical: identical,
        typeString: typeString,
        signatureString: signatureString,
        lookup: lookup,
        missingMethod: missingMethod,
        comparable: comparable,
        ordered: ordered,
        constantKind: constantKind,
        represent: represent,
        constantString: constantString
    };
})(globalThis);
