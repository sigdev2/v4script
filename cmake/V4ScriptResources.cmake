# Embeds the JavaScript of v4script into a target as Qt resources:
# :/v4script/js/<file> for the files of the host layer and of the chosen
# languages, :/v4script/languages.json for the manifest of those languages.
#
#   v4script_add_js_resources(<target> MANIFEST <languages.json> JS_DIR <dir> LANGUAGES all|<id>...)
function(v4script_add_js_resources target)
    cmake_parse_arguments(ARG "" "MANIFEST;JS_DIR" "LANGUAGES" ${ARGN})
    file(READ "${ARG_MANIFEST}" manifest)
    set_property(DIRECTORY APPEND PROPERTY CMAKE_CONFIGURE_DEPENDS "${ARG_MANIFEST}")

    set(all OFF)
    if(NOT ARG_LANGUAGES OR "all" IN_LIST ARG_LANGUAGES)
        set(all ON)
    endif()

    set(files host/compat.js host/host.js)
    string(JSON core_count LENGTH "${manifest}" translatorCore)
    math(EXPR core_last "${core_count} - 1")
    set(core_files "")
    foreach(index RANGE ${core_last})
        string(JSON file GET "${manifest}" translatorCore ${index})
        list(APPEND core_files "${file}")
    endforeach()

    string(JSON count LENGTH "${manifest}" languages)
    math(EXPR last "${count} - 1")
    set(known "")
    set(excluded "")
    foreach(index RANGE ${last})
        string(JSON language GET "${manifest}" languages ${index})
        string(JSON id GET "${language}" id)
        list(APPEND known "${id}")
        if(NOT all AND NOT id IN_LIST ARG_LANGUAGES)
            list(PREPEND excluded ${index})
            continue()
        endif()
        string(JSON translator ERROR_VARIABLE no_translator GET "${language}" translator)
        if(NOT no_translator AND translator)
            list(APPEND files ${core_files})
        endif()
        string(JSON file_count LENGTH "${language}" files)
        math(EXPR file_last "${file_count} - 1")
        foreach(file_index RANGE ${file_last})
            string(JSON file GET "${language}" files ${file_index})
            list(APPEND files "${file}")
        endforeach()
        string(JSON adapter GET "${language}" adapter)
        list(APPEND files "${adapter}")
    endforeach()
    list(REMOVE_DUPLICATES files)

    if(NOT all)
        foreach(id IN LISTS ARG_LANGUAGES)
            if(NOT id IN_LIST known)
                message(FATAL_ERROR "V4SCRIPT_LANGUAGES: unknown language '${id}' (known: ${known})")
            endif()
        endforeach()
    endif()

    # The manifest of the embedded languages only: languages() lists them.
    set(filtered "${manifest}")
    foreach(index IN LISTS excluded)
        string(JSON filtered REMOVE "${filtered}" languages ${index})
    endforeach()
    set(manifest_dir "${CMAKE_CURRENT_BINARY_DIR}/v4script_manifest")
    file(WRITE "${manifest_dir}/languages.json.new" "${filtered}")
    configure_file("${manifest_dir}/languages.json.new" "${manifest_dir}/languages.json" COPYONLY)

    set(sources "")
    foreach(file IN LISTS files)
        list(APPEND sources "${ARG_JS_DIR}/${file}")
    endforeach()
    qt_add_resources(${target} "v4script_js"
        PREFIX "/v4script/js"
        BASE "${ARG_JS_DIR}"
        FILES ${sources}
    )
    qt_add_resources(${target} "v4script_manifest"
        PREFIX "/v4script"
        BASE "${manifest_dir}"
        FILES "${manifest_dir}/languages.json"
    )
endfunction()
