# C++ code style

Version: 0.0.1

Rules for the C++ code of v4script. The language standard is C++17, the library is Qt 6 (the reference version is 6.4.1).

Every rule comes with an example. Where the reason is not obvious, a short note explains why the rule exists. Rules specific to Qt are collected in section 7; where Qt affects a general rule (object ownership, containers, lambdas), it is mentioned in place. The JavaScript style is described in [StyleGuide.JS.md](StyleGuide.JS.md).

Formatting (section 3) is done by clang-format with the settings of `.clang-format` in the repository root, so all examples in this document are written the way clang-format lays them out.

---

## 1. Naming

### Cheat sheet

| What is named                                     | Style                                                         | Example                                           |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------- |
| Classes, structs, `enum class`, `typedef`, `using` | UpperCamelCase                                                | `CsvWriter`, `Direction`                          |
| Members of an `enum class`                        | UpperCamelCase, no prefix                                     | `Direction::North`                                |
| A plain (unscoped) `enum` and its members         | SCREAMING_SNAKE_CASE, members prefixed with the name of the enum | `TRACK_LIST_ROLE_ARTIST`                       |
| Static constants                                  | SCREAMING_SNAKE_CASE                                          | `MAX_SPEED_KMH`                                   |
| Variables of any kind, functions and methods      | lowerCamelCase without a prefix                               | `stockLevel`, `playTrack()`                       |
| Getters and setters                               | `get` / `set` + the name of the property; booleans `is` / `has` | `getBrightness()`, `setBrightness()`, `isMuted()` |
| Namespace of a module                             | one short lowercase word                                      | `v4script`, `internal`                            |
| Namespace as a set of free functions              | UpperCamelCase, like a class                                  | `ColorMath`                                       |
| Files                                             | as the name of the class or namespace                         | `PlaylistManager.hpp`                             |
| Names of Qt objects (`setObjectName`)             | UpperCamelCase                                                | `"HeartbeatTimer"`                                |

### Types

Names of classes, structs, `enum class` and of `typedef` and `using` aliases are written in UpperCamelCase.

An abbreviation in a name is written as an ordinary word: only the first letter is capital.

```cpp
class ThumbnailCache;
class CsvWriter;  // not CSVWriter
class GpsTracker; // not GPSTracker
struct ShipmentInfo;
enum class Direction;
using Heading = Direction;
```

**Why:** word boundaries stay visible even with several abbreviations in a row - `RgbToHsvConverter` reads more easily than `RGBToHSVConverter`.

### Enumerations

`enum class` is the default. The name and the members are in UpperCamelCase, without a prefix: a member is reached through the name of the type anyway (`Direction::North`).

```cpp
enum class Direction {
    North,
    East,
    South,
    West
};
```

A plain `enum` (without `class`) is allowed only where an implicit conversion to `int` is needed, for example for the roles of Qt models. The name and the members are written in SCREAMING_SNAKE_CASE, and every member starts with the name of the enum itself:

```cpp
enum TRACK_LIST_ROLE {
    TRACK_LIST_ROLE_ARTIST = Qt::UserRole + 1,
    TRACK_LIST_ROLE_DURATION
};
```

**Why `enum class`:** its members do not leak into the enclosing scope and do not turn into `int` behind the author's back.

**Why the prefix of a plain enum:** its members leak into the enclosing scope, and without a prefix a name clash is easy (for example, two different enums with a member `Unknown`).

### Constants

Static constants - both class members and file-level constants in a `.cpp` - are written in SCREAMING_SNAKE_CASE (how to declare them is in section 5):

```cpp
constexpr int SENSOR_POLL_INTERVAL_MS = 2000;
```

### Variables and functions

All variables (local, static, class members) and all functions (methods and free functions) are in lowerCamelCase. A static variable that is not a constant is lowerCamelCase too (`sampleCount` below).

```cpp
class WeatherStation : public QObject {
    ...

protected:
    static void resetCalibration();

private:
    CsvWriter* measurementLog = nullptr;

    void readNextSample();
};

namespace {

void logSensorFailure()
{
    ...
}

} // namespace

void WeatherStation::readNextSample()
{
    static int sampleCount = 0;
    QTimer warmupTimer;
    logSensorFailure();
    ...
}
```

Prefixes and suffixes that tell what kind of variable it is are not written:

- class fields have no `m_`, no leading underscore (`_retryCount`) and no trailing one (`retryCount_`);
- static and global variables have no `s_` and `g_`;
- the type is not written into the name (Hungarian notation): not `nCount`, `pReply`, `bPaused`, `strFileName`, `m_nRetryCount`.

```cpp
class DownloadQueue : public QObject {
    ...

private:
    int retryCount = 0;             // not m_retryCount, _retryCount, retryCount_, m_nRetryCount
    QNetworkReply* reply = nullptr; // not m_pReply, pReply
    bool paused = false;            // not m_bPaused, bPaused
};

void DownloadQueue::start(const QUrl& url)
{
    static int startCount = 0;               // not s_startCount
    const QString fileName = url.fileName(); // not strFileName, sFileName
    ...
}
```

Names of foreign APIs stay as they are: fields of Win32 structures (`msg->wParam`), xcb functions (`xcb_flush`), the standard library. A name like `test_data` is allowed where Qt Test requires it.

**Why:** that a name is a field is visible from the declaration and the highlighting of the editor, and the type from the type itself. The compiler does not check a prefix: after a change of the type (`int` → `qint64`) `nCount` starts to lie, and nobody remembers to rename it. A field and a parameter of the same name are told apart with `this->` (see "Getters and setters").

### Getters and setters

- A method that returns a property is `get` + the name of the property.
- A method that changes a property is `set` + the name of the property.
- Boolean properties are read through `is` / `has`, without `get`.
- If a parameter has the same name as a field, the field is reached through `this->`.

```cpp
int getBrightness() const;
void setBrightness(int brightness);

bool isMuted() const;
bool hasSubtitles() const;

void DisplayPanel::setBrightness(int brightness)
{
    this->brightness = brightness;
}
```

The public API of version 0.1 has getters without `get` (`Runtime::timeLimit()`, `Engine::host()`, `Engine::modules()`); they stay as they are so as not to break the API, new getters follow the rule.

**Why `get`:** class fields have no prefix, so a getter `brightness()` would clash with the field `brightness`.

### Namespaces

There are two kinds of namespaces:

- **The namespace of a module** groups the classes of one part of the program. The name is one short lowercase word: all of v4script is in `v4script`, its private helpers shared by several files are in `v4script::internal`.
- **A set of free functions** replaces a class that would have only static methods. The name is in UpperCamelCase, like a class, and the set lives in a file of the same name: `ColorMath::blend()` is declared in `ColorMath.hpp`.

The content of a namespace is not indented, and the closing brace is marked with a comment. `using namespace` is forbidden in header files.

```cpp
namespace v4script {

class BackupArchive {
    ...
};

} // namespace v4script

namespace ColorMath {

QColor blend(const QColor& first, const QColor& second, double ratio);

} // namespace ColorMath
```

**Why `using namespace` is forbidden in headers:** it acts in every file that includes the header and may unexpectedly cause name clashes.

### Files

Every class (except small helpers) lives in its own pair of files `.hpp` / `.cpp`. The name of the file matches the name of the class, including the case: `PlaylistManager.hpp`, `PlaylistManager.cpp`. Headers of the public API are in `include/v4script/`, everything else in `src/`.

### Names of Qt objects

Strings passed to `QObject::setObjectName()` follow the same rule as type names - UpperCamelCase:

```cpp
heartbeatTimer->setObjectName("HeartbeatTimer");
```

---

## 2. Declaring a class or a struct

### The opening brace

