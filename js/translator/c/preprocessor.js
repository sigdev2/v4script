// C: tokens and the preprocessor - #include (host files and built-in
// headers), #define with parameters, # and ##, conditional compilation.
// Every token knows the file and the line it came from.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var C = T.c = T.c || {};
    if (C.preprocess)
        return;

    var CompileError = T.CompileError;
    var big = T.big;

    var PUNCTUATORS = [
        '%:%:', '...', '<<=', '>>=',
        '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '*=', '/=', '%=', '+=', '-=', '&=', '^=',
        '|=', '##', '<:', ':>', '<%', '%>', '%:', '::',
        '[', ']', '(', ')', '{', '}', '.', '&', '*', '+', '-', '~', '!', '/', '%', '<', '>', '^', '|', '?', ':', ';',
        '=', ',', '#'
    ];
    var DIGRAPHS = { '<:': '[', ':>': ']', '<%': '{', '%>': '}', '%:': '#', '%:%:': '##' };

    var IDENTIFIER = /[A-Za-z_$\u0080-￿][A-Za-z0-9_$\u0080-￿]*/y;
    // pp-number: digits, letters, points and a sign after e/p.
    var PP_NUMBER = /\.?[0-9](?:[eEpP][+-]|[0-9A-Za-z_.'])*/y;

    function token(type, value, file, line, column) {
        return { type: type, value: value, file: file, line: line, column: column, space: false, bol: false };
    }

    // C++ only: the member pointer operators and raw strings.
    var CPP_PUNCTUATORS = ['->*', '.*'];
    var RAW_STRING = /(?:u8|u|U|L)?R"([^()\\\s"]{0,16})\(/y;

    // Splitting a text into preprocessor tokens; line breaks are 'newline'
    // tokens (directives need them). cpp - the tokens of C++; line - of the
    // first line (a part of a file).
    function lex(text, file, cpp, line) {
        var scanner = new T.Scanner(text.replace(/\\\r?\n/g, function () { return '\u0001'; }), file);
        if (line !== undefined)
            scanner.line = line;
        var tokens = [];
        var space = false;
        var bol = true;
            // Joining lines by "\" + line break: lines are counted by the source.
        var joined = 0;
        function push(item) {
            item.space = space;
            item.bol = bol;
            space = false;
            bol = false;
            tokens.push(item);
        }
        while (!scanner.atEnd()) {
            var char = scanner.peek();
            if (char === '\u0001') {
                scanner.advance();
                ++scanner.line;
                ++joined;
                continue;
            }
            if (char === '\n') {
                tokens.push(token('newline', '\n', file, scanner.line, scanner.column()));
                scanner.advance();
                space = false;
                bol = true;
                continue;
            }
            if (char === ' ' || char === '\t' || char === '\r' || char === '\f' || char === '\v' || char === '﻿') {
                scanner.advance();
                space = true;
                continue;
            }
            if (scanner.startsWith('//')) {
                while (!scanner.atEnd() && scanner.peek() !== '\n') {
                    if (scanner.peek() === '\u0001')
                        ++scanner.line;
                    scanner.advance();
                }
                space = true;
                continue;
            }
            if (scanner.startsWith('/*')) {
                var startLine = scanner.line, startColumn = scanner.column();
                scanner.advance(2);
                while (!scanner.atEnd() && !scanner.startsWith('*/')) {
                    if (scanner.peek() === '\u0001')
                        ++scanner.line;
                    scanner.advance();
                }
                if (scanner.atEnd())
                    throw new CompileError('unterminated /* comment', startLine, startColumn, file);
                scanner.advance(2);
                space = true;
                continue;
            }
            var line = scanner.line, column = scanner.column();
            var code = scanner.code();
            var raw = cpp ? scanner.match(RAW_STRING) : null;
            if (raw !== null) {
                push(token('string', rawString(scanner, raw, file, line, column), file, line, column));
                continue;
            }
            // Strings and characters, with the prefixes u8, u, U, L.
            var prefix = scanner.match(/(?:u8|u|U|L)?(?=["'])/y);
            if (prefix !== null && (scanner.peek(prefix.length) === '"' || scanner.peek(prefix.length) === "'")) {
                var quote = scanner.peek(prefix.length);
                var start = scanner.pos;
                scanner.advance(prefix.length + 1);
                while (!scanner.atEnd() && scanner.peek() !== quote) {
                    if (scanner.peek() === '\n')
                        throw new CompileError('missing terminating ' + quote + ' character', line, column, file);
                    if (scanner.peek() === '\u0001')
                        ++scanner.line;
                    if (scanner.peek() === '\\')
                        scanner.advance();
                    scanner.advance();
                }
                if (scanner.atEnd())
                    throw new CompileError('missing terminating ' + quote + ' character', line, column, file);
                scanner.advance();
                push(token(quote === '"' ? 'string' : 'char', scanner.text.substring(start, scanner.pos).replace(/\u0001/g, ''),
                           file, line, column));
                continue;
            }
            if (T.isLetter(code) || char === '$') {
                var word = scanner.match(IDENTIFIER);
                scanner.advance(word.length);
                push(token('ident', word, file, line, column));
                continue;
            }
            if (T.isDigit(code) || (char === '.' && T.isDigit(scanner.code(1)))) {
                var number = scanner.match(PP_NUMBER);
                scanner.advance(number.length);
                push(token('number', number, file, line, column));
                continue;
            }
            var operator = null;
            for (var cppIndex = 0; cpp && cppIndex < CPP_PUNCTUATORS.length; ++cppIndex) {
                if (scanner.startsWith(CPP_PUNCTUATORS[cppIndex])) {
                    operator = CPP_PUNCTUATORS[cppIndex];
                    break;
                }
            }
            for (var index = 0; operator === null && index < PUNCTUATORS.length; ++index) {
                if (scanner.startsWith(PUNCTUATORS[index])) {
                    operator = PUNCTUATORS[index];
                    break;
                }
            }
            if (operator === null) {
                // A stray character: directives skip it, the parser does not.
                push(token('other', char, file, line, column));
                scanner.advance();
                continue;
            }
            scanner.advance(operator.length);
            push(token('punct', DIGRAPHS[operator] || operator, file, line, column));
        }
        tokens.push(token('newline', '\n', file, scanner.line, scanner.column()));
        return tokens;
    }
    C.lex = lex;

    // A raw string R"delimiter(...)delimiter" as an ordinary literal with
    // escapes (the parser decodes one kind of string). Line splices inside
    // it are undone.
    function rawString(scanner, opening, file, line, column) {
        var prefix = opening.substring(0, opening.indexOf('R'));
        var delimiter = opening.substring(opening.indexOf('"') + 1, opening.length - 1);
        var start = scanner.pos + opening.length;
        var end = scanner.text.indexOf(')' + delimiter + '"', start);
        if (end < 0)
            throw new CompileError('unterminated raw string', line, column, file);
        var body = scanner.text.substring(start, end).replace(/\u0001/g, '\\\n');
        for (var index = scanner.pos; index < end; ++index) {
            if (scanner.text.charAt(index) === '\u0001')
                ++scanner.line;
        }
        scanner.advance(end + delimiter.length + 2 - scanner.pos);
        var escaped = body.replace(/[\\"]/g, function (char) { return '\\' + char; })
            .replace(/\n/g, '\\n').replace(/\r/g, '\\r');
        return prefix + '"' + escaped + '"';
    }

    // --- The preprocessor

    function Preprocessor(options) {
        // options: macros (the shared dictionary of the session),
        // include(name, system) -> { text, file, library } or null, onceFiles.
        this.options = options;
        this.macros = options.macros;
        this.output = [];
        this.includeDepth = 0;
        this.once = options.onceFiles || {};
    }

    Preprocessor.prototype.error = function (message, tok) {
        throw new CompileError(message, tok ? tok.line : 0, tok ? tok.column : 0, tok ? tok.file : '');
    };

    // Lines of directives and of text one by one.
    Preprocessor.prototype.run = function (tokens, file) {
        var lines = [];
        var current = [];
        tokens.forEach(function (item) {
            if (item.type === 'newline') {
                lines.push(current);
                current = [];
            } else {
                current.push(item);
            }
        });
        if (current.length > 0)
            lines.push(current);
        // The condition stack: { active, taken, sawElse, parentActive }.
        var conditions = [];
        var active = true;
        var pending = [];
        var self = this;
        function flush() {
            if (pending.length > 0) {
                self.expandInto(pending, self.output);
                pending = [];
            }
        }
        for (var index = 0; index < lines.length; ++index) {
            var line = lines[index];
            if (line.length > 0 && line[0].type === 'punct' && line[0].value === '#' && line[0].bol) {
                var directive = line.length > 1 ? line[1] : null;
                var name = directive !== null && (directive.type === 'ident' || directive.type === 'number') ? directive.value : '';
                var rest = line.slice(2);
                switch (name) {
                case 'if':
                case 'ifdef':
                case 'ifndef': {
                    var parentActive = active;
                    var value = false;
                    if (parentActive) {
                        if (name === 'if') {
                            value = this.evaluate(rest, directive);
                        } else {
                            if (rest.length === 0 || rest[0].type !== 'ident')
                                this.error('macro name missing', directive);
                            value = (this.macros[rest[0].value] !== undefined) === (name === 'ifdef');
                        }
                    }
                    conditions.push({ taken: value, sawElse: false, parentActive: parentActive, token: directive });
                    active = parentActive && value;
                    continue;
                }
                case 'elif':
                case 'elifdef':
                case 'elifndef': {
                    var top = conditions[conditions.length - 1];
                    if (top === undefined)
                        this.error('#' + name + ' without #if', directive);
                    if (top.sawElse)
                        this.error('#' + name + ' after #else', directive);
                    if (top.taken || !top.parentActive) {
                        active = false;
                    } else {
                        var elifValue;
                        if (name === 'elif')
                            elifValue = this.evaluate(rest, directive);
                        else
                            elifValue = (this.macros[rest[0] && rest[0].value] !== undefined) === (name === 'elifdef');
                        top.taken = elifValue;
                        active = elifValue;
                    }
                    continue;
                }
                case 'else': {
                    var last = conditions[conditions.length - 1];
                    if (last === undefined)
                        this.error('#else without #if', directive);
                    if (last.sawElse)
                        this.error('#else after #else', directive);
                    last.sawElse = true;
                    active = last.parentActive && !last.taken;
                    last.taken = true;
                    continue;
                }
                case 'endif':
                    if (conditions.length === 0)
                        this.error('#endif without #if', directive);
                    active = conditions.pop().parentActive;
                    continue;
                }
                if (!active)
                    continue;
                flush();
                switch (name) {
                case '':
                    continue;
                case 'define':
                    this.define(rest, directive);
                    continue;
                case 'undef':
                    if (rest.length > 0)
                        delete this.macros[rest[0].value];
                    continue;
                case 'include':
                    this.include(rest, directive);
                    continue;
                case 'error':
                    this.error('#error ' + rest.map(function (item) { return item.value; }).join(' '), directive);
                    break;
                case 'warning':
                    if (this.options.warn)
                        this.options.warn(directive, rest.map(function (item) { return item.value; }).join(' '));
                    continue;
                case 'pragma':
                    if (rest.length > 0 && rest[0].value === 'once')
                        this.once[directive.file] = true;
                    continue;
                case 'line':
                    continue;
                default:
                    this.error('invalid preprocessing directive #' + name, directive);
                }
                continue;
            }
            if (active) {
                for (var item = 0; item < line.length; ++item)
                    pending.push(line[item]);
            }
        }
        flush();
        if (conditions.length > 0)
            this.error('unterminated conditional directive', conditions[conditions.length - 1].token);
    };

    Preprocessor.prototype.define = function (rest, directive) {
        if (rest.length === 0 || rest[0].type !== 'ident')
            this.error('macro name missing', directive);
        var name = rest[0].value;
        if (name === 'defined')
            this.error('"defined" cannot be used as a macro name', rest[0]);
        var macro = { name: name, params: null, variadic: false, body: [], token: rest[0] };
        var index = 1;
        // A function-like macro: "(" right after the name.
        if (rest.length > 1 && rest[1].type === 'punct' && rest[1].value === '(' && !rest[1].space) {
            macro.params = [];
            index = 2;
            for (;;) {
                var item = rest[index];
                if (item === undefined)
                    this.error('missing \')\' in macro parameter list', rest[1]);
                if (item.type === 'punct' && item.value === ')') {
                    ++index;
                    break;
                }
                if (item.type === 'punct' && item.value === '...') {
                    macro.variadic = true;
                    macro.params.push('__VA_ARGS__');
                } else if (item.type === 'ident') {
                    macro.params.push(item.value);
                    if (rest[index + 1] && rest[index + 1].value === '...') {
                        macro.variadic = true;
                        ++index;
                    }
                } else {
                    this.error('invalid macro parameter', item);
                }
                ++index;
                if (rest[index] && rest[index].value === ',')
                    ++index;
            }
        }
        macro.body = rest.slice(index);
        if (macro.body.length > 0)
            macro.body[0] = copy(macro.body[0], { space: false });
        this.macros[name] = macro;
    };

    function copy(item, changes) {
        var result = {};
        Object.keys(item).forEach(function (key) { result[key] = item[key]; });
        Object.keys(changes).forEach(function (key) { result[key] = changes[key]; });
        return result;
    }

    Preprocessor.prototype.include = function (rest, directive) {
        // The name: "file" or <file> (or a macro that expands into them).
        var name = null, system = false;
        if (rest.length > 0 && rest[0].type === 'string') {
            name = rest[0].value.slice(1, -1);
        } else if (rest.length > 0 && rest[0].value === '<') {
            system = true;
            var parts = [];
            for (var index = 1; index < rest.length && rest[index].value !== '>'; ++index)
                parts.push(rest[index].value);
            name = parts.join('');
        } else if (rest.length > 0) {
            var expanded = [];
            this.expandInto(rest, expanded);
            if (expanded.length > 0 && expanded[0].type === 'string')
                name = expanded[0].value.slice(1, -1);
        }
        if (name === null)
            this.error('#include expects "FILENAME" or <FILENAME>', directive);
        if (this.includeDepth >= 64)
            this.error('#include nested too deeply', directive);
        var found = this.options.include(name, system, directive);
        if (found === null)
            this.error("'" + name + "' file not found", rest[0]);
        if (this.once[found.file])
            return;
        ++this.includeDepth;
        this.run(lex(found.text, found.file, this.options.cpp), found.file);
        --this.includeDepth;
    };

    // --- Macro expansion
    //
    // Every token carries hide - the names of the macros in whose expansion
    // it appeared (so a macro does not expand recursively).

    Preprocessor.prototype.expandInto = function (tokens, output) {
        var list = tokens.slice();
        var index = 0;
        var guard = 0;
        while (index < list.length) {
            if (++guard > 1000000)
                this.error('macro expansion is too large', list[index]);
            var item = list[index];
            if (item.type !== 'ident' || this.macros[item.value] === undefined || (item.hide && item.hide[item.value])) {
                output.push(item);
                ++index;
                continue;
            }
            if (item.value === '__LINE__' || item.value === '__FILE__') {
                output.push(item);
                ++index;
                continue;
            }
            var macro = this.macros[item.value];
            if (macro.builtin) {
                output.push(macro.builtin(item));
                ++index;
                continue;
            }
            var hide = {};
            if (item.hide)
                Object.keys(item.hide).forEach(function (key) { hide[key] = true; });
            hide[macro.name] = true;
            var replacement;
            if (macro.params === null) {
                replacement = this.substitute(macro, null, item, hide);
                list.splice.apply(list, [index, 1].concat(replacement));
                continue;
            }
            // A function-like one needs "(", otherwise it is just a name.
            var next = list[index + 1];
            if (next === undefined || next.type !== 'punct' || next.value !== '(') {
                output.push(item);
                ++index;
                continue;
            }
            var collected = this.collectArguments(list, index + 1, macro, item);
            replacement = this.substitute(macro, collected.args, item, hide);
            list.splice.apply(list, [index, collected.end - index + 1].concat(replacement));
        }
    };

    Preprocessor.prototype.collectArguments = function (list, open, macro, nameToken) {
        var args = [[]];
        var depth = 0;
        for (var index = open + 1; index < list.length; ++index) {
            var item = list[index];
            if (item.type === 'punct') {
                if (item.value === '(') {
                    ++depth;
                } else if (item.value === ')') {
                    if (depth === 0) {
                        if (args.length === 1 && args[0].length === 0 && macro.params.length === 0)
                            args = [];
                        if (args.length < macro.params.length && !(macro.variadic && args.length === macro.params.length - 1))
                            if (!(macro.params.length === 1 && args.length === 1))
                                this.error('too few arguments provided to function-like macro invocation', nameToken);
                        if (args.length > macro.params.length && !macro.variadic)
                            this.error('too many arguments provided to function-like macro invocation', nameToken);
                        return { args: args, end: index };
                    }
                    --depth;
                } else if (item.value === ',' && depth === 0 &&
                           !(macro.variadic && args.length === macro.params.length)) {
                    args.push([]);
                    continue;
                }
            }
            args[args.length - 1].push(item);
        }
        this.error('unterminated function-like macro invocation', nameToken);
    };

    function stringify(tokens) {
        var text = '';
        tokens.forEach(function (item, index) {
            if (index > 0 && item.space)
                text += ' ';
            var value = item.value;
            if (item.type === 'string' || item.type === 'char')
                value = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            text += value;
        });
        return '"' + text + '"';
    }

    Preprocessor.prototype.substitute = function (macro, args, nameToken, hide) {
        var body = macro.body;
        var result = [];
        var self = this;
        function argumentIndex(item) {
            if (args === null || item.type !== 'ident')
                return -1;
            return macro.params.indexOf(item.value);
        }
        function argumentTokens(index) {
            var value = args[index];
            if (value === undefined)
                return [];
            return value;
        }
        for (var index = 0; index < body.length; ++index) {
            var item = body[index];
            // # parameter
            if (args !== null && item.type === 'punct' && item.value === '#' && index + 1 < body.length &&
                argumentIndex(body[index + 1]) >= 0) {
                var stringified = token('string', stringify(argumentTokens(argumentIndex(body[index + 1]))),
                                        nameToken.file, nameToken.line, nameToken.column);
                stringified.space = item.space;
                result.push(stringified);
                ++index;
                continue;
            }
            // a ## b
            if (index + 1 < body.length && body[index + 1].type === 'punct' && body[index + 1].value === '##') {
                var left = argumentIndex(item) >= 0 ? argumentTokens(argumentIndex(item)) : [item];
                var pieces = left.slice();
                while (index + 1 < body.length && body[index + 1].value === '##') {
                    var rightToken = body[index + 2];
                    if (rightToken === undefined)
                        this.error("'##' cannot appear at end of macro expansion", body[index + 1]);
                    var right = argumentIndex(rightToken) >= 0 ? argumentTokens(argumentIndex(rightToken)) : [rightToken];
                    // GNU: , ## __VA_ARGS__ without arguments removes the comma.
                    var commaBefore = pieces.length > 0 && pieces[pieces.length - 1].value === ',';
                    if (rightToken.value === '__VA_ARGS__' && argumentIndex(rightToken) >= 0 && commaBefore) {
                        // With arguments ## joins nothing: the comma and the
                        // expanded arguments.
                        if (right.length === 0) {
                            pieces.pop();
                        } else {
                            var expandedRight = [];
                            self.expandInto(right, expandedRight);
                            pieces = pieces.concat(expandedRight);
                        }
                    } else if (pieces.length === 0) {
                        pieces = right.slice();
                    } else if (right.length > 0) {
                        var glued = pieces[pieces.length - 1].value + right[0].value;
                        var relexed = lex(glued, nameToken.file, this.options.cpp).filter(function (token) {
                            return token.type !== 'newline';
                        });
                        if (relexed.length !== 1)
                            this.error("pasting formed '" + glued + "', an invalid preprocessing token", nameToken);
                        var pasted = copy(relexed[0], { line: nameToken.line, column: nameToken.column, space: pieces[pieces.length - 1].space });
                        pieces[pieces.length - 1] = pasted;
                        pieces = pieces.concat(right.slice(1));
                    }
                    index += 2;
                }
                pieces.forEach(function (piece) { result.push(piece); });
                continue;
            }
            var parameter = argumentIndex(item);
            if (parameter >= 0) {
                // An argument is expanded beforehand.
                var expanded = [];
                self.expandInto(argumentTokens(parameter), expanded);
                expanded.forEach(function (piece, pieceIndex) {
                    result.push(pieceIndex === 0 ? copy(piece, { space: item.space }) : piece);
                });
                continue;
            }
            result.push(item);
        }
        // The tokens of an expansion are on the line of the call, with the macro name hidden.
        return result.map(function (piece, index) {
            var placed = copy(piece, { file: nameToken.file, line: nameToken.line, column: nameToken.column,
                                       hide: mergeHide(piece.hide, hide) });
            if (index === 0)
                placed.space = nameToken.space;
            return placed;
        });
    };

    function mergeHide(base, extra) {
        var result = {};
        if (base)
            Object.keys(base).forEach(function (key) { result[key] = true; });
        Object.keys(extra).forEach(function (key) { result[key] = true; });
        return result;
    }

    // #if: an integer expression; defined(X), unknown names are 0.
    Preprocessor.prototype.evaluate = function (tokens, directive) {
        var prepared = [];
        for (var index = 0; index < tokens.length; ++index) {
            var item = tokens[index];
            if (item.type === 'ident' && item.value === 'defined') {
                var name;
                if (tokens[index + 1] && tokens[index + 1].value === '(') {
                    name = tokens[index + 2];
                    index += 3;
                } else {
                    name = tokens[index + 1];
                    index += 1;
                }
                if (name === undefined || name.type !== 'ident')
                    this.error('macro name missing', item);
                prepared.push(token('number', this.macros[name.value] !== undefined ? '1' : '0', item.file, item.line, item.column));
                continue;
            }
            prepared.push(item);
        }
        var expanded = [];
        this.expandInto(prepared, expanded);
        var position = 0;
        var self = this;
        function peek() {
            return expanded[position];
        }
        function next() {
            return expanded[position++];
        }
        function primary() {
            var item = next();
            if (item === undefined)
                self.error('expected value in expression', directive);
            if (item.value === '(') {
                var value = conditional();
                if (next() === undefined)
                    self.error("expected ')' in preprocessor expression", directive);
                return value;
            }
            if (item.value === '-')
                return big.neg(unary());
            if (item.value === '+')
                return unary();
            if (item.value === '!')
                return big.sign(unary()) === 0 ? 1 : 0;
            if (item.value === '~')
                return big.not(unary());
            if (item.type === 'number')
                return C.parseIntegerToken(item).value;
            if (item.type === 'char')
                return C.parseCharToken(item);
            if (item.type === 'ident')
                return item.value === 'true' ? 1 : 0;
            self.error('token is not a valid binary operator in a preprocessor subexpression', item);
        }
        function unary() {
            return primary();
        }
        var PRECEDENCE = { '*': 10, '/': 10, '%': 10, '+': 9, '-': 9, '<<': 8, '>>': 8, '<': 7, '>': 7, '<=': 7, '>=': 7,
                           '==': 6, '!=': 6, '&': 5, '^': 4, '|': 3, '&&': 2, '||': 1 };
        function binary(minimum) {
            var left = unary();
            for (;;) {
                var item = peek();
                var precedence = item && item.type === 'punct' ? PRECEDENCE[item.value] : undefined;
                if (precedence === undefined || precedence < minimum)
                    return left;
                next();
                var right = binary(precedence + 1);
                left = apply(item, left, right);
            }
        }
        function apply(operator, left, right) {
            switch (operator.value) {
            case '*':
                return big.mul(left, right);
            case '/':
                if (big.sign(right) === 0)
                    self.error('division by zero in preprocessor expression', operator);
                return big.quot(left, right);
            case '%':
                if (big.sign(right) === 0)
                    self.error('division by zero in preprocessor expression', operator);
                return big.rem(left, right);
            case '+':
                return big.add(left, right);
            case '-':
                return big.sub(left, right);
            case '<<':
                return big.shl(left, big.toFloat(right));
            case '>>':
                return big.shr(left, big.toFloat(right));
            case '<':
                return big.cmp(left, right) < 0 ? 1 : 0;
            case '>':
                return big.cmp(left, right) > 0 ? 1 : 0;
            case '<=':
                return big.cmp(left, right) <= 0 ? 1 : 0;
            case '>=':
                return big.cmp(left, right) >= 0 ? 1 : 0;
            case '==':
                return big.cmp(left, right) === 0 ? 1 : 0;
            case '!=':
                return big.cmp(left, right) !== 0 ? 1 : 0;
            case '&':
                return big.and(left, right);
            case '^':
                return big.xor(left, right);
            case '|':
                return big.or(left, right);
            case '&&':
                return big.sign(left) !== 0 && big.sign(right) !== 0 ? 1 : 0;
            case '||':
                return big.sign(left) !== 0 || big.sign(right) !== 0 ? 1 : 0;
            }
            return 0;
        }
        function conditional() {
            var condition = binary(1);
            if (peek() && peek().value === '?') {
                next();
                var then = conditional();
                if (!peek() || peek().value !== ':')
                    self.error("expected ':' in preprocessor expression", directive);
                next();
                var otherwise = conditional();
                return big.sign(condition) !== 0 ? then : otherwise;
            }
            return condition;
        }
        if (expanded.length === 0)
            this.error('#if with no expression', directive);
        var result = conditional();
        if (position < expanded.length)
            this.error('token is not a valid binary operator in a preprocessor subexpression', expanded[position]);
        return big.sign(result) !== 0;
    };

    // A full pass: the text of a unit -> tokens for the parser (with
    // __LINE__ and __FILE__ in place).
    C.preprocess = function (text, file, options) {
        var preprocessor = new Preprocessor(options);
        preprocessor.run(lex(text, file, options.cpp, options.line), file);
        return preprocessor.output.map(function (item) {
            if (item.type === 'ident' && item.value === '__LINE__')
                return copy(item, { type: 'number', value: String(item.line) });
            if (item.type === 'ident' && item.value === '__FILE__')
                return copy(item, { type: 'string', value: '"' + (item.file || 'main.c') + '"' });
            return item;
        });
    };

    // --- Numbers and characters

    // An integer: { value: big, unsigned, long: 0|1|2 } or null (it is a float).
    C.parseIntegerToken = function (item) {
        var text = item.value.replace(/'/g, '');
        var match = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|0[0-7]*|[1-9][0-9]*)([uUlL]*)$/.exec(text);
        if (match === null)
            return null;
        var digits = match[1];
        var value;
        if (/^0[xX]/.test(digits))
            value = big.parse(digits.substring(2), 16);
        else if (/^0[bB]/.test(digits))
            value = big.parse(digits.substring(2), 2);
        else if (digits.length > 1 && digits.charAt(0) === '0')
            value = big.parse(digits.substring(1), 8);
        else
            value = big.parse(digits, 10);
        var suffix = match[2].toLowerCase();
        if (!/^(u?(l|ll)?|(l|ll)u)$/.test(suffix))
            throw new CompileError("invalid suffix '" + match[2] + "' on integer constant", item.line, item.column, item.file);
        return {
            value: value,
            unsigned: suffix.indexOf('u') >= 0,
            long: suffix.indexOf('ll') >= 0 ? 2 : (suffix.indexOf('l') >= 0 ? 1 : 0),
            decimal: !/^0/.test(digits) || digits === '0'
        };
    };

    var SIMPLE_ESCAPES = { n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, e: 27, '\\': 92, "'": 39, '"': 34, '?': 63 };

    // The bytes of a C string (UTF-8) from the text of a literal with quotes.
    C.decodeQuoted = function (item) {
        var text = item.value;
        var start = text.indexOf(text.charAt(text.length - 1)) + 1;
        var body = text.substring(start, text.length - 1);
        var bytes = [];
        var wide = /^(L|u|U)/.test(text) && !/^u8/.test(text);
        for (var index = 0; index < body.length;) {
            var char = body.charAt(index);
            if (char !== '\\') {
                var point = body.codePointAt(index);
                if (wide)
                    bytes.push(point);
                else
                    T.utf8.appendRune(bytes, point);
                index += point > 0xFFFF ? 2 : 1;
                continue;
            }
            var next = body.charAt(index + 1);
            if (SIMPLE_ESCAPES[next] !== undefined) {
                bytes.push(SIMPLE_ESCAPES[next]);
                index += 2;
            } else if (next === 'x') {
                var hex = /^[0-9a-fA-F]+/.exec(body.substring(index + 2));
                if (hex === null)
                    throw new CompileError('\\x used with no following hex digits', item.line, item.column, item.file);
                bytes.push(parseInt(hex[0], 16) & (wide ? 0xFFFFFFFF : 0xFF));
                index += 2 + hex[0].length;
            } else if (next >= '0' && next <= '7') {
                var octal = /^[0-7]{1,3}/.exec(body.substring(index + 1))[0];
                bytes.push(parseInt(octal, 8) & 0xFF);
                index += 1 + octal.length;
            } else if (next === 'u' || next === 'U') {
                var length = next === 'u' ? 4 : 8;
                var code = parseInt(body.substr(index + 2, length), 16);
                if (wide)
                    bytes.push(code);
                else
                    T.utf8.appendRune(bytes, code);
                index += 2 + length;
            } else {
                bytes.push(next.charCodeAt(0));
                index += 2;
            }
        }
        return { bytes: bytes, wide: wide };
    };

    C.parseCharToken = function (item) {
        var decoded = C.decodeQuoted(item);
        var bytes = decoded.bytes;
        if (bytes.length === 0)
            throw new CompileError('empty character constant', item.line, item.column, item.file);
        if (decoded.wide)
            return bytes[0];
        // 'ab' is a multi-character constant, as in gcc.
        var value = 0;
        bytes.forEach(function (byte) { value = (value << 8) | byte; });
        // char is signed: '\xff' == -1
        if (bytes.length === 1 && value > 127)
            value -= 256;
        return value;
    };
})(globalThis);
