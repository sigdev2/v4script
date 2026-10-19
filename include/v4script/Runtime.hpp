#ifndef V4SCRIPT_RUNTIME_HPP
#define V4SCRIPT_RUNTIME_HPP

#include "v4script/Engine.hpp"
#include "v4script/Host.hpp"
#include "v4script/HostModule.hpp"
#include "v4script/Result.hpp"

#include <QObject>
#include <QString>

#include <functional>
#include <memory>
#include <optional>

class QJSEngine;

namespace v4script {

/**
 * @brief A ready place to run programs: its own QJSEngine with the
 * languages, console, timers and a time limit.
 *
 *     v4script::Runtime runtime;
 *     runtime.setOutput([](v4script::Stream, const QString& text) { std::cout << text.toStdString(); });
 *     v4script::Result result = runtime.run("python", "print(sum(range(10)))");
 *
 * Programs that wait for time (time.Sleep in Go, Thread.sleep in Java,
 * setTimeout in JavaScript) go on in timers after run() returns: run the
 * event loop or call waitForFinished(). Everything happens in the thread
 * that created the runtime.
 */
class Runtime : public QObject {
    Q_OBJECT

public:
    explicit Runtime(QObject* parent = nullptr);
    virtual ~Runtime() override;

    QJSEngine* jsEngine() const;
    Engine& engine();

    void setHost(const Host& host);
    const Host& host() const;
    void setOutput(std::function<void(Stream stream, const QString& text)> write);
    void setInput(std::function<std::optional<QString>()> readLine);

    /**
     * @brief Standard input from text: its lines, then the end of input
     */
    void setInputText(const QString& text);
    void setModuleLoader(std::function<std::optional<QString>(const QString& name)> readModule);
    void setCanvas(std::function<QJSValue()> canvas);

    /**
     * @brief See Engine::addModule: add modules before the first run
     */
    void addModule(const HostModule& module);
    void addModule(const QString& name, QObject* object, bool global = true);

    /**
     * @brief Limit of one continuous run of code (a run or a timer
     * callback); 0 - no limit (default). A program over the limit is
     * interrupted: Status::Interrupted.
     */
    void setTimeLimit(int milliseconds);
    int timeLimit() const;

    /**
     * @brief Loads a language ahead of the first run (outside the time
     * limit); see Engine::load
     */
    QString load(const QString& language);

    Result run(const QString& language, const QString& code, const QString& unit = QString());

    /**
     * @brief Timers are waiting: a program goes on after its run
     */
    bool isActive() const;

    /**
     * @brief Processes events until no timers are left or the time is out
     * (-1 - no timeout)
     * @return True if nothing is left to run
     */
    bool waitForFinished(int timeoutMs = -1);

    /**
     * @brief Cancels the timers: programs that wait for time end
     */
    void stop();

    /**
     * @brief Interrupts running code; may be called from any thread
     */
    void interrupt();

    /**
     * @brief Forgets everything: a new engine with the same host, modules
     * and limits (QObject modules must still be alive)
     */
    void reset();

signals:
    void activeChanged(bool active);

private:
    struct Private;
    friend class TimerHost;
    const std::unique_ptr<Private> d;

    void createEngine();
    void destroyEngine();
    int startTimer(const QJSValue& callback, int milliseconds, bool repeat, const QJSValueList& arguments);
    void stopTimer(int id);
    void onTimer(int id);
    void updateActivity();
};

} // namespace v4script

#endif // V4SCRIPT_RUNTIME_HPP
