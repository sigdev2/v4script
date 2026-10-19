// Syntax highlighting of the editor, in the manner of Colorer: a language is
// a list of rules - a regular expression and the class of what it finds -
// and lists of words. At every position the leftmost match wins, then the
// first rule. A rule may also require the text before the match to end in
// a pattern: a regular expression literal of JavaScript or Perl follows an
// operator, not a value. The editor draws highlight() under its text area;
// see docs/playground.md.
//
// Classes: comment, string, number, constant, keyword, type, builtin,
// meta (preprocessor lines, directives, annotations), variable. A rule of
// the class 'word' finds names: the word lists give them a class, or the
// classify() function of the language, or they stay plain.

// A rule must not match an empty string; [\s\S] is any character, and
// (?![\s\S]) is the end of the text ($ is the end of a line in the rules).
const BLOCK_COMMENT = /\/\*[\s\S]*?(?:\*\/|(?![\s\S]))/;
const LINE_COMMENT = /\/\/.*/;
const HASH_COMMENT = /#.*/;
const DOUBLE_QUOTED = /"(?:\\.|[^"\\\n])*"?/;
const SINGLE_QUOTED = /'(?:\\.|[^'\\\n])*'?/;
const HEXADECIMAL = /0[xX][\da-fA-F_]*(?:\.[\da-fA-F_]*)?(?:[pP][+-]?\d+)?\w*/;
const NUMBER = /(?:0[bBoO][\d_]+|(?:\d[\d_]*(?:\.(?!\.)[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?)\w*/;
const IDENTIFIER = /[A-Za-z_\u00c0-\uffff][\w\u00c0-\uffff]*/;

// A regular expression literal, not a division, follows these.
const JAVASCRIPT_BEFORE_REGEX =
    /(?:^|[=(,:;!&|?{}[+\-*%<>~^]|\b(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await))\s*$/;
const PERL_BEFORE_REGEX = /(?:^|[=(,;!{}~&|?:]|\b(?:split|grep|map|join|if|unless|while|until|and|or|not|return))\s*$/;

const C_RULES = [
    [/^[ \t]*#[ \t]*\w*/, 'meta'],
    [/<[^<>\n]*>/, 'string', /#[ \t]*include[ \t]*$/],
    [LINE_COMMENT, 'comment'],
    [BLOCK_COMMENT, 'comment'],
    [/(?:u8|[uUL])?"(?:\\.|[^"\\\n])*"?/, 'string'],
    [/[uUL]?'(?:\\.|[^'\\\n])*'?/, 'string'],
];
const C_KEYWORDS = 'auto break case const continue default do else enum extern for goto if inline register ' +
    'restrict return sizeof static struct switch typedef union volatile while _Alignas _Alignof _Atomic _Generic ' +
    '_Noreturn _Static_assert _Thread_local alignas alignof static_assert thread_local';
const C_TYPES = 'char short int long float double signed unsigned void _Bool _Complex bool size_t ptrdiff_t ' +
    'intptr_t uintptr_t int8_t int16_t int32_t int64_t uint8_t uint16_t uint32_t uint64_t wchar_t FILE va_list ' +
    'time_t clock_t';

const SYNTAXES = {
    python: {
        rules: [
            [HASH_COMMENT, 'comment'],
            [/[rRbBuUfF]{0,2}'''[\s\S]*?(?:'''|(?![\s\S]))/, 'string'],
            [/[rRbBuUfF]{0,2}"""[\s\S]*?(?:"""|(?![\s\S]))/, 'string'],
            [/[rRbBuUfF]{0,2}(?:'(?:\\.|[^'\\\n])*'?|"(?:\\.|[^"\\\n])*"?)/, 'string'],
            [/^[ \t]*@[\w.]+/, 'meta'],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [IDENTIFIER, 'word'],
        ],
        words: {
            keyword: 'and as assert async await break class continue def del elif else except finally for from ' +
                'global if import in is lambda nonlocal not or pass raise return try while with yield',
            constant: 'True False None NotImplemented Ellipsis __name__',
            builtin: 'abs all any bin bool bytearray bytes callable chr classmethod complex dict dir divmod ' +
                'enumerate eval exec filter float format frozenset getattr globals hasattr hash hex id input int ' +
                'isinstance issubclass iter len list locals map max min next object oct open ord pow print ' +
                'property range repr reversed round set setattr slice sorted staticmethod str sum super tuple ' +
                'type vars zip',
            type: 'BaseException Exception ArithmeticError AssertionError AttributeError EOFError ImportError ' +
                'IndexError KeyError NameError NotImplementedError OSError OverflowError RuntimeError ' +
                'StopIteration SyntaxError TypeError ValueError ZeroDivisionError',
        },
    },
    lua: {
        rules: [
            [/--\[(=*)\[[\s\S]*?(?:\]\1\]|(?![\s\S]))/, 'comment'],
            [/--.*/, 'comment'],
            [/\[(=*)\[[\s\S]*?(?:\]\1\]|(?![\s\S]))/, 'string'],
            [DOUBLE_QUOTED, 'string'],
            [SINGLE_QUOTED, 'string'],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [IDENTIFIER, 'word'],
        ],
        words: {
            keyword: 'and break do else elseif end for function goto if in local not or repeat return then until ' +
                'while',
            constant: 'true false nil',
            builtin: 'assert collectgarbage dofile error getmetatable ipairs load loadfile next pairs pcall print ' +
                'rawequal rawget rawlen rawset require select setmetatable tonumber tostring type xpcall _G _ENV ' +
                'coroutine debug io math os package string table utf8',
        },
    },
    prolog: {
        rules: [
            [/%.*/, 'comment'],
            [BLOCK_COMMENT, 'comment'],
            [/^(?::-|\?-)/, 'meta'],
            [/0'(?:\\.|''|.)/, 'number'],
            [/0x[\da-fA-F]+|0o[0-7]+|0b[01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/, 'number'],
            [/'(?:\\.|''|[^'\\\n])*'?/, 'string'],
            [/"(?:\\.|""|[^"\\\n])*"?/, 'string'],
            [/`(?:\\.|``|[^`\\\n])*`?/, 'string'],
            [/[A-Za-z_]\w*/, 'word'],
        ],
        words: {
            keyword: 'is mod rem div xor',
            constant: 'true fail false',
            builtin: 'abolish append arg asserta assertz assert atom atom_chars atom_codes atom_concat atom_length ' +
                'atom_number atomic bagof between call catch char_code copy_term findall forall format functor halt ' +
                'is_list last length member msort nl nonvar nth0 nth1 number number_codes once print read ' +
                'read_term retract reverse setof sort sub_atom succ sum_list throw var write write_canonical writeln ' +
                'writeq',
        },
        classify: (word) => /^[A-Z_]/.test(word) ? 'variable' : null,
    },
    perl: {
        rules: [
            [/^=[A-Za-z]\w*[\s\S]*?(?:^=cut\b.*|(?![\s\S]))/, 'comment'],
            [/^__(?:END|DATA)__\b[\s\S]*/, 'comment'],
            [/<<~?(["']?)([A-Za-z_]\w*)\1.*\n[\s\S]*?(?:^[ \t]*\2$|(?![\s\S]))/, 'string'],
            [/\$#?\$*(?:::)?[A-Za-z_]\w*(?:::\w+)*|\$\d+|\$[^\s\w{]|[@%]\$*[A-Za-z_]\w*(?:::\w+)*/, 'variable'],
            [HASH_COMMENT, 'comment'],
            [/(?:s|tr|y)([^\w\s{}()[\]<>,;=])(?:\\.|(?!\1)[^\\\n])*\1(?:\\.|(?!\1)[^\\\n])*\1[a-z]*/, 'string'],
            [/(?:s|tr|y)\{(?:\\.|[^}\\\n])*\}\s*\{(?:\\.|[^}\\\n])*\}[a-z]*/, 'string'],
            [/(?:m|qr)(?:([^\w\s{}()[\]<>,;=])(?:\\.|(?!\1)[^\\\n])*\1|\{(?:\\.|[^}\\\n])*\})[a-z]*/, 'string'],
            [/q[qwx]?([^\w\s{}()[\]<>,;=])(?:\\[\s\S]|(?!\1)[^\\])*\1/, 'string'],
            [/q[qwx]?(?:\{[^}]*\}|\([^)]*\)|\[[^\]]*\]|<[^>]*>)/, 'string'],
            [/\/(?:\\.|[^/\\\n])*\/[a-z]*/, 'string', PERL_BEFORE_REGEX],
            [/'(?:\\[\s\S]|[^'\\])*'?/, 'string'],
            [/"(?:\\[\s\S]|[^"\\])*"?/, 'string'],
            [/`(?:\\[\s\S]|[^`\\])*`?/, 'string'],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [/[A-Za-z_]\w*(?:::\w+)*/, 'word'],
        ],
        words: {
            keyword: 'my our local sub if elsif else unless while until for foreach do last next redo return ' +
                'package use no require BEGIN END and or not xor eq ne lt gt le ge cmp x defined undef eval goto',
            constant: '__PACKAGE__ __FILE__ __LINE__ STDIN STDOUT STDERR',
            builtin: 'abs atan2 binmode bless chdir chomp chop chr close cos delete die each exists exit exp ' +
                'grep hex index int join keys lc lcfirst length localtime log map oct open ord pop print printf ' +
                'push rand ref reverse rindex say scalar shift sin sleep sort splice split sprintf sqrt srand ' +
                'substr time uc ucfirst unshift values wantarray warn',
        },
    },
    php: {
        ignoreCase: true,
        rules: [
            [/<\?(?:php|=)?|\?>/, 'meta'],
            [LINE_COMMENT, 'comment'],
            [HASH_COMMENT, 'comment'],
            [BLOCK_COMMENT, 'comment'],
            [/<<<[ \t]*(["']?)([A-Za-z_]\w*)\1\n[\s\S]*?(?:^[ \t]*\2\b|(?![\s\S]))/, 'string'],
            [/'(?:\\[\s\S]|[^'\\])*'?/, 'string'],
            [/"(?:\\[\s\S]|[^"\\])*"?/, 'string'],
            [/\$+[A-Za-z_\u0080-\uffff][\w\u0080-\uffff]*/, 'variable'],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [IDENTIFIER, 'word'],
        ],
        words: {
            keyword: 'abstract and array as break callable case catch class clone const continue declare default ' +
                'do echo else elseif empty enddeclare endfor endforeach endif endswitch endwhile enum extends final ' +
                'finally fn for foreach function global goto if implements include include_once instanceof ' +
                'insteadof interface isset list match namespace new or print private protected public readonly ' +
                'require require_once return static switch throw trait try unset use var while xor yield',
            type: 'int float bool string void mixed object iterable never self parent',
            constant: 'true false null __CLASS__ __DIR__ __FILE__ __FUNCTION__ __LINE__ __METHOD__ __NAMESPACE__ ' +
                'PHP_EOL PHP_INT_MAX PHP_INT_MIN',
        },
    },
    go: {
        rules: [
            [LINE_COMMENT, 'comment'],
            [BLOCK_COMMENT, 'comment'],
            [/`[^`]*`?/, 'string'],
            [DOUBLE_QUOTED, 'string'],
            [SINGLE_QUOTED, 'string'],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [IDENTIFIER, 'word'],
        ],
        words: {
            keyword: 'break case chan const continue default defer else fallthrough for func go goto if import ' +
                'interface map package range return select struct switch type var',
            type: 'any bool byte comparable complex64 complex128 error float32 float64 int int8 int16 int32 int64 ' +
                'rune string uint uint8 uint16 uint32 uint64 uintptr',
            constant: 'true false iota nil',
            builtin: 'append cap clear close complex copy delete imag len make max min new panic print println ' +
                'real recover',
        },
    },
    c: {
        rules: [...C_RULES, [HEXADECIMAL, 'number'], [NUMBER, 'number'], [IDENTIFIER, 'word']],
        words: { keyword: C_KEYWORDS, type: C_TYPES, constant: 'NULL true false' },
    },
    cpp: {
        rules: [
            [/(?:u8|[uUL])?R"([^()\\\s]{0,16})\([\s\S]*?(?:\)\1"|(?![\s\S]))/, 'string'],
            ...C_RULES,
            [/0[xX][\da-fA-F']*(?:\.[\da-fA-F']*)?(?:[pP][+-]?\d+)?\w*/, 'number'],
            [/(?:0[bB][01']+|(?:\d[\d']*(?:\.(?!\.)[\d']*)?|\.\d[\d']*)(?:[eE][+-]?\d+)?)\w*/, 'number'],
            [IDENTIFIER, 'word'],
        ],
        words: {
            keyword: C_KEYWORDS + ' and asm catch class concept const_cast consteval constexpr constinit ' +
                'co_await co_return co_yield decltype delete dynamic_cast explicit export final friend mutable ' +
                'namespace new noexcept not operator or override private protected public reinterpret_cast ' +
                'requires static_cast template this throw try typeid typename using virtual',
            type: C_TYPES + ' char8_t char16_t char32_t',
            constant: 'NULL nullptr true false',
        },
    },
    java: {
        rules: [
            [/"""[\s\S]*?(?:"""|(?![\s\S]))/, 'string'],
            [LINE_COMMENT, 'comment'],
            [BLOCK_COMMENT, 'comment'],
            [DOUBLE_QUOTED, 'string'],
            [SINGLE_QUOTED, 'string'],
            [/@[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*/, 'meta'],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [IDENTIFIER, 'word'],
        ],
        words: {
            keyword: 'abstract assert break case catch class const continue default do else enum extends final ' +
                'finally for goto if implements import instanceof interface native new package permits private ' +
                'protected public record return sealed static strictfp super switch synchronized this throw ' +
                'throws transient try var volatile when while yield',
            type: 'boolean byte char double float int long short void',
            constant: 'true false null',
        },
    },
    forth: {
        ignoreCase: true,
        rules: [
            [/\\(?!\S).*/, 'comment'],
            [/\((?!\S)[^)]*\)?/, 'comment'],
            [/\.\((?!\S)[^)]*\)?/, 'string'],
            [/(?:\.|s|c|abort)"(?!\S)[^"\n]*"?/, 'string'],
            [/s\\"(?!\S)(?:\\.|[^"\\\n])*"?/, 'string'],
            [/\S+/, 'word'],
        ],
        words: {
            keyword: ': ; :noname if else then do ?do loop +loop leave unloop begin until while repeat again case ' +
                'of endof endcase exit recurse variable 2variable fvariable constant 2constant fconstant value ' +
                '2value to create does> immediate postpone literal [ ] [\'] \' [char] char defer is action-of ' +
                'marker include included require required buffer: field: +field begin-structure end-structure ' +
                '[if] [else] [then] [defined] [undefined]',
            constant: 'true false',
            builtin: 'dup drop swap over rot -rot nip tuck pick roll ?dup 2dup 2drop 2swap 2over >r r> r@ . .s .r ' +
                'u. u.r ? @ ! +! c@ c! 2@ 2! , c, emit cr type space spaces key accept allot cells cell+ chars here ' +
                'mod /mod */ */mod abs negate min max and or invert lshift rshift bl count move fill erase evaluate ' +
                'execute base decimal hex i j ms bye f. f@ f! s>f f>s + - * / = <> < > u< 0= 0< 0> 0<> 1+ 1- 2* 2/',
        },
        classify: (word) => /^(?:[#&]?-?\d+\.?|\$-?[\da-f]+\.?|%-?[01]+\.?|-?\d+(?:\.\d*)?e[-+]?\d*|'.')$/i.test(word)
            ? 'number' : null,
    },
    basic: {
        ignoreCase: true,
        rules: [
            [/(?:'|\bREM\b)[ \t]*\$[A-Za-z]+.*/, 'meta'],
            [/'.*|\bREM\b.*/, 'comment'],
            [/^[ \t]*\$[A-Za-z]\w*.*/, 'meta'],
            [/"[^"\n]*"?/, 'string'],
            [/&H[\da-f]+&?|&O[0-7]+&?|&B[01]+&?|(?:\d+\.?\d*|\.\d+)(?:[ed][+-]?\d+)?[%&!#]?/, 'number'],
            [/[A-Za-z_][\w.]*[$%&!#]?/, 'word'],
        ],
        words: {
            keyword: 'access alias and any append as base beep binary bload bsave byval call case chain chdir ' +
                'circle clear close cls color common const data declare def defdbl defint deflng defsng defstr ' +
                'dim do draw else elseif end erase error exit field for function get gosub goto if input is key ' +
                'kill let line locate lock loop lprint lset mod name next not off on open option or out output ' +
                'paint palette pcopy poke preset print pset put random randomize read redim reset restore resume ' +
                'return rset run screen seek select shared shell sleep sound static step stop sub swap system then ' +
                'to type unlock until using view wait wend while width window write xor eqv imp _limit _display ' +
                '_delay _title _fullscreen',
            type: 'integer long single double string _integer64 _unsigned _byte _bit _float _offset',
            builtin: 'abs asc atn cdbl chr$ cint clng command$ cos csng csrlin cvd cvi cvl cvs date$ environ$ eof ' +
                'erl err exp fix fre freefile hex$ inkey$ inp input$ instr int lbound lcase$ left$ len loc lof log ' +
                'lpos ltrim$ mid$ mkd$ mki$ mkl$ mks$ oct$ peek play point pos right$ rnd rtrim$ sgn sin space$ ' +
                'spc sqr str$ string$ tab tan time$ timer ubound ucase$ val varptr varseg _rgb _rgb32 _rgba ' +
                '_rgba32 _red _green _blue _alpha _width _height _newimage _dest _source _keyhit _keydown _mousex ' +
                '_mousey _mousebutton _mouseinput _pi _round _ceil _trim$ _atan2 _hypot',
        },
    },
    pascal: {
        ignoreCase: true,
        rules: [
            [/\{\$[^}]*\}?|\(\*\$[\s\S]*?(?:\*\)|(?![\s\S]))/, 'meta'],
            [/\{[^}]*\}?/, 'comment'],
            [/\(\*[\s\S]*?(?:\*\)|(?![\s\S]))/, 'comment'],
            [LINE_COMMENT, 'comment'],
            [/'(?:''|[^'\n])*'?|#(?:\d+|\$[\da-f]+)/, 'string'],
            [/\$[\da-f]+|%[01]+|&[0-7]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?/, 'number'],
            [/&?[A-Za-z_]\w*/, 'word'],
        ],
        words: {
            keyword: 'absolute abstract and array as asm begin case class const constructor destructor div do ' +
                'downto else end except exports external file finalization finally for forward function generic ' +
                'goto if implementation in inherited initialization inline interface is label library mod not ' +
                'object of on operator or out overload override packed private procedure program property ' +
                'protected public published raise record reintroduce repeat resourcestring self set shl shr ' +
                'specialize strict then threadvar to try type unit until uses var virtual while with xor',
            type: 'ansichar ansistring boolean byte cardinal char comp currency double exception extended int64 ' +
                'integer longint longword pchar pointer qword real shortint shortstring single smallint string ' +
                'text tobject tclass uint64 unicodestring variant widechar widestring word',
            constant: 'true false nil maxint',
            builtin: 'abs arctan assign assigned break chr close concat continue copy cos dec delete dispose eof ' +
                'eoln exclude exit exp fillchar frac halt high inc include insert int length ln low move new odd ' +
                'ord paramcount paramstr pos pred random randomize read readln reset rewrite round setlength sin ' +
                'sizeof sqr sqrt str succ trunc upcase val write writeln',
        },
    },
    wat: {
        rules: [
            [/;;.*/, 'comment'],
            [/\(;[\s\S]*?(?:;\)|(?![\s\S]))/, 'comment'],
            [DOUBLE_QUOTED, 'string'],
            [/\$[\w!#$%&'*+\-./:<=>?@\\^`|~]+/, 'variable'],
            [/[+-]?0x[\da-fA-F_]+(?:\.[\da-fA-F_]*)?(?:[pP][+-]?[\d_]+)?/, 'number'],
            [/[+-]?\d[\d_]*(?:\.[\d_]*)?(?:[eE][+-]?[\d_]+)?/, 'number'],
            [/[a-z][\w!#$%&'*+\-./:<=>?@\\^`|~]*/, 'word'],
        ],
        words: {
            keyword: 'module func param result local global memory table elem data type import export start mut ' +
                'offset declare item block loop if then else end br br_if br_table return call call_indirect ' +
                'unreachable nop drop select',
            type: 'i32 i64 f32 f64 v128 funcref externref anyref',
            meta: 'assert_return assert_trap assert_exhaustion assert_invalid assert_malformed assert_unlinkable ' +
                'assert_exception invoke register binary quote',
        },
        classify: (word) => /^(?:offset|align)=/.test(word) ? 'keyword'
            : /^(?:inf|nan(?::.*)?)$/.test(word) ? 'number' : word.includes('.') ? 'builtin' : null,
    },
    scheme: {
        rules: [
            [/;.*/, 'comment'],
            [/#\|[\s\S]*?(?:\|#|(?![\s\S]))/, 'comment'],
            [/#;/, 'comment'],
            [/"(?:\\[\s\S]|[^"\\])*"?/, 'string'],
            [/#\\(?:x[\da-fA-F]+|[A-Za-z]+|[\s\S])/, 'string'],
            [/#(?:true|false|t|f)(?![^\s()[\]";])/, 'constant'],
            [/(?:#[xXbBoOdDeEiI])+[+-]?[\da-fA-F]+(?:[/.][\da-fA-F]*)?|[+-](?:inf|nan)\.0/, 'number'],
            [/[+-]?(?:\d+(?:\/\d+|\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?(?![^\s()[\]";])/, 'number'],
            [/[^\s()[\]{}";'`,|#][^\s()[\]{}";'`,|]*/, 'word'],
        ],
        words: {
            keyword: 'define define-values define-record-type define-syntax define-library lambda case-lambda let ' +
                'let* letrec letrec* let-values let*-values let-syntax letrec-syntax named-lambda if cond case and ' +
                'or when unless do begin set! quote quasiquote unquote unquote-splicing syntax-rules delay ' +
                'delay-force make-promise parameterize guard import export include cond-expand else =>',
            builtin: 'append apply assoc assq assv call-with-current-continuation call/cc call-with-values car ' +
                'cdr cons display dynamic-wind eq? equal? eqv? error for-each length list list->string list-ref ' +
                'map member memq newline not null? pair? raise read-line reverse string->list string-append ' +
                'string-length substring values vector vector-ref vector-set! with-exception-handler write',
        },
    },
    javascript: {
        rules: [
            [LINE_COMMENT, 'comment'],
            [BLOCK_COMMENT, 'comment'],
            [/`(?:\\[\s\S]|[^`\\])*`?/, 'string'],
            [DOUBLE_QUOTED, 'string'],
            [SINGLE_QUOTED, 'string'],
            [/\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n[])+\/[a-z]*/, 'string', JAVASCRIPT_BEFORE_REGEX],
            [HEXADECIMAL, 'number'],
            [NUMBER, 'number'],
            [/[A-Za-z_$\u00c0-\uffff][\w$\u00c0-\uffff]*/, 'word'],
        ],
        words: {
            keyword: 'async await break case catch class const continue debugger default delete do else export ' +
                'extends finally for from function if import in instanceof let new of return static super switch ' +
                'this throw try typeof var void while with yield',
            constant: 'true false null undefined NaN Infinity',
        },
    },
};

// The leftmost match counts, so a rule never starts inside a name that an
// earlier match took whole: rules for prefixed literals (u8"", qw(), s///)
// need no word boundary.
function compile(syntax) {
    let source = '';
    let groups = 0;
    const rules = [];
    for (const [pattern, token, after] of syntax.rules) {
        const group = groups + 1;
        const inner = new RegExp(pattern.source + '|').exec('').length - 1;
        // Back references of a rule count from its own group.
        const renumbered = pattern.source.replace(/\\(\\|[1-9])/g,
            (all, escaped) => escaped === '\\' ? all : '\\' + (group + Number(escaped)));
        source += (source === '' ? '(' : '|(') + renumbered + ')';
        rules.push({ group, token, after });
        groups += 1 + inner;
    }
    const words = new Map();
    for (const [token, list] of Object.entries(syntax.words || {})) {
        for (const word of list.split(' '))
            words.set(syntax.ignoreCase ? word.toLowerCase() : word, token);
    }
    return { regex: new RegExp(source, syntax.ignoreCase ? 'gmi' : 'gm'), rules, words,
             ignoreCase: syntax.ignoreCase === true, classify: syntax.classify };
}

const compiled = new Map();

function syntaxOf(language) {
    if (!compiled.has(language))
        compiled.set(language, hasSyntax(language) ? compile(SYNTAXES[language]) : null);
    return compiled.get(language);
}

function escapeHtml(text) {
    return text.replace(/[&<>]/g, (character) => character === '&' ? '&amp;' : character === '<' ? '&lt;' : '&gt;');
}

function classOfWord(syntax, word) {
    const token = syntax.words.get(syntax.ignoreCase ? word.toLowerCase() : word);
    if (token !== undefined)
        return token;
    return syntax.classify !== undefined ? syntax.classify(word) : null;
}

export function hasSyntax(language) {
    return Object.prototype.hasOwnProperty.call(SYNTAXES, language);
}

// The text as HTML with <span class="..."> around the tokens; the text of
// a language without rules is only escaped.
export function highlight(text, language) {
    const syntax = syntaxOf(language);
    if (syntax === null)
        return escapeHtml(text);
    const regex = syntax.regex;
    const parts = [];
    let position = 0;
    regex.lastIndex = 0;
    for (let match = regex.exec(text); match !== null; match = regex.exec(text)) {
        const start = match.index;
        const token = match[0];
        const rule = syntax.rules.find((item) => match[item.group] !== undefined);
        if (token === '' || (rule.after !== undefined &&
                             !rule.after.test(text.substring(Math.max(0, start - 100), start)))) {
            regex.lastIndex = start + 1;
            continue;
        }
        const className = rule.token === 'word' ? classOfWord(syntax, token) : rule.token;
        if (className === null)
            continue;
        if (start > position)
            parts.push(escapeHtml(text.substring(position, start)));
        parts.push('<span class="', className, '">', escapeHtml(token), '</span>');
        position = start + token.length;
    }
    parts.push(escapeHtml(text.substring(position)));
    return parts.join('');
}
