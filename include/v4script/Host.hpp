#ifndef V4SCRIPT_HOST_HPP
#define V4SCRIPT_HOST_HPP

#include <QJSValue>
#include <QString>

#include <functional>
#include <optional>

namespace v4script {

/**
 * @brief Output stream of a program
 */
enum class Stream {
    Output,  // standard output: print, printf, WriteLn
    Error,   // standard error: stderr, System.err, errors after a run
    Warning, // warnings of an interpreter (PHP notices, Prolog warnings)
};

/**
 * @brief How programs reach the world outside the engine.
 *
 * Every callback is optional. Without write the output is lost, without
 * readLine programs see the end of input, without readModule there are no
 * modules, without canvas there is no graphics. Callbacks run in the
 * thread of the engine, while the program waits.
 */
struct Host {
    /**
     * @brief Output: text in pieces that end with a line break, plus an
     * unfinished line at the end of a run, before input is read, on clear()
     * and before a translated program calls JavaScript or a host function
     * (so that their effects keep their order). A host that shows output by
     * lines joins the pieces itself.
     */
    std::function<void(Stream stream, const QString& text)> write;

    /**
     * @brief One line of standard input without its line break; nullopt -
     * the end of input
     */
    std::function<std::optional<QString>()> readLine;

    /**
     * @brief Text of a module or data file by name ("util.py", "lib.h");
     * nullopt - there is none. The name is what the program wrote, the host
     * decides what it means.
     */
    std::function<std::optional<QString>(const QString& name)> readModule;

    /**
     * @brief Canvas for graphics (BASIC SCREEN, Pascal Graph, getContext
     * from code): an object with width, height and getContext("2d") like
     * an HTML canvas, for example ImageCanvas or a Qt Quick Canvas. An
     * undefined QJSValue - no graphics.
     */
    std::function<QJSValue()> canvas;

    /**
     * @brief Clears the output (CLS in BASIC, ClrScr in Pascal)
     */
    std::function<void()> clear;

    /**
     * @brief Text of a JavaScript value for output (values of expressions,
     * values printed by languages); unset - the built-in format: strings as
     * they are, objects as JSON
     */
    std::function<QString(const QJSValue& value)> format;
};

} // namespace v4script

#endif // V4SCRIPT_HOST_HPP
