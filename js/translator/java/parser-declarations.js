// Java: parsing declarations - a file (a unit), classes, interfaces,
// enums, records, fields, methods, constructors.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    var P = Java.Parser.prototype;
    if (P.unit)
        return;

    // A unit: package and import, then declarations and statements in order.
    P.unit = function () {
        var tok = this.peek();
        var unit = this.node('unit', tok, { imports: [], items: [] });
        if (this.is('package')) {
            this.next();
            this.qualifiedName();
            this.expect(';');
        }
        while (this.peek().type !== 'eof') {
            if (this.accept(';'))
                continue;
            if (this.is('import')) {
                unit.imports.push(this.importDeclaration());
                continue;
            }
            unit.items.push(this.topLevelItem());
        }
        return unit;
    };

    P.importDeclaration = function () {
        var tok = this.expect('import');
        var isStatic = !!this.accept('static');
        var name = this.identifier();
        var star = false;
        while (this.accept('.')) {
            if (this.accept('*')) {
                star = true;
                break;
            }
            name += '.' + this.identifier();
        }
        this.expect(';');
        return this.node('import', tok, { name: name, isStatic: isStatic, star: star });
    };

    // A declaration of a class, a method or a top-level variable, otherwise
    // a statement.
    P.topLevelItem = function () {
        var start = this.index;
        var tok = this.peek();
        var mods = this.modifiers();
        if (this.startsClass())
            return this.classDeclaration(mods, tok);
        var method = this.attempt(function () {
            var typeParams = this.is('<') ? this.typeParameters() : [];
            var result = this.resultType();
            var name = this.identifier();
            if (!this.is('('))
                this.fail('not a method');
            return this.methodRest(mods, typeParams, result, name, tok);
        });
        if (method !== null)
            return method;
        this.index = start;
        return this.blockStatement();
    };

    P.classDeclaration = function (mods, tok) {
        var kind;
        if (this.accept('class')) {
            kind = 'class';
        } else if (this.accept('interface')) {
            kind = 'interface';
        } else if (this.accept('enum')) {
            kind = 'enum';
        } else if (this.is('@')) {
            this.next();
            this.expect('interface');
            kind = 'annotation';
        } else {
            this.next();
            kind = 'record';
        }
        var name = this.identifier();
        var decl = this.node('class', tok, { kind: kind, name: name, mods: mods, typeParams: [], superclass: null,
                                             interfaces: [], components: null, constants: null, members: [] });
        if (this.is('<'))
            decl.typeParams = this.typeParameters();
        if (kind === 'record') {
            decl.components = [];
            this.expect('(');
            if (!this.is(')')) {
                do {
                    var componentTok = this.peek();
                    var componentMods = this.modifiers();
                    var componentType = this.type();
                    var varargs = !!this.accept('...');
                    if (varargs)
                        componentType = this.node('array', componentTok, { elem: componentType });
                    decl.components.push(this.node('param', componentTok, {
                        mods: componentMods, type: componentType, name: this.identifier(), varargs: varargs }));
                } while (this.accept(','));
            }
            this.expect(')');
        }
        if (this.accept('extends')) {
            if (kind === 'interface') {
                do
                    decl.interfaces.push(this.type());
                while (this.accept(','));
            } else {
                decl.superclass = this.type();
            }
        }
        if (this.accept('implements')) {
            do
                decl.interfaces.push(this.type());
            while (this.accept(','));
        }
        if (this.isIdent(0, 'permits')) {
            this.next();
            decl.permits = [];
            do
                decl.permits.push(this.type());
            while (this.accept(','));
        }
        this.classBody(decl);
        return decl;
    };
    // A class body; an enum has its constants first.
    P.classBody = function (decl) {
        this.expect('{');
        if (decl.kind === 'enum') {
            decl.constants = [];
            while (!this.is(';') && !this.is('}')) {
                var tok = this.peek();
                this.modifiers();
                var name = this.identifier();
                var args = this.is('(') ? this.arguments() : [];
                var body = null;
                if (this.is('{')) {
                    body = this.node('class', this.peek(), { kind: 'class', name: null, mods: {}, typeParams: [],
                                                             superclass: null, interfaces: [], members: [] });
                    this.classBody(body);
                }
                decl.constants.push(this.node('constant', tok, { name: name, args: args, body: body }));
                if (!this.accept(','))
                    break;
            }
            if (!this.accept(';') && !this.is('}'))
                this.fail("',', '}', or ';' expected");
        }
        while (!this.accept('}')) {
            if (this.peek().type === 'eof')
                this.fail('reached end of file while parsing');
            if (this.accept(';'))
                continue;
            this.member(decl);
        }
    };

    P.member = function (decl) {
        var tok = this.peek();
        // An initializer: { ... } or static { ... }.
        if (this.is('{') || (this.is('static') && this.is('{', 1))) {
            var isStatic = !!this.accept('static');
            decl.members.push(this.node('initializer', tok, { isStatic: isStatic, body: this.block() }));
            return;
        }
        var mods = this.modifiers();
        if (this.startsClass()) {
            decl.members.push(this.classDeclaration(mods, tok));
            return;
        }
        var typeParams = this.is('<') ? this.typeParameters() : [];
        // A constructor: Name( ; a compact record constructor: Name {
        if (this.isIdent(0, decl.name) && (this.is('(', 1) || (decl.kind === 'record' && this.is('{', 1)))) {
            this.next();
            var ctor = this.node('ctor', tok, { mods: mods, typeParams: typeParams, params: [], compact: false, body: null });
            if (this.is('{')) {
                ctor.compact = true;
            } else {
                ctor.params = this.parameters();
                this.throwsClause();
            }
            // A native constructor of the library - without a body.
            ctor.body = mods.native && this.accept(';') ? null : this.block();
            decl.members.push(ctor);
            return;
        }
        var type = this.resultType();
        var name = this.identifier();
        if (this.is('(')) {
            decl.members.push(this.methodRest(mods, typeParams, type, name, tok));
            return;
        }
        if (typeParams.length > 0)
            this.fail("'(' expected");
        var field = this.node('field', tok, { mods: mods, type: type, vars: this.variableDeclarators(type, name) });
        this.expect(';');
        decl.members.push(field);
    };
    // name is read already: [] after the name, = initializer, separated by commas.
    P.variableDeclarators = function (type, name) {
        var vars = [];
        for (;;) {
            var tok = this.tokens[this.index - 1];
            var varType = this.dims(type);
            var init = null;
            if (this.accept('='))
                init = this.is('{') ? this.arrayInitializer() : this.expression();
            vars.push(this.node('var', tok, { name: name, type: varType, init: init }));
            if (!this.accept(','))
                break;
            name = this.identifier();
        }
        return vars;
    };

    P.throwsClause = function () {
        var list = [];
        if (this.accept('throws')) {
            do
                list.push(this.type());
            while (this.accept(','));
        }
        return list;
    };

    P.methodRest = function (mods, typeParams, result, name, tok) {
        var params = this.parameters();
        result = this.dims(result);
        var throwsList = this.throwsClause();
        var body = null;
        if (this.accept('default')) {
            // The default value of an annotation element.
            this.expression();
            this.expect(';');
        } else if (!this.accept(';')) {
            body = this.block();
        }
        return this.node('method', tok, { mods: mods, typeParams: typeParams, result: result, name: name, params: params,
                                          throwsList: throwsList, body: body });
    };
    P.parameters = function () {
        var params = [];
        this.expect('(');
        if (!this.is(')')) {
            do {
                var tok = this.peek();
                var mods = this.modifiers();
                var type = this.type();
                var varargs = !!this.accept('...');
                // The receiver this among the parameters is skipped.
                if (this.is('this')) {
                    this.next();
                    continue;
                }
                var name = this.identifier();
                type = this.dims(type);
                if (varargs)
                    type = this.node('array', tok, { elem: type });
                params.push(this.node('param', tok, { mods: mods, type: type, name: name, varargs: varargs }));
            } while (this.accept(','));
        }
        this.expect(')');
        return params;
    };

    P.arrayInitializer = function () {
        var tok = this.expect('{');
        var items = [];
        while (!this.is('}')) {
            items.push(this.is('{') ? this.arrayInitializer() : this.expression());
            if (!this.accept(','))
                break;
        }
        this.expect('}');
        return this.node('arrayinit', tok, { items: items });
    };

    Java.parse = function (text, source) {
        var parser = new Java.Parser(Java.lex(text, source), source);
        return parser.unit();
    };
})(globalThis);
