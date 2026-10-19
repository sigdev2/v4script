// Builds the interpreters of other languages for the JavaScript engine of Qt 6.4 (V4).
//
// Puts into js/vendor/<language>/ one JS file per language and the license
// texts of everything that went into it. The bundles are kept in the
// repository, so an ordinary build does not need Node.js; this script is
// needed only to update them.
//
//   npm ci && node build-bundles.mjs [python] [lua] [prolog] [perl] [php]
//
// What is patched in third-party code and why: docs/internals/vendor.md.

import * as acorn from 'acorn';
import * as esbuild from 'esbuild';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const VENDOR = path.resolve(TOOLS, '../js/vendor');
const WORK = path.join(TOOLS, '.work');
const MODULES = path.join(TOOLS, 'node_modules');

// Skulpt on npm has not been updated for a long time: it is taken from the repository at a fixed commit.
const SKULPT_REPOSITORY = 'https://github.com/skulpt/skulpt.git';
const SKULPT_COMMIT = 'ae5f4628e319bd51d26fc3e920baabd3803cacd5';
const SKULPT_DEPENDENCIES = ['jsbi@3.2.5', 'strftime@0.10.3', 'setimmediate@1.0.5',
                             'fastestsmallesttextencoderdecoder@1.0.22', 'micro-strptime@0.2.3', 'terser@5.51.2'];
// Perlito5 - the prebuilt Perl compiler that runs in a browser.
const PERLITO_COMMIT = '97c296f63f395ce6a9aa3cac1baeeed076b753a3';
const PERLITO_URL = `https://raw.githubusercontent.com/fglock/Perlito/${PERLITO_COMMIT}/docs/perlito/perlito5.js`;
const PERLITO_LICENSE_URL = `https://raw.githubusercontent.com/fglock/Perlito/${PERLITO_COMMIT}/LICENSE.md`;

const COMMON = {
    absWorkingDir: TOOLS,
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2016',
    minify: true,
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
    define: { global: 'globalThis' },
};

function run(command, args, options) {
    execFileSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32', ...options });
}

function ensureDirectory(directory) {
    fs.mkdirSync(directory, { recursive: true });
}

// A license file of a package: LICENSE, license.md, MIT-LICENSE.txt, COPYING...
const LICENSE_FILE = /^([\w.]+[-_])?(licen[cs]e|copying)([-_.][\w.-]*)?$/i;

const MIT_TEXT = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

// The license section of the README of a package without a license file
// (a "# License" heading or a "License" line underlined with = or -). An MIT
// section that only names the license gets the text of the license.
function readmeLicense(directory, license) {
    const readme = fs.readdirSync(directory).find((file) => /^readme(\.\w+)?$/i.test(file));
    if (readme === undefined) {
        return null;
    }
    const lines = fs.readFileSync(path.join(directory, readme), 'utf8').replace(/\r\n/g, '\n').split('\n');
    const underline = (index) => index < lines.length && /^[=-]{3,}\s*$/.test(lines[index]);
    const isHeading = (index) => /^#+\s/.test(lines[index]) || (lines[index].trim() !== '' && underline(index + 1));
    const start = lines.findIndex((line, index) =>
        /^#+\s*(licen[cs]e|copyright)/i.test(line) || (/^(licen[cs]e|copyright)\s*$/i.test(line) && underline(index + 1)));
    if (start < 0) {
        return null;
    }
    let end = start + (underline(start + 1) ? 2 : 1);
    const first = end;
    while (end < lines.length && !isHeading(end)) {
        ++end;
    }
    let text = lines.slice(first, end).join('\n').trim();
    if (text.length === 0) {
        return null;
    }
    if (license === 'MIT' && !text.includes('Permission is hereby granted')) {
        text += '\n\n' + MIT_TEXT;
    }
    return text;
}

// The licenses of the packages that went into a bundle - by its metafile.
function collectLicenses(metafile) {
    const packages = new Map();
    for (const input of Object.keys(metafile.inputs)) {
        const match = /^(.*?node_modules\/((?:@[^/]+\/)?[^/]+))\//.exec(input.replace(/\\/g, '/'));
        // "(disabled):" - a module that the browser field of the package disables, not in the bundle.
        if (match !== null && !input.startsWith("(disabled)") && !packages.has(match[2])) {
            packages.set(match[2], path.resolve(TOOLS, match[1]));
        }
    }
    const texts = [];
    for (const [name, directory] of [...packages.entries()].sort()) {
        const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
        const licenseFile = fs.readdirSync(directory).find((file) => LICENSE_FILE.test(file));
        const text = licenseFile ? fs.readFileSync(path.join(directory, licenseFile), 'utf8').trim()
                                 : readmeLicense(directory, manifest.license) ?? `License: ${manifest.license}`;
        texts.push(`=== ${name} ${manifest.version} (${manifest.license}) ===\n\n${text}\n`);
    }
    return texts.join('\n');
}

async function bundle(language, entryContents, extra) {
    const directory = path.join(VENDOR, language);
    ensureDirectory(directory);
    const result = await esbuild.build({
        ...COMMON,
        ...extra,
        stdin: { contents: entryContents, resolveDir: TOOLS, loader: 'js' },
        write: false,
    });
    return { code: result.outputFiles[0].text, metafile: result.metafile, directory };
}

// The JavaScript bundle goes through the expression depth check (see below).
function save(directory, fileName, text) {
    if (fileName.endsWith('.js')) {
        text = flattenDeepExpressions(text, fileName);
    }
    fs.writeFileSync(path.join(directory, fileName), text.replace(/\r\n/g, '\n'));
    console.log(`  ${path.relative(TOOLS, path.join(directory, fileName))}: ${(Buffer.byteLength(text) / 1024).toFixed(0)} KB`);
}

async function download(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }
    return response.text();
}

