#include "v4script/Languages.hpp"
#include "v4script/Version.hpp"

#include "Internal.hpp"

#include <QFile>
#include <QJSEngine>
#include <QJsonArray>
#include <QJsonDocument>
#include <QtGlobal>

#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
#include <sys/resource.h>

#include <algorithm>
#endif

namespace v4script {

namespace internal {

const char* const JS_PREFIX = ":/v4script/js/";

QString loadResource(const QString& path)
{
    QFile file(path);
    if (!file.open(QIODevice::ReadOnly)) {
        qWarning("v4script: cannot load the resource %s", qPrintable(path));
        return {};
    }
    return QString::fromUtf8(file.readAll());
}

const QJsonObject& manifest()
{
    static const QJsonObject loaded = []() {
        QFile file(":/v4script/languages.json");
        if (!file.open(QIODevice::ReadOnly)) {
            qWarning("v4script: the language manifest is missing from the resources");
            return QJsonObject();
        }
        return QJsonDocument::fromJson(file.readAll()).object();
    }();
    return loaded;
}

QStringList languageFiles(const QString& id, QString* adapter)
{
    const QJsonObject& root = manifest();
    const QJsonArray manifestLanguages = root["languages"].toArray();
    for (const QJsonValue& value : manifestLanguages) {
        const QJsonObject language = value.toObject();
        if (language["id"].toString() != id) {
            continue;
        }
        QStringList files;
        if (language["translator"].toBool()) {
            const QJsonArray coreFiles = root["translatorCore"].toArray();
            for (const QJsonValue& file : coreFiles) {
                files.append(file.toString());
            }
        }
        const QJsonArray ownFiles = language["files"].toArray();
        for (const QJsonValue& file : ownFiles) {
            files.append(file.toString());
        }
        if (adapter != nullptr) {
            *adapter = language["adapter"].toString();
        }
        return files;
    }
    return {};
}

void installCompat(QJSEngine* engine)
{
    const QString path = QString(JS_PREFIX) + "host/compat.js";
    const QJSValue factory = engine->evaluate(loadResource(path), path);
    const QJSValue result = factory.isCallable() ? factory.call({ engine->globalObject() }) : factory;
    if (result.isError()) {
        qWarning("v4script: the compatibility layer failed: %s", qPrintable(result.toString()));
    }
}

namespace {

int quietDepth = 0;
QtMessageHandler previousHandler = nullptr;

void quietHandler(QtMsgType type, const QMessageLogContext& context, const QString& text)
{
    if (context.category != nullptr && qstrcmp(context.category, "qt.qml.compiler") == 0) {
        return;
    }
    // Never null: without a handler of the application Qt returns its default one.
    if (previousHandler != nullptr) {
        previousHandler(type, context, text);
    }
}

} // namespace

// The handler of the application stays the next one in the chain; the
// filter is installed only while code of the library runs.
QuietCompiler::QuietCompiler()
{
    if (quietDepth++ == 0) {
        previousHandler = qInstallMessageHandler(quietHandler);
    }
}

QuietCompiler::~QuietCompiler()
{
    if (--quietDepth == 0) {
        qInstallMessageHandler(previousHandler);
        previousHandler = nullptr;
    }
}

QJSValue evaluateQuietly(QJSEngine* engine, const QString& code, const QString& fileName, QStringList* stackTrace)
{
    const QuietCompiler quiet;
    return engine->evaluate(code, fileName, 1, stackTrace);
}

} // namespace internal

namespace {

LanguageInfo toLanguageInfo(const QJsonObject& object)
{
    LanguageInfo info;
    info.id = object["id"].toString();
    info.name = object["name"].toString();
    info.version = object["version"].toString();
    info.dialect = object["dialect"].toString();
    info.implementation = object["implementation"].toString();
    info.implementationVersion = object["implementationVersion"].toString();
    info.license = object["license"].toString();
    const QJsonArray extensions = object["extensions"].toArray();
    for (const QJsonValue& extension : extensions) {
        info.extensions.append(extension.toString());
    }
    info.lineComment = object["lineComment"].toString();
    return info;
}

} // namespace

QList<LanguageInfo> languages()
{
    const QJsonArray manifestLanguages = internal::manifest()["languages"].toArray();
    QList<LanguageInfo> result;
    result.reserve(manifestLanguages.size());
    for (const QJsonValue& value : manifestLanguages) {
        result.append(toLanguageInfo(value.toObject()));
    }
    return result;
}

std::optional<LanguageInfo> findLanguage(const QString& id)
{
    const QJsonArray manifestLanguages = internal::manifest()["languages"].toArray();
    for (const QJsonValue& value : manifestLanguages) {
        if (value["id"].toString() == id) {
            return toLanguageInfo(value.toObject());
        }
    }
    return std::nullopt;
}

std::optional<LanguageInfo> findLanguageForFile(const QString& fileName)
{
    const qsizetype dot = fileName.lastIndexOf('.');
    const QString extension = (dot < 0 ? fileName : fileName.mid(dot + 1)).toLower();
    const QList<LanguageInfo> known = languages();
    for (const LanguageInfo& language : known) {
        if (language.extensions.contains(extension)) {
            return language;
        }
    }
    return std::nullopt;
}

QString version()
{
    return QStringLiteral(V4SCRIPT_VERSION_STRING);
}

void prepareProcess()
{
#if !defined(Q_OS_ANDROID)
    // V4 limits the call depth with a constant (640 on Windows) that it
    // reads from the environment once, when the first engine is created. A
    // 1 MB stack holds about 3000 calls; 10000 need the 16 MB main thread
    // stack: the build sets it on Windows, the limit below on Linux.
    if (qEnvironmentVariableIsEmpty("QV4_MAX_CALL_DEPTH")) {
        qputenv("QV4_MAX_CALL_DEPTH", QByteArray::number(MAX_CALL_DEPTH));
    }
#endif
#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
    // The main thread stack of Linux grows up to the soft RLIMIT_STACK.
    rlimit limit {};
    if (getrlimit(RLIMIT_STACK, &limit) == 0 && limit.rlim_cur != RLIM_INFINITY &&
        limit.rlim_cur < static_cast<rlim_t>(MAIN_STACK_SIZE))
    {
        limit.rlim_cur = limit.rlim_max == RLIM_INFINITY
            ? static_cast<rlim_t>(MAIN_STACK_SIZE)
            : std::min(limit.rlim_max, static_cast<rlim_t>(MAIN_STACK_SIZE));
        setrlimit(RLIMIT_STACK, &limit);
    }
#endif
}

} // namespace v4script
