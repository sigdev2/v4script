// Waiting: this_thread::sleep_for and usleep suspend the program, the
// host goes on; a function that waits makes its callers wait.
#include <chrono>
#include <functional>
#include <iostream>
#include <thread>
#include <unistd.h>

void tick(int n)
{
    for (int i = 0; i < n; ++i) {
        std::cout << "tick " << i << "\n";
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
    }
}

struct Worker {
    virtual ~Worker() = default;
    virtual int work(int x) = 0;
};

struct SlowWorker : Worker {
    int work(int x) override
    {
        usleep(1000);
        return 2 * x;
    }
};

int main()
{
    auto start = std::chrono::steady_clock::now();
    tick(3);
    std::function<void()> later = [] { std::this_thread::sleep_for(std::chrono::microseconds(500)); };
    later();
    SlowWorker slow;
    Worker& worker = slow;
    std::cout << worker.work(21) << "\n";
    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::steady_clock::now() - start);
    std::cout << (elapsed.count() >= 60) << "\n";
    std::cout << "done" << std::endl;
    return 0;
}

// Output:
// tick 0
// tick 1
// tick 2
// 42
// 1
// done
