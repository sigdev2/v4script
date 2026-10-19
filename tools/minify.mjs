// Builds the minified copy of js/ for a release:
//
//     node tools/minify.mjs [output directory] [--js <source directory>]
//
// Every .js file is minified with esbuild (whitespace and local names; the
// syntax is left as it is: the engine takes the value of the last
// expression of a file, and the code must stay ES2016 for V4; esbuild
// does not check that, the tests do) and checked
// for the expression depth that crashes the V4 compiler. Other files are
// copied. The output (build/js-min by default) is what
// -DV4SCRIPT_JS_DIR=<directory> or -DV4SCRIPT_MINIFY_JS=ON puts into the
// resources. See docs/releasing.md.

import * as acorn from 'acorn';
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_EXPRESSION_DEPTH = 300;

function parseArguments(argv) {
    const options = { source: path.join(root, 'js'), output: path.join(root, 'build', 'js-min') };
    for (let index = 0; index < argv.length; ++index) {
        if (argv[index] === '--js') {
            options.source = path.resolve(argv[++index]);
        } else {
            options.output = path.resolve(argv[index]);
        }
    }
    return options;
}

// The deepest nesting of expressions; statements do not count. The walk
// has its own stack: the tree itself may be deep.
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

function* walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            yield* walk(full);
        } else {
            yield full;
        }
    }
}

async function minifyFile(source, target) {
    const code = fs.readFileSync(source, 'utf8');
    const result = await esbuild.transform(code, {
        loader: 'js',
        // No lowering: the sources are ES2016 already, and lowering would
        // add helpers (esbuild wraps yield* for es2016) that V4 code does
        // not need.
        target: 'esnext',
        charset: 'utf8',
        minifyWhitespace: true,
        minifyIdentifiers: true,
        minifySyntax: false,
        // Third-party bundles keep their license comments; their full texts
        // are in LICENSES.txt next to them.
        legalComments: 'inline',
    });
    const depth = maxExpressionDepth(result.code);
    if (depth > MAX_EXPRESSION_DEPTH) {
        throw new Error(`${path.relative(root, source)}: an expression is ${depth} levels deep after minification`);
    }
    fs.writeFileSync(target, result.code);
    return { before: Buffer.byteLength(code), after: Buffer.byteLength(result.code) };
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    fs.rmSync(options.output, { recursive: true, force: true });
    let before = 0, after = 0, files = 0;
    for (const source of walk(options.source)) {
        const target = path.join(options.output, path.relative(options.source, source));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (source.endsWith('.js')) {
            const sizes = await minifyFile(source, target);
            before += sizes.before;
            after += sizes.after;
            ++files;
        } else {
            fs.copyFileSync(source, target);
        }
    }
    const megabytes = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';
    console.log(`${files} files: ${megabytes(before)} -> ${megabytes(after)} in ${path.relative(root, options.output) || options.output}`);
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
