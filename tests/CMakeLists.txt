# Tests of v4script: every language through the API (LanguagesTest) and the
# C++ API itself (RuntimeTest). Both run without a display (offscreen).

function(v4script_add_test name)
    add_executable(${name} ${name}.cpp TestSession.hpp)
    target_link_libraries(${name} PRIVATE V4Script V4Script::ImageCanvas Qt6::Test)
    qt_add_resources(${name} "${name}_module"
        PREFIX "/tests"
        FILES app-module.js
    )
    add_test(NAME ${name} COMMAND ${name})
    set_tests_properties(${name} PROPERTIES ENVIRONMENT "QT_QPA_PLATFORM=offscreen" TIMEOUT 900)
endfunction()

v4script_add_test(LanguagesTest)
v4script_add_test(RuntimeTest)

# The sample programs (samples/<language>/*) go into the resources: new files
# are picked up when CMake configures.
file(GLOB_RECURSE V4SCRIPT_SAMPLES CONFIGURE_DEPENDS RELATIVE ${CMAKE_CURRENT_SOURCE_DIR}
     ${CMAKE_CURRENT_SOURCE_DIR}/samples/*)
qt_add_resources(LanguagesTest "LanguagesTest_samples"
    PREFIX "/samples"
    BASE samples
    FILES ${V4SCRIPT_SAMPLES}
)
