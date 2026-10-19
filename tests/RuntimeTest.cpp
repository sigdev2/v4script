// The C++ API: versions, Runtime and Engine, output streams, input, host
// modules from signatures and from QObject, modules of the host, timers,
// the time limit, reset and ImageCanvas.

#include "TestSession.hpp"

#include "v4script/V4Script.hpp"

#include <QJSEngine>
#include <QTest>
#include <QThread>
#include <QTimer>

#include <memory>
#include <stdexcept>

using v4script::Status;
using v4script::Stream;

/**
 * @brief A module made of a QObject: methods, a default argument and a
 * property
 */
class Greeter : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString name READ getName CONSTANT)

public:
    QString getName() const
    {
        return "greeter";
    }

    int getCallCount() const
    {
        return callCount;
    }

    Q_INVOKABLE QString greet(const QString& who, const QString& greeting = "Hello")
    {
        ++callCount;
        return greeting + ", " + who + "!";
    }

    Q_INVOKABLE double half(double value) const
    {
        return value / 2;
    }

    Q_INVOKABLE bool isLong(const QString& text) const
    {
        return text.size() > 3;
    }

    Q_INVOKABLE QVariantList words(const QString& text) const
    {
        const QStringList textWords = text.split(' ', Qt::SkipEmptyParts);
        QVariantList list;
        list.reserve(textWords.size());
        for (const QString& word : textWords) {
            list.append(word);
        }
        return list;
    }

public slots:
    void reset()
    {
        callCount = 0;
    }

private:
    int callCount = 0;
};

class RuntimeTest : public QObject {
    Q_OBJECT

private slots:
    void initTestCase()
    {
        v4script::prepareProcess();
    }

    void versionIsKnown()
    {
        QCOMPARE(v4script::version(), QString(V4SCRIPT_VERSION_STRING));
        QCOMPARE(
            V4SCRIPT_VERSION,
            V4SCRIPT_VERSION_CHECK(V4SCRIPT_VERSION_MAJOR, V4SCRIPT_VERSION_MINOR, V4SCRIPT_VERSION_PATCH));
        QVERIFY(V4SCRIPT_VERSION >= V4SCRIPT_VERSION_CHECK(0, 1, 0));
        // Programs can see it too.
        v4script::Runtime runtime;
        QCOMPARE(runtime.run("javascript", "1 + 1").value, QString("2"));
    }

    void javaScriptRuns()
    {
        v4script::Runtime runtime;
        auto result = runtime.run("javascript", "var x = 6;\nx * 7");
        QCOMPARE(result.status, Status::Completed);
        QCOMPARE(result.value, QString("42"));
        QCOMPARE(runtime.run("javascript", "({ a: [1, 2] })").value, QString("{\"a\":[1,2]}"));
        QCOMPARE(runtime.run("javascript", "undefined").value, QString());

        result = runtime.run("javascript", "x = 1;\nnull.y;");
        QCOMPARE(result.status, Status::Failed);
        QCOMPARE(result.errorLine, 2);
        QVERIFY(result.error.startsWith("TypeError"));
        QCOMPARE(result.describeError(), result.error + " (line 2)");

        result = runtime.run("cobol", "DISPLAY 'x'.");
        QCOMPARE(result.status, Status::Failed);
        QCOMPARE(result.error, QString("Unknown language: cobol"));
    }

    void outputGoesToStreams()
    {
        QList<std::pair<Stream, QString>> chunks;
        v4script::Runtime runtime;
        runtime.setOutput([&chunks](Stream stream, const QString& text) { chunks.append({ stream, text }); });

        QVERIFY(runtime.run("python", "import sys\nprint('a', end='')\nprint('b')\nprint('c', end='')").isOk());
        // Whole lines while the program runs, the rest at the end.
        QCOMPARE(chunks.size(), 2);
        QCOMPARE(chunks[0], std::make_pair(Stream::Output, QString("ab\n")));
        QCOMPARE(chunks[1], std::make_pair(Stream::Output, QString("c")));

        chunks.clear();
        QVERIFY(runtime.run("go", "fmt.Fprintln(os.Stderr, \"oops\")\nfmt.Println(\"fine\")").isOk());
        QVERIFY(chunks.contains(std::make_pair(Stream::Error, QString("oops\n"))));
        QVERIFY(chunks.contains(std::make_pair(Stream::Output, QString("fine\n"))));

        chunks.clear();
        QVERIFY(runtime.run("php", "include 'missing.php';").isOk());
        QVERIFY(!chunks.isEmpty());
        for (const auto& chunk : chunks) {
            QVERIFY2(chunk.first == Stream::Warning, qPrintable(chunk.second));
        }

        chunks.clear();
        QVERIFY(runtime.run("javascript", "console.log('x', { y: 1 });\nconsole.error('e');\nprint(2)").isOk());
        QCOMPARE(chunks.size(), 3);
        QCOMPARE(chunks[0], std::make_pair(Stream::Output, QString("x {\"y\":1}\n")));
        QCOMPARE(chunks[1], std::make_pair(Stream::Error, QString("e\n")));
    }

