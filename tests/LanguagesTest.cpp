// Every language through the public API: output and values, errors with
// lines, shared state of units, host modules, the canvas, calls between a
// language and JavaScript, modules from the host, the time limit and the
// sample programs of tests/samples.

#include "TestSession.hpp"

#include "v4script/Languages.hpp"

#include <QDirIterator>
#include <QFile>
#include <QRegularExpression>
#include <QTest>

using v4script::Status;

class LanguagesTest : public QObject {
    Q_OBJECT

private:
    static void addLanguageColumn()
    {
        QTest::addColumn<QString>("language");
    }

private slots:
    void initTestCase()
    {
        v4script::prepareProcess();
    }

    void languagesAreListed()
    {
        QStringList ids;
        const QList<v4script::LanguageInfo> languages = v4script::languages();
        for (const v4script::LanguageInfo& language : languages) {
            ids.append(language.id);
            QVERIFY2(
                !language.name.isEmpty() && !language.version.isEmpty() && !language.dialect.isEmpty() &&
                    !language.implementation.isEmpty() && !language.implementationVersion.isEmpty() &&
                    !language.license.isEmpty() && !language.extensions.isEmpty() && !language.lineComment.isEmpty(),
                qPrintable(language.id));
        }
        const QStringList expected { "python", "lua",   "prolog", "perl",   "php", "go",    "c",
                                     "java",   "forth", "basic",  "pascal", "wat", "scheme" };
        QCOMPARE(ids, expected);
        QCOMPARE(v4script::findLanguage("php")->name, QString("PHP"));
        QCOMPARE(v4script::findLanguage("go")->version, QString("1.22"));
        QVERIFY(!v4script::findLanguage("cobol").has_value());
        QCOMPARE(v4script::findLanguageForFile("main.GO")->id, QString("go"));
        QCOMPARE(v4script::findLanguageForFile(".pl")->id, QString("perl"));
        QCOMPARE(v4script::findLanguageForFile("pro")->id, QString("prolog"));
        QVERIFY(!v4script::findLanguageForFile("notes.txt").has_value());
    }

    void outputAndValue_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("code");
        QTest::addColumn<QStringList>("output");
        QTest::addColumn<QString>("value");

