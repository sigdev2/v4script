#ifndef V4SCRIPT_HOSTBRIDGE_HPP
#define V4SCRIPT_HOSTBRIDGE_HPP

#include <QJSValue>
#include <QObject>
#include <QString>

namespace v4script {

class Engine;

/**
 * @brief The native side of js/host/host.js: the primitives that the host
 * layer turns into the `host` object of language adapters.
 *
 * A separate object, so that code in the engine sees only these methods.
 */
class HostBridge : public QObject {
    Q_OBJECT
    Q_PROPERTY(QString version READ getVersion CONSTANT)

public:
    explicit HostBridge(Engine* engine);

    QString getVersion() const;

    Q_INVOKABLE void write(int stream, const QString& text);
    Q_INVOKABLE QJSValue readLine();
    Q_INVOKABLE QJSValue readModule(const QString& name);
    Q_INVOKABLE QJSValue canvas();
    Q_INVOKABLE void clear();
    Q_INVOKABLE QString unit() const;
    Q_INVOKABLE QJSValue modules();
    Q_INVOKABLE bool hasFormat() const;
    Q_INVOKABLE QString format(const QJSValue& value);

    /**
     * @return {value} - the value of the code - or {error, line}
     */
    Q_INVOKABLE QJSValue compile(const QString& name, const QString& code);

private:
    Engine* const engine;
};

} // namespace v4script

#endif // V4SCRIPT_HOSTBRIDGE_HPP
