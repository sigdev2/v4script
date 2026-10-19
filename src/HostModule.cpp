#include "v4script/HostModule.hpp"

#include <QHash>
#include <QJSEngine>
#include <QMetaMethod>
#include <QMetaObject>
#include <QMetaProperty>
#include <QRegularExpression>

#include <stdexcept>

namespace v4script {

namespace {

const QHash<QString, Type>& typeNames()
{
    static const QHash<QString, Type> names { { "void", Type::Void },       { "bool", Type::Boolean },
                                              { "boolean", Type::Boolean }, { "int", Type::Integer },
                                              { "integer", Type::Integer }, { "long", Type::Integer },
                                              { "number", Type::Number },   { "double", Type::Number },
                                              { "string", Type::String },   { "value", Type::Value },
                                              { "any", Type::Value },       { "array", Type::Array },
                                              { "list", Type::Array } };
    return names;
}

Type parseType(const QString& name, const QString& signature)
{
    const auto found = typeNames().constFind(name);
    if (found == typeNames().constEnd()) {
        throw std::invalid_argument(
            QString("Unknown type '%1' in the host function signature '%2'").arg(name, signature).toStdString());
    }
    return *found;
}

Type fromMetaType(int id)
{
    switch (id) {
    case QMetaType::Void:
        return Type::Void;
    case QMetaType::Bool:
        return Type::Boolean;
    case QMetaType::Int:
    case QMetaType::UInt:
    case QMetaType::Long:
    case QMetaType::ULong:
    case QMetaType::LongLong:
    case QMetaType::ULongLong:
    case QMetaType::Short:
    case QMetaType::UShort:
    case QMetaType::SChar:
    case QMetaType::UChar:
        return Type::Integer;
    case QMetaType::Double:
    case QMetaType::Float:
        return Type::Number;
    case QMetaType::QString:
        return Type::String;
    case QMetaType::QVariantList:
    case QMetaType::QStringList:
        return Type::Array;
    default:
        return Type::Value;
    }
}

} // namespace

QString typeName(Type type)
{
    switch (type) {
    case Type::Void:
        return "void";
    case Type::Boolean:
        return "bool";
    case Type::Integer:
        return "int";
    case Type::Number:
        return "number";
    case Type::String:
        return "string";
    case Type::Value:
        return "value";
    case Type::Array:
        return "array";
    }
    return "value";
}

HostFunction HostFunction::parse(const QString& signature)
{
    static const QRegularExpression pattern(R"(^\s*(\w+)\s+([A-Za-z_]\w*)\s*(?:\((.*)\))?\s*$)");
    static const QRegularExpression parameterPattern(R"(^\s*(\w+)\s+([A-Za-z_]\w*)\s*(\?)?\s*$)");
    const QRegularExpressionMatch match = pattern.match(signature);
    if (!match.hasMatch()) {
        throw std::invalid_argument(QString("Wrong host function signature '%1'").arg(signature).toStdString());
    }
    HostFunction function;
    function.result = parseType(match.captured(1), signature);
    function.name = match.captured(2);
    function.getter = match.capturedStart(3) < 0;
    if (function.getter && function.result == Type::Void) {
        throw std::invalid_argument(
            QString("The getter '%1' needs a type other than void").arg(signature).toStdString());
    }
    const QString list = match.captured(3).trimmed();
    if (!list.isEmpty()) {
        const QStringList parameterTexts = list.split(',');
        for (const QString& text : parameterTexts) {
            const QRegularExpressionMatch parameterMatch = parameterPattern.match(text);
            if (!parameterMatch.hasMatch()) {
                throw std::invalid_argument(
                    QString("Wrong parameter '%1' in '%2'").arg(text.trimmed(), signature).toStdString());
            }
            Parameter parameter;
            parameter.type = parseType(parameterMatch.captured(1), signature);
            parameter.name = parameterMatch.captured(2);
            parameter.optional = !parameterMatch.captured(3).isEmpty();
            if (parameter.type == Type::Void) {
                throw std::invalid_argument(QString("A parameter cannot be void in '%1'").arg(signature).toStdString());
            }
            if (!parameter.optional && !function.parameters.isEmpty() && function.parameters.last().optional) {
                throw std::invalid_argument(
                    QString("Only trailing parameters can be optional in '%1'").arg(signature).toStdString());
            }
            function.parameters.append(parameter);
        }
    }
    return function;
}

QString HostFunction::toSignature() const
{
    QString text = typeName(result) + " " + name;
    if (getter) {
        return text;
    }
    QStringList list;
    for (const Parameter& parameter : parameters) {
        list.append(typeName(parameter.type) + " " + parameter.name + (parameter.optional ? "?" : ""));
    }
    return text + "(" + list.join(", ") + ")";
}

HostModule::HostModule(const QString& name, const QJSValue& object, const QStringList& signatures, bool global) :
        name(name),
        object(object),
        global(global)
{
    for (const QString& signature : signatures) {
        functions.append(HostFunction::parse(signature));
    }
}

HostModule HostModule::fromQObject(QJSEngine* engine, const QString& name, QObject* object, bool global)
{
    HostModule module;
    module.name = name;
    module.global = global;
    // An object without a parent would belong to JavaScript and could be
    // deleted by the garbage collector.
    QJSEngine::setObjectOwnership(object, QJSEngine::CppOwnership);
    module.object = engine->newQObject(object);

    const QMetaObject* meta = object->metaObject();
    QHash<QString, qsizetype> indexes;
    for (int index = QObject::staticMetaObject.methodCount(); index < meta->methodCount(); ++index) {
        const QMetaMethod method = meta->method(index);
        if (method.access() != QMetaMethod::Public ||
            (method.methodType() != QMetaMethod::Method && method.methodType() != QMetaMethod::Slot))
        {
            continue;
        }
        const QString methodName = QString::fromLatin1(method.name());
        const auto known = indexes.constFind(methodName);
        if (known != indexes.constEnd()) {
            // Default arguments: moc adds clones without the trailing
            // parameters; those become optional. Real overloads are ignored.
            HostFunction& function = module.functions[*known];
            if ((method.attributes() & QMetaMethod::Cloned) != 0) {
                for (int parameter = method.parameterCount(); parameter < function.parameters.size(); ++parameter) {
                    function.parameters[parameter].optional = true;
                }
            }
            continue;
        }
        HostFunction function;
        function.name = methodName;
        function.result = fromMetaType(method.returnType());
        const QList<QByteArray> names = method.parameterNames();
        for (int parameter = 0; parameter < method.parameterCount(); ++parameter) {
            Parameter item;
            item.name = parameter < names.size() && !names[parameter].isEmpty() ? QString::fromLatin1(names[parameter])
                                                                                : QString("arg%1").arg(parameter + 1);
            item.type = fromMetaType(method.parameterType(parameter));
            function.parameters.append(item);
        }
        indexes.insert(methodName, module.functions.size());
        module.functions.append(function);
    }
    for (int index = QObject::staticMetaObject.propertyCount(); index < meta->propertyCount(); ++index) {
        const QMetaProperty property = meta->property(index);
        if (!property.isReadable() || indexes.contains(QString::fromLatin1(property.name()))) {
            continue;
        }
        HostFunction function;
        function.name = QString::fromLatin1(property.name());
        function.result = fromMetaType(property.metaType().id());
        if (function.result == Type::Void) {
            function.result = Type::Value;
        }
        function.getter = true;
        module.functions.append(function);
    }
    return module;
}

} // namespace v4script
