# v4script documentation

| Section | For whom | What it covers |
| --- | --- | --- |
| [getting-started.md](getting-started.md) | everyone | building, the examples, the `v4run` runner, the first embedding |
| [playground.md](playground.md) | everyone | the languages in a browser: using the playground, its differences from the Qt engine, building it for GitHub Pages, adding examples |
| [languages/](languages/README.md) | authors of programs | every language: what works, input and output, modules, host modules and JavaScript, errors, differences from the reference implementation |
| [embedding/](embedding/README.md) | application developers | adding the library to a CMake project, build options, `Runtime` and `Engine`, host modules, graphics, versions |
| [internals/](internals/README.md) | developers of v4script | architecture, the host layer, the translator and each translated language, third-party interpreters, V4 pitfalls |
| [testing/](testing/README.md) | developers of v4script | the C++ tests, the sample format, the quick check in Node.js, reference implementations |
| [development.md](development.md) | developers of v4script | repository layout, branches, code style tools, rebuilding the vendor bundles, minification |
| [releasing.md](releasing.md) | maintainers | versions and the release procedure |

The code style is in [StyleGuide.CPP.md](../StyleGuide.CPP.md) and
[StyleGuide.JS.md](../StyleGuide.JS.md), plans and known gaps in
[TODO](../TODO.md).