A class or a struct has its `{` at the end of the line (the body of a function is the opposite, see section 3):

```cpp
class RecipeBook {
    ...
};
```

### The order of class members

Sections go in the order `public` → `protected` → `private`, and inside every section the members have a fixed order. It is easiest to remember as a template:

```cpp
class IrrigationController : public QObject {
    Q_OBJECT

public:
    // 1. Static constants
    static constexpr int DEFAULT_ZONE_COUNT = 8;

    // 2. Static methods
    static QString getFirmwareVersion();

    // 3. Constructors
    explicit IrrigationController(const QString& name, QObject* parent = nullptr);

    // 4. Destructor
    virtual ~IrrigationController() override;

    // 5. Non-static methods (including operators)
    void setSchedule(const WateringSchedule& schedule);
    double getWaterUsage() const;

signals:
    // 6. Signals
    void moistureChanged(int zone, double moisturePercent);

protected:
    // 7. Static constants
    // 8. Static methods
    // 9. Constructors
    // 10. Non-static methods
    virtual void timerEvent(QTimerEvent* event) override;

private:
    // 11. Static constants
    static constexpr int MAX_VALVE_OPEN_SECONDS = 900;

    // 12. Non-static constants
    const QString gardenName;
    QTimer* const valveTimer;

    // 13. Static variables
    static int controllerCount;

    // 14. Non-static variables
    double waterUsage = 0.0;

    // 15. Static methods
    static void registerController();

    // 16. Non-static methods
    void openNextValve();
};
```

Note:

- non-static data members are declared only in `private`. The exception is plain data structs whose fields are all public (like `ShelfPosition` in section 5);
- in `private`, **all data** comes first, then **all methods**;
- among the data, **all constants** come first - static, then non-static (what is declared `const`, see "Immutable fields - `const`" below) - and only then the variables. A reference field, like a constant pointer, cannot be redirected to another object, so it goes with the constants;
- slots are not used (see section 7).

**Why constants before variables:** the declaration of the class shows at once what is set when the object is created and never changes afterwards, and what makes up its mutable state.

### Nested types

Types declared inside a class (usually enumerations) go to one of two places:

- the beginning of the `public` / `protected` / `private` section;
- right before their first use.

```cpp
class ChartRenderer : public QObject {
    Q_OBJECT

public:
    enum class ColorScheme { // at the beginning of the section
        Light,
        Dark
    };

    explicit ChartRenderer(QObject* parent = nullptr);

    enum class AxisScale { // right before the first use
        Linear,
        Logarithmic
    };
    void setAxisScale(AxisScale scale);
    ...
};
```

### Constructors and conversion operators - `explicit`

All constructors are declared `explicit`. The same holds for conversion operators (`operator bool()`, `operator QString()` and the like). The exception is a case where an implicit conversion is really needed; such a decision must be justified.

```cpp
class ValidationResult {
public:
    explicit ValidationResult(int issueCount);

    explicit operator bool() const; // if (check) works, int issues = check does not
    ...
};
```

**Why:** without `explicit` the compiler may silently create an object or convert it to another type where nobody expected it.

### Virtual functions - `virtual` and `override`

An overriding virtual function, including the destructor, is declared with both `virtual` and `override`:

```cpp
virtual ~IrrigationController() override;
virtual void timerEvent(QTimerEvent* event) override;
```

**Why:** `virtual` shows at once that the function is virtual, and `override` makes the compiler check that it really overrides a function of the base class. A typo in the name or the signature becomes a compilation error.

### Initializing fields

- Fields of built-in types and pointers that are not declared `const` are initialized right in the declaration: `double waterUsage = 0.0;`, `ValveDriver* valveDriver = nullptr;`. How constant fields get their values - see "Immutable fields - `const`" below.
- Everything that depends on the arguments of the constructor is set in the initializer list, not by assignment in the body of the constructor.
- The order of the initializer list matches the order in which the fields are declared.

```cpp
IrrigationController::IrrigationController(const QString& name, QObject* parent) :
        QObject(parent),
        gardenName(name),
        valveTimer(new QTimer(this))
{
}
```

**Why:** an uninitialized field is a source of random errors. And fields are always initialized in the order of declaration, whatever order the list is written in, so a mismatch only misleads.

### Immutable fields - `const`

A field that gets its value in the declaration or in the initializer list of the constructor and never changes afterwards is declared `const`. For a pointer, the pointer itself is made constant, not the object it points to: for a raw pointer `const` goes after `*`, for a smart pointer before the type (see "Constant pointers" in section 5).

```cpp
class PhotoKiosk : public QWidget {
    ...

private:
    const QString kioskName;
    QPushButton* const printButton;                // the pointer is fixed, not the button
    const std::unique_ptr<ReceiptPrinter> printer; // owned for the whole life of the kiosk
    const std::shared_ptr<PriceList> priceList;

    int printedCount = 0;
};

PhotoKiosk::PhotoKiosk(const QString& name, const std::shared_ptr<PriceList>& priceList, QWidget* parent) :
        QWidget(parent),
        kioskName(name),
        printButton(new QPushButton("Print", this)),
        printer(std::make_unique<ReceiptPrinter>()),
        priceList(priceList)
{
}
```

`const QPushButton* printButton` is something else: a pointer to a button that cannot be changed through it, while the pointer itself can be reassigned.

- A constant raw pointer or a field of a built-in type that is set in the initializer list gets no `= nullptr` or `= 0` in its declaration: then, if some constructor forgets to initialize it, the compiler reports an error.
- A field that gets its value in the body of the constructor or in a method called from it (for example, the object is created only under some condition) stays a variable.
- A `const std::unique_ptr` can be neither reset (`reset()`) nor moved: the object lives as long as its owner. If it must be deleted or replaced earlier, the field stays a variable.
- Constants are declared before variables (see "The order of class members"), and fields are initialized in the order of declaration. So in the initializer list a constant cannot take its value from a variable field: that one is not initialized yet.

The rule does not apply to copyable types - plain data structs and value classes (like `LicensePlate` in section 5). A constant field forbids assignment of objects (`a = b`), and such a type can no longer be sorted or removed from the middle of a container. Descendants of `QObject` are not affected: they are neither copied nor assigned.

**Why:** the declaration shows which fields are set once when the object is created, and a reader does not need to look for other places that change them. An accidental assignment to such a field is a compilation error.

---

## 3. Formatting

### clang-format

The code is formatted by clang-format with the settings of `.clang-format` in the repository root. The reference version is clang-format 15, the one bundled with Qt Creator: the code is formatted with exactly that version. Newer versions wrap some cases differently (nested calls, concatenated string literals, calls with a lambda that is not the last argument, alignment of trailing comments), and a file formatted by them gives spurious changes. The rules of this section explain why the code looks the way it does; there is no need to follow them by hand - formatting the file is enough:

```bash
clang-format -i src/Engine.cpp
```

Data tables that clang-format would lay out in a way that is hard to read (lists of keywords, mappings in a `switch` with one line per value) are wrapped in the comments `// clang-format off` and `// clang-format on`.

Keys that clang-format 15 does not know must not be added to `.clang-format`: on an unknown key the old version refuses to format the file.

### Indentation and line length

- Indentation is 4 spaces; tabs are not used.
- A line is at most 120 characters long.
- `*` and `&` stick to the type: `Sensor* sensor`, `const QString& nickname`.

### Spaces around binary operators

| Right                                 | Wrong                             |
| ------------------------------------- | --------------------------------- |
| `if (speed == speedLimit)`            | `if (speed==speedLimit)`          |
| `int weight = netWeight + packaging;` | `int weight=netWeight+packaging;` |
| `if (isCharged() && isConnected())`   | `if (isCharged()&&isConnected())` |

### Parentheses in compound expressions

