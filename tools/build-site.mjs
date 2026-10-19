// Builds the playground - v4script in the browser - as a static site for
// GitHub Pages:
//
//     node tools/build-site.mjs [output directory] [--no-minify] [--serve [port]]
//
// The site (build/site by default) is the page of web/, the scripts of js/
// minified by tools/minify.mjs (--no-minify copies them as they are),
// languages.json with the version from VERSION, and examples.json made from
// web/examples/index.json and the files next to it. Every language must have
// highlighting rules in web/highlight.js. --serve then serves the site on
// http://localhost:8080 with the headers of cross-origin isolation.
// See docs/playground.md.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasSyntax, highlight } from '../web/highlight.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const examplesDirectory = path.join(web, 'examples');

function parseArguments(argv) {
    const options = { output: path.join(root, 'build', 'site'), minify: true, port: 0 };
    for (let index = 0; index < argv.length; ++index) {
        if (argv[index] === '--no-minify') {
            options.minify = false;
        } else if (argv[index] === '--serve') {
            options.port = /^\d+$/.test(argv[index + 1] || '') ? Number(argv[++index]) : 8080;
        } else {
            options.output = path.resolve(argv[index]);
        }
    }
    return options;
}

function copyDirectory(source, target, skip = () => false) {
    fs.mkdirSync(target, { recursive: true });
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
        const from = path.join(source, entry.name);
        if (skip(from)) {
            continue;
        }
        const to = path.join(target, entry.name);
        if (entry.isDirectory()) {
            copyDirectory(from, to, skip);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

// examples.json: [{ language, group, file, title, code }] in the order of
// the index. Every file of a language directory is in the index, and every
// file of the index exists.
function collectExamples(languages) {
    const index = JSON.parse(fs.readFileSync(path.join(examplesDirectory, 'index.json'), 'utf8'));
    const known = new Set(languages.map((language) => language.id).concat(['javascript']));
    const examples = [];
    const problems = [];
    for (const [language, groups] of Object.entries(index)) {
        if (!known.has(language)) {
            problems.push(`index.json: unknown language ${language}`);
            continue;
        }
        const listed = new Set();
        for (const group of groups) {
            for (const example of group.examples) {
                const file = path.join(examplesDirectory, language, example.file);
                listed.add(example.file);
                if (!fs.existsSync(file)) {
                    problems.push(`${language}/${example.file}: no such file`);
                    continue;
                }
                examples.push({ language, group: group.group, file: example.file, title: example.title,
                                code: fs.readFileSync(file, 'utf8') });
            }
        }
        const directory = path.join(examplesDirectory, language);
        for (const name of fs.existsSync(directory) ? fs.readdirSync(directory) : []) {
            if (!listed.has(name)) {
                problems.push(`${language}/${name}: not in index.json`);
            }
        }
    }
    const names = new Map();
    for (const example of examples) {
        if (names.has(example.file)) {
            problems.push(`${example.file}: the name is used twice (modules are found by name)`);
        }
        names.set(example.file, example);
    }
    if (problems.length > 0) {
        throw new Error('Examples:\n  ' + problems.join('\n  '));
    }
    return examples;
}

// The editor shows the highlighted copy of the text under its own: the copy
// must be the same text.
function checkHighlighting(languages, examples) {
    const problems = [];
    for (const language of languages.map((item) => item.id).concat(['javascript'])) {
        if (!hasSyntax(language)) {
            problems.push(`${language}: no highlighting rules in web/highlight.js`);
        }
    }
    const plain = (html) => html.replace(/<\/?span[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');
    for (const example of examples) {
        if (plain(highlight(example.code, example.language)) !== example.code) {
            problems.push(`${example.language}/${example.file}: the highlighted text differs from the text`);
        }
    }
    if (problems.length > 0) {
        throw new Error('Highlighting:\n  ' + problems.join('\n  '));
    }
}

function build(options) {
    const output = options.output;
    fs.rmSync(output, { recursive: true, force: true });
    copyDirectory(web, output, (file) => file === examplesDirectory);

    if (options.minify) {
        execFileSync(process.execPath, [path.join(root, 'tools', 'minify.mjs'), path.join(output, 'js')],
                     { stdio: 'inherit' });
    } else {
        copyDirectory(path.join(root, 'js'), path.join(output, 'js'));
    }

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'languages.json'), 'utf8'));
    manifest.version = fs.readFileSync(path.join(root, 'VERSION'), 'utf8').trim();
    fs.writeFileSync(path.join(output, 'languages.json'), JSON.stringify(manifest, null, 1) + '\n');

    const examples = collectExamples(manifest.languages);
    checkHighlighting(manifest.languages, examples);
    fs.writeFileSync(path.join(output, 'examples.json'), JSON.stringify(examples) + '\n');

    // The site distributes the bundles of third-party interpreters: their
    // licenses go with it (and LICENSES.txt next to each bundle in js/vendor).
    fs.copyFileSync(path.join(root, 'LICENSE'), path.join(output, 'LICENSE.txt'));
    fs.copyFileSync(path.join(root, 'THIRD_PARTY_NOTICES.md'), path.join(output, 'THIRD_PARTY_NOTICES.md'));
    // GitHub Pages must not run Jekyll over the files.
    fs.writeFileSync(path.join(output, '.nojekyll'), '');

    let bytes = 0;
    const count = (directory) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const full = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                count(full);
            } else {
                bytes += fs.statSync(full).size;
            }
        }
    };
    count(output);
    console.log(`site: ${examples.length} examples, ${(bytes / 1048576).toFixed(1)} MB in ` +
                `${path.relative(root, output) || output}`);
}

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/plain; charset=utf-8',
};

// A local server for trying the site: it sends COOP and COEP itself, as a
// server that GitHub Pages is not.
function serve(directory, port) {
    const server = http.createServer((request, response) => {
        let name = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (name.endsWith('/')) {
            name += 'index.html';
        }
        const file = path.join(directory, path.normalize(name));
        if (!file.startsWith(directory + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
            response.writeHead(404, { 'Content-Type': 'text/plain' });
            response.end('Not found');
            return;
        }
        response.writeHead(200, {
            'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
            'Cache-Control': 'no-cache',
        });
        fs.createReadStream(file).pipe(response);
    });
    server.listen(port, () => console.log(`serving ${directory} on http://localhost:${port}/`));
}

const options = parseArguments(process.argv.slice(2));
try {
    build(options);
} catch (error) {
    console.error(error.message);
    process.exit(1);
}
if (options.port > 0) {
    serve(options.output, options.port);
}