        QTest::newRow("python") << "python"
                                << "print('Hello, мир', 1 + 2)\nprint('a', end='')\nprint('b')\n[1, 2] + [3]"
                                << QStringList { "Hello, мир 3", "ab" } << "[1, 2, 3]";
        QTest::newRow("lua") << "lua"
                             << "print('Hello, мир', 1 + 2)\nio.write('a')\nio.write('b\\n')\nreturn 6 * 7"
                             << QStringList { "Hello, мир\t3", "ab" } << "42";
        QTest::newRow("prolog") << "prolog"
                                << "likes(anna, tea).\nlikes(boris, coffee).\n"
                                   "?- likes(Who, tea), write(found), nl.\n?- likes(nobody, _)."
                                << QStringList { "found", "Who = anna", "false" } << "";
        QTest::newRow("perl") << "perl"
                              << "my @a = (3, 1, 2);\nprint join(',', sort @a), \"\\n\";\n"
                                 "printf(\"%.2f\\n\", 2.5);"
                              << QStringList { "1,2,3", "2.50" } << "";
        QTest::newRow("php") << "php"
                             << "echo 'Hello, мир ', 1 + 2, \"\\n\";\n"
                                "printf(\"%.2f|%5s|%x\\n\", 3.14159, 'ab', 255);\nreturn [1, 2];"
                             << QStringList { "Hello, мир 3", "3.14|   ab|ff" } << "[1,2]";
        QTest::newRow("go")
            << "go"
            << "fmt.Println(\"Hello, мир\", 1+2)\nfmt.Print(\"a\")\nfmt.Print(\"b\\n\")\nlen([]int{1, 2, 3}) * 14"
            << QStringList { "Hello, мир 3", "ab" } << "42";
        QTest::newRow("c")
            << "c"
            << "printf(\"Hello, мир %d\\n\", 1 + 2);\nprintf(\"a\");\nputs(\"b\");\nsizeof(int) * 10 + 2;"
            << QStringList { "Hello, мир 3", "ab" } << "42";
        QTest::newRow("java") << "java"
                              << "System.out.println(\"Hello, мир \" + (1 + 2));\nSystem.out.print(\"a\");\n"
                                 "System.out.println(\"b\");\nList.of(1, 2, 3).size() * 14"
                              << QStringList { "Hello, мир 3", "ab" } << "42";
        QTest::newRow("forth") << "forth"
                               << ".\" Hello, мир \" 1 2 + 0 .r cr\n.\" a\"\n.\" b\" cr\n6 7 *"
                               << QStringList { "Hello, мир 3", "ab" } << "<1> 42";
        QTest::newRow("basic") << "basic"
                               << "PRINT \"Hello, мир\"; STR$(1 + 2)\nPRINT \"a\";\nPRINT \"b\"\nx = 6 * 7"
                               << QStringList { "Hello, мир 3", "ab" } << "";
        QTest::newRow("pascal") << "pascal"
                                << "WriteLn('Hello, мир ', 1 + 2);\nWrite('a');\nWriteLn('b');\n6 * 7"
                                << QStringList { "Hello, мир 3", "ab" } << "42";
        QTest::newRow("wat") << "wat"
                             << "(import \"wasi_snapshot_preview1\" \"fd_write\" "
                                "(func $fd_write (param i32 i32 i32 i32) (result i32)))\n"
                                "(memory (export \"memory\") 1)\n(data (i32.const 100) \"Hello, мир 3\\nab\\n\")\n"
                                "(func $print (param $at i32) (param $length i32)\n"
                                "  (i32.store (i32.const 0) (local.get $at))\n"
                                "  (i32.store (i32.const 4) (local.get $length))\n"
                                "  (drop (call $fd_write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 8))))\n"
                                "(func (export \"main\") (result i32)\n"
                                "  (call $print (i32.const 100) (i32.const 16))\n"
                                "  (call $print (i32.const 116) (i32.const 1))\n"
                                "  (call $print (i32.const 117) (i32.const 2))\n  (i32.const 42))"
                             << QStringList { "Hello, мир 3", "ab" } << "42";
        QTest::newRow("scheme") << "scheme"
                                << "(display \"Hello, мир \")\n(display (+ 1 2))\n(newline)\n(display \"a\")\n"
                                   "(write-string \"b\")\n(newline)\n(* 6 7)"
                                << QStringList { "Hello, мир 3", "ab" } << "42";
    }

    void outputAndValue()
    {
        QFETCH(QString, language);
        QFETCH(QString, code);
        QFETCH(QStringList, output);
        QFETCH(QString, value);

        TestSession session;
        const auto run = session.run(language, code);
        QVERIFY2(run.result.isOk(), qPrintable(run.result.error));
        QCOMPARE(run.output, output);
        QCOMPARE(run.result.value, value);
    }

    void errorsHaveLine_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("code");
        QTest::addColumn<QString>("message");
        QTest::addColumn<int>("line");

        QTest::newRow("python") << "python"
                                << "x = 1\ny = undefined_name + 1"
                                << "NameError" << 2;
        QTest::newRow("python syntax") << "python"
                                       << "x = 1\ny = 2 +\nz = 3"
                                       << "SyntaxError" << 2;
        QTest::newRow("python host") << "python"
                                     << "x = 1\nfail('Z')"
                                     << "RangeError: Z" << 2;
        QTest::newRow("lua") << "lua"
                             << "local a = 1\nlocal b = nil\nprint(b.c)"
                             << "attempt to index" << 3;
        QTest::newRow("lua syntax") << "lua"
                                    << "local a = 1\nlocal b = = 2"
                                    << "unexpected symbol" << 2;
        QTest::newRow("lua host") << "lua"
                                  << "local a = 1\nfail('Z')"
                                  << "RangeError" << 2;
        QTest::newRow("prolog") << "prolog"
                                << "p(1).\n?- undefined_pred(1)."
                                << "existence_error" << 2;
        QTest::newRow("prolog syntax") << "prolog"
                                       << "p(1).\np(2) :- .\n"
                                       << "syntax_error" << 2;
        QTest::newRow("perl") << "perl"
                              << "my $x = 1;\ndie \"boom\\n\";"
                              << "boom" << 0;
        QTest::newRow("perl syntax") << "perl"
                                     << "my $x = ;"
                                     << "missing value" << 1;
        QTest::newRow("php") << "php"
                             << "$a = 1;\n$b = undefined_function();"
                             << "undefined function" << 2;
        QTest::newRow("php syntax") << "php"
                                    << "$a = 1;\n$b = ;"
                                    << "syntax error" << 2;
        QTest::newRow("go") << "go"
                            << "x := 1\ny := x + undefinedName"
                            << "undefined: undefinedName" << 2;
        QTest::newRow("go syntax") << "go"
                                   << "x := 1\ny := = 2"
                                   << "syntax error" << 2;
        QTest::newRow("go panic") << "go"
                                  << "var a []int\n_ = len(a)\nfmt.Println(a[3])"
                                  << "index out of range [3] with length 0" << 3;
        QTest::newRow("go host") << "go"
                                 << "x := 1\napp.Fail(\"Z\")"
                                 << "RangeError" << 2;
        QTest::newRow("c") << "c"
                           << "int x = 1;\nint y = x + undefinedName;"
                           << "use of undeclared identifier 'undefinedName'" << 2;
        QTest::newRow("c syntax") << "c"
                                  << "int x = 1;\nint y = = 2;"
                                  << "expected expression" << 2;
        QTest::newRow("c segfault") << "c"
                                    << "int *p = NULL;\nint x = 1;\nprintf(\"%d\\n\", *p + x);"
                                    << "Segmentation fault" << 3;
        QTest::newRow("c host") << "c"
                                << "int x = 1;\nfail(\"Z\");"
                                << "RangeError" << 2;
        QTest::newRow("java") << "java"
                              << "int x = 1;\nint y = x + undefinedName;"
                              << "cannot find symbol" << 2;
        QTest::newRow("java syntax") << "java"
                                     << "int x = 1;\nint y = = 2;"
                                     << "illegal start of expression" << 2;
        QTest::newRow("java exception") << "java"
                                        << "int[] a = new int[0];\nint n = a.length;\nSystem.out.println(a[3]);"
                                        << "ArrayIndexOutOfBoundsException: Index 3 out of bounds for length 0" << 3;
        QTest::newRow("java host") << "java"
                                   << "int x = 1;\nfail(\"Z\");"
                                   << "RangeError" << 2;
        QTest::newRow("forth") << "forth"
                               << "1 2 +\nundefined-word"
                               << "Undefined word: undefined-word" << 2;
        QTest::newRow("forth definition") << "forth"
                                          << ": ratio ( a b -- a/b )\n  / ;\n1 0 ratio"
                                          << "Division by zero" << 2;
        QTest::newRow("forth host") << "forth"
                                    << "1 drop\ns\" Z\" fail"
                                    << "RangeError" << 2;
        QTest::newRow("basic") << "basic"
                               << "x = 1\ny = x + LEFT$(\"a\", 1)"
                               << "Type mismatch" << 2;
        QTest::newRow("basic syntax") << "basic"
                                      << "x = 1\ny = = 2"
                                      << "Expected: expression" << 2;
        QTest::newRow("basic runtime") << "basic"
                                       << "DIM a(3)\nx = 1\na(5) = x"
                                       << "Subscript out of range" << 3;
        QTest::newRow("basic procedure") << "basic"
                                         << "PRINT Ratio(1, 0)\nFUNCTION Ratio (a, b)\n    Ratio = a / b\nEND FUNCTION"
                                         << "Division by zero" << 3;
        QTest::newRow("basic host") << "basic"
                                    << "x = 1\n\nFAIL \"Z\""
                                    << "RangeError" << 3;
        QTest::newRow("pascal") << "pascal"
                                << "var x: Integer;\nx := undefinedName + 1;"
                                << "Identifier not found \"undefinedName\"" << 2;
        QTest::newRow("pascal syntax") << "pascal"
                                       << "var x: Integer;\nx := := 2;"
                                       << "Syntax error" << 2;
        QTest::newRow("pascal runtime") << "pascal"
                                        << "var a: array[1..3] of Integer; i: Integer;\ni := 5;\na[i] := 1;"
                                        << "Range check error" << 3;
        QTest::newRow("pascal procedure")
            << "pascal"
            << "function Ratio(a, b: Integer): Integer;\nbegin\n  Ratio := a div b;\nend;\nWriteLn(Ratio(1, 0));"
            << "Division by zero" << 3;
        QTest::newRow("pascal host") << "pascal"
                                     << "var x: Integer;\n\nFail('Z');"
                                     << "RangeError" << 3;
        QTest::newRow("wat") << "wat"
                             << "(func (export \"f\") (result i32)\n  (local.get $missing))"
                             << "unknown local $missing" << 2;
        QTest::newRow("wat syntax") << "wat"
                                    << "(func (result i32)\n  (i32.plus (i32.const 1) (i32.const 2)))"
                                    << "unknown operator i32.plus" << 2;
        QTest::newRow("wat validation") << "wat"
                                        << "(func (result i32)\n  (i64.const 1))"
                                        << "type mismatch" << 2;
        QTest::newRow("wat trap") << "wat"
                                  << "(func (export \"div\") (param i32 i32) (result i32)\n"
                                     "  (i32.div_s (local.get 0) (local.get 1)))\n"
                                     "(invoke \"div\" (i32.const 1) (i32.const 0))"
                                  << "integer divide by zero" << 2;
        QTest::newRow("wat host") << "wat"
                                  << "(import \"app\" \"fail\" (func $fail (param externref)))\n"
                                     "(import \"'\" \"Z\" (global $z externref))\n(func (export \"main\")\n"
                                     "  (call $fail (global.get $z)))"
                                  << "RangeError" << 4;
        QTest::newRow("scheme") << "scheme"
                                << "(define x 1)\n(car x)"
                                << "car: not a pair" << 2;
        QTest::newRow("scheme syntax") << "scheme"
                                       << "(define x 1)\n(display (+ 1 2)"
                                       << "missing ')'" << 2;
        QTest::newRow("scheme runtime") << "scheme"
                                        << "(define v (vector 1 2))\n(vector-ref v 5)"
                                        << "index out of range" << 2;
        QTest::newRow("scheme procedure") << "scheme"
                                          << "(define (ratio a b)\n  (/ a b))\n(display (ratio 1 0))"
                                          << "divide by zero" << 2;
        QTest::newRow("scheme host") << "scheme"
                                     << "(define x 1)\n(fail \"Z\")"
                                     << "RangeError" << 2;
    }

    void errorsHaveLine()
    {
        QFETCH(QString, language);
        QFETCH(QString, code);
        QFETCH(QString, message);
        QFETCH(int, line);

        TestSession session;
        const auto run = session.run(language, code);
        QCOMPARE(run.result.status, Status::Failed);
        QVERIFY2(run.result.error.contains(message), qPrintable(run.result.error));
        QCOMPARE(run.result.errorLine, line);
        QVERIFY(run.result.errorSource.isEmpty());
    }

    void stateIsSharedBetweenUnits_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("define");
        QTest::addColumn<QString>("use");
        QTest::addColumn<QString>("seen");

        QTest::newRow("python") << "python"
                                << "base = 40\ndef add(v):\n    return base + v"
                                << "add(2)"
                                << "42";
        QTest::newRow("lua") << "lua"
                             << "base = 40\nfunction add(v) return base + v end"
                             << "return add(2)"
                             << "42";
        QTest::newRow("prolog") << "prolog"
                                << "base(40).\nadd(V, R) :- base(B), R is B + V."
                                << "?- add(2, R)."
                                << "R = 42";
        QTest::newRow("perl") << "perl"
                              << "our $base = 40;\nsub add { return $base + shift }"
                              << "print add(2), \"\\n\";"
                              << "42";
        QTest::newRow("php") << "php"
                             << "$base = 40;\nfunction add($v) { global $base; return $base + $v; }"
                             << "return add(2);"
                             << "42";
        QTest::newRow("go") << "go"
                            << "var base = 40\nfunc add(v int) int { return base + v }"
                            << "add(2)"
                            << "42";
        QTest::newRow("c") << "c"
                           << "int base = 40;\nint add(int v) { return base + v; }"
                           << "add(2);"
                           << "42";
        QTest::newRow("java") << "java"
                              << "int base = 40;\nint add(int v) { return base + v; }"
                              << "add(2)"
                              << "42";
        QTest::newRow("forth") << "forth"
                               << "40 constant base-value\n: add ( n -- n ) base-value + ;"
                               << "2 add"
                               << "<1> 42";
        QTest::newRow("basic") << "basic"
                               << "start = 40\nSUB Show (v)\n    SHARED start\n    PRINT STR$(start + v)\nEND SUB"
                               << "Show 2"
                               << " 42";
        QTest::newRow("pascal")
            << "pascal"
            << "var base: Integer = 40;\nfunction Add(v: Integer): Integer;\nbegin\n  Result := base + v;\nend;"
            << "Add(2)"
            << "42";
        QTest::newRow("wat") << "wat"
                             << "(module $base\n  (global $base i32 (i32.const 40))\n"
                                "  (func (export \"add\") (param i32) (result i32)\n"
                                "    (i32.add (global.get $base) (local.get 0))))"
                             << "(module\n  (import \"base\" \"add\" (func $add (param i32) (result i32)))\n"
                                "  (func (export \"use\") (result i32) (call $add (i32.const 2))))\n(invoke \"use\")"
                             << "42";
        QTest::newRow("scheme") << "scheme"
                                << "(define base 40)\n(define (add v) (+ base v))"
                                << "(add 2)"
                                << "42";
    }

    void stateIsSharedBetweenUnits()
    {
        QFETCH(QString, language);
        QFETCH(QString, define);
        QFETCH(QString, use);
        QFETCH(QString, seen);

        TestSession session;
        QVERIFY(session.run(language, define, "first").result.isOk());
        const auto run = session.run(language, use, "second");
        QVERIFY2(run.result.isOk(), qPrintable(run.result.error));
        QCOMPARE(run.getSeen(), seen);

        // A new engine forgets the languages too.
        session.getRuntime().reset();
        QCOMPARE(session.run(language, use, "second").result.status, Status::Failed);
    }

    void unitsRunAgain_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("code");
        QTest::addColumn<QString>("seen");

        QTest::newRow("python") << "python"
                                << "class K:\n    pass\ndef f():\n    return 7\nf()"
                                << "7";
        QTest::newRow("lua") << "lua"
                             << "function f() return 7 end\nreturn f()"
                             << "7";
        QTest::newRow("prolog") << "prolog"
                                << "f(7).\n?- f(X)."
                                << "X = 7";
        QTest::newRow("perl")
            << "perl"
            << "package K; sub new { bless {}, shift }\npackage main;\nsub f { 7 }\nprint f(), \"\\n\";"
            << "7";
        QTest::newRow("php") << "php"
                             << "class K {}\nfunction f() { return 7; }\nreturn f();"
                             << "7";
        QTest::newRow("go")
            << "go"
            << "type K struct{ X int }\nfunc (k K) Get() int { return k.X }\nfunc f() int { return 7 }\nf()"
            << "7";
        QTest::newRow("c") << "c"
                           << "#define SEVEN 7\nstruct K { int x; };\nint get(struct K k) { return k.x; }\n"
                              "int f(void) { static int calls; calls++; return SEVEN; }\nf();"
                           << "7";
        QTest::newRow("java") << "java"
                              << "record K(int x) {}\nenum Color { RED }\nint f() { return new K(7).x(); }\nf()"
                              << "7";
        QTest::newRow("forth") << "forth"
                               << "variable kept\n: f 7 ;\nf"
                               << "<1> 7";
        QTest::newRow("basic") << "basic"
                               << "TYPE K\n    x AS INTEGER\nEND TYPE\nDIM k AS K\nk.x = 7\nPRINT STR$(F)\n"
                                  "FUNCTION F\n    F = 7\nEND FUNCTION"
                               << " 7";
        QTest::newRow("pascal") << "pascal"
                                << "type\n  TK = record x: Integer; end;\n  TColor = (Red, Green);\n"
                                   "  TShape = class\n    function Get: Integer; virtual;\n  end;\n"
                                   "function TShape.Get: Integer;\nbegin\n  Result := 7;\nend;\n"
                                   "function F: Integer;\nvar k: TK;\nbegin\n  k.x := TShape.Create.Get;\n"
                                   "  Result := k.x;\nend;\nF"
                                << "7";
        QTest::newRow("wat") << "wat"
                             << "(module $k\n  (type $t (func (result i32)))\n  (memory 1)\n"
                                "  (data (i32.const 0) \"\\07\")\n  (table 1 funcref)\n  (elem (i32.const 0) $f)\n"
                                "  (global $g (mut i32) (i32.const 0))\n"
                                "  (func $f (type $t) (i32.load8_u (i32.const 0)))\n"
                                "  (func (export \"run\") (result i32) (call_indirect (type $t) (i32.const 0))))\n"
                                "(invoke \"run\")"
                             << "7";
        QTest::newRow("scheme") << "scheme"
                                << "(define-record-type point (make-point x) point? (x point-x))\n"
                                   "(define-syntax seven (syntax-rules () ((_) 7)))\n"
                                   "(define (f) (point-x (make-point (seven))))\n(f)"
                                << "7";
    }

    void unitsRunAgain()
    {
        // A unit runs many times: its declarations replace the old ones, and
        // Prolog predicates do not pile up.
        QFETCH(QString, language);
        QFETCH(QString, code);
        QFETCH(QString, seen);

        TestSession session;
        for (int attempt = 0; attempt < 2; ++attempt) {
            const auto run = session.run(language, code);
            QVERIFY2(run.result.isOk(), qPrintable(run.result.error));
            QCOMPARE(run.getSeen(), seen);
        }
    }

    void phpLibraryFillsGaps()
    {
        // PHP functions that Uniter lacks are added (php-library.js).
        TestSession session;
        const auto run = session.run(
            "php",
            "$a = [3, 10, 1];\nsort($a);\nprintf(\"%s|%05.1f|%-3d|%x\\n\", implode(',', $a), 3.14159, 7, 255);\n"
            "$h = ['b' => 2, 'a' => 1];\nksort($h);\n"
            "echo json_encode($h), ' ', round(2.5), ' ', max(4, 9, 2), ' ', str_pad('7', 3, '0', STR_PAD_LEFT), ' ',\n"
            "    number_format(1234.5, 1), ' ', mb_strlen('Привет'), ' ', preg_replace('/(\\w+) (\\w+)/', '$2 $1', 'a b'),\n"
            "    ' ', json_encode(preg_split('/,\\s*/', 'x, y')), \"\\n\";\n"
            "usort($a, function ($x, $y) { return $y - $x; });\nreturn $a;");
        QVERIFY2(run.result.isOk(), qPrintable(run.result.error));
        QCOMPARE(
            run.output,
            (QStringList { "1,3,10|003.1|7  |ff", "{\"a\":1,\"b\":2} 3 9 007 1,234.5 6 b a [\"x\",\"y\"]" }));
        QCOMPARE(run.result.value, QString("[10,3,1]"));
    }

    void hostModuleIsUsed_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("code");

        QTest::newRow("python") << "python"
                                << "print(greet('Ann'), counter(), counter())\nlog('one')";
        QTest::newRow("python module") << "python"
                                       << "import app\nprint(app.greet('Ann'), app.counter(), app.counter())\n"
                                          "app.log('one')";
        QTest::newRow("lua") << "lua"
                             << "print(greet('Ann') .. ' ' .. counter() .. ' ' .. app.counter())\nlog('one')";
        QTest::newRow("prolog")
            << "prolog"
            << "?- greet('Ann', G), counter(A), app:counter(B), format(\"~a ~w ~w~n\", [G, A, B]),\n"
               "   log(one).";
        QTest::newRow("perl") << "perl"
                              << "print join(' ', greet('Ann'), counter(), app::counter()), \"\\n\";\n"
                                 "app::log('one');";
        QTest::newRow("php") << "php"
                             << "echo implode(' ', [greet('Ann'), counter(), app\\counter()]), \"\\n\";\n"
                                "app\\log('one');";
        QTest::newRow("go") << "go"
                            << "fmt.Println(app.Greet(\"Ann\"), app.Counter(), app.Counter())\napp.Log(\"one\")";
        QTest::newRow("c") << "c"
                           << "printf(\"%s %lld %lld\\n\", greet(\"Ann\"), counter(), app_counter());\n"
                              "app_log(\"one\");";
        QTest::newRow("java") << "java"
                              << "System.out.println(greet(\"Ann\") + \" \" + counter() + \" \" + App.counter());\n"
                                 "log(\"one\");";
        QTest::newRow("forth") << "forth"
                               << "s\" Ann\" greet type space counter 0 .r space app.counter 0 .r cr\n"
                                  "s\" one\" log";
        QTest::newRow("basic") << "basic"
                               << "PRINT GREET(\"Ann\") + STR$(COUNTER) + STR$(APP.counter)\nAPP.log \"one\"";
        QTest::newRow("pascal") << "pascal"
                                << "WriteLn(Greet('Ann'), ' ', Counter, ' ', App.Counter);\nLog('one');";
        QTest::newRow("wat") << "wat"
                             << "(import \"app\" \"greet\" (func $greet (param externref) (result externref)))\n"
                                "(import \"app\" \"counter\" (func $counter (result i32)))\n"
                                "(import \"app\" \"log\" (func $log (param externref)))\n"
                                "(import \"console\" \"log\" (func $print (param externref i32 i32)))\n"
                                "(import \"'\" \"Ann\" (global $ann externref))\n"
                                "(import \"'\" \"one\" (global $one externref))\n"
                                "(func (export \"main\")\n"
                                "  (call $print (call $greet (global.get $ann)) (call $counter) (call $counter))\n"
                                "  (call $log (global.get $one)))";
        QTest::newRow("scheme") << "scheme"
                                << "(display (greet \"Ann\")) (display \" \") (display (counter)) (display \" \")\n"
                                   "(display app.counter) (newline)\n(app.log \"one\")";
        QTest::newRow("javascript") << "javascript"
                                    << "console.log(greet('Ann'), counter, app.counter);\napp.log('one')";
    }

    void hostModuleIsUsed()
    {
        QFETCH(QString, language);
        QFETCH(QString, code);

        TestSession session;
        const auto run = session.run(language, code);
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QVERIFY(!run.output.isEmpty());
        QCOMPARE(run.output.first(), QString("Hello, Ann! 1 2"));
        QCOMPARE(session.run("javascript", "app.logged.join(',')").result.value, QString("one"));
    }

    void canvasIsDrawn_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("code");

        QTest::newRow("python") << "python"
                                << "ctx = canvas().getContext('2d')\nctx.fillStyle = 'red'\nctx.fillRect(0, 0, 50, 40)";
        QTest::newRow("lua") << "lua"
                             << "local ctx = canvas():getContext('2d')\nctx.fillStyle = 'red'\n"
                                "ctx:fillRect(0, 0, 50, 40)";
        QTest::newRow("prolog") << "prolog"
                                << "?- canvas(C), apply(C, getContext, ['2d'], X), set_prop(X, fillStyle, red),\n"
                                   "   apply(X, fillRect, [0, 0, 50, 40], _).";
        QTest::newRow("perl") << "perl"
                              << "my $ctx = canvas()->getContext('2d');\nsetProperty($ctx, 'fillStyle', 'red');\n"
                                 "$ctx->fillRect(0, 0, 50, 40);";
        QTest::newRow("php") << "php"
                             << "$ctx = canvas()->getContext('2d');\n$ctx->fillStyle = 'red';\n"
                                "$ctx->fillRect(0, 0, 50, 40);";
        QTest::newRow("go") << "go"
                            << "ctx := app.Canvas().Call(\"getContext\", \"2d\")\nctx.Set(\"fillStyle\", \"red\")\n"
                               "ctx.Call(\"fillRect\", 0, 0, 50, 40)";
        QTest::newRow("c") << "c"
                           << "js_value ctx = js_call(canvas(), \"getContext\", \"2d\");\n"
                              "js_set(ctx, \"fillStyle\", \"red\");\njs_call(ctx, \"fillRect\", 0, 0, 50, 40);";
        QTest::newRow("java") << "java"
                              << "var ctx = canvas().call(\"getContext\", \"2d\");\nctx.set(\"fillStyle\", \"red\");\n"
                                 "ctx.call(\"fillRect\", 0, 0, 50, 40);";
        QTest::newRow("forth") << "forth"
                               << "js\" 2d\" 1 canvas s\" getContext\" js-call value ctx\n"
                                  "js\" red\" ctx s\" fillStyle\" js-set\n0 0 50 40 4 ctx s\" fillRect\" js-call drop";
        QTest::newRow("basic") << "basic"
                               << "DIM ctx AS OBJECT\nctx = CANVAS.getContext(\"2d\")\nctx.fillStyle = \"red\"\n"
                                  "ctx.fillRect 0, 0, 50, 40";
        QTest::newRow("basic screen") << "basic"
                                      << "SCREEN _NEWIMAGE(320, 200, 32)\nLINE (0, 0)-(50, 40), _RGB(255, 0, 0), BF";
        QTest::newRow("pascal") << "pascal"
                                << "var ctx: JSValue;\nctx := Canvas.getContext('2d');\nctx.fillStyle := 'red';\n"
                                   "ctx.fillRect(0, 0, 50, 40);";
        QTest::newRow("pascal graph")
            << "pascal"
            << "uses Graph;\nvar gd, gm: SmallInt;\ngd := D32bit; gm := m320x200;\n"
               "InitGraph(gd, gm, '');\nSetFillStyle(SolidFill, $FF0000);\nBar(0, 0, 50, 40);";
        QTest::newRow("wat")
            << "wat"
            << "(import \"app\" \"canvas\" (func $canvas (result externref)))\n"
               "(import \"js\" \"call\" "
               "(func $context (param externref externref externref) (result externref)))\n"
               "(import \"js\" \"set\" (func $set (param externref externref externref)))\n"
               "(import \"js\" \"call\" (func $fillRect (param externref externref f64 f64 f64 f64)))\n"
               "(import \"'\" \"getContext\" (global $getContext externref))\n"
               "(import \"'\" \"2d\" (global $2d externref))\n"
               "(import \"'\" \"fillStyle\" (global $fillStyle externref))\n"
               "(import \"'\" \"red\" (global $red externref))\n"
               "(import \"'\" \"fillRect\" (global $fillRectName externref))\n"
               "(func (export \"main\") (local $ctx externref)\n"
               "  (local.set $ctx (call $context (call $canvas) (global.get $getContext) "
               "(global.get $2d)))\n"
               "  (call $set (local.get $ctx) (global.get $fillStyle) (global.get $red))\n"
               "  (call $fillRect (local.get $ctx) (global.get $fillRectName)\n"
               "    (f64.const 0) (f64.const 0) (f64.const 50) (f64.const 40)))";
        QTest::newRow("scheme") << "scheme"
                                << "(define c (canvas))\n(define ctx (c.getContext \"2d\"))\n"
                                   "(set! ctx.fillStyle \"red\")\n(ctx.fillRect 0 0 50 40)";
    }

    void canvasIsDrawn()
    {
        QFETCH(QString, language);
        QFETCH(QString, code);

        TestSession session;
        // Programs reach the canvas of the host through the module too.
        session.getRuntime().jsEngine()->globalObject().property("app").setProperty(
            "canvasObject",
            session.getCanvas().jsValue(session.getRuntime().jsEngine()));
        const auto run = session.run(language, code);
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QCOMPARE(session.getCanvas().image().pixelColor(25, 20), QColor(Qt::red));
    }

    void javaScriptAndLanguageCallEachOther_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("code");
        QTest::addColumn<QString>("seen");
        QTest::addColumn<QString>("check");

        QTest::newRow("python") << "python"
                                << "js.pySquare = lambda x: x * x\nprint(js.jsDouble(21))"
                                << "42"
                                << "pySquare(7)";
        QTest::newRow("lua") << "lua"
                             << "js.global.luaSquare = function(self, x) return x * x end\n"
                                "print(js.global:jsDouble(21))"
                             << "42"
                             << "luaSquare(7)";
        QTest::newRow("prolog") << "prolog"
                                << "?- apply(jsDouble, [21], X)."
                                << "X = 42"
                                << "";
        QTest::newRow("perl") << "perl"
                              << "setProperty(js(), 'perlSquare', sub { my $x = shift; return $x * $x });\n"
                                 "print js()->jsDouble(21), \"\\n\";"
                              << "42"
                              << "perlSquare(7)";
        QTest::newRow("php") << "php"
                             << "$js->phpSquare = function ($x) { return $x * $x; };\necho $js->jsDouble(21), \"\\n\";"
                             << "42"
                             << "phpSquare(7)";
        QTest::newRow("go") << "go"
                            << "js.Global().Set(\"goSquare\", func(x int) int { return x * x })\n"
                               "fmt.Println(js.Global().Call(\"jsDouble\", 21).Int())"
                            << "42"
                            << "goSquare(7)";
        QTest::newRow("c") << "c"
                           << "int cSquare(int x) { return x * x; }\njs_set(js_global(), \"cSquare\", cSquare);\n"
                              "printf(\"%lld\\n\", js_int(js_call(js_global(), \"jsDouble\", 21)));"
                           << "42"
                           << "cSquare(7)";
        QTest::newRow("java") << "java"
                              << "Js.global().set(\"javaSquare\", (IntUnaryOperator) x -> x * x);\n"
                                 "System.out.println(Js.global().call(\"jsDouble\", 21).asInt());"
                              << "42"
                              << "javaSquare(7)";
        QTest::newRow("forth") << "forth"
                               << ": square ( n -- n*n ) dup * ;\n"
                                  "' square js-function js-global s\" forthSquare\" js-set\n"
                                  "21 1 js-global s\" jsDouble\" js-call js>n 0 .r cr"
                               << "42"
                               << "forthSquare(7)";
        QTest::newRow("basic") << "basic"
                               << "JS.basicSquare = JSFUNCTION(\"Square\")\nPRINT STR$(JS.jsDouble(21))\n"
                                  "FUNCTION Square (x)\n    Square = x * x\nEND FUNCTION"
                               << " 42"
                               << "basicSquare(7)";
        QTest::newRow("pascal") << "pascal"
                                << "function Square(x: Integer): Integer;\nbegin\n  Result := x * x;\nend;\n"
                                   "JS.pascalSquare := JSFunction(@Square);\nWriteLn(Integer(JS.jsDouble(21)));"
                                << "42"
                                << "pascalSquare(7)";
        QTest::newRow("wat") << "wat"
                             << "(import \"globalThis\" \"jsDouble\" (func $double (param i32) (result i32)))\n"
                                "(import \"console\" \"log\" (func $log (param i32)))\n"
                                "(func (export \"watSquare\") (param i32) (result i32) "
                                "(i32.mul (local.get 0) (local.get 0)))\n"
                                "(func (export \"main\") (call $log (call $double (i32.const 21))))"
                             << "42"
                             << "watSquare(7)";
        QTest::newRow("scheme") << "scheme"
                                << "(define (square x) (* x x))\n(set! js.schemeSquare square)\n"
                                   "(display (jsDouble 21))\n(newline)"
                                << "42"
                                << "schemeSquare(7)";
    }

    void javaScriptAndLanguageCallEachOther()
    {
        QFETCH(QString, language);
        QFETCH(QString, code);
        QFETCH(QString, seen);
        QFETCH(QString, check);

        TestSession session;
        session.run("javascript", "function jsDouble(x) { return 2 * x; }", "second");
        const auto run = session.run(language, code);
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QCOMPARE(run.getSeen(), seen);
        if (!check.isEmpty()) {
            QCOMPARE(session.run("javascript", check, "second").result.value, QString("49"));
        }
    }

    void modulesComeFromHost_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("name");
        QTest::addColumn<QString>("first");
        QTest::addColumn<QString>("second");
        QTest::addColumn<QString>("code");

        QTest::newRow("python") << "python"
                                << "mathx.py"
                                << "def triple(x):\n    return 3 * x\n"
                                << "def triple(x):\n    return -x\n"
                                << "import mathx\nmathx.triple(5)";
        QTest::newRow("lua") << "lua"
                             << "mathx.lua"
                             << "return { triple = function(x) return 3 * x end }"
                             << "return { triple = function(x) return -x end }"
                             << "return require('mathx').triple(5)";
        QTest::newRow("prolog") << "prolog"
                                << "mathx.pl"
                                << "triple(X, Y) :- Y is 3 * X."
                                << "triple(X, Y) :- Y is -X."
                                << "?- consult(mathx), triple(5, Y).";
        QTest::newRow("perl") << "perl"
                              << "Mathx.pm"
                              << "package Mathx;\nsub triple { return 3 * shift }\n1;\n"
                              << "package Mathx;\nsub triple { return -shift }\n1;\n"
                              << "use Mathx;\nprint Mathx::triple(5), \"\\n\";";
        QTest::newRow("php") << "php"
                             << "mathx.php"
                             << "<?php return 3 * 5;"
                             << "<?php return -5;"
                             << "return include 'mathx.php';";
        QTest::newRow("go") << "go"
                            << "mathx.go"
                            << "package mathx\n\nfunc Triple(x int) int { return 3 * x }\n"
                            << "package mathx\n\nfunc Triple(x int) int { return -x }\n"
                            << "import \"mathx\"\nmathx.Triple(5)";
        QTest::newRow("c") << "c"
                           << "mathx.h"
                           << "int triple(int x) { return 3 * x; }\n"
                           << "int triple(int x) { return -x; }\n"
                           << "#include \"mathx.h\"\ntriple(5);";
        QTest::newRow("java") << "java"
                              << "Mathx.java"
                              << "public class Mathx {\n    public static int triple(int x) { return 3 * x; }\n}\n"
                              << "public class Mathx {\n    public static int triple(int x) { return -x; }\n}\n"
                              << "Mathx.triple(5)";
        QTest::newRow("forth") << "forth"
                               << "mathx.fs"
                               << ": triple 3 * ;\n"
                               << ": triple negate ;\n"
                               << "include mathx.fs\n5 triple";
        QTest::newRow("basic") << "basic"
                               << "mathx.bas"
                               << "FUNCTION Triple (x)\n    Triple = 3 * x\nEND FUNCTION\n"
                               << "FUNCTION Triple (x)\n    Triple = -x\nEND FUNCTION\n"
                               << "'$INCLUDE: 'mathx.bas'\nPRINT STR$(Triple(5))";
        QTest::newRow("pascal") << "pascal"
                                << "mathx.pas"
                                << "unit Mathx;\ninterface\nfunction Triple(x: Integer): Integer;\nimplementation\n"
                                   "function Triple(x: Integer): Integer;\nbegin\n  Result := 3 * x;\nend;\nend.\n"
                                << "unit Mathx;\ninterface\nfunction Triple(x: Integer): Integer;\nimplementation\n"
                                   "function Triple(x: Integer): Integer;\nbegin\n  Result := -x;\nend;\nend.\n"
                                << "uses Mathx;\nTriple(5)";
        QTest::newRow("wat")
            << "wat"
            << "mathx.wat"
            << "(func (export \"triple\") (param i32) (result i32)\n"
               "  (i32.mul (local.get 0) (i32.const 3)))\n"
            << "(func (export \"triple\") (param i32) (result i32)\n"
               "  (i32.sub (i32.const 0) (local.get 0)))\n"
            << "(module\n  (import \"mathx\" \"triple\" (func $triple (param i32) (result i32)))\n"
               "  (func (export \"run\") (result i32) (call $triple (i32.const 5))))\n(invoke \"run\")";
        QTest::newRow("scheme") << "scheme"
                                << "mathx.sld"
                                << "(define-library (mathx)\n  (export triple)\n  (import (scheme base))\n"
                                   "  (begin (define (triple x) (* 3 x))))\n"
                                << "(define (triple x) (- x))\n"
                                << "(import (mathx))\n(triple 5)";
    }

    void modulesComeFromHost()
    {
        QFETCH(QString, language);
        QFETCH(QString, name);
        QFETCH(QString, first);
        QFETCH(QString, second);
        QFETCH(QString, code);

        TestSession session;
        session.setFile(name, first);
        auto run = session.run(language, code);
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QVERIFY2(run.getSeen().endsWith("15"), qPrintable(run.getSeen()));

        // A changed module loads again.
        session.setFile(name, second);
        run = session.run(language, code);
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QVERIFY2(run.getSeen().endsWith("-5"), qPrintable(run.getSeen()));
    }

    void errorsInModulesNameThem_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("name");
        QTest::addColumn<QString>("module");
        QTest::addColumn<QString>("code");
        QTest::addColumn<int>("line");

        QTest::newRow("python") << "python"
                                << "bad.py"
                                << "def f():\n    return 1 / 0\n"
                                << "import bad\nbad.f()" << 2;
        QTest::newRow("lua") << "lua"
                             << "bad.lua"
                             << "local M = {}\nfunction M.f()\n  return nil + 1\nend\nreturn M"
                             << "require('bad').f()" << 3;
        QTest::newRow("php") << "php"
                             << "bad.php"
                             << "<?php\nfunction f() {\n  throw new Exception('bad');\n}"
                             << "require_once 'bad.php';\nf();" << 3;
        QTest::newRow("go") << "go"
                            << "bad.go"
                            << "package bad\n\nfunc F() int {\n\tvar m map[int]int\n\tm[1] = 2\n\treturn 1\n}\n"
                            << "import \"bad\"\nbad.F()" << 5;
        QTest::newRow("go syntax") << "go"
                                   << "broken.go"
                                   << "package broken\n\nfunc F() int {\n\treturn +\n}\n"
                                   << "import \"broken\"\nbroken.F()" << 5;
        QTest::newRow("c") << "c"
                           << "bad.c"
                           << "int bad(void)\n{\n    int *p = 0;\n    return *p;\n}\n"
                           << "#include \"bad.c\"\nbad();" << 4;
        QTest::newRow("c syntax") << "c"
                                  << "broken.c"
                                  << "int broken(void)\n{\n    return +;\n}\n"
                                  << "#include \"broken.c\"\nbroken();" << 3;
        QTest::newRow("java") << "java"
                              << "Bad.java"
                              << "public class Bad {\n    public static int f() {\n        int[] a = new int[1];\n"
                                 "        return a[2];\n    }\n}\n"
                              << "Bad.f()" << 4;
        QTest::newRow("java syntax")
            << "java"
            << "Broken.java"
            << "public class Broken {\n    public static int f() {\n        return +;\n    }\n}\n"
            << "Broken.f()" << 3;
        QTest::newRow("forth") << "forth"
                               << "bad.fs"
                               << ": ok 1 ;\n: bad\n  0\n  @ ;\n"
                               << "include bad.fs\nbad" << 4;
        QTest::newRow("forth undefined") << "forth"
                                         << "broken.fs"
                                         << ": ok 1 ;\n\nnonexistent\n"
                                         << "include broken.fs" << 3;
        QTest::newRow("basic") << "basic"
                               << "bad.bas"
                               << "SUB Bad\n    DIM a(2)\n    x = 5\n    a(x) = 1\nEND SUB\n"
                               << "'$INCLUDE: 'bad.bas'\nBad" << 4;
        QTest::newRow("basic syntax") << "basic"
                                      << "broken.bas"
                                      << "x = 1\n\ny = = 2\n"
                                      << "REM $INCLUDE: 'broken.bas'" << 3;
        QTest::newRow("pascal")
            << "pascal"
            << "bad.pas"
            << "unit Bad;\ninterface\nprocedure Fail;\nimplementation\nprocedure Fail;\n"
               "var a: array[1..2] of Integer; i: Integer;\nbegin\n  i := 5;\n  a[i] := 1;\nend;\nend.\n"
            << "uses Bad;\nFail;" << 9;
        QTest::newRow("pascal syntax") << "pascal"
                                       << "broken.pas"
                                       << "unit Broken;\ninterface\nimplementation\nvar x: Integer;\nbegin\n"
                                          "  x := := 1;\nend.\n"
                                       << "uses Broken;" << 6;
        QTest::newRow("wat") << "wat"
                             << "bad.wat"
                             << "(func (export \"f\") (result i32)\n  (i32.const 1)\n  (i32.div_u (i32.const 0)))\n"
                             << "(module\n  (import \"bad\" \"f\" (func $f (result i32)))\n"
                                "  (func (export \"run\") (result i32) (call $f)))\n(invoke \"run\")"
                             << 3;
        QTest::newRow("wat syntax") << "wat"
                                    << "broken.wat"
                                    << "(func (export \"f\")\n\n  (i32.plus))\n"
                                    << "(module (import \"broken\" \"f\" (func)))" << 3;
        QTest::newRow("scheme") << "scheme"
                                << "bad.scm"
                                << "(define (f)\n  (car '()))\n"
                                << "(load \"bad.scm\")\n(f)" << 2;
        QTest::newRow("scheme library") << "scheme"
                                        << "bad.sld"
                                        << "(define-library (bad)\n  (export f)\n  (import (scheme base))\n"
                                           "  (begin\n    (define (f)\n      (vector-ref (vector) 0))))\n"
                                        << "(import (bad))\n(f)" << 6;
        QTest::newRow("scheme syntax") << "scheme"
                                       << "broken.sld"
                                       << "(define-library (broken)\n  (export f)\n  (begin\n    (define (f) (if))))\n"
                                       << "(import (broken))" << 4;
    }

    void errorsInModulesNameThem()
    {
        QFETCH(QString, language);
        QFETCH(QString, name);
        QFETCH(QString, module);
        QFETCH(QString, code);
        QFETCH(int, line);

        TestSession session;
        session.setFile(name, module);
        const auto run = session.run(language, code);
        QCOMPARE(run.result.status, Status::Failed);
        QCOMPARE(run.result.errorSource, name);
        QCOMPARE(run.result.errorLine, line);
    }

    void basicReadsFiles()
    {
        // OPEN ... FOR INPUT reads a file of the host; writing is not allowed.
        TestSession session;
        session.setFile("data.txt", "10, 2.5 -3\r\n\"a, b\",  plain text  \nпоследняя строка\n");
        auto run = session.run(
            "basic",
            "OPEN \"data.txt\" FOR INPUT AS #1\nINPUT #1, a, b, c\nINPUT #1, s$, t$\n"
            "LINE INPUT #1, l$\nPRINT a; b; c; \"[\"; s$; \"][\"; t$; \"][\"; l$; \"]\"; EOF(1)\n"
            "CLOSE #1\nf = FREEFILE\nOPEN \"out.txt\" FOR OUTPUT AS #f");
        QCOMPARE(run.output.value(0), QString(" 10  2.5 -3 [a, b][plain text][последняя строка]-1 "));
        QCOMPARE(run.result.status, Status::Failed);
        QVERIFY2(run.result.error.contains("Permission denied"), qPrintable(run.result.error));
        QCOMPARE(run.result.errorLine, 8);

        run = session.run("basic", "OPEN \"missing.txt\" FOR INPUT AS #1");
        QVERIFY2(run.result.error.contains("File not found"), qPrintable(run.result.error));
    }

    void pascalReadsFiles()
    {
        // Reset reads a file of the host; Rewrite writes a file in memory that
        // can be read back.
        TestSession session;
        session.setFile("data.txt", "10 2.5 -3\r\nстрока текста\n");
        auto run = session.run(
            "pascal",
            "var f: Text; a, c: Integer; b: Double; s: string;\nbegin\n"
            "  Assign(f, 'data.txt'); Reset(f);\n  ReadLn(f, a, b, c); ReadLn(f, s); Close(f);\n"
            "  WriteLn(a, ' ', b:0:1, ' ', c, ' [', s, '] ', Eof(f));\n"
            "  Assign(f, 'out.txt'); Rewrite(f); WriteLn(f, 'saved'); Close(f);\n"
            "  Reset(f); ReadLn(f, s); WriteLn(s);\nend.");
        QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        QCOMPARE(run.output, (QStringList { "10 2.5 -3 [строка текста] TRUE", "saved" }));

        run = session.run("pascal", "var f: Text;\nAssign(f, 'missing.txt');\nReset(f);");
        QVERIFY2(run.result.error.contains("File not found"), qPrintable(run.result.error));
        QCOMPARE(run.result.errorLine, 3);
    }

    void clearReachesHost()
    {
        TestSession session;
        QVERIFY(session.run("basic", "CLS").result.isOk());
        QVERIFY(session.run("pascal", "uses Crt;\nClrScr;").result.isOk());
        QVERIFY(session.run("forth", "page").result.isOk());
        QCOMPARE(session.getClearCount(), 3);
    }

    void timeLimitStopsLanguages_data()
    {
        addLanguageColumn();
        QTest::addColumn<QString>("define");
        QTest::addColumn<QString>("endless");
        QTest::addColumn<QString>("check");
        QTest::addColumn<QString>("seen");

        QTest::newRow("python") << "python"
                                << "kept = 5"
                                << "while True:\n    pass"
                                << "kept"
                                << "5";
        QTest::newRow("lua") << "lua"
                             << "kept = 5"
                             << "while true do end"
                             << "return kept"
                             << "5";
        QTest::newRow("prolog") << "prolog"
                                << "kept(5)."
                                << "?- repeat, fail."
                                << "?- kept(X)."
                                << "X = 5";
        QTest::newRow("perl") << "perl"
                              << "our $kept = 5;"
                              << "while (1) {}"
                              << "print \"$kept\\n\";"
                              << "5";
        QTest::newRow("php") << "php"
                             << "$kept = 5;"
                             << "while (true) {}"
                             << "return $kept;"
                             << "5";
        QTest::newRow("go") << "go"
                            << "var kept = 5"
                            << "for {}"
                            << "kept"
                            << "5";
        QTest::newRow("go goroutine") << "go"
                                      << "var kept = 5"
                                      << "ch := make(chan int)\ngo func() { for { ch <- 1 } }()\nfor { <-ch }"
                                      << "kept"
                                      << "5";
        QTest::newRow("c") << "c"
                           << "int kept = 5;"
                           << "int deep(int n) { return n; }\nfor (;;) deep(1);"
                           << "kept;"
                           << "5";
        QTest::newRow("java") << "java"
                              << "int kept = 5;"
                              << "int deep(int n) { return n; }\nwhile (true) deep(1);"
                              << "kept"
                              << "5";
        QTest::newRow("forth") << "forth"
                               << "5 constant kept"
                               << ": deep ( n -- n ) ;\n: spin begin 1 deep drop again ;\nspin"
                               << "kept"
                               << "<1> 5";
        QTest::newRow("basic") << "basic"
                               << "kept = 5"
                               << "DO\n    Deep 1\nLOOP\nSUB Deep (n)\nEND SUB"
                               << "PRINT STR$(kept)"
                               << " 5";
        QTest::newRow("pascal") << "pascal"
                                << "var kept: Integer = 5;"
                                << "procedure Deep(n: Integer);\nbegin\nend;\nwhile True do\n  Deep(1);"
                                << "WriteLn(kept);"
                                << "5";
        QTest::newRow("wat") << "wat"
                             << "(module $kept (global (export \"kept\") i32 (i32.const 5)))"
                             << "(func $deep (param i32) (result i32) (local.get 0))\n"
                                "(func (export \"spin\") (loop $l (drop (call $deep (i32.const 1))) (br $l)))\n"
                                "(invoke \"spin\")"
                             << "(get $kept \"kept\")"
                             << "5";
        QTest::newRow("scheme") << "scheme"
                                << "(define kept 5)"
                                << "(define (deep n) n)\n(let loop () (deep 1) (loop))"
                                << "kept"
                                << "5";
        QTest::newRow("scheme thread") << "scheme"
                                       << "(define kept 5)"
                                       << "(thread-start! (make-thread (lambda () (let spin () (spin)))))\n"
                                          "(let loop () (thread-yield!) (loop))"
                                       << "kept"
                                       << "5";
    }

    void timeLimitStopsLanguages()
    {
        QFETCH(QString, language);
        QFETCH(QString, define);
        QFETCH(QString, endless);
        QFETCH(QString, check);
        QFETCH(QString, seen);

        TestSession session;
        session.getRuntime().setTimeLimit(300);
        const auto defined = session.run(language, define);
        QVERIFY2(defined.result.isOk(), qPrintable(defined.result.describeError()));
        // An interrupted interpreter works on and remembers the past - more
        // than once.
        for (int attempt = 0; attempt < 3; ++attempt) {
            const auto stopped = session.run(language, endless);
            QCOMPARE(stopped.result.status, Status::Interrupted);
            const auto run = session.run(language, check);
            QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
            QCOMPARE(run.getSeen(), seen);
        }
    }

    void samplesRun_data()
    {
        QTest::addColumn<QString>("language");
        QTest::addColumn<QString>("path");
        QDirIterator iterator(":/samples", QDir::Files, QDirIterator::Subdirectories);
        QStringList paths;
        while (iterator.hasNext()) {
            paths.append(iterator.next());
        }
        paths.sort();
        QVERIFY(!paths.isEmpty());
        for (const QString& path : paths) {
            const QString language = path.section('/', -2, -2);
            QTest::newRow(qPrintable(language + "/" + path.section('/', -1))) << language << path;
        }
    }

    void samplesRun()
    {
        // A sample is a program with the expectations in comments at its end:
        // "Input:" and lines of standard input, "Output:" and lines of output
        // (standard error with "!"), "Value: ...", "Error: ..." (part of the
        // text) and "Line: N".
        QFETCH(QString, language);
        QFETCH(QString, path);
        QFile file(path);
        QVERIFY(file.open(QIODevice::ReadOnly));
        const QString code = QString::fromUtf8(file.readAll());
        const QString comment = v4script::findLanguage(language)->lineComment;

        QStringList input;
        QStringList expectedOutput;
        bool hasOutput = false;
        QString expectedValue, expectedError;
        int expectedLine = -1;
        enum class Section {
            None,
            Input,
            Output
        } section = Section::None;
        const QStringList codeLines = code.split('\n');
        for (const QString& line : codeLines) {
            const QString trimmed = line.trimmed();
            if (!trimmed.startsWith(comment)) {
                if (!trimmed.isEmpty()) {
                    section = Section::None;
                }
                continue;
            }
            QString body = trimmed.mid(comment.size());
            if (body.startsWith(' ')) {
                body = body.mid(1);
            }
            if (body == "Output:") {
                section = Section::Output;
                hasOutput = true;
            } else if (body == "Input:") {
                section = Section::Input;
            } else if (body.startsWith("Value: ")) {
                expectedValue = body.mid(7);
                section = Section::None;
            } else if (body.startsWith("Error: ")) {
                expectedError = body.mid(7);
                section = Section::None;
            } else if (body.startsWith("Line: ")) {
                expectedLine = body.mid(6).toInt();
                section = Section::None;
            } else if (section == Section::Output) {
                // Spaces at the start of an output line matter, at its end not.
                while (body.endsWith(' ') || body.endsWith('\t')) {
                    body.chop(1);
                }
                expectedOutput.append(body);
            } else if (section == Section::Input) {
                input.append(body);
            }
        }

        TestSession session;
        session.setInput(input);
        const auto run = session.run(language, code, "main");
        // A program that waits for time goes on in timers.
        QVERIFY(session.getRuntime().waitForFinished(20000));
        static const QRegularExpression TRAILING_SPACE("\\s+$");
        QStringList seen;
        const QStringList allLines = run.output + session.takeLines();
        for (QString line : allLines) {
            if (line.startsWith('?')) {
                continue;
            }
            seen.append(line.remove(TRAILING_SPACE));
        }
        if (!expectedError.isEmpty()) {
            QCOMPARE(run.result.status, Status::Failed);
            QVERIFY2(run.result.error.contains(expectedError), qPrintable(run.result.error));
            if (expectedLine >= 0) {
                QCOMPARE(run.result.errorLine, expectedLine);
            }
        } else {
            QVERIFY2(run.result.isOk(), qPrintable(run.result.describeError()));
        }
        if (hasOutput) {
            QCOMPARE(seen, expectedOutput);
        }
        if (!expectedValue.isEmpty()) {
            QCOMPARE(run.result.value, expectedValue);
        }
    }

    void javaScriptStillWorks()
    {
        // The interpreters do not spoil the engine for JavaScript: the
        // built-in objects stay whole.
        TestSession session;
        const QList<v4script::LanguageInfo> languages = v4script::languages();
        for (const v4script::LanguageInfo& language : languages) {
            const auto run = session.run(language.id, language.id == "prolog" ? "?- true." : "");
            QVERIFY2(run.result.isOk(), qPrintable(language.id + ": " + run.result.describeError()));
        }
        QCOMPARE(
            session.run("javascript", "['a,b'.split(','), [1, [2]].flat(), JSON.stringify({ x: 1 })]").result.value,
            QString("[[\"a\",\"b\"],[1,2],\"{\\\"x\\\":1}\"]"));
    }
};

QTEST_MAIN(LanguagesTest)

#include "LanguagesTest.moc"
