// PHP functions that Uniter lacks: math, strings, arrays and their
// sorting, print_r, date, json. A group of functions for the Uniter
// environment: uniterPhp.library(internals) -> { name: function }. printf,
// vprintf and the constants are in the prelude of the adapter (php.js),
// written in PHP.
(function (uniter) {
    'use strict';

    uniter.library = function (internals) {
        var values = internals.valueFactory;
        var output = internals.output;
        var globalNamespace = internals.globalNamespace;

        function typed(signature, implementation) {
            return internals.typeFunction(signature, implementation);
        }

        function native(value) {
            return value === undefined || value === null ? null : value.getNative();
        }

        function number(value) {
            var result = Number(native(value));
            return isNaN(result) ? 0 : result;
        }

        function text(value) {
            var result = native(value);
            if (result === null || result === undefined || result === false)
                return '';
            return result === true ? '1' : String(result);
        }

        // A JavaScript value in PHP; objects become associative arrays.
        function toPhp(result) {
            values.plainObjectsAsArrays = true;
            try {
                return values.coerce(result);
            } finally {
                values.plainObjectsAsArrays = false;
            }
        }

        function float(result) {
            return values.createFloat(result);
        }

        function integer(result) {
            return values.createInteger(Math.trunc(result));
        }

        // The elements of a PHP array: key - value pairs in order.
        function pairs(arrayValue) {
            return arrayValue.getKeys().map(function (key) {
                return arrayValue.getElementPairByKey(key);
            });
        }

        function elements(arrayValue) {
            return arrayValue.getValues();
        }

        function isNumeric(value) {
            return typeof value === 'number' ||
                (typeof value === 'string' && value.trim() !== '' && !isNaN(Number(value)));
        }

        // Comparison as in PHP 8: numbers and numeric strings by value,
        // everything else as strings.
        function compare(left, right) {
            if (isNumeric(left) && isNumeric(right))
                return Number(left) - Number(right);
            if (typeof left === 'boolean' || typeof right === 'boolean')
                return Number(!!left) - Number(!!right);
            left = left === null ? '' : String(left);
            right = right === null ? '' : String(right);
            return left < right ? -1 : (left > right ? 1 : 0);
        }

        // A PHP function call returns a future value; in a synchronous
        // environment it is already resolved.
        function call(callback, args) {
            var result = callback.call(args, globalNamespace);
            return result !== null && typeof result === 'object' && typeof result.yieldSync === 'function'
                ? result.yieldSync() : result;
        }

        function stableSort(list, comparator) {
            return list.map(function (item, index) { return { item: item, index: index }; })
                .sort(function (left, right) { return comparator(left.item, right.item) || left.index - right.index; })
                .map(function (entry) { return entry.item; });
        }

        function byValue(left, right) {
            return compare(native(left.getValue()), native(right.getValue()));
        }

        function byKey(left, right) {
            return compare(native(left.getKey()), native(right.getKey()));
        }

        function userOrder(callback, take) {
            return function (left, right) {
                return number(call(callback, [take(left), take(right)]));
            };
        }

        // Sorts an array by reference: keepKeys - the keys stay (asort),
        // otherwise the elements are numbered anew (sort).
        function sortReference(reference, comparator, keepKeys, descending) {
            var sorted = stableSort(pairs(reference.getValue()), descending ? function (left, right) {
                return comparator(right, left);
            } : comparator);
            reference.setValue(values.createArray(keepKeys ? sorted : sorted.map(function (pair) {
                return pair.getValue();
            })));
            return values.createBoolean(true);
        }

        function sortFunction(comparator, keepKeys, descending) {
            return typed('array &$array, mixed $flags = 0 : bool', function (reference) {
                return sortReference(reference, comparator, keepKeys, descending);
            });
        }

        function userSortFunction(take, keepKeys) {
            return typed('array &$array, callable $callback : bool', function (reference, callback) {
                return sortReference(reference, userOrder(callback, take), keepKeys, false);
            });
        }

        function pairValue(pair) {
            return pair.getValue();
        }

        function pairKey(pair) {
            return pair.getKey();
        }

        function math(operation) {
            return typed('mixed $num : float', function (value) {
                return float(operation(number(value)));
            });
        }

        function extreme(sign) {
            return typed('mixed ...$values : mixed', function (list) {
                var items = list.getValues();
                if (items.length === 1 && items[0].getType() === 'array')
                    items = elements(items[0]);
                var best = null;
                items.forEach(function (item) {
                    if (best === null || sign * compare(native(item), native(best)) > 0)
                        best = item;
                });
                return best === null ? values.createBoolean(false) : best;
            });
        }

        function random(minimum, maximum) {
            return Math.floor(Math.random() * (maximum - minimum + 1)) + minimum;
        }

        function randomFunction() {
            return typed('mixed $min = null, mixed $max = null : int', function (minimum, maximum) {
                if (native(minimum) === null)
                    return integer(random(0, 2147483647));
                return integer(random(number(minimum), number(maximum)));
            });
        }

        function round(value, precision) {
            var factor = Math.pow(10, precision);
            var scaled = Number((Math.abs(value) * factor).toPrecision(15));
            return (value < 0 ? -1 : 1) * Math.round(scaled) / factor;
        }

        function groupThousands(digits, separator) {
            var result = '';
            for (var index = 0; index < digits.length; ++index) {
                if (index > 0 && (digits.length - index) % 3 === 0)
                    result += separator;
                result += digits.charAt(index);
            }
            return result;
        }

        // --- UTF-8 bytes: base64 and ord work with bytes, as in PHP.

        function utf8Bytes(string) {
            return unescape(encodeURIComponent(string));
        }

        function fromUtf8Bytes(bytes) {
            try {
                return decodeURIComponent(escape(bytes));
            } catch (error) {
                return bytes;
            }
        }

        var BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

        function base64Encode(bytes) {
            var result = '';
            for (var index = 0; index < bytes.length; index += 3) {
                var chunk = (bytes.charCodeAt(index) << 16) | ((bytes.charCodeAt(index + 1) || 0) << 8) |
                    (bytes.charCodeAt(index + 2) || 0);
                result += BASE64.charAt(chunk >> 18 & 63) + BASE64.charAt(chunk >> 12 & 63) +
                    (index + 1 < bytes.length ? BASE64.charAt(chunk >> 6 & 63) : '=') +
                    (index + 2 < bytes.length ? BASE64.charAt(chunk & 63) : '=');
            }
            return result;
        }

        function base64Decode(encoded) {
            var clean = encoded.replace(/[^A-Za-z0-9+/]/g, '');
            var result = '';
            for (var index = 0; index < clean.length; index += 4) {
                var chunk = 0;
                for (var offset = 0; offset < 4; ++offset)
                    chunk = (chunk << 6) | (index + offset < clean.length ? BASE64.indexOf(clean.charAt(index + offset)) : 0);
                result += String.fromCharCode(chunk >> 16 & 255);
                if (index + 2 < clean.length)
                    result += String.fromCharCode(chunk >> 8 & 255);
                if (index + 3 < clean.length)
                    result += String.fromCharCode(chunk & 255);
            }
            return result;
        }

        // A PHP value for JSON: an array with the keys 0, 1, 2... becomes an
        // array, other arrays become objects.
        function toJson(value) {
            if (value.getType() !== 'array')
                return native(value);
            var list = pairs(value);
            var isList = list.every(function (pair, index) { return native(pair.getKey()) === index; });
            if (isList)
                return list.map(function (pair) { return toJson(pair.getValue()); });
            var object = {};
            list.forEach(function (pair) { object[String(native(pair.getKey()))] = toJson(pair.getValue()); });
            return object;
        }

        // --- print_r

        function printReadable(value, indent) {
            var type = value.getType();
            if (type === 'array' || (type === 'object' && value.getClassName && value.getClassName() !== 'JSObject')) {
                var lines = [type === 'array' ? 'Array' : value.getClassName() + ' Object', indent + '('];
                var list = type === 'array' ? pairs(value) : [];
                if (type === 'object') {
                    var properties = value.getNative();
                    Object.keys(properties || {}).forEach(function (key) {
                        list.push({ key: key, value: values.coerce(properties[key]) });
                    });
                }
                list.forEach(function (pair) {
                    var key = typeof pair.getKey === 'function' ? native(pair.getKey()) : pair.key;
                    var item = typeof pair.getValue === 'function' ? pair.getValue() : pair.value;
                    lines.push(indent + '    [' + key + '] => ' + printReadable(item, indent + '        '));
                });
                lines.push(indent + ')');
                return lines.join('\n') + '\n';
            }
            if (type === 'object')
                return 'JSObject Object\n' + indent + '(\n' + indent + ')\n';
            return text(value);
        }

        // --- date

        var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                      'October', 'November', 'December'];

        function pad(value, width) {
            var result = String(value);
            while (result.length < width)
                result = '0' + result;
            return result;
        }

        function isoWeek(date) {
            var day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
            day.setDate(day.getDate() + 3 - (day.getDay() + 6) % 7);
            var firstThursday = new Date(day.getFullYear(), 0, 4);
            return { year: day.getFullYear(),
                     week: 1 + Math.round(((day - firstThursday) / 86400000 - 3 + (firstThursday.getDay() + 6) % 7) / 7) };
        }

        function formatDate(format, date) {
            var offset = -date.getTimezoneOffset();
            var offsetText = (offset < 0 ? '-' : '+') + pad(Math.floor(Math.abs(offset) / 60), 2) + pad(Math.abs(offset) % 60, 2);
            var dayOfYear = Math.round((new Date(date.getFullYear(), date.getMonth(), date.getDate()) -
                                        new Date(date.getFullYear(), 0, 1)) / 86400000);
            var leap = new Date(date.getFullYear(), 1, 29).getMonth() === 1;
            var hours12 = date.getHours() % 12 || 12;
            var codes = {
                d: pad(date.getDate(), 2), D: DAYS[date.getDay()].substring(0, 3), j: date.getDate(),
                l: DAYS[date.getDay()], N: date.getDay() || 7, w: date.getDay(), z: dayOfYear,
                S: [1, 21, 31].indexOf(date.getDate()) >= 0 ? 'st' : ([2, 22].indexOf(date.getDate()) >= 0 ? 'nd'
                    : ([3, 23].indexOf(date.getDate()) >= 0 ? 'rd' : 'th')),
                W: pad(isoWeek(date).week, 2), o: isoWeek(date).year,
                F: MONTHS[date.getMonth()], M: MONTHS[date.getMonth()].substring(0, 3), m: pad(date.getMonth() + 1, 2),
                n: date.getMonth() + 1, t: new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate(), L: leap ? 1 : 0,
                Y: date.getFullYear(), y: pad(date.getFullYear() % 100, 2),
                a: date.getHours() < 12 ? 'am' : 'pm', A: date.getHours() < 12 ? 'AM' : 'PM',
                g: hours12, G: date.getHours(), h: pad(hours12, 2), H: pad(date.getHours(), 2),
                i: pad(date.getMinutes(), 2), s: pad(date.getSeconds(), 2), u: pad(date.getMilliseconds() * 1000, 6),
                v: pad(date.getMilliseconds(), 3), O: offsetText, P: offsetText.substring(0, 3) + ':' + offsetText.substring(3),
                Z: offset * 60, U: Math.floor(date.getTime() / 1000)
            };
            var result = '';
            for (var index = 0; index < format.length; ++index) {
                var character = format.charAt(index);
                if (character === '\\' && index + 1 < format.length)
                    result += format.charAt(++index);
                else if (character === 'c')
                    result += formatDate('Y-m-d\\TH:i:sP', date);
                else if (character === 'r')
                    result += formatDate('D, d M Y H:i:s O', date);
                else
                    result += Object.prototype.hasOwnProperty.call(codes, character) ? codes[character] : character;
            }
            return result;
        }

        function timestamp(value) {
            return native(value) === null ? Date.now() : number(value) * 1000;
        }

        // --- Arrays

        function sliceArray(arrayValue, offset, length, preserveKeys) {
            var list = pairs(arrayValue);
            var start = offset < 0 ? Math.max(0, list.length + offset) : Math.min(offset, list.length);
            var end = length === null ? list.length : (length < 0 ? list.length + length : start + length);
            return reindex(list.slice(start, Math.max(start, end)), preserveKeys);
        }

        // Pairs with integer keys are numbered anew, string keys stay.
        function reindex(list, preserveKeys) {
            if (preserveKeys)
                return values.createArray(list);
            var next = 0;
            var result = list.map(function (pair) {
                var key = native(pair.getKey());
                if (typeof key === 'number')
                    return pairWithKey(values.createInteger(next++), pair.getValue());
                return pair;
            });
            return values.createArray(result);
        }

        // A key - value pair as the PHP array itself creates it.
        function pairWithKey(key, value) {
            var holder = values.createArray([]);
            holder.getElementByKey(key).setValue(value);
            return holder.getElementPairByKey(key);
        }

        var functions = {
            // Math
            abs: typed('mixed $num : mixed', function (value) {
                var result = Math.abs(number(value));
                return Number.isInteger(result) && value.getType() !== 'float' ? integer(result) : float(result);
            }),
            max: extreme(1),
            min: extreme(-1),
            round: typed('mixed $num, mixed $precision = 0 : float', function (value, precision) {
                return float(round(number(value), number(precision)));
            }),
            floor: math(Math.floor),
            sqrt: math(Math.sqrt),
            exp: math(Math.exp),
            log10: math(function (value) { return Math.log(value) / Math.LN10; }),
            sin: math(Math.sin), cos: math(Math.cos), tan: math(Math.tan),
            asin: math(Math.asin), acos: math(Math.acos), atan: math(Math.atan),
            sinh: math(function (value) { return (Math.exp(value) - Math.exp(-value)) / 2; }),
            cosh: math(function (value) { return (Math.exp(value) + Math.exp(-value)) / 2; }),
            deg2rad: math(function (value) { return value * Math.PI / 180; }),
            rad2deg: math(function (value) { return value * 180 / Math.PI; }),
            log: typed('mixed $num, mixed $base = null : float', function (value, base) {
                var result = Math.log(number(value));
                return float(native(base) === null ? result : result / Math.log(number(base)));
            }),
            pow: typed('mixed $base, mixed $exponent : mixed', function (base, exponent) {
                var result = Math.pow(number(base), number(exponent));
                return Number.isInteger(result) && Math.abs(result) <= 9007199254740991 &&
                    base.getType() !== 'float' && number(exponent) >= 0 ? integer(result) : float(result);
            }),
            intdiv: typed('mixed $num1, mixed $num2 : int', function (left, right) {
                return integer(number(left) / number(right));
            }),
            fmod: typed('mixed $num1, mixed $num2 : float', function (left, right) {
                return float(number(left) % number(right));
            }),
            fdiv: typed('mixed $num1, mixed $num2 : float', function (left, right) {
                return float(number(left) / number(right));
            }),
            atan2: typed('mixed $y, mixed $x : float', function (y, x) {
                return float(Math.atan2(number(y), number(x)));
            }),
            hypot: typed('mixed $x, mixed $y : float', function (x, y) {
                return float(Math.sqrt(number(x) * number(x) + number(y) * number(y)));
            }),
            pi: typed(': float', function () { return float(Math.PI); }),
            is_nan: typed('mixed $num : bool', function (value) { return values.createBoolean(isNaN(number(value))); }),
            is_finite: typed('mixed $num : bool', function (value) { return values.createBoolean(isFinite(number(value))); }),
            is_infinite: typed('mixed $num : bool', function (value) {
                var result = number(value);
                return values.createBoolean(!isFinite(result) && !isNaN(result));
            }),
            rand: randomFunction(),
            mt_rand: randomFunction(),
            random_int: typed('mixed $min, mixed $max : int', function (minimum, maximum) {
                return integer(random(number(minimum), number(maximum)));
            }),
            getrandmax: typed(': int', function () { return integer(2147483647); }),
            mt_getrandmax: typed(': int', function () { return integer(2147483647); }),
            decbin: typed('mixed $num : string', function (value) { return values.createString((number(value) >>> 0).toString(2)); }),
            decoct: typed('mixed $num : string', function (value) { return values.createString((number(value) >>> 0).toString(8)); }),
            bindec: typed('mixed $binary : mixed', function (value) { return integer(parseInt(text(value), 2) || 0); }),
            octdec: typed('mixed $octal : mixed', function (value) { return integer(parseInt(text(value), 8) || 0); }),
            hexdec: typed('mixed $hex : mixed', function (value) { return integer(parseInt(text(value), 16) || 0); }),
            base_convert: typed('mixed $num, mixed $from, mixed $to : string', function (value, from, to) {
                return values.createString((parseInt(text(value), number(from)) || 0).toString(number(to)));
            }),
            number_format: typed(
                'mixed $num, mixed $decimals = 0, mixed $decimal_separator = ".", mixed $thousands_separator = ","',
                function (value, decimals, decimalSeparator, thousandsSeparator) {
                    var fixed = round(number(value), number(decimals)).toFixed(Math.max(0, number(decimals)));
                    var negative = fixed.charAt(0) === '-';
                    var parts = (negative ? fixed.substring(1) : fixed).split('.');
                    var result = groupThousands(parts[0], text(thousandsSeparator)) +
                        (parts.length > 1 ? text(decimalSeparator) + parts[1] : '');
                    return values.createString((negative && /[1-9]/.test(fixed) ? '-' : '') + result);
                }),

            // Strings
            str_pad: typed('mixed $string, mixed $length, mixed $pad_string = " ", mixed $pad_type = 1 : string',
                           function (value, length, padding, type) {
                var string = text(value);
                var fill = text(padding) || ' ';
                var missing = number(length) - string.length;
                if (missing <= 0)
                    return values.createString(string);
                function make(count) {
                    var result = '';
                    while (result.length < count)
                        result += fill;
                    return result.substring(0, count);
                }
                var side = number(type);
                if (side === 0)
                    return values.createString(make(missing) + string);
                if (side === 2)
                    return values.createString(make(Math.floor(missing / 2)) + string + make(Math.ceil(missing / 2)));
                return values.createString(string + make(missing));
            }),
            ucwords: typed('mixed $string, mixed $separators = " \\t\\r\\n\\f\\u000b" : string', function (value, separators) {
                var delimiters = text(separators);
                var string = text(value);
                var result = '';
                for (var index = 0; index < string.length; ++index) {
                    var character = string.charAt(index);
                    result += index === 0 || delimiters.indexOf(string.charAt(index - 1)) >= 0 ? character.toUpperCase() : character;
                }
                return values.createString(result);
            }),
            wordwrap: typed('mixed $string, mixed $width = 75, mixed $break = "\\n", mixed $cut = false : string',
                            function (value, width, separator, cut) {
                var limit = Math.max(1, number(width));
                var lines = [];
                text(value).split(text(separator)).forEach(function (paragraph) {
                    var line = '';
                    paragraph.split(' ').forEach(function (word) {
                        while (native(cut) && word.length > limit) {
                            if (line !== '') {
                                lines.push(line);
                                line = '';
                            }
                            lines.push(word.substring(0, limit));
                            word = word.substring(limit);
                        }
                        if (line === '') {
                            line = word;
                        } else if (line.length + 1 + word.length <= limit) {
                            line += ' ' + word;
                        } else {
                            lines.push(line);
                            line = word;
                        }
                    });
                    lines.push(line);
                });
                return values.createString(lines.join(text(separator)));
            }),
            str_split: typed('mixed $string, mixed $length = 1 : array', function (value, length) {
                var string = text(value);
                var size = Math.max(1, number(length));
                var result = [];
                for (var index = 0; index < string.length; index += size)
                    result.push(string.substring(index, index + size));
                return toPhp(result.length > 0 ? result : ['']);
            }),
            mb_str_split: typed('mixed $string, mixed $length = 1 : array', function (value, length) {
                var characters = Array.from(text(value));
                var size = Math.max(1, number(length));
                var result = [];
                for (var index = 0; index < characters.length; index += size)
                    result.push(characters.slice(index, index + size).join(''));
                return toPhp(result);
            }),
            strrev: typed('mixed $string : string', function (value) {
                return values.createString(text(value).split('').reverse().join(''));
            }),
            ltrim: typed('mixed $string, mixed $characters = " \\n\\r\\t\\u000b\\u0000" : string', function (value, characters) {
                var string = text(value);
                var set = text(characters);
                var index = 0;
                while (index < string.length && set.indexOf(string.charAt(index)) >= 0)
                    ++index;
                return values.createString(string.substring(index));
            }),
            chr: typed('mixed $codepoint : string', function (value) {
                return values.createString(String.fromCharCode(((number(value) % 256) + 256) % 256));
            }),
            ord: typed('mixed $character : int', function (value) {
                return integer(utf8Bytes(text(value)).charCodeAt(0) || 0);
            }),
            str_contains: typed('mixed $haystack, mixed $needle : bool', function (haystack, needle) {
                return values.createBoolean(text(haystack).indexOf(text(needle)) >= 0);
            }),
            str_starts_with: typed('mixed $haystack, mixed $needle : bool', function (haystack, needle) {
                return values.createBoolean(text(haystack).indexOf(text(needle)) === 0);
            }),
            str_ends_with: typed('mixed $haystack, mixed $needle : bool', function (haystack, needle) {
                var string = text(haystack);
                var suffix = text(needle);
                return values.createBoolean(string.length >= suffix.length &&
                                            string.substring(string.length - suffix.length) === suffix);
            }),
            mb_strlen: typed('mixed $string : int', function (value) { return integer(Array.from(text(value)).length); }),
            mb_substr: typed('mixed $string, mixed $start, mixed $length = null : string', function (value, start, length) {
                var characters = Array.from(text(value));
                var first = number(start) < 0 ? Math.max(0, characters.length + number(start)) : number(start);
                var count = native(length) === null ? characters.length : number(length);
                var last = count < 0 ? characters.length + count : first + count;
                return values.createString(characters.slice(first, Math.max(first, last)).join(''));
            }),
            mb_strtoupper: typed('mixed $string : string', function (value) { return values.createString(text(value).toUpperCase()); }),
            mb_strtolower: typed('mixed $string : string', function (value) { return values.createString(text(value).toLowerCase()); }),
            mb_strrev: typed('mixed $string : string', function (value) {
                return values.createString(Array.from(text(value)).reverse().join(''));
            }),
            nl2br: typed('mixed $string : string', function (value) {
                return values.createString(text(value).replace(/(\r\n|\n|\r)/g, '<br />$1'));
            }),
            strip_tags: typed('mixed $string : string', function (value) {
                return values.createString(text(value).replace(/<[^>]*>/g, ''));
            }),
            addslashes: typed('mixed $string : string', function (value) {
                return values.createString(text(value).replace(/([\\'"])/g, '\\$1').replace(/\u0000/g, '\\0'));
            }),
            substr_replace: typed('mixed $string, mixed $replace, mixed $offset, mixed $length = null : string',
                                  function (value, replacement, offset, length) {
                var string = text(value);
                var start = number(offset) < 0 ? Math.max(0, string.length + number(offset)) : Math.min(number(offset), string.length);
                var count = native(length) === null ? string.length : number(length);
                var end = count < 0 ? Math.max(start, string.length + count) : Math.min(string.length, start + count);
                return values.createString(string.substring(0, start) + text(replacement) + string.substring(end));
            }),
            str_word_count: typed('mixed $string : int', function (value) {
                var words = text(value).match(/[A-Za-zÀ-ɏЀ-ӿ'-]+/g);
                return integer(words === null ? 0 : words.length);
            }),
            levenshtein: typed('mixed $string1, mixed $string2 : int', function (first, second) {
                var left = text(first);
                var right = text(second);
                var previous = [];
                for (var column = 0; column <= right.length; ++column)
                    previous.push(column);
                for (var row = 1; row <= left.length; ++row) {
                    var current = [row];
                    for (var position = 1; position <= right.length; ++position) {
                        current.push(Math.min(previous[position] + 1, current[position - 1] + 1,
                                              previous[position - 1] + (left.charAt(row - 1) === right.charAt(position - 1) ? 0 : 1)));
                    }
                    previous = current;
                }
                return integer(previous[right.length]);
            }),
            strcmp: typed('mixed $string1, mixed $string2 : int', function (first, second) {
                return integer(compare(text(first), text(second)) < 0 ? -1 : (text(first) === text(second) ? 0 : 1));
            }),
            urlencode: typed('mixed $string : string', function (value) {
                return values.createString(encodeURIComponent(text(value)).replace(/%20/g, '+')
                    .replace(/[!'()*~]/g, function (character) { return '%' + character.charCodeAt(0).toString(16).toUpperCase(); }));
            }),
            urldecode: typed('mixed $string : string', function (value) {
                return values.createString(decodeURIComponent(text(value).replace(/\+/g, ' ')));
            }),
            base64_encode: typed('mixed $string : string', function (value) {
                return values.createString(base64Encode(utf8Bytes(text(value))));
            }),
            base64_decode: typed('mixed $string : string', function (value) {
                return values.createString(fromUtf8Bytes(base64Decode(text(value))));
            }),

            // A PHP pattern "/…/flags" as a JavaScript expression: the PCRE
            // addon of Uniter has no preg_split.
            preg_split: typed('mixed $pattern, mixed $subject, mixed $limit = -1, mixed $flags = 0 : mixed',
                              function (pattern, subject, limit, flags) {
                var source = text(pattern);
                var delimiter = source.charAt(0);
                var closing = { '(': ')', '[': ']', '{': '}', '<': '>' }[delimiter] || delimiter;
                var end = source.lastIndexOf(closing);
                if (end <= 0)
                    return values.createBoolean(false);
                var modifiers = source.substring(end + 1).replace(/[^im]/g, '');
                var expression;
                try {
                    expression = new RegExp(source.substring(1, end), modifiers);
                } catch (error) {
                    return values.createBoolean(false);
                }
                var parts = text(subject).split(expression);
                if (number(flags) & 1)
                    parts = parts.filter(function (part) { return part !== '' && part !== undefined; });
                var maximum = number(limit);
                if (maximum > 0 && parts.length > maximum) {
                    var tail = text(subject);
                    // The rest after (maximum - 1) parts as a whole, as in PHP.
                    var cut = 0;
                    var match;
                    var global = new RegExp(expression.source, modifiers + 'g');
                    for (var count = 1; count < maximum && (match = global.exec(tail)) !== null; ++count)
                        cut = match.index + match[0].length;
                    parts = parts.slice(0, maximum - 1).concat([tail.substring(cut)]);
                }
                return toPhp(parts.map(function (part) { return part === undefined ? '' : part; }));
            }),

            // Types
            intval: typed('mixed $value, mixed $base = 10 : int', function (value, base) {
                var source = native(value);
                if (typeof source === 'string')
                    return integer(parseInt(source, number(base)) || 0);
                return integer(Number(source) || 0);
            }),
            floatval: typed('mixed $value : float', function (value) {
                var source = native(value);
                return float(typeof source === 'string' ? (parseFloat(source) || 0) : (Number(source) || 0));
            }),
            strval: typed('mixed $value : string', function (value) { return value.coerceToString(); }),
            boolval: typed('mixed $value : bool', function (value) { return value.coerceToBoolean(); }),
            print_r: typed('mixed $value, mixed $return = false : mixed', function (value, returnText) {
                var result = printReadable(value, '');
                if (native(returnText))
                    return values.createString(result);
                output.write(result);
                return values.createBoolean(true);
            }),
            json_encode: typed('mixed $value, mixed $flags = 0 : mixed', function (value, flags) {
                var result = JSON.stringify(toJson(value), null, (number(flags) & 128) ? 4 : undefined);
                return result === undefined ? values.createBoolean(false) : values.createString(result);
            }),
            // JSON objects become associative arrays, as json_decode($json, true).
            json_decode: typed('mixed $json, mixed $associative = null : mixed', function (json) {
                try {
                    return toPhp(JSON.parse(text(json)));
                } catch (error) {
                    return values.createNull();
                }
            }),

            // Arrays
            array_sum: typed('array $array : mixed', function (arrayValue) {
                var sum = 0;
                elements(arrayValue).forEach(function (item) { sum += number(item); });
                return Number.isInteger(sum) ? integer(sum) : float(sum);
            }),
            array_product: typed('array $array : mixed', function (arrayValue) {
                var product = 1;
                elements(arrayValue).forEach(function (item) { product *= number(item); });
                return Number.isInteger(product) ? integer(product) : float(product);
            }),
            range: typed('mixed $start, mixed $end, mixed $step = 1 : array', function (start, end, step) {
                var from = native(start);
                var to = native(end);
                var increment = Math.abs(number(step)) || 1;
                var letters = typeof from === 'string' && typeof to === 'string' && from.length === 1 && to.length === 1 &&
                    isNaN(Number(from));
                var first = letters ? from.charCodeAt(0) : Number(from);
                var last = letters ? to.charCodeAt(0) : Number(to);
                var result = [];
                if (first <= last) {
                    for (var value = first; value <= last && result.length < 10000000; value += increment)
                        result.push(letters ? String.fromCharCode(value) : value);
                } else {
                    for (var down = first; down >= last && result.length < 10000000; down -= increment)
                        result.push(letters ? String.fromCharCode(down) : down);
                }
                return toPhp(result);
            }),
            array_slice: typed('array $array, mixed $offset, mixed $length = null, mixed $preserve_keys = false : array',
                               function (arrayValue, offset, length, preserveKeys) {
                return sliceArray(arrayValue, number(offset), native(length) === null ? null : number(length), !!native(preserveKeys));
            }),
            array_reverse: typed('array $array, mixed $preserve_keys = false : array', function (arrayValue, preserveKeys) {
                return reindex(pairs(arrayValue).reverse(), !!native(preserveKeys));
            }),
            array_combine: typed('array $keys, array $values : array', function (keys, items) {
                var keyList = elements(keys);
                var valueList = elements(items);
                return values.createArray(keyList.map(function (key, index) {
                    return pairWithKey(key.coerceToKey(), valueList[index]);
                }));
            }),
            array_fill: typed('mixed $start_index, mixed $count, mixed $value : array', function (start, count, value) {
                var list = [];
                for (var index = 0; index < number(count); ++index)
                    list.push(pairWithKey(values.createInteger(number(start) + index), value));
                return values.createArray(list);
            }),
            array_fill_keys: typed('array $keys, mixed $value : array', function (keys, value) {
                return values.createArray(elements(keys).map(function (key) {
                    return pairWithKey(key.coerceToKey(), value);
                }));
            }),
            array_column: typed('array $array, mixed $column_key, mixed $index_key = null : array',
                                function (arrayValue, columnKey, indexKey) {
                var list = [];
                elements(arrayValue).forEach(function (row) {
                    if (row.getType() !== 'array')
                        return;
                    var item = native(columnKey) === null ? row : row.getElementByKey(columnKey).getValue();
                    if (native(indexKey) === null)
                        list.push(item);
                    else
                        list.push(pairWithKey(row.getElementByKey(indexKey).getValue().coerceToKey(), item));
                });
                return values.createArray(list);
            }),
            array_reduce: typed('array $array, callable $callback, mixed $initial = null : mixed',
                                function (arrayValue, callback, initial) {
                var carry = initial;
                elements(arrayValue).forEach(function (item) { carry = call(callback, [carry, item]); });
                return carry;
            }),
            array_walk: typed('array &$array, callable $callback, mixed $arg = null : bool', function (reference, callback, extra) {
                pairs(reference.getValue()).forEach(function (pair) {
                    call(callback, native(extra) === null ? [pair.getValue(), pair.getKey()] : [pair.getValue(), pair.getKey(), extra]);
                });
                return values.createBoolean(true);
            }),
            array_count_values: typed('array $array : array', function (arrayValue) {
                var counts = {};
                var order = [];
                elements(arrayValue).forEach(function (item) {
                    var key = text(item);
                    if (!Object.prototype.hasOwnProperty.call(counts, key)) {
                        counts[key] = { key: item, count: 0 };
                        order.push(key);
                    }
                    ++counts[key].count;
                });
                return values.createArray(order.map(function (key) {
                    return pairWithKey(counts[key].key.coerceToKey(), values.createInteger(counts[key].count));
                }));
            }),
            array_key_first: typed('array $array : mixed', function (arrayValue) {
                var keys = arrayValue.getKeys();
                return keys.length > 0 ? keys[0] : values.createNull();
            }),
            array_key_last: typed('array $array : mixed', function (arrayValue) {
                var keys = arrayValue.getKeys();
                return keys.length > 0 ? keys[keys.length - 1] : values.createNull();
            }),
            array_rand: typed('array $array, mixed $num = 1 : mixed', function (arrayValue, count) {
                var keys = arrayValue.getKeys();
                if (number(count) <= 1)
                    return keys[Math.floor(Math.random() * keys.length)];
                var chosen = keys.map(function (key, index) { return { key: key, index: index, order: Math.random() }; })
                    .sort(function (left, right) { return left.order - right.order; })
                    .slice(0, number(count))
                    .sort(function (left, right) { return left.index - right.index; });
                return values.createArray(chosen.map(function (entry) { return entry.key; }));
            }),
            array_pad: typed('array $array, mixed $length, mixed $value : array', function (arrayValue, length, value) {
                var list = elements(arrayValue);
                var missing = Math.abs(number(length)) - list.length;
                var padding = [];
                for (var index = 0; index < missing; ++index)
                    padding.push(value);
                return values.createArray(number(length) < 0 ? padding.concat(list) : list.concat(padding));
            }),
            array_chunk: typed('array $array, mixed $length, mixed $preserve_keys = false : array',
                               function (arrayValue, length, preserveKeys) {
                var list = pairs(arrayValue);
                var size = Math.max(1, number(length));
                var chunks = [];
                for (var index = 0; index < list.length; index += size)
                    chunks.push(reindex(list.slice(index, index + size), !!native(preserveKeys)));
                return values.createArray(chunks);
            }),
            array_intersect: typed('array $array, array ...$arrays : array', function (arrayValue, others) {
                var lists = others.getValues().map(function (other) { return elements(other).map(text); });
                return values.createArray(pairs(arrayValue).filter(function (pair) {
                    var item = text(pair.getValue());
                    return lists.every(function (list) { return list.indexOf(item) >= 0; });
                }));
            }),
            array_diff_key: typed('array $array, array ...$arrays : array', function (arrayValue, others) {
                var keys = [];
                others.getValues().forEach(function (other) {
                    other.getKeys().forEach(function (key) { keys.push(text(key)); });
                });
                return values.createArray(pairs(arrayValue).filter(function (pair) {
                    return keys.indexOf(text(pair.getKey())) < 0;
                }));
            }),
            array_is_list: typed('array $array : bool', function (arrayValue) {
                return values.createBoolean(arrayValue.getKeys().every(function (key, index) {
                    return native(key) === index;
                }));
            }),

            // Sorting - in place, by reference
            sort: sortFunction(byValue, false, false),
            rsort: sortFunction(byValue, false, true),
            arsort: sortFunction(byValue, true, true),
            ksort: sortFunction(byKey, true, false),
            usort: userSortFunction(pairValue, false),
            uasort: userSortFunction(pairValue, true),
            uksort: userSortFunction(pairKey, true),
            shuffle: typed('array &$array : bool', function (reference) {
                var list = elements(reference.getValue());
                for (var index = list.length - 1; index > 0; --index) {
                    var other = Math.floor(Math.random() * (index + 1));
                    var swap = list[index];
                    list[index] = list[other];
                    list[other] = swap;
                }
                reference.setValue(values.createArray(list));
                return values.createBoolean(true);
            }),

            // Date and time - in the time zone of the system
            date: typed('mixed $format, mixed $timestamp = null : string', function (format, time) {
                return values.createString(formatDate(text(format), new Date(timestamp(time))));
            }),
            mktime: typed('mixed $hour = null, mixed $minute = null, mixed $second = null, mixed $month = null, ' +
                          'mixed $day = null, mixed $year = null : int', function (hour, minute, second, month, day, year) {
                var now = new Date();
                function part(value, fallback) {
                    return native(value) === null ? fallback : number(value);
                }
                return integer(new Date(part(year, now.getFullYear()), part(month, now.getMonth() + 1) - 1,
                                        part(day, now.getDate()), part(hour, now.getHours()),
                                        part(minute, now.getMinutes()), part(second, now.getSeconds())).getTime() / 1000);
            }),
            checkdate: typed('mixed $month, mixed $day, mixed $year : bool', function (month, day, year) {
                var date = new Date(number(year), number(month) - 1, number(day));
                return values.createBoolean(date.getFullYear() === number(year) && date.getMonth() === number(month) - 1 &&
                                            date.getDate() === number(day));
            }),
            strtotime: typed('mixed $datetime, mixed $baseTimestamp = null : mixed', function (value) {
                var string = text(value).trim();
                if (string.toLowerCase() === 'now')
                    return integer(Date.now() / 1000);
                var time = Date.parse(string.replace(/^(\d{4}-\d{2}-\d{2}) (\d)/, '$1T$2'));
                return isNaN(time) ? values.createBoolean(false) : integer(time / 1000);
            })
        };
        // PHP does not allow to declare again a function that Uniter has.
        Object.keys(functions).forEach(function (name) {
            if (globalNamespace.hasFunction(name))
                delete functions[name];
        });
        return functions;
    };
})(globalThis.uniterPhp);
