cmake_minimum_required(VERSION 3.19)
project(v4script-canvas LANGUAGES CXX)

# Built alone, the example takes v4script from the directory above.
if(NOT TARGET V4Script::ImageCanvas)
    find_package(Qt6 6.4 REQUIRED COMPONENTS Core Gui Qml)
    set(V4SCRIPT_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(V4SCRIPT_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    add_subdirectory(../.. v4script)
endif()

add_executable(v4script-canvas main.cpp)
target_link_libraries(v4script-canvas PRIVATE V4Script::V4Script V4Script::ImageCanvas Qt6::Gui)
