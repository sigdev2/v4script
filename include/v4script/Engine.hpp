#ifndef V4SCRIPT_ENGINE_HPP
#define V4SCRIPT_ENGINE_HPP

#include "v4script/Host.hpp"
#include "v4script/HostModule.hpp"
#include "v4script/Result.hpp"

#include <QJSValue>
#include <QList>
#include <QString>

#include <memory>

class QJSEngine;

namespace v4script {

/**
 * @brief The languages inside a QJSEngine that belongs to the application.
 *
 * Use it when the application already has an engine and its own timers,
 * limits and output - for example a QQmlEngine shared with QML. Otherwise
 * Runtime is simpler: it owns its engine and adds timers and a time limit.
 *
 * The engine gets the compatibility layer and the host layer at once. A
 * language loads into the engine on first use and stays until the engine is
 * gone; all units of one language share its state (variables, functions,
 * types), and every language shares the global object with JavaScript.
 *
 * Everything runs in the thread of the engine. The engine must provide
 * setTimeout and clearTimeout in its global object if programs should
 * continue after a run (sleeping goroutines, Java threads, Prolog): Runtime
 * does that, a QQmlEngine host must do it itself.
 */
class Engine {
public:
    explicit Engine(QJSEngine* engine, Host host = {});
    ~Engine();

    Engine(const Engine&) = delete;
    Engine& operator=(const Engine&) = delete;

    QJSEngine* jsEngine() const;

    void setHost(Host host);
    const Host& host() const;

    /**
     * @brief Gives the module to programs. A language sees the modules that
     * existed when it loaded: add modules before the first run.
     */
    void addModule(const HostModule& module);
    QList<HostModule> modules() const;

    /**
     * @brief Loads the language into the engine if it is not there yet.
     * Loading takes from tens to hundreds of milliseconds; call it outside
     * time limits.
     * @return Error text; empty - the language is ready
     */
    QString load(const QString& language);
    bool isLoaded(const QString& language) const;

    /**
     * @brief Runs code of a language: an id from languages() or "javascript".
     * @param unit Name of the source unit (file, document block). Languages
     * keep declarations per unit and show it in errors; output and timers of
     * the run belong to it (currentUnit()).
     */
    Result run(const QString& language, const QString& code, const QString& unit = QString());

    /**
     * @brief Calls a JavaScript function on behalf of a unit (timer callbacks)
     */
    Result call(const QJSValue& function, const QJSValueList& arguments = {}, const QString& unit = QString());

    /**
     * @brief Unit of the run or call in progress; empty outside them
     */
    QString currentUnit() const;

    /**
     * @brief Passes output that languages still hold to Host::write. Runs
     * flush on their own; this is for output left after an interruption.
     */
    void flush();

    /**
     * @brief console.log/info/debug, console.warn, console.error and print
     * in the global object, writing to Host::write
     */
    void installConsole();

private:
    struct Private;
    friend class HostBridge;
    const std::unique_ptr<Private> d;
};

} // namespace v4script

#endif // V4SCRIPT_ENGINE_HPP
