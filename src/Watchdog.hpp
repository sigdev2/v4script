#ifndef V4SCRIPT_WATCHDOG_HPP
#define V4SCRIPT_WATCHDOG_HPP

#include <chrono>
#include <condition_variable>
#include <mutex>
#include <thread>

class QJSEngine;

namespace v4script::internal {

/**
 * @brief Interrupts the engine when a run lasts longer than the limit.
 *
 * Its own thread waits for the deadline: code in the engine's thread may
 * never return to the event loop.
 */
class Watchdog {
public:
    explicit Watchdog();
    ~Watchdog();

    Watchdog(const Watchdog&) = delete;
    Watchdog& operator=(const Watchdog&) = delete;

    /**
     * @brief Starts counting; 0 or less - no limit
     */
    void arm(QJSEngine* engine, int milliseconds);

    /**
     * @brief Stops counting
     * @return True if the limit was reached and the engine interrupted
     */
    bool disarm();

private:
    std::mutex mutex; // protects engine, deadline, armed, fired and quit
    std::condition_variable condition;
    QJSEngine* engine = nullptr;
    std::chrono::steady_clock::time_point deadline;
    bool armed = false;
    bool fired = false;
    bool quit = false;
    // The last field: the thread reads the others as soon as it starts.
    std::thread thread;

    void watch();
};

} // namespace v4script::internal

#endif // V4SCRIPT_WATCHDOG_HPP
