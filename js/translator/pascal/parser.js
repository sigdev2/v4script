// Pascal: parsing declarations and types. A unit of code is a program
// (program), a Pascal unit (unit) or a "script": declaration sections and
// statements mixed, as in one program. Statements and expressions are in
// parser-statements.js. The tree nodes are described in
// docs/internals/pascal.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Pascal = T.pascal;
    if (Pascal.Parser)
        return;

    var CompileError = T.CompileError;

    // Routine directives: name -> whether it has an argument.
    var ROUTINE_DIRECTIVES = {
        overload: false, forward: false, inline: false, virtual: false, override: false, abstract: false,
        reintroduce: false, 'static': false, dynamic: false, cdecl: false, stdcall: false, register: false,
        pascal: false, safecall: false, assembler: false, platform: false, experimental: false, deprecated: 'opt',
        unimplemented: false, 'export': false, external: 'external', 'public': 'public', alias: 'alias',
        message: 'arg', nostackframe: false, noreturn: false, iocheck: false, local: false, far: false, near: false,
        varargs: false, 'final': false, dispid: 'arg', winapi: false, compilerproc: false, cppdecl: false,
        mwpascal: false, interrupt: false, sealed: false, enumerator: 'name', vectorcall: false, ms_abi_default: false,
        sysv_abi_default: false, oldfpccall: false, softfloat: false, saveregisters: false, 'nested': false
    };

    var VISIBILITY = { 'private': true, 'protected': true, 'public': true, 'published': true, automated: true };

    function Parser(tokens, source, options) {
        T.Parser.call(this, tokens, source);
        this.options = options || {};
        this.switches = Object.assign({}, this.options.switches || Pascal.DEFAULT_SWITCHES);
        this.skipDirectives();
    }
    Parser.prototype = Object.create(T.Parser.prototype);
    Parser.prototype.constructor = Parser;
    Pascal.Parser = Parser;

    // Directive tokens change the switches and do not go into the tree.
    Parser.prototype.skipDirectives = function () {
        while (this.index < this.tokens.length && this.tokens[this.index].type === 'directive') {
            this.switches = Object.assign({}, this.switches, this.tokens[this.index].value);
            ++this.index;
        }
    };
    Parser.prototype.next = function () {
        var token = T.Parser.prototype.next.call(this);
        this.skipDirectives();
        return token;
    };
    Parser.prototype.peek = function (offset) {
        if (!offset)
            return this.tokens[this.index < this.tokens.length ? this.index : this.tokens.length - 1];
        var index = this.index;
        for (var step = 0; step < offset; ++step) {
            ++index;
            while (index < this.tokens.length && this.tokens[index].type === 'directive')
                ++index;
        }
        return this.tokens[index < this.tokens.length ? index : this.tokens.length - 1];
    };

    // A name token with this text (not a keyword): directives, on, out...
    Parser.prototype.isWord = function (word, offset) {
        var token = this.peek(offset);
        return token.type === 'ident' && token.value === word;
    };
    Parser.prototype.acceptWord = function (word) {
        if (this.isWord(word))
            return this.next();
        return null;
    };
    Parser.prototype.isIdent = function (offset) {
        return this.peek(offset).type === 'ident';
    };
    Parser.prototype.ident = function (what) {
        var token = this.peek();
        if (token.type !== 'ident')
            this.fail((what || 'identifier') + ' expected but ' + this.describe(token) + ' found');
        this.next();
        return token;
    };
    Parser.prototype.expect = function (text, what) {
        if (!this.is(text))
            this.fail('"' + (what || text) + '" expected but ' + this.describe(this.peek()) + ' found');
        return this.next();
    };
    Parser.prototype.describe = function (token) {
        if (token.type === 'eof')
            return 'end of file';
        if (token.type === 'ident')
            return 'identifier "' + token.text.toUpperCase() + '"';
        if (token.type === 'string')
            return 'constant string';
        if (token.type === 'int' || token.type === 'real')
            return 'ordinal const';
        return '"' + token.text.toUpperCase() + '"';
    };
    Parser.prototype.fail = function (message, token) {
        token = token || this.peek();
        throw new CompileError('Syntax error, ' + message, token.line, token.column, token.source || this.source);
    };
    Parser.prototype.error = function (message, token) {
        token = token || this.peek();
        throw new CompileError(message, token.line, token.column, token.source || this.source);
    };
    Parser.prototype.at = function (node, token) {
        node.line = token.line;
        node.column = token.column;
        node.source = token.source;
        node.sw = this.switches;
        return node;
    };

    // --- File

    Parser.prototype.parseFile = function () {
        var start = this.peek();
        if (this.is('unit'))
            return this.parseUnit();
        if (this.is('library'))
            this.error('libraries are not supported');
        var file = this.at({ k: 'program', name: null, items: [], ended: false }, start);
        if (this.accept('program')) {
            file.name = this.ident('program name').text;
            if (this.accept('(')) {
                do {
                    this.ident();
                } while (this.accept(','));
                this.expect(')');
            }
            this.expect(';');
        }
        this.parseItems(file.items, file);
        return file;
    };

    // Declarations and statements up to the end of the file or "end.".
    Parser.prototype.parseItems = function (items, file) {
        while (this.peek().type !== 'eof') {
            var token = this.peek();
            if (this.parseDeclaration(items, true))
                continue;
            if (this.accept(';'))
                continue;
            var statement = this.parseStatement();
            // begin ... end. - the end of the program; the text after the point is not read.
            if (statement.k === 'block' && this.is('.')) {
                this.next();
                items.push(this.at({ k: 'main', body: statement }, token));
                file.ended = true;
                return;
            }
            items.push(this.at({ k: 'stmt', statement: statement }, token));
            if (this.peek().type !== 'eof' && !this.is(';'))
                this.fail('";" expected but ' + this.describe(this.peek()) + ' found');
        }
    };

    Parser.prototype.parseUnit = function () {
        var start = this.next();
        var unit = this.at({ k: 'unit', name: this.ident('unit name').text, interfaceItems: [], implementationItems: [],
                             initialization: null, finalization: null }, start);
        this.expect(';');
        this.expect('interface');
        while (!this.is('implementation') && this.peek().type !== 'eof') {
            if (!this.parseDeclaration(unit.interfaceItems, false, true))
                this.fail('"implementation" expected but ' + this.describe(this.peek()) + ' found');
        }
        this.expect('implementation');
        while (!this.is('end') && !this.is('initialization') && !this.is('begin') && !this.is('finalization') &&
               this.peek().type !== 'eof') {
            if (!this.parseDeclaration(unit.implementationItems, true))
                this.fail('"end" expected but ' + this.describe(this.peek()) + ' found');
        }
        if (this.accept('initialization') || this.accept('begin'))
            unit.initialization = this.parseStatementList(['finalization', 'end']);
        if (this.accept('finalization'))
            unit.finalization = this.parseStatementList(['end']);
        this.expect('end');
        this.expect('.');
        return unit;
    };

    // A declaration section; false - there is no declaration here.
    Parser.prototype.parseDeclaration = function (items, withBodies, headingsOnly) {
        var token = this.peek();
        if (token.type === 'keyword') {
            switch (token.value) {
            case 'uses':
                items.push(this.parseUses());
                return true;
            case 'label':
                items.push(this.parseLabels());
                return true;
            case 'const':
            case 'resourcestring':
                items.push(this.parseConstSection());
                return true;
            case 'type':
                items.push(this.parseTypeSection());
                return true;
            case 'var':
            case 'threadvar':
                items.push(this.parseVarSection());
                return true;
            case 'procedure':
            case 'function':
            case 'constructor':
            case 'destructor':
            case 'operator':
                items.push(this.parseRoutine(!headingsOnly && withBodies));
                return true;
            case 'class':
                if (this.peek(1).type === 'keyword' && /^(procedure|function|constructor|destructor|operator)$/.test(this.peek(1).value)) {
                    items.push(this.parseRoutine(!headingsOnly && withBodies));
                    return true;
                }
                return false;
            }
        }
        if (this.isWord('generic'))
            this.error('generics are not supported yet');
        return false;
    };

    Parser.prototype.parseUses = function () {
        var start = this.next();
        var node = this.at({ k: 'uses', units: [] }, start);
        do {
            var name = this.ident('unit name');
            var text = name.text;
            // A name with dots: System.SysUtils.
            while (this.is('.')) {
                this.next();
                var part = this.ident();
                text += '.' + part.text;
            }
            var unit = this.at({ name: text.toLowerCase(), text: text, file: null }, name);
            if (this.accept('in')) {
                var file = this.peek();
                if (file.type !== 'string')
                    this.fail('string expected');
                this.next();
                unit.file = file.value;
            }
            node.units.push(unit);
        } while (this.accept(','));
        this.expect(';');
        return node;
    };

    Parser.prototype.parseLabels = function () {
        var start = this.next();
        var node = this.at({ k: 'label', labels: [] }, start);
        do {
            var token = this.peek();
            if (token.type !== 'ident' && token.type !== 'int')
                this.fail('label expected');
            this.next();
            node.labels.push(this.at({ name: labelName(token), text: token.text }, token));
        } while (this.accept(','));
        this.expect(';');
        return node;
    };

    function labelName(token) {
        return token.type === 'int' ? String(T.big.str(token.value)) : token.value;
    }
    Pascal.labelName = labelName;

    Parser.prototype.parseConstSection = function () {
        var start = this.next();
        var resource = start.value === 'resourcestring';
        var node = this.at({ k: 'consts', list: [] }, start);
        do {
            var name = this.ident();
            var item = this.at({ k: 'const', name: name.value, text: name.text, typeNode: null, value: null, resource: resource }, name);
            if (this.accept(':')) {
                item.typeNode = this.parseType();
                this.expect('=');
                item.value = this.parseTypedValue();
            } else {
                this.expect('=');
                item.value = this.parseExpression();
            }
            this.skipHints();
            this.expect(';');
            node.list.push(item);
        } while (this.sectionContinues(['=', ':']));
        return node;
    };

    // The declaration section goes on: a name followed by "=", ":" or ",".
    // In a script statements may follow the section (x := 1).
    Parser.prototype.sectionContinues = function (operators) {
        if (!this.isIdent())
            return false;
        var next = this.peek(1);
        return next.type === 'op' && operators.indexOf(next.value) >= 0;
    };

    // deprecated, platform, experimental after declarations.
    Parser.prototype.skipHints = function () {
        while (this.isWord('deprecated') || this.isWord('platform') || this.isWord('experimental') ||
               this.isWord('unimplemented')) {
            this.next();
            if (this.peek().type === 'string')
                this.next();
        }
    };

    // The value of a typed constant: an expression, (a, b) - an array,
    // (field: value; ...) - a record.
    Parser.prototype.parseTypedValue = function () {
        var start = this.peek();
        if (!this.is('('))
            return this.parseExpression();
        // A record: "(name:", an array - a list separated by commas; one
        // expression in parentheses may go on with an operator.
        if (this.isIdent(1) && this.peek(2).type === 'op' && this.peek(2).value === ':') {
            this.next();
            var record = this.at({ k: 'recordvalue', fields: [] }, start);
            while (!this.is(')')) {
                var field = this.ident('field name');
                this.expect(':');
                record.fields.push(this.at({ name: field.value, text: field.text, value: this.parseTypedValue() }, field));
                if (!this.accept(';'))
                    break;
            }
            this.expect(')');
            return record;
        }
        this.next();
        var items = [];
        if (!this.is(')')) {
            do {
                items.push(this.parseTypedValue());
            } while (this.accept(','));
        }
        this.expect(')');
        if (items.length === 1 && this.continuesExpression())
            return this.parseExpressionFrom(this.at({ k: 'paren', expr: items[0] }, start));
        return this.at({ k: 'tuple', items: items }, start);
    };

    Parser.prototype.continuesExpression = function () {
        var token = this.peek();
        if (token.type === 'op')
            return /^(\+|-|\*|\/|=|<>|<|>|<=|>=|\*\*|><|\.|\^|\[)$/.test(token.value);
        return token.type === 'keyword' && /^(div|mod|and|or|xor|shl|shr|in|is|as)$/.test(token.value);
    };

    Parser.prototype.parseTypeSection = function () {
        var start = this.next();
        var node = this.at({ k: 'types', list: [] }, start);
        do {
            if (this.isWord('generic'))
                this.error('generics are not supported yet');
            var name = this.ident();
            if (this.is('<'))
                this.error('generics are not supported yet');
            this.expect('=');
            var item = this.at({ k: 'type', name: name.value, text: name.text, typeNode: null }, name);
            // "type TFoo = type Integer" - a new type of the same kind.
            this.accept('type');
            item.typeNode = this.parseType(item);
            this.skipHints();
            this.expect(';');
            node.list.push(item);
        } while (this.sectionContinues(['=']) || this.isWord('generic'));
        return node;
    };

    Parser.prototype.parseVarSection = function () {
        var start = this.next();
        var node = this.at({ k: 'vars', list: [] }, start);
        do {
            node.list.push(this.parseVarDeclaration(false));
        } while (this.sectionContinues([',', ':']));
        return node;
    };

    Parser.prototype.parseVarDeclaration = function (field) {
        var first = this.peek();
        var names = this.parseNameList();
        this.expect(':');
        var item = this.at({ k: 'var', names: names, typeNode: this.parseType(), init: null, absolute: null }, first);
        if (!field) {
            if (this.acceptWord('absolute'))
                item.absolute = this.parseExpression();
            else if (this.accept('='))
                item.init = this.parseTypedValue();
            this.skipHints();
            // "cvar", "external" - for the variables of C libraries.
            while (this.isWord('cvar') || this.isWord('external') || this.isWord('public') || this.isWord('export')) {
                this.next();
                if (this.peek().type === 'string')
                    this.next();
                this.accept(';');
            }
            if (!this.is(';') && names.length > 0)
                this.expect(';');
            this.accept(';');
        }
        return item;
    };

    Parser.prototype.parseNameList = function () {
        var names = [];
        do {
            var token = this.ident();
            names.push(this.at({ name: token.value, text: token.text }, token));
        } while (this.accept(','));
        return names;
    };

    // --- Types

    Parser.prototype.parseType = function (declaration) {
        var start = this.peek();
        if (start.type === 'keyword') {
            switch (start.value) {
            case 'packed':
                this.next();
                if (!this.is('array') && !this.is('record') && !this.is('set') && !this.is('file') && !this.is('object') &&
                    !this.is('class'))
                    this.fail('"ARRAY" expected but ' + this.describe(this.peek()) + ' found');
                var packed = this.parseType(declaration);
                packed.packed = true;
                return packed;
            case 'array':
                return this.parseArrayType();
            case 'record':
                return this.parseRecordType();
            case 'set':
                this.next();
                this.expect('of');
                return this.at({ k: 'set', of: this.parseType() }, start);
            case 'file':
                this.next();
                if (this.accept('of'))
                    return this.at({ k: 'file', of: this.parseType() }, start);
                return this.at({ k: 'file', of: null }, start);
            case 'string':
                this.next();
                if (this.accept('[')) {
                    var size = this.parseExpression();
                    this.expect(']');
                    return this.at({ k: 'string', size: size }, start);
                }
                return this.at({ k: 'string', size: null }, start);
            case 'procedure':
            case 'function':
                return this.parseProcedureType();
            case 'class':
                this.next();
                if (this.accept('of'))
                    return this.at({ k: 'classref', of: this.parseType() }, start);
                return this.parseClassBody(start, 'class', declaration);
            case 'object':
                this.next();
                return this.parseClassBody(start, 'object', declaration);
            case 'interface':
            case 'dispinterface':
                this.error('interfaces are not supported yet');
            }
        }
        if (this.is('^')) {
            this.next();
            return this.at({ k: 'pointer', to: this.parseType() }, start);
        }
        if (this.is('(')) {
            this.next();
            var items = [];
            do {
                var name = this.ident();
                var item = this.at({ name: name.value, text: name.text, value: null }, name);
                if (this.accept(':=') || this.accept('='))
                    item.value = this.parseExpression();
                items.push(item);
            } while (this.accept(','));
            this.expect(')');
            return this.at({ k: 'enum', items: items }, start);
        }
        if (this.isWord('specialize'))
            this.error('generics are not supported yet');
        if (this.isWord('bitpacked')) {
            this.next();
            var bitpacked = this.parseType(declaration);
            bitpacked.packed = true;
            return bitpacked;
        }
        if (this.isWord('reference') && this.peek(1).type === 'keyword' && this.peek(1).value === 'to')
            this.error('anonymous functions are not supported');
        // A type name or a subrange (expression .. expression).
        if (start.type === 'ident' && !this.isRangeAhead()) {
            this.next();
            var node = this.at({ k: 'name', name: start.value, text: start.text, unit: null }, start);
            if (this.is('.') && this.isIdent(1)) {
                this.next();
                var member = this.ident();
                node = this.at({ k: 'name', name: member.value, text: member.text, unit: start.value }, member);
            }
            if (this.is('<'))
                this.error('generics are not supported yet');
            return node;
        }
        var lo = this.parseExpression();
        this.expect('..');
        var hi = this.parseExpression();
        return this.at({ k: 'subrange', lo: lo, hi: hi }, start);
    };

    // A name at the start of a subrange: "Low(x)..10", "a.b..c".
    Parser.prototype.isRangeAhead = function () {
        var depth = 0;
        for (var index = this.index; index < this.tokens.length; ++index) {
            var token = this.tokens[index];
            if (token.type === 'directive')
                continue;
            if (token.type === 'op') {
                if (token.value === '(' || token.value === '[')
                    ++depth;
                else if (token.value === ')' || token.value === ']') {
                    if (--depth < 0)
                        return false;
                } else if (token.value === '..' && depth === 0) {
                    return true;
                } else if ((token.value === ';' || token.value === '=' || token.value === ',') && depth === 0) {
                    return false;
                }
            } else if (token.type === 'keyword' && depth === 0 && token.value !== 'div' && token.value !== 'mod' &&
                       token.value !== 'shl' && token.value !== 'shr' && token.value !== 'and' && token.value !== 'or' &&
                       token.value !== 'xor' && token.value !== 'not') {
                return false;
            } else if (token.type === 'eof') {
                return false;
            }
        }
        return false;
    };

    Parser.prototype.parseArrayType = function () {
        var start = this.next();
        if (this.accept('[')) {
            var indexes = [];
            do {
                indexes.push(this.parseType());
            } while (this.accept(','));
            this.expect(']');
            this.expect('of');
            return this.at({ k: 'array', indexes: indexes, of: this.parseType() }, start);
        }
        this.expect('of');
        if (this.is('const')) {
            this.next();
            return this.at({ k: 'arrayofconst' }, start);
        }
        return this.at({ k: 'dynarray', of: this.parseType() }, start);
    };

    Parser.prototype.parseRecordType = function () {
        var start = this.next();
        var node = this.at({ k: 'record', fields: [], variant: null, members: [] }, start);
        this.parseFieldList(node, ['end']);
        this.expect('end');
        return node;
    };

    // Record fields and the variant part (case).
    Parser.prototype.parseFieldList = function (node, terminators) {
        var visibility = 'public';
        while (!this.isAny(terminators) && this.peek().type !== 'eof') {
            if (this.is('case')) {
                node.variant = this.parseVariantPart(terminators);
                return;
            }
            if (this.isVisibility()) {
                visibility = this.parseVisibility();
                continue;
            }
            if (this.is('procedure') || this.is('function') || this.is('constructor') || this.is('destructor') ||
                this.is('property') || (this.is('class') && !this.isIdent(1))) {
                // Records with methods ({$modeswitch advancedrecords}).
                node.advanced = true;
                this.parseClassMember(node, visibility);
                continue;
            }
            if (this.is('const') || this.is('type') || this.is('var')) {
                node.advanced = true;
                this.parseClassMember(node, visibility);
                continue;
            }
            var field = this.parseVarDeclaration(true);
            field.visibility = visibility;
            node.fields.push(field);
            if (!this.accept(';'))
                break;
        }
    };

    Parser.prototype.isAny = function (words) {
        for (var index = 0; index < words.length; ++index) {
            if (this.is(words[index]))
                return true;
        }
        return false;
    };

    Parser.prototype.parseVariantPart = function (terminators) {
        var start = this.next();
        var variant = this.at({ tagName: null, tagText: null, tagType: null, cases: [] }, start);
        var first = this.ident();
        if (this.accept(':')) {
            variant.tagName = first.value;
            variant.tagText = first.text;
            variant.tagType = this.parseType();
        } else {
            variant.tagType = this.at({ k: 'name', name: first.value, text: first.text, unit: null }, first);
        }
        this.expect('of');
        while (!this.isAny(terminators) && !this.is(')') && this.peek().type !== 'eof') {
            var labels = [];
            do {
                labels.push(this.parseExpression());
                if (this.accept('..'))
                    labels[labels.length - 1] = { lo: labels[labels.length - 1], hi: this.parseExpression() };
            } while (this.accept(','));
            this.expect(':');
            this.expect('(');
            var part = { fields: [], variant: null, labels: labels };
            this.parseFieldList(part, [')']);
            this.expect(')');
            variant.cases.push(part);
            if (!this.accept(';'))
                break;
        }
        return variant;
    };

    Parser.prototype.parseProcedureType = function () {
        var start = this.next();
        var node = this.at({ k: 'proctype', kind: start.value, params: [], resultType: null, ofObject: false, isNested: false }, start);
        if (this.is('('))
            node.params = this.parseParameters();
        if (start.value === 'function') {
            this.expect(':');
            node.resultType = this.parseResultType();
        }
        if (this.is('of') && this.peek(1).type === 'keyword' && this.peek(1).value === 'object') {
            this.next();
            this.next();
            node.ofObject = true;
        } else if (this.isWord('is') || (this.is('is') && this.isWord('nested', 1))) {
            this.next();
            this.next();
            node.isNested = true;
        }
        // Calling conventions after ";" in a type declaration.
        while (this.is(';') && this.peek(1).type === 'ident' &&
               /^(cdecl|stdcall|register|pascal|safecall|winapi|varargs|far|near)$/.test(this.peek(1).value)) {
            this.next();
            this.next();
        }
        return node;
    };

    Parser.prototype.parseResultType = function () {
        return this.parseType();
    };

    // Parameters: (a, b: Integer; var c: string; const d; out e: TFoo = nil)
    Parser.prototype.parseParameters = function () {
        this.expect('(');
        var params = [];
        if (this.accept(')'))
            return params;
        do {
            var start = this.peek();
            var mode = '';
            if (this.is('var') || this.is('const')) {
                mode = this.next().value;
                if (mode === 'const' && this.isWord('ref')) {
                    this.next();
                    mode = 'constref';
                }
            } else if (this.isWord('out') && this.isIdent(1)) {
                this.next();
                mode = 'out';
            } else if (this.isWord('constref') && this.isIdent(1)) {
                this.next();
                mode = 'constref';
            }
            var param = this.at({ names: this.parseNameList(), mode: mode, typeNode: null, defaultValue: null }, start);
            if (this.accept(':')) {
                if (this.is('array') && this.peek(1).type === 'keyword' && this.peek(1).value === 'of') {
                    var arrayStart = this.next();
                    this.next();
                    if (this.accept('const'))
                        param.typeNode = this.at({ k: 'arrayofconst' }, arrayStart);
                    else
                        param.typeNode = this.at({ k: 'openarray', of: this.parseType() }, arrayStart);
                } else {
                    param.typeNode = this.parseType();
                }
                if (this.accept('='))
                    param.defaultValue = this.parseExpression();
            } else if (mode === '') {
                this.fail('":" expected but ' + this.describe(this.peek()) + ' found');
            }
            params.push(param);
        } while (this.accept(';'));
        this.expect(')');
        return params;
    };

    // --- Routines

    Parser.prototype.parseRoutineHeading = function () {
        var start = this.peek();
        var classMethod = false;
        if (this.is('class')) {
            this.next();
            classMethod = true;
        }
        var kindToken = this.next();
        var node = this.at({ k: 'routine', kind: kindToken.value, name: null, text: null, className: null,
                             classText: null, classMethod: classMethod, params: [], resultType: null, resultName: null,
                             directives: {}, body: null }, start);
        if (kindToken.value === 'operator') {
            var op = this.peek();
            if (op.type === 'op' || op.type === 'keyword' || op.type === 'ident')
                this.next();
            else
                this.fail('operator expected');
            node.name = 'operator ' + op.value;
            node.text = op.text;
            node.operator = op.value;
            node.params = this.parseParameters();
            if (this.isIdent())
                node.resultName = this.next().value;
            this.expect(':');
            node.resultType = this.parseResultType();
            this.expect(';');
            this.parseRoutineDirectives(node);
            return node;
        }
        var name = this.ident('procedure name');
        node.name = name.value;
        node.text = name.text;
        node.nameLine = name.line;
        if (this.is('.')) {
            // A class method: TFoo.Bar; a nested class - TFoo.TBar.Baz.
            var path = [name];
            while (this.accept('.'))
                path.push(this.ident('method name'));
            var last = path.pop();
            node.className = path.map(function (token) { return token.value; }).join('.');
            node.classText = path.map(function (token) { return token.text; }).join('.');
            node.name = last.value;
            node.text = last.text;
        }
        if (this.is('<'))
            this.error('generics are not supported yet');
        if (this.is('('))
            node.params = this.parseParameters();
        if (kindToken.value === 'function' || (this.is(':') && kindToken.value !== 'procedure')) {
            // A function without ": type" is a repeated description (the body after forward).
            if (this.accept(':'))
                node.resultType = this.parseResultType();
        }
        if (this.is(';'))
            this.next();
        else if (!this.isRoutineDirective())
            this.expect(';');
        this.parseRoutineDirectives(node);
        return node;
    };

    Parser.prototype.isRoutineDirective = function () {
        var token = this.peek();
        if (token.type === 'keyword' && token.value === 'inline')
            return true;
        return token.type === 'ident' && Object.prototype.hasOwnProperty.call(ROUTINE_DIRECTIVES, token.value);
    };

    Parser.prototype.parseRoutineDirectives = function (node) {
        while (this.isRoutineDirective()) {
            var token = this.next();
            var kind = ROUTINE_DIRECTIVES[token.value];
            node.directives[token.value] = true;
            if (kind === 'external' || kind === 'public') {
                if (this.peek().type === 'string' || this.isIdent() && !this.isWord('name')) {
                    if (this.peek().type !== 'op')
                        this.parseExpression();
                }
                if (this.acceptWord('name'))
                    node.directives.externalName = this.parseExpression();
            } else if (kind === 'alias') {
                this.expect(':');
                this.parseExpression();
            } else if (kind === 'arg') {
                this.parseExpression();
            } else if (kind === 'opt') {
                if (this.peek().type === 'string')
                    this.next();
            } else if (kind === 'name') {
                this.ident();
            }
            this.accept(';');
        }
    };

    Parser.prototype.parseRoutine = function (withBody) {
        var node = this.parseRoutineHeading();
        var directives = node.directives;
        if (!withBody || directives.forward || directives.external)
            return node;
        node.body = this.parseRoutineBody();
        this.expect(';');
        return node;
    };

    // The declarations of a routine and its begin ... end.
    Parser.prototype.parseRoutineBody = function () {
        var start = this.peek();
        var body = this.at({ items: [], statements: null }, start);
        while (!this.is('begin') && !this.is('asm')) {
            if (!this.parseDeclaration(body.items, true))
                this.fail('"BEGIN" expected but ' + this.describe(this.peek()) + ' found');
        }
        if (this.is('asm'))
            this.error('assembler blocks are not supported');
        body.statements = this.parseCompound();
        body.endLine = this.tokens[this.index - 1].line;
        return body;
    };

    // --- Classes and objects

    Parser.prototype.parseClassBody = function (start, kind, declaration) {
        var node = this.at({ k: 'class', kind: kind, parent: null, interfaces: [], members: [], fields: [], forward: false,
                             isAbstract: false, sealed: false }, start);
        if (kind === 'class' && this.is(';')) {
            node.forward = true;
            return node;
        }
        if (this.isWord('abstract')) {
            this.next();
            node.isAbstract = true;
        } else if (this.isWord('sealed')) {
            this.next();
            node.sealed = true;
        } else if (this.isWord('helper')) {
            this.error('class helpers are not supported');
        }
        if (this.accept('(')) {
            node.parent = this.parseType();
            while (this.accept(','))
                node.interfaces.push(this.parseType());
            this.expect(')');
        }
        // "class(Exception);" - a class without members.
        if (this.is(';'))
            return node;
        var visibility = kind === 'object' ? 'public' : 'published';
        while (!this.is('end') && this.peek().type !== 'eof') {
            if (this.isVisibility()) {
                visibility = this.parseVisibility();
                continue;
            }
            this.parseClassMember(node, visibility);
        }
        this.expect('end');
        return node;
    };

    Parser.prototype.isVisibility = function () {
        if (this.isWord('strict') && this.peek(1).type === 'ident' && (this.peek(1).value === 'private' || this.peek(1).value === 'protected'))
            return true;
        var token = this.peek();
        return token.type === 'ident' && VISIBILITY[token.value] === true &&
            !(this.peek(1).type === 'op' && (this.peek(1).value === ':' || this.peek(1).value === ','));
    };

    Parser.prototype.parseVisibility = function () {
        var strict = false;
        if (this.acceptWord('strict'))
            strict = true;
        var value = this.next().value;
        return strict ? 'strict ' + value : value;
    };

    Parser.prototype.parseClassMember = function (node, visibility) {
        var token = this.peek();
        if (token.type === 'keyword') {
            switch (token.value) {
            case 'procedure':
            case 'function':
            case 'constructor':
            case 'destructor':
            case 'operator':
                node.members.push({ k: 'method', heading: this.parseRoutineHeading(), visibility: visibility });
                return;
            case 'property':
                node.members.push(this.parseProperty(visibility, false));
                return;
            case 'class': {
                var next = this.peek(1);
                if (next.type === 'keyword' && next.value === 'property') {
                    this.next();
                    node.members.push(this.parseProperty(visibility, true));
                    return;
                }
                if (next.type === 'keyword' && next.value === 'var') {
                    this.next();
                    this.next();
                    this.parseClassFields(node, visibility, true);
                    return;
                }
                if (next.type === 'ident' && next.value === 'threadvar') {
                    this.next();
                    this.next();
                    this.parseClassFields(node, visibility, true);
                    return;
                }
                node.members.push({ k: 'method', heading: this.parseRoutineHeading(), visibility: visibility });
                return;
            }
            case 'var':
                this.next();
                this.parseClassFields(node, visibility, false);
                return;
            case 'const':
                node.members.push({ k: 'consts', section: this.parseConstSection(), visibility: visibility });
                return;
            case 'type':
                node.members.push({ k: 'types', section: this.parseTypeSection(), visibility: visibility });
                return;
            case 'case':
                if (node.k === 'record') {
                    node.variant = this.parseVariantPart(['end']);
                    return;
                }
            }
        }
        if (token.type === 'ident') {
            var field = this.parseVarDeclaration(true);
            field.visibility = visibility;
            field.classVar = false;
            node.members.push({ k: 'field', field: field, visibility: visibility });
            if (!this.is('end'))
                this.expect(';');
            return;
        }
        this.fail('"END" expected but ' + this.describe(token) + ' found');
    };

    Parser.prototype.parseClassFields = function (node, visibility, classVar) {
        do {
            var field = this.parseVarDeclaration(true);
            field.visibility = visibility;
            field.classVar = classVar;
            node.members.push({ k: 'field', field: field, visibility: visibility });
            if (!this.is('end'))
                this.expect(';');
        } while (this.isIdent() && !this.isVisibility());
    };

    // property Name[indices]: Type index n read X write Y default Z; default;
    Parser.prototype.parseProperty = function (visibility, classProperty) {
        var start = this.next();
        var name = this.ident('property name');
        var node = this.at({ k: 'property', name: name.value, text: name.text, params: [], typeNode: null, read: null,
                             write: null, index: null, defaultValue: null, isDefault: false, nodefault: false,
                             stored: null, visibility: visibility, classProperty: classProperty }, start);
        if (this.is('[')) {
            this.next();
            do {
                var paramStart = this.peek();
                var mode = '';
                if (this.is('const') || this.is('var'))
                    mode = this.next().value;
                else if (this.isWord('out') || this.isWord('constref'))
                    mode = this.next().value;
                var param = this.at({ names: this.parseNameList(), mode: mode, typeNode: null, defaultValue: null }, paramStart);
                this.expect(':');
                param.typeNode = this.parseType();
                node.params.push(param);
            } while (this.accept(';'));
            this.expect(']');
        }
        if (this.accept(':'))
            node.typeNode = this.parseType();
        for (;;) {
            if (this.acceptWord('index')) {
                node.index = this.parseExpression();
            } else if (this.acceptWord('read')) {
                node.read = this.parseAccessor();
            } else if (this.acceptWord('write')) {
                node.write = this.parseAccessor();
            } else if (this.acceptWord('stored')) {
                node.stored = this.parseExpression();
            } else if (this.isWord('default') && !(this.peek(1).type === 'op' && this.peek(1).value === ';')) {
                this.next();
                node.defaultValue = this.parseExpression();
            } else if (this.acceptWord('nodefault')) {
                node.nodefault = true;
            } else if (this.acceptWord('implements')) {
                this.parseType();
            } else {
                break;
            }
        }
        this.expect(';');
        if (this.isWord('default') && this.peek(1).type === 'op' && this.peek(1).value === ';') {
            this.next();
            this.next();
            node.isDefault = true;
        }
        return node;
    };

    // A field or an accessor method: FItems, FPoint.X, FArr[2].
    Parser.prototype.parseAccessor = function () {
        var start = this.peek();
        var path = [this.ident()];
        var node = this.at({ k: 'name', name: path[0].value, text: path[0].text }, start);
        while (this.is('.') || this.is('[')) {
            if (this.accept('.')) {
                var member = this.ident();
                node = this.at({ k: 'member', object: node, name: member.value, text: member.text }, member);
            } else {
                var open = this.next();
                var indexes = [this.parseExpression()];
                while (this.accept(','))
                    indexes.push(this.parseExpression());
                this.expect(']');
                node = this.at({ k: 'index', object: node, indexes: indexes }, open);
            }
        }
        return node;
    };

    Pascal.parse = function (text, source, options) {
        options = options || {};
        var tokens = Pascal.tokenize(text, source, options);
        var parser = new Parser(tokens, source, options);
        if (options.unitExpected) {
            if (!parser.is('unit'))
                parser.fail('"UNIT" expected but ' + parser.describe(parser.peek()) + ' found');
            return parser.parseUnit();
        }
        return parser.parseFile();
    };
})(globalThis);