    void formatOfTheHost()
    {
        v4script::Runtime runtime;
        v4script::Host host;
        host.format = [](const QJSValue& value) { return "<" + value.toString() + ">"; };
        runtime.setHost(host);
        QCOMPARE(runtime.run("javascript", "[1, 2]").value, QString("<1,2>"));
        QCOMPARE(runtime.run("c", "js_value v = js_from_int(7);\nprintf(\"%s\\n\", js_string(v));").isOk(), true);
    }

    void inputIsRead()
    {
        TestSession session;
        session.setInput({ "Ann", "3 4" });
        auto run =
            session.run("python", "name = input('Name? ')\na, b = map(int, input().split())\nprint(name, a + b)");
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QCOMPARE(run.output, (QStringList { "Name? Ann 7" }));

        // The end of input.
        run = session.run("python", "try:\n    input()\nexcept EOFError:\n    print('eof')");
        QCOMPARE(run.output, (QStringList { "eof" }));

        // Standard input is one for all languages of the engine.
        session.setInput({ "first", "second" });
        QCOMPARE(session.run("lua", "print(io.read())").output, (QStringList { "first" }));
        run = session.run("c", "char line[32];\nfgets(line, sizeof line, stdin);\nprintf(\"[%s]\", line);");
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QCOMPARE(run.output, (QStringList { "[second", "]" }));

        QStringList output;
        v4script::Runtime runtime;
        runtime.setInputText("x\ny\n");
        runtime.setOutput([&output](Stream, const QString& text) { output.append(text); });
        QVERIFY(runtime.run("go", "s := bufio.NewScanner(os.Stdin)\nfor s.Scan() { fmt.Print(s.Text()) }").isOk());
        QCOMPARE(output.join(""), QString("xy"));
    }

    void signaturesAreParsed()
    {
        auto function = v4script::HostFunction::parse("value createTable(string title, value options?)");
        QCOMPARE(function.name, QString("createTable"));
        QCOMPARE(function.result, v4script::Type::Value);
        QCOMPARE(function.parameters.size(), 2);
        QCOMPARE(function.parameters[0].type, v4script::Type::String);
        QVERIFY(!function.parameters[0].optional);
        QVERIFY(function.parameters[1].optional);
        QVERIFY(!function.getter);
        QCOMPARE(function.toSignature(), QString("value createTable(string title, value options?)"));

        function = v4script::HostFunction::parse("int counter");
        QVERIFY(function.getter);
        QCOMPARE(function.result, v4script::Type::Integer);
        QCOMPARE(v4script::HostFunction::parse("void clear()").parameters.size(), 0);
        QCOMPARE(v4script::HostFunction::parse("array words(string text)").result, v4script::Type::Array);

        QVERIFY_THROWS_EXCEPTION(std::invalid_argument, v4script::HostFunction::parse("thing f()"));
        QVERIFY_THROWS_EXCEPTION(std::invalid_argument, v4script::HostFunction::parse("void counter"));
        QVERIFY_THROWS_EXCEPTION(std::invalid_argument, v4script::HostFunction::parse("int f(int a?, int b)"));
        QVERIFY_THROWS_EXCEPTION(std::invalid_argument, v4script::HostFunction::parse("int f(void a)"));
        QVERIFY_THROWS_EXCEPTION(std::invalid_argument, v4script::HostFunction::parse("int"));
    }

