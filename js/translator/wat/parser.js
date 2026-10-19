// WAT: a module from S-expressions - fields, abbreviations of the text
// format (inline imports and exports, elem of a table, data of a memory,
// implicit types), names into indices, flat and folded instructions.
// Errors are 'malformed'; validator.js checks indices out of range.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var W = T.wat;
    if (W.parseModule)
        return;

    var OPS = W.OPS;
    var numbers = W.numbers;

    function Cursor(items, start) {
        this.items = items;
        this.i = start || 0;
    }
    Cursor.prototype.peek = function (offset) {
        return this.items[this.i + (offset || 0)];
    };
    Cursor.prototype.next = function () {
        return this.items[this.i++];
    };
    Cursor.prototype.atEnd = function () {
        return this.i >= this.items.length;
    };
    Cursor.prototype.isKw = function (value) {
        var item = this.items[this.i];
        return item !== undefined && item.t === 'kw' && item.v === value;
    };
    Cursor.prototype.isForm = function (head) {
        return W.isForm(this.items[this.i], head);
    };

    var FIELD_KINDS = { type: 1, import: 1, func: 1, table: 1, memory: 1, global: 1, export: 1, start: 1, elem: 1, data: 1 };
    W.FIELD_KINDS = FIELD_KINDS;

    var SPACE_NAMES = { types: 'type', funcs: 'function', tables: 'table', mems: 'memory', globals: 'global',
                        elems: 'elem segment', datas: 'data segment' };

    function ModuleParser(source) {
        this.source = source || '';
        this.module = {
            id: null,
            types: [],
            funcs: [],
            tables: [],
            mems: [],
            globals: [],
            elems: [],
            datas: [],
            imports: [],
            exports: [],
            start: null,
            line: 0
        };
        // Name -> index for every space.
        this.names = { types: {}, funcs: {}, tables: {}, mems: {}, globals: {}, elems: {}, datas: {} };
        this.counts = { types: 0, funcs: 0, tables: 0, mems: 0, globals: 0, elems: 0, datas: 0 };
        this.defined = null;
        // Types declared explicitly (only they may match (type x)).
        this.explicitTypes = 0;
    }

    ModuleParser.prototype.fail = function (message, node) {
        throw W.error('malformed', message, node ? node.line : 0, node ? node.col : 0, this.source);
    };

    ModuleParser.prototype.describe = function (node) {
        if (node === undefined)
            return 'end of form';
        if (node.t === 'list')
            return '(' + (W.headOf(node) || '...');
        return node.v;
    };

    // Reserved words of the text format: out of place they are "unexpected
    // token", not "unknown operator".
    var KEYWORDS = {};
    ('module type func param result local import export table memory global elem data start offset item declare ' +
     'mut then else end funcref externref i32 i64 f32 f64 binary quote').split(' ').forEach(function (word) {
        KEYWORDS[word] = true;
    });

    ModuleParser.prototype.unexpected = function (node, context) {
        if (node === undefined)
            this.fail('unexpected end', context && context.line ? context : null);
        if (node.t === 'kw' && W.OBSOLETE[node.v] !== undefined)
            this.fail('unknown operator ' + node.v + ' (now ' + W.OBSOLETE[node.v] + ')', node);
        if (node.t === 'kw' && KEYWORDS[node.v] !== true && OPS[node.v] === undefined && !/^nan:/.test(node.v))
            this.fail('unknown operator ' + node.v, node);
        if (node.t === 'reserved')
            this.fail('unknown operator ' + node.v, node);
        this.fail('unexpected token ' + this.describe(node), node);
    };

    // An unsigned number (u32) from a token.
    ModuleParser.prototype.u32 = function (token, what) {
        if (token === undefined || token.t !== 'num')
            this.unexpected(token);
        var value = numbers.u32(token.v);
        if (value === null)
            this.fail('unexpected token ' + token.v + (what ? ' (expected ' + what + ')' : ''), token);
        if (value === undefined)
            this.fail('constant out of range', token);
        return value;
    };

    // A new name in the space space; a repeated one is an error.
    ModuleParser.prototype.bind = function (space, token, index) {
        if (token === undefined || token.t !== 'id')
            return;
        if (Object.prototype.hasOwnProperty.call(this.names[space], token.v))
            this.fail('duplicate ' + SPACE_NAMES[space].replace(' segment', '').replace('function', 'func') + ' ' + token.v, token);
        this.names[space][token.v] = index;
    };

    // An index by a name or a number.
    ModuleParser.prototype.index = function (space, token) {
        if (token === undefined)
            this.fail('unexpected end, expected ' + SPACE_NAMES[space] + ' index');
        if (token.t === 'id') {
            if (!Object.prototype.hasOwnProperty.call(this.names[space], token.v))
                this.fail('unknown ' + SPACE_NAMES[space] + ' ' + token.v, token);
            return this.names[space][token.v];
        }
        if (token.t === 'num')
            return this.u32(token);
        this.unexpected(token);
    };

    ModuleParser.prototype.isIndex = function (token) {
        return token !== undefined && (token.t === 'id' || (token.t === 'num' && numbers.u32(token.v) !== null));
    };

    // --- Types

    ModuleParser.prototype.valueType = function (token) {
        if (token !== undefined && token.t === 'kw' && W.VALUE_TYPES[token.v] === true)
            return token.v;
        if (token !== undefined && token.t === 'kw' && token.v === 'v128')
            this.fail('SIMD (v128) is not supported', token);
        if (token !== undefined && token.t === 'list' && W.headOf(token) === 'ref')
            this.fail('typed function references (ref ...) are not supported', token);
        if (token !== undefined && token.t === 'kw' && token.v === 'anyfunc')
            this.fail('unknown operator anyfunc (now funcref)', token);
        this.unexpected(token);
    };

    ModuleParser.prototype.refType = function (token) {
        if (token !== undefined && token.t === 'kw' && (token.v === 'funcref' || token.v === 'externref'))
            return token.v;
        if (token !== undefined && token.t === 'kw' && token.v === 'anyfunc')
            this.fail('unknown operator anyfunc (now funcref)', token);
        this.fail('malformed reference type' + (token ? ': ' + this.describe(token) : ''), token);
    };

    // (param ...)* (result ...)* from the cursor; names - allow parameter
    // names.
    ModuleParser.prototype.signature = function (cursor, allowNames) {
        var params = [], results = [], paramNames = [];
        while (cursor.isForm('param')) {
            var form = cursor.next();
            var inner = new Cursor(form.items, 1);
            if (inner.peek() !== undefined && inner.peek().t === 'id') {
                if (!allowNames)
                    this.unexpected(inner.peek());
                var name = inner.next();
                params.push(this.valueType(inner.next()));
                paramNames.push(name);
                if (!inner.atEnd())
                    this.unexpected(inner.peek());
                continue;
            }
            while (!inner.atEnd()) {
                params.push(this.valueType(inner.next()));
                paramNames.push(null);
            }
        }
        while (cursor.isForm('result')) {
            var resultForm = cursor.next();
            var resultCursor = new Cursor(resultForm.items, 1);
            while (!resultCursor.atEnd())
                results.push(this.valueType(resultCursor.next()));
        }
        if (cursor.isForm('param'))
            this.unexpected(cursor.peek());
        return { params: params, results: results, paramNames: paramNames };
    };

    function sameTypes(left, right) {
        if (left.length !== right.length)
            return false;
        for (var index = 0; index < left.length; ++index) {
            if (left[index] !== right[index])
                return false;
        }
        return true;
    }
    W.sameTypes = sameTypes;

    W.sameFuncType = function (left, right) {
        return sameTypes(left.params, right.params) && sameTypes(left.results, right.results);
    };

    // The index of the type with this signature; none - a new implicit one at the end.
    ModuleParser.prototype.typeFor = function (params, results) {
        var types = this.module.types;
        for (var index = 0; index < types.length; ++index) {
            if (sameTypes(types[index].params, params) && sameTypes(types[index].results, results))
                return index;
        }
        types.push({ params: params.slice(), results: results.slice() });
        return types.length - 1;
    };

    // typeuse: (type x)? (param)* (result)*. -> { index, type, paramNames }
    ModuleParser.prototype.typeUse = function (cursor, allowNames) {
        var start = cursor.peek();
        var index = null;
        if (cursor.isForm('type')) {
            var form = cursor.next();
            if (form.items.length !== 2)
                this.unexpected(form.items[2] || form, form);
            index = this.index('types', form.items[1]);
        }
        var signature = this.signature(cursor, allowNames);
        if (index !== null) {
            var declared = this.module.types[index];
            if (declared === undefined) {
                // An index out of range is a validation error, not a text
                // one; with an inline signature there is nothing to compare it with.
                if (signature.params.length > 0 || signature.results.length > 0)
                    this.fail('unknown type ' + index, start);
                return { index: index, type: null, paramNames: signature.paramNames, deferred: true };
            }
            if (signature.params.length > 0 || signature.results.length > 0) {
                if (!sameTypes(declared.params, signature.params) || !sameTypes(declared.results, signature.results))
                    this.fail('inline function type does not match (type ' + index + ')', start);
                return { index: index, type: declared, paramNames: signature.paramNames };
            }
            return { index: index, type: declared, paramNames: declared.params.map(function () { return null; }) };
        }
        var made = this.typeFor(signature.params, signature.results);
        return { index: made, type: this.module.types[made], paramNames: signature.paramNames };
    };

    // Limits: min max?
    ModuleParser.prototype.limits = function (cursor) {
        var min = this.u32(cursor.next(), 'size');
        var max = null;
        if (cursor.peek() !== undefined && cursor.peek().t === 'num')
            max = this.u32(cursor.next(), 'size');
        return { min: toNumber(min), max: max === null ? null : toNumber(max) };
    };

    function toNumber(value) {
        return typeof value === 'number' ? value : T.big.toFloat(value);
    }

    ModuleParser.prototype.tableType = function (cursor) {
        var limits = this.limits(cursor);
        limits.ref = this.refType(cursor.next());
        return limits;
    };

    ModuleParser.prototype.globalType = function (token) {
        if (W.isForm(token, 'mut')) {
            if (token.items.length !== 2)
                this.unexpected(token.items[2] || token, token);
            return { type: this.valueType(token.items[1]), mutable: true };
        }
        return { type: this.valueType(token), mutable: false };
    };

    // --- The first pass: indices and names of all definitions

    ModuleParser.prototype.inlineImport = function (cursor) {
        // (export "...")* (import "m" "n")?
        var exports = [];
        while (cursor.isForm('export')) {
            var form = cursor.next();
            exports.push(form);
        }
        var importForm = null;
        if (cursor.isForm('import'))
            importForm = cursor.next();
        return { exports: exports, importForm: importForm };
    };

    ModuleParser.prototype.checkImportOrder = function (node) {
        if (this.defined !== null)
            this.fail('import after ' + this.defined, node);
    };

    ModuleParser.prototype.declare = function (fields) {
        var self = this;
        fields.forEach(function (field) {
            var head = W.headOf(field);
            var cursor = new Cursor(field.items, 1);
            var id = NAMED_FIELDS[head] === 1 && cursor.peek() !== undefined && cursor.peek().t === 'id' ? cursor.next() : undefined;
            field.declared = {};
            switch (head) {
            case 'type': {
                self.bind('types', id, self.counts.types);
                field.declared.index = self.counts.types++;
                var form = cursor.next();
                if (!W.isForm(form, 'func'))
                    self.unexpected(form, field);
                var inner = new Cursor(form.items, 1);
                var signature = self.signature(inner, true);
                if (!inner.atEnd())
                    self.unexpected(inner.peek());
                if (!cursor.atEnd())
                    self.unexpected(cursor.peek());
                self.module.types.push({ params: signature.params, results: signature.results });
                break;
            }
            case 'import': {
                self.checkImportOrder(field);
                var description = field.items[3];
                var kind = W.headOf(description);
                var space = { func: 'funcs', table: 'tables', memory: 'mems', global: 'globals' }[kind];
                if (space === undefined)
                    self.unexpected(description, field);
                var descriptionId = description.items[1] !== undefined && description.items[1].t === 'id' ? description.items[1] : undefined;
                self.bind(space, descriptionId, self.counts[space]);
                field.declared.index = self.counts[space]++;
                break;
            }
            case 'func':
            case 'table':
            case 'memory':
            case 'global': {
                var spaceName = { func: 'funcs', table: 'tables', memory: 'mems', global: 'globals' }[head];
                self.bind(spaceName, id, self.counts[spaceName]);
                field.declared.index = self.counts[spaceName]++;
                var inline = self.inlineImport(cursor);
                if (inline.importForm !== null)
                    self.checkImportOrder(field);
                else if (self.defined === null)
                    self.defined = head === 'func' ? 'function' : head;
                // A table with (elem ...) and a memory with (data ...) - one more segment.
                if (head === 'table' && inline.importForm === null) {
                    var hasElem = false;
                    for (var itemIndex = cursor.i; itemIndex < field.items.length; ++itemIndex) {
                        if (W.isForm(field.items[itemIndex], 'elem'))
                            hasElem = true;
                    }
                    if (hasElem)
                        field.declared.elem = self.counts.elems++;
                }
                if (head === 'memory' && inline.importForm === null && cursor.isForm('data'))
                    field.declared.data = self.counts.datas++;
                break;
            }
            case 'elem':
                self.bind('elems', id, self.counts.elems);
                field.declared.index = self.counts.elems++;
                break;
            case 'data':
                self.bind('datas', id, self.counts.datas);
                field.declared.index = self.counts.datas++;
                break;
            case 'export':
            case 'start':
                break;
            default:
                self.unexpected(field.items[0] || field, field);
            }
        });
        this.explicitTypes = this.module.types.length;
    };

    // --- The second pass

    ModuleParser.prototype.name = function (token) {
        if (token === undefined || token.t !== 'str')
            this.unexpected(token);
        var text = W.decodeUtf8(token.bytes);
        if (text === null)
            this.fail('malformed UTF-8 encoding', token);
        return text;
    };

    ModuleParser.prototype.addExports = function (forms, kind, index) {
        var self = this;
        forms.forEach(function (form) {
            if (form.items.length !== 2)
                self.unexpected(form.items[2] || form, form);
            self.module.exports.push({ name: self.name(form.items[1]), kind: kind, index: index, line: form.line });
        });
    };

    ModuleParser.prototype.addImport = function (form, kind, index, field) {
        if (form.items.length !== 3)
            this.unexpected(form.items[3] || form, form);
        var entry = { module: this.name(form.items[1]), name: this.name(form.items[2]), kind: kind, index: index,
                      line: (field || form).line };
        this.module.imports.push(entry);
        return entry;
    };

    // Fields that may have a name of their own ($id).
    var NAMED_FIELDS = { type: 1, func: 1, table: 1, memory: 1, global: 1, elem: 1, data: 1 };

    ModuleParser.prototype.field = function (field) {
        var head = W.headOf(field);
        var cursor = new Cursor(field.items, 1);
        var id = NAMED_FIELDS[head] === 1 && cursor.peek() !== undefined && cursor.peek().t === 'id' ? cursor.next() : undefined;
        var module = this.module;
        switch (head) {
        case 'type':
            return;
        case 'import': {
            var importModule = cursor.next(), importName = cursor.next();
            var description = cursor.next();
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            var kind = W.headOf(description);
            var inner = new Cursor(description.items, 1);
            if (inner.peek() !== undefined && inner.peek().t === 'id')
                inner.next();
            var entry = { module: this.name(importModule), name: this.name(importName), line: field.line };
            this.describeImport(kind, inner, entry, field.declared.index, field);
            if (!inner.atEnd())
                this.unexpected(inner.peek());
            return;
        }
        case 'func':
            return this.func(field, cursor, id);
        case 'table':
            return this.table(field, cursor, id);
        case 'memory':
            return this.memory(field, cursor, id);
        case 'global':
            return this.global(field, cursor, id);
        case 'export': {
            var exportName = this.name(cursor.next());
            var target = cursor.next();
            var exportKind = W.headOf(target);
            var exportSpace = { func: 'funcs', table: 'tables', memory: 'mems', global: 'globals' }[exportKind];
            if (exportSpace === undefined || target.items.length !== 2)
                this.unexpected(target, field);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            module.exports.push({ name: exportName, kind: exportKind, index: this.index(exportSpace, target.items[1]),
                                  line: field.line });
            return;
        }
        case 'start':
            if (module.start !== null)
                this.fail('multiple start sections', field);
            module.start = { index: this.index('funcs', cursor.next()), line: field.line };
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            return;
        case 'elem':
            return this.elem(field, cursor, id);
        case 'data':
            return this.data(field, cursor, id);
        }
    };

    // An import description (func/table/memory/global) - into the right space.
    ModuleParser.prototype.describeImport = function (kind, cursor, entry, index, field) {
        var module = this.module;
        entry.kind = kind;
        entry.index = index;
        module.imports.push(entry);
        switch (kind) {
        case 'func': {
            var use = this.typeUse(cursor, true);
            module.funcs[index] = { typeIndex: use.index, import: entry, line: field.line, name: this.idOf(field) };
            break;
        }
        case 'table':
            module.tables[index] = { type: this.tableType(cursor), import: entry, line: field.line };
            break;
        case 'memory':
            module.mems[index] = { type: this.limits(cursor), import: entry, line: field.line };
            break;
        case 'global':
            module.globals[index] = { type: this.globalType(cursor.next()), import: entry, line: field.line };
            break;
        }
    };

    ModuleParser.prototype.idOf = function (field) {
        var item = field.items[1];
        if (item !== undefined && item.t === 'id')
            return item.v.substring(1);
        if (W.headOf(field) === 'import') {
            var description = field.items[3];
            if (description !== undefined && description.items[1] !== undefined && description.items[1].t === 'id')
                return description.items[1].v.substring(1);
        }
        return null;
    };

    ModuleParser.prototype.func = function (field, cursor, id) {
        var index = field.declared.index;
        var inline = this.inlineImport(cursor);
        this.addExports(inline.exports, 'func', index);
        if (inline.importForm !== null) {
            var entry = this.addImport(inline.importForm, 'func', index, field);
            this.module.imports.pop();
            this.describeImport('func', cursor, entry, index, field);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            return;
        }
        var use = this.typeUse(cursor, true);
        var func = { typeIndex: use.index, import: null, locals: [], body: null, line: field.line, endLine: field.endLine,
                     name: id !== undefined ? id.v.substring(1) : null };
        this.module.funcs[index] = func;
        // Locals: the parameters, then (local ...).
        var localNames = {};
        var localCount = 0;
        var self = this;
        var paramCount = use.type !== null ? use.type.params.length : use.paramNames.length;
        for (var paramIndex = 0; paramIndex < paramCount; ++paramIndex) {
            var paramName = use.paramNames[paramIndex];
            if (paramName) {
                if (Object.prototype.hasOwnProperty.call(localNames, paramName.v))
                    self.fail('duplicate local ' + paramName.v, paramName);
                localNames[paramName.v] = localCount;
            }
            ++localCount;
        }
        while (cursor.isForm('local')) {
            var form = cursor.next();
            var inner = new Cursor(form.items, 1);
            if (inner.peek() !== undefined && inner.peek().t === 'id') {
                var name = inner.next();
                if (Object.prototype.hasOwnProperty.call(localNames, name.v))
                    this.fail('duplicate local ' + name.v, name);
                localNames[name.v] = localCount++;
                func.locals.push(this.valueType(inner.next()));
                if (!inner.atEnd())
                    this.unexpected(inner.peek());
                continue;
            }
            while (!inner.atEnd()) {
                func.locals.push(this.valueType(inner.next()));
                ++localCount;
            }
        }
        var context = { locals: localNames, labels: [] };
        func.body = this.instructions(cursor, context, null);
    };

    ModuleParser.prototype.table = function (field, cursor) {
        var index = field.declared.index;
        var inline = this.inlineImport(cursor);
        this.addExports(inline.exports, 'table', index);
        if (inline.importForm !== null) {
            var entry = this.addImport(inline.importForm, 'table', index, field);
            this.module.imports.pop();
            this.describeImport('table', cursor, entry, index, field);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            return;
        }
        // reftype (elem ...) - a table exactly by the list and an active segment.
        if (cursor.peek() !== undefined && cursor.peek().t === 'kw' && W.isForm(cursor.peek(1), 'elem')) {
            var ref = this.refType(cursor.next());
            var elemForm = cursor.next();
            var elemCursor = new Cursor(elemForm.items, 1);
            var init;
            if (elemCursor.peek() !== undefined && elemCursor.peek().t === 'list')
                init = this.elemExprs(elemCursor, ref);
            else
                init = this.funcIndices(elemCursor);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            this.module.tables[index] = { type: { min: init.length, max: init.length, ref: ref }, import: null, line: field.line };
            this.module.elems[field.declared.elem] = {
                mode: 'active', table: index, offset: [{ op: 'i32.const', value: 0, line: field.line }],
                type: ref, init: init, line: field.line
            };
            return;
        }
        var type = this.tableType(cursor);
        if (!cursor.atEnd())
            this.unexpected(cursor.peek());
        this.module.tables[index] = { type: type, import: null, line: field.line };
    };

    ModuleParser.prototype.memory = function (field, cursor) {
        var index = field.declared.index;
        var inline = this.inlineImport(cursor);
        this.addExports(inline.exports, 'memory', index);
        if (inline.importForm !== null) {
            var entry = this.addImport(inline.importForm, 'memory', index, field);
            this.module.imports.pop();
            this.describeImport('memory', cursor, entry, index, field);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            return;
        }
        if (cursor.isForm('data')) {
            var form = cursor.next();
            var bytes = this.strings(new Cursor(form.items, 1));
            var pages = Math.ceil(bytes.length / 65536);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            this.module.mems[index] = { type: { min: pages, max: pages }, import: null, line: field.line };
            this.module.datas[field.declared.data] = {
                mode: 'active', memory: index, offset: [{ op: 'i32.const', value: 0, line: field.line }],
                bytes: bytes, line: field.line
            };
            return;
        }
        var limits = this.limits(cursor);
        if (!cursor.atEnd())
            this.unexpected(cursor.peek());
        this.module.mems[index] = { type: limits, import: null, line: field.line };
    };

    ModuleParser.prototype.global = function (field, cursor) {
        var index = field.declared.index;
        var inline = this.inlineImport(cursor);
        this.addExports(inline.exports, 'global', index);
        if (inline.importForm !== null) {
            var entry = this.addImport(inline.importForm, 'global', index, field);
            this.module.imports.pop();
            this.describeImport('global', cursor, entry, index, field);
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            return;
        }
        var type = this.globalType(cursor.next());
        var init = this.instructions(cursor, { locals: {}, labels: [] }, null);
        this.module.globals[index] = { type: type, import: null, init: init, line: field.line };
    };

    ModuleParser.prototype.strings = function (cursor) {
        var bytes = [];
        while (!cursor.atEnd()) {
            var token = cursor.next();
            if (token.t !== 'str')
                this.unexpected(token);
            for (var index = 0; index < token.bytes.length; ++index)
                bytes.push(token.bytes[index]);
        }
        return bytes;
    };

    ModuleParser.prototype.funcIndices = function (cursor) {
        var init = [];
        while (!cursor.atEnd()) {
            var token = cursor.next();
            init.push([{ op: 'ref.func', func: this.index('funcs', token), line: token.line }]);
        }
        return init;
    };

    // Elements: (item instr*) or one folded instruction.
    ModuleParser.prototype.elemExprs = function (cursor) {
        var init = [];
        while (!cursor.atEnd()) {
            var form = cursor.next();
            if (form.t !== 'list')
                this.unexpected(form);
            if (W.headOf(form) === 'item') {
                init.push(this.instructions(new Cursor(form.items, 1), { locals: {}, labels: [] }, null));
            } else {
                var out = [];
                this.folded(form, { locals: {}, labels: [] }, out);
                init.push(out);
            }
        }
        return init;
    };

    // An offset: (offset instr*) or one folded instruction.
    ModuleParser.prototype.offset = function (cursor) {
        var form = cursor.next();
        if (form === undefined || form.t !== 'list')
            this.unexpected(form);
        if (W.headOf(form) === 'offset')
            return this.instructions(new Cursor(form.items, 1), { locals: {}, labels: [] }, null);
        var out = [];
        this.folded(form, { locals: {}, labels: [] }, out);
        return out;
    };

    ModuleParser.prototype.elem = function (field, cursor) {
        var segment = { mode: 'passive', table: 0, offset: null, type: 'funcref', init: [], line: field.line };
        var explicitTable = false;
        if (cursor.isKw('declare')) {
            cursor.next();
            segment.mode = 'declarative';
        } else {
            if (cursor.isForm('table')) {
                var tableForm = cursor.next();
                if (tableForm.items.length !== 2)
                    this.unexpected(tableForm.items[2] || tableForm, tableForm);
                segment.table = this.index('tables', tableForm.items[1]);
                explicitTable = true;
                segment.mode = 'active';
            } else if (cursor.peek() !== undefined && this.isIndex(cursor.peek()) && W.isForm(cursor.peek(1))) {
                // (elem 0 (offset ...) ...) - the old notation of the table index.
                segment.table = this.index('tables', cursor.next());
                explicitTable = true;
                segment.mode = 'active';
            }
            if (segment.mode === 'active' || (cursor.peek() !== undefined && cursor.peek().t === 'list')) {
                segment.mode = 'active';
                segment.offset = this.offset(cursor);
            }
        }
        // A list: func x*, reftype expr*, or (an abbreviation) x*.
        if (cursor.isKw('func')) {
            cursor.next();
            segment.init = this.funcIndices(cursor);
        } else if (cursor.peek() !== undefined && cursor.peek().t === 'kw') {
            segment.type = this.refType(cursor.next());
            segment.init = this.elemExprs(cursor);
        } else {
            if (explicitTable && !cursor.atEnd())
                this.unexpected(cursor.peek());
            if (segment.mode !== 'active' && !cursor.atEnd())
                this.unexpected(cursor.peek());
            segment.init = this.funcIndices(cursor);
        }
        this.module.elems[field.declared.index] = segment;
    };

    ModuleParser.prototype.data = function (field, cursor) {
        var segment = { mode: 'passive', memory: 0, offset: null, bytes: null, line: field.line };
        if (cursor.isForm('memory')) {
            var memoryForm = cursor.next();
            if (memoryForm.items.length !== 2)
                this.unexpected(memoryForm.items[2] || memoryForm, memoryForm);
            segment.memory = this.index('mems', memoryForm.items[1]);
            segment.mode = 'active';
        } else if (cursor.peek() !== undefined && this.isIndex(cursor.peek()) && W.isForm(cursor.peek(1))) {
            segment.memory = this.index('mems', cursor.next());
            segment.mode = 'active';
        }
        if (segment.mode === 'active' || cursor.isForm()) {
            segment.mode = 'active';
            segment.offset = this.offset(cursor);
        }
        segment.bytes = this.strings(cursor);
        this.module.datas[field.declared.index] = segment;
    };

    // --- Instructions

    // A list of instructions up to the end of the cursor or a word from stops (end, else).
    ModuleParser.prototype.instructions = function (cursor, context, stops) {
        var out = [];
        while (!cursor.atEnd()) {
            var item = cursor.peek();
            if (item.t === 'list') {
                cursor.next();
                this.folded(item, context, out);
                continue;
            }
            if (item.t === 'kw' && stops !== null && stops.indexOf(item.v) >= 0)
                return out;
            this.plain(cursor, context, out);
        }
        if (stops !== null)
            this.fail('unexpected end, expected ' + stops.join(' or '), cursor.items[cursor.items.length - 1]);
        return out;
    };

    // A block label: $name? -> the name or null.
    ModuleParser.prototype.label = function (cursor) {
        if (cursor.peek() !== undefined && cursor.peek().t === 'id')
            return cursor.next().v;
        return null;
    };

    // A block type: (type x)? (param)* (result)* -> { params, results }.
    ModuleParser.prototype.blockType = function (cursor) {
        if (cursor.isForm('type')) {
            var use = this.typeUse(cursor, false);
            return { params: use.type ? use.type.params : [], results: use.type ? use.type.results : [], index: use.index,
                     deferred: use.deferred === true };
        }
        var signature = this.signature(cursor, false);
        if (signature.params.length === 0 && signature.results.length <= 1)
            return { params: [], results: signature.results, index: null };
        var index = this.typeFor(signature.params, signature.results);
        return { params: signature.params, results: signature.results, index: index };
    };

    // A branch by a label: a number is the depth, a name the nearest block with it.
    ModuleParser.prototype.depth = function (token, context) {
        if (token !== undefined && token.t === 'id') {
            for (var index = context.labels.length - 1; index >= 0; --index) {
                if (context.labels[index] === token.v)
                    return context.labels.length - 1 - index;
            }
            this.fail('unknown label ' + token.v, token);
        }
        if (token === undefined || token.t !== 'num')
            this.unexpected(token);
        return this.u32(token);
    };

    ModuleParser.prototype.closingLabel = function (cursor, label) {
        if (cursor.peek() !== undefined && cursor.peek().t === 'id') {
            var token = cursor.next();
            if (token.v !== label)
                this.fail('mismatching label ' + token.v, token);
        }
    };

    ModuleParser.prototype.plain = function (cursor, context, out) {
        var token = cursor.next();
        if (token.t !== 'kw')
            this.unexpected(token);
        var name = token.v;
        if (name === 'block' || name === 'loop' || name === 'if') {
            var label = this.label(cursor);
            var type = this.blockType(cursor);
            context.labels.push(label);
            var node = { op: name, label: label, type: type, line: token.line, col: token.col };
            if (name === 'if') {
                node.then = this.instructions(cursor, context, ['else', 'end']);
                node.else = [];
                if (cursor.isKw('else')) {
                    cursor.next();
                    this.closingLabel(cursor, label);
                    node.else = this.instructions(cursor, context, ['end']);
                }
            } else {
                node.body = this.instructions(cursor, context, ['end']);
            }
            context.labels.pop();
            node.endLine = cursor.peek().line;
            cursor.next();
            this.closingLabel(cursor, label);
            out.push(node);
            return;
        }
        if (name === 'end' || name === 'else' || name === 'then')
            this.unexpected(token);
        out.push(this.operator(token, cursor, context));
    };

    // A folded form: (block ...), (loop ...), (if ...), (op imm* operand*).
    ModuleParser.prototype.folded = function (form, context, out) {
        var head = form.items[0];
        if (head === undefined || head.t !== 'kw')
            this.unexpected(head || form, form);
        var cursor = new Cursor(form.items, 1);
        var name = head.v;
        if (name === 'block' || name === 'loop') {
            var label = this.label(cursor);
            var type = this.blockType(cursor);
            context.labels.push(label);
            var body = this.instructions(cursor, context, null);
            context.labels.pop();
            out.push({ op: name, label: label, type: type, body: body, line: head.line, col: head.col,
                       endLine: form.endLine });
            return;
        }
        if (name === 'if') {
            var ifLabel = this.label(cursor);
            var ifType = this.blockType(cursor);
            while (!cursor.atEnd() && !cursor.isForm('then')) {
                var condition = cursor.next();
                if (condition.t !== 'list')
                    this.unexpected(condition);
                this.folded(condition, context, out);
            }
            if (!cursor.isForm('then'))
                this.fail('unexpected end, expected (then ...)', form);
            context.labels.push(ifLabel);
            var thenForm = cursor.next();
            var node = { op: 'if', label: ifLabel, type: ifType, line: head.line, col: head.col, endLine: form.endLine };
            node.then = this.instructions(new Cursor(thenForm.items, 1), context, null);
            node.else = [];
            if (cursor.isForm('else'))
                node.else = this.instructions(new Cursor(cursor.next().items, 1), context, null);
            context.labels.pop();
            if (!cursor.atEnd())
                this.unexpected(cursor.peek());
            out.push(node);
            return;
        }
        var instruction = this.operator(head, cursor, context);
        while (!cursor.atEnd()) {
            var operand = cursor.next();
            if (operand.t !== 'list')
                this.unexpected(operand);
            this.folded(operand, context, out);
        }
        out.push(instruction);
    };

    // An instruction and its immediate operands from the cursor.
    ModuleParser.prototype.operator = function (token, cursor, context) {
        var name = token.v;
        var info = OPS[name];
        if (info === undefined || name === 'block' || name === 'loop' || name === 'if') {
            if (KEYWORDS[name] === true)
                this.unexpected(token);
            if (/^(?:v128|[if](?:8x16|16x8|32x4|64x2))\./.test(name))
                this.fail('SIMD instructions are not supported: ' + name, token);
            if (W.OBSOLETE[name] !== undefined)
                this.fail('unknown operator ' + name + ' (now ' + W.OBSOLETE[name] + ')', token);
            if (/^return_call/.test(name) || /^(?:try|throw|catch|rethrow|delegate)/.test(name))
                this.fail(name + ' is not supported (WebAssembly 3.0)', token);
            this.fail('unknown operator ' + name, token);
        }
        var node = { op: name, line: token.line, col: token.col };
        var next;
        switch (info.imm) {
        case '':
        case 'memory':
            break;
        case 'memory2':
            break;
        case 'label':
            node.depth = this.depth(cursor.next(), context);
            break;
        case 'labels': {
            var depths = [];
            while (cursor.peek() !== undefined && (cursor.peek().t === 'id' || cursor.peek().t === 'num'))
                depths.push(this.depth(cursor.next(), context));
            if (depths.length === 0)
                this.unexpected(cursor.peek());
            node.default = depths.pop();
            node.depths = depths;
            break;
        }
        case 'func':
            node.func = this.index('funcs', cursor.next());
            break;
        case 'call_indirect': {
            node.table = 0;
            if (this.isIndex(cursor.peek()))
                node.table = this.index('tables', cursor.next());
            var use = this.typeUse(cursor, false);
            node.typeIndex = use.index;
            break;
        }
        case 'select': {
            if (cursor.isForm('result')) {
                var types = [];
                while (cursor.isForm('result')) {
                    var form = cursor.next();
                    for (var itemIndex = 1; itemIndex < form.items.length; ++itemIndex)
                        types.push(this.valueType(form.items[itemIndex]));
                }
                node.types = types;
            } else {
                node.types = null;
            }
            break;
        }
        case 'local':
            next = cursor.next();
            if (next !== undefined && next.t === 'id') {
                if (!Object.prototype.hasOwnProperty.call(context.locals, next.v))
                    this.fail('unknown local ' + next.v, next);
                node.index = context.locals[next.v];
            } else {
                if (next === undefined || next.t !== 'num')
                    this.unexpected(next);
                node.index = this.u32(next);
            }
            break;
        case 'global':
            node.index = this.index('globals', cursor.next());
            break;
        case 'table':
            node.table = this.isIndex(cursor.peek()) ? this.index('tables', cursor.next()) : 0;
            break;
        case 'table_copy':
            if (this.isIndex(cursor.peek())) {
                node.dst = this.index('tables', cursor.next());
                node.src = this.index('tables', cursor.next());
            } else {
                node.dst = 0;
                node.src = 0;
            }
            break;
        case 'table_init':
            if (this.isIndex(cursor.peek()) && this.isIndex(cursor.peek(1))) {
                node.table = this.index('tables', cursor.next());
                node.elem = this.index('elems', cursor.next());
            } else {
                node.table = 0;
                node.elem = this.index('elems', cursor.next());
            }
            break;
        case 'elem':
            node.elem = this.index('elems', cursor.next());
            break;
        case 'data':
            node.data = this.index('datas', cursor.next());
            break;
        case 'heaptype':
            next = cursor.next();
            if (next !== undefined && next.t === 'kw' && (next.v === 'func' || next.v === 'extern'))
                node.ref = next.v + 'ref';
            else
                this.fail('malformed reference type' + (next ? ': ' + this.describe(next) : ''), next || token);
            break;
        case 'memarg': {
            node.offset = 0;
            node.align = info.natural;
            next = cursor.peek();
            if (next !== undefined && next.t === 'kw' && next.v.substring(0, 7) === 'offset=') {
                cursor.next();
                var offset = numbers.u32(next.v.substring(7));
                if (offset === null)
                    this.unexpected(next);
                if (offset === undefined)
                    this.fail('constant out of range', next);
                node.offset = typeof offset === 'number' ? offset : T.big.toFloat(offset);
                next = cursor.peek();
            }
            if (next !== undefined && next.t === 'kw' && next.v.substring(0, 6) === 'align=') {
                cursor.next();
                var align = numbers.u32(next.v.substring(6));
                if (align === null || align === undefined)
                    this.unexpected(next);
                align = typeof align === 'number' ? align : T.big.toFloat(align);
                if (align === 0 || (align & (align - 1)) !== 0)
                    this.fail('alignment must be a power of two', next);
                node.align = Math.round(Math.log(align) / Math.LN2);
                node.alignGiven = true;
            }
            break;
        }
        case 'i32':
        case 'i64': {
            next = cursor.next();
            if (next === undefined || next.t !== 'num')
                this.unexpected(next, token);
            var value = numbers[info.imm](next.v);
            if (value === null)
                this.unexpected(next);
            if (value === undefined)
                this.fail('constant out of range', next);
            node.value = value;
            break;
        }
        case 'f32':
        case 'f64': {
            next = cursor.next();
            if (next === undefined || next.t !== 'num')
                this.unexpected(next, token);
            var parsed = numbers.float(next.v, info.imm);
            if (parsed === null)
                this.unexpected(next);
            if (parsed === undefined)
                this.fail('constant out of range', next);
            node.value = parsed.value;
            if (parsed.nan !== null) {
                node.nan = parsed.nan;
                node.negative = parsed.negative;
            }
            break;
        }
        default:
            throw new Error('operator kind ' + info.imm);
        }
        return node;
    };

    // --- A whole module

    // form - (module $id? field*) or null; fields - the list of fields.
    W.parseModule = function (fields, options) {
        var parser = new ModuleParser(options && options.source);
        var module = parser.module;
        if (options && options.id)
            module.id = options.id;
        if (options && options.line)
            module.line = options.line;
        fields.forEach(function (field) {
            if (field.t !== 'list' || FIELD_KINDS[W.headOf(field)] !== 1)
                parser.unexpected(field.t === 'list' ? field.items[0] || field : field);
        });
        parser.declare(fields);
        fields.forEach(function (field) {
            parser.field(field);
        });
        module.names = parser.names;
        return module;
    };

    // The number of the immediate operand of a constant instruction (for
    // script commands): (i32.const 1) -> the value.
    W.parseConstant = function (form, source) {
        var parser = new ModuleParser(source);
        var head = form.items[0];
        var cursor = new Cursor(form.items, 1);
        var node = parser.operator(head, cursor, { locals: {}, labels: [] });
        if (!cursor.atEnd())
            parser.unexpected(cursor.peek());
        return node;
    };

    W.ModuleParser = ModuleParser;
    W.Cursor = Cursor;
})(globalThis);
