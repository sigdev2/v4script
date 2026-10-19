#ifndef V4SCRIPT_INTERNAL_HPP
#define V4SCRIPT_INTERNAL_HPP

#include <QJsonObject>
#include <QString>
#include <QStringList>

class QJSEngine;
class QJSValue;

namespace v4script::internal {

// Resource prefix of the JavaScript files: :/v4script/js/<path>.
extern const char* const JS_PREFIX;

/**
 * @brief Text of a resource file; empty and a warning if it is missing
 */
QString loadResource(const QString& path);

/**
 * @brief The manifest compiled into the library (languages.json, only
 * the languages of V4SCRIPT_LANGUAGES)
 */
const QJsonObject& manifest();

/**
 * @brief Files of a language relative to JS_PREFIX in load order: the
 * translator core first for translated languages; empty - unknown language
 */
QStringList languageFiles(const QString& id, QString* adapter);

/**
 * @brief Compatibility layer of V4 (js/host/compat.js), once per engine
 */
void installCompat(QJSEngine* engine);

/**
 * @brief Evaluates code without the hints of the JavaScript compiler
 * ("Variable ... is used before its declaration"): they are about
 * interpreters and generated code, never useful to the user.
 */
QJSValue evaluateQuietly(QJSEngine* engine, const QString& code, const QString& fileName, QStringList* stackTrace);

/**
 * @brief Keeps the hints of the JavaScript compiler quiet while it lives
 * (nested ones too); other messages go to the handler of the application.
 */
class QuietCompiler {
public:
    explicit QuietCompiler();
    ~QuietCompiler();

    QuietCompiler(const QuietCompiler&) = delete;
    QuietCompiler& operator=(const QuietCompiler&) = delete;
};

} // namespace v4script::internal

#endif // V4SCRIPT_INTERNAL_HPP
