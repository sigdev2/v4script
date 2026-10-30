// hello - the smallest embedding: one Runtime, a program in every
// language, their output and their values.

#include <v4script/V4Script.hpp>

#include <QCoreApplication>
#include <QList>
#include <QPair>

#include <iostream>

int main(int argc, char* argv[])
{
    // Deep recursion in programs needs a big stack: call it first.
    v4script::prepareProcess();
    QCoreApplication application(argc, argv);

    v4script::Runtime runtime;
    runtime.setOutput([](v4script::Stream stream, const QString& text) {
        (stream == v4script::Stream::Output ? std::cout : std::cerr) << text.toStdString() << std::flush;
    });

    const QList<QPair<QString, QString>> programs = {
        { "python", "print('Hello from Python', sum(range(10)))" },
        { "lua", "print('Hello from Lua', 2 ^ 10)" },
        { "prolog", "?- X is 6 * 7, write(hello_from_prolog(X)), nl." },
        { "perl", "print 'Hello from Perl ', join(',', map { $_ * 2 } 1 .. 3), \"\\n\";" },
        { "php", "<?php echo 'Hello from PHP ', str_repeat('*', 3), \"\\n\";" },
        { "go", "fmt.Println(\"Hello from Go\", len([]rune(\"héllo\")))" },
        { "c", "printf(\"Hello from C %zu\\n\", sizeof(long));" },
        { "java", "System.out.println(\"Hello from Java \" + Integer.MAX_VALUE);" },
        { "csharp", "Console.WriteLine($\"Hello from C# {decimal.MaxValue}\");" },
        { "forth", ".( Hello from Forth ) 6 7 * . cr" },
        { "basic", "PRINT \"Hello from BASIC\"; 1 / 3" },
        { "pascal", "WriteLn('Hello from Pascal ', High(Int64));" },
        { "wat", "(module (func (export \"answer\") (result i32) i32.const 42))\n(invoke \"answer\")" },
        { "scheme", "(display \"Hello from Scheme \") (display (expt 2 100)) (newline)" },
        { "javascript", "console.log('Hello from JavaScript', [1, 2, 3].map(x => x * x))" },
    };
    int failures = 0;
    for (const auto& program : programs) {
        const v4script::Result result = runtime.run(program.first, program.second);
        if (!result.isOk()) {
            std::cerr << program.first.toStdString() << ": " << result.describeError().toStdString() << "\n";
            ++failures;
        } else if (!result.value.isEmpty()) {
            std::cout << "  " << program.first.toStdString() << " value: " << result.value.toStdString() << "\n";
        }
    }
    return failures == 0 ? 0 : 1;
}
