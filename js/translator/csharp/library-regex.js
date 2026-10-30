// C#: System.Text.RegularExpressions - Regex over JavaScript regular
// expressions. The pattern is translated (named groups, inline options,
// \A \z, Singleline, IgnorePatternWhitespace); the groups are numbered the
// .NET way (unnamed first, then named). The positions of the groups are
// found by their text inside the match.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var CS = T.csharp;
    if (CS.library.units['system.text.regularexpressions/Regex'])
        return;

    CS.addLibrary('system.text.regularexpressions', String.raw`
using System.Collections;
using System.Collections.Generic;
namespace System.Text.RegularExpressions;

[Flags]
public enum RegexOptions
{
    None = 0,
    IgnoreCase = 1,
    Multiline = 2,
    ExplicitCapture = 4,
    Compiled = 8,
    Singleline = 16,
    IgnorePatternWhitespace = 32,
    RightToLeft = 64,
    ECMAScript = 256,
    CultureInvariant = 512,
    NonBacktracking = 1024
}

public delegate string MatchEvaluator(Match match);

public class Regex
{
    private readonly string _pattern;
    private readonly RegexOptions _options;

    public Regex(string pattern) : this(pattern, RegexOptions.None) { }
    public Regex(string pattern, RegexOptions options)
    {
        if (pattern == null)
            throw new ArgumentNullException("pattern");
        _pattern = pattern;
        _options = options;
        Check();
    }
    public Regex(string pattern, RegexOptions options, TimeSpan matchTimeout) : this(pattern, options) { }

    private extern void Check();
    // [index, length] of every group by its number; null - no match.
    private extern int[] Run(string input, int startat);
    private extern string[] Names();
    public RegexOptions Options => _options;
    public bool RightToLeft => false;
    public override string ToString() => _pattern;

    public string[] GetGroupNames() => Names();
    public int[] GetGroupNumbers()
    {
        var numbers = new int[Names().Length];
        for (int i = 0; i < numbers.Length; i++)
            numbers[i] = i;
        return numbers;
    }
    public string GroupNameFromNumber(int i)
    {
        var names = Names();
        return i >= 0 && i < names.Length ? names[i] : "";
    }
    public int GroupNumberFromName(string name)
    {
        if (name == null)
            throw new ArgumentNullException("name");
        return Array.IndexOf(Names(), name);
    }

    public bool IsMatch(string input) => Match(input).Success;
    public bool IsMatch(string input, int startat) => Match(input, startat).Success;
    public Match Match(string input) => Match(input, 0);
    public Match Match(string input, int startat)
    {
        if (input == null)
            throw new ArgumentNullException("input");
        if (startat < 0 || startat > input.Length)
            throw new ArgumentOutOfRangeException("startat", "Start index cannot be less than 0 or greater than input length.");
        int[] found = Run(input, startat);
        return found == null ? System.Text.RegularExpressions.Match.Empty : new Match(this, input, found);
    }
    public Match Match(string input, int beginning, int length) => Match(input.Substring(0, beginning + length), beginning);
    public MatchCollection Matches(string input) => Matches(input, 0);
    public MatchCollection Matches(string input, int startat)
    {
        if (input == null)
            throw new ArgumentNullException("input");
        return new MatchCollection(Match(input, startat));
    }
    public int Count(string input)
    {
        int count = 0;
        for (var match = Match(input); match.Success; match = match.NextMatch())
            count++;
        return count;
    }

    public string Replace(string input, string replacement) => Replace(input, replacement, -1, 0);
    public string Replace(string input, string replacement, int count) => Replace(input, replacement, count, 0);
    public string Replace(string input, string replacement, int count, int startat)
    {
        if (replacement == null)
            throw new ArgumentNullException("replacement");
        return Replace(input, match => match.Result(replacement), count, startat);
    }
    public string Replace(string input, MatchEvaluator evaluator) => Replace(input, evaluator, -1, 0);
    public string Replace(string input, MatchEvaluator evaluator, int count) => Replace(input, evaluator, count, 0);
    public string Replace(string input, MatchEvaluator evaluator, int count, int startat)
    {
        if (input == null)
            throw new ArgumentNullException("input");
        if (evaluator == null)
            throw new ArgumentNullException("evaluator");
        var result = new StringBuilder();
        int last = 0;
        for (var match = Match(input, startat); match.Success && count != 0; match = match.NextMatch(), count--)
        {
            result.Append(input, last, match.Index - last).Append(evaluator(match));
            last = match.Index + match.Length;
        }
        return result.Append(input, last, input.Length - last).ToString();
    }

    public string[] Split(string input) => Split(input, 0, 0);
    public string[] Split(string input, int count) => Split(input, count, 0);
    public string[] Split(string input, int count, int startat)
    {
        if (input == null)
            throw new ArgumentNullException("input");
        if (count < 0)
            throw new ArgumentOutOfRangeException("count", "Count cannot be less than -1.");
        var parts = new List<string>();
        int last = 0;
        for (var match = Match(input, startat); match.Success && (count == 0 || parts.Count < count - 1); match = match.NextMatch())
        {
            parts.Add(input.Substring(last, match.Index - last));
            for (int group = 1; group < match.Groups.Count; group++)
                if (match.Groups[group].Success)
                    parts.Add(match.Groups[group].Value);
            last = match.Index + match.Length;
        }
        parts.Add(input.Substring(last));
        return parts.ToArray();
    }

    public static bool IsMatch(string input, string pattern) => new Regex(pattern).IsMatch(input);
    public static bool IsMatch(string input, string pattern, RegexOptions options) => new Regex(pattern, options).IsMatch(input);
    public static Match Match(string input, string pattern) => new Regex(pattern).Match(input);
    public static Match Match(string input, string pattern, RegexOptions options) => new Regex(pattern, options).Match(input);
    public static MatchCollection Matches(string input, string pattern) => new Regex(pattern).Matches(input);
    public static MatchCollection Matches(string input, string pattern, RegexOptions options) => new Regex(pattern, options).Matches(input);
    public static int Count(string input, string pattern) => new Regex(pattern).Count(input);
    public static string Replace(string input, string pattern, string replacement) => new Regex(pattern).Replace(input, replacement);
    public static string Replace(string input, string pattern, string replacement, RegexOptions options) =>
        new Regex(pattern, options).Replace(input, replacement);
    public static string Replace(string input, string pattern, MatchEvaluator evaluator) => new Regex(pattern).Replace(input, evaluator);
    public static string Replace(string input, string pattern, MatchEvaluator evaluator, RegexOptions options) =>
        new Regex(pattern, options).Replace(input, evaluator);
    public static string[] Split(string input, string pattern) => new Regex(pattern).Split(input);
    public static string[] Split(string input, string pattern, RegexOptions options) => new Regex(pattern, options).Split(input);
    public static extern string Escape(string str);
    public static extern string Unescape(string str);
}

public class Capture
{
    private readonly string _text;
    internal Capture(string text, int index, int length)
    {
        _text = text;
        Index = index;
        Length = length;
    }
    public int Index { get; }
    public int Length { get; }
    public string Value => _text.Substring(Index, Length);
    public override string ToString() => Value;
}

public class Group : Capture
{
    internal Group(string text, int index, int length, bool success, string name) : base(text, index, length)
    {
        Success = success;
        Name = name;
    }
    public bool Success { get; }
    public string Name { get; }
    public CaptureCollection Captures => new CaptureCollection(Success ? new Capture[] { this } : new Capture[0]);
}

public class Match : Group
{
    private readonly Regex _regex;
    private readonly string _input;
    private readonly int[] _positions;
    private GroupCollection _groups;

    internal Match(Regex regex, string input, int[] positions)
        : base(input, positions == null ? 0 : positions[0], positions == null ? 0 : positions[1], positions != null, "0")
    {
        _regex = regex;
        _input = input;
        _positions = positions;
    }
    public static Match Empty { get; } = new Match(null, "", null);
    public GroupCollection Groups
    {
        get
        {
            if (_groups == null)
            {
                var names = _regex == null ? new[] { "0" } : _regex.GetGroupNames();
                var list = new Group[names.Length];
                list[0] = this;
                for (int i = 1; i < names.Length; i++)
                {
                    int index = _positions[2 * i];
                    list[i] = index < 0 ? new Group(_input, 0, 0, false, names[i]) : new Group(_input, index, _positions[2 * i + 1], true, names[i]);
                }
                _groups = new GroupCollection(list);
            }
            return _groups;
        }
    }
    public Match NextMatch()
    {
        if (_regex == null)
            return this;
        int next = Index + Length;
        if (Length == 0)
        {
            if (next >= _input.Length)
                return Empty;
            next++;
        }
        return _regex.Match(_input, next);
    }
    // A replacement pattern of .NET: $1, $ with {name}, $$, $&, $', $+, $_ and $ with a backtick.
    public virtual string Result(string replacement)
    {
        if (replacement == null)
            throw new ArgumentNullException("replacement");
        if (!Success)
            throw new NotSupportedException("Result cannot be called on a failed Match.");
        var result = new StringBuilder();
        for (int i = 0; i < replacement.Length; i++)
        {
            char c = replacement[i];
            if (c != '$' || i + 1 >= replacement.Length)
            {
                result.Append(c);
                continue;
            }
            char next = replacement[i + 1];
            if (next == '$') { result.Append('$'); i++; }
            else if (next == '&') { result.Append(Value); i++; }
            else if (next == '\x60') { result.Append(_input, 0, Index); i++; }
            else if (next == '\'') { result.Append(_input.Substring(Index + Length)); i++; }
            else if (next == '_') { result.Append(_input); i++; }
            else if (next == '+') { result.Append(Groups[Groups.Count - 1].Value); i++; }
            else if (char.IsDigit(next))
            {
                int end = i + 1;
                int number = 0, best = -1, bestEnd = i;
                while (end < replacement.Length && char.IsDigit(replacement[end]))
                {
                    number = number * 10 + (replacement[end] - '0');
                    end++;
                    if (number < Groups.Count) { best = number; bestEnd = end; }
                }
                if (best < 0) { result.Append(c); continue; }
                result.Append(Groups[best].Value);
                i = bestEnd - 1;
            }
            else if (next == '{')
            {
                int close = replacement.IndexOf('}', i + 2);
                string name = close < 0 ? null : replacement.Substring(i + 2, close - i - 2);
                int number = name == null ? -1 : _regex.GroupNumberFromName(name);
                if (number < 0 && name != null && int.TryParse(name, out var parsed) && parsed >= 0 && parsed < Groups.Count)
                    number = parsed;
                if (number < 0) { result.Append(c); continue; }
                result.Append(Groups[number].Value);
                i = close;
            }
            else
            {
                result.Append(c);
            }
        }
        return result.ToString();
    }
}

public class CaptureCollection : IReadOnlyList<Capture>
{
    private readonly Capture[] _items;
    internal CaptureCollection(Capture[] items) { _items = items; }
    public int Count => _items.Length;
    public Capture this[int i] => _items[i];
    public IEnumerator<Capture> GetEnumerator() => ((IEnumerable<Capture>)_items).GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

public class GroupCollection : IReadOnlyList<Group>, IReadOnlyDictionary<string, Group>
{
    private readonly Group[] _groups;
    internal GroupCollection(Group[] groups) { _groups = groups; }
    public int Count => _groups.Length;
    public Group this[int groupnum] => groupnum >= 0 && groupnum < _groups.Length ? _groups[groupnum] : new Group("", 0, 0, false, "");
    public Group this[string groupname]
    {
        get
        {
            foreach (var group in _groups)
                if (group.Name == groupname)
                    return group;
            return new Group("", 0, 0, false, groupname);
        }
    }
    public bool ContainsKey(string key)
    {
        foreach (var group in _groups)
            if (group.Name == key)
                return true;
        return false;
    }
    public bool TryGetValue(string key, out Group value)
    {
        foreach (var group in _groups)
            if (group.Name == key)
            {
                value = group;
                return true;
            }
        value = null;
        return false;
    }
    public IEnumerable<string> Keys
    {
        get
        {
            foreach (var group in _groups)
                yield return group.Name;
        }
    }
    public IEnumerable<Group> Values => _groups;
    public IEnumerator<Group> GetEnumerator() => ((IEnumerable<Group>)_groups).GetEnumerator();
    IEnumerator<KeyValuePair<string, Group>> IEnumerable<KeyValuePair<string, Group>>.GetEnumerator()
    {
        foreach (var group in _groups)
            yield return new KeyValuePair<string, Group>(group.Name, group);
    }
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

public class MatchCollection : IReadOnlyList<Match>
{
    private readonly List<Match> _matches = new List<Match>();
    internal MatchCollection(Match first)
    {
        for (var match = first; match.Success; match = match.NextMatch())
            _matches.Add(match);
    }
    public int Count => _matches.Count;
    public Match this[int i]
    {
        get
        {
            if (i < 0 || i >= _matches.Count)
                throw new ArgumentOutOfRangeException("i", "Specified argument was out of the range of valid values.");
            return _matches[i];
        }
    }
    public IEnumerator<Match> GetEnumerator() => _matches.GetEnumerator();
    IEnumerator IEnumerable.GetEnumerator() => GetEnumerator();
}

public sealed class RegexParseException : ArgumentException
{
    private int _offset;
    private RegexParseException() { }
    public int Offset => _offset;
}

public class RegexMatchTimeoutException : TimeoutException
{
    public RegexMatchTimeoutException() : base("The RegEx engine has timed out while trying to match a pattern to an input string.") { }
}
`);

    var natives = CS.natives;

    function rt() {
        return CS.rt;
    }

    var OPTIONS = { IgnoreCase: 1, Multiline: 2, ExplicitCapture: 4, Singleline: 16, IgnorePatternWhitespace: 32 };

    // The pattern of .NET as JavaScript: { regex, names (by number),
    // map (the JavaScript group of every .NET group) }.
    function translate(pattern, options) {
        var flags = options;
        var inline;
        while ((inline = /^\(\?([imnsx]+)\)/.exec(pattern)) !== null) {
            if (inline[1].indexOf('i') >= 0)
                flags |= OPTIONS.IgnoreCase;
            if (inline[1].indexOf('m') >= 0)
                flags |= OPTIONS.Multiline;
            if (inline[1].indexOf('n') >= 0)
                flags |= OPTIONS.ExplicitCapture;
            if (inline[1].indexOf('s') >= 0)
                flags |= OPTIONS.Singleline;
            if (inline[1].indexOf('x') >= 0)
                flags |= OPTIONS.IgnorePatternWhitespace;
            pattern = pattern.substring(inline[0].length);
        }
        var out = '';
        var groups = [];   // the capturing groups in the order of the text: name or null
        var inClass = false;
        var depth = 0;
        for (var index = 0; index < pattern.length; ++index) {
            var ch = pattern.charAt(index);
            if (ch === '\\') {
                var next = pattern.charAt(index + 1);
                if (next === '') {
                    throw parseError(pattern, index + 1, 'Illegal \\ at end of pattern.');
                }
                ++index;
                if (!inClass && next === 'A') {
                    out += '^';
                } else if (!inClass && (next === 'z' || next === 'Z')) {
                    out += '$';
                } else if (!inClass && next === 'G') {
                    out += '';
                } else if (next === 'k' && (pattern.charAt(index + 1) === '<' || pattern.charAt(index + 1) === '\'')) {
                    var close = pattern.indexOf(pattern.charAt(index + 1) === '<' ? '>' : '\'', index + 2);
                    out += '\\k<' + pattern.substring(index + 2, close) + '>';
                    index = close;
                } else if (next === 'p' || next === 'P') {
                    var end = pattern.indexOf('}', index);
                    var category = pattern.substring(index + 2, end);
                    var set = CATEGORIES[category] || CATEGORIES[category.charAt(0)] || 'A-Za-z';
                    out += next === 'p' ? (inClass ? set : '[' + set + ']') : (inClass ? '' : '[^' + set + ']');
                    index = end;
                } else {
                    out += '\\' + next;
                }
                continue;
            }
            if (inClass) {
                if (ch === ']')
                    inClass = false;
                out += ch;
                continue;
            }
            if ((flags & OPTIONS.IgnorePatternWhitespace) !== 0) {
                if (/\s/.test(ch))
                    continue;
                if (ch === '#') {
                    while (index < pattern.length && pattern.charAt(index) !== '\n')
                        ++index;
                    continue;
                }
            }
            if (ch === '[') {
                inClass = true;
                out += ch;
                if (pattern.charAt(index + 1) === '^') {
                    out += '^';
                    ++index;
                }
                if (pattern.charAt(index + 1) === ']') {
                    out += '\\]';
                    ++index;
                }
                continue;
            }
            if (ch === ')') {
                if (depth === 0)
                    throw parseError(pattern, index + 1, "Too many )'s.");
                --depth;
                out += ch;
                continue;
            }
            if (ch === '.' && (flags & OPTIONS.Singleline) !== 0) {
                out += '[\\s\\S]';
                continue;
            }
            if (ch !== '(') {
                out += ch;
                continue;
            }
            ++depth;
            if (pattern.charAt(index + 1) !== '?') {
                if ((flags & OPTIONS.ExplicitCapture) !== 0) {
                    out += '(?:';
                } else {
                    groups.push(null);
                    out += '(';
                }
                continue;
            }
            var named = /^\(\?(?:<([A-Za-z_][A-Za-z0-9_]*)>|'([A-Za-z_][A-Za-z0-9_]*)')/.exec(pattern.substring(index));
            if (named !== null) {
                groups.push(named[1] || named[2]);
                out += '(';
                index += named[0].length - 1;
                continue;
            }
            if (pattern.charAt(index + 2) === '>') {
                // An atomic group: an ordinary one in JavaScript.
                out += '(?:';
                index += 2;
                continue;
            }
            var local = /^\(\?([imnsx-]+):/.exec(pattern.substring(index));
            if (local !== null) {
                out += '(?:';
                index += local[0].length - 1;
                continue;
            }
            out += ch;
        }
        if (depth > 0)
            throw parseError(pattern, pattern.length, "Not enough )'s.");
        if (inClass)
            throw parseError(pattern, pattern.length, 'Unterminated [] set.');
        // .NET numbers the unnamed groups first, then the named ones.
        var names = ['0'];
        var map = [0];
        var unnamed = 0;
        groups.forEach(function (name, position) {
            if (name === null) {
                names.push(String(++unnamed));
                map.push(position + 1);
            }
        });
        groups.forEach(function (name, position) {
            if (name !== null && names.indexOf(name) < 0) {
                names.push(name);
                map.push(position + 1);
            }
        });
        // \k<name> as the number of its group in JavaScript.
        out = out.replace(/\\k<([^>]*)>/g, function (all, name) {
            var number = /^\d+$/.test(name) ? Number(name) : names.indexOf(name);
            if (number < 0 || number >= names.length)
                throw parseError(pattern, pattern.length, 'Reference to undefined group name \'' + name + '\'.');
            return '\\' + map[number];
        });
        var jsFlags = 'g' + ((flags & OPTIONS.IgnoreCase) !== 0 ? 'i' : '') + ((flags & OPTIONS.Multiline) !== 0 ? 'm' : '');
        var regex;
        try {
            regex = new RegExp(out, jsFlags);
        } catch (error) {
            throw parseError(pattern, 0, String(error.message));
        }
        return { regex: regex, names: names, map: map };
    }

    // \p{...}: the common Unicode categories, approximately.
    var CATEGORIES = {
        L: 'A-Za-z\\u00AA\\u00B5\\u00BA\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u03FF\\u0400-\\u052F\\u0531-\\u0587\\u05D0-\\u05EA\\u0620-\\u064A\\u3040-\\u30FF\\u4E00-\\u9FFF',
        Lu: 'A-Z\\u00C0-\\u00D6\\u00D8-\\u00DE\\u0391-\\u03A9\\u0410-\\u042F',
        Ll: 'a-z\\u00DF-\\u00F6\\u00F8-\\u00FF\\u03B1-\\u03C9\\u0430-\\u044F',
        N: '0-9\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F',
        Nd: '0-9\\u0660-\\u0669\\u06F0-\\u06F9\\u0966-\\u096F',
        P: '!-#%-*,-\\/:;?@\\[-\\]_{}\\u00A1\\u00A7\\u00AB\\u00B6\\u00B7\\u00BB\\u00BF\\u2010-\\u2027\\u2030-\\u205E',
        S: '$+<->^`|~\\u00A2-\\u00A6\\u00A8\\u00A9\\u00AC\\u00AE-\\u00B1\\u00B4\\u00D7\\u00F7',
        Z: ' \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000',
        IsCyrillic: '\\u0400-\\u04FF',
        IsGreek: '\\u0370-\\u03FF',
        IsBasicLatin: '\\u0000-\\u007F'
    };

    function parseError(pattern, offset, text) {
        var error = rt().exception('System.Text.RegularExpressions.RegexParseException',
                                   "Invalid pattern '" + pattern + "' at offset " + offset + '. ' + text);
        error._offset = offset;
        return error;
    }

    function compiled(regex) {
        if (regex.$js === undefined)
            regex.$js = translate(regex._pattern, regex._options);
        return regex.$js;
    }

    // The start of a group: JavaScript has no group indices - the text of
    // the group is looked up in the match.
    function groupStart(match, group, previous) {
        if (group === 0)
            return match.index;
        var offset = match[0].indexOf(match[group], previous);
        if (offset < 0)
            offset = match[0].indexOf(match[group]);
        return match.index + Math.max(0, offset);
    }

    natives['System.Text.RegularExpressions.Regex'] = {
        'Check()': function () { compiled(this); },
        'Names()': function () {
            return rt().arrayOf(rt().type('System.String'), compiled(this).names.slice());
        },
        'Run(string, int)': function (input, start) {
            var js = compiled(this);
            js.regex.lastIndex = start;
            var match = js.regex.exec(input);
            if (match === null)
                return null;
            // Groups in the order of the text: the search for each starts
            // where the previous one started.
            var starts = [];
            var previous = 0;
            for (var group = 1; group < match.length; ++group) {
                if (match[group] === undefined) {
                    starts[group] = -1;
                    continue;
                }
                starts[group] = groupStart(match, group, previous);
                previous = starts[group] - match.index;
            }
            var positions = [];
            js.map.forEach(function (jsGroup) {
                if (jsGroup === 0) {
                    positions.push(match.index, match[0].length);
                } else if (match[jsGroup] === undefined) {
                    positions.push(-1, 0);
                } else {
                    positions.push(starts[jsGroup], match[jsGroup].length);
                }
            });
            return rt().arrayOf(rt().type('System.Int32'), positions);
        },
        'Escape(string)': function (text) {
            if (text === null || text === undefined)
                throw CS.argNull('input');
            return text.replace(/[\\*+?|{[()^$.# ]/g, '\\$&').replace(/\t/g, '\\t').replace(/\n/g, '\\n')
                .replace(/\r/g, '\\r').replace(/\f/g, '\\f');
        },
        'Unescape(string)': function (text) {
            if (text === null || text === undefined)
                throw CS.argNull('input');
            return text.replace(/\\(?:u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2})|(.))/g, function (all, unicode, hex, other) {
                if (unicode !== undefined || hex !== undefined)
                    return String.fromCharCode(parseInt(unicode || hex, 16));
                return { t: '\t', n: '\n', r: '\r', f: '\f', e: '\x1b', a: '\x07' }[other] || other;
            });
        }
    };
})(globalThis);
