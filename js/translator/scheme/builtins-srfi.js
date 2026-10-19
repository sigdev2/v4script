// Scheme: SRFI 1 (lists), 13 (strings), 69 (hash tables), 18 (threads) -
// the parts without procedure arguments. The higher-order procedures of
// these SRFIs are written in Scheme in library.js.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var S = T.scheme;
    if (S.HashTable)
        return;

    var N = S.N;
    var Pair = S.Pair, NIL = S.NIL, SString = S.SString, Char = S.Char, Sym = S.Sym, UNSPEC = S.UNSPEC;
    var Values = S.Values;
    var def = S.def, defCps = S.defCps;
    var check = S.check;
    var slice = Array.prototype.slice;

    function items(name, value) {
        return check.list(name, value);
    }

    // --- SRFI 1

    def('xcons', 2, 2, function (tail, head) { return new Pair(head, tail); });
    def('cons*', 1, -1, function () {
        var result = arguments[arguments.length - 1];
        for (var index = arguments.length - 2; index >= 0; --index)
            result = new Pair(arguments[index], result);
        return result;
    });
    S.alias('list*', 'cons*');
    def('iota', 1, 3, function (count, start, step) {
        check.natural('iota', count);
        start = start === undefined ? 0 : N.checkNumber('iota', start);
        step = step === undefined ? 1 : N.checkNumber('iota', step);
        var result = NIL;
        for (var index = count - 1; index >= 0; --index)
            result = new Pair(N.add(start, N.mul(index, step)), result);
        return result;
    });
    def('circular-list', 1, -1, function () {
        var list = S.arrayToList(slice.call(arguments));
        var last = list;
        while (last.cdr !== NIL)
            last = last.cdr;
        last.cdr = list;
        return list;
    });
    ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth']
        .forEach(function (name, position) {
            def(name, 1, 1, function (tail) {
                var start = tail;
                for (var index = 0; index < position; ++index) {
                    if (!(tail instanceof Pair))
                        throw S.error(name + ': list too short', [start]);
                    tail = tail.cdr;
                }
                if (!(tail instanceof Pair))
                    throw S.error(name + ': list too short', [start]);
                return tail.car;
            });
        });
    def('car+cdr', 1, 1, function (value) { check.pair('car+cdr', value); return new Values([value.car, value.cdr]); });
    function take(name, tail, count) {
        check.natural(name, count);
        var result = [];
        var start = tail;
        for (var index = 0; index < count; ++index) {
            if (!(tail instanceof Pair))
                throw S.error(name + ': list too short', [start, count]);
            result.push(tail.car);
            tail = tail.cdr;
        }
        return { taken: result, rest: tail };
    }
    def('take', 2, 2, function (value, count) { return S.arrayToList(take('take', value, count).taken); });
    S.alias('take!', 'take');
    def('drop', 2, 2, function (value, count) { return take('drop', value, count).rest; });
    def('split-at', 2, 2, function (value, count) {
        var parts = take('split-at', value, count);
        return new Values([S.arrayToList(parts.taken), parts.rest]);
    });
    S.alias('split-at!', 'split-at');
    function lengthOf(tail) {
        var count = 0;
        while (tail instanceof Pair) {
            ++count;
            tail = tail.cdr;
        }
        return count;
    }
    def('take-right', 2, 2, function (value, count) {
        check.natural('take-right', count);
        var length = lengthOf(value);
        if (count > length)
            throw S.error('take-right: list too short', [value, count]);
        return take('take-right', value, length - count).rest;
    });
    def('drop-right', 2, 2, function (value, count) {
        check.natural('drop-right', count);
        var length = lengthOf(value);
        if (count > length)
            throw S.error('drop-right: list too short', [value, count]);
        return S.arrayToList(take('drop-right', value, length - count).taken);
    });
    S.alias('drop-right!', 'drop-right');
    def('last', 1, 1, function (tail) {
        check.pair('last', tail);
        while (tail.cdr instanceof Pair)
            tail = tail.cdr;
        return tail.car;
    });
    def('length+', 1, 1, function (tail) {
        var count = 0, slow = tail;
        while (tail instanceof Pair) {
            tail = tail.cdr;
            ++count;
            if ((count & 1) === 0) {
                slow = slow.cdr;
                if (slow === tail)
                    return false;
            }
        }
        return count;
    });
    def('concatenate', 1, 1, function (lists) {
        return S.prims.append.fn.apply(null, items('concatenate', lists));
    });
    S.alias('concatenate!', 'concatenate');
    S.alias('append!', 'append');
    def('reverse!', 1, 1, function (value) { return S.prims.reverse.fn(value); });
    def('append-reverse', 2, 2, function (rev, tail) {
        var result = tail;
        var start = rev;
        while (rev instanceof Pair) {
            result = new Pair(rev.car, result);
            rev = rev.cdr;
        }
        if (rev !== NIL)
            throw S.error('append-reverse: not a list', [start]);
        return result;
    });
    S.alias('append-reverse!', 'append-reverse');
    def('zip', 1, -1, function () {
        var lists = slice.call(arguments);
        var result = [];
        for (;;) {
            var row = [];
            for (var index = 0; index < lists.length; ++index) {
                if (!(lists[index] instanceof Pair))
                    return S.arrayToList(result);
                row.push(lists[index].car);
                lists[index] = lists[index].cdr;
            }
            result.push(S.arrayToList(row));
        }
    });
    function unzip(count) {
        return function (list) {
            var columns = [];
            for (var index = 0; index < count; ++index)
                columns.push([]);
            items('unzip', list).forEach(function (row) {
                for (var column = 0; column < count; ++column) {
                    columns[column].push(row.car);
                    row = row.cdr;
                }
            });
            var lists = columns.map(function (column) { return S.arrayToList(column); });
            return count === 1 ? lists[0] : new Values(lists);
        };
    }
    for (var width = 1; width <= 5; ++width)
        def('unzip' + width, 1, 1, unzip(width));
    def('proper-list?', 1, 1, S.isList, { bool: true });
    def('dotted-list?', 1, 1, function (tail) {
        var slow = tail;
        for (var count = 0; ; ++count) {
            if (tail === NIL)
                return false;
            if (!(tail instanceof Pair))
                return true;
            tail = tail.cdr;
            if (count & 1) {
                slow = slow.cdr;
                if (slow === tail)
                    return false;
            }
        }
    }, { bool: true });
    def('circular-list?', 1, 1, function (tail) {
        var slow = tail;
        for (var count = 0; ; ++count) {
            if (!(tail instanceof Pair))
                return false;
            tail = tail.cdr;
            if (count & 1) {
                slow = slow.cdr;
                if (slow === tail)
                    return true;
            }
        }
    }, { bool: true });
    def('not-pair?', 1, 1, function (value) { return !(value instanceof Pair); }, { bool: true });
    def('null-list?', 1, 1, function (value) {
        if (value === NIL)
            return true;
        if (value instanceof Pair)
            return false;
        throw S.error('null-list?: not a list', [value]);
    }, { bool: true });
    def('%delete', 2, 2, function (value, list) {
        var result = [];
        items('delete', list).forEach(function (item) {
            if (!S.isEqual(value, item))
                result.push(item);
        });
        return S.arrayToList(result);
    });
    def('%delete-duplicates', 1, 1, function (list) {
        var result = [];
        items('delete-duplicates', list).forEach(function (item) {
            for (var index = 0; index < result.length; ++index) {
                if (S.isEqual(result[index], item))
                    return;
            }
            result.push(item);
        });
        return S.arrayToList(result);
    });
    def('alist-cons', 3, 3, function (key, value, alist) { return new Pair(new Pair(key, value), alist); });
    def('alist-copy', 1, 1, function (alist) {
        return S.arrayToList(items('alist-copy', alist).map(function (entry) {
            return entry instanceof Pair ? new Pair(entry.car, entry.cdr) : entry;
        }));
    });

    // --- SRFI 13 (and a handy string-split)

    function str(name, value) {
        return check.string(name, value);
    }
    function bounds(name, text, start, end) {
        return check.range(name, start, end, text.length(), text);
    }
    def('string-null?', 1, 1, function (text) { return str('string-null?', text).s.length === 0; }, { bool: true });
    def('string-join', 1, 3, function (list, delimiter, grammar) {
        var parts = items('string-join', list).map(function (item) { return str('string-join', item).s; });
        var separator = delimiter === undefined ? ' ' : str('string-join', delimiter).s;
        var mode = grammar === undefined ? 'infix' : check.symbol('string-join', grammar).name;
        switch (mode) {
        case 'infix':
            return S.str(parts.join(separator));
        case 'strict-infix':
            if (parts.length === 0)
                throw S.error('string-join: empty list with strict-infix grammar', []);
            return S.str(parts.join(separator));
        case 'suffix':
            return S.str(parts.map(function (part) { return part + separator; }).join(''));
        case 'prefix':
            return S.str(parts.map(function (part) { return separator + part; }).join(''));
        }
        throw S.error('string-join: bad grammar', [grammar]);
    });
    def('string-take', 2, 2, function (text, count) { return S.substring('string-take', text, 0, count); });
    def('string-drop', 2, 2, function (text, count) {
        str('string-drop', text);
        return S.substring('string-drop', text, count, text.length());
    });
    def('string-take-right', 2, 2, function (text, count) {
        str('string-take-right', text);
        check.natural('string-take-right', count);
        var length = text.length();
        if (count > length)
            throw S.error('string-take-right: index out of range', [text, count]);
        return S.str(text.slice(length - count, length));
    });
    def('string-drop-right', 2, 2, function (text, count) {
        str('string-drop-right', text);
        check.natural('string-drop-right', count);
        var length = text.length();
        if (count > length)
            throw S.error('string-drop-right: index out of range', [text, count]);
        return S.str(text.slice(0, length - count));
    });
    function pad(name, right) {
        return function (source, width, fillCharacter, start, end) {
            str(name, source);
            check.natural(name, width);
            var fill = fillCharacter === undefined
                ? ' '
                : String.fromCodePoint(check.character(name, fillCharacter).code);
            var range = bounds(name, source, start, end);
            var codes = source.codes().slice(range[0], range[1]);
            if (codes.length >= width)
                codes = right ? codes.slice(0, width) : codes.slice(codes.length - width);
            var text = S.codesToString(codes);
            var padding = new Array(width - codes.length + 1).join(fill);
            return S.str(right ? text + padding : padding + text);
        };
    }
    def('string-pad', 2, 5, pad('string-pad', false));
    def('string-pad-right', 2, 5, pad('string-pad-right', true));
    def('string-reverse', 1, 3, function (text, start, end) {
        str('string-reverse', text);
        var range = bounds('string-reverse', text, start, end);
        return S.str(S.codesToString(text.codes().slice(range[0], range[1]).reverse()));
    });
    def('string-concatenate', 1, 1, function (list) {
        return S.str(items('string-concatenate', list).map(function (item) {
            return str('string-concatenate', item).s;
        }).join(''));
    });
    S.alias('string-concatenate/shared', 'string-concatenate');
    S.alias('string-append/shared', 'string-append');
    S.alias('substring/shared', 'substring');
    def('string-concatenate-reverse', 1, 3, function (list, final, end) {
        var parts = items('string-concatenate-reverse', list).map(function (item) {
            return str('string-concatenate-reverse', item).s;
        });
        parts.reverse();
        if (final !== undefined) {
            str('string-concatenate-reverse', final);
            parts.push(end === undefined ? final.s : final.slice(0, end));
        }
        return S.str(parts.join(''));
    });
    function affix(name, fold, suffix, lengthOnly) {
        return function (text1, text2, s1, e1, s2, e2) {
            str(name, text1);
            str(name, text2);
            var r1 = bounds(name, text1, s1, e1), r2 = bounds(name, text2, s2, e2);
            var codes1 = text1.codes().slice(r1[0], r1[1]), codes2 = text2.codes().slice(r2[0], r2[1]);
            if (fold) {
                codes1 = codes1.map(S.charClass.fold);
                codes2 = codes2.map(S.charClass.fold);
            }
            var count = 0;
            var limit = Math.min(codes1.length, codes2.length);
            var last1 = codes1.length - 1, last2 = codes2.length - 1;
            while (count < limit) {
                var same = suffix ? codes1[last1 - count] === codes2[last2 - count] : codes1[count] === codes2[count];
                if (!same)
                    break;
                ++count;
            }
            if (lengthOnly)
                return count;
            return count === codes1.length;
        };
    }
    def('string-prefix-length', 2, 6, affix('string-prefix-length', false, false, true));
    def('string-suffix-length', 2, 6, affix('string-suffix-length', false, true, true));
    def('string-prefix-length-ci', 2, 6, affix('string-prefix-length-ci', true, false, true));
    def('string-suffix-length-ci', 2, 6, affix('string-suffix-length-ci', true, true, true));
    def('string-prefix?', 2, 6, affix('string-prefix?', false, false, false), { bool: true });
    def('string-suffix?', 2, 6, affix('string-suffix?', false, true, false), { bool: true });
    def('string-prefix-ci?', 2, 6, affix('string-prefix-ci?', true, false, false), { bool: true });
    def('string-suffix-ci?', 2, 6, affix('string-suffix-ci?', true, true, false), { bool: true });
    function contains(name, fold) {
        return function (text1, text2, s1, e1, s2, e2) {
            str(name, text1);
            str(name, text2);
            var r1 = bounds(name, text1, s1, e1), r2 = bounds(name, text2, s2, e2);
            var codes1 = text1.codes().slice(r1[0], r1[1]), codes2 = text2.codes().slice(r2[0], r2[1]);
            if (fold) {
                codes1 = codes1.map(S.charClass.fold);
                codes2 = codes2.map(S.charClass.fold);
            }
            outer:
            for (var index = 0; index + codes2.length <= codes1.length; ++index) {
                for (var offset = 0; offset < codes2.length; ++offset) {
                    if (codes1[index + offset] !== codes2[offset])
                        continue outer;
                }
                return index + r1[0];
            }
            return false;
        };
    }
    def('string-contains', 2, 6, contains('string-contains', false));
    def('string-contains-ci', 2, 6, contains('string-contains-ci', true));
    S.alias('string-search-forward', 'string-contains');
    def('string-titlecase', 1, 3, function (text, start, end) {
        str('string-titlecase', text);
        var range = bounds('string-titlecase', text, start, end);
        var codes = text.codes();
        var inWord = false;
        for (var index = range[0]; index < range[1]; ++index) {
            var code = codes[index];
            if (S.charClass.alphabetic(code)) {
                codes[index] = inWord ? S.charClass.downcase(code) : S.charClass.upcase(code);
                inWord = true;
            } else {
                inWord = false;
            }
        }
        return S.str(S.codesToString(codes.slice(range[0], range[1])));
    });
    function mutateCase(name, map) {
        return function (text, start, end) {
            str(name, text);
            var range = bounds(name, text, start, end);
            var codes = text.codes();
            for (var index = range[0]; index < range[1]; ++index)
                codes[index] = map(codes[index]);
            text.set(S.codesToString(codes));
            return UNSPEC;
        };
    }
    def('string-upcase!', 1, 3, mutateCase('string-upcase!', function (code) { return S.charClass.upcase(code); }));
    def('string-downcase!', 1, 3, mutateCase('string-downcase!', function (code) {
        return S.charClass.downcase(code);
    }));
    def('string-replace', 4, 6, function (s1, s2, start1, end1, start2, end2) {
        str('string-replace', s1);
        str('string-replace', s2);
        var r1 = check.range('string-replace', start1, end1, s1.length(), s1);
        var r2 = bounds('string-replace', s2, start2, end2);
        return S.str(s1.slice(0, r1[0]) + s2.slice(r2[0], r2[1]) + s1.slice(r1[1], s1.length()));
    });
    function compareN(name, fold, test) {
        return function (text1, text2, s1, e1, s2, e2) {
            str(name, text1);
            str(name, text2);
            var r1 = bounds(name, text1, s1, e1), r2 = bounds(name, text2, s2, e2);
            var part1 = text1.slice(r1[0], r1[1]), part2 = text2.slice(r2[0], r2[1]);
            if (fold) {
                part1 = S.foldString(part1);
                part2 = S.foldString(part2);
            }
            return test(S.compareText(part1, part2));
        };
    }
    [['=', function (order) {
        return order === 0;
    }], ['<>', function (order) { return order !== 0; }], ['<', function (order) { return order < 0; }],
     ['>', function (order) {
         return order > 0;
     }], ['<=', function (order) { return order <= 0; }], ['>=', function (order) { return order >= 0; }]]
        .forEach(function (entry) {
            def('string' + entry[0], 2, 6, compareN('string' + entry[0], false, entry[1]), { bool: true });
            def('string-ci' + entry[0], 2, 6, compareN('string-ci' + entry[0], true, entry[1]), { bool: true });
        });
    function textHash(text, bound) {
        var hash = 0;
        for (var index = 0; index < text.length; ++index)
            hash = (Math.imul(hash, 31) + text.charCodeAt(index)) | 0;
        hash = hash >>> 0;
        return bound === undefined ? hash : hash % bound;
    }
    def('string-hash', 1, 4, function (text, bound) { return textHash(str('string-hash', text).s, bound); });
    def('string-ci-hash', 1, 4, function (text, bound) {
        return textHash(S.foldString(str('string-ci-hash', text).s), bound);
    });
    S.alias('string-hash-ci', 'string-ci-hash');
    // (string-split s [char|string]) - the parts between the separators (not SRFI).
    def('string-split', 1, 3, function (text, separator, limit) {
        str('string-split', text);
        var parts;
        if (separator === undefined)
            parts = text.s.split(/\s+/).filter(function (part) { return part.length > 0; });
        else if (separator instanceof Char)
            parts = text.s.split(String.fromCodePoint(separator.code));
        else
            parts = text.s.split(str('string-split', separator).s);
        if (limit !== undefined && parts.length > limit) {
            var sep = separator instanceof Char ? String.fromCodePoint(separator.code) : separator.s;
            parts = parts.slice(0, limit - 1).concat([parts.slice(limit - 1).join(sep)]);
        }
        return S.arrayToList(parts.map(S.str));
    });

    // --- SRFI 69: hash tables

    // kind: eq, eqv, equal, string, string-ci, custom. The built-in ones use
    // a Map by a key (keyOf): key -> [the original key, value].
    function HashTable(kind, equality, hash) {
        this.kind = kind;
        this.map = new Map();
        // The numbers of key objects for equal? (records, procedures,
        // JavaScript objects) live in the table itself: WeakMap crashes V4.
        this.ids = null;
        this.equality = equality;
        this.hash = hash;
        this.weak = false;
        this.$scheme = true;
    }
    HashTable.prototype.describe = function () {
        return '#<hash-table>';
    };

    var identityCounter = 0;
    function identity(value, ids) {
        var id = ids.get(value);
        if (id === undefined) {
            id = ++identityCounter;
            ids.set(value, id);
        }
        return id;
    }

    // A key for equal?: equal values give equal strings.
    function equalKey(value, depth, ids) {
        if (typeof value === 'number')
            return Number.isInteger(value) ? value : 'f' + value;
        if (value instanceof SString)
            return 's' + value.s;
        if (value instanceof Sym || value instanceof Char || typeof value === 'boolean' || value === NIL)
            return value;
        if (N.isNumber(value))
            return N.hashKey(value);
        if (depth > 100)
            return 'o' + identity(value, ids);
        if (value instanceof Pair) {
            var parts = [];
            var count = 0;
            while (value instanceof Pair && ++count < 100000) {
                parts.push(keyText(equalKey(value.car, depth + 1, ids)));
                value = value.cdr;
            }
            return 'p(' + parts.join(' ') + ' . ' + keyText(equalKey(value, depth + 1, ids)) + ')';
        }
        if (Array.isArray(value))
            return 'v(' + value.map(function (item) {
                return keyText(equalKey(item, depth + 1, ids));
            }).join(' ') + ')';
        if (value instanceof Uint8Array)
            return 'b(' + Array.prototype.join.call(value, ' ') + ')';
        if (value !== null && (typeof value === 'object' || typeof value === 'function'))
            return 'o' + identity(value, ids);
        return 'j' + String(value);
    }
    function keyText(key) {
        if (typeof key === 'number')
            return 'n' + key;
        if (typeof key === 'string')
            return JSON.stringify(key);
        if (key instanceof Sym)
            return 'y' + JSON.stringify(key.name);
        if (key instanceof Char)
            return 'c' + key.code;
        if (key === NIL)
            return '()';
        return String(key);
    }

    HashTable.prototype.keyOf = function (key) {
        switch (this.kind) {
        case 'eq':
            return key;
        case 'eqv':
            return N.isNumber(key) && typeof key !== 'number' ? N.hashKey(key) : key;
        case 'equal':
            if (this.ids === null)
                this.ids = new Map();
            return equalKey(key, 0, this.ids);
        case 'string':
            return 's' + check.string('hash-table', key).s;
        case 'string-ci':
            return 's' + S.foldString(check.string('hash-table', key).s);
        }
        // A custom hash function: buckets, equality by a Scheme procedure.
        return S.machine.callProcedure(this.hash, [key]);
    };
    HashTable.prototype.find = function (key) {
        var hashKey = this.keyOf(key);
        var entry = this.map.get(hashKey);
        if (this.kind !== 'custom')
            return entry === undefined ? null : entry;
        if (entry === undefined)
            return null;
        for (var index = 0; index < entry.length; ++index) {
            if (S.machine.callProcedure(this.equality, [entry[index][0], key]) !== false)
                return entry[index];
        }
        return null;
    };
    HashTable.prototype.set = function (key, value) {
        var found = this.find(key);
        if (found !== null) {
            found[1] = value;
            return;
        }
        var hashKey = this.keyOf(key);
        if (this.kind !== 'custom') {
            this.map.set(hashKey, [key, value]);
            return;
        }
        var bucket = this.map.get(hashKey);
        if (bucket === undefined)
            this.map.set(hashKey, bucket = []);
        bucket.push([key, value]);
    };
    HashTable.prototype.remove = function (key) {
        var hashKey = this.keyOf(key);
        if (this.kind !== 'custom') {
            this.map.delete(hashKey);
            return;
        }
        var bucket = this.map.get(hashKey);
        if (bucket === undefined)
            return;
        for (var index = 0; index < bucket.length; ++index) {
            if (S.machine.callProcedure(this.equality, [bucket[index][0], key]) !== false) {
                bucket.splice(index, 1);
                break;
            }
        }
        if (bucket.length === 0)
            this.map.delete(hashKey);
    };
    HashTable.prototype.entries = function () {
        var result = [];
        var custom = this.kind === 'custom';
        this.map.forEach(function (entry) {
            if (custom)
                entry.forEach(function (item) { result.push(item); });
            else
                result.push(entry);
        });
        return result;
    };
    HashTable.prototype.size = function () {
        return this.kind === 'custom' ? this.entries().length : this.map.size;
    };

    function table(name, value) {
        if (!(value instanceof HashTable))
            check.fail(name, 'a hash table', value);
        return value;
    }

    var EQUALITY_KINDS = [['eq?', 'eq'], ['eqv?', 'eqv'], ['equal?', 'equal'], ['string=?', 'string'],
                          ['string-ci=?', 'string-ci'], ['=', 'eqv'], ['char=?', 'eqv'], ['symbol=?', 'eq']];
    function kindOf(equality) {
        if (equality === undefined)
            return 'equal';
        if (equality.$prim !== undefined) {
            for (var index = 0; index < EQUALITY_KINDS.length; ++index) {
                if (equality.$prim.name === EQUALITY_KINDS[index][0])
                    return EQUALITY_KINDS[index][1];
            }
        }
        return 'custom';
    }
    function makeTable(name, equality, hash) {
        if (equality !== undefined)
            check.procedure(name, equality);
        var kind = kindOf(equality);
        if (kind === 'custom' && hash === undefined) {
            // A custom equality without a hash: all keys in one bucket.
            hash = S.directProc('constant-hash', 1, function () { return 0; });
        }
        return new HashTable(kind, equality || S.procOf(S.prims['equal?']), hash || null);
    }
    def('make-hash-table', 0, 3, function (equality, hash) { return makeTable('make-hash-table', equality, hash); });
    def('make-equal-hash-table', 0, 1, function () { return new HashTable('equal', null, null); });
    def('make-eqv-hash-table', 0, 1, function () { return new HashTable('eqv', null, null); });
    def('make-eq-hash-table', 0, 1, function () { return new HashTable('eq', null, null); });
    def('make-string-hash-table', 0, 1, function () { return new HashTable('string', null, null); });
    def('hash-table?', 1, 1, function (value) { return value instanceof HashTable; }, { bool: true });
    def('alist->hash-table', 1, 3, function (alist, equality, hash) {
        var made = makeTable('alist->hash-table', equality, hash);
        items('alist->hash-table', alist).forEach(function (entry) {
            check.pair('alist->hash-table', entry);
            if (made.find(entry.car) === null)
                made.set(entry.car, entry.cdr);
        });
        return made;
    });
    def('hash-table-equivalence-function', 1, 1, function (hashTable) {
        table('hash-table-equivalence-function', hashTable);
        return hashTable.equality || S.procOf(S.prims[{ eq: 'eq?', eqv: 'eqv?', equal: 'equal?', string: 'string=?',
                                                        'string-ci': 'string-ci=?' }[hashTable.kind]]);
    });
    def('hash-table-hash-function', 1, 1, function (hashTable) {
        table('hash-table-hash-function', hashTable);
        if (hashTable.hash)
            return hashTable.hash;
        var kind = hashTable.kind;
        return S.procOf(S.prims[kind === 'string' ? 'string-hash' : kind === 'string-ci' ? 'string-ci-hash'
            : kind === 'equal' ? 'hash' : 'hash-by-identity']);
    });
    def('%hash-table-ref', 2, 2, function (hashTable, key) {
        var found = table('hash-table-ref', hashTable).find(key);
        return found === null ? S.NO_MATCH : found[1];
    });
    def('hash-table-ref/default', 3, 3, function (hashTable, key, fallback) {
        var found = table('hash-table-ref/default', hashTable).find(key);
        return found === null ? fallback : found[1];
    });
    def('hash-table-set!', 3, 3, function (hashTable, key, value) {
        table('hash-table-set!', hashTable).set(key, value);
        return UNSPEC;
    });
    def('hash-table-delete!', 2, 2, function (hashTable, key) {
        table('hash-table-delete!', hashTable).remove(key);
        return UNSPEC;
    });
    def('hash-table-exists?', 2, 2, function (hashTable, key) {
        return table('hash-table-exists?', hashTable).find(key) !== null;
    }, { bool: true });
    S.alias('hash-table-contains?', 'hash-table-exists?');
    def('hash-table-size', 1, 1, function (hashTable) { return table('hash-table-size', hashTable).size(); });
    S.alias('hash-table-count', 'hash-table-size');
    def('hash-table-keys', 1, 1, function (hashTable) {
        return S.arrayToList(table('hash-table-keys', hashTable).entries().map(function (entry) { return entry[0]; }));
    });
    def('hash-table-values', 1, 1, function (hashTable) {
        return S.arrayToList(table('hash-table-values', hashTable).entries().map(function (entry) {
            return entry[1];
        }));
    });
    def('hash-table->alist', 1, 1, function (hashTable) {
        return S.arrayToList(table('hash-table->alist', hashTable).entries().map(function (entry) {
            return new Pair(entry[0], entry[1]);
        }));
    });
    def('hash-table-copy', 1, 2, function (hashTable) {
        table('hash-table-copy', hashTable);
        var copy = new HashTable(hashTable.kind, hashTable.equality, hashTable.hash);
        hashTable.entries().forEach(function (entry) { copy.set(entry[0], entry[1]); });
        return copy;
    });
    def('hash-table-merge!', 2, 2, function (target, source) {
        table('hash-table-merge!', target);
        table('hash-table-merge!', source).entries().forEach(function (entry) {
            if (target.find(entry[0]) === null)
                target.set(entry[0], entry[1]);
        });
        return target;
    });
    def('hash-table-clear!', 1, 1, function (hashTable) {
        table('hash-table-clear!', hashTable).map.clear();
        return UNSPEC;
    });
    // Object numbers for hash and hash-by-identity - for the whole session.
    var hashIds = new Map();
    def('hash', 1, 2, function (value, bound) {
        var key = keyText(equalKey(value, 0, hashIds));
        return textHash(key, bound);
    });
    def('hash-by-identity', 1, 2, function (value, bound) {
        var isObject = typeof value === 'object' && value !== null || typeof value === 'function';
        var key = isObject ? 'o' + identity(value, hashIds) : keyText(value);
        return textHash(String(key), bound);
    });
    S.alias('hash-by-eqv', 'hash');

    // --- SRFI 18: threads, mutexes, condition variables, time

    var Thread = S.Thread, Mutex = S.Mutex, ConditionVariable = S.ConditionVariable, Time = S.Time;
    var Bounce = S.Bounce;

    function thread(name, value) {
        if (!(value instanceof Thread))
            check.fail(name, 'a thread', value);
        return value;
    }
    function mutex(name, value) {
        if (!(value instanceof Mutex))
            check.fail(name, 'a mutex', value);
        return value;
    }
    function conditionVariable(name, value) {
        if (!(value instanceof ConditionVariable))
            check.fail(name, 'a condition variable', value);
        return value;
    }
    // A timeout: absolute (time) or seconds from now; null - without a
    // limit.
    function deadline(name, timeout) {
        if (timeout === undefined || timeout === false)
            return null;
        if (timeout instanceof Time)
            return timeout.ms;
        return Date.now() + N.fv(N.checkReal(name, timeout)) * 1000;
    }
    function condition(kind, message, irritants) {
        var made = S.error(message, irritants || []);
        made.kind = kind;
        return made;
    }

    def('make-thread', 1, 2, function (thunk, name) {
        check.procedure('make-thread', thunk);
        return new Thread(thunk, name === undefined ? UNSPEC : name);
    });
    def('thread?', 1, 1, function (value) { return value instanceof Thread; }, { bool: true });
    def('current-thread', 0, 0, function () { return S.machine.current; });
    def('thread-name', 1, 1, function (target) { return thread('thread-name', target).name; });
    def('thread-specific', 1, 1, function (target) { return thread('thread-specific', target).specific; });
    def('thread-specific-set!', 2, 2, function (target, value) {
        thread('thread-specific-set!', target).specific = value;
        return UNSPEC;
    });
    def('thread-start!', 1, 1, function (target) {
        thread('thread-start!', target);
        if (target.state !== 'new')
            throw S.error('thread-start!: thread already started', [target]);
        S.machine.startThread(target);
        return target;
    });
    defCps('thread-yield!', 0, 0, function ($k) {
        var machine = S.machine;
        if (machine.nested() || machine.current === null || machine.ready.length === 0)
            return $k(UNSPEC);
        return machine.switchThread(new Bounce($k, [UNSPEC]));
    });
    defCps('thread-sleep!', 1, 1, function ($k, timeout) {
        var machine = S.machine;
        var until = deadline('thread-sleep!', timeout);
        if (machine.nested() || machine.current === null) {
            machine.busyWait(until - Date.now());
            return $k(UNSPEC);
        }
        machine.sleepUntil(machine.current, until, function () { return new Bounce($k, [UNSPEC]); });
        return machine.block($k);
    });
    defCps('thread-join!', 1, 3, function ($k, target, timeout, timeoutValue) {
        thread('thread-join!', target);
        var machine = S.machine;
        function deliver() {
            if (target.exception !== null) {
                if (target.exception.terminated) {
                    var terminated = condition('terminated', 'thread-join!: thread was terminated', [target]);
                    return machine.raise($k, terminated, false);
                }
                var uncaught = condition('uncaught', 'thread-join!: uncaught exception in thread', [target]);
                uncaught.reason = target.exception.value;
                return machine.raise($k, uncaught, false);
            }
            return $k(target.result);
        }
        if (target.state === 'terminated')
            return deliver();
        if (target === machine.current)
            throw S.error('thread-join!: a thread cannot join itself', [target]);
        var until = deadline('thread-join!', timeout);
        var current = machine.current;
        var waiting = function (signal) {
            if (signal === 'timeout') {
                if (timeoutValue !== undefined)
                    return $k(timeoutValue);
                return machine.raise($k, condition('join-timeout', 'thread-join!: timeout', [target]), false);
            }
            return deliver();
        };
        if (until !== null && until <= Date.now())
            return waiting('timeout');
        target.joiners.push(function () { machine.wake(current, 'joined'); });
        if (until !== null)
            machine.sleepUntil(current, until, function () { return new Bounce(waiting, ['timeout']); });
        return machine.block(waiting);
    });
    defCps('thread-terminate!', 1, 1, function ($k, target) {
        thread('thread-terminate!', target);
        var machine = S.machine;
        if (target.state === 'terminated')
            return $k(UNSPEC);
        if (target.main)
            throw new S.ExitSignal(true);
        var wasCurrent = target === machine.current;
        machine.ready = machine.ready.filter(function (other) { return other !== target; });
        target.sleepEntry = null;
        if (wasCurrent)
            return machine.finishThread(target, UNSPEC, { terminated: true });
        target.state = 'terminated';
        target.exception = { terminated: true };
        target.joiners.forEach(function (joiner) { joiner(); });
        target.joiners = [];
        return $k(UNSPEC);
    });

    def('make-mutex', 0, 1, function (name) { return new Mutex(name === undefined ? UNSPEC : name); });
    def('mutex?', 1, 1, function (value) { return value instanceof Mutex; }, { bool: true });
    def('mutex-name', 1, 1, function (lock) { return mutex('mutex-name', lock).name; });
    def('mutex-specific', 1, 1, function (lock) { return mutex('mutex-specific', lock).specific; });
    def('mutex-specific-set!', 2, 2, function (lock, value) {
        mutex('mutex-specific-set!', lock).specific = value;
        return UNSPEC;
    });
    def('mutex-state', 1, 1, function (lock) {
        mutex('mutex-state', lock);
        if (!lock.locked)
            return S.intern(lock.abandoned ? 'abandoned' : 'not-abandoned');
        return lock.owner === null ? S.intern('not-owned') : lock.owner;
    });
    defCps('mutex-lock!', 1, 3, function ($k, lock, timeout, owner) {
        mutex('mutex-lock!', lock);
        var machine = S.machine;
        var thread = owner === undefined ? machine.current : (owner === false ? null : owner);
        if (!lock.locked || (lock.owner !== null && lock.owner.state === 'terminated')) {
            lock.locked = true;
            lock.owner = thread;
            return $k(true);
        }
        if (machine.nested() || machine.current === null)
            throw S.error('mutex-lock!: mutex is locked (cannot wait inside a call from JavaScript)', [lock]);
        var until = deadline('mutex-lock!', timeout);
        if (until !== null && until <= Date.now())
            return $k(false);
        var current = machine.current;
        var entry = { thread: current, owner: thread };
        lock.waiters.push(entry);
        var waiting = function (signal) {
            if (signal === 'timeout') {
                lock.waiters = lock.waiters.filter(function (waiter) { return waiter !== entry; });
                return $k(false);
            }
            return $k(true);
        };
        if (until !== null)
            machine.sleepUntil(current, until, function () { return new Bounce(waiting, ['timeout']); });
        return machine.block(waiting);
    });
    function unlock(lock) {
        var machine = S.machine;
        if (lock.waiters.length > 0) {
            var next = lock.waiters.shift();
            lock.owner = next.owner;
            lock.locked = true;
            machine.wake(next.thread, 'locked');
        } else {
            lock.locked = false;
            lock.owner = null;
        }
    }
    defCps('mutex-unlock!', 1, 3, function ($k, lock, cv, timeout) {
        mutex('mutex-unlock!', lock);
        var machine = S.machine;
        unlock(lock);
        if (cv === undefined)
            return $k(true);
        conditionVariable('mutex-unlock!', cv);
        if (machine.nested() || machine.current === null)
            throw S.error('mutex-unlock!: cannot wait inside a call from JavaScript', [lock]);
        var until = deadline('mutex-unlock!', timeout);
        var current = machine.current;
        var entry = { thread: current };
        cv.waiters.push(entry);
        var waiting = function (signal) {
            if (signal === 'timeout') {
                cv.waiters = cv.waiters.filter(function (waiter) { return waiter !== entry; });
                return $k(false);
            }
            return $k(true);
        };
        if (until !== null)
            machine.sleepUntil(current, until, function () { return new Bounce(waiting, ['timeout']); });
        return machine.block(waiting);
    });
    def('make-condition-variable', 0, 1, function (name) { return new ConditionVariable(name === undefined ? UNSPEC : name); });
    def('condition-variable?', 1, 1, function (value) { return value instanceof ConditionVariable; }, { bool: true });
    def('condition-variable-name', 1, 1, function (variable) {
        return conditionVariable('condition-variable-name', variable).name;
    });
    def('condition-variable-specific', 1, 1, function (variable) {
        return conditionVariable('condition-variable-specific', variable).specific;
    });
    def('condition-variable-specific-set!', 2, 2, function (variable, value) {
        conditionVariable('condition-variable-specific-set!', variable).specific = value;
        return UNSPEC;
    });
    def('condition-variable-signal!', 1, 1, function (variable) {
        conditionVariable('condition-variable-signal!', variable);
        if (variable.waiters.length > 0)
            S.machine.wake(variable.waiters.shift().thread, 'signaled');
        return UNSPEC;
    });
    def('condition-variable-broadcast!', 1, 1, function (variable) {
        conditionVariable('condition-variable-broadcast!', variable);
        var waiters = variable.waiters;
        variable.waiters = [];
        waiters.forEach(function (waiter) { S.machine.wake(waiter.thread, 'signaled'); });
        return UNSPEC;
    });
    def('current-time', 0, 0, function () { return new Time(Date.now()); });
    def('time?', 1, 1, function (value) { return value instanceof Time; }, { bool: true });
    def('time->seconds', 1, 1, function (time) {
        if (!(time instanceof Time))
            check.fail('time->seconds', 'a time', time);
        return N.flo(time.ms / 1000);
    });
    def('seconds->time', 1, 1, function (value) { return new Time(N.fv(N.checkReal('seconds->time', value)) * 1000); });
    function kindTest(kind) {
        return function (value) { return value instanceof S.ErrorObject && value.kind === kind; };
    }
    def('join-timeout-exception?', 1, 1, kindTest('join-timeout'), { bool: true });
    def('abandoned-mutex-exception?', 1, 1, kindTest('abandoned'), { bool: true });
    def('terminated-thread-exception?', 1, 1, kindTest('terminated'), { bool: true });
    def('uncaught-exception?', 1, 1, kindTest('uncaught'), { bool: true });
    def('uncaught-exception-reason', 1, 1, function (value) {
        if (!(value instanceof S.ErrorObject) || value.kind !== 'uncaught')
            check.fail('uncaught-exception-reason', 'an uncaught exception', value);
        return value.reason;
    });

    S.HashTable = HashTable;
})(globalThis);