// --- Python: Skulpt

async function buildPython() {
    const source = path.join(WORK, 'skulpt');
    if (!fs.existsSync(path.join(source, '.git'))) {
        ensureDirectory(source);
        run('git', ['init', '-q'], { cwd: source });
        run('git', ['remote', 'add', 'origin', SKULPT_REPOSITORY], { cwd: source });
    }
    run('git', ['fetch', '-q', '--depth', '1', 'origin', SKULPT_COMMIT], { cwd: source });
    run('git', ['checkout', '-q', '-f', SKULPT_COMMIT], { cwd: source });
    run('npm', ['install', '-q', '--ignore-scripts', '--no-save', '--no-package-lock', ...SKULPT_DEPENDENCIES],
        { cwd: source });

    // V4 returns "[native code]" from Function.prototype.toString for any
    // function, and Skulpt would take every JavaScript function for a constructor.
    patch(path.join(source, 'src/ffi.js'), `    } else if (match[0] === "class") {
        return true;
    } else {`, `    } else if (match[0] === "class") {
        return true;
    } else if (!/^[A-Z]/.test(obj.name || "")) {
        return null;
    } else {`);
    // The u flag breaks searching not from the start of a string in V4, and there is no s flag at all.
    patch(path.join(source, 'src/lib/re.js'), 'if (!RegExp.prototype.hasOwnProperty("sticky")) {',
          'if (true) {');
    patch(path.join(source, 'src/lib/re.js'), 'if (!RegExp.prototype.hasOwnProperty("unicode")) {',
          'if (true) {');

    const commit = SKULPT_COMMIT.slice(0, 7);
    const result = await esbuild.build({
        ...COMMON,
        entryPoints: [path.join(source, 'src/main.js')],
        alias: { assert: path.join(source, 'src/assert-prod.js') },
        define: {
            global: 'globalThis',
            GITVERSION: '"master"',
            GITHASH: `"${commit}"`,
            GITBRANCH: '"master"',
            BUILDDATE: '"pinned"',
        },
        write: false,
    });
    const directory = path.join(VENDOR, 'python');
    ensureDirectory(directory);
    save(directory, 'skulpt.js', result.outputFiles[0].text);

    // The standard library: the JavaScript modules inside it are brought
    // to ES2016 too - the engine compiles them at import.
    ensureDirectory(path.join(source, 'dist'));
    run('node', ['support/build/wrapmodules.js', 'builtin'], { cwd: source });
    const Sk = {};
    new Function('Sk', fs.readFileSync(path.join(source, 'dist/skulpt-stdlib.js'), 'utf8'))(Sk);
    const files = Sk.builtinFiles.files;
    for (const name of Object.keys(files)) {
        if (name.endsWith('.js')) {
            files[name] = esbuild.transformSync(files[name], { target: 'es2016', minify: true }).code;
        }
    }
    save(directory, 'skulpt-stdlib.js', `Sk.builtinFiles=${JSON.stringify(Sk.builtinFiles)};`);
    save(directory, 'LICENSES.txt', [
        `=== Skulpt ${commit} (MIT) ===\n\n${fs.readFileSync(path.join(source, 'LICENSE'), 'utf8').trim()}\n`,
        collectLicenses(result.metafile),
    ].join('\n'));
}

