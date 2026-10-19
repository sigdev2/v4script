#include "v4script/Runtime.hpp"

#include "Watchdog.hpp"

#include <QCoreApplication>
#include <QElapsedTimer>
#include <QEventLoop>
#include <QHash>
#include <QJSEngine>
#include <QPointer>
#include <QTimer>

namespace v4script {

namespace {

// Timers of the global object; callbacks go to the runtime (TimerHost).
const char* const TIMERS_SCRIPT = R"((function (timers, global) {
    'use strict';
    function start(callback, delay, repeat, callArguments) {
        if (typeof callback !== 'function')
            throw new TypeError('A function is expected');
        return timers.start(callback, Number(delay) || 0, repeat, Array.prototype.slice.call(callArguments, 2));
    }
    global.setTimeout = function (callback, delay) { return start(callback, delay, false, arguments); };
    global.setInterval = function (callback, delay) { return start(callback, delay, true, arguments); };
    global.clearTimeout = function (id) {
        if (typeof id === 'number')
            timers.stop(id);
    };
    global.clearInterval = global.clearTimeout;
}))";

struct QObjectModule {
    QString name;
    QPointer<QObject> object;
    bool global = true;
};

struct Timer {
    QTimer* timer = nullptr;
    QJSValue callback;
    QJSValueList arguments;
    QString unit;
    bool repeat = false;
};

} // namespace

/**
 * @brief setTimeout and setInterval of the runtime's engine
 */
class TimerHost : public QObject {
    Q_OBJECT

public:
    explicit TimerHost(Runtime* runtime) :
            runtime(runtime)
    {
    }

    Q_INVOKABLE int start(const QJSValue& callback, int milliseconds, bool repeat, const QJSValue& arguments)
    {
        QJSValueList list;
        const int length = arguments.property("length").toInt();
        for (int index = 0; index < length; ++index) {
            list.append(arguments.property(static_cast<quint32>(index)));
        }
        return runtime->startTimer(callback, milliseconds, repeat, list);
    }

    Q_INVOKABLE void stop(int id)
    {
        runtime->stopTimer(id);
    }

private:
    Runtime* const runtime;
};

struct Runtime::Private {
    QJSEngine* engine = nullptr;
    std::unique_ptr<Engine> languages;
    TimerHost* timerHost = nullptr;
    Host host;
    // Modules in the order they were added: either a QObject (wrapped again
    // by reset()) or a ready module.
    QList<std::pair<QObjectModule, HostModule>> modules;
    internal::Watchdog watchdog;
    int timeLimit = 0;
    QHash<int, Timer> timers;
    int nextTimerId = 1;
    bool active = false;
};

Runtime::Runtime(QObject* parent) :
        QObject(parent),
        d(std::make_unique<Private>())
{
    createEngine();
}

Runtime::~Runtime()
{
    blockSignals(true);
    destroyEngine();
}

QJSEngine* Runtime::jsEngine() const
{
    return d->engine;
}

Engine& Runtime::engine()
{
    return *d->languages;
}

void Runtime::setHost(const Host& host)
{
    d->host = host;
    d->languages->setHost(host);
}

const Host& Runtime::host() const
{
    return d->host;
}

void Runtime::setOutput(std::function<void(Stream stream, const QString& text)> write)
{
    d->host.write = std::move(write);
    d->languages->setHost(d->host);
}

void Runtime::setInput(std::function<std::optional<QString>()> readLine)
{
    d->host.readLine = std::move(readLine);
    d->languages->setHost(d->host);
}

void Runtime::setInputText(const QString& text)
{
    // Shared with the callback, not kept in the runtime: a copy of the host
    // may outlive it.
    const auto lines = std::make_shared<QStringList>(text.split('\n'));
    // "a\nb\n" is two lines, not two lines and an empty one.
    if (text.endsWith('\n')) {
        lines->removeLast();
    }
    if (text.isEmpty()) {
        lines->clear();
    }
    setInput([lines]() -> std::optional<QString> {
        if (lines->isEmpty()) {
            return std::nullopt;
        }
        QString line = lines->takeFirst();
        if (line.endsWith('\r')) {
            line.chop(1);
        }
        return line;
    });
}

void Runtime::setModuleLoader(std::function<std::optional<QString>(const QString& name)> readModule)
{
    d->host.readModule = std::move(readModule);
    d->languages->setHost(d->host);
}

void Runtime::setCanvas(std::function<QJSValue()> canvas)
{
    d->host.canvas = std::move(canvas);
    d->languages->setHost(d->host);
}

void Runtime::addModule(const HostModule& module)
{
    QObjectModule wrapped;
    wrapped.name = module.name;
    wrapped.object = module.object.toQObject();
    wrapped.global = module.global;
    d->modules.append({ wrapped, module });
    d->languages->addModule(module);
}

void Runtime::addModule(const QString& name, QObject* object, bool global)
{
    const HostModule module = HostModule::fromQObject(d->engine, name, object, global);
    d->modules.append({ QObjectModule { name, object, global }, module });
    d->languages->addModule(module);
}

void Runtime::setTimeLimit(int milliseconds)
{
    d->timeLimit = qMax(0, milliseconds);
}

int Runtime::timeLimit() const
{
    return d->timeLimit;
}

QString Runtime::load(const QString& language)
{
    return language == "javascript" ? QString() : d->languages->load(language);
}