Parentheses are mandatory where the order of operations is easy to confuse:

- when `&&` and `||` are mixed;
- with bitwise operations next to a comparison, arithmetic or other bitwise operations;
- with shifts inside a more complex expression.

```cpp
if ((isCharged() && isConnected()) || manualOverride) {
    ...
}
if ((permissions & WRITE_ACCESS_BIT) != 0) { // without parentheses it is permissions & (WRITE_ACCESS_BIT != 0)
    ...
}
int color = (red << 16) | (green << 8) | blue;
```

Ordinary arithmetic needs no parentheses:

```cpp
int seatNumber = firstSeat + row * seatsPerRow;
```

**Why:** everybody knows that `*` goes before `+`, but not everybody remembers the precedence of `&` relative to `!=` or of `&&` relative to `||`, and the compiler often lets mistakes in such expressions through.

### Empty lines

- Inside a function, logical blocks are separated by **one** empty line. Two or more empty lines in a row are not allowed.
- Between implementations of functions in one file - exactly **one** empty line.
- In a class declaration, an empty line goes before `public:` / `protected:` / `private:` / `signals:` (except a specifier at the very beginning of the class), none after it.

```cpp
void TicketOffice::onSeatReserved(const Seat& seat, BookingId bookingId)
{
    checkSeatAvailability(seat);

    bookingRegistry->confirm(bookingId);
    if (mailer != nullptr) {
        mailer->sendConfirmation(bookingId);
    }

    refreshSeatMap();
    printTicket(bookingId);
}

void TicketOffice::onBookingWithdrawn(BookingId bookingId)
{
    bookingRegistry->release(bookingId);
    cashDesk->cancelCharge(bookingId);

    refreshSeatMap();
}
```

### Braces

- The body of a function: `{` and `}` on lines of their own.
- A class, a struct, an `enum`, a `namespace`, `if` / `else` / `for` / `while` / `switch`, a lambda: `{` at the end of the line.
- The exception is `if` / `else if` / `for` / `while` whose header does not fit on one line: their `{` goes on a line of its own.
- `else` is written on the same line as the closing brace: `} else {`.
- The body of `if`, `else`, `for`, `while` is always in braces, even when it is a single line.

```cpp
// a class: at the end of the line
class GreenhouseMonitor {
    ...
};

// a function: on a new line
void GreenhouseMonitor::refresh()
{
    // if / else: at the end of the line, braces are mandatory
    if (plants.empty()) {
        scanShelves();
    } else {
        updateReadings();
    }

    // a header of several lines: on a new line
    if (irrigationController->isWateringInProgress() &&
        irrigationController->getActiveZone() == ventilationController->getActiveZone())
    {
        postponeVentilation();
    }

    // a lambda: at the end of the line
    connect(humiditySensor, &HumiditySensor::readingChanged, this, [this](double humidity) {
        humidityChart->addReading(humidity);
        updateReadings();
    });
}
```

**Why mandatory braces:** a line added to the body of an `if` without braces looks like part of the condition but always runs.

**Why `{` on a line of its own after a multi-line header:** the continuation of the condition and the body get the same indentation and merge; a separate line with the brace divides them.

With an `else if` that has a long condition, clang-format moves the whole condition to the next line:

```cpp
if (plants.empty()) {
    scanShelves();
} else if (
    irrigationController->isWateringInProgress() &&
    irrigationController->getActiveZone() == ventilationController->getActiveZone())
{
    postponeVentilation();
}
```

### Breaking long lines

A line that does not fit into 120 characters is broken so that it is visible that the expression goes on:

- after the opening parenthesis - then the arguments go on the following lines with an indentation of 4, **one per line**;
- after an operator (`&&`, `||`, `+` and the like) and after a comma - the operator stays at the end of the line;
- after the colon before the initializer list of a constructor - the list goes with a double indentation (8), one field per line.

The exceptions, as in Qt: the operator `<<` / `>>` and the parts of the ternary operator `?` and `:` move **to the beginning** of the next line.

Arguments are not aligned with the first argument.

```cpp
// The operator - at the end of the line:
if (elevator->isDoorClosed() && !elevator->isOverloaded() && !fireAlarm->isActive() &&
    maintenanceSchedule->isInspectionValid(elevator->getSerialNumber()))
{
    return true;
}

// The opening parenthesis - at the end of the line, one argument per line:
const auto translator = new SubtitleTranslationCoordinator(
    languageDetector,
    glossaryStorage->getTerminologyModel(),
    onlineDictionaryClient,
    this);

// The colon of the initializer list - at the end of the line:
HeartbeatMonitor::HeartbeatMonitor(QObject* parent) :
        QObject(parent),
        pulseTimer(new QTimer(this))
{
}

// << and the ternary operator - at the beginning of the line:
qWarning() << "Failed to open the delivery manifest" << manifestPath << "for route" << routeNumber
           << manifestFile.errorString();
const QString caption = shipment.getRecipientName().isEmpty()
    ? QString("Shipment %1 without a recipient").arg(shipment.getTrackingNumber())
    : shipment.getRecipientName();
```

**Why break after the parenthesis instead of aligning with the first argument:** with a long function name the aligned arguments go beyond 120 characters, and after the function is renamed they have to be aligned again.

**Why `?` and `:` at the beginning of the line:** the left edge shows at once that this is a ternary operator and where each branch starts - there is no need to look for a `:` at the end of a long line, where it is easy to confuse with `::`, the string `":"` or the colon of a nested expression. Both branches start in the same column and are easy to compare. Qt and all built-in styles of clang-format (LLVM, Google, Chromium, Mozilla, WebKit) break the same way.

A ternary operator inside another ternary operator is not written - see "Complex conditions and nested ternary operators" in section 5.

### One-line lambdas

A lambda is written on one line if its body is a single statement without a variable declaration (a function call, nested calls included, a `return` of an expression, an assignment) and the line fits into 120 characters. A lambda of several statements is written on several lines. clang-format does this itself.

```cpp
connect(stopButton, &QPushButton::clicked, this, [this]() { conveyor->stop(); });
std::sort(parcels.begin(), parcels.end(), [](const Parcel& a, const Parcel& b) { return a.weight < b.weight; });

connect(scanner, &BarcodeScanner::scanned, this, [this](const QString& code) {
    const auto parcel = registry->findParcel(code);
    sorter->route(parcel);
});
```

### `switch`

`case` is written at the level of `switch`, the body of a `case` is indented, on a line of its own.

```cpp
switch (signalColor) {
case SignalColor::Red:
    train->stop();
    break;
case SignalColor::Yellow:
    train->slowDown();
    break;
case SignalColor::Green:
    break;
}
```

If the body of a `case` declares a variable, the whole body of that `case` is put into braces: `{` at the end of the line with `case`, `}` at the level of `case`, `break` inside the braces. clang-format does not add these braces; they are written by hand.

```cpp
switch (signalColor) {
case SignalColor::Red: {
    const int stopSeconds = platform->getStopSeconds();
    train->stop(stopSeconds);
    break;
}
case SignalColor::Yellow:
    train->slowDown();
    break;
case SignalColor::Green:
    break;
}
```

**Why:** without braces the variable is visible in the following `case` labels too, although it is initialized only in its own. A jump to a label past an initialization is a compilation error, but a declaration without an initializer (`int count;`) compiles, and a neighboring `case` can read an uninitialized value.

When a `switch` needs `default` - see "`switch` over an `enum class`" in section 5.

---

## 4. Header files

### Quotes or angle brackets

- Headers of v4script are in quotes. A public header is included by its path from `include/`: `"v4script/Engine.hpp"`; a private header of `src/` by its name: `"Internal.hpp"`. `../` is not used.
- Qt, other third-party libraries, the standard library and system headers are in angle brackets. An application includes the headers of v4script in angle brackets too: `<v4script/V4Script.hpp>`.