function patch(file, before, after) {
    let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (text.includes(after)) {
        return;
    }
    if (!text.includes(before)) {
        throw new Error(`${file}: the patched code has changed`);
    }
    text = text.replace(before, after);
    fs.writeFileSync(file, text);
}

// --- Lua: fengari with fengari-interop

// Values between Lua and JavaScript as host modules like them: a Lua table
// without a metatable goes to JavaScript as a copy (a sequence as an array,
// everything else as an object), a JavaScript array comes to Lua as a table
// with indices from 1, null is nil, integers are Lua integers.
const LUA_INTEROP_PATCHES = [
    [`	lua_atnativeerror,
`, `	lua_atnativeerror,
	lua_absindex,
	lua_createtable,
	lua_getmetatable,
	lua_next,
	lua_rawlen,
	lua_rawseti,
	lua_topointer,
`],
    [`const push = function(L, v) {
	switch (typeof v) {
		case "undefined":
			lua_pushnil(L);
			break;
		case "number":
			lua_pushnumber(L, v);
			break;`, `const MAX_COPY_DEPTH = 32;

const pusharray = function(L, v, depth) {
	luaL_checkstack(L, 2, null);
	lua_createtable(L, v.length, 0);
	for (let i = 0; i < v.length; i++) {
		push(L, v[i], depth + 1);
		lua_rawseti(L, -2, i + 1);
	}
};

const push = function(L, v, depth) {
	depth = depth | 0;
	if (v === null) {
		lua_pushnil(L);
		return;
	}
	if (Array.isArray(v) && depth < MAX_COPY_DEPTH) {
		pusharray(L, v, depth);
		return;
	}
	switch (typeof v) {
		case "undefined":
			lua_pushnil(L);
			break;
		case "number":
			if (Number.isInteger(v) && v >= -2147483648 && v <= 2147483647)
				lua_pushinteger(L, v);
			else
				lua_pushnumber(L, v);
			break;`],
    [`const tojs = function(L, idx) {`, `const isplaintable = function(L, idx) {
	if (lua_type(L, idx) !== LUA_TTABLE)
		return false;
	if (!lua_getmetatable(L, idx))
		return true;
	lua_pop(L, 1);
	return false;
};

const tabletojs = function(L, idx, seen, depth) {
	idx = lua_absindex(L, idx);
	const key = lua_topointer(L, idx);
	if (seen.has(key))
		return seen.get(key);
	luaL_checkstack(L, 3, null);
	const length = lua_rawlen(L, idx);
	let count = 0;
	lua_pushnil(L);
	while (lua_next(L, idx)) {
		count++;
		lua_pop(L, 1);
	}
	const value = function(i) {
		return isplaintable(L, i) && depth < MAX_COPY_DEPTH ? tabletojs(L, i, seen, depth + 1) : tojs(L, i);
	};
	let result;
	if (count === length) {
		result = new Array(length);
		seen.set(key, result);
		for (let i = 1; i <= length; i++) {
			lua_rawgeti(L, idx, i);
			result[i - 1] = value(-1);
			lua_pop(L, 1);
		}
	} else {
		result = {};
		seen.set(key, result);
		lua_pushnil(L);
		while (lua_next(L, idx)) {
			const type = lua_type(L, -2);
			if (type === LUA_TSTRING)
				result[lua_tojsstring(L, -2)] = value(-1);
			else if (type === LUA_TNUMBER)
				result[String(lua_tonumber(L, -2))] = value(-1);
			lua_pop(L, 1);
		}
	}
	return result;
};

const tojs = function(L, idx) {
	if (isplaintable(L, idx))
		return tabletojs(L, idx, new Map(), 0);`],
];

function patchPlugin(name, filter, patches) {
    return {
        name,
        setup(build) {
            build.onLoad({ filter }, (args) => {
                let text = fs.readFileSync(args.path, 'utf8').replace(/\r\n/g, '\n');
                for (const [before, after] of patches) {
                    if (!text.includes(before)) {
                        throw new Error(`${args.path}: the patched code has changed`);
                    }
                    text = text.replace(before, after);
                }
                return { contents: text, loader: 'js' };
            });
        },
    };
}