    void moduleFromSignatures()
    {
        QStringList output;
        v4script::Runtime runtime;
        runtime.setOutput([&output](Stream, const QString& text) { output.append(text); });
        QJSEngine* engine = runtime.jsEngine();
        const QJSValue object = engine->evaluate(
            "({ twice: function (s) { return s + s; }, sum: function (list) { return list.reduce(function (a, b) "
            "{ return a + b; }, 0); }, get version() { return '1.0'; } })");
        runtime.addModule(v4script::HostModule(
            "tools",
            object,
            { "string twice(string text)", "number sum(array values)", "string version" },
            false));
        // Not global: only with the name of the module.
        const QList<std::pair<QString, QString>> programs {
            { "python", "import tools\nprint(tools.twice('ab'), tools.sum([1, 2, 3]), tools.version())" },
            { "go", "import \"tools\"\nfmt.Println(tools.Twice(\"x\"), tools.Sum([]int{4, 5}), tools.Version())" },
            { "c", "#include <tools.h>\nprintf(\"%s %g\\n\", tools_twice(\"y\"), twice(\"z\") ? 1.0 : 0.0);" }
        };
        for (const auto& program : programs) {
            const auto result = runtime.run(program.first, program.second);
            QVERIFY2(result.isOk(), qPrintable(program.first + ": " + result.describeError()));
        }
        QCOMPARE(output.join(""), QString("abab 6 1.0\nxx 9 1.0\nyy 1\n"));
        QCOMPARE(runtime.run("python", "twice('a')").status, Status::Failed);
        QCOMPARE(runtime.run("javascript", "tools.twice('q')").value, QString("qq"));
        QCOMPARE(runtime.run("javascript", "typeof twice").value, QString("undefined"));
    }

    void moduleFromQObject()
    {
        Greeter greeter;
        QStringList output;
        v4script::Runtime runtime;
        runtime.setOutput([&output](Stream, const QString& text) { output.append(text); });
        runtime.addModule("greeter", &greeter);

        const QList<v4script::HostModule> modules = runtime.engine().modules();
        QCOMPARE(modules.size(), 1);
        QStringList signatures;
        for (const v4script::HostFunction& function : modules[0].functions) {
            signatures.append(function.toSignature());
        }
        // Slots come before Q_INVOKABLE methods in a meta-object.
        QCOMPARE(
            signatures,
            (QStringList { "void reset()",
                           "string greet(string who, string greeting?)",
                           "number half(number value)",
                           "bool isLong(string text)",
                           "array words(string text)",
                           "string name" }));

        const QList<std::pair<QString, QString>> programs {
            { "python", "print(greet('Ann'), greet('Bob', 'Hi'), half(5), isLong('abcd'), name())" },
            { "java", "System.out.println(greet(\"Cy\") + \" \" + words(\"a b\").size() + \" \" + name());" },
            { "scheme", "(display (greeter.greet \"Di\")) (newline) (reset)" }
        };
        for (const auto& program : programs) {
            const auto result = runtime.run(program.first, program.second);
            QVERIFY2(result.isOk(), qPrintable(program.first + ": " + result.describeError()));
        }
        QCOMPARE(output.join(""), QString("Hello, Ann! Hi, Bob! 2.5 True greeter\nHello, Cy! 2 greeter\nHello, Di!\n"));
        QCOMPARE(greeter.getCallCount(), 0);
        QVERIFY(runtime.run("pascal", "WriteLn(Greet('Ed'));").isOk());
        QCOMPARE(greeter.getCallCount(), 1);

        // A new engine keeps modules of QObjects.
        runtime.reset();
        QVERIFY(runtime.run("lua", "print(greet('Fay'))").isOk());
        QCOMPARE(greeter.getCallCount(), 2);
    }

    void modulesComeFromTheHost()
    {
        QStringList asked;
        v4script::Runtime runtime;
        runtime.setModuleLoader([&asked](const QString& name) -> std::optional<QString> {
            asked.append(name);
            if (name == "util.py") {
                return QString("def double(x):\n    return 2 * x\n");
            }
            return std::nullopt;
        });
        const auto result = runtime.run("python", "import util\nutil.double(21)");
        QVERIFY2(result.isOk(), qPrintable(result.describeError()));
        QCOMPARE(result.value, QString("42"));
        QVERIFY(asked.contains("util.py"));
        QCOMPARE(runtime.run("python", "import nothing").status, Status::Failed);
    }

