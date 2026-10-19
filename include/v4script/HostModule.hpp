#ifndef V4SCRIPT_HOSTMODULE_HPP
#define V4SCRIPT_HOSTMODULE_HPP

#include <QJSValue>
#include <QList>
#include <QString>
#include <QStringList>

class QJSEngine;
class QObject;

namespace v4script {

/**
 * @brief Type of a parameter or result of a host function, as languages
 * see it: Integer is int64 in Go and Java, long in C; Value is the handle of
 * a JavaScript value (js.Value, JsValue, js_value, OBJECT, JSValue)
 */
enum class Type {
    Void, // results only
    Boolean,
    Integer,
    Number,
    String,
    Value, // any JavaScript value; parameters accept any value of the language
    Array, // array of values: List<JsValue> in Java, []js.Value in Go
};

struct Parameter {
    QString name;
    Type type = Type::Value;
    bool optional = false; // only trailing parameters
};

/**
 * @brief A function of a host module
 */
struct HostFunction {
    QString name; // in camelCase: "createTable"; languages convert it (create_table, CreateTable...)
    QList<Parameter> parameters;
    Type result = Type::Value;
    // A property read on every call, without parameters: "total". Dynamic
    // languages call it as a function, BASIC and Pascal without parentheses.
    bool getter = false;

    /**
     * @brief Function from a signature: "value createTable(string title,
     * value options?)", "void clear()", "string version" (a getter).
     * Types: void, bool, int, number, string, value, array. Throws
     * std::invalid_argument on a wrong signature.
     */
    static HostFunction parse(const QString& signature);

    QString toSignature() const;
};

/**
 * @brief An API that the embedding application gives to programs in all
 * languages (see docs/embedding/host-modules.md).
 *
 * Each language shows the module in its own way: package "shop" with
 * shop.CreateOrder() in Go, header shop.h with create_order() in C, class
 * shop.Shop in Java, unit Shop in Pascal, predicates in Prolog,
 * (create-order ...) in Scheme, (import "shop" "createOrder" ...) in
 * WebAssembly.
 * The implementation is a JavaScript object with functions and properties
 * of the same names.
 */
struct HostModule {
    QString name; // "shop": package, header, unit, library name
    QJSValue object;
    QList<HostFunction> functions;
    // Functions visible without import or qualification (implicit import in
    // Go and Java, header included in C, unit used in Pascal...).
    bool global = true;

    HostModule() = default;

    /**
     * @brief Module from function signatures (see HostFunction::parse)
     */
    HostModule(const QString& name, const QJSValue& object, const QStringList& signatures, bool global = true);

    /**
     * @brief Module from a QObject: its Q_INVOKABLE methods and public slots
     * become functions (default arguments - optional parameters), its
     * readable properties become getters. Types: bool, integers, double,
     * QString, QJSValue and QVariant (value), QVariantList and QStringList
     * (array), void. The object stays owned by the caller and must outlive
     * the engine.
     */
    static HostModule fromQObject(QJSEngine* engine, const QString& name, QObject* object, bool global = true);
};

QString typeName(Type type);

} // namespace v4script

#endif // V4SCRIPT_HOSTMODULE_HPP