Result Runtime::run(const QString& language, const QString& code, const QString& unit)
{
    d->engine->setInterrupted(false);
    // Loading a language is not the program's time.
    const QString error = load(language);
    if (!error.isEmpty()) {
        Result result;
        result.status = Status::Failed;
        result.error = error;
        return result;
    }
    d->watchdog.arm(d->engine, d->timeLimit);
    Result result = d->languages->run(language, code, unit);
    const bool limitReached = d->watchdog.disarm();
    if (d->engine->isInterrupted()) {
        d->engine->setInterrupted(false);
        d->languages->flush();
        result.status = Status::Interrupted;
        result.error =
            limitReached ? QString("The code ran longer than %1 ms").arg(d->timeLimit) : QString("Interrupted");
    }
    updateActivity();
    return result;
}

bool Runtime::isActive() const
{
    return d->active;
}

bool Runtime::waitForFinished(int timeoutMs)
{
    QElapsedTimer elapsed;
    elapsed.start();
    while (d->active) {
        const qint64 left = timeoutMs < 0 ? -1 : timeoutMs - elapsed.elapsed();
        if (timeoutMs >= 0 && left <= 0) {
            break;
        }
        QEventLoop loop;
        connect(this, &Runtime::activeChanged, &loop, [&loop](bool active) {
            if (!active) {
                loop.quit();
            }
        });
        if (left >= 0) {
            QTimer::singleShot(static_cast<int>(left), &loop, &QEventLoop::quit);
        }
        loop.exec();
    }
    return !d->active;
}

void Runtime::stop()
{
    const QList<int> ids = d->timers.keys();
    for (const int id : ids) {
        stopTimer(id);
    }
    updateActivity();
}

void Runtime::interrupt()
{
    d->engine->setInterrupted(true);
}

void Runtime::reset()
{
    destroyEngine();
    createEngine();
}

void Runtime::createEngine()
{
    d->engine = new QJSEngine(this);
    d->languages = std::make_unique<Engine>(d->engine, d->host);
    d->languages->installConsole();

    d->timerHost = new TimerHost(this);
    QJSEngine::setObjectOwnership(d->timerHost, QJSEngine::CppOwnership);
    const QJSValue installer = d->engine->evaluate(TIMERS_SCRIPT);
    QJSValue(installer).call({ d->engine->newQObject(d->timerHost), d->engine->globalObject() });

    for (auto& [wrapped, module] : d->modules) {
        if (wrapped.object != nullptr) {
            // The functions stay, the object is wrapped for the new engine.
            QJSEngine::setObjectOwnership(wrapped.object, QJSEngine::CppOwnership);
            module.object = d->engine->newQObject(wrapped.object);
        }
        d->languages->addModule(module);
    }
}

void Runtime::destroyEngine()
{
    const QList<int> ids = d->timers.keys();
    for (const int id : ids) {
        stopTimer(id);
    }
    d->languages.reset();
    // Values of the old engine must go before it. Modules over a QObject are
    // wrapped again by createEngine(); JavaScript objects die with the engine.
    for (qsizetype index = d->modules.size() - 1; index >= 0; --index) {
        auto& [wrapped, module] = d->modules[index];
        if (wrapped.object != nullptr) {
            module.object = QJSValue();
        } else {
            d->modules.removeAt(index);
        }
    }
    // Deleted at once, not with deleteLater(): reset() creates a new engine
    // right away, and without an event loop (a console application, a test)
    // old engines with their languages would pile up.
    delete d->engine;
    d->engine = nullptr;
    delete d->timerHost;
    d->timerHost = nullptr;
    updateActivity();
}

int Runtime::startTimer(const QJSValue& callback, int milliseconds, bool repeat, const QJSValueList& arguments)
{
    const int id = d->nextTimerId++;
    Timer timer;
    timer.timer = new QTimer(this);
    timer.timer->setSingleShot(!repeat);
    timer.timer->setInterval(qMax(0, milliseconds));
    timer.callback = callback;
    timer.arguments = arguments;
    timer.unit = d->languages->currentUnit();
    timer.repeat = repeat;
    connect(timer.timer, &QTimer::timeout, this, [this, id]() { onTimer(id); });
    timer.timer->start();
    d->timers.insert(id, timer);
    updateActivity();
    return id;
}

void Runtime::stopTimer(int id)
{
    const auto found = d->timers.find(id);
    if (found == d->timers.end()) {
        return;
    }
    found->timer->stop();
    found->timer->deleteLater();
    d->timers.erase(found);
    updateActivity();
}

void Runtime::onTimer(int id)
{
    const auto found = d->timers.constFind(id);
    if (found == d->timers.constEnd()) {
        return;
    }
    const Timer timer = *found;
    // A finished single timer goes before its callback, quietly: the
    // callback may start the next one, and the program is active till then.
    if (!timer.repeat) {
        found->timer->deleteLater();
        d->timers.remove(id);
    }
    d->engine->setInterrupted(false);
    d->watchdog.arm(d->engine, d->timeLimit);
    const Result result = d->languages->call(timer.callback, timer.arguments, timer.unit);
    const bool limitReached = d->watchdog.disarm();
    if (d->engine->isInterrupted()) {
        // A callback over the limit ends the program: its other timers would
        // come back to the same place.
        d->engine->setInterrupted(false);
        d->languages->flush();
        stop();
        if (d->host.write != nullptr) {
            d->host.write(
                Stream::Error,
                limitReached ? QString("The code ran longer than %1 ms\n").arg(d->timeLimit)
                             : QString("Interrupted\n"));
        }
    } else if (result.status == Status::Failed && d->host.write != nullptr) {
        d->languages->flush();
        d->host.write(Stream::Error, result.describeError() + "\n");
    }
    updateActivity();
}

void Runtime::updateActivity()
{
    const bool active = !d->timers.isEmpty();
    if (active != d->active) {
        d->active = active;
        emit activeChanged(active);
    }
}

} // namespace v4script

#include "Runtime.moc"
