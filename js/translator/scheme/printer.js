// Scheme: printing values - write, display, write-shared, write-simple.
// Cycles print with the labels #n= and #n# (write and display), shared
// parts with labels in write-shared. The walk uses its own stack: deep
// lists do not hit the JavaScript stack.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.write)
        return;

    var Pair = S.Pair, NIL = S.NIL, Sym = S.Sym, Char = S.Char, SString = S.SString;
    var Record = S.Record;

    var CHAR_NAMES = { 0: 'null', 7: 'alarm', 8: 'backspace', 9: 'tab', 10: 'newline', 13: 'return', 27: 'escape',
                       32: 'space', 127: 'delete' };
    var STRING_ESCAPES = { 7: '\\a', 8: '\\b', 9: '\\t', 10: '\\n', 13: '\\r', 34: '\\"', 92: '\\\\' };

    function hex(code) {
        return code.toString(16);
    }

    function isGraphic(code) {
        return code > 32 && code !== 127 && !(code >= 0x80 && code < 0xA0) && code !== 0xA0 &&
            !(code >= 0x2000 && code <= 0x200F) && code !== 0x2028 && code !== 0x2029 && code !== 0xFEFF &&
            !(code >= 0xD800 && code <= 0xDFFF);
    }

    function writeChar(code) {
        if (CHAR_NAMES[code] !== undefined)
            return '#\\' + CHAR_NAMES[code];
        if (!isGraphic(code))
            return '#\\x' + hex(code);
        return '#\\' + String.fromCodePoint(code);
    }

    function writeString(text) {
        var result = '"';
        for (var index = 0; index < text.length; ++index) {
            var code = text.charCodeAt(index);
            var escape = STRING_ESCAPES[code];
            if (escape !== undefined)
                result += escape;
            else if (code < 32 || code === 127)
                result += '\\x' + hex(code) + ';';
            else
                result += text.charAt(index);
        }
        return result + '"';
    }

    // A symbol name that reads back to the same symbol goes without |...|.
    function symbolNeedsBars(name) {
        if (name.length === 0 || name === '.')
            return true;
        if (/[\s()\[\]"';`,|{}]/.test(name) || /[\x00-\x1f\x7f]/.test(name))
            return true;
        if (name.charAt(0) === '#')
            return true;
        if (S.N.parse(name, 10) !== null)
            return true;
        return false;
    }

    function writeSymbol(name) {
        if (!symbolNeedsBars(name))
            return name;
        var result = '|';
        for (var index = 0; index < name.length; ++index) {
            var code = name.charCodeAt(index);
            if (code === 124 || code === 92)
                result += '\\' + name.charAt(index);
            else if (code < 32 || code === 127)
                result += '\\x' + hex(code) + ';';
            else
                result += name.charAt(index);
        }
        return result + '|';
    }

    function recordName(type) {
        var name = type.name;
        if (name.length > 2 && name.charAt(0) === '<' && name.charAt(name.length - 1) === '>')
            name = name.substring(1, name.length - 1);
        return name;
    }

    function procedureName(fn) {
        if (fn.$name !== undefined)
            return fn.$name;
        var name = S.procNames[fn.name];
        return name === undefined ? '' : name;
    }
    S.procNames = Object.create(null);
    S.procedureName = procedureName;

    // The parts of a value that print as values (for finding cycles).
    function children(value) {
        if (value instanceof Pair)
            return [value.car, value.cdr];
        if (Array.isArray(value))
            return value;
        if (value instanceof Record)
            return value.v;
        return null;
    }

    function isContainer(value) {
        return value instanceof Pair || Array.isArray(value) || value instanceof Record;
    }

    // Objects that need a label: in a cycle (shared - false) or met more
    // than once (shared - true).
    function findLabels(root, shared) {
        if (!isContainer(root))
            return null;
        var state = new Map();   // 1 - on the walk path, 2 - done
        var labels = null;
        var stack = [{ value: root, items: children(root), index: 0 }];
        state.set(root, 1);
        while (stack.length > 0) {
            var top = stack[stack.length - 1];
            if (top.index >= top.items.length) {
                state.set(top.value, 2);
                stack.pop();
                continue;
            }
            var child = top.items[top.index++];
            if (!isContainer(child))
                continue;
            var seen = state.get(child);
            if (seen === undefined) {
                state.set(child, 1);
                stack.push({ value: child, items: children(child), index: 0 });
            } else if (seen === 1 || shared) {
                if (labels === null)
                    labels = new Map();
                labels.set(child, -1);
            }
        }
        return labels;
    }

    function Literal(text) {
        this.text = text;
    }
    var OPEN = new Literal('('), CLOSE = new Literal(')'), SPACE = new Literal(' '), DOT = new Literal(' . ');

    // Printing a value: mode - 'write', 'display', 'shared', 'simple'.
    function write(value, mode) {
        var display = mode === 'display';
        var labels = mode === 'simple' ? null : findLabels(value, mode === 'shared');
        var nextLabel = 0;
        var out = [];
        var work = [value];
        while (work.length > 0) {
            var item = work.pop();
            if (item instanceof Literal) {
                out.push(item.text);
                continue;
            }
            if (labels !== null && isContainer(item)) {
                var label = labels.get(item);
                if (label !== undefined) {
                    if (label >= 0) {
                        out.push('#' + label + '#');
                        continue;
                    }
                    labels.set(item, nextLabel);
                    out.push('#' + (nextLabel++) + '=');
                }
            }
            if (item instanceof Pair) {
                // The elements up to the tail; a tail with a label prints after " . ".
                var elements = [item.car];
                var tail = item.cdr;
                while (tail instanceof Pair && (labels === null || !labels.has(tail))) {
                    elements.push(tail.car);
                    tail = tail.cdr;
                }
                work.push(CLOSE);
                if (tail !== NIL) {
                    work.push(tail);
                    work.push(DOT);
                }
                for (var index = elements.length - 1; index >= 0; --index) {
                    work.push(elements[index]);
                    if (index > 0)
                        work.push(SPACE);
                }
                out.push('(');
                continue;
            }
            if (Array.isArray(item)) {
                work.push(CLOSE);
                for (var position = item.length - 1; position >= 0; --position) {
                    work.push(item[position]);
                    if (position > 0)
                        work.push(SPACE);
                }
                out.push('#(');
                continue;
            }
            if (item instanceof Record) {
                work.push(new Literal('>'));
                var fields = item.type.fields;
                for (var fieldIndex = fields.length - 1; fieldIndex >= 0; --fieldIndex) {
                    work.push(item.v[fieldIndex]);
                    work.push(new Literal(' ' + fields[fieldIndex] + ': '));
                }
                out.push('#<' + recordName(item.type));
                continue;
            }
            out.push(atom(item, display));
        }
        return out.join('');
    }

    function atom(value, display) {
        if (typeof value === 'number' || S.N.isNumber(value))
            return S.N.numberToString(value, 10);
        if (value === true)
            return '#t';
        if (value === false)
            return '#f';
        if (value === NIL)
            return '()';
        if (value instanceof SString)
            return display ? value.s : writeString(value.s);
        if (value instanceof Sym)
            return display ? value.name : writeSymbol(value.name);
        if (value instanceof Char)
            return display ? String.fromCodePoint(value.code) : writeChar(value.code);
        if (typeof value === 'function')
            return describeProcedure(value);
        if (value === S.UNSPEC)
            return '#<unspecified>';
        if (value === S.EOF)
            return '#<eof>';
        if (value === S.DEFAULT)
            return '#<default>';
        if (value instanceof Uint8Array) {
            var bytes = [];
            for (var index = 0; index < value.length; ++index)
                bytes.push(value[index]);
            return '#u8(' + bytes.join(' ') + ')';
        }
        if (value instanceof S.Values)
            return value.list.map(function (item) { return write(item, display ? 'display' : 'write'); }).join(' ');
        if (value instanceof S.ErrorObject) {
            var parts = [writeString(value.message)];
            S.listToArray(value.irritants).forEach(function (irritant) { parts.push(write(irritant, 'write')); });
            return '#<error ' + parts.join(' ') + '>';
        }
        if (value instanceof S.Promise)
            return '#<promise>';
        if (value instanceof S.EnvironmentObject)
            return '#<environment>';
        if (value !== null && typeof value === 'object' && typeof value.describe === 'function' && value.$scheme === true)
            return value.describe();
        return S.formatJs(value);
    }

    function describeProcedure(fn) {
        if (fn.$cont === true)
            return '#<continuation>';
        if (fn.$param !== undefined)
            return '#<parameter>';
        var name = procedureName(fn);
        return name.length > 0 ? '#<procedure ' + name + '>' : '#<procedure>';
    }

    // A JavaScript value (an API object, null): as the console shows it.
    S.formatJs = function (value) {
        if (value === null)
            return 'null';
        if (value === undefined)
            return 'undefined';
        try {
            return String(value);
        } catch (error) {
            return '#<js-object>';
        }
    };

    S.write = write;
    S.writeString = writeString;
    S.writeChar = writeChar;
    S.writeSymbol = writeSymbol;
    S.display = function (value) {
        return write(value, 'display');
    };
})(globalThis);
