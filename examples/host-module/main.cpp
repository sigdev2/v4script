// host-module - an application gives programs its own API and talks to
// them through standard input and output:
//
//  - a QObject (Store) becomes the host module "store": its Q_INVOKABLE
//    methods are functions in every language, its properties are getters;
//  - a module from signatures with a JavaScript object ("text");
//  - standard input comes from a string, output is collected by stream.

#include <v4script/V4Script.hpp>

#include <QCoreApplication>
#include <QJSEngine>
#include <QMap>
#include <QStringList>

#include <iostream>

// The API of the application: a tiny shop.
class Store : public QObject {
    Q_OBJECT
    Q_PROPERTY(double total READ getTotal)

public:
    Q_INVOKABLE double price(const QString& item) const
    {
        return prices.value(item, 0.0);
    }

    // count has a default value: an optional parameter in the languages.
    Q_INVOKABLE QString buy(const QString& item, int count = 1)
    {
        if (!prices.contains(item)) {
            return QString("no %1 today").arg(item);
        }
        sum += prices.value(item) * count;
        return QString("%1 x %2").arg(count).arg(item);
    }

    Q_INVOKABLE QStringList items() const
    {
        return prices.keys();
    }

    double getTotal() const
    {
        return sum;
    }

private:
    QMap<QString, double> prices { { "apple", 0.5 }, { "pear", 0.75 }, { "plum", 1.25 } };
    double sum = 0.0;
};

int main(int argc, char* argv[])
{
    v4script::prepareProcess();
    QCoreApplication application(argc, argv);

    // The store and the lists outlive the runtime that uses them.
    Store store;
    QStringList output;
    QStringList errors;
    v4script::Runtime runtime;
    runtime.setOutput([&output, &errors](v4script::Stream stream, const QString& text) {
        (stream == v4script::Stream::Output ? output : errors) << text;
    });
    // Standard input: the lines of a text, then the end of input.
    runtime.setInputText("apple\n3\n");

    runtime.addModule("store", &store);
    // A module from signatures; it is not global, so programs name it.
    QJSValue text = runtime.jsEngine()->evaluate("({ shout: function (text) { return text.toUpperCase() + '!'; }, "
                                                 "words: function (text) { return text.split(' '); } })");
    runtime.addModule(
        v4script::HostModule("text", text, { "string shout(string text)", "array words(string text)" }, false));

    const QList<QPair<QString, QString>> programs = {
        { "python",
          "item = input('item? ')\n"
          "count = int(input('count? '))\n"
          "print(buy(item, count), items(), total())\n"
          "import text\n"
          "print(text.shout('python'), len(text.words('a b c')))" },
        { "go", "fmt.Println(store.Buy(\"pear\", 2), store.Price(\"plum\"), store.Total())" },
        { "java", "System.out.println(buy(\"plum\") + \" \" + total());" },
        { "pascal", "WriteLn(Buy('apple', 4), ' ', Total:0:2);" },
        { "basic", "PRINT BUY(\"kiwi\"); STORE.total" },
        { "scheme", "(display (list (buy \"pear\") (total) (text.shout \"scheme\")))\n(newline)" },
        { "c", "#include <store.h>\nprintf(\"%s %.2f\\n\", buy(\"plum\", 2), total());" },
    };
    for (const auto& program : programs) {
        const v4script::Result result = runtime.run(program.first, program.second);
        if (!result.isOk()) {
            errors << QString("%1: %2\n").arg(program.first, result.describeError());
        }
    }

    std::cout << "Output:\n" << output.join("").toStdString();
    std::cout << "Errors:\n" << errors.join("").toStdString();
    std::cout << "The shop sold for " << store.getTotal() << "\n";
    return errors.isEmpty() ? 0 : 1;
}

#include "main.moc"
