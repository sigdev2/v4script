#ifndef V4SCRIPT_RESULT_HPP
#define V4SCRIPT_RESULT_HPP

#include <QString>

namespace v4script {

enum class Status {
    Completed,
    Failed,      // error of the program or of loading the language
    Interrupted, // the engine was interrupted: time limit, Runtime::stop(), QJSEngine::setInterrupted()
};

/**
 * @brief Outcome of one run
 */
struct Result {
    Status status = Status::Completed;
    // Value of the program, as the language shows it in an interactive
    // session (the last expression in Python, Go, C...; the stack in Forth);
    // empty - no value.
    QString value;
    QString error;       // text of the error; empty on success
    int errorLine = 0;   // line of the error, 1-based; 0 - unknown
    QString errorSource; // module where the error happened; empty - the unit that ran
    qint64 elapsedMs = 0;

    bool isOk() const
    {
        return status == Status::Completed;
    }

    /**
     * @brief "error (line 3)", "error (util.py, line 3)" or the error alone
     */
    QString describeError() const
    {
        if (!errorSource.isEmpty()) {
            return QString("%1 (%2, line %3)").arg(error, errorSource).arg(errorLine);
        }
        return errorLine > 0 ? QString("%1 (line %2)").arg(error).arg(errorLine) : error;
    }
};

} // namespace v4script

#endif // V4SCRIPT_RESULT_HPP
