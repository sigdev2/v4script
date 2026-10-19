// unique_ptr, shared_ptr and weak_ptr: ownership, custom deleters, cycles
// broken with weak_ptr, enable_shared_from_this and the order of
// destruction.
#include <iostream>
#include <memory>
#include <string>
#include <utility>
#include <vector>

struct Resource {
    std::string name;
    explicit Resource(std::string name) : name(std::move(name)) { std::cout << "open " << this->name << "\n"; }
    ~Resource() { std::cout << "close " << name << "\n"; }
};

struct Node {
    std::string name;
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> previous;
    explicit Node(std::string name) : name(std::move(name)) {}
    ~Node() { std::cout << "free node " << name << "\n"; }
};

class Session : public std::enable_shared_from_this<Session> {
public:
    std::shared_ptr<Session> self() { return shared_from_this(); }
    ~Session() { std::cout << "session ends\n"; }
};

std::unique_ptr<Resource> open(const std::string& name) { return std::make_unique<Resource>(name); }

void consume(std::unique_ptr<Resource> resource) { std::cout << "consume " << resource->name << "\n"; }

int main()
{
    {
        auto file = open("file");
        std::unique_ptr<Resource> moved = std::move(file);
        std::cout << (file == nullptr) << " " << moved->name << "\n";
        consume(std::move(moved));
        std::cout << "after consume\n";
    }

    std::unique_ptr<int[]> numbers(new int[4] { 1, 2, 3, 4 });
    numbers[2] = 30;
    std::cout << numbers[0] + numbers[2] << "\n";

    auto deleter = [](Resource* resource) {
        std::cout << "custom delete of " << resource->name << "\n";
        delete resource;
    };
    {
        std::unique_ptr<Resource, decltype(deleter)> custom(new Resource("socket"), deleter);
        std::cout << "using " << custom->name << "\n";
    }

    std::shared_ptr<Resource> shared = std::make_shared<Resource>("database");
    {
        std::shared_ptr<Resource> copy = shared;
        std::cout << "count " << shared.use_count() << "\n";
        std::vector<std::shared_ptr<Resource>> holders(3, shared);
        std::cout << "count " << shared.use_count() << "\n";
    }
    std::cout << "count " << shared.use_count() << "\n";
    std::weak_ptr<Resource> observer = shared;
    std::cout << observer.expired() << " " << observer.lock()->name << "\n";
    shared.reset();
    std::cout << observer.expired() << " " << (observer.lock() == nullptr) << "\n";

    {
        auto first = std::make_shared<Node>("first");
        auto second = std::make_shared<Node>("second");
        first->next = second;
        second->previous = first;
        std::cout << second->previous.lock()->name << " " << first.use_count() << " " << second.use_count() << "\n";
    }

    auto session = std::make_shared<Session>();
    auto again = session->self();
    std::cout << "sessions " << session.use_count() << "\n";
    session.reset();
    again.reset();

    std::shared_ptr<Resource> replaced(new Resource("old"));
    replaced.reset(new Resource("new"));
    std::unique_ptr<Resource> released(new Resource("kept"));
    Resource* raw = released.release();
    std::cout << (released ? "owned" : "released") << " " << raw->name << "\n";
    delete raw;
    std::cout << "end\n";
    return 0;
}

// Output:
// open file
// 1 file
// consume file
// close file
// after consume
// 31
// open socket
// using socket
// custom delete of socket
// close socket
// open database
// count 2
// count 5
// count 1
// 0 database
// close database
// 1 1
// first 2 2
// free node first
// free node second
// sessions 2
// session ends
// open old
// open new
// close old
// open kept
// released kept
// close kept
// end
// close new