async function buildLua() {
    const { code, metafile, directory } = await bundle('lua', `
        globalThis.fengari = require('fengari');
        globalThis.fengariInterop = require('fengari-interop');
    `, {
        external: ['fs', 'tmp', 'readline-sync', 'child_process', 'os', 'path', 'crypto'],
        define: { global: 'globalThis', 'process.env.FENGARICONF': 'null' },
        plugins: [patchPlugin('lua-interop', /fengari-interop[\\/]src[\\/]js\.js$/, LUA_INTEROP_PATCHES)],
    });
    save(directory, 'fengari.js', code);
    save(directory, 'LICENSES.txt', collectLicenses(metafile));
}

// --- Prolog: Tau Prolog with modules

async function buildProlog() {
    const { code, metafile, directory } = await bundle('prolog', `
        var pl = require('tau-prolog');
        require('tau-prolog/modules/lists')(pl);
        require('tau-prolog/modules/charsio')(pl);
        require('tau-prolog/modules/js')(pl);
        require('tau-prolog/modules/format')(pl);
        require('tau-prolog/modules/random')(pl);
        require('tau-prolog/modules/statistics')(pl);
        globalThis.pl = pl;
    `, {
        external: ['fs', 'readline-sync', 'path', 'crypto'],
        // The global object for library(js) is globalThis: the Qt engine has no window.
        plugins: [patchPlugin('tau-global', /tau-prolog[\\/]modules[\\/]core\.js$/, [
            ['__env: nodejs_flag ? global : window,', '__env: globalThis,'],
        ])],
    });
    save(directory, 'tau-prolog.js', code);
    save(directory, 'LICENSES.txt', collectLicenses(metafile));
}

// --- Expression depth
//
// The V4 compiler walks an expression by recursion without a stack check:
// a chain of thousands of additions ('a' + String.fromCharCode(10) + 'b' +
// ...) crashes it on the stack of the GUI thread (1 MB on Windows). Such
// chains of only string constants are folded into one string, and the deep
// expressions that remain stop the build.

const MAX_EXPRESSION_DEPTH = 300;

function constantString(node, cache) {
    if (cache.has(node)) {
        return cache.get(node);
    }
    let value = null;
    if (node.type === 'Literal' && typeof node.value === 'string') {
        value = node.value;
    } else if (node.type === 'CallExpression' && node.arguments.length === 1 &&
               node.callee.type === 'MemberExpression' && !node.callee.computed &&
               node.callee.object.type === 'Identifier' && node.callee.object.name === 'String' &&
               node.callee.property.name === 'fromCharCode' &&
               node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'number') {
        value = String.fromCharCode(node.arguments[0].value);
    } else if (node.type === 'BinaryExpression' && node.operator === '+') {
        const left = constantString(node.left, cache);
        const right = left === null ? null : constantString(node.right, cache);
        value = left !== null && right !== null ? left + right : null;
    }
    cache.set(node, value);
    return value;
}

function stringLiteral(value) {
    // The line separators U+2028 and U+2029 in a JavaScript string - only as escape sequences.
    const backslash = String.fromCharCode(92);
    return JSON.stringify(value)
        .split(String.fromCharCode(0x2028)).join(backslash + 'u2028')
        .split(String.fromCharCode(0x2029)).join(backslash + 'u2029');
}

function flattenDeepExpressions(code, name) {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    const cache = new Map();
    const replacements = [];
    let deepest = 0;
    // A walk without recursion: the tree itself is deep.
    const stack = [{ node: ast, depth: 0 }];
    while (stack.length > 0) {
        const { node, depth } = stack.pop();
        deepest = Math.max(deepest, depth);
        if (node.type === 'BinaryExpression' && node.operator === '+' && constantString(node, cache) !== null) {
            replacements.push({ start: node.start, end: node.end, text: stringLiteral(cache.get(node)) });
            continue;
        }
        for (const key of Object.keys(node)) {
            const child = node[key];
            const children = Array.isArray(child) ? child : [child];
            for (const item of children) {
                if (item !== null && typeof item === 'object' && typeof item.type === 'string') {
                    // The depth counts only nested expressions, not
                    // statement lists.
                    stack.push({ node: item, depth: /Expression$/.test(item.type) ? depth + 1 : depth });
                }
            }
        }
    }
    replacements.sort((left, right) => right.start - left.start);
    for (const { start, end, text } of replacements) {
        code = code.substring(0, start) + text + code.substring(end);
    }
    const remaining = maxExpressionDepth(code);
    if (remaining > MAX_EXPRESSION_DEPTH) {
        throw new Error(`${name}: an expression is ${remaining} levels deep`);
    }
    return code;
}

