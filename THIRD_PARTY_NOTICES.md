# Third-party notices

v4script itself is under the [MIT license](LICENSE). It includes the
third-party software listed below; their licenses apply to those parts.

## Bundled interpreters

The interpreters of Python, Lua, Prolog, Perl and PHP are bundled in
[js/vendor](js/vendor) as built by [tools/build-bundles.mjs](tools/build-bundles.mjs).
Each directory has a `LICENSES.txt` with the full license texts and
copyright notices of everything that went into its bundle.

| Bundle | Main project | License | Copyright |
| --- | --- | --- | --- |
| python | [Skulpt](https://github.com/skulpt/skulpt) (commit ae5f462) | [MIT](js/vendor/python/LICENSES.txt) | Scott Graham and contributors to the Skulpt Project; portions derived from CPython and PyPy: Python Software Foundation ([PSF License](https://docs.python.org/3/license.html)) |
| lua | [fengari](https://github.com/fengari-lua/fengari) 0.1.5 and [fengari-interop](https://github.com/fengari-lua/fengari-interop) 0.1.4 | [MIT](js/vendor/lua/LICENSES.txt) | Benoit Giannangeli, Daurnimator; Lua.org, PUC-Rio |
| prolog | [Tau Prolog](https://github.com/tau-prolog/tau-prolog) 0.3.4 | [BSD-3-Clause](js/vendor/prolog/LICENSES.txt) | José Antonio Riaza Valverde |
| perl | [Perlito5](https://github.com/fglock/Perlito) 9.028 (commit 97c296f) | [Artistic License 2.0](js/vendor/perl/LICENSES.txt) | Flavio S. Glock |
| php | [Uniter](https://github.com/asmblah/uniter): phpcore 8.3.0, phpruntime 9.3.0, phptoast 9.4.1, phptojs 10.3.2, pcremu 0.0.5 | [MIT](js/vendor/php/LICENSES.txt) | Dan Phillimore (asmblah) |

Dependencies included in the bundles (name, version, license):

 - **python**: fastestsmallesttextencoderdecoder 1.0.22 (CC0-1.0), jsbi
   3.2.5 (Apache-2.0), setimmediate 1.0.5 (MIT), strftime 0.10.3 (MIT).
 - **lua**: available-typed-arrays 1.0.7, call-bind 1.0.9,
   call-bind-apply-helpers 1.0.2, call-bound 1.0.4, define-data-property
   1.1.4, dunder-proto 1.0.1, es-define-property 1.0.1, es-errors 1.3.0,
   es-object-atoms 1.1.2, for-each 0.3.5, function-bind 1.1.2,
   generator-function 2.0.1, get-intrinsic 1.3.0, get-proto 1.0.1, gopd
   1.2.0, has-property-descriptors 1.0.2, has-symbols 1.1.0,
   has-tostringtag 1.0.2, hasown 2.0.4, is-arguments 1.2.0, is-callable
   1.2.7, is-generator-function 1.1.2, is-regex 1.2.1, is-typed-array
   1.1.15, math-intrinsics 1.1.0, possible-typed-array-names 1.1.0,
   safe-regex-test 1.1.0, set-function-length 1.2.2, util 0.12.5,
   which-typed-array 1.1.24 (all MIT); inherits 2.0.4 (ISC); sprintf-js
   1.1.3 (BSD-3-Clause).
 - **php**: core-js-pure 3.50.0, escape-string-regexp 4.0.0, event-emitter
   0.3.5, events 3.3.0, es6-iterator 2.0.3, immediate 3.0.6, lie 3.3.0,
   microdash 1.4.2, object-inspect 1.13.4, parsing 2.4.0, path-browserify
   1.0.1, pauser 1.1.1, phpcommon 2.0.3, process 0.11.10, punycode 1.4.1,
   side-channel 1.1.1, side-channel-list 1.0.1, side-channel-map 1.0.1,
   side-channel-weakmap 1.0.2, source-map-to-comment 2.0.0, template-string
   1.1.2, transpiler 1.2.1, url 0.11.4, util 0.12.5 and the helper packages
   listed for lua (all MIT); d 1.0.2, es5-ext 0.10.64, es6-set 0.1.6,
   es6-symbol 3.1.4, es6-weak-map 2.0.3, ext 1.7.0, inherits 2.0.4, type
   2.7.3 (ISC); qs 6.16.0, source-map 0.8.0 (BSD-3-Clause).

## Code in v4script's own sources

### QB64 Phoenix Edition

Parts of the BASIC implementation follow algorithms of the QB64-PE runtime
(`libqb`): line drawing with styles, `CIRCLE`, `DRAW`, the number format of
`STR$` and `PRINT`, `PRINT USING`
([js/translator/basic](js/translator/basic)). The 8x8 bitmap font of the
Pascal `Graph` unit ([lib-graph.js](js/translator/pascal/lib-graph.js)) is
the font of QB64-PE.

Source: <https://github.com/QB64-Phoenix-Edition/QB64pe>

```
Copyright 2007-2022 Galleon & The QB64 Team
Copyright 2022-2023 QB64 Phoenix Edition Team

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## Reference implementations (not included)

The translated languages were checked against the output of gcc, the JDK,
gforth, QB64-PE, Free Pascal, wabt, the WebAssembly specification tests and
chibi-scheme ([testing](docs/testing/README.md#samples)). They were used as
black boxes; none of their code is part of v4script except what is listed
above. Compatible behavior (for example the same random numbers as gforth
or Free Pascal) is implemented from the observed behavior and published
specifications.

## Development tools (not included)

[tools/package.json](tools/package.json) pins the packages used to build
the bundles and the minified scripts (esbuild, acorn and the packages of
the interpreters). They are not part of the library.
