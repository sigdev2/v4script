#ifndef V4SCRIPT_LANGUAGES_HPP
#define V4SCRIPT_LANGUAGES_HPP

#include <QList>
#include <QString>
#include <QStringList>

#include <optional>

namespace v4script {

/**
 * @brief A language that the library runs (see docs/languages)
 */
struct LanguageInfo {
    QString id;                    // as passed to run(): "python"
    QString name;                  // for people: "Python"
    QString version;               // version of the language: "3", "1.22", "C17", "R7RS"
    QString dialect;               // what exactly is implemented: "Free Pascal 3.2.2 (objfpc mode)"
    QString implementation;        // "v4script" for own translators, else the interpreter: "Skulpt"
    QString implementationVersion; // version of the implementation: "0.1.4", "0.3.4", "ae5f462"
    QString license;               // license of the implementation: "MIT", "BSD-3-Clause"
    QStringList extensions;        // file extensions without the dot: "py"
    QString lineComment;           // line comment of the language: "#", "//"
};

/**
 * @brief Languages compiled into the library (V4SCRIPT_LANGUAGES), in the
 * order of the manifest
 */
QList<LanguageInfo> languages();

std::optional<LanguageInfo> findLanguage(const QString& id);

/**
 * @brief Language by the extension of a file name ("main.go", "go", ".go");
 * nullopt - unknown. "pl" is Perl; Prolog files are "pro".
 */
std::optional<LanguageInfo> findLanguageForFile(const QString& fileName);

/**
 * @brief Version of the library that is linked: "0.1.4". Compare with
 * V4SCRIPT_VERSION_STRING from v4script/Version.hpp to detect mismatched
 * headers.
 */
QString version();

// Call depth of code after prepareProcess() (V4 default: 640 on Windows,
// 1234 on Linux, 1000 on Android).
constexpr int MAX_CALL_DEPTH = 10000;
// Main thread stack that holds MAX_CALL_DEPTH calls.
constexpr qint64 MAIN_STACK_SIZE = 16LL * 1024 * 1024;

/**
 * @brief Prepares the process for deep recursion: call depth of the engine
 * MAX_CALL_DEPTH, main thread stack MAIN_STACK_SIZE on Linux (Windows gets
 * it from the linker option of the library). Call at the start of main(),
 * before the first QJSEngine. Android keeps the defaults of V4.
 */
void prepareProcess();

} // namespace v4script

#endif // V4SCRIPT_LANGUAGES_HPP