**Why the `v4script/` path:** the line of the `#include` shows at once that the header belongs to the public API, and it is the same path an application uses.

### The order of `#include`

In a `.cpp`, its own header is included first. Then come the groups:

1. Other public headers of v4script (`"v4script/..."`) - in the same group as the own header, right after it.
2. Private headers of `src/`.
3. Qt and other third-party libraries.
4. The standard library and system headers.

The groups **must** be separated by an empty line; inside a group the files go in alphabetical order (clang-format sorts them and keeps the own header first). Headers included under a condition (`#ifdef Q_OS_ANDROID`) go after all groups.

```cpp
// src/Languages.cpp
#include "v4script/Languages.hpp"
#include "v4script/Version.hpp"

#include "Internal.hpp"

#include <QFile>
#include <QJSEngine>
#include <QJsonArray>
#include <QJsonDocument>
#include <QtGlobal>

#if defined(Q_OS_LINUX) && !defined(Q_OS_ANDROID)
#include <sys/resource.h>

#include <algorithm>
#endif
```

**Why its own header first:** if it lacks some `#include`, the error shows at once when its `.cpp` is compiled, not somewhere in a foreign file.

**Why empty lines between the groups:** clang-format sorts `#include` lines only inside a block without empty lines. Without separators it would mix the groups.

### Forward declarations

If a header uses a type only through a pointer or a reference, a forward declaration is enough instead of an `#include`:

```cpp
class QJSEngine; // instead of #include <QJSEngine>

class Runtime : public QObject {
    ...

private:
    QJSEngine* engine = nullptr;
};
```

**Why:** fewer dependencies between headers - faster compilation and fewer rebuilds of the whole project because of a change in one file.

### Include guards

Every header is protected by a guard of the form `V4SCRIPT_FILENAME_EXTENSION`. The file name is turned to upper case as a whole, no underscores are added between words (`HostModule.hpp` → `V4SCRIPT_HOSTMODULE_HPP`). After `#endif` comes a comment with the same name.

```cpp
// HostModule.hpp
#ifndef V4SCRIPT_HOSTMODULE_HPP
#define V4SCRIPT_HOSTMODULE_HPP

...

#endif // V4SCRIPT_HOSTMODULE_HPP
```

**Why the prefix:** the headers of the library are compiled together with the headers of an application, and a guard `RUNTIME_HPP` could clash with the application's own `Runtime.hpp`.

---

## 5. Implementation

### Helper code - only in the `.cpp`

If a function is needed to implement a class but does not touch any of its members, it must not be a method. It is written in the `.cpp` as a free function in an unnamed namespace and is not declared in the header.

The same goes for constants that only the implementation needs: they are declared and defined only in the `.cpp`, in the same unnamed namespace.

```cpp
// src/TrackPlayer.cpp
namespace v4script {

namespace {

constexpr int CROSSFADE_DURATION_MS = 1500;

QString formatDuration(int seconds)
{
    ...
}

} // namespace

void TrackPlayer::play(const Track& track)
{
    ...
    const auto durationText = formatDuration(track.lengthSeconds);
    ...
}

} // namespace v4script
```

**Why:** the header stays short and describes only the interface of the class, and a change of such a function does not force a recompilation of everything that includes the header. The unnamed namespace keeps helper types (structs, small classes) local to the file as well, which `static` cannot do.

### Constants: `constexpr` and `static const`

For constants whose value is known at compile time, `constexpr` is preferred. A file-level constant in a `.cpp` may also be declared simply `const`.

A class constant whose value is known at compile time is declared only `static constexpr` and gets its value right in the class. For types that cannot be `constexpr` (`QString`, `QColor`, containers), `static const` is used: the constant is declared in the class and defined in the `.cpp`.

```cpp
class ParkingMeter {
    ...

private:
    static constexpr int MAX_PARKING_MINUTES = 240;
    static constexpr const char* TARIFF_SETTING = "parking/tariff";
    static const QString RECEIPT_HEADER; // defined in ParkingMeter.cpp
};
```

**Why `constexpr`:** the value is guaranteed to be computed at compile time, and the constant can be used where a constant expression is required (an array size, `static_assert`, a template argument).

**Why not `static const int` in a class:** such a field is only declared in the class. As soon as it is passed by reference - and `qBound`, `std::max`, `QCOMPARE` take values by `const&` - it also needs a definition in the `.cpp`, otherwise the program does not link. Moreover, the error usually shows only in a debug build: in a release build the optimizer substitutes the value, and no definition is needed. A `static constexpr` field is implicitly `inline` in C++17, that is, already defined in the class.

### `inline` is not written

The keyword `inline` is not used in the code of the project, nor are `Q_ALWAYS_INLINE`, `__forceinline` and `__attribute__((always_inline))`.

- Whether to inline a function at the call site is the compiler's own decision, and `inline` hardly affects it. In practice `inline` means something else: the definition of a function or a variable may be repeated in several translation units.
- Where this is needed, `inline` is already implied: for methods defined in the body of a class, for `constexpr` functions and for `static constexpr` fields. Templates do not need it.
- `inline` would have to be written explicitly only for an ordinary function or variable defined in a header. Such code moves to the `.cpp`: a helper function into an unnamed namespace (see "Helper code - only in the `.cpp`"), and if several files need the function, only its declaration stays in the header. A class constant is declared `static constexpr` or defined in the `.cpp` (see the previous rule).

```cpp
// Wrong: the implementation is in the header
// PriceFormat.hpp
namespace PriceFormat {

inline QString formatCents(int cents)
{
    ...
}

} // namespace PriceFormat

// Right: only the declaration is in the header
// PriceFormat.hpp
namespace PriceFormat {

QString formatCents(int cents);

} // namespace PriceFormat

// PriceFormat.cpp
QString PriceFormat::formatCents(int cents)
{
    ...
}
```

**Why:** `inline` does not make the program faster, and an implementation in a header ends up in every file that includes it, and any change of it forces a recompilation of all of them.

### Early return

Checks after which there is no point in going on are made at the beginning of the function with an immediate `return` (in a loop - `continue`), and the main logic follows without nesting. After `return`, `continue` or `break` no `else` branch is written.

```cpp
// Right: checks at the beginning, the main logic without nesting
void ParcelLocker::dispense(const QString& pickupCode)
{
    const auto cell = findCell(pickupCode);
    if (cell == nullptr) {
        display->showError("Unknown pickup code");
        return;
    }
    if (cell->isJammed()) {
        serviceDesk->reportJam(cell->getNumber());
        return;
    }

    cell->unlock();
    history->recordPickup(cell->getNumber(), pickupCode);
}

// Wrong: the main logic goes deep
void ParcelLocker::dispense(const QString& pickupCode)
{
    const auto cell = findCell(pickupCode);
    if (cell != nullptr) {
        if (!cell->isJammed()) {
            cell->unlock();
            history->recordPickup(cell->getNumber(), pickupCode);
        } else {
            serviceDesk->reportJam(cell->getNumber());
        }
    } else {
        display->showError("Unknown pickup code");
    }
}
```

**Why:** the reader does not have to keep all nested conditions in mind, and the handling of an error stands next to its check, not at the end of the function.

### Complex conditions and nested ternary operators

A condition nested deeper than two levels is split: a part of the expression goes into a constant variable whose name explains its meaning. Levels are counted by the parentheses that group operations (the parentheses of a function call do not count): `a && b` is one level, `(a && b) || c` two, `((a && b) || c) && d` three.

A ternary operator inside another ternary operator, including a chain `a ? x : b ? y : z`, also goes into a constant variable.