function maxExpressionDepth(code) {
    const ast = acorn.parse(code, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });
    let deepest = 0;
    const stack = [{ node: ast, depth: 0 }];
    while (stack.length > 0) {
        const { node, depth } = stack.pop();
        deepest = Math.max(deepest, depth);
        for (const key of Object.keys(node)) {
            const child = node[key];
            for (const item of Array.isArray(child) ? child : [child]) {
                if (item !== null && typeof item === 'object' && typeof item.type === 'string') {
                    stack.push({ node: item, depth: /Expression$/.test(item.type) ? depth + 1 : depth });
                }
            }
        }
    }
    return deepest;
}

// --- Perl: Perlito5

async function buildPerl() {
    const directory = path.join(VENDOR, 'perl');
    ensureDirectory(directory);
    // Perlito5 thinks it runs in Node.js if there is a global require, and
    // an embedding application may have its own.
    let text = await download(PERLITO_URL);
    for (const [before, after] of [['var isNode = typeof require != "undefined";', 'var isNode = false;'],
                                   ['isNode ? global : window', 'globalThis']]) {
        if (!text.includes(before)) {
            throw new Error(`perlito5.js: the patched code has changed`);
        }
        text = text.split(before).join(after);
    }
    save(directory, 'perlito5.js', text);
    save(directory, 'LICENSES.txt',
         `=== Perlito5 ${PERLITO_COMMIT.slice(0, 7)} (Artistic-2.0) ===\n\n${(await download(PERLITO_LICENSE_URL)).trim()}\n`);
}

// --- PHP: Uniter (parsing, translation into JavaScript, a synchronous PHP environment)