    void languagesLoadOnce()
    {
        v4script::Runtime runtime;
        QVERIFY(!runtime.engine().isLoaded("scheme"));
        QCOMPARE(runtime.load("scheme"), QString());
        QVERIFY(runtime.engine().isLoaded("scheme"));
        QCOMPARE(runtime.load("cobol"), QString("Unknown language: cobol"));
        QCOMPARE(runtime.load("javascript"), QString());
    }

    void timersContinuePrograms()
    {
        QStringList output;
        QList<std::pair<Stream, QString>> chunks;
        v4script::Runtime runtime;
        runtime.setOutput([&output](Stream, const QString& text) { output.append(text); });
        QVERIFY(runtime
                    .run(
                        "go",
                        "go func() { time.Sleep(50 * time.Millisecond); fmt.Println(\"late\") }()\n"
                        "time.Sleep(100 * time.Millisecond)\nfmt.Println(\"end\")")
                    .isOk());
        QVERIFY(runtime.isActive());
        QVERIFY2(runtime.waitForFinished(5000), qPrintable(output.join("")));
        QCOMPARE(output.join(""), QString("late\nend\n"));

        output.clear();
        QVERIFY(runtime.run("javascript", "setTimeout(function (a) { print(a); }, 10, 'js')").isOk());
        QVERIFY(runtime.waitForFinished(5000));
        QCOMPARE(output.join(""), QString("js\n"));

        // stop() ends the waiting programs.
        output.clear();
        QVERIFY(runtime.run("java", "Thread.sleep(10000);\nSystem.out.println(\"never\");").isOk());
        QVERIFY(runtime.isActive());
        runtime.stop();
        QVERIFY(!runtime.isActive());
        QVERIFY(output.isEmpty());

        // An error in a timer goes to standard error.
        runtime.setOutput([&chunks](Stream stream, const QString& text) { chunks.append({ stream, text }); });
        QVERIFY(runtime.run("javascript", "setTimeout(function () {\n  null.x;\n}, 1)").isOk());
        QVERIFY(runtime.waitForFinished(5000));
        QCOMPARE(chunks.size(), 1);
        QCOMPARE(chunks[0].first, Stream::Error);
        QVERIFY2(chunks[0].second.contains("(line 2)"), qPrintable(chunks[0].second));
    }

    void timeLimitInterrupts()
    {
        QList<std::pair<Stream, QString>> chunks;
        v4script::Runtime runtime;
        runtime.setTimeLimit(200);
        QCOMPARE(runtime.timeLimit(), 200);
        auto result = runtime.run("javascript", "for (;;) {}");
        QCOMPARE(result.status, Status::Interrupted);
        QCOMPARE(result.error, QString("The code ran longer than 200 ms"));
        QCOMPARE(runtime.run("javascript", "2 + 2").value, QString("4"));

        // The limit is per continuous run: a timer gets its own.
        runtime.setOutput([&chunks](Stream stream, const QString& text) { chunks.append({ stream, text }); });
        QVERIFY(runtime.run("javascript", "setTimeout(function () { for (;;) {} }, 1)").isOk());
        QVERIFY(runtime.waitForFinished(5000));
        QCOMPARE(chunks.size(), 1);
        QCOMPARE(chunks[0], std::make_pair(Stream::Error, QString("The code ran longer than 200 ms\n")));

        // interrupt() from another thread. The thread reaches the runtime by
        // reference because that is what is tested; it is joined before the
        // runtime goes.
        runtime.setTimeLimit(0);
        const std::unique_ptr<QThread> thread(QThread::create([&runtime]() {
            QThread::msleep(200);
            runtime.interrupt();
        }));
        thread->start();
        result = runtime.run("python", "while True:\n    pass");
        thread->wait();
        QCOMPARE(result.status, Status::Interrupted);
        QCOMPARE(result.error, QString("Interrupted"));
        QCOMPARE(runtime.run("python", "1 + 1").value, QString("2"));
    }

    void deepRecursionWorks()
    {
        // prepareProcess() lets programs nest calls deeply.
        v4script::Runtime runtime;
        const auto result = runtime.run("javascript", "function f(n) { return n === 0 ? 0 : 1 + f(n - 1); }\nf(5000)");
        QVERIFY2(result.isOk(), qPrintable(result.describeError()));
        QCOMPARE(result.value, QString("5000"));
        QCOMPARE(runtime.run("javascript", "function g() { return g(); }\ng()").status, Status::Failed);
    }