```cpp
// Wrong: three levels of nesting, the meaning of the condition has to be restored from the parentheses
if ((order->isPaid() && (warehouse->hasStock(order->getItems()) || supplier->canDeliverToday())) ||
    customer->isPriority())
{
    courier->dispatch(order);
}

// Right: a part of the condition got a name
const bool readyToShip = order->isPaid() && (warehouse->hasStock(order->getItems()) || supplier->canDeliverToday());
if (readyToShip || customer->isPriority()) {
    courier->dispatch(order);
}

// Wrong: a ternary operator inside a ternary operator
const QString caption = document.isEncrypted()
    ? QString("Encrypted with %1").arg(document.hasKeyFile() ? "a key file" : "a password")
    : QString("Not encrypted");

// Right:
const QString keyKind = document.hasKeyFile() ? "a key file" : "a password";
const QString caption = document.isEncrypted() ? QString("Encrypted with %1").arg(keyKind) : QString("Not encrypted");
```

Not everything can be moved out. A constant variable is always evaluated, while the right side of `&&` / `||` and the branches of a ternary operator only when their turn comes. So a part of an expression that is valid only after a check moves out together with that check. If this does not work out or the evaluation is expensive (disk, network), an `if` or a helper function with an early return is written instead of a variable:

```cpp
// Wrong: route->isBlocked() is called even when route == nullptr
const int detourMinutes = route->isBlocked() ? DETOUR_MINUTES : 0;
const int arrivalMinutes = route != nullptr ? route->getMinutes() + detourMinutes : UNKNOWN_ARRIVAL;

// Right: the check and the expression that depends on it are in a separate function
int getArrivalMinutes(const Route* route)
{
    if (route == nullptr) {
        return UNKNOWN_ARRIVAL;
    }
    return route->isBlocked() ? route->getMinutes() + DETOUR_MINUTES : route->getMinutes();
}
```

**Why:** the name of the variable explains a part of the condition that would otherwise have to be taken apart by the parentheses, and the debugger shows its value. In a nested ternary operator one has to count the `?` and `:` to see which `:` belongs to which `?`.

### Declarations and assignments in conditions

Variables are not declared in the header of `if`, `switch` and `while` - neither in the condition itself (`if (auto x = f())`) nor in the init statement (`if (auto x = f(); x != nullptr)`) - and values are not assigned there (`if ((x = f()) != nullptr)`). A variable is declared or assigned by a separate statement before the statement.

The header of `for` is not affected: the loop counter and the variable of a range-based loop (`for (const auto& order : orders)`) are declared in it as usual.

```cpp
// Wrong: courier is declared in the condition, the main logic is inside the if
for (const auto& order : orders) {
    if (const auto courier = findCourier(order); courier != nullptr) {
        courier->assign(order);
        dispatchBoard->markAssigned(order, courier->getName());
    }
}

// Right:
for (const auto& order : orders) {
    const auto courier = findCourier(order);
    if (courier == nullptr) {
        continue;
    }
    courier->assign(order);
    dispatchBoard->markAssigned(order, courier->getName());
}

// Wrong: a declaration in the condition of while and an implicit conversion to bool
while (std::unique_ptr<QLayoutItem> item { presetLayout->takeAt(0) }) {
    item->widget()->deleteLater();
}

// Right:
while (presetLayout->count() > 0) {
    std::unique_ptr<QLayoutItem> item { presetLayout->takeAt(0) };
    item->widget()->deleteLater();
}

// Wrong: an assignment in the condition
if ((activeRoute = planner->findRoute(destination)) != nullptr) {
    navigator->follow(activeRoute);
}

// Right:
activeRoute = planner->findRoute(destination);
if (activeRoute != nullptr) {
    navigator->follow(activeRoute);
}
```

**Why:**

- a variable declared in a condition is not visible after the statement, so an early return does not work with it: the check and the main logic end up inside the `if`;
- a header that both declares and checks gets long, and the check in it is easy to miss when reading;
- `if (auto x = f())` and `while (T x { ... })` rely on an implicit conversion to `bool`, while pointers are compared with `nullptr` explicitly (see "Pointers and `nullptr`");
- an assignment in a condition looks like a typo for `==`, and the reader has to find out what was meant.

The C++ Core Guidelines (ES.6) advise the opposite - to declare the variable in the condition to narrow its scope. In this project the early return matters more: a variable declared before the `if` is visible to the end of the block, but in a short block this does no harm.

### `switch` over an `enum class`

- A `switch` over an `enum class` either lists all of its members or has a `default`. If only some values need handling and nothing has to be done for the rest, an `if` is written instead of a `switch`.
- Listing all members without `default` is preferred: then, when a new member is added to the enumeration, the compiler warns about every `switch` that forgot to handle it (clang by default, GCC with `-Wall`). `default` hides such places - the new member silently falls into the default branch. So `default` is written when most values are handled the same way.
- If every `case` of a `switch` without `default` returns a value, a `return` is still written after the `switch`: an `enum class` variable may hold a value outside the enumeration (for example, after a `static_cast` from a number read from a file), and without the `return` GCC warns that the function may end without returning anything.

```cpp
// All members are listed, no default: the compiler will warn about a new member of SignalColor
QString getSignalName(SignalColor color)
{
    switch (color) {
    case SignalColor::Red:
        return "red";
    case SignalColor::Yellow:
        return "yellow";
    case SignalColor::Green:
        return "green";
    }
    return "red"; // a value outside the enumeration, for example after a static_cast from a number
}

// Most values are handled the same way: default
QString getFailureText(DeliveryResult result)
{
    switch (result) {
    case DeliveryResult::AddressNotFound:
        return "Address not found";
    case DeliveryResult::RecipientAbsent:
        return "Recipient was not at home";
    default:
        return "Delivery failed";
    }
}

// Wrong: one member of three is handled, no default
switch (signalColor) {
case SignalColor::Red:
    train->stop();
    break;
}

// Right:
if (signalColor == SignalColor::Red) {
    train->stop();
}
```

### Comparison operators

- C++17 does not derive comparison operators: a type that is compared gets `operator==` and `operator!=`; a type that needs an order gets `operator<` too, and `>`, `<=`, `>=` only if the code uses them.
- Each operator compares the same fields in the same order: through `std::tie`, or by calling another operator (`!=` through `==`).
- The operators are declared as members of the class. All constructors are `explicit`, so the left operand needs no implicit conversion that only a free operator would allow.

```cpp
struct ShelfPosition {
    int aisle = 0;
    int shelf = 0;

    bool operator==(const ShelfPosition& other) const;
    bool operator!=(const ShelfPosition& other) const;
    bool operator<(const ShelfPosition& other) const;
};

bool ShelfPosition::operator==(const ShelfPosition& other) const
{
    return std::tie(aisle, shelf) == std::tie(other.aisle, other.shelf);
}

bool ShelfPosition::operator!=(const ShelfPosition& other) const
{
    return !(*this == other);
}

bool ShelfPosition::operator<(const ShelfPosition& other) const
{
    return std::tie(aisle, shelf) < std::tie(other.aisle, other.shelf);
}

class LicensePlate {
public:
    explicit LicensePlate(const QString& number, const QString& region);

    bool operator==(const LicensePlate& other) const;
    bool operator!=(const LicensePlate& other) const;

private:
    QString plateNumber;
    QString regionCode;
};
```

**Why `std::tie`:** the fields are listed once in each operator and in the same order, and the comparison is lexicographic without hand-written chains of `if`.

### Object ownership

