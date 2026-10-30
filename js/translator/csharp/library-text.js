// C#: System.Text - StringBuilder (its text is the JavaScript string $s)
// and the encodings UTF-8, ASCII, Latin-1, UTF-16 and UTF-32.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.text/StringBuilder'])
        return;

    CS.addLibrary('system.text', String.raw`
namespace System.Text;

public sealed class StringBuilder
{
    public extern StringBuilder();
    public extern StringBuilder(int capacity);
    public extern StringBuilder(string value);
    public extern StringBuilder(string value, int capacity);
    public extern StringBuilder(int capacity, int maxCapacity);
    public extern int Length { get; set; }
    public extern int Capacity { get; set; }
    public int MaxCapacity => int.MaxValue;
    [System.Runtime.CompilerServices.IndexerName("Chars")]
    public extern char this[int index] { get; set; }
    public extern StringBuilder Append(string value);
    public extern StringBuilder Append(string value, int startIndex, int count);
    public extern StringBuilder Append(char value);
    public extern StringBuilder Append(char value, int repeatCount);
    public extern StringBuilder Append(char[] value);
    public extern StringBuilder Append(char[] value, int startIndex, int charCount);
    public extern StringBuilder Append(bool value);
    public extern StringBuilder Append(int value);
    public extern StringBuilder Append(uint value);
    public extern StringBuilder Append(long value);
    public extern StringBuilder Append(ulong value);
    public extern StringBuilder Append(short value);
    public extern StringBuilder Append(ushort value);
    public extern StringBuilder Append(byte value);
    public extern StringBuilder Append(sbyte value);
    public extern StringBuilder Append(float value);
    public extern StringBuilder Append(double value);
    public extern StringBuilder Append(decimal value);
    public extern StringBuilder Append(object value);
    public extern StringBuilder Append(StringBuilder value);
    public extern StringBuilder AppendLine();
    public extern StringBuilder AppendLine(string value);
    public extern StringBuilder AppendFormat(string format, object arg0);
    public extern StringBuilder AppendFormat(string format, object arg0, object arg1);
    public extern StringBuilder AppendFormat(string format, object arg0, object arg1, object arg2);
    public extern StringBuilder AppendFormat(string format, params object[] args);
    public extern StringBuilder AppendFormat(IFormatProvider provider, string format, params object[] args);
    public StringBuilder AppendJoin(string separator, params object[] values) => Append(string.Join(separator, values));
    public StringBuilder AppendJoin(string separator, params string[] values) => Append(string.Join(separator, values));
    public StringBuilder AppendJoin(char separator, params object[] values) => Append(string.Join(separator, values));
    public StringBuilder AppendJoin(char separator, params string[] values) => Append(string.Join(separator, values));
    public StringBuilder AppendJoin<T>(string separator, System.Collections.Generic.IEnumerable<T> values) =>
        Append(string.Join(separator, values));
    public StringBuilder AppendJoin<T>(char separator, System.Collections.Generic.IEnumerable<T> values) =>
        Append(string.Join(separator, values));
    public extern StringBuilder Insert(int index, string value);
    public extern StringBuilder Insert(int index, string value, int count);
    public extern StringBuilder Insert(int index, char value);
    public extern StringBuilder Insert(int index, char[] value);
    public extern StringBuilder Insert(int index, bool value);
    public extern StringBuilder Insert(int index, int value);
    public extern StringBuilder Insert(int index, long value);
    public extern StringBuilder Insert(int index, double value);
    public extern StringBuilder Insert(int index, decimal value);
    public extern StringBuilder Insert(int index, object value);
    public extern StringBuilder Remove(int startIndex, int length);
    public extern StringBuilder Replace(string oldValue, string newValue);
    public extern StringBuilder Replace(string oldValue, string newValue, int startIndex, int count);
    public extern StringBuilder Replace(char oldChar, char newChar);
    public extern StringBuilder Replace(char oldChar, char newChar, int startIndex, int count);
    public extern StringBuilder Clear();
    public extern int EnsureCapacity(int capacity);
    public extern void CopyTo(int sourceIndex, char[] destination, int destinationIndex, int count);
    public extern bool Equals(StringBuilder sb);
    public override extern string ToString();
    public extern string ToString(int startIndex, int length);
}

public abstract class Encoding
{
    protected Encoding() { }
    public static Encoding UTF8 { get; } = new UTF8Encoding();
    public static Encoding ASCII { get; } = new ASCIIEncoding();
    public static Encoding Latin1 { get; } = new Latin1Encoding();
    public static Encoding Unicode { get; } = new UnicodeEncoding();
    public static Encoding BigEndianUnicode { get; } = new UnicodeEncoding(true, false);
    public static Encoding UTF32 { get; } = new UTF32Encoding();
    public static Encoding Default => UTF8;
    public abstract string EncodingName { get; }
    public abstract string WebName { get; }
    public virtual int CodePage => 0;
    public abstract byte[] GetBytes(string s);
    public virtual byte[] GetBytes(char[] chars) => GetBytes(new string(chars));
    public abstract string GetString(byte[] bytes, int index, int count);
    public virtual string GetString(byte[] bytes)
    {
        if (bytes == null)
            throw new ArgumentNullException("bytes");
        return GetString(bytes, 0, bytes.Length);
    }
    public virtual int GetByteCount(string s) => GetBytes(s).Length;
    public virtual int GetCharCount(byte[] bytes) => GetString(bytes).Length;
    public virtual char[] GetChars(byte[] bytes) => GetString(bytes).ToCharArray();
    public virtual byte[] GetPreamble() => new byte[0];
    public static Encoding GetEncoding(string name)
    {
        switch (name.ToLowerInvariant())
        {
            case "utf-8":
            case "utf8":
                return UTF8;
            case "us-ascii":
            case "ascii":
                return ASCII;
            case "utf-16":
            case "unicode":
                return Unicode;
            case "utf-32":
                return UTF32;
            case "iso-8859-1":
            case "latin1":
                return Latin1;
        }
        throw new ArgumentException("'" + name + "' is not a supported encoding name. For information on defining a custom encoding, see the documentation for the Encoding.RegisterProvider method.", "name");
    }
    public static byte[] Convert(Encoding srcEncoding, Encoding dstEncoding, byte[] bytes) => dstEncoding.GetBytes(srcEncoding.GetString(bytes));
}

public class UTF8Encoding : Encoding
{
    private readonly bool _bom;
    public UTF8Encoding() { }
    public UTF8Encoding(bool encoderShouldEmitUTF8Identifier) { _bom = encoderShouldEmitUTF8Identifier; }
    public override string EncodingName => "Unicode (UTF-8)";
    public override string WebName => "utf-8";
    public override int CodePage => 65001;
    public override extern byte[] GetBytes(string s);
    public override extern string GetString(byte[] bytes, int index, int count);
    public override byte[] GetPreamble() => _bom ? new byte[] { 0xEF, 0xBB, 0xBF } : new byte[0];
}

public class ASCIIEncoding : Encoding
{
    public override string EncodingName => "US-ASCII";
    public override string WebName => "us-ascii";
    public override int CodePage => 20127;
    public override extern byte[] GetBytes(string s);
    public override extern string GetString(byte[] bytes, int index, int count);
}

internal sealed class Latin1Encoding : Encoding
{
    public override string EncodingName => "Western European (ISO)";
    public override string WebName => "iso-8859-1";
    public override int CodePage => 28591;
    public override extern byte[] GetBytes(string s);
    public override extern string GetString(byte[] bytes, int index, int count);
}

public class UnicodeEncoding : Encoding
{
    private readonly bool _bigEndian;
    public UnicodeEncoding() { }
    public UnicodeEncoding(bool bigEndian, bool byteOrderMark) { _bigEndian = bigEndian; }
    public override string EncodingName => _bigEndian ? "Unicode (Big-Endian)" : "Unicode";
    public override string WebName => _bigEndian ? "utf-16BE" : "utf-16";
    public override int CodePage => _bigEndian ? 1201 : 1200;
    public override extern byte[] GetBytes(string s);
    public override extern string GetString(byte[] bytes, int index, int count);
}

public class UTF32Encoding : Encoding
{
    public override string EncodingName => "Unicode (UTF-32)";
    public override string WebName => "utf-32";
    public override int CodePage => 12000;
    public override extern byte[] GetBytes(string s);
    public override extern string GetString(byte[] bytes, int index, int count);
}
`);

    var natives = CS.natives;
    var i64 = T.i64, u64 = T.u64;

    function rt() {
        return CS.rt;
    }

    function text(builder) {
        return builder.$s;
    }

    function checkIndex(builder, index, inclusive) {
        if (index < 0 || index > builder.$s.length || (!inclusive && index === builder.$s.length))
            throw CS.argRange('index', 'Index was out of range. Must be non-negative and less than the size of the collection.');
    }

    function append(value) {
        return function () {
            this.$s += value.apply(null, arguments);
            return this;
        };
    }

    function insert(value) {
        return function (index) {
            if (index < 0 || index > this.$s.length)
                throw CS.argRange('index', 'Index was out of range. Must be non-negative and less than or equal to the size of the collection.');
            this.$s = this.$s.substring(0, index) + value.apply(null, Array.prototype.slice.call(arguments, 1)) + this.$s.substring(index);
            return this;
        };
    }

    function stringOf(value) {
        return value === null || value === undefined ? '' : value;
    }

    function checkCapacity(capacity) {
        if (capacity < 0)
            throw CS.argRange('capacity', "'capacity' must be greater than zero.");
    }

    function charRange(chars, start, count) {
        if (chars === null || chars === undefined) {
            if (start === 0 && count === 0)
                return '';
            throw CS.argNull('value');
        }
        if (start < 0)
            throw CS.argRange('startIndex', 'StartIndex cannot be less than zero.');
        if (count < 0)
            throw CS.argRange('charCount', 'Value must be positive.');
        if (count > chars.length - start)
            throw CS.argRange('charCount', 'Index and count must refer to a location within the buffer.');
        return CS.charsToString(chars, start, count);
    }

    natives['System.Text.StringBuilder'] = {
        '.ctor()': function () {
            this.$s = '';
            return this;
        },
        '.ctor(int)': function (capacity) {
            checkCapacity(capacity);
            this.$s = '';
            this.$capacity = capacity;
            return this;
        },
        '.ctor(string)': function (value) {
            this.$s = stringOf(value);
            return this;
        },
        '.ctor(string, int)': function (value, capacity) {
            checkCapacity(capacity);
            this.$s = stringOf(value);
            this.$capacity = capacity;
            return this;
        },
        '.ctor(int, int)': function (capacity) {
            checkCapacity(capacity);
            this.$s = '';
            this.$capacity = capacity;
            return this;
        },
        'get_Length()': function () { return this.$s.length; },
        'set_Length(int)': function (length) {
            if (length < 0)
                throw CS.argRange('value', 'Length cannot be less than zero.');
            if (length <= this.$s.length)
                this.$s = this.$s.substring(0, length);
            else
                this.$s += new Array(length - this.$s.length + 1).join('\u0000');
        },
        'get_Capacity()': function () {
            var capacity = this.$capacity || 16;
            while (capacity < this.$s.length)
                capacity *= 2;
            this.$capacity = capacity;
            return capacity;
        },
        'set_Capacity(int)': function (capacity) {
            if (capacity < this.$s.length)
                throw CS.argRange('value', 'Capacity cannot be less than the current size.');
            this.$capacity = capacity;
        },
        'get_Item(int)': function (index) {
            checkIndex(this, index, false);
            return this.$s.charCodeAt(index);
        },
        'set_Item(int, char)': function (index, code) {
            checkIndex(this, index, false);
            this.$s = this.$s.substring(0, index) + String.fromCharCode(code) + this.$s.substring(index + 1);
        },
        'Append(string)': append(stringOf),
        'Append(string, int, int)': function (value, start, count) {
            if (value === null || value === undefined) {
                if (start === 0 && count === 0)
                    return this;
                throw CS.argNull('value');
            }
            if (start < 0)
                throw CS.argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            if (count < 0)
                throw CS.argRange('count', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            if (start > value.length - count)
                throw CS.argRange('value', 'Index and count must refer to a location within the string.');
            this.$s += value.substring(start, start + count);
            return this;
        },
        'Append(char)': append(function (code) { return String.fromCharCode(code); }),
        'Append(char, int)': function (code, count) {
            if (count < 0)
                throw CS.argRange('repeatCount', 'Count cannot be less than zero.');
            this.$s += new Array(count + 1).join(String.fromCharCode(code));
            return this;
        },
        'Append(char[])': append(function (chars) { return chars === null || chars === undefined ? '' : CS.charsToString(chars, 0, chars.length); }),
        'Append(char[], int, int)': function (chars, start, count) {
            this.$s += charRange(chars, start, count);
            return this;
        },
        'Append(bool)': append(function (value) { return value ? 'True' : 'False'; }),
        'Append(int)': append(String),
        'Append(uint)': append(String),
        'Append(long)': append(function (value) { return i64.str(value); }),
        'Append(ulong)': append(function (value) { return u64.str(value); }),
        'Append(short)': append(String),
        'Append(ushort)': append(String),
        'Append(byte)': append(String),
        'Append(sbyte)': append(String),
        'Append(float)': append(function (value) { return CS.formatDouble(value, true); }),
        'Append(double)': append(function (value) { return CS.formatDouble(value, false); }),
        'Append(decimal)': append(function (value) { return CS.decimal.str(value); }),
        'Append(object)': append(function (value) { return rt().objectString(value); }),
        'Append(StringBuilder)': append(function (value) { return value === null || value === undefined ? '' : text(value); }),
        'AppendLine()': append(function () { return '\n'; }),
        'AppendLine(string)': append(function (value) { return stringOf(value) + '\n'; }),
        'AppendFormat(string, object)': append(function (format, a) { return CS.composite(format, [a]); }),
        'AppendFormat(string, object, object)': append(function (format, a, b) { return CS.composite(format, [a, b]); }),
        'AppendFormat(string, object, object, object)': append(function (format, a, b, c) { return CS.composite(format, [a, b, c]); }),
        'AppendFormat(string, object[])': append(function (format, args) {
            if (args === null || args === undefined)
                throw CS.argNull('args');
            return CS.composite(format, args);
        }),
        'AppendFormat(IFormatProvider, string, object[])': append(function (provider, format, args) {
            if (args === null || args === undefined)
                throw CS.argNull('args');
            return CS.composite(format, args);
        }),
        'Insert(int, string)': insert(stringOf),
        'Insert(int, string, int)': function (index, value, count) {
            if (count < 0)
                throw CS.argRange('count', 'Non-negative number required.');
            return insert(function () { return new Array(count + 1).join(stringOf(value)); }).call(this, index);
        },
        'Insert(int, char)': insert(function (code) { return String.fromCharCode(code); }),
        'Insert(int, char[])': insert(function (chars) { return chars === null || chars === undefined ? '' : CS.charsToString(chars, 0, chars.length); }),
        'Insert(int, bool)': insert(function (value) { return value ? 'True' : 'False'; }),
        'Insert(int, int)': insert(String),
        'Insert(int, long)': insert(function (value) { return i64.str(value); }),
        'Insert(int, double)': insert(function (value) { return CS.formatDouble(value, false); }),
        'Insert(int, decimal)': insert(function (value) { return CS.decimal.str(value); }),
        'Insert(int, object)': insert(function (value) { return rt().objectString(value); }),
        'Remove(int, int)': function (start, length) {
            if (length < 0)
                throw CS.argRange('length', 'Length cannot be less than zero.');
            if (start < 0)
                throw CS.argRange('startIndex', 'StartIndex cannot be less than zero.');
            if (length > this.$s.length - start)
                throw CS.argRange('index', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            this.$s = this.$s.substring(0, start) + this.$s.substring(start + length);
            return this;
        },
        'Replace(string, string)': function (oldValue, newValue) {
            return natives['System.Text.StringBuilder']['Replace(string, string, int, int)'].call(this, oldValue, newValue, 0, this.$s.length);
        },
        'Replace(string, string, int, int)': function (oldValue, newValue, start, count) {
            if (oldValue === null || oldValue === undefined)
                throw CS.argNull('oldValue');
            if (oldValue.length === 0)
                throw CS.argError('The value cannot be an empty string.', 'oldValue');
            if (start < 0 || start > this.$s.length)
                throw CS.argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            if (count < 0 || start > this.$s.length - count)
                throw CS.argRange('count', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            var region = this.$s.substring(start, start + count).split(oldValue).join(stringOf(newValue));
            this.$s = this.$s.substring(0, start) + region + this.$s.substring(start + count);
            return this;
        },
        'Replace(char, char)': function (oldCode, newCode) {
            this.$s = this.$s.split(String.fromCharCode(oldCode)).join(String.fromCharCode(newCode));
            return this;
        },
        'Replace(char, char, int, int)': function (oldCode, newCode, start, count) {
            if (start < 0 || start > this.$s.length || count < 0 || start > this.$s.length - count)
                throw CS.argRange('startIndex', 'Index was out of range. Must be non-negative and less than the size of the collection.');
            var region = this.$s.substring(start, start + count).split(String.fromCharCode(oldCode)).join(String.fromCharCode(newCode));
            this.$s = this.$s.substring(0, start) + region + this.$s.substring(start + count);
            return this;
        },
        'Clear()': function () {
            this.$s = '';
            return this;
        },
        'EnsureCapacity(int)': function (capacity) {
            checkCapacity(capacity);
            var current = natives['System.Text.StringBuilder']['get_Capacity()'].call(this);
            if (current < capacity)
                this.$capacity = capacity;
            return Math.max(current, capacity);
        },
        'CopyTo(int, char[], int, int)': function (sourceIndex, destination, destinationIndex, count) {
            natives['System.String']['CopyTo(int, char[], int, int)'].call(this.$s, sourceIndex, destination, destinationIndex, count);
        },
        'Equals(StringBuilder)': function (other) { return other !== null && other !== undefined && other.$s === this.$s; },
        'ToString()': function () { return this.$s; },
        'ToString(int, int)': function (start, length) {
            if (start < 0)
                throw CS.argRange('startIndex', 'StartIndex cannot be less than zero.');
            if (length < 0)
                throw CS.argRange('length', 'Length cannot be less than zero.');
            if (start > this.$s.length - length)
                throw CS.argRange('chars', 'Index and length must refer to a location within the string.');
            return this.$s.substr(start, length);
        }
    };

    function byteArray(list) {
        return rt().arrayOf(rt().type('System.Byte'), list);
    }

    function checkBytes(bytes, index, count) {
        if (bytes === null || bytes === undefined)
            throw CS.argNull('bytes');
        if (index < 0 || count < 0)
            throw CS.argRange(index < 0 ? 'index' : 'count', 'Non-negative number required.');
        if (bytes.length - index < count)
            throw CS.argRange('bytes', 'Index and count must refer to a location within the buffer.');
        return Array.prototype.slice.call(bytes, index, index + count);
    }

    function checkString(value) {
        if (value === null || value === undefined)
            throw CS.argNull('s');
        return value;
    }

    function utf8Bytes(value) {
        var encoded = T.utf8.encode(checkString(value));
        var list = [];
        for (var index = 0; index < encoded.length; ++index)
            list.push(encoded.charCodeAt(index));
        return list;
    }

    natives['System.Text.UTF8Encoding'] = {
        'GetBytes(string)': function (value) { return byteArray(utf8Bytes(value)); },
        'GetString(byte[], int, int)': function (bytes, index, count) {
            var list = checkBytes(bytes, index, count);
            return T.utf8.decode(String.fromCharCode.apply(null, list));
        }
    };

    natives['System.Text.ASCIIEncoding'] = {
        'GetBytes(string)': function (value) {
            checkString(value);
            var list = [];
            for (var index = 0; index < value.length; ++index) {
                var code = value.charCodeAt(index);
                list.push(code < 128 ? code : 63);
            }
            return byteArray(list);
        },
        'GetString(byte[], int, int)': function (bytes, index, count) {
            return checkBytes(bytes, index, count).map(function (code) { return String.fromCharCode(code < 128 ? code : 0xfffd); }).join('');
        }
    };

    natives['System.Text.Latin1Encoding'] = {
        'GetBytes(string)': function (value) {
            checkString(value);
            var list = [];
            for (var index = 0; index < value.length; ++index) {
                var code = value.charCodeAt(index);
                list.push(code < 256 ? code : 63);
            }
            return byteArray(list);
        },
        'GetString(byte[], int, int)': function (bytes, index, count) {
            return checkBytes(bytes, index, count).map(function (code) { return String.fromCharCode(code); }).join('');
        }
    };

    natives['System.Text.UnicodeEncoding'] = {
        'GetBytes(string)': function (value) {
            checkString(value);
            var list = [];
            for (var index = 0; index < value.length; ++index) {
                var code = value.charCodeAt(index);
                if (this._bigEndian)
                    list.push(code >> 8, code & 255);
                else
                    list.push(code & 255, code >> 8);
            }
            return byteArray(list);
        },
        'GetString(byte[], int, int)': function (bytes, index, count) {
            var list = checkBytes(bytes, index, count);
            var out = '';
            for (var position = 0; position + 1 < list.length; position += 2)
                out += String.fromCharCode(this._bigEndian ? (list[position] << 8) | list[position + 1] : list[position] | (list[position + 1] << 8));
            if (list.length % 2 === 1)
                out += '�';
            return out;
        }
    };

    natives['System.Text.UTF32Encoding'] = {
        'GetBytes(string)': function (value) {
            checkString(value);
            var list = [];
            for (var index = 0; index < value.length; ++index) {
                var code = value.charCodeAt(index);
                if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
                    var low = value.charCodeAt(index + 1);
                    if (low >= 0xdc00 && low <= 0xdfff) {
                        code = ((code - 0xd800) << 10) + (low - 0xdc00) + 0x10000;
                        ++index;
                    }
                }
                list.push(code & 255, (code >> 8) & 255, (code >> 16) & 255, 0);
            }
            return byteArray(list);
        },
        'GetString(byte[], int, int)': function (bytes, index, count) {
            var list = checkBytes(bytes, index, count);
            var out = '';
            for (var position = 0; position + 3 < list.length; position += 4) {
                var code = list[position] | (list[position + 1] << 8) | (list[position + 2] << 16) | (list[position + 3] << 24);
                if (code >= 0x10000) {
                    code -= 0x10000;
                    out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
                } else {
                    out += String.fromCharCode(code);
                }
            }
            return out;
        }
    };
})(globalThis);
