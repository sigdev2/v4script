cmake_minimum_required(VERSION 3.19)

file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/VERSION" V4SCRIPT_VERSION LIMIT_COUNT 1)
project(V4Script
    VERSION ${V4SCRIPT_VERSION}
    DESCRIPTION "Interpreters and translators of programming languages for the Qt JavaScript engine (V4)"
    HOMEPAGE_URL "https://github.com/sigdev2/v4script"
    LANGUAGES CXX
)

if(CMAKE_SOURCE_DIR STREQUAL CMAKE_CURRENT_SOURCE_DIR)
    set(V4SCRIPT_TOP_LEVEL ON)
else()
    set(V4SCRIPT_TOP_LEVEL OFF)
endif()

option(V4SCRIPT_BUILD_TESTS "Build the tests of v4script" ${V4SCRIPT_TOP_LEVEL})
option(V4SCRIPT_BUILD_EXAMPLES "Build the examples of v4script" ${V4SCRIPT_TOP_LEVEL})
option(V4SCRIPT_BUILD_CANVAS "Build V4Script::ImageCanvas (needs Qt Gui)" ON)
set(V4SCRIPT_LANGUAGES "all" CACHE STRING
    "Languages to embed: all, or a list of ids from languages.json, e.g. python;go;c")
set(V4SCRIPT_JS_DIR "${CMAKE_CURRENT_SOURCE_DIR}/js" CACHE PATH
    "JavaScript sources to embed (tools/minify.mjs writes a minified copy elsewhere)")
option(V4SCRIPT_MINIFY_JS "Embed scripts minified by tools/minify.mjs at configure time (needs Node.js and tools/node_modules)" OFF)

if(V4SCRIPT_MINIFY_JS)
    find_program(V4SCRIPT_NODE node REQUIRED)
    set(V4SCRIPT_MINIFIED_DIR "${CMAKE_CURRENT_BINARY_DIR}/js-min")
    execute_process(
        COMMAND "${V4SCRIPT_NODE}" "${CMAKE_CURRENT_SOURCE_DIR}/tools/minify.mjs" "${V4SCRIPT_MINIFIED_DIR}"
            --js "${V4SCRIPT_JS_DIR}"
        RESULT_VARIABLE minify_result
    )
    if(NOT minify_result EQUAL 0)
        message(FATAL_ERROR "tools/minify.mjs failed: ${minify_result}")
    endif()
    # The scripts are minified when CMake configures: configure again after changing them.
    set(V4SCRIPT_JS_DIR "${V4SCRIPT_MINIFIED_DIR}")
endif()

if(NOT DEFINED CMAKE_CXX_STANDARD)
    set(CMAKE_CXX_STANDARD 17)
    set(CMAKE_CXX_STANDARD_REQUIRED ON)
endif()
set(CMAKE_AUTOMOC ON)

set(V4SCRIPT_QT_COMPONENTS Core Qml)
if(V4SCRIPT_BUILD_CANVAS)
    list(APPEND V4SCRIPT_QT_COMPONENTS Gui)
endif()
if(V4SCRIPT_BUILD_TESTS)
    list(APPEND V4SCRIPT_QT_COMPONENTS Test)
endif()
find_package(Qt6 6.4 REQUIRED COMPONENTS ${V4SCRIPT_QT_COMPONENTS})

include(cmake/V4ScriptResources.cmake)

# ---------------------------------------------------------------------------
# V4Script: the languages, the host layer, Engine and Runtime
# ---------------------------------------------------------------------------

configure_file(cmake/Version.hpp.in "${CMAKE_CURRENT_BINARY_DIR}/include/v4script/Version.hpp" @ONLY)

add_library(V4Script STATIC
    include/v4script/Engine.hpp
    include/v4script/Host.hpp
    include/v4script/HostModule.hpp
    include/v4script/Languages.hpp
    include/v4script/Result.hpp
    include/v4script/Runtime.hpp
    include/v4script/V4Script.hpp
    "${CMAKE_CURRENT_BINARY_DIR}/include/v4script/Version.hpp"
    src/Engine.cpp
    src/HostBridge.hpp
    src/HostModule.cpp
    src/Internal.hpp
    src/Languages.cpp
    src/Runtime.cpp
    src/Watchdog.cpp
    src/Watchdog.hpp
)
add_library(V4Script::V4Script ALIAS V4Script)

target_include_directories(V4Script
    PUBLIC
        "${CMAKE_CURRENT_SOURCE_DIR}/include"
        "${CMAKE_CURRENT_BINARY_DIR}/include"
    PRIVATE
        src
)
target_link_libraries(V4Script PUBLIC Qt6::Core Qt6::Qml)

v4script_add_js_resources(V4Script
    MANIFEST "${CMAKE_CURRENT_SOURCE_DIR}/languages.json"
    JS_DIR "${V4SCRIPT_JS_DIR}"
    LANGUAGES ${V4SCRIPT_LANGUAGES}
)

find_package(Threads REQUIRED)
target_link_libraries(V4Script PRIVATE Threads::Threads)

# The main thread runs code with up to 10000 nested calls
# (v4script::prepareProcess) and V4 does not check the stack itself: 16 MB.
# Linux raises the limit in prepareProcess; Windows needs the linker.
if(WIN32)
    if(MSVC)
        target_link_options(V4Script INTERFACE "/STACK:16777216")
    else()
        target_link_options(V4Script INTERFACE "-Wl,--stack,16777216")
    endif()
endif()

# ---------------------------------------------------------------------------
# V4ScriptCanvas: a canvas that draws into a QImage
# ---------------------------------------------------------------------------

if(V4SCRIPT_BUILD_CANVAS)
    add_library(V4ScriptCanvas STATIC
        include/v4script/ImageCanvas.hpp
        src/ImageCanvas.cpp
    )
    add_library(V4Script::ImageCanvas ALIAS V4ScriptCanvas)
    target_link_libraries(V4ScriptCanvas PUBLIC V4Script Qt6::Gui)
    qt_add_resources(V4ScriptCanvas "v4script_canvas"
        PREFIX "/v4script/js"
        BASE "${V4SCRIPT_JS_DIR}"
        FILES "${V4SCRIPT_JS_DIR}/host/canvas.js"
    )
endif()

if(V4SCRIPT_BUILD_TESTS)
    enable_testing()
    add_subdirectory(tests)
endif()

if(V4SCRIPT_BUILD_EXAMPLES)
    add_subdirectory(examples)
endif()
