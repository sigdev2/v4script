// v4run - runs a program in any language of v4script from the command line:
//
//     v4run hello.py
//     v4run --language basic game.txt < answers.txt
//     v4run --eval "print(6 * 7)" --language python
//     v4run --list
//
// Standard input goes to the program, modules come from the directory of
// the file. Exit code: 0 - done, 1 - error of the program, 2 - usage,
// 3 - over the time limit.

#include <v4script/V4Script.hpp>

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QDir>
#include <QFile>
#include <QFileInfo>

#include <cstdio>
#include <iostream>
#include <string>

namespace {

void writeText(FILE* stream, const QString& text)
{
    const QByteArray bytes = text.toUtf8();
    std::fwrite(bytes.constData(), 1, static_cast<size_t>(bytes.size()), stream);
    std::fflush(stream);
}

int listLanguages()
{
    writeText(stdout, QString("v4script %1\n").arg(v4script::version()));
    const QList<v4script::LanguageInfo> languages = v4script::languages();
    for (const v4script::LanguageInfo& language : languages) {
        writeText(
            stdout,
            QString("%1  %2 %3 - %4 (%5 %6), .%7\n")
                .arg(language.id, -7)
                .arg(
                    language.name,
                    language.version,
                    language.dialect,
                    language.implementation,
                    language.implementationVersion,
                    language.extensions.join(", .")));
    }
    return 0;
}

} // namespace

int main(int argc, char* argv[])
{
    // Deep recursion in programs: before the first engine.
    v4script::prepareProcess();
    QCoreApplication application(argc, argv);
    QCoreApplication::setApplicationName("v4run");
    QCoreApplication::setApplicationVersion(v4script::version());

    QCommandLineParser parser;
    parser.setApplicationDescription("Runs a program in a language of v4script.");
    parser.addHelpOption();
    parser.addVersionOption();
    const QCommandLineOption languageOption({ "l", "language" }, "Language id (default: by the file extension).", "id");
    const QCommandLineOption evalOption({ "e", "eval" }, "Code to run instead of a file.", "code");
    const QCommandLineOption limitOption({ "t", "time-limit" }, "Limit of one continuous run, ms.", "ms");
    const QCommandLineOption listOption("list", "List the languages with their versions.");
    parser.addOptions({ languageOption, evalOption, limitOption, listOption });
    parser.addPositionalArgument("file", "Program to run.");
    parser.process(application);

    if (parser.isSet(listOption)) {
        return listLanguages();
    }

    QString code;
    QString unit = "main";
    QDir directory = QDir::current();
    QString language = parser.value(languageOption);
    if (parser.isSet(evalOption)) {
        code = parser.value(evalOption);
    } else if (parser.positionalArguments().size() == 1) {
        const QString path = parser.positionalArguments().first();
        QFile file(path);
        if (!file.open(QIODevice::ReadOnly)) {
            writeText(stderr, QString("v4run: cannot read %1\n").arg(path));
            return 2;
        }
        code = QString::fromUtf8(file.readAll());
        unit = QFileInfo(path).fileName();
        directory = QFileInfo(path).dir();
        if (language.isEmpty()) {
            const std::optional<v4script::LanguageInfo> found = v4script::findLanguageForFile(path);
            const QString javaScript = path.endsWith(".js") ? QString("javascript") : QString();
            language = found.has_value() ? found->id : javaScript;
        }
    } else {
        parser.showHelp(2);
    }
    if (language.isEmpty()) {
        writeText(stderr, "v4run: unknown language; use --language\n");
        return 2;
    }

    v4script::Runtime runtime;
    runtime.setOutput([](v4script::Stream stream, const QString& text) {
        writeText(stream == v4script::Stream::Output ? stdout : stderr, text);
    });
    runtime.setInput([]() -> std::optional<QString> {
        std::string line;
        if (!std::getline(std::cin, line)) {
            return std::nullopt;
        }
        return QString::fromStdString(line);
    });
    // Modules (import, #include, uses...) are files next to the program.
    runtime.setModuleLoader([directory](const QString& name) -> std::optional<QString> {
        QFile file(directory.filePath(name));
        if (QFileInfo(name).isAbsolute() || name.contains("..") || !file.open(QIODevice::ReadOnly)) {
            return std::nullopt;
        }
        return QString::fromUtf8(file.readAll());
    });
    runtime.setTimeLimit(parser.value(limitOption).toInt());

    const v4script::Result result = runtime.run(language, code, unit);
    if (!result.value.isEmpty()) {
        writeText(stdout, result.value + "\n");
    }
    // Programs that wait for time go on in timers.
    runtime.waitForFinished();
    switch (result.status) {
    case v4script::Status::Completed:
        return 0;
    case v4script::Status::Failed:
        writeText(stderr, result.describeError() + "\n");
        return 1;
    case v4script::Status::Interrupted:
        writeText(stderr, result.error + "\n");
        return 3;
    }
    return 0;
}
