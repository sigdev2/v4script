cmake_minimum_required(VERSION 3.19)
project(v4run LANGUAGES CXX)

# Built alone, the example takes v4script from the directory above.
if(NOT TARGET V4Script::V4Script)
    find_package(Qt6 6.4 REQUIRED COMPONENTS Core Qml)
    set(V4SCRIPT_BUILD_TESTS OFF CACHE BOOL "" FORCE)
    set(V4SCRIPT_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
    add_subdirectory(../.. v4script)
endif()

add_executable(v4run main.cpp)
target_link_libraries(v4run PRIVATE V4Script::V4Script)
