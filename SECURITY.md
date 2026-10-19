# Security policy

## What counts as a vulnerability

v4script runs code that the embedding application did not write, so its
boundaries matter. Please report privately anything that lets a program:

- reach something the application did not give it (files, network,
  processes, other objects of the application) - beyond the host callbacks,
  host modules and the JavaScript global object it shares by design;
- crash the process or corrupt memory (for example an expression or a
  recursion that brings down the V4 compiler or the stack);
- escape the time limit of `Runtime` or the interruption through
  `QJSEngine::setInterrupted`.

Errors of a program, wrong results of a language and missing library
functions are ordinary bugs: open an issue.

## Supported versions

Security fixes go to the latest release (and to `dev`).

| Version | Supported |
| --- | --- |
| 0.1.x | yes |

## Reporting

Use GitHub's
[private vulnerability reporting](https://github.com/sigdev2/v4script/security/advisories/new):
the **Security** tab of the repository, **Report a vulnerability**.
Include the language, a program
that shows the problem, the Qt version and the platform. You will get an
answer within a week; please do not disclose the issue publicly until a
fix is released.
