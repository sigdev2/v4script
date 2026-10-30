// C#: types - named types with arguments (classes, structs, interfaces,
// enums, delegates; the predefined types are structs of System), arrays,
// type parameters; substitution, identity, the names csc shows and the
// names of the run time.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.named)
        return;

    // The current symbol table of the session (set before checking).
    CS.symtab = null;

    var VOID = { kind: 'void' };
    var NULL = { kind: 'null' };
    var DYNAMIC = { kind: 'dynamic' };
    CS.VOID = VOID;
    CS.NULL = NULL;
    CS.DYNAMIC = DYNAMIC;

    CS.named = function (sym, args, tupleNames) {
        var type = { kind: 'named', sym: sym, args: args || [] };
        if (tupleNames)
            type.tupleNames = tupleNames;
        return type;
    };
    CS.arrayType = function (elem, rank) {
        return { kind: 'array', elem: elem, rank: rank || 1 };
    };
    CS.typeParam = function (sym) {
        if (sym.type === undefined)
            sym.type = { kind: 'tparam', sym: sym };
        return sym.type;
    };

    // The predefined types by keyword.
    var SPECIAL_NAMES = {
        bool: 'System.Boolean', byte: 'System.Byte', sbyte: 'System.SByte', short: 'System.Int16', ushort: 'System.UInt16',
        int: 'System.Int32', uint: 'System.UInt32', long: 'System.Int64', ulong: 'System.UInt64', char: 'System.Char',
        float: 'System.Single', double: 'System.Double', decimal: 'System.Decimal', string: 'System.String',
        object: 'System.Object'
    };
    CS.SPECIAL_NAMES = SPECIAL_NAMES;
    var KEYWORD_OF = {};
    Object.keys(SPECIAL_NAMES).forEach(function (keyword) { KEYWORD_OF[SPECIAL_NAMES[keyword]] = keyword; });
    CS.KEYWORD_OF = KEYWORD_OF;

    // The kind of arithmetic of a numeric type (T.ops kinds), by keyword.
    var NUMERIC = { sbyte: 'i8', byte: 'u8', short: 'i16', ushort: 'u16', int: 'i32', uint: 'u32', long: 'i64', ulong: 'u64',
                    char: 'u16', float: 'f32', double: 'f64', decimal: 'decimal' };
    CS.NUMERIC = NUMERIC;

    // A predefined type by keyword (int, string, ...).
    CS.special = function (keyword) {
        if (keyword === 'void')
            return VOID;
        return CS.symtab.special(keyword);
    };

    CS.objectType = function () {
        return CS.symtab.special('object');
    };
    CS.stringType = function () {
        return CS.symtab.special('string');
    };
    CS.intType = function () {
        return CS.symtab.special('int');
    };
    CS.boolType = function () {
        return CS.symtab.special('bool');
    };

    // A named type of the library by its full name: System.Exception,
    // System.Collections.Generic.List`1 with args.
    CS.libraryType = function (qname, args) {
        return CS.named(CS.symtab.typeNamed(qname), args || []);
    };

    // The keyword of a predefined type or null.
    CS.keywordOf = function (type) {
        if (type.kind !== 'named')
            return null;
        return type.sym.special || null;
    };

    CS.isSpecial = function (type, keyword) {
        return type.kind === 'named' && type.sym.special === keyword;
    };

    CS.isNumeric = function (type) {
        return type.kind === 'named' && type.sym.special !== undefined && NUMERIC[type.sym.special] !== undefined;
    };

    CS.isIntegral = function (type) {
        if (type.kind !== 'named' || type.sym.special === undefined)
            return false;
        var kind = NUMERIC[type.sym.special];
        return kind !== undefined && kind !== 'f32' && kind !== 'f64' && kind !== 'decimal';
    };

    CS.isFloating = function (type) {
        return CS.isSpecial(type, 'float') || CS.isSpecial(type, 'double');
    };

    CS.isEnum = function (type) {
        return type.kind === 'named' && type.sym.kind === 'enum';
    };

    CS.isDelegate = function (type) {
        return type.kind === 'named' && type.sym.kind === 'delegate';
    };

    CS.isInterface = function (type) {
        return type.kind === 'named' && type.sym.kind === 'interface';
    };

    CS.isNullableValue = function (type) {
        return type.kind === 'named' && type.sym.qname === 'System.Nullable' && type.args.length === 1;
    };

    // The type inside int? (or the type itself).
    CS.underlyingNullable = function (type) {
        return CS.isNullableValue(type) ? type.args[0] : type;
    };

    CS.nullableOf = function (type) {
        if (CS.isNullableValue(type))
            return type;
        return CS.named(CS.symtab.typeNamed('System.Nullable`1'), [type]);
    };

    CS.isTuple = function (type) {
        return type.kind === 'named' && type.sym.isTuple === true;
    };

    // The element types of a tuple type (with TRest flattened).
    CS.tupleElements = function (type) {
        var elements = type.args.slice();
        if (elements.length === 8 && CS.isTuple(elements[7]))
            elements = elements.slice(0, 7).concat(CS.tupleElements(elements[7]));
        return elements;
    };

    CS.tupleType = function (elements, names) {
        if (elements.length > 7) {
            var rest = CS.tupleType(elements.slice(7), null);
            elements = elements.slice(0, 7).concat([rest]);
        }
        var sym = CS.symtab.typeNamed('System.ValueTuple`' + elements.length);
        var type = CS.named(sym, elements);
        if (names && names.some(function (name) { return name !== null; }))
            type.tupleNames = names;
        return type;
    };

    // A value type: structs (the predefined numbers and bool too), enums,
    // nullable; a type parameter with the struct constraint.
    CS.isValueType = function (type) {
        if (type.kind === 'named')
            return type.sym.kind === 'struct' || type.sym.kind === 'enum';
        if (type.kind === 'tparam')
            return type.sym.constraints.struct === true || type.sym.constraints.unmanaged === true;
        return false;
    };

    // A reference type: classes, interfaces, delegates, arrays, string,
    // object, dynamic, type parameters with the class constraint.
    CS.isReferenceType = function (type) {
        switch (type.kind) {
        case 'named':
            return type.sym.kind === 'class' || type.sym.kind === 'interface' || type.sym.kind === 'delegate';
        case 'array':
        case 'dynamic':
        case 'null':
            return true;
        case 'tparam':
            return CS.typeParamIsReference(type.sym);
        }
        return false;
    };

    // A type parameter known to be a reference type: class constraint or a
    // class base type constraint.
    CS.typeParamIsReference = function (sym) {
        if (sym.constraints.class === true)
            return true;
        return sym.constraints.types.some(function (bound) {
            return (bound.kind === 'named' && bound.sym.kind === 'class' && bound.sym.special !== 'object' &&
                    bound.sym.qname !== 'System.ValueType' && bound.sym.qname !== 'System.Enum') ||
                bound.kind === 'array' || (bound.kind === 'tparam' && CS.typeParamIsReference(bound.sym));
        });
    };

    // --- Substitution

    // map: Map(type parameter symbol -> type).
    CS.subst = function (type, map) {
        if (map === null || map === undefined || map.size === 0)
            return type;
        switch (type.kind) {
        case 'tparam': {
            var found = map.get(type.sym);
            return found !== undefined ? found : type;
        }
        case 'named': {
            if (type.args.length === 0)
                return type;
            var changed = false;
            var args = type.args.map(function (arg) {
                var result = CS.subst(arg, map);
                if (result !== arg)
                    changed = true;
                return result;
            });
            if (!changed)
                return type;
            var substituted = CS.named(type.sym, args);
            if (type.tupleNames)
                substituted.tupleNames = type.tupleNames;
            return substituted;
        }
        case 'array': {
            var elem = CS.subst(type.elem, map);
            return elem === type.elem ? type : CS.arrayType(elem, type.rank);
        }
        }
        return type;
    };

    // The substitution of a constructed type: its type parameters (outer
    // ones of nested types too) to its arguments.
    CS.typeMap = function (type) {
        var map = new Map();
        if (type.kind !== 'named')
            return map;
        var params = type.sym.allTypeParams;
        for (var index = 0; index < params.length && index < type.args.length; ++index)
            map.set(params[index], type.args[index]);
        return map;
    };

    // The type of a symbol (a type declaration) with its own parameters.
    CS.selfType = function (sym) {
        if (sym.thisType === undefined)
            sym.thisType = CS.named(sym, sym.allTypeParams.map(CS.typeParam));
        return sym.thisType;
    };

    // Whether a type mentions a type parameter.
    CS.isOpen = function (type) {
        switch (type.kind) {
        case 'tparam':
            return true;
        case 'named':
            return type.args.some(CS.isOpen);
        case 'array':
            return CS.isOpen(type.elem);
        }
        return false;
    };

    // --- Identity

    CS.sameType = function (left, right) {
        if (left === right)
            return true;
        if (left.kind !== right.kind) {
            // object and dynamic are identical types.
            return (left.kind === 'dynamic' && CS.isSpecial(right, 'object')) ||
                (right.kind === 'dynamic' && CS.isSpecial(left, 'object'));
        }
        switch (left.kind) {
        case 'named':
            if (left.sym !== right.sym || left.args.length !== right.args.length)
                return false;
            for (var index = 0; index < left.args.length; ++index) {
                if (!CS.sameType(left.args[index], right.args[index]))
                    return false;
            }
            return true;
        case 'array':
            return left.rank === right.rank && CS.sameType(left.elem, right.elem);
        case 'tparam':
            return left.sym === right.sym;
        case 'void':
        case 'null':
        case 'dynamic':
            return true;
        }
        return false;
    };

    // A key of a type (for maps of types).
    CS.typeKey = function (type) {
        switch (type.kind) {
        case 'named':
            return type.args.length === 0 ? type.sym.jsId : type.sym.jsId + '<' + type.args.map(CS.typeKey).join(',') + '>';
        case 'array':
            return CS.typeKey(type.elem) + '[' + new Array(type.rank).join(',') + ']';
        case 'tparam':
            return '!' + type.sym.name + '#' + type.sym.id;
        }
        return type.kind;
    };

    // --- Names

    // The name of a type in messages, as csc writes it: int, List<int>,
    // int[], int?, (int, string), Outer.Inner.
    CS.typeName = function (type) {
        switch (type.kind) {
        case 'void':
            return 'void';
        case 'null':
            return '<null>';
        case 'dynamic':
            return 'dynamic';
        case 'tparam':
            return type.sym.name;
        case 'array':
            return CS.typeName(arrayElementBase(type)) + arrayRanks(type);
        case 'named': {
            var sym = type.sym;
            if (sym.special !== undefined)
                return sym.special;
            if (CS.isNullableValue(type))
                return CS.typeName(type.args[0]) + '?';
            if (sym.isTuple) {
                var elements = CS.tupleElements(type);
                if (elements.length >= 2) {
                    return '(' + elements.map(function (element, index) {
                        var name = type.tupleNames ? type.tupleNames[index] : null;
                        return CS.typeName(element) + (name ? ' ' + name : '');
                    }).join(', ') + ')';
                }
            }
            if (sym.isAnonymous)
                return '<anonymous type: ' + sym.anonymousMembers.map(function (member, index) {
                    return CS.typeName(type.args[index]) + ' ' + member;
                }).join(', ') + '>';
            var outerArgs = 0;
            var prefix = '';
            if (sym.container !== null && sym.container.kind !== 'namespace') {
                var outer = sym.container;
                outerArgs = outer.allTypeParams.length;
                prefix = CS.typeName(CS.named(outer, type.args.slice(0, outerArgs))) + '.';
            }
            var own = type.args.slice(outerArgs);
            return prefix + sym.name + (own.length > 0 ? '<' + own.map(CS.typeName).join(', ') + '>' : '');
        }
        }
        return '?';
    };

    function arrayElementBase(type) {
        while (type.kind === 'array')
            type = type.elem;
        return type;
    }

    function arrayRanks(type) {
        var text = '';
        while (type.kind === 'array') {
            text += '[' + new Array(type.rank).join(',') + ']';
            type = type.elem;
        }
        return text;
    }

    // The full name of a type symbol: System.Collections.Generic.List`1,
    // Outer+Inner (the name of the run time).
    CS.runtimeName = function (sym) {
        var own = sym.name + (sym.typeParams.length > 0 ? '`' + sym.typeParams.length : '');
        if (sym.container === null)
            return own;
        if (sym.container.kind === 'namespace')
            return sym.container.qname === '' ? own : sym.container.qname + '.' + own;
        return CS.runtimeName(sym.container) + '+' + own;
    };

    // The name of a symbol in messages with its container: Program.F,
    // List<T>.Add.
    CS.symbolTypeName = function (sym) {
        var name = sym.name + (sym.typeParams.length > 0 ? '<' + sym.typeParams.map(function (param) {
            return param.name;
        }).join(', ') + '>' : '');
        if (sym.special !== undefined)
            return sym.special;
        if (sym.container !== null && sym.container.kind !== 'namespace')
            return CS.symbolTypeName(sym.container) + '.' + name;
        return name;
    };
})(globalThis);
