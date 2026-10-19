# Examples: small projects that embed v4script. Each one also builds alone:
#
#     cmake -S examples/hello -B build-hello -DCMAKE_PREFIX_PATH=<Qt>
add_subdirectory(hello)
add_subdirectory(host-module)
add_subdirectory(run)
if(TARGET V4Script::ImageCanvas)
    add_subdirectory(canvas)
endif()
