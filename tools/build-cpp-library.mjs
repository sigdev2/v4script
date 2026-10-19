// The index of the C++ library: js/translator/cpp/library-*.js hold the
// library as C++ source (one String.raw text per header) and before it a
// table of its top-level declarations - the namespace, the first and the
// last line, the names they declare. A session parses a declaration when
// one of its names is first looked up (docs/internals/cpp.md); this script
// writes the tables. Run it after changing the C++ text of the library:
//
//   node tools/build-cpp-library.mjs           rewrite the tables
//   node tools/build-cpp-library.mjs --check   only report stale tables (exit code 1)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIRECTORY = path.join(ROOT, 'js', 'translator', 'cpp');
const HEADER = /( *)X\.addHeader\('([^']+)', \[[\s\S]*?\], String\.raw`([\s\S]*?)`\);/g;
const PUNCTUATORS = ['->*', '<<=', '>>=', '...', '::', '->', '.*', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||', '++',
    '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^='];

// Tokens with their lines: identifiers, numbers, strings, punctuators and
// whole preprocessor lines.
function lex(text) {
    const tokens = [];
    let line = 1;
    let index = 0;
    let lineStart = true;
    while (index < text.length) {
        const char = text[index];
        if (char === '\n') {
            ++line;
            ++index;
            lineStart = true;
            continue;
        }
        if (char === ' ' || char === '\t' || char === '\r') {
            ++index;
            continue;
        }
        if (text.startsWith('//', index)) {
            while (index < text.length && text[index] !== '\n')
                ++index;
            continue;
        }
        if (text.startsWith('/*', index)) {
            const end = text.indexOf('*/', index + 2);
            for (let at = index; at < end; ++at) {
                if (text[at] === '\n')
                    ++line;
            }
            index = end + 2;
            continue;
        }
        if (char === '#' && lineStart) {
            const end = text.indexOf('\n', index);
            tokens.push({ type: 'directive', value: text.substring(index, end < 0 ? text.length : end), line });
            index = end < 0 ? text.length : end;
            continue;
        }
        lineStart = false;
        if (char === '"' || char === '\'') {
            let at = index + 1;
            while (text[at] !== char) {
                if (text[at] === '\\')
                    ++at;
                ++at;
            }
            tokens.push({ type: 'string', value: text.substring(index, at + 1), line });
            index = at + 1;
            continue;
        }
        const word = /^[A-Za-z_][A-Za-z_0-9]*|^[0-9][A-Za-z_0-9.']*/.exec(text.substring(index, index + 64));
        if (word) {
            tokens.push({ type: /[0-9]/.test(char) ? 'number' : 'ident', value: word[0], line });
            index += word[0].length;
            continue;
        }
        const punctuator = PUNCTUATORS.find((item) => text.startsWith(item, index)) || char;
        tokens.push({ type: 'op', value: punctuator, line });
        index += punctuator.length;
    }
    return tokens;
}

// The index after the '>' that closes the '<' at start.
function skipAngles(tokens, start) {
    let depth = 0;
    let parens = 0;
    for (let at = start; at < tokens.length; ++at) {
        const value = tokens[at].value;
        if (value === '(')
            ++parens;
        else if (value === ')')
            --parens;
        else if (parens === 0 && value === '<')
            ++depth;
        else if (parens === 0 && (value === '>' || value === '>>')) {
            depth -= value.length;
            if (depth <= 0)
                return at + 1;
        }
    }
    throw new Error('unbalanced template header at line ' + tokens[start].line);
}

// The names a declaration makes visible in its namespace; null - parse it
// at once (a using-directive, a static assertion).
function declaredNames(tokens) {
    let at = 0;
    while (tokens[at].value === 'template')
        at = skipAngles(tokens, at + 1);
    const first = tokens[at];
    const last = tokens.length - 1;
    if (first.value === 'static_assert')
        return null;
    if (first.value === 'using') {
        if (tokens[at + 1].value === 'namespace')
            return null;
        if (tokens[at + 2] && tokens[at + 2].value === '=')
            return [tokens[at + 1].value];
        return [tokens[last - 1].value];
    }
    if (first.value === 'typedef') {
        const pointer = tokens.findIndex((token, index) => token.value === '(' && tokens[index + 1].value === '*');
        return [pointer >= 0 ? tokens[pointer + 2].value : tokens[last - 1].value];
    }
    if (first.value === 'class' || first.value === 'struct' || first.value === 'union')
        return [tokens[at + 1].value];
    if (first.value === 'enum') {
        let name = at + 1;
        const scoped = tokens[name].value === 'class' || tokens[name].value === 'struct';
        if (scoped)
            ++name;
        const names = [tokens[name].value];
        if (!scoped) {
            // The enumerators of an unscoped enumeration are in the namespace too.
            const open = tokens.findIndex((token) => token.value === '{');
            for (let index = open + 1; index < tokens.length; ++index) {
                if (tokens[index].type === 'ident' && (tokens[index - 1].value === '{' || tokens[index - 1].value === ','))
                    names.push(tokens[index].value);
            }
        }
        return names;
    }
    // A function or a variable: the name before the first '(', '=', ';' or
    // '{' outside template arguments; A::f( is a member of the class A.
    for (let index = at; index < tokens.length; ++index) {
        const token = tokens[index];
        if (token.value === 'decltype' || token.value === 'noexcept' || token.value === 'alignas') {
            // decltype(auto) f(...): the parentheses belong to the type.
            if (tokens[index + 1].value === '(')
                index = skipParentheses(tokens, index + 1);
            continue;
        }
        if (token.value === 'operator') {
            let name = 'operator';
            let next = index + 1;
            if (tokens[next].value === '(' || tokens[next].value === '[') {
                name += tokens[next].value + tokens[next + 1].value;
                next += 2;
            } else if (tokens[next].type === 'string') {
                name += tokens[next].value + tokens[next + 1].value;
                next += 2;
            } else if (tokens[next].type === 'ident') {
                name = null;
            } else {
                while (tokens[next].value !== '(') {
                    name += tokens[next].value;
                    ++next;
                }
            }
            return [qualifierOf(tokens, index) || name];
        }
        if (token.value === '<' && index > at && tokens[index - 1].type === 'ident') {
            index = skipAngles(tokens, index) - 1;
            continue;
        }
        if (['(', '=', ';', '{', '['].includes(token.value)) {
            if (tokens[index - 1].type !== 'ident')
                throw new Error('no name before line ' + token.line);
            return [qualifierOf(tokens, index - 1) || tokens[index - 1].value];
        }
    }
    throw new Error('no declaration at line ' + first.line);
}

// The index of the ')' that closes the '(' at start.
function skipParentheses(tokens, start) {
    let depth = 0;
    for (let at = start; at < tokens.length; ++at) {
        if (tokens[at].value === '(')
            ++depth;
        else if (tokens[at].value === ')' && --depth === 0)
            return at;
    }
    throw new Error('unbalanced parentheses at line ' + tokens[start].line);
}

// The class of a qualified name A::f or A<T>::f that ends at index.
function qualifierOf(tokens, index) {
    let qualifier = null;
    let at = index;
    while (at >= 2 && tokens[at - 1].value === '::' && tokens[at - 2].type === 'ident') {
        qualifier = tokens[at - 2].value;
        at -= 2;
    }
    return qualifier;
}

// The declarations of a header: [namespace, first line, last line, names].
function index(text) {
    const tokens = lex(text);
    const entries = [];
    let position = 0;
    function add(path, start, end, names) {
        const entry = [path, tokens[start].line, tokens[end].line, names === null ? '' : names.join(' ')];
        const previous = entries[entries.length - 1];
        // Declarations that share a line are one entry.
        if (previous && previous[2] === entry[1]) {
            previous[2] = entry[2];
            previous[3] = previous[3] === '' || entry[3] === '' ? '' : previous[3] + ' ' + entry[3];
            return;
        }
        entries.push(entry);
    }
    function scope(path) {
        while (position < tokens.length) {
            const token = tokens[position];
            if (token.value === '}')
                return;
            if (token.type === 'directive') {
                add(path, position, position, null);
                ++position;
                continue;
            }
            const inline = token.value === 'inline' && tokens[position + 1].value === 'namespace';
            if (token.value === 'namespace' || inline) {
                const name = tokens[position + (inline ? 2 : 1)].value;
                position += inline ? 4 : 3;
                scope((path === '' ? '' : path + '::') + (inline ? '+' : '') + name);
                ++position;
                continue;
            }
            const start = position;
            let depth = 0;
            const block = token.value === 'extern' && tokens[position + 1].type === 'string';
            for (;;) {
                const value = tokens[position].value;
                if (value === '(' || value === '{' || value === '[')
                    ++depth;
                else if (value === ')' || value === '}' || value === ']') {
                    --depth;
                    if (depth === 0 && value === '}') {
                        if (tokens[position + 1] && tokens[position + 1].value === ';')
                            ++position;
                        break;
                    }
                } else if (value === ';' && depth === 0) {
                    break;
                }
                ++position;
            }
            add(path, start, position, block ? null : declaredNames(tokens.slice(start, position + 1)));
            ++position;
        }
    }
    scope('');
    return entries;
}

function quote(text) {
    return '\'' + text.replace(/\\/g, '\\\\').replace(/'/g, '\\\'') + '\'';
}

// The table as JavaScript: one entry per line.
function table(entries, indent) {
    const lines = entries.map((entry) => indent + '    [' + quote(entry[0]) + ', ' + entry[1] + ', ' + entry[2] + ', ' +
        quote(entry[3]) + ']');
    return '[\n' + lines.join(',\n') + '\n' + indent + ']';
}

const check = process.argv.includes('--check');
let stale = 0;
for (const file of fs.readdirSync(DIRECTORY).filter((name) => /^library-.*\.js$/.test(name)).sort()) {
    const full = path.join(DIRECTORY, file);
    const source = fs.readFileSync(full, 'utf8');
    const result = source.replace(HEADER, (match, indent, name, text) => {
        if (text.includes('${') || text.includes('`'))
            throw new Error(file + ': ' + name + ': the text cannot hold ` or ${');
        text.split('\n').forEach((line, number) => {
            if (line.length > 120)
                throw new Error(file + ': ' + name + ': line ' + (number + 1) + ' is longer than 120 characters');
        });
        return indent + 'X.addHeader(' + quote(name) + ', ' + table(index(text), indent) + ', String.raw`' + text +
            '`);';
    });
    if (result !== source) {
        ++stale;
        if (check)
            console.log('stale: ' + file);
        else
            fs.writeFileSync(full, result);
    }
}
if (check && stale > 0)
    process.exit(1);
console.log(check ? 'the tables are current' : stale + ' file(s) written');