- A raw pointer means "does not own".
- An object owned by a class or a function is kept in a `std::unique_ptr` and created with `std::make_unique`. `std::shared_ptr` - only if the ownership is really shared.
- Descendants of `QObject` are created with `new` and a parent, which deletes them. A `QObject` without a parent is kept in a `std::unique_ptr` or deleted through `deleteLater()`.
- An object that a Qt API hands over to the caller (`QLayout::takeAt()`, `QListWidget::takeItem()`) goes into a `std::unique_ptr` at once.
- A manual `delete` is not used. The exception is a `QObject` that must be deleted immediately when `deleteLater()` does not fit (for example, a new object is created in its place at once, or the code that follows relies on the old one being gone). Such a `delete` comes with a comment on why not `deleteLater()`.

```cpp
class CameraRig : public QObject {
    ...

private:
    std::unique_ptr<FrameEncoder> frameEncoder; // owns
    ExposureMeter* exposureMeter = nullptr;     // does not own
};

void CameraRig::startRecording()
{
    frameEncoder = std::make_unique<FrameEncoder>();
    auto shutterTimer = new QTimer(this); // owned by the parent (this)
    ...
}

void CameraRig::clearPresets()
{
    while (presetLayout->count() > 0) {
        std::unique_ptr<QLayoutItem> item { presetLayout->takeAt(0) };
        item->widget()->deleteLater();
    }
}
```

**Why:** the type of the field tells at once who is responsible for deleting the object, and leaks and double deletion are ruled out.

### `const`

- Methods that do not change the state of the object are declared `const`.
- Fields that get their value in the declaration or in the initializer list and never change afterwards are declared `const` (see "Immutable fields - `const`" in section 2).
- Parameters of "heavy" types (strings, containers, classes) are passed by `const&`; built-in types, enumerations and pointers by value.
- The exception is a `std::function` that the function stores: it is passed by value (see below).

```cpp
QString getNickname() const;
void setNickname(const QString& nickname);
void setDirection(Direction direction);
```

### Constant pointers

For a pointer, what is immutable may be the pointer itself, the object it points to, or both. Which one depends on where `const` stands:

| Declaration                              | What is immutable                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| `const Receipt* receipt`                 | the object: it cannot be changed through the pointer, the pointer can be redirected |
| `Receipt* const receipt`                 | the pointer itself: the object can be changed through it                        |
| `const Receipt* const receipt`           | both the pointer and the object                                                 |
| `const std::unique_ptr<Receipt> receipt` | the smart pointer itself                                                        |
| `std::unique_ptr<const Receipt> receipt` | the object owned by the smart pointer                                           |
| `constexpr const char* HEADER_SETTING`   | the pointer - it is `constexpr`; the characters - they are `const`              |
| `const auto receipt = findReceipt()`     | the pointer itself: `Receipt* const` is deduced                                 |
| `const auto* receipt = findReceipt()`    | the object: `const Receipt*` is deduced                                         |

- A `const` that refers to the object is written before the type: `const Receipt*`, not `Receipt const*` - the same as `const QString&`.
- A `const` that refers to a raw pointer itself is written after `*`. It cannot be put before the type: `const Receipt*` already means an immutable object.
- `constexpr` refers not to the type but to the declared variable and always stands before the type. For a pointer it makes the pointer itself immutable, so the `const` of the object is written separately: a string literal has the type `const char[]`, and the standard forbids `constexpr char* HEADER_SETTING = "receipt/header"` - GCC and Clang accept it only with a warning.
- With `auto` it is different from an explicit type: `const auto` makes the pointer itself immutable, because `const` refers to the whole deduced type `Receipt*`. To protect the object, `const auto*` is written.

**Why `const` before the type:** that is how `const QString&` and all other declarations in the code are written, and they read the same way.

### Pointers and `nullptr`

- The null pointer is only `nullptr`, not `NULL` and not `0`.
- Pointers are compared with `nullptr` explicitly: `if (mailer != nullptr)`, not `if (mailer)`. This also applies to smart pointers, `QPointer` and `std::function`.

### Type casts

- C-style casts (`(int)value`) are not used.
- `static_cast` for ordinary conversions, `qobject_cast` for descendants of `QObject`, `dynamic_cast` for other polymorphic types.
- `reinterpret_cast` and `const_cast` - only as a last resort, with a comment on why there is no way around them.

**Why:** a named cast is visible when reading and can be found by a search, and the compiler does not let it do more than intended.

### Unused parameters

A parameter that the function does not use is written without a name in its definition - only the type. `Q_UNUSED` is not used. This usually happens in an overriding virtual function or in a callback whose signature is given from outside.

In the declaration in the header the name stays: there it explains what is passed to the function.

```cpp
// FuelGauge.hpp
virtual void paintEvent(QPaintEvent* event) override;

// FuelGauge.cpp
void FuelGauge::paintEvent(QPaintEvent*)
{
    QPainter painter(this);
    ...
}
```

If a parameter is used only on some platforms (under `#ifdef`), its name cannot be removed. Such a parameter is marked in the definition of the function with the attribute `[[maybe_unused]]`:

```cpp
void DeviceVibrator::pulse([[maybe_unused]] int durationMs)
{
#ifdef Q_OS_ANDROID
    ...
#endif
}
```

**Why:** `Q_UNUSED` does not prevent using the parameter. When the parameter comes into use, the macro is forgotten and claims the opposite. A parameter without a name cannot be used: to use it, it has to get a name, so the signature always shows which parameters the function needs. `[[maybe_unused]]` is a standard attribute of C++17, and it is visible in the signature too, not hidden in the body of the function.

### `auto`

`auto` is used when the type is obvious from the right side of the expression (`new`, `std::make_unique`, a type cast) or cumbersome (iterators). If the type matters for understanding the code and is not visible from the expression, it is written explicitly.

```cpp
auto invoiceComposer = new InvoiceComposer(companyProfile, this); // the type is visible
auto encoder = std::make_unique<FrameEncoder>();                  // the type is visible
double humidity = greenhouse->getHumidity();                      // the type matters - written explicitly
```

### `std::function`

- A callback is passed as a `std::function`, not as a function pointer: a pointer accepts only a lambda without captures. Exceptions: a C API that needs exactly a pointer (`qInstallMessageHandler`, WinAPI), and template algorithms (`std::sort`, `std::find_if`) - they get the lambda as it is.
- If the function stores the callback (in a field, in a lambda capture, passes it on), it is taken by value and moved with `std::move`. If the callback goes to several places, it is copied into all but the last, and moved into the last one.
- If the function only calls the callback, it is taken by `const&`.
- A mandatory callback is checked with `Q_ASSERT(callback != nullptr)` where it is accepted. An optional one - with `if (callback != nullptr)` before every call: calling an empty `std::function` throws `std::bad_function_call`.
- Unlike `connect`, a callback has no context object: nothing prevents calling it after the objects whose pointers it captured are deleted. So `this` and other pointers are captured into a callback by the same rules as into deferred lambdas (section 6): the object must be guaranteed to outlive the callback, otherwise - a `QPointer` with a check.

```cpp
class DownloadTask : public QObject {
    Q_OBJECT

public:
    using FinishedCallback = std::function<void(const QByteArray& data)>;
    using ProgressCallback = std::function<void(int percent)>;

    // finishedCallback is mandatory, progressCallback is not
    explicit DownloadTask(
        FinishedCallback finishedCallback,
        ProgressCallback progressCallback = {},
        QObject* parent = nullptr);
    ...
};

DownloadTask::DownloadTask(FinishedCallback finishedCallback, ProgressCallback progressCallback, QObject* parent) :
        QObject(parent),
        finishedCallback(std::move(finishedCallback)),
        progressCallback(std::move(progressCallback))
{
    Q_ASSERT(this->finishedCallback != nullptr);
}

void DownloadTask::onChunkReceived(int percent)
{
    if (progressCallback != nullptr) {
        progressCallback(percent);
    }
}

// the callback is only called - by const&
void forEachOverdueBook(const Library& library, const std::function<void(const Book& book)>& visit)
{
    ...
}
```

