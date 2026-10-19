// C++: types. The arithmetic types are those of C (js/translator/c/types.js,
// 64-bit Linux); C++ adds cv-qualified types, references, classes with
// bases and members, scoped enums and the types of templates. Types are
// interned: equal types are the same object, so a type is compared with ===.
// A cv-qualified type is Object.create(unqualified) with own cv and
// unqualified: it reads everything else (size, fields, members) through its
// prototype, so it stays valid while a class is being completed. Caches of a
// type are own properties ($cache) for the same reason. Names of types are
// those of g++ messages. See docs/internals/cpp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c;
    var X = T.cpp = T.cpp || {};
    if (X.types)
        return;

    var CONST = 1, VOLATILE = 2;
    X.CONST = CONST;
    X.VOLATILE = VOLATILE;

    function integer(name, size, signed, rank, num) {
        return { kind: 'int', name: name, size: size, align: size, signed: signed, rank: rank, num: num };
    }

    var base = C.types;
    var types = {
        void: base.void, bool: base.bool, char: base.char, schar: base.schar, uchar: base.uchar,
        short: base.short, ushort: base.ushort, int: base.int, uint: base.uint, long: base.long, ulong: base.ulong,
        llong: base.llong, ullong: base.ullong, float: base.float, double: base.double, ldouble: base.ldouble,
        valist: base.valist,
        wchar: integer('wchar_t', 4, true, 3, 'i32'),
        char16: integer('char16_t', 2, false, 2, 'u16'),
        char32: integer('char32_t', 4, false, 3, 'u32'),
        nullptr: { kind: 'nullptr', name: 'std::nullptr_t', size: 8, align: 8 }
    };
    X.types = types;

    // The names g++ gives the arithmetic types.
    var GCC_NAMES = {
        '_Bool': 'bool', 'short': 'short int', 'unsigned short': 'short unsigned int', 'long': 'long int',
        'unsigned long': 'long unsigned int', 'long long': 'long long int',
        'unsigned long long': 'long long unsigned int'
    };

    var WORD_SETS = {
        'void': 'void', 'bool': 'bool', 'char': 'char', 'signed char': 'schar', 'unsigned char': 'uchar',
        'wchar_t': 'wchar', 'char16_t': 'char16', 'char32_t': 'char32', 'char8_t': 'uchar',
        'short': 'short', 'short int': 'short', 'signed short': 'short', 'signed short int': 'short',
        'unsigned short': 'ushort', 'unsigned short int': 'ushort',
        'int': 'int', 'signed': 'int', 'signed int': 'int', 'unsigned': 'uint', 'unsigned int': 'uint',
        'long': 'long', 'long int': 'long', 'signed long': 'long', 'signed long int': 'long',
        'unsigned long': 'ulong', 'unsigned long int': 'ulong',
        'long long': 'llong', 'long long int': 'llong', 'signed long long': 'llong', 'signed long long int': 'llong',
        'unsigned long long': 'ullong', 'unsigned long long int': 'ullong',
        'float': 'float', 'double': 'double', 'long double': 'ldouble'
    };
    var WORD_ORDER = ['signed', 'unsigned', 'short', 'long', 'char', 'wchar_t', 'char16_t', 'char32_t', 'char8_t',
                      'int',
                      'bool', 'float', 'double', 'void'];

    X.typeFromWords = function (words) {
        var sorted = words.slice().sort(function (left, right) {
            return WORD_ORDER.indexOf(left) - WORD_ORDER.indexOf(right);
        });
        var name = WORD_SETS[sorted.join(' ')];
        return name === undefined ? null : types[name];
    };

    // --- Identity and caches

    var counter = 0;
    var hasOwn = Object.prototype.hasOwnProperty;

    function cacheOf(type) {
        if (!hasOwn.call(type, '$cache'))
            type.$cache = Object.create(null);
        return type.$cache;
    }

    X.typeId = function (type) {
        if (!hasOwn.call(type, '$id'))
            type.$id = ++counter;
        return type.$id;
    };

    X.newId = function () {
        return ++counter;
    };

    // --- Qualifiers

    X.unqual = function (type) {
        return type.unqualified || type;
    };

    X.cvOf = function (type) {
        if (type.kind === 'array')
            return X.cvOf(type.of);
        return type.cv || 0;
    };

    X.isConst = function (type) {
        return (X.cvOf(type) & CONST) !== 0;
    };

    // The type with the qualifiers cv added (references and functions take
    // none; an array qualifies its elements).
    X.qualify = function (type, cv) {
        if (!cv || type.kind === 'lref' || type.kind === 'rref' || type.kind === 'function')
            return type;
        if (type.kind === 'array')
            return X.arrayOf(X.qualify(type.of, cv), type.length);
        var plain = X.unqual(type);
        var bits = (type.cv || 0) | cv;
        var cache = cacheOf(plain);
        var key = 'cv' + bits;
        if (cache[key] === undefined) {
            var qualified = Object.create(plain);
            qualified.cv = bits;
            qualified.unqualified = plain;
            cache[key] = qualified;
        }
        return cache[key];
    };

    // The type with exactly the qualifiers cv.
    X.withCv = function (type, cv) {
        if (type.kind === 'array')
            return X.arrayOf(X.withCv(type.of, cv), type.length);
        return X.qualify(X.unqual(type), cv);
    };

    // --- Compound types

    X.pointerTo = function (to) {
        var cache = cacheOf(to);
        if (cache.pointer === undefined)
            cache.pointer = { kind: 'pointer', to: to, size: 8, align: 8 };
        return cache.pointer;
    };

    // T& and T&&, with reference collapsing (T& && is T&).
    X.lref = function (to) {
        if (to.kind === 'lref' || to.kind === 'rref')
            to = to.to;
        var cache = cacheOf(to);
        if (cache.lref === undefined)
            cache.lref = { kind: 'lref', to: to, size: 8, align: 8 };
        return cache.lref;
    };

    X.rref = function (to) {
        if (to.kind === 'lref')
            return to;
        if (to.kind === 'rref')
            to = to.to;
        var cache = cacheOf(to);
        if (cache.rref === undefined)
            cache.rref = { kind: 'rref', to: to, size: 8, align: 8 };
        return cache.rref;
    };

    function ArrayType(of, length) {
        this.kind = 'array';
        this.of = of;
        this.length = length;
    }
    // The size follows the element type: an array of a class declared
    // before the class was complete.
    Object.defineProperties(ArrayType.prototype, {
        size: { get: function () { return this.length === null || this.length < 0 ? 0 : this.of.size * this.length; } },
        align: { get: function () { return this.of.align; } }
    });

    X.arrayOf = function (of, length) {
        var cache = cacheOf(of);
        var key = 'array' + (length === null ? 'u' : length);
        if (cache[key] === undefined)
            cache[key] = new ArrayType(of, length);
        return cache[key];
    };

    var functionTypes = new Map();

    // A function type; cv and ref are the qualifiers of a member function
    // (const, &, &&).
    X.functionType = function (returns, params, variadic, cv, ref, noexcept) {
        var key = X.typeId(returns) + '(' + params.map(X.typeId).join(',') + (variadic ? ',...' : '') + ')' +
            (cv || 0) + (ref || '') + (noexcept ? 'n' : '');
        var found = functionTypes.get(key);
        if (found === undefined) {
            found = { kind: 'function', returns: returns, params: params, variadic: !!variadic, unspecified: false,
                      cv: cv || 0, ref: ref || null, noexcept: !!noexcept, size: 1, align: 1 };
            functionTypes.set(key, found);
        }
        return found;
    };

    // --- Classes and enums

    // A class, a struct or a union. It is also a scope: members by name
    // (fields, static members, overload sets of methods, nested types).
    function ClassType(name, cname) {
        this.kind = cname === 'union' ? 'union' : 'struct';
        this.tag = name;
        this.name = name;
        this.cname = cname;
        this.isClass = true;
        this.id = ++counter;
        this.parent = null;
        this.members = Object.create(null);
        this.usings = [];
        this.complete = false;
        this.size = 0;
        this.align = 1;
        // The C layout (C.layoutRecord): bases, the vtable pointer and fields.
        this.fields = null;
        this.bases = [];
        this.dataMembers = [];
        this.ctors = [];
        this.ctorTemplates = [];
        this.dtor = null;
        this.conversions = [];
        this.polymorphic = false;
        this.abstract = false;
        // The virtual functions by slot (the primary vtable).
        this.slots = [];
        this.template = null;
        this.templateArgs = null;
        this.library = false;
    }
    X.ClassType = ClassType;

    function EnumType(name, scoped, underlying) {
        this.kind = 'enum';
        this.tag = name;
        this.name = name;
        this.scoped = scoped;
        this.id = ++counter;
        this.parent = null;
        this.members = Object.create(null);
        this.complete = false;
        this.fixed = underlying !== null;
        this.setUnderlying(underlying || types.int);
    }
    EnumType.prototype.setUnderlying = function (underlying) {
        this.underlying = underlying;
        this.size = underlying.size;
        this.align = underlying.align;
        this.signed = underlying.signed;
        this.rank = underlying.rank;
        this.num = underlying.num;
    };
    X.EnumType = EnumType;

    // Types of a template pattern: a template parameter, a template-id with
    // dependent arguments, a dependent name (T::type) and a pack expansion.
    X.templateParam = function (name, index, kind) {
        return { kind: 'tparam', name: name, index: index, paramKind: kind, size: 0, align: 1, dependent: true,
                 id: ++counter };
    };

    X.dependentSpecialization = function (template, args) {
        return { kind: 'tspec', template: template, args: args, size: 0, align: 1, dependent: true, id: ++counter };
    };

    // Whether two types are the same; dependent template-ids are not
    // interned and compare by their arguments.
    X.sameType = function (left, right) {
        if (left === right)
            return true;
        if (left === null || right === null || left === undefined || right === undefined)
            return false;
        if ((left.cv || 0) !== (right.cv || 0))
            return false;
        var a = X.unqual(left), b = X.unqual(right);
        if (a === b)
            return true;
        if (a.kind !== b.kind)
            return false;
        switch (a.kind) {
        case 'pointer':
        case 'lref':
        case 'rref':
            return X.sameType(a.to, b.to);
        case 'array':
            return a.length === b.length && X.sameType(a.of, b.of);
        case 'function':
            return a.variadic === b.variadic && (a.cv || 0) === (b.cv || 0) && a.ref === b.ref &&
                a.params.length === b.params.length && X.sameType(a.returns, b.returns) &&
                a.params.every(function (param, index) { return X.sameType(param, b.params[index]); });
        case 'tspec':
            return a.template === b.template && a.args.length === b.args.length &&
                a.args.every(function (arg, index) { return sameArgument(arg, b.args[index]); });
        case 'dependent':
            return a.text === b.text;
        case 'packref':
            return a.pack === b.pack;
        }
        return false;
    };

    function sameArgument(left, right) {
        if (left.kind !== right.kind)
            return false;
        if (left.kind === 'type')
            return X.sameType(left.type, right.type);
        if (left.kind === 'value')
            return T.big.cmp(left.value, right.value) === 0;
        if (left.kind === 'expr')
            return left.node.k === 'name' && right.node.k === 'name' && left.node.entity === right.node.entity &&
                left.node.entity !== undefined;
        return false;
    }

    X.dependentName = function (text) {
        return { kind: 'dependent', text: text, size: 0, align: 1, dependent: true, id: ++counter };
    };

    // --- Predicates

    X.isClass = function (type) {
        return (type.kind === 'struct' || type.kind === 'union') && type.isClass === true;
    };
    X.isRecord = function (type) {
        return type.kind === 'struct' || type.kind === 'union';
    };
    X.isRef = function (type) {
        return type.kind === 'lref' || type.kind === 'rref';
    };
    X.isIntegral = function (type) {
        return type.kind === 'int';
    };
    // Integral or an unscoped enum: what arithmetic takes.
    X.isIntegralLike = function (type) {
        return type.kind === 'int' || (type.kind === 'enum' && !type.scoped);
    };
    X.isFloat = function (type) {
        return type.kind === 'float';
    };
    X.isArithmetic = function (type) {
        return type.kind === 'int' || type.kind === 'float';
    };
    X.isArithmeticLike = function (type) {
        return X.isArithmetic(type) || (type.kind === 'enum' && !type.scoped);
    };
    X.isEnum = function (type) {
        return type.kind === 'enum';
    };
    X.isPointer = function (type) {
        return type.kind === 'pointer';
    };
    X.isScalar = function (type) {
        return type.kind === 'int' || type.kind === 'float' || type.kind === 'enum' || type.kind === 'pointer' ||
            type.kind === 'nullptr';
    };
    X.isVoid = function (type) {
        return type.kind === 'void';
    };
    X.isBool = function (type) {
        return X.unqual(type) === types.bool;
    };
    X.isDependent = function (type) {
        if (type.dependent)
            return true;
        switch (type.kind) {
        case 'pointer':
        case 'lref':
        case 'rref':
            return X.isDependent(type.to);
        case 'array':
            return X.isDependent(type.of);
        case 'function':
            return X.isDependent(type.returns) || type.params.some(X.isDependent);
        }
        return false;
    };

    X.removeRef = function (type) {
        return type.kind === 'lref' || type.kind === 'rref' ? type.to : type;
    };

    // Array to pointer, function to pointer, top-level cv dropped: the type
    // of a value passed by value.
    X.decay = function (type) {
        type = X.removeRef(type);
        if (type.kind === 'array')
            return X.pointerTo(type.of);
        if (type.kind === 'function')
            return X.pointerTo(type);
        return X.unqual(type);
    };

    // Integral promotion.
    X.promote = function (type) {
        type = X.unqual(type);
        if (type.kind === 'enum') {
            if (type.scoped)
                return type;
            return X.promote(type.underlying);
        }
        if (type.kind === 'int' && type.rank < 3)
            return types.int;
        if (type === types.wchar || type === types.char32)
            return type === types.wchar ? types.int : types.uint;
        return type;
    };

    // The usual arithmetic conversions.
    X.commonType = function (left, right) {
        return C.commonType(X.promote(left), X.promote(right));
    };

    X.isComplete = function (type) {
        type = X.unqual(type);
        if (type.kind === 'void')
            return false;
        if (X.isRecord(type) || type.kind === 'enum')
            return type.complete;
        if (type.kind === 'array')
            return type.length !== null && X.isComplete(type.of);
        return true;
    };

    // --- Names (as g++ prints them)

    function cvText(cv) {
        return cv === 3 ? 'const volatile' : (cv === CONST ? 'const' : (cv === VOLATILE ? 'volatile' : ''));
    }

    X.qualifiedName = function (entity) {
        var parts = [entity.name];
        for (var scope = entity.parent; scope !== null && scope !== undefined; scope = scope.parent) {
            if (scope.kind === 'namespace') {
                if (scope.parent === null)
                    break;
                if (!scope.inlineNamespace)
                    parts.unshift(scope.name === null ? '{anonymous}' : scope.name);
            } else if (scope.isClass || scope.kind === 'enum') {
                parts.unshift(scope.name);
            } else if (scope.kind === 'function' && scope.func && scope.func.func) {
                parts.unshift(X.functionSignature(scope.func.func));
                break;
            }
        }
        return parts.join('::');
    };

    X.templateArgsText = function (args) {
        function argumentText(arg) {
            if (arg.kind === 'value')
                return arg.text !== undefined ? arg.text : String(arg.value);
            if (arg.kind === 'pack')
                return arg.items.map(argumentText).join(', ');
            if (arg.kind === 'expr')
                return arg.text;
            return X.typeString(arg.type);
        }
        var text = args.map(argumentText).filter(function (item) { return item !== ''; }).join(', ');
        return '<' + text + (text.charAt(text.length - 1) === '>' ? ' >' : '>');
    };

    function render(type, declarator) {
        var cv = cvText(type.cv || 0);
        switch (type.kind) {
        case 'pointer':
        case 'lref':
        case 'rref': {
            var symbol = type.kind === 'pointer' ? '*' : (type.kind === 'lref' ? '&' : '&&');
            var part = symbol + (cv !== '' ? ' ' + cv : '') + declarator;
            var to = type.to;
            if (to.kind === 'function' || to.kind === 'array')
                part = '(' + part + ')';
            return render(to, part);
        }
        case 'array':
            return render(type.of, declarator + '[' + (type.length === null || type.length < 0 ? '' : type.length) +
                          ']');
        case 'function': {
            var params = type.params.map(function (param) { return X.typeString(param); });
            if (type.variadic)
                params.push('...');
            var suffix = '(' + params.join(', ') + ')';
            if (type.cv)
                suffix += ' ' + cvText(type.cv);
            if (type.ref)
                suffix += ' ' + type.ref;
            var result = render(type.returns, declarator + suffix);
            return declarator === '' ? result.replace(' ' + suffix, suffix) : result;
        }
        }
        var name = baseName(type);
        if (cv !== '')
            name = cv + ' ' + name;
        if (declarator === '')
            return name;
        var first = declarator.charAt(0);
        return first === '*' || first === '&' ? name + declarator : name + ' ' + declarator;
    }

    function baseName(type) {
        switch (type.kind) {
        case 'void':
        case 'int':
        case 'float':
            return GCC_NAMES[type.name] || type.name;
        case 'nullptr':
            return 'std::nullptr_t';
        case 'valist':
            return '__va_list_tag*';
        case 'struct':
        case 'union':
        case 'enum':
            if (type.displayName !== undefined)
                return type.displayName;
            return X.qualifiedName(type);
        case 'tparam':
            return type.name;
        case 'tspec':
            return X.qualifiedName(type.template) + X.templateArgsText(type.args);
        case 'dependent':
            return type.text;
        case 'auto':
            return 'auto';
        case 'packexp':
            return X.typeString(type.pattern) + '...';
        }
        return '?';
    }

    X.typeString = function (type) {
        return render(type, '');
    };

    // f(int, const char*) for messages.
    X.functionSignature = function (func) {
        var name = func.owner && func.owner.isClass ? X.qualifiedName(func.owner) + '::' + func.name
                                                    : func.qualifiedName || func.name;
        var params = func.type.params.map(function (param) { return X.typeString(param); });
        if (func.type.variadic)
            params.push('...');
        return name + '(' + params.join(', ') + ')' + (func.type.cv & CONST ? ' const' : '');
    };

    // --- The Itanium mangling of types (std::type_info::name)

    var MANGLED = {
        'void': 'v', '_Bool': 'b', 'char': 'c', 'signed char': 'a', 'unsigned char': 'h', 'short': 's',
        'unsigned short': 't', 'int': 'i', 'unsigned int': 'j', 'long': 'l', 'unsigned long': 'm', 'long long': 'x',
        'unsigned long long': 'y', 'float': 'f', 'double': 'd', 'long double': 'e', 'wchar_t': 'w',
        'char16_t': 'Ds', 'char32_t': 'Di'
    };

    function mangleName(entity) {
        var parts = [];
        for (var scope = entity; scope !== null && scope !== undefined; scope = scope.parent) {
            if (scope.kind === 'namespace') {
                if (scope.parent === null)
                    break;
                if (!scope.inlineNamespace)
                    parts.unshift(scope.name === null ? '12_GLOBAL__N_1' : scope.name.length + scope.name);
            } else if (scope.isClass || scope.kind === 'enum') {
                var name = scope.template !== null && scope.template !== undefined ? scope.template.name : scope.name;
                var text = name.length + name;
                if (scope.templateArgs)
                    text += 'I' + scope.templateArgs.map(mangleArgument).join('') + 'E';
                parts.unshift(text);
            } else {
                break;
            }
        }
        if (parts.length === 1)
            return parts[0];
        if (parts[0] === '3std')
            return parts.length === 2 ? 'St' + parts[1] : 'NSt' + parts.slice(1).join('') + 'E';
        return 'N' + parts.join('') + 'E';
    }

    // A template argument: L<type><value>E for a value, J...E for a pack.
    function mangleArgument(arg) {
        if (arg.kind === 'pack')
            return 'J' + arg.items.map(mangleArgument).join('') + 'E';
        if (arg.kind === 'value') {
            var text = typeof arg.value === 'number' ? String(arg.value) : T.big.str(arg.value);
            return 'L' + X.mangle(X.unqual(arg.type || X.types.int)) + (text.charAt(0) === '-' ? 'n' + text.substring(1)
                                                                                                : text) + 'E';
        }
        return X.mangle(arg.type);
    }

    X.mangle = function (type) {
        var cv = type.cv || 0;
        var prefix = (cv & VOLATILE ? 'V' : '') + (cv & CONST ? 'K' : '');
        switch (type.kind) {
        case 'pointer':
            return prefix + 'P' + X.mangle(type.to);
        case 'lref':
            return 'R' + X.mangle(type.to);
        case 'rref':
            return 'O' + X.mangle(type.to);
        case 'array':
            return 'A' + (type.length === null ? '' : type.length) + '_' + X.mangle(type.of);
        case 'function':
            var params = type.params.length === 0 ? 'v' : type.params.map(X.mangle).join('');
            return 'F' + X.mangle(type.returns) + params + 'E';
        case 'nullptr':
            return 'Dn';
        case 'struct':
        case 'union':
        case 'enum':
            return prefix + mangleName(type);
        }
        return prefix + (MANGLED[type.name] || 'v');
    };
})(globalThis);
