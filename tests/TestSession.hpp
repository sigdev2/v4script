#ifndef V4SCRIPT_TESTSESSION_HPP
#define V4SCRIPT_TESTSESSION_HPP

#include "v4script/ImageCanvas.hpp"
#include "v4script/Runtime.hpp"

#include <QFile>
#include <QHash>
#include <QJSEngine>
#include <QStringList>

#include <array>

/**
 * @brief A runtime as the tests use it: output in lines (standard error with
 * "!", warnings with "?"), standard input from a list, modules from a map,
 * an ImageCanvas and the host module "app" (tests/app-module.js).
 */
class TestSession {
public:
    struct Run {
        v4script::Result result;
        QStringList output;

        // What a person would see: the output lines and the value.
        QString getSeen() const
        {
            QStringList seen = output;
            if (!result.value.isEmpty()) {
                seen.append(result.value);
            }
            return seen.join('\n');
        }
    };

    // The module "app" with the object and functions of tests/app-module.js.
    static v4script::HostModule makeAppModule(QJSEngine* engine)
    {
        QFile file(":/tests/app-module.js");
        if (!file.open(QIODevice::ReadOnly)) {
            qFatal("app-module.js is missing from the resources");
        }
        const QJSValue spec = engine->evaluate(QString::fromUtf8(file.readAll()), "app-module.js").call();
        v4script::HostModule module;
        module.name = spec.property("name").toString();
        module.object = spec.property("object");
        module.global = spec.property("global").toBool();
        const QJSValue functions = spec.property("functions");
        const int count = functions.property("length").toInt();
        for (int index = 0; index < count; ++index) {
            const QJSValue item = functions.property(static_cast<quint32>(index));
            QStringList parameters;
            const QJSValue list = item.property("parameters");
            for (int number = 0; number < list.property("length").toInt(); ++number) {
                const QJSValue parameter = list.property(static_cast<quint32>(number));
                parameters.append(
                    parameter.property("type").toString() + " " + parameter.property("name").toString() +
                    (parameter.property("optional").toBool() ? "?" : ""));
            }
            const QString signature = item.property("result").toString() + " " + item.property("name").toString() +
                (item.property("getter").toBool() ? QString() : "(" + parameters.join(", ") + ")");
            module.functions.append(v4script::HostFunction::parse(signature));
        }
        return module;
    }

    explicit TestSession()
    {
        runtime.setOutput([this](v4script::Stream stream, const QString& text) { write(stream, text); });
        runtime.setInput([this]() -> std::optional<QString> {
            if (input.isEmpty()) {
                return std::nullopt;
            }
            return input.takeFirst();
        });
        runtime.setModuleLoader([this](const QString& name) -> std::optional<QString> {
            const auto found = files.constFind(name);
            if (found == files.constEnd()) {
                return std::nullopt;
            }
            return *found;
        });
        runtime.setCanvas([this]() { return canvas.jsValue(runtime.jsEngine()); });
        v4script::Host host = runtime.host();
        host.clear = [this]() { ++clearCount; };
        runtime.setHost(host);
        runtime.addModule(makeAppModule(runtime.jsEngine()));
    }

    v4script::Runtime& getRuntime()
    {
        return runtime;
    }

    v4script::ImageCanvas& getCanvas()
    {
        return canvas;
    }

    // A module or data file that programs read by name.
    void setFile(const QString& name, const QString& text)
    {
        files[name] = text;
    }

    // Standard input: these lines, then the end of input.
    void setInput(const QStringList& input)
    {
        this->input = input;
    }

    int getClearCount() const
    {
        return clearCount;
    }

    Run run(const QString& language, const QString& code, const QString& unit = "first")
    {
        lines.clear();
        Run run;
        run.result = runtime.run(language, code, unit);
        flush();
        run.output = lines;
        lines.clear();
        return run;
    }

    // Output that came after a run (timers), with the rest of the lines.
    QStringList takeLines()
    {
        flush();
        QStringList taken = lines;
        lines.clear();
        return taken;
    }

private:
    v4script::ImageCanvas canvas;
    QHash<QString, QString> files;
    QStringList input;
    QStringList lines;
    // Unfinished lines by Stream; std::array: the number of streams is fixed.
    std::array<QString, 3> pending;
    int clearCount = 0;
    // The last field: it goes first, before everything its callbacks use.
    v4script::Runtime runtime;

    static QString prefix(v4script::Stream stream)
    {
        switch (stream) {
        case v4script::Stream::Error:
            return "!";
        case v4script::Stream::Warning:
            return "?";
        case v4script::Stream::Output:
            break;
        }
        return {};
    }

    void write(v4script::Stream stream, const QString& text)
    {
        const int index = static_cast<int>(stream);
        pending[index] += text;
        qsizetype end = pending[index].indexOf('\n');
        while (end >= 0) {
            lines.append(prefix(stream) + pending[index].left(end));
            pending[index] = pending[index].mid(end + 1);
            end = pending[index].indexOf('\n');
        }
    }

    void flush()
    {
        for (int index = 0; index < 3; ++index) {
            if (!pending[index].isEmpty()) {
                lines.append(prefix(static_cast<v4script::Stream>(index)) + pending[index]);
                pending[index].clear();
            }
        }
    }
};

#endif // V4SCRIPT_TESTSESSION_HPP