### Containers

- Qt containers are used: `QList`, `QHash`, `QSet`, `QStringList`, `QVariantList`, `QVariantMap`. The values of v4script come from and go to `QJSValue`, `QVariant`, `QJsonObject` and the public API (`QList<HostModule>`); conversions to `std` containers and back would only add copies. A container of the standard library needs a reason in a comment.
- If the final number of elements is known or can be estimated, `reserve()` is called before filling. Once, before the loop: `reserve(size() + 1)` on every iteration defeats the growth strategy, and filling becomes quadratic.
- A range-based `for` over a non-constant Qt container wraps it in `std::as_const`.

```cpp
QList<Reading> readings;
readings.reserve(sensors.size());
for (const auto& sensor : std::as_const(sensors)) {
    readings.append(sensor->read());
}
```

**Why `std::as_const`:** the non-constant `begin()` of a shared Qt container makes a full copy of it (detach), even if the loop changes nothing.

---

## 6. Lambdas and captures

### The capture list

`[=]` and `[&]` are not used: the captured variables are listed explicitly (`[this, dockStation]`). Then the declaration of the lambda shows what it uses, and nothing is captured by accident.

### Capture by reference

A capture by reference (`[&report]`) is allowed in two cases only:

- the lambda runs **synchronously**: it is called and finishes while the variable is alive - algorithms (`std::sort`, `std::find_if`), a helper lambda called in the same function;
- the variable is guaranteed to live **longer than the lambda itself**, not only until its call. For example, the lambda is connected to a signal with a context object that is deleted before the variable.

In all other cases - `connect`, `QTimer::singleShot`, `QMetaObject::invokeMethod`, a stored `std::function` - a capture by reference is forbidden: the lambda is called later, when the variable no longer exists. Instead of a reference, a big object is moved into the capture with `std::move` or made a field of the context object.

```cpp
// Synchronous: the lambda finishes before the function returns
int totalWeight = 0;
std::for_each(parcels.begin(), parcels.end(), [&totalWeight](const Parcel& parcel) { totalWeight += parcel.weight; });

// Wrong: the lambda runs after the function returns, report is already destroyed
InspectionReport report = buildReport();
connect(uploader, &ReportUploader::ready, this, [this, &report]() { uploader->send(report); });
```

### `this` and pointers

- `this` is captured if the lambda is connected with the context object `this` or an object that `this` owns (for example, a child): then the lambda does not outlive the object.
- A raw pointer to a `QObject` that is neither the sender nor the context object and is not guaranteed to outlive them is wrapped in a `QPointer` and compared with `nullptr` in the body of the lambda: `[dockStation = QPointer<DockStation>(dockStation)]`. Guaranteed to live longer is, for example, the parent of the context object.
- Pointers to objects that do not inherit `QObject` are not captured into a deferred lambda: there is no `QPointer` for them. Instead of the pointer, a value is captured, a `std::shared_ptr` / `std::weak_ptr`, or the data is kept in the context object.

### Moving into a capture

- A variable prepared especially for the lambda and not used anywhere else is moved into the capture: `[manifest = std::move(manifest)]`.
- If the lambda is called many times (a signal handler), the moved value lives between the calls, and it is not moved further out of the body of the lambda: on the next call it would be empty.
- A lambda that captured a non-copyable type (`std::unique_ptr`) becomes non-copyable itself and does not fit into a `std::function`.

```cpp
// dockStation is neither the sender nor the context: wrapped in a QPointer
connect(cleaningTimer, &QTimer::timeout, vacuumRobot, [vacuumRobot, dock = QPointer<DockStation>(dockStation)]() {
    if (dock != nullptr) {
        vacuumRobot->returnTo(dock);
    }
});

// labels is prepared for the lambda and not needed anymore: moved into the capture
connect(printer, &LabelPrinter::ready, this, [this, labels = std::move(labels)]() { printer->print(labels); });
```

---

## 7. Qt

### `Q_OBJECT`

The macro `Q_OBJECT` is the first line of any class that has signals, properties or `Q_INVOKABLE` methods.

### Slots are not used

The keywords `slots`, `public slots`, `private slots` and `Q_SLOTS` are not used: any method or lambda can be connected to a signal.

If a method must be called by name (from JavaScript or through `QMetaObject::invokeMethod` with a string), it is marked `Q_INVOKABLE`.

The exceptions are tests: test functions of Qt Test are declared in `private slots:`, otherwise `QTest` does not find them, and test objects that check how host modules expose public slots declare them in `public slots:`.

### Signals

- The name of a signal describes the event that happened: `batteryLevelChanged`, `connectionLost`, `completed`.
- Methods that handle signals are named `on` + the event: `onBatteryLevelChanged`, `onScannerCompleted`.
- A signal is emitted with the keyword `emit`: `emit moistureChanged(zone, moisturePercent);`
- Signals are not emitted in a destructor - neither directly nor through called methods. If the destructor calls a method that emits a signal (`close()`, `setModified()`), signals are blocked before that: `blockSignals(true)`.

```cpp
FlightRecorder::~FlightRecorder()
{
    // stop() reports the change of the state, and signals are not emitted from a destructor
    blockSignals(true);
    stop();
}
```

**Why:** a parent deletes its children in the destructor of `QObject`, when the derived part of the parent is already destroyed. If a child emits a signal from its destructor that is connected to a method of the parent, the method is called on a half-destroyed object. Whoever needs to know about the deletion of an object connects to `QObject::destroyed`.

### `connect` and other APIs with a functor

- Only the syntax with pointers to methods is used. The macros `SIGNAL()` and `SLOT()` are not used: an error in the name or the signature is found at compile time, not while the program runs.
- If extra arguments must be passed or a bit of logic run, a lambda is used, not `std::bind`.
- A lambda is passed only together with a context object. That is the object whose data the lambda uses; when it is deleted, the connection is broken, and the lambda is not called for an object that is already gone. The rule applies to all APIs that take a functor: `connect` (the context is the third argument), `QTimer::singleShot`, `QMetaObject::invokeMethod`, `QFuture::then`.
- What to capture into a lambda and how - section 6.

```cpp
// A method:
connect(thermometer, &Thermometer::temperatureChanged, climateChart, &ClimateChart::addReading);

// A lambda with a context (vacuumRobot):
connect(cleaningTimer, &QTimer::timeout, vacuumRobot, [vacuumRobot]() { vacuumRobot->returnToDock(); });

// A timer and a deferred call - with a context too:
QTimer::singleShot(RETRY_DELAY_MS, this, [this]() { reconnect(); });
QMetaObject::invokeMethod(
    this,
    [this]() { updateLayout(); },
    Qt::QueuedConnection);

// Wrong - std::bind:
connect(cleaningTimer, &QTimer::timeout, vacuumRobot, std::bind(&VacuumRobot::returnToDock, vacuumRobot));

// Wrong - a lambda without a context:
connect(cleaningTimer, &QTimer::timeout, [vacuumRobot]() { vacuumRobot->returnToDock(); });
QTimer::singleShot(RETRY_DELAY_MS, [this]() { reconnect(); });
```

---

## 8. Multithreading

### Threads and `QObject`

- Work in a separate thread goes into a worker object that is moved into the thread with `moveToThread()`. Classes do not inherit `QThread`.
- A thread that owns no `QObject` and needs no event loop - like the watchdog of the time limit, which must act while the thread of the engine is busy - is a `std::thread` with `std::mutex` and `std::condition_variable`.
- Every `QObject` has an owner thread. Methods of the object are called only from that thread; from another one - through a signal (the connection becomes queued by itself) or `QMetaObject::invokeMethod(object, ...)`.
- Widgets and everything that paints on the screen live only in the main thread.
- A `QObject` of another thread is deleted only through `deleteLater()`. A worker object is deleted on the signal `QThread::finished`.
- Before a `QThread` is deleted, `quit()` and `wait()` are called: deleting a running thread aborts the program.

