// Pascal: the System unit - standard types, constants, variables
// (RandSeed, Output...), built-in routines, host modules, TObject (its
// Pascal source is below).
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.createSystemScope)
        return;

    var J = T.J;
    var t = Pascal.t;
    var types = Pascal.types;
    var big = T.big;
    var Value = Pascal.Value;
    var builtins = Pascal.builtins;

    var INTEGER_BY_MODE = function (switches) {
        return switches.mode === 'objfpc' || switches.mode === 'delphi' ? t.longint : t.smallint;
    };

    // The System scope: types, constants, built-in routines.
    Pascal.createSystemScope = function () {
        var scope = new Pascal.Scope('system', null);
        function type(name, value) {
            scope.define(name.toLowerCase(), { kind: 'type', name: name.toLowerCase(), text: name, type: value });
        }
        function constant(name, value, constant) {
            scope.define(name.toLowerCase(), { kind: 'const', name: name.toLowerCase(), text: name, type: value, value: constant });
        }
        scope.define('integer', { kind: 'type', name: 'integer', text: 'Integer', type: t.longint, byMode: INTEGER_BY_MODE });
        // string(x) and file - casts to keyword types.
        scope.define('string', { kind: 'type', name: 'string', text: 'string', type: t.ansistring,
                                 byMode: function (switches) { return switches.H ? t.ansistring : t.shortstring; } });
        scope.define('file', { kind: 'type', name: 'file', text: 'file', type: t.file });
        type('LongInt', t.longint);
        type('ShortInt', t.shortint);
        type('SmallInt', t.smallint);
        type('Byte', t.byte);
        type('Word', t.word);
        type('Cardinal', t.cardinal);
        type('LongWord', t.cardinal);
        type('DWord', t.cardinal);
        type('Int64', t.int64);
        type('QWord', t.qword);
        type('UInt64', t.qword);
        type('NativeInt', t.int64);
        type('NativeUInt', t.qword);
        type('SizeInt', t.int64);
        type('SizeUInt', t.qword);
        type('PtrInt', t.int64);
        type('PtrUInt', t.qword);
        type('Int8', t.shortint);
        type('Int16', t.smallint);
        type('Int32', t.longint);
        type('UInt8', t.byte);
        type('UInt16', t.word);
        type('UInt32', t.cardinal);
        type('Boolean', t.boolean);
        type('ByteBool', t.bytebool);
        type('WordBool', t.wordbool);
        type('LongBool', t.longbool);
        type('Boolean8', t.boolean);
        type('Boolean16', t.wordbool);
        type('Boolean32', t.longbool);
        type('Char', t.char);
        type('AnsiChar', t.char);
        type('WideChar', t.widechar);
        type('UnicodeChar', t.widechar);
        type('Real', t.double);
        type('Single', t.single);
        type('Double', t.double);
        type('Extended', t.extended);
        type('ValReal', t.extended);
        type('Comp', t.comp);
        type('Currency', t.currency);
        type('AnsiString', t.ansistring);
        type('ShortString', t.shortstring);
        type('UnicodeString', t.ansistring);
        type('WideString', t.ansistring);
        type('RawByteString', t.ansistring);
        type('UTF8String', t.ansistring);
        type('Pointer', t.pointer);
        type('Text', t.text);
        type('TextFile', t.text);
        type('JSValue', t.js);
        type('Variant', t.js);
        type('PInteger', new Pascal.Type('pointer', { name: 'PInteger', to: t.longint, size: 8 }));
        type('PLongInt', new Pascal.Type('pointer', { name: 'PLongInt', to: t.longint, size: 8 }));
        type('PByte', new Pascal.Type('pointer', { name: 'PByte', to: t.byte, size: 8 }));
        type('PDouble', new Pascal.Type('pointer', { name: 'PDouble', to: t.double, size: 8 }));
        type('PString', new Pascal.Type('pointer', { name: 'PString', to: t.ansistring, size: 8 }));
        type('PBoolean', new Pascal.Type('pointer', { name: 'PBoolean', to: t.boolean, size: 8 }));
        type('PInt64', new Pascal.Type('pointer', { name: 'PInt64', to: t.int64, size: 8 }));
        type('PWord', new Pascal.Type('pointer', { name: 'PWord', to: t.word, size: 8 }));
        type('PSingle', new Pascal.Type('pointer', { name: 'PSingle', to: t.single, size: 8 }));
        type('PExtended', new Pascal.Type('pointer', { name: 'PExtended', to: t.extended, size: 8 }));
        type('PPointer', new Pascal.Type('pointer', { name: 'PPointer', to: t.pointer, size: 8 }));
        constant('True', t.boolean, true);
        constant('False', t.boolean, false);
        constant('MaxLongInt', t.longint, 2147483647);
        constant('MaxSmallInt', t.smallint, 32767);
        constant('MaxShortInt', t.shortint, 127);
        constant('MaxByte', t.byte, 255);
        constant('MaxWord', t.word, 65535);
        constant('MaxCardinal', t.cardinal, 4294967295);
        constant('MaxUIntValue', t.qword, t.qword.hi);
        constant('MaxSIntValue', t.int64, t.int64.hi);
        constant('MaxInt64', t.int64, t.int64.hi);
        constant('MinInt64', t.int64, t.int64.lo);
        constant('LineEnding', t.char, 10);
        constant('DirectorySeparator', t.char, 47);
        constant('PathDelim', t.char, 47);
        constant('PathSeparator', t.char, 58);
        constant('DriveSeparator', t.char, 0);
        constant('MaxPathLen', t.longint, 4096);
        // MaxInt is High(Integer) by the mode.
        scope.define('maxint', { kind: 'const', name: 'maxint', text: 'MaxInt', type: t.longint, value: 2147483647,
                                 byModeConst: function (switches) { return INTEGER_BY_MODE(switches) === t.longint ? 2147483647 : 32767; } });
        // Built-in routines.
        Object.keys(builtins).forEach(function (name) {
            scope.define(name, { kind: 'builtin', name: name, text: name, handler: builtins[name] });
        });
        // The variables of System.
        function variable(name, value) {
            scope.define(name.toLowerCase(), { kind: 'var', storage: 'global', name: name.toLowerCase(), text: name, type: value,
                                               js: 'system$' + name.toLowerCase() });
        }
        variable('RandSeed', t.cardinal);
        variable('ExitCode', t.longint);
        variable('Output', t.text);
        variable('Input', t.text);
        variable('ErrOutput', t.text);
        variable('StdOut', t.text);
        variable('StdErr', t.text);
        variable('FileMode', t.byte);
        // vtInteger... for array of const.
        var vt = ['vtInteger', 'vtBoolean', 'vtChar', 'vtExtended', 'vtString', 'vtPointer', 'vtPChar', 'vtObject', 'vtClass',
                  'vtWideChar', 'vtPWideChar', 'vtAnsiString', 'vtCurrency', 'vtVariant', 'vtInterface', 'vtWideString',
                  'vtInt64', 'vtQWord', 'vtUnicodeString'];
        vt.forEach(function (name, index) { constant(name, t.byte, index); });
        return scope;
    };

    // The values of the System variables in $V.
    Pascal.initSystemVariables = function (rt, variables) {
        variables.system$randseed = 0;
        variables.system$exitcode = 0;
        variables.system$output = rt.consoleFile('output');
        variables.system$stdout = variables.system$output;
        variables.system$input = rt.input();
        variables.system$errorput = null;
        variables.system$erroutput = rt.consoleFile('error');
        variables.system$stderr = variables.system$erroutput;
        variables.system$filemode = 2;
    };

    // MaxInt by the mode: the constant is substituted on lookup.
    var symbolValue = Pascal.Compiler.prototype.symbolValue;
    Pascal.Compiler.prototype.symbolValue = function (symbol, node, expected, asCallee) {
        if (symbol.kind === 'const' && symbol.byModeConst !== undefined) {
            var value = symbol.byModeConst(this.switches(node));
            return this.constValue(value === 32767 ? t.smallint : t.longint, value, node);
        }
        return symbolValue.call(this, symbol, node, expected, asCallee);
    };

    // --- JavaScript

    function def(name, handler) {
        builtins[name] = handler;
    }

    function jsArgs(compiler, args) {
        return args.map(function (arg) {
            return compiler.toJs(compiler.compileValue(arg), arg).node;
        });
    }

    def('js', function (args, node) {
        if (args.length > 0)
            return this.callJs(new Value(t.js, J.mem(J.id('$R'), 'global')), args, node);
        return new Value(t.js, J.mem(J.id('$R'), 'global'));
    });
    def('jsarray', function (args) {
        return new Value(t.js, J.arr(jsArgs(this, args)));
    });
    def('jsobject', function (args, node) {
        if (args.length > 0)
            this.error('Wrong number of parameters specified for call to "JSObject"', node);
        return new Value(t.js, J.obj([]));
    });
    def('jsnew', function (args, node) {
        if (args.length < 1)
            this.error('Wrong number of parameters specified for call to "JSNew"', node);
        var values = jsArgs(this, args);
        return new Value(t.js, this.rt('jnew', [values[0], J.arr(values.slice(1))]));
    });
    def('jsfunction', function (args, node) {
        if (args.length !== 1)
            this.error('Wrong number of parameters specified for call to "JSFunction"', node);
        var value = this.compileExpr(args[0]);
        if (value.kind === 'routine') {
            var proc = value.symbol.procs[0];
            value = new Value(this.routineType(proc), this.routineNode(proc, null));
        } else {
            value = this.toValue(value, args[0]);
        }
        if (value.type.kind !== 'proc')
            this.error('Procedure expected', args[0]);
        return new Value(t.js, this.rt('jfunction', [value.node, this.typeRef(value.type)]));
    });
    def('jsnull', function (args, node) {
        if (args.length > 0)
            this.error('Wrong number of parameters specified for call to "JSNull"', node);
        return new Value(t.js, J.nul());
    });
    def('jsundefined', function (args, node) {
        if (args.length > 0)
            this.error('Wrong number of parameters specified for call to "JSUndefined"', node);
        return new Value(t.js, J.undef());
    });
    def('jsisnull', function (args, node) {
        if (args.length !== 1)
            this.error('Wrong number of parameters specified for call to "JSIsNull"', node);
        var value = this.compileValue(args[0]);
        return new Value(t.boolean, J.bin('==', this.toJs(value, args[0]).node, J.nul()));
    });
    def('jstypeof', function (args, node) {
        if (args.length !== 1)
            this.error('Wrong number of parameters specified for call to "JSTypeOf"', node);
        var value = this.toJs(this.compileValue(args[0]), args[0]).node;
        var name = this.temp();
        return new Value(t.ansistring, J.cond(J.bin('===', J.assign(J.id(name), value), J.nul()), J.str('null'), J.un('typeof', J.id(name))));
    });

    // --- TObject: the source is in Pascal; ClassName and others in JavaScript.

    Pascal.SYSTEM_SOURCE = [
        'unit System;',
        'interface',
        'type',
        '  TObject = class;',
        '  TClass = class of TObject;',
        '  TObject = class',
        '  public',
        '    constructor Create;',
        '    destructor Destroy; virtual;',
        '    procedure Free;',
        '    procedure AfterConstruction; virtual;',
        '    procedure BeforeDestruction; virtual;',
        '    class function ClassName: string; external;',
        '    class function ClassType: TClass; external;',
        '    class function ClassParent: TClass; external;',
        '    class function ClassNameIs(const Name: string): Boolean;',
        '    class function InheritsFrom(AClass: TClass): Boolean; external;',
        '    class function InstanceSize: LongInt; external;',
        '    class function UnitName: string; external;',
        '    function ToString: string; virtual;',
        '    function Equals(Obj: TObject): Boolean; virtual;',
        '    function GetHashCode: PtrInt; virtual; external;',
        '  end;',
        '  TVarRec = record',
        '    VType: Byte;',
        '    V: JSValue;',
        '  end;',
        'implementation',
        'constructor TObject.Create; begin end;',
        'destructor TObject.Destroy; begin end;',
        'procedure TObject.Free; begin if Self <> nil then Destroy; end;',
        'procedure TObject.AfterConstruction; begin end;',
        'procedure TObject.BeforeDestruction; begin end;',
        'class function TObject.ClassNameIs(const Name: string): Boolean;',
        'begin Result := LowerCase(Name) = LowerCase(ClassName); end;',
        'function TObject.ToString: string; begin Result := ClassName; end;',
        'function TObject.Equals(Obj: TObject): Boolean; begin Result := Obj = Self; end;',
        'end.'
    ].join('\n');

    var hashCounter = 0;

    Pascal.systemNatives = function (rt) {
        var utf8 = T.utf8;
        return {
            methods: {
                'tobject.classname': function () { return utf8.encode(this.$name); },
                'tobject.classtype': function () { return this; },
                'tobject.classparent': function () { return this.$parent || null; },
                'tobject.inheritsfrom': function (other) { return rt.inheritsFrom(this, other); },
                'tobject.instancesize': function () { return 8; },
                'tobject.unitname': function () { return this.$unit || ''; },
                'tobject.gethashcode': function () {
                    if (this.$hash === undefined)
                        Object.defineProperty(this, '$hash', { value: ++hashCounter, enumerable: false });
                    return this.$hash;
                }
            },
            routines: {}
        };
    };
    void types;
    void big;
})(globalThis);
