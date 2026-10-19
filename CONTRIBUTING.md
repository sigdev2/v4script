# Contributing to v4script

Thank you for helping! Bug reports, fixes, new library functions of a
language and documentation improvements are all welcome. Before starting a
new language, open an issue: languages follow an approved order
([TODO](TODO.md)) and take a lot of shared work.

## Reporting a bug

Open an issue with:

- the language, the program (as short as possible) and its standard input;
- what v4script printed and what you expected - ideally the output of the
  reference implementation (gcc, javac, fpc, gforth, QB64-PE…);
- the v4script and Qt versions and the platform.

## Making a change

1. Fork the repository and branch off `dev` (not `master`: it receives
   releases only).
2. Build and test as described in [development](docs/development.md) and
   [testing](docs/testing/README.md).
3. Add a sample (`tests/samples/<language>/`) or a test row that fails
   without your change.
4. Update the documentation the change touches.
5. Open a pull request against `dev`.

## Rules

- **English everywhere**: commit messages, code comments, identifiers,
  documentation.
- Follow the code style: [C++](StyleGuide.CPP.md), formatted with
  clang-format 15 and [.clang-format](.clang-format), and
  [JavaScript](StyleGuide.JS.md), which stays ES2016 (the syntax of the
  Qt 6.4 engine).
- Do not copy code from projects whose license is not compatible with MIT
  (for example GPL or LGPL implementations of a language). Reference
  implementations may be used as black boxes to compare output.
  Third-party code under a compatible license must be listed in
  [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).
- Samples and examples are your own programs: do not add listings from
  books or other copyrighted material.
- By contributing you agree that your contribution is licensed under the
  [MIT license](LICENSE) of the project.

Please follow the [code of conduct](CODE_OF_CONDUCT.md).
