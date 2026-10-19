#include "Watchdog.hpp"

#include <QJSEngine>

namespace v4script::internal {

Watchdog::Watchdog() :
        thread([this]() { watch(); })
{
}

Watchdog::~Watchdog()
{
    {
        std::lock_guard<std::mutex> lock(mutex);
        quit = true;
    }
    condition.notify_all();
    thread.join();
}

void Watchdog::arm(QJSEngine* engine, int milliseconds)
{
    {
        std::lock_guard<std::mutex> lock(mutex);
        this->engine = engine;
        armed = milliseconds > 0 && engine != nullptr;
        fired = false;
        deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(milliseconds);
    }
    condition.notify_all();
}

bool Watchdog::disarm()
{
    std::lock_guard<std::mutex> lock(mutex);
    armed = false;
    engine = nullptr;
    return fired;
}

void Watchdog::watch()
{
    std::unique_lock<std::mutex> lock(mutex);
    while (!quit) {
        if (!armed) {
            condition.wait(lock);
            continue;
        }
        if (condition.wait_until(lock, deadline) == std::cv_status::timeout && armed &&
            std::chrono::steady_clock::now() >= deadline)
        {
            // setInterrupted is the one method of QJSEngine that may be
            // called from another thread.
            engine->setInterrupted(true);
            fired = true;
            armed = false;
        }
    }
}

} // namespace v4script::internal
