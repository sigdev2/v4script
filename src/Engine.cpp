#include "v4script/Engine.hpp"
#include "v4script/Languages.hpp"

#include "HostBridge.hpp"
#include "Internal.hpp"

#include <QElapsedTimer>
#include <QHash>
#include <QJSEngine>
#include <QSet>
#include <QUrl>

namespace v4script {

using internal::JS_PREFIX;

namespace {

// Code that translators build runs under file:///v4script/translated/<name>:
// the host layer finds the chunk of an error by this part of the stack.
QString translatedFileName(const QString& name)
{
    return "/v4script/translated/" + QString::fromUtf8(QUrl::toPercentEncoding(name));
}

QString unitFileName(const QString& unit)
{
    return "/v4script/units/" + QString::fromUtf8(QUrl::toPercentEncoding(unit.isEmpty() ? "main" : unit)) + ".js";
}

QJSValue toJsModule(QJSEngine* engine, const HostModule& module)
{
    QJSValue result = engine->newObject();
    result.setProperty("name", module.name);
    result.setProperty("object", module.object);
    result.setProperty("global", module.global);
    QJSValue functions = engine->newArray(static_cast<uint>(module.functions.size()));
    for (qsizetype index = 0; index < module.functions.size(); ++index) {
        const HostFunction& function = module.functions[index];
        QJSValue item = engine->newObject();
        item.setProperty("name", function.name);
        item.setProperty("result", typeName(function.result));
        item.setProperty("getter", function.getter);
        QJSValue parameters = engine->newArray(static_cast<uint>(function.parameters.size()));
        for (qsizetype number = 0; number < function.parameters.size(); ++number) {
            const Parameter& parameter = function.parameters[number];
            QJSValue entry = engine->newObject();
            entry.setProperty("name", parameter.name);
            entry.setProperty("type", typeName(parameter.type));
            entry.setProperty("optional", parameter.optional);
            parameters.setProperty(static_cast<quint32>(number), entry);
        }
        item.setProperty("parameters", parameters);
        functions.setProperty(static_cast<quint32>(index), item);
    }
    result.setProperty("functions", functions);
    return result;
}

} // namespace

struct Engine::Private {
    QJSEngine* engine = nullptr;
    Host host;
    QList<HostModule> modules;
    std::unique_ptr<HostBridge> bridge;
    QJSValue jsHost;
    QJSValue jsRun;
    QJSValue jsInstallConsole;
    QJSValue jsExposeModule;
    // Adapters of the languages loaded into this engine.
    QHash<QString, QJSValue> runners;
    // Files already evaluated: the translator core is shared by languages.
    QSet<QString> loadedFiles;
    QStringList units;
};

Engine::Engine(QJSEngine* engine, Host host) :
        d(std::make_unique<Private>())
{
    d->engine = engine;
    d->host = std::move(host);
    d->bridge = std::make_unique<HostBridge>(this);
    QJSEngine::setObjectOwnership(d->bridge.get(), QJSEngine::CppOwnership);

    internal::installCompat(engine);
    const QString path = QString(JS_PREFIX) + "host/host.js";
    const QJSValue factory = engine->evaluate(internal::loadResource(path), path);
    const QJSValue layer =
        factory.isCallable() ? factory.call({ engine->newQObject(d->bridge.get()), engine->globalObject() }) : factory;
    if (layer.isError()) {
        qWarning("v4script: the host layer failed: %s", qPrintable(layer.toString()));
        return;
    }
    d->jsHost = layer.property("host");
    d->jsRun = layer.property("run");
    d->jsInstallConsole = layer.property("installConsole");
    d->jsExposeModule = layer.property("exposeModule");
}

Engine::~Engine() = default;

QJSEngine* Engine::jsEngine() const
{
    return d->engine;
}

void Engine::setHost(Host host)
{
    d->host = std::move(host);
}

const Host& Engine::host() const
{
    return d->host;
}

void Engine::addModule(const HostModule& module)
{
    bool replaced = false;
    for (HostModule& known : d->modules) {
        if (known.name == module.name) {
            known = module;
            replaced = true;
        }
    }
    if (!replaced) {
        d->modules.append(module);
    }
    // JavaScript code sees the module at once: app.greet(), greet().
    if (d->jsExposeModule.isCallable()) {
        d->jsExposeModule.call({ toJsModule(d->engine, module) });
    }
}

QList<HostModule> Engine::modules() const
{
    return d->modules;
}

QString Engine::load(const QString& language)
{
    if (d->runners.contains(language)) {
        return {};
    }
    const std::optional<LanguageInfo> info = findLanguage(language);
    QString adapter;
    const QStringList files = info.has_value() ? internal::languageFiles(language, &adapter) : QStringList();
    if (!info.has_value() || files.isEmpty() || adapter.isEmpty()) {
        return QString("Unknown language: %1").arg(language);
    }
    if (d->jsHost.isUndefined()) {
        return QString("Cannot load the %1 interpreter: the host layer is broken").arg(info->name);
    }
    for (const QString& file : files) {
        if (d->loadedFiles.contains(file)) {
            continue;
        }
        const QString path = JS_PREFIX + file;
        QStringList stackTrace;
        const QJSValue value = internal::evaluateQuietly(d->engine, internal::loadResource(path), path, &stackTrace);
        if (value.isError() || !stackTrace.isEmpty()) {
            return QString("Cannot load the %1 interpreter: %2").arg(info->name, value.toString());
        }
        d->loadedFiles.insert(file);
    }
    const QString adapterPath = JS_PREFIX + adapter;
    const QJSValue factory =
        internal::evaluateQuietly(d->engine, internal::loadResource(adapterPath), adapterPath, nullptr);
    d->units.append(QString());
    const QJSValue runner = factory.isCallable() ? factory.call({ d->jsHost }) : factory;
    d->units.removeLast();
    if (runner.isError() || !runner.property("run").isCallable()) {
        return QString("Cannot load the %1 interpreter: %2").arg(info->name, runner.toString());
    }
    d->runners.insert(language, runner);
    return {};
}

bool Engine::isLoaded(const QString& language) const
{
    return d->runners.contains(language);
}

Result Engine::run(const QString& language, const QString& code, const QString& unit)
{
    // Interpreters compile code while they run (Skulpt imports, Perl
    // eval): hints of the JavaScript compiler stay quiet then too.
    const internal::QuietCompiler quiet;
    QElapsedTimer timer;
    timer.start();
    Result result;
    if (language == "javascript") {
        d->units.append(unit);
        QStringList stackTrace;
        const QJSValue value = d->engine->evaluate(code, unitFileName(unit), 1, &stackTrace);
        d->units.removeLast();
        // Anything can be thrown, not only errors: then only the stack tells.
        if (!stackTrace.isEmpty() || value.isError()) {
            result.status = Status::Failed;
            result.error = value.isError() ? value.toString() : d->bridge->format(value);
            result.errorLine = value.property("lineNumber").toInt();
        } else if (!value.isUndefined()) {
            result.value = d->bridge->format(value);
        }
    } else {
        const QString error = load(language);
        if (!error.isEmpty()) {
            result.status = Status::Failed;
            result.error = error;
        } else {
            d->units.append(unit);
            const QJSValue outcome = d->jsRun.call({ d->runners.value(language), code });
            d->units.removeLast();
            if (outcome.isError()) {
                result.status = Status::Failed;
                result.error = outcome.toString();
                result.errorLine = outcome.property("lineNumber").toInt();
            } else if (outcome.hasProperty("error")) {
                result.status = Status::Failed;
                result.error = outcome.property("error").toString();
                result.errorLine = outcome.property("line").toInt();
                result.errorSource = outcome.property("source").toString();
            } else {
                result.value = outcome.property("value").toString();
            }
        }
    }
    if (d->engine->isInterrupted()) {
        result.status = Status::Interrupted;
        result.error = "Interrupted";
        result.errorLine = 0;
        result.errorSource.clear();
        result.value.clear();
    }
    result.elapsedMs = timer.elapsed();
    return result;
}

Result Engine::call(const QJSValue& function, const QJSValueList& arguments, const QString& unit)
{
    const internal::QuietCompiler quiet;
    QElapsedTimer timer;
    timer.start();
    Result result;
    d->units.append(unit);
    QJSValue target = function;
    const QJSValue value = target.call(arguments);
    d->units.removeLast();
    if (value.isError()) {
        result.status = Status::Failed;
        result.error = value.toString();
        result.errorLine = value.property("lineNumber").toInt();
    } else if (!value.isUndefined()) {
        result.value = d->bridge->format(value);
    }
    if (d->engine->isInterrupted()) {
        result.status = Status::Interrupted;
        result.error = "Interrupted";
        result.errorLine = 0;
        result.value.clear();
    }
    result.elapsedMs = timer.elapsed();
    return result;
}

QString Engine::currentUnit() const
{
    return d->units.isEmpty() ? QString() : d->units.last();
}

void Engine::flush()
{
    QJSValue flush = d->jsHost.property("flush");
    if (flush.isCallable()) {
        flush.call();
    }
}

void Engine::installConsole()
{
    if (d->jsInstallConsole.isCallable()) {
        d->jsInstallConsole.call();
    }
}

// --- HostBridge

HostBridge::HostBridge(Engine* engine) :
        engine(engine)
{
}

QString HostBridge::getVersion() const
{
    return v4script::version();
}

void HostBridge::write(int stream, const QString& text)
{
    const Host& host = engine->d->host;
    if (host.write != nullptr) {
        host.write(static_cast<Stream>(qBound(0, stream, static_cast<int>(Stream::Warning))), text);
    }
}

QJSValue HostBridge::readLine()
{
    const Host& host = engine->d->host;
    if (host.readLine == nullptr) {
        return QJSValue(QJSValue::NullValue);
    }
    const std::optional<QString> line = host.readLine();
    return line.has_value() ? QJSValue(*line) : QJSValue(QJSValue::NullValue);
}

QJSValue HostBridge::readModule(const QString& name)
{
    const Host& host = engine->d->host;
    if (host.readModule == nullptr) {
        return QJSValue(QJSValue::NullValue);
    }
    const std::optional<QString> text = host.readModule(name);
    return text.has_value() ? QJSValue(*text) : QJSValue(QJSValue::NullValue);
}

QJSValue HostBridge::canvas()
{
    const Host& host = engine->d->host;
    if (host.canvas == nullptr) {
        return QJSValue(QJSValue::NullValue);
    }
    const QJSValue canvas = host.canvas();
    return canvas.isUndefined() ? QJSValue(QJSValue::NullValue) : canvas;
}

void HostBridge::clear()
{
    const Host& host = engine->d->host;
    if (host.clear != nullptr) {
        host.clear();
    }
}

QString HostBridge::unit() const
{
    return engine->currentUnit();
}

QJSValue HostBridge::modules()
{
    QJSEngine* jsEngine = engine->d->engine;
    const QList<HostModule>& modules = engine->d->modules;
    QJSValue list = jsEngine->newArray(static_cast<uint>(modules.size()));
    for (qsizetype index = 0; index < modules.size(); ++index) {
        list.setProperty(static_cast<quint32>(index), toJsModule(jsEngine, modules[index]));
    }
    return list;
}

bool HostBridge::hasFormat() const
{
    return engine->d->host.format != nullptr;
}

QString HostBridge::format(const QJSValue& value)
{
    const Host& host = engine->d->host;
    if (host.format != nullptr) {
        return host.format(value);
    }
    const QJSValue formatter = engine->d->jsHost.property("format");
    return formatter.isCallable() ? QJSValue(formatter).call({ value }).toString() : value.toString();
}

QJSValue HostBridge::compile(const QString& name, const QString& code)
{
    QJSEngine* jsEngine = engine->d->engine;
    QJSValue result = jsEngine->newObject();
    const QJSValue value = internal::evaluateQuietly(jsEngine, code, translatedFileName(name), nullptr);
    if (value.isError()) {
        result.setProperty("error", value.toString());
        result.setProperty("line", value.property("lineNumber"));
    } else {
        result.setProperty("value", value);
    }
    return result;
}

} // namespace v4script