```cpp
ImageImporter::ImageImporter(QObject* parent) :
        QObject(parent),
        workerThread(new QThread(this)),
        worker(new ThumbnailWorker())
{
    worker->moveToThread(workerThread);
    connect(workerThread, &QThread::finished, worker, &QObject::deleteLater);
    connect(worker, &ThumbnailWorker::thumbnailReady, this, &ImageImporter::onThumbnailReady);
    workerThread->start();
}

ImageImporter::~ImageImporter()
{
    workerThread->quit();
    workerThread->wait();
}
```

### One-off background tasks

A one-off task without its own state - walking a directory, a search, parsing a file - needs no worker object: it is written as a free function and started with `QtConcurrent::run` or `QtConcurrent::mapped`. The function gets copies of the data, and the cancellation flag through a `std::shared_ptr<std::atomic_bool>`: the caller may disappear before the task finishes. The result is taken in the thread of the caller through `QFuture::then` with a context object or through a `QFutureWatcher`.

```cpp
void ArchiveBrowser::startScan()
{
    const auto cancelled = std::make_shared<std::atomic_bool>(false);
    scanCancelled = cancelled;
    QtConcurrent::run(scanArchive, archivePath, cancelled).then(this, [this, cancelled](ArchiveIndex index) {
        if (!*cancelled) {
            showIndex(std::move(index));
        }
    });
}
```

**Why:** the thread pool picks the number of threads for the processor itself, and without a worker object there is no need to watch its thread and its deletion. The context of `then` keeps the result from arriving at an object that is already deleted.

### Shared data

- Data reachable from several threads is protected by a mutex. The mutex lies next to the data it protects (in the same struct), and a comment says what exactly it protects.
- A mutex is locked only through an RAII wrapper (`QMutexLocker`, `std::scoped_lock`, `std::unique_lock`), not by calls to `lock()` / `unlock()`: on an early `return` or an exception a manual `unlock()` does not run.
- Under a mutex, no signals are emitted, and no callbacks or virtual methods of foreign objects are called: the handler may try to lock the same mutex (a deadlock) or hold up other threads for long. The needed data is copied under the mutex, the mutex is released, and only then the outside code is called.
- If several mutexes must be locked, they are locked at once: `std::scoped_lock lock(first, second);`. Otherwise two threads that lock them in different orders block each other.
- Flags and counters that are read and written from different threads are `std::atomic`. `volatile` gives neither atomicity nor ordering and is not used for synchronization.
- Waiting for a condition (`QWaitCondition`, `std::condition_variable`) checks the condition in a loop: a thread may wake up although the condition does not hold.

```cpp
struct SharedQueue {
    QMutex mutex; // protects jobs and cancelled
    QList<PrintJob> jobs;
    bool cancelled = false;
};

void PrintSpooler::flush()
{
    QList<PrintJob> pending;
    {
        QMutexLocker locker(&queue->mutex);
        pending.swap(queue->jobs);
    }
    // The signal - already without the mutex: the handler may turn to the queue again
    emit jobsTaken(static_cast<int>(pending.size()));
}
```

### Pointers and references to container elements

- `QList` and `std::vector` reallocate their memory and move the elements when they grow (`append`, `insert`, `resize` beyond `capacity()`). All pointers, references and iterators to their elements become invalid. So a pointer to an element is not kept longer than until the next change of the container. If stability is needed, an index is kept, or the container holds pointers (`std::vector<std::unique_ptr<T>>`).
- A reference or a pointer to an element obtained under a mutex is not used after the mutex is released: another thread may change the container at any moment. A copy is made under the mutex.
- Different copies of a Qt container may be used in different threads: the reference counter of implicit sharing is thread-safe. One and the same instance - only under a mutex.

```cpp
// Wrong: after append the pointer first may point into freed memory
const Waypoint* first = &route.front();
route.append(nextWaypoint);
navigator->headTo(*first);
```

### Lambdas and threads

- A lambda that runs in another thread captures data by value (or through `std::move`), not by reference and not through pointers to objects of the calling thread.
- `QPointer` does not protect against the deletion of an object by another thread: the object may be deleted between the check for `nullptr` and the use. Objects of another thread are reached through signals or `QMetaObject::invokeMethod`.

---

## 9. Comments and strings

- Comments are written in English, like everything in the repository.
- Classes and non-obvious functions in a header are described with a Doxygen comment `/** @brief ... */`.
- A comment does not retell the name: what is clear from the name and the types is not commented (see below).
- v4script has no user interface: messages that programs and applications see (errors, warnings), log messages (`qDebug()`, `qWarning()`) and exception texts are in English and do not go through `tr()`.
- Test data may be in any language (for example, to check the handling of Cyrillic).

```cpp
/**
 * @brief An arrival board: shows the next trains and their delays.
 */
class ArrivalBoard : public QWidget {
    ...
};

void ArrivalBoard::showDelay(const Train& train)
{
    // The board does not show a delay under a minute
    if (train.getDelayMinutes() < 1) {
        return;
    }
    statusLabel->setText(QString("Train %1 is delayed").arg(train.getNumber()));
    qInfo() << "Delay shown for train" << train.getNumber();
}
```

### No obvious comments

A comment is needed where the code is not enough: why it is done exactly this way, side effects, from which thread a function may be called, what the caller must do. If a function, a field or a variable is fully described by its name and types, it has no comment. If only part of a comment is useful, only that part stays.

- The usual meaning of special values is not commented: `std::nullopt`, `nullptr`, `false` or an empty string in return - it did not work out, nothing was found, or the user declined; `-1` - not found. A comment is needed only when the value means something else: `0` iterations - the default number, an empty password - save without encryption.
- If a comment clarifies what exactly a function returns or does, it is better to add a word or two to the name: `getGridRowCount()` instead of the comment "rows of the grid, including empty ones", `getDefaultDurationMinutes()` instead of "the duration in minutes".
- Details of a small and simple implementation are not retold in the header: if needed, they are read in the function itself. A description stays at what is complex or spread over several places, and at what the caller needs to know without looking into the implementation.

```cpp
class TrackPlayer : public QObject {
    ...

public:
    // Wrong: the comments retell the names and the usual meaning of std::nullopt
    /**
     * @brief Returns the volume in percent
     */
    int getVolume() const;

    /**
     * @brief Sets the volume
     * @param volume The volume
     */
    void setVolume(int volume);

    /**
     * @brief Loads a playlist
     * @return std::nullopt if the file could not be read
     */
    std::optional<Playlist> loadPlaylist(const QString& filePath);
};

class TrackPlayer : public QObject {
    ...

public:
    // Right: the units are in the name, and the comment says only what the name does not
    /**
     * @brief 0 - the sound is off, but the track goes on playing
     */
    int getVolumePercent() const;
    void setVolumePercent(int volumePercent);

    std::optional<Playlist> loadPlaylist(const QString& filePath);
};
```

The same inside functions: `// Increase the counter` above `++count` is not needed, while `// The first line of the file is the header, skip it` above `lines.removeFirst()` explains what the code does not show.

Knowledge that spans several files or explains a design decision of a whole part belongs in [docs/internals](docs/internals/README.md), not in a code comment; a header may keep a one-line `@brief` and a pointer to the page.

**Why:** a comment that repeats the name tells nothing, but it has to be read and maintained. When the code changes, such comments are the first to drift away from it. And among many obvious comments the few that warn about something really important get lost.
