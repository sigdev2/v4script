// Java: java.util.regex - Pattern and Matcher over JavaScript regular
// expressions (Java.regex translates the Java syntax). Named groups go by
// numbers: their names are parsed from the text of the pattern.
(function (global) {
    'use strict';

    var T = global.V4ScriptTranslator;
    var Java = T.java;
    if (Java.library.units['java.util.regex'])
        return;

    Java.addLibrary('java.util.regex', 'java.util.regex', 'import java.util.*;\nimport java.util.function.*;\n' + String.raw`
public interface MatchResult {
    int start();
    int start(int group);
    int end();
    int end(int group);
    String group();
    String group(int group);
    int groupCount();
}

public final class Pattern {
    public static final int UNIX_LINES = 1;
    public static final int CASE_INSENSITIVE = 2;
    public static final int COMMENTS = 4;
    public static final int MULTILINE = 8;
    public static final int LITERAL = 16;
    public static final int DOTALL = 32;
    public static final int UNICODE_CASE = 64;
    private final String pattern;
    private final int flags;
    private Pattern(String pattern, int flags) {
        this.pattern = pattern;
        this.flags = flags;
        check();
    }
    private native void check();
    public static Pattern compile(String regex) { return new Pattern(regex, 0); }
    public static Pattern compile(String regex, int flags) { return new Pattern(regex, flags); }
    public static boolean matches(String regex, CharSequence input) { return compile(regex).matcher(input).matches(); }
    public static native String quote(String text);
    public String pattern() { return pattern; }
    public int flags() { return flags; }
    public String toString() { return pattern; }
    public Matcher matcher(CharSequence input) { return new Matcher(this, input.toString()); }
    public native String[] split(CharSequence input);
    public native String[] split(CharSequence input, int limit);
    public java.util.stream.Stream<String> splitAsStream(CharSequence input) { return Arrays.stream(split(input)); }
    public Predicate<String> asPredicate() { return text -> matcher(text).find(); }
    public Predicate<String> asMatchPredicate() { return text -> matcher(text).matches(); }
}

public final class Matcher implements MatchResult {
    private Pattern pattern;
    private String text;
    Matcher(Pattern pattern, String text) {
        this.pattern = pattern;
        this.text = text;
    }
    public Pattern pattern() { return pattern; }
    public native boolean matches();
    public native boolean lookingAt();
    public native boolean find();
    public native boolean find(int start);
    public native String group();
    public native String group(int group);
    public native String group(String name);
    public native int groupCount();
    public native int start();
    public native int start(int group);
    public native int start(String name);
    public native int end();
    public native int end(int group);
    public native int end(String name);
    public native boolean hitEnd();
    public native Matcher reset();
    public Matcher reset(CharSequence input) {
        text = input.toString();
        return reset();
    }
    public Matcher usePattern(Pattern pattern) {
        this.pattern = pattern;
        return this;
    }
    public native String replaceAll(String replacement);
    public native String replaceFirst(String replacement);
    public String replaceAll(Function<MatchResult, String> replacer) {
        reset();
        StringBuilder sb = new StringBuilder();
        while (find())
            appendReplacement(sb, quoteReplacement(replacer.apply(toMatchResult())));
        appendTail(sb);
        return sb.toString();
    }
    public native Matcher appendReplacement(StringBuilder sb, String replacement);
    public native StringBuilder appendTail(StringBuilder sb);
    public native MatchResult toMatchResult();
    public java.util.stream.Stream<MatchResult> results() {
        reset();
        List<MatchResult> found = new ArrayList<>();
        while (find())
            found.add(toMatchResult());
        return found.stream();
    }
    public static native String quoteReplacement(String text);
    public String toString() {
        return "java.util.regex.Matcher[pattern=" + pattern + " region=0," + text.length() + " lastmatch=" + lastMatchText() + "]";
    }
    private native String lastMatchText();
}

// A snapshot of a match (toMatchResult).
final class MatchSnapshot implements MatchResult {
    private final String[] groups;
    private final int[] starts;
    MatchSnapshot(String[] groups, int[] starts) {
        this.groups = groups;
        this.starts = starts;
    }
    private void check(int group) {
        if (group < 0 || group >= groups.length)
            throw new IndexOutOfBoundsException("No group " + group);
    }
    public int start() { return starts[0]; }
    public int start(int group) {
        check(group);
        return starts[group];
    }
    public int end() { return starts[0] + groups[0].length(); }
    public int end(int group) {
        check(group);
        return groups[group] == null ? -1 : starts[group] + groups[group].length();
    }
    public String group() { return groups[0]; }
    public String group(int group) {
        check(group);
        return groups[group];
    }
    public int groupCount() { return groups.length - 1; }
}

public class PatternSyntaxException extends IllegalArgumentException {
    public PatternSyntaxException(String message) { super(message); }
}
`);

    function rt() {
        return Java.rt;
    }

    var FLAGS = { CASE_INSENSITIVE: 2, MULTILINE: 8, LITERAL: 16, DOTALL: 32, COMMENTS: 4 };

    // Group names by numbers: (?<name>…) is a group, (?:…), (?=…) and the others are not.
    function groupNames(pattern) {
        var names = Object.create(null);
        var count = 0;
        var inClass = false;
        for (var index = 0; index < pattern.length; ++index) {
            var ch = pattern.charAt(index);
            if (ch === '\\') {
                ++index;
                continue;
            }
            if (inClass) {
                if (ch === ']')
                    inClass = false;
                continue;
            }
            if (ch === '[') {
                inClass = true;
                continue;
            }
            if (ch !== '(')
                continue;
            if (pattern.charAt(index + 1) !== '?') {
                ++count;
                continue;
            }
            var named = /^\(\?<([a-zA-Z][a-zA-Z0-9]*)>/.exec(pattern.substring(index));
            if (named !== null) {
                ++count;
                names[named[1]] = count;
            }
        }
        return { names: names, count: count };
    }

    // A Java pattern with flags as a RegExp: the embedded (?i)(?s)(?m) at
    // the start are flags; DOTALL makes "." [\s\S]; LITERAL escapes.
    function compile(patternObject, extra) {
        var key = '$regex' + (extra || '');
        if (patternObject[key] !== undefined)
            return patternObject[key];
        var source = patternObject.pattern;
        var flags = patternObject.flags;
        if ((flags & FLAGS.LITERAL) !== 0)
            source = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        var inline;
        while ((inline = /^\(\?([imsux]+)\)/.exec(source)) !== null) {
            if (inline[1].indexOf('i') >= 0)
                flags |= FLAGS.CASE_INSENSITIVE;
            if (inline[1].indexOf('m') >= 0)
                flags |= FLAGS.MULTILINE;
            if (inline[1].indexOf('s') >= 0)
                flags |= FLAGS.DOTALL;
            source = source.substring(inline[0].length);
        }
        if ((flags & FLAGS.DOTALL) !== 0)
            source = dotAll(source);
        source = source.replace(/\\R/g, '(?:\\r\\n|[\\n\\r\\u2028\\u2029\\u000B\\u000C\\u0085])').replace(/\\h/g, '[ \\t\\u00A0]');
        if (extra === 'whole')
            source = '^(?:' + source + ')$';
        else if (extra === 'start')
            source = '^(?:' + source + ')';
        var jsFlags = 'g' + ((flags & FLAGS.CASE_INSENSITIVE) !== 0 ? 'i' : '') + ((flags & FLAGS.MULTILINE) !== 0 && !extra ? 'm' : '');
        patternObject[key] = Java.regex(source, jsFlags);
        if (patternObject.$groups === undefined)
            patternObject.$groups = groupNames(patternObject.pattern);
        return patternObject[key];
    }

    function dotAll(source) {
        var out = '';
        var inClass = false;
        for (var index = 0; index < source.length; ++index) {
            var ch = source.charAt(index);
            if (ch === '\\') {
                out += ch + source.charAt(++index);
                continue;
            }
            if (inClass) {
                if (ch === ']')
                    inClass = false;
            } else if (ch === '[') {
                inClass = true;
            } else if (ch === '.') {
                out += '[\\s\\S]';
                continue;
            }
            out += ch;
        }
        return out;
    }

    function noMatch() {
        return rt().exception('java.lang.IllegalStateException', 'No match found');
    }

    function current(matcher) {
        if (matcher.$match === undefined || matcher.$match === null)
            throw noMatch();
        return matcher.$match;
    }

    function groupIndex(matcher, name) {
        compile(matcher.pattern);
        var index = matcher.pattern.$groups.names[name];
        if (index === undefined)
            throw rt().exception('java.lang.IllegalArgumentException', 'No group with name <' + name + '>');
        return index;
    }

    function checkGroup(matcher, group) {
        var count = compile(matcher.pattern) && matcher.pattern.$groups.count;
        if (group < 0 || group > count)
            throw rt().exception('java.lang.IndexOutOfBoundsException', 'No group ' + group);
    }

    // The start of a group: JavaScript has no group indices - the text of
    // the group is looked up in the match.
    function groupStart(match, group) {
        if (group === 0)
            return match.index;
        if (match[group] === undefined)
            return -1;
        var offset = match[0].indexOf(match[group]);
        return match.index + Math.max(0, offset);
    }

    function search(matcher, from, mode) {
        var regex = compile(matcher.pattern, mode);
        regex.lastIndex = from;
        var match = regex.exec(matcher.text);
        if (match !== null && mode === undefined && match.index < from)
            match = null;
        matcher.$match = match;
        if (match !== null)
            matcher.$position = match[0].length === 0 ? match.index + 1 : match.index + match[0].length;
        return match !== null;
    }

    // A Java replacement: $1, ${name}, \$ is literal.
    function replacement(matcher, text) {
        compile(matcher.pattern);
        var names = matcher.pattern.$groups.names;
        return Java.replacement(text.replace(/\$\{([a-zA-Z][a-zA-Z0-9]*)\}/g, function (all, name) {
            if (names[name] === undefined)
                throw rt().exception('java.lang.IllegalArgumentException', 'No group with name {' + name + '}');
            return '$' + names[name];
        }));
    }

    function expand(matcher, text) {
        var match = current(matcher);
        return replacement(matcher, text).replace(/\$(\$|\d+)/g, function (all, what) {
            if (what === '$')
                return '$';
            var group = Number(what);
            return match[group] === undefined ? '' : match[group];
        });
    }

    Java.natives['java.util.regex.Pattern'] = {
        'check()': function () { compile(this); },
        'quote(String)': function (text) { return '\\Q' + text + '\\E'; },
        'split(CharSequence)': function (input) { return splitWith(this, rt().str(input), 0); },
        'split(CharSequence,int)': function (input, limit) { return splitWith(this, rt().str(input), limit); }
    };

    function splitWith(patternObject, text, limit) {
        compile(patternObject);
        return rt().arrayOf('[Ljava.lang.String;', Java.split(text, compile(patternObject).source, limit));
    }

    Java.natives['java.util.regex.Matcher'] = {
        'matches()': function () { return search(this, 0, 'whole'); },
        'lookingAt()': function () { return search(this, 0, 'start'); },
        'find()': function () {
            var from = this.$position || 0;
            if (from > this.text.length) {
                this.$match = null;
                return false;
            }
            return search(this, from);
        },
        'find(int)': function (start) {
            if (start < 0 || start > this.text.length)
                throw rt().exception('java.lang.IndexOutOfBoundsException', 'Illegal start index');
            return search(this, start);
        },
        'group()': function () { return current(this)[0]; },
        'group(int)': function (group) {
            checkGroup(this, group);
            var value = current(this)[group];
            return value === undefined ? null : value;
        },
        'group(String)': function (name) {
            var value = current(this)[groupIndex(this, name)];
            return value === undefined ? null : value;
        },
        'groupCount()': function () {
            compile(this.pattern);
            return this.pattern.$groups.count;
        },
        'start()': function () { return current(this).index; },
        'start(int)': function (group) {
            checkGroup(this, group);
            return groupStart(current(this), group);
        },
        'start(String)': function (name) { return groupStart(current(this), groupIndex(this, name)); },
        'end()': function () {
            var match = current(this);
            return match.index + match[0].length;
        },
        'end(int)': function (group) {
            checkGroup(this, group);
            var match = current(this);
            return match[group] === undefined ? -1 : groupStart(match, group) + match[group].length;
        },
        'end(String)': function (name) {
            var match = current(this);
            var group = groupIndex(this, name);
            return match[group] === undefined ? -1 : groupStart(match, group) + match[group].length;
        },
        'hitEnd()': function () { return this.$match === null || (this.$position || 0) >= this.text.length; },
        'reset()': function () {
            this.$match = null;
            this.$position = 0;
            this.$append = 0;
            return this;
        },
        'replaceAll(String)': function (text) {
            this.$match = null;
            this.$position = 0;
            return this.text.replace(compile(this.pattern), replacement(this, text));
        },
        'replaceFirst(String)': function (text) {
            var regex = compile(this.pattern);
            var single = new RegExp(regex.source, (regex.ignoreCase ? 'i' : '') + (regex.multiline ? 'm' : ''));
            return this.text.replace(single, replacement(this, text));
        },
        'appendReplacement(StringBuilder,String)': function (sb, text) {
            var match = current(this);
            var from = this.$append || 0;
            sb.$s += this.text.substring(from, match.index) + expand(this, text);
            this.$append = match.index + match[0].length;
            return this;
        },
        'appendTail(StringBuilder)': function (sb) {
            sb.$s += this.text.substring(this.$append || 0);
            return sb;
        },
        'toMatchResult()': function () {
            var match = current(this);
            var count = this.pattern.$groups.count;
            var groups = [], starts = [];
            for (var group = 0; group <= count; ++group) {
                groups.push(match[group] === undefined ? null : match[group]);
                starts.push(groupStart(match, group));
            }
            var Snapshot = rt().byName('java.util.regex.MatchSnapshot');
            var snapshot = new Snapshot();
            snapshot.groups = rt().arrayOf('[Ljava.lang.String;', groups);
            snapshot.starts = rt().arrayOf('[I', starts);
            return snapshot;
        },
        'quoteReplacement(String)': function (text) { return text.replace(/[\\$]/g, '\\$&'); },
        'lastMatchText()': function () { return this.$match ? this.$match[0] : ''; }
    };
})(globalThis);