const PHP_PATCHES = [
    // An array from a property or a method of a JavaScript object comes to
    // PHP as a PHP array (a copy), not as a live JSArray: count, foreach and
    // the array functions work with it.
    ['php-arrays', /phpcore[\\/]src[\\/]builtin[\\/]classes[\\/]JSObject\.js$/, [
        ['            if (!_.isArray(value)) {', '            if (!_.isArray(value) || true) {'],
    ]],
    // A JavaScript object without methods (plain data) stays an object:
    // $format->type, as in JavaScript. It becomes an associative array only
    // while plainObjectsAsArrays is set (json_decode of the adapter).
    ['php-objects', /phpcore[\\/]src[\\/]ValueFactory\.js$/, [
        ['            if (Object.getPrototypeOf(nativeObject) === Object.prototype) {',
         '            if (Object.getPrototypeOf(nativeObject) === Object.prototype && factory.plainObjectsAsArrays) {'],
    ]],
    // A repeated run of a unit declares its functions and classes again: a
    // unit may run many times, and PHP would forbid the second declaration.
    // Built-in functions still cannot be redefined.
    ['php-redeclare', /phpcore[\\/]src[\\/]Namespace\.js$/, [
        ['            if (namespaceScope.isNameInUse(name)) {',
         '            if (namespaceScope.isNameInUse(name) && !namespace.hasClass(name)) {'],
        ['            if (hasOwn.call(namespace.functions, lowerName)) {',
         '            if (hasOwn.call(namespace.functions, lowerName) && namespace.functions[lowerName].functionSpec.isBuiltin()) {'],
        ['            if (hasOwn.call(namespace.functions, lowerName)) {',
         '            if (hasOwn.call(namespace.functions, lowerName) && namespace.functions[lowerName].functionSpec.isBuiltin()) {'],
    ]],
    // preg_replace substitutes groups into the replacement: $1, ${1}, \1, $0
    // - the whole match.
    ['php-preg-replace', /phpruntime[\\/]src[\\/]builtin[\\/]functions[\\/]pcre[\\/]basicSupport\.js$/, [
        [`                            subject = leftString + replacement + subject.substring(pcremuMatch.getEnd());

                            // Position the next match attempt just after the end of this replacement.
                            offset = leftString.length + replacement.length;`,
         String.raw`                            var expanded = replacement.replace(/\\(\d{1,2})|\$(\d{1,2})|\$\{(\d{1,2})\}/g, function (all, first, second, third) {
                                var group = Number(first || second || third);
                                var capture = group === 0 ? pcremuMatch.getCapture() : pcremuMatch.getNumberedCapture(group);
                                return capture === null || capture === undefined ? '' : capture;
                            });
                            subject = leftString + expanded + subject.substring(pcremuMatch.getEnd());

                            offset = leftString.length + expanded.length;`],
    ]],
    // sprintf and printf of Uniter know only %d and %s: the other
    // conversions, width and precision are here, as in PHP.
    ['php-format-parser', /phpruntime[\\/]src[\\/]builtin[\\/]bindings[\\/]string[\\/]FormatParser\.js$/, [
        ['precisionSpecifier = (match[8] || 0) * 1;', 'precisionSpecifier = match[8] === undefined ? null : match[8] * 1;'],
        ["if (typeSpecifier === 's') {", 'if (false) {'],
    ]],
    ['php-format-converter', /phpruntime[\\/]src[\\/]builtin[\\/]bindings[\\/]string[\\/]FormatConverter\.js$/, [
        ['function FormatConverter() {', `function padDirective(text, directive) {
    var width = directive.widthSpecifier || 0;
    var character = directive.paddingCharacter || ' ';
    if (text.length >= width)
        return text;
    if (directive.alignmentSpecifier === 'left')
        return text + character.repeat(width - text.length);
    if (character === '0' && /^[+-]/.test(text))
        return text.charAt(0) + '0'.repeat(width - text.length) + text.substring(1);
    return character.repeat(width - text.length) + text;
}

function convertDirective(value, directive) {
    var precision = directive.precisionSpecifier;
    var number = typeof value === 'boolean' ? (value ? 1 : 0) : Number(value);
    var integer = Math.trunc(isFinite(number) ? number : 0);
    var text;
    switch (directive.type) {
        case 'string':
            text = value === null || value === undefined ? '' : (value === true ? '1' : (value === false ? '' : String(value)));
            if (precision !== null && precision !== undefined)
                text = text.substring(0, precision);
            return padDirective(text, directive);
        case 'signed-decimal':
            text = String(integer);
            break;
        case 'unsigned-decimal':
            text = String(integer < 0 ? integer >>> 0 : integer);
            break;
        case 'locale-aware-float':
        case 'locale-unaware-float':
            text = number.toFixed(precision === null ? 6 : Math.min(precision, 53));
            break;
        case 'lower-exponent':
        case 'upper-exponent':
            text = number.toExponential(precision === null ? 6 : Math.min(precision, 53));
            if (directive.type === 'upper-exponent')
                text = text.toUpperCase();
            break;
        case 'lower-exponent-or-float':
        case 'upper-exponent-or-float':
            text = String(Number(number.toPrecision(precision === null ? 6 : Math.max(1, Math.min(precision, 53)))));
            if (directive.type === 'upper-exponent-or-float')
                text = text.toUpperCase();
            break;
        case 'binary':
            text = (integer >>> 0).toString(2);
            break;
        case 'octal':
            text = (integer >>> 0).toString(8);
            break;
        case 'lower-hexadecimal':
            text = (integer >>> 0).toString(16);
            break;
        case 'upper-hexadecimal':
            text = (integer >>> 0).toString(16).toUpperCase();
            break;
        case 'ascii-character':
            return String.fromCharCode(integer);
        default:
            throw new Error('Unsupported conversion specification type "' + directive.type + '"');
    }
    if (directive.showPositiveSign && number >= 0 && text.charAt(0) !== '-')
        text = '+' + text;
    return padDirective(text, directive);
}

function FormatConverter() {`],
        ['    convert: function (value, directive) {', `    convert: function (value, directive) {
        return convertDirective(value, directive);
    },

    convertUniter: function (value, directive) {`],
    ]],
];

async function buildPhp() {
    const { code, metafile, directory } = await bundle('php', `
        globalThis.uniterPhp = {
            phpToAST: require('phptoast'),
            phpToJS: require('phptojs'),
            phpRuntime: require('phpruntime/sync'),
            pcre: require('phpruntime/src/addon/pcre/basicSupport')
        };
    `, {
        inject: [path.join(TOOLS, 'process-shim.js')],
        alias: { path: 'path-browserify' },
        plugins: PHP_PATCHES.map(([name, filter, patches]) => patchPlugin(name, filter, patches)),
    });
    // V4 does not accept an escaped colon (\\:) in regular expressions, and
    // in strings and expressions it means the same as the colon itself.
    save(directory, 'uniter.js', code.split('\\:').join(':'));
    save(directory, 'LICENSES.txt', collectLicenses(metafile));
}

const BUILDERS = { python: buildPython, lua: buildLua, prolog: buildProlog, perl: buildPerl, php: buildPhp };
const requested = process.argv.slice(2);
for (const [language, build] of Object.entries(BUILDERS)) {
    if (requested.length === 0 || requested.includes(language)) {
        console.log(language);
        await build();
    }
}
