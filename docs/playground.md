# Playground

The playground runs the languages of v4script in a browser:
**<https://sigdev2.github.io/v4script/>**. It is a static site: the same
scripts as in the Qt engine (`js/`), a page with an editor and a console
([web/](../web)), and examples for every language. Nothing runs on a
server.

## Using it

 - **Language and program.** The lists at the top choose a language and a
   program: an example or one of your own. A link opens a program directly:
   `#basic/guess.bas` - an example, `#pascal` - the last program of a
   language.
 - **The editor** colors the program as it is typed: comments, strings,
   numbers, keywords, types, built-in names, directives and variables.
   The colors come from regular expressions, not from a parser of the
   language (see [highlighting](#highlighting)), so a rare construct may
   be colored wrongly. A program over 100 000 characters stays plain.
 - **Run** (Ctrl+Enter) starts the program, **Stop** (Esc) stops it. The
   output shows standard output, standard error in red, interpreter
   warnings in orange, the value of the run after `=>`, and an error with
   its line: a click on the line selects it in the editor.
 - **Input.** When a program reads a line (`INPUT`, `input()`, `scanf`,
   `ReadLn`…), an input field appears at the end of the output: Enter sends
   the line, Ctrl+D ends the input. Lines written in *Standard input* under
   the editor are read first, without waiting.
 - **Graphics.** BASIC `SCREEN` and Pascal `Graph` draw on the canvas above
   the output, and every language can draw on the global JavaScript object
   `canvas` with its 2D context: `canvas.getContext('2d')` in JavaScript,
   `js.canvas` in Python, `JS.canvas` in BASIC and Pascal (see
   [JavaScript from programs](languages/README.md#javascript-from-programs)).
 - **Your programs.** *New* creates a program of the current language,
   *Save as* copies the open program (an example too) under a new name,
   *Rename* and *Delete* change your programs, *Open* takes a file from the
   computer (the language follows its extension), *Download* saves the
   program as a file. Your programs and the changes of examples stay in the
   `localStorage` of the browser; a changed example is marked with `*` until
   *Revert*.
 - **Files and modules.** Programs find each other by name: `import helper`
   in Python reads your program `helper.py`, `'$INCLUDE: 'lib.bas'` in
   BASIC - `lib.bas`, `open("data.txt")` - a program named `data.txt`. The
   examples are files too.

### Examples

Every language has a few examples: the first steps, input, the features
the language is known for. BASIC has the most: programs on the topics of
the home-computer books of the 1980s and 1990s - greetings and quizzes,
guessing games, Bulls and cows, a Moon landing, number puzzles, a
calendar, and pictures and animations with `SCREEN 12` and `SCREEN 13`.
All examples are original programs of v4script, not listings from books.

## Differences from the Qt engine

The scripts are the same; the host around them is not.

| | Qt engine | Browser |
| --- | --- | --- |
| JavaScript engine | V4 of Qt 6.4 | the engine of the browser (V8, SpiderMonkey, JavaScriptCore): faster and more forgiving; the fixes of [compat.js](../js/host/compat.js) do no harm there |
| Where code runs | the thread of the `QJSEngine` | a Web Worker: the page stays responsive during a long run |
| Input | `Host::readLine`, called while the program waits | the worker waits on a `SharedArrayBuffer` (`Atomics.wait`) until the page writes the typed line; see [isolation](#cross-origin-isolation) |
| Units | the units of a language share declarations | every run is a new program in a new worker |
| Time limit | the watchdog interrupts a run, the declarations stay | none; Stop ends the worker and everything in it |
| Graphics | `ImageCanvas` or a Qt Quick `Canvas` | an `OffscreenCanvas` in the worker; the page gets its picture at most every 40 ms while a program draws and whenever the program stops or waits (BASIC and Pascal put their screen on the canvas at the end of a run and at `SLEEP`, `_LIMIT`, `Delay`) |
| Recursion | up to 10 000 calls after `prepareProcess()` | the stack of the worker: the depth and the message differ by browser, and a stack overflow may come without its line |
| Host modules | the API of the application | none; the global `canvas` |
| Module files | `Host::readModule` | the examples and your programs by name |
| Loading | the resources of the application | the scripts of a language on its first run: from 50 KB (Forth, Prolog) to 290 KB (Python) compressed |

Not available in either: real-time keys (`INKEY$` and `ReadKey` read the
next character of a typed line), sound, writing files.

### Cross-origin isolation

`SharedArrayBuffer` needs a cross-origin isolated page: the server sends
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. GitHub Pages sends no such
headers, so the service worker [web/sw.js](../web/sw.js) adds them to every
response of the site, and the first visit reloads the page once. A browser
without service workers (some private modes, a blocked registration) shows
a note at the bottom of the page: programs then read only the lines of
*Standard input* and see the end of input after them.

## Building

```
cd tools && npm ci && cd ..
node tools/build-site.mjs                    # the site in build/site, minified scripts
node tools/build-site.mjs --serve            # ... and serve it on http://localhost:8080
node tools/build-site.mjs --no-minify        # the scripts as they are, for debugging
node tools/run-samples.mjs basic --examples  # the examples of a language run without errors
```

[tools/build-site.mjs](../tools/build-site.mjs) copies [web/](../web),
minifies `js/` with [tools/minify.mjs](../tools/minify.mjs), writes
`languages.json` with the version from [VERSION](../VERSION) and
`examples.json` from [web/examples](../web/examples), and copies the license
texts. It fails when a language has no [highlighting](#highlighting) rules
or when the highlighted text of an example differs from the example.
`--serve` sends the isolation headers itself; a plain static server
works too, through the service worker (`localhost` counts as a secure
origin).

The workflow [pages.yml](../.github/workflows/pages.yml) checks the
examples, builds the site and deploys it to GitHub Pages on every push to
`master` (a release) and when it is run by hand (*Actions → Playground →
Run workflow*). Once per repository: *Settings → Pages → Source: GitHub
Actions*.

## Files

| File | Role |
| --- | --- |
| [web/index.html](../web/index.html), [web/style.css](../web/style.css) | the page |
| [web/app.js](../web/app.js) | the editor, the lists of programs, `localStorage`, the console, the runs |
| [web/highlight.js](../web/highlight.js) | the syntax highlighting: the rules and word lists of every language |
| [web/worker.js](../web/worker.js) | the engine: the bridge of the [host layer](internals/host.md) in a Web Worker - loading a language, output, input, the canvas, timers |
| [web/sw.js](../web/sw.js) | the service worker that adds the isolation headers |
| [web/examples/](../web/examples) | the examples: a directory per language and `index.json` - groups, titles and input for the check |

The page and the worker run only in browsers, so they use modern
JavaScript, like the tools; the rules of
[StyleGuide.JS.md](../StyleGuide.JS.md) are for `js/`.

## Highlighting

The editor is a text area with transparent text over `<pre id="highlight">`,
the colored copy of the same text: both have the same font, padding and
white space, ligatures and kerning are off (the tokens of the copy would
break them), and [app.js](../web/app.js) moves the copy as the text area
scrolls and colors it again once per frame while the user types.

A language in [highlight.js](../web/highlight.js) is a list of rules, in
the manner of [Colorer](https://github.com/colorer/Colorer-library): a
regular expression and the class of what it finds - `comment`, `string`,
`number`, `constant`, `keyword`, `type`, `builtin`, `meta` (preprocessor
lines, directives, annotations), `variable` - or `word` for names, which
the word lists of the language (and its optional `classify`) give a class.
At every position the leftmost match wins, then the first rule. A rule may
also require the text before the match: a regular expression literal of
JavaScript or Perl follows an operator, `<stdio.h>` follows `#include`.
There is no parser, so the colors may differ from the language where it
needs context: a heredoc of Perl takes the rest of its first line, nested
block comments end at the first end, a method named as a built-in is
colored as one. A new language adds its
rules there; the build fails without them.

## Adding an example

1. Write an original program into `web/examples/<language>/` - never a
   listing from a book. Its name must be unique among all examples:
   programs find each other by name.
2. Add it to [index.json](../web/examples/index.json): a group, a title,
   and `input` - the lines a check gives it. A program that reads input
   must end at the end of input (an empty line or 0 to quit).
3. `node tools/run-samples.mjs <language> --examples` - the examples run
   without errors (with a canvas that draws nothing); then try it on the
   page with `node tools/build-site.mjs --serve`.