    void resetForgetsPrograms()
    {
        v4script::Runtime runtime;
        QJSEngine* first = runtime.jsEngine();
        QVERIFY(runtime.run("python", "kept = 1").isOk());
        runtime.addModule(v4script::HostModule("js_module", first->newObject(), {}, true));
        runtime.reset();
        QVERIFY(runtime.jsEngine() != first);
        QCOMPARE(runtime.run("python", "kept").status, Status::Failed);
        // Modules of JavaScript objects died with their engine.
        QVERIFY(runtime.engine().modules().isEmpty());
    }

    void engineOnApplicationEngine()
    {
        // An engine that the application owns: no timers, no console.
        QJSEngine engine;
        QStringList output;
        v4script::Host host;
        host.write = [&output](Stream, const QString& text) { output.append(text); };
        host.readLine = []() -> std::optional<QString> { return QString("typed"); };
        {
            v4script::Engine languages(&engine, host);
            QCOMPARE(languages.jsEngine(), &engine);
            QVERIFY(languages.run("scheme", "(display (read-line))", "unit").isOk());
            QVERIFY(languages.run("javascript", "globalThis.shared = 5").isOk());
            QCOMPARE(languages.run("lua", "return js.global.shared * 2").value, QString("10"));
            QVERIFY(languages.currentUnit().isEmpty());
            const QJSValue function = engine.evaluate("(function (a) { return a + 1; })");
            QCOMPARE(languages.call(function, { 41 }, "timer").value, QString("42"));
        }
        QCOMPARE(output.join(""), QString("typed"));
        // The compatibility layer stays in the engine.
        QCOMPARE(engine.evaluate("[1, [2]].flat().length").toInt(), 2);
    }

    void imageCanvasDraws()
    {
        v4script::ImageCanvas canvas;
        v4script::Runtime runtime;
        runtime.setCanvas([&canvas, &runtime]() { return canvas.jsValue(runtime.jsEngine()); });
        QCOMPARE(canvas.image().size(), QSize(300, 150));

        const auto result = runtime.run("basic", "SCREEN 13\nLINE (10, 10)-(20, 20), 4, BF\nPSET (100, 100), 14");
        QVERIFY2(result.isOk(), qPrintable(result.describeError()));
        // Pixels of SCREEN 13 are doubled: 320 x 200 on a 640 x 400 canvas.
        QCOMPARE(canvas.image().size(), QSize(640, 400));
        QCOMPARE(canvas.image().pixelColor(31, 31), QColor(0xAA, 0, 0));
        QCOMPARE(canvas.image().pixelColor(201, 201), QColor(0xFF, 0xFF, 0x55));

        // The 2D context from JavaScript: paths, image data, the same object.
        QJSValue value = canvas.jsValue(runtime.jsEngine());
        runtime.jsEngine()->globalObject().setProperty("canvas", value);
        const auto drawn = runtime.run(
            "javascript",
            "var c = canvas.getContext('2d');\n"
            "c.fillStyle = 'rgb(0, 128, 255)'; c.beginPath(); c.arc(50, 50, 10, 0, 2 * Math.PI);\n"
            "c.fill();\nvar d = c.getImageData(50, 50, 1, 1).data;\n"
            "var img = c.createImageData(2, 2); img.data[0] = 255; img.data[3] = 255;\n"
            "c.putImageData(img, 0, 0);\n"
            "[d[0], d[1], d[2], d[3], canvas === globalThis.canvas, c.measureText('ab').width > 0]");
        QVERIFY2(drawn.isOk(), qPrintable(drawn.describeError()));
        QCOMPARE(drawn.value, QString("[0,128,255,255,true,true]"));
        QCOMPARE(canvas.image().pixelColor(0, 0), QColor(255, 0, 0));

        // After reset the canvas works with the new engine.
        runtime.reset();
        QVERIFY(runtime
                    .run(
                        "pascal",
                        "uses Graph;\nvar gd, gm: SmallInt;\ngd := VGA; gm := VGAHi;\n"
                        "InitGraph(gd, gm, '');\nPutPixel(5, 5, Red);")
                    .isOk());
        QCOMPARE(canvas.image().size(), QSize(640, 480));
        // The palette of Free Pascal: 6-bit DAC values times 4.
        QCOMPARE(canvas.image().pixelColor(5, 5), QColor(0xA8, 0, 0));
    }
};

QTEST_MAIN(RuntimeTest)

#include "RuntimeTest.moc"
