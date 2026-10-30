// C#: culture-sensitive comparison of strings (string.Compare, CompareTo,
// the default comparer of strings) - .NET on Linux uses the root
// collation of ICU, approximated here: punctuation and symbols before
// digits before letters (not ignored), letters by their base letter, then
// accents, then case (lowercase first); a string compares by the base
// letters of all its characters first. See docs/internals/csharp.md.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.collate)
        return;

    // The order of the ASCII characters that are not letters or digits.
    var PUNCTUATION = '\t\n\u000b\f\r _-,;:!?.\'"()[]{}@*/\\&#%`^+<=>|~$';
    // Latin-1 symbols placed after a character of PUNCTUATION.
    var AFTER = { ' ': ' ', '¡': '!', '¿': '?', '·': '.', '«': '"', '»': '"', '§': '@',
                  '¶': '@', '©': '@', '®': '@', '°': '@', '¦': '|', '¬': '~', '±': '+',
                  '×': '+', '÷': '+', '¢': '$', '£': '$', '¤': '$', '¥': '$', '´': '`',
                  '¨': '`', '¸': '`', '¯': '`' };
    // Secondary weights of combining accents (the order of DUCET).
    var ACCENTS = { 0x301: 1, 0x300: 2, 0x306: 3, 0x302: 4, 0x30c: 5, 0x30a: 6, 0x308: 7, 0x30b: 8, 0x303: 9, 0x307: 10,
                    0x338: 11, 0x327: 12, 0x328: 13, 0x304: 14 };
    // Letters with their own expansions or accents: base letters and an
    // accent weight.
    var SPECIAL = { 0xdf: ['ss', 0, 2], 0xe6: ['ae', 0, 2], 0xc6: ['ae', 0, 3], 0x153: ['oe', 0, 2], 0x152: ['oe', 0, 3],
                    0xf8: ['o', 11, 0], 0xd8: ['o', 11, 1], 0x111: ['d', 11, 0], 0x110: ['d', 11, 1], 0x142: ['l', 11, 0],
                    0x141: ['l', 11, 1], 0x131: ['i', 15, 0], 0xaa: ['a', 0, 2], 0xba: ['o', 0, 2], 0xb9: ['1', 0, 2],
                    0xb2: ['2', 0, 2], 0xb3: ['3', 0, 2], 0xb5: ['μ', 0, 2] };

    var hasNormalize = typeof ''.normalize === 'function';
    var PRIMARY_DIGITS = 1000, PRIMARY_LETTERS = 2000, PRIMARY_OTHER = 100000;
    // Elements of a character: [primary, secondary, tertiary, ...] (an
    // expansion has several).
    var cache = Object.create(null);

    function letterPrimary(lower) {
        if (lower >= 97 && lower <= 122)
            return PRIMARY_LETTERS + (lower - 97) * 4;
        if (lower === 0xfe)
            return PRIMARY_LETTERS + 26 * 4;
        return PRIMARY_OTHER + lower;
    }

    function elementsOf(code) {
        var found = cache[code];
        if (found !== undefined)
            return found;
        var result = computeElements(code);
        cache[code] = result;
        return result;
    }

    function computeElements(code) {
        var text = String.fromCharCode(code);
        if (code < 128) {
            if (code >= 48 && code <= 57)
                return [PRIMARY_DIGITS + (code - 48), 0, 0];
            if (code >= 97 && code <= 122)
                return [letterPrimary(code), 0, 0];
            if (code >= 65 && code <= 90)
                return [letterPrimary(code + 32), 0, 1];
            var position = PUNCTUATION.indexOf(text);
            if (position >= 0)
                return [10 + position * 4, 0, 0];
            return [0, 0, 0];
        }
        if (code < 0xa0 || code === 0xad || (code >= 0x200b && code <= 0x200f) || code === 0xfeff)
            return [0, 0, 0];
        if (code >= 0x300 && code <= 0x36f)
            return [0, ACCENTS[code] || 20 + (code - 0x300), 0];
        var after = AFTER[text];
        if (after !== undefined)
            return [10 + PUNCTUATION.indexOf(after) * 4 + 1 + (code & 1), 0, 0];
        var special = SPECIAL[code];
        if (special !== undefined) {
            var list = [];
            for (var index = 0; index < special[0].length; ++index) {
                var base = elementsOf(special[0].charCodeAt(index));
                list.push(base[0], special[1], special[2]);
            }
            return list;
        }
        if (hasNormalize) {
            var decomposed = text.normalize('NFD');
            if (decomposed.length > 1 && decomposed.charCodeAt(0) < 0x300) {
                var first = elementsOf(decomposed.charCodeAt(0)).slice();
                var accent = 0;
                for (var mark = 1; mark < decomposed.length; ++mark)
                    accent = accent * 32 + (ACCENTS[decomposed.charCodeAt(mark)] || 20 + (decomposed.charCodeAt(mark) & 0x7f));
                first[1] = accent;
                return first;
            }
        }
        var lower = text.toLowerCase();
        var upper = text.toUpperCase();
        if (lower.length === 1 && lower !== text)
            return [letterPrimary(lower.charCodeAt(0)), 0, 1];
        if (upper.length === 1 && upper !== text)
            return [letterPrimary(code), 0, 0];
        if (CS.isLetterCode(code) || CS.isDigitCode(code))
            return [PRIMARY_OTHER + code, 0, 0];
        // Other symbols: after the ASCII ones, by code.
        return [10 + PUNCTUATION.length * 4 + code / 0x10000, 0, 0];
    }

    // The elements of a string at one level (0, 1, 2), ignorable ones out.
    function levelKeys(text, level, ignoreCase) {
        var keys = [];
        for (var index = 0; index < text.length; ++index) {
            var elements = elementsOf(text.charCodeAt(index));
            for (var part = 0; part < elements.length; part += 3) {
                if (level === 0) {
                    if (elements[part] !== 0)
                        keys.push(elements[part]);
                } else if (level === 1) {
                    if (elements[part] !== 0 || elements[part + 1] !== 0)
                        keys.push(elements[part + 1]);
                } else if (elements[part] !== 0 || elements[part + 1] !== 0) {
                    keys.push(ignoreCase ? 0 : elements[part + 2]);
                }
            }
        }
        return keys;
    }

    function compareKeys(left, right) {
        var count = Math.min(left.length, right.length);
        for (var index = 0; index < count; ++index) {
            if (left[index] !== right[index])
                return left[index] < right[index] ? -1 : 1;
        }
        return left.length === right.length ? 0 : (left.length < right.length ? -1 : 1);
    }

    // -1, 0 or 1; null is less than any string.
    CS.collate = function (left, right, ignoreCase) {
        if (left === right)
            return 0;
        if (left === null || left === undefined)
            return -1;
        if (right === null || right === undefined)
            return 1;
        for (var level = 0; level < 3; ++level) {
            var order = compareKeys(levelKeys(left, level, ignoreCase), levelKeys(right, level, ignoreCase));
            if (order !== 0)
                return order;
        }
        return 0;
    };

    // Ordinal: the difference of the first different UTF-16 code units, or
    // of the lengths.
    CS.compareOrdinal = function (left, right) {
        if (left === right)
            return 0;
        if (left === null || left === undefined)
            return -1;
        if (right === null || right === undefined)
            return 1;
        var count = Math.min(left.length, right.length);
        for (var index = 0; index < count; ++index) {
            var difference = left.charCodeAt(index) - right.charCodeAt(index);
            if (difference !== 0)
                return difference;
        }
        return left.length - right.length;
    };

    CS.upperInvariant = function (text) {
        var upper = text.toUpperCase();
        if (upper.length === text.length)
            return upper;
        var out = '';
        for (var index = 0; index < text.length; ++index) {
            var ch = text.charAt(index);
            var mapped = ch.toUpperCase();
            out += mapped.length === 1 ? mapped : ch;
        }
        return out;
    };

    CS.lowerInvariant = function (text) {
        var lower = text.toLowerCase();
        if (lower.length === text.length)
            return lower;
        var out = '';
        for (var index = 0; index < text.length; ++index) {
            var ch = text.charAt(index);
            var mapped = ch.toLowerCase();
            out += mapped.length === 1 ? mapped : ch;
        }
        return out;
    };

    CS.compareOrdinalIgnoreCase = function (left, right) {
        if (left === null || left === undefined || right === null || right === undefined)
            return CS.compareOrdinal(left, right);
        return CS.compareOrdinal(CS.upperInvariant(left), CS.upperInvariant(right));
    };
})(globalThis);
