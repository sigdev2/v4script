# Releasing

v4script follows [semantic versioning](https://semver.org): while the
version is 0.x, a minor version may change the API.

## Version numbers

| Where | What |
| --- | --- |
| [VERSION](../VERSION) | the version of the project; CMake reads it into `project()`, `Version.hpp` and `v4script::version()` |
| [languages.json](../languages.json) | `implementationVersion` of the translated languages (Go, C, Java, Forth, BASIC, Pascal, WebAssembly, Scheme) is the version of v4script; the versions of the languages and of third-party interpreters change when the implementation does |
| [README](../README.md) | the version badge and the table of languages with their versions |

## Steps

On `dev`:

1. All tests pass on Linux and Windows, also with the minified scripts:

   ```
   cmake -S . -B build-release -DCMAKE_PREFIX_PATH=<Qt>/<kit> -DV4SCRIPT_MINIFY_JS=ON
   cmake --build build-release --parallel
   ctest --test-dir build-release --output-on-failure
   ```

2. Set the new version in [VERSION](../VERSION) and the
   `implementationVersion` of the translated languages in
   [languages.json](../languages.json); update the language table of the
   [README](../README.md) if versions of languages or interpreters changed.
3. Commit: `Release X.Y.Z`.

Then:

```
git checkout master
git merge --no-ff dev -m "Release X.Y.Z"
git tag -a vX.Y.Z -m "v4script X.Y.Z"
git push origin master dev vX.Y.Z
```

## Release artifacts

The source archive of the tag is the release. Optionally attach the
minified scripts so that users can embed them without Node.js:

```
node tools/minify.mjs build/v4script-js-X.Y.Z
```

An application embeds them with `-DV4SCRIPT_JS_DIR=<directory>`. The
directory has the same layout as `js/` (the vendor bundles keep their
`LICENSES.txt`).
