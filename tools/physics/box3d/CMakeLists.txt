cmake_minimum_required(VERSION 3.22)
project(air_box3d_foundation VERSION 0.1.0 LANGUAGES C CXX)

# The fixed upstream project is deliberately a subproject. Its top-level
# Emscripten branch injects pthread flags and is not a valid ST build entry.
get_filename_component(AIR_REPO_ROOT "${CMAKE_CURRENT_LIST_DIR}/../../.." ABSOLUTE)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(BOX3D_PROFILE OFF CACHE BOOL "No profiling dependency downloads" FORCE)
set(BOX3D_SAMPLES OFF CACHE BOOL "No samples" FORCE)
set(BOX3D_UNIT_TESTS OFF CACHE BOOL "Use foundation contracts" FORCE)
set(BOX3D_BENCHMARKS OFF CACHE BOOL "No benchmarks" FORCE)
set(BOX3D_DOCS OFF CACHE BOOL "No docs" FORCE)
set(BOX3D_AVX2 OFF CACHE BOOL "Use the SSE2/WASM SIMD path" FORCE)
set(BOX3D_DISABLE_SIMD OFF CACHE BOOL "SIMD required" FORCE)
set(BOX3D_DOUBLE_PRECISION OFF CACHE BOOL "Float32 ABI" FORCE)
set(BOX3D_VALIDATE ON CACHE BOOL "Validate Debug builds" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Static core" FORCE)
if(NOT CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
    message(FATAL_ERROR "This foundation has only reviewed GCC/Clang build flags")
endif()
foreach(variable CMAKE_C_FLAGS CMAKE_CXX_FLAGS CMAKE_EXE_LINKER_FLAGS)
    if("${${variable}}" MATCHES "pthread|SHARED_MEMORY|USE_PTHREADS|fast-math|Ofast")
        message(FATAL_ERROR "Forbidden ST flags in ${variable}")
    endif()
endforeach()
add_compile_options(-fno-fast-math -ffp-contract=off)
if(EMSCRIPTEN)
    add_compile_options(-msimd128 -msse2)
endif()
# Only the strict intake runner may prepare this build-local source tree.
if(NOT AIR_STAGED_CORE STREQUAL "${CMAKE_BINARY_DIR}/staged-core")
    message(FATAL_ERROR "Use build.mjs: a build-local staged-core is required")
endif()
find_program(AIR_NODE node REQUIRED)
execute_process(COMMAND "${AIR_NODE}" "${CMAKE_CURRENT_LIST_DIR}/patch-intake.mjs"
    --verify "${AIR_STAGED_CORE}" RESULT_VARIABLE AIR_STAGE_STATUS OUTPUT_VARIABLE AIR_STAGE_JSON)
if(NOT AIR_STAGE_STATUS EQUAL 0)
    message(FATAL_ERROR "Strict patch staging verification failed")
endif()
string(JSON AIR_VERIFIED_PATCH_SHA GET "${AIR_STAGE_JSON}" patchChainSha256)
if(NOT AIR_PATCH_CHAIN_SHA STREQUAL AIR_VERIFIED_PATCH_SHA)
    message(FATAL_ERROR "Patch-chain compile identity mismatch")
endif()
execute_process(COMMAND "${AIR_NODE}" "${CMAKE_CURRENT_LIST_DIR}/memory-diagnostics/v2/source-gate.mjs"
    --root "${AIR_REPO_ROOT}" --core "${AIR_STAGED_CORE}" RESULT_VARIABLE AIR_MEMORY_SOURCE_STATUS)
if(NOT AIR_MEMORY_SOURCE_STATUS EQUAL 0)
    message(FATAL_ERROR "Read-only memory diagnostic source/profile verification failed")
endif()
add_subdirectory("${AIR_STAGED_CORE}" "core")
file(SHA256 "${CMAKE_CURRENT_LIST_DIR}/abi-schema.json" AIR_SCHEMA_SHA)
add_library(air_box3d_abi STATIC native/air_box3d.c native/snapshot.c native/geometry.c native/world_bridge.c native/body_control.c native/filter_bridge.c native/motion_bridge.c native/command_bridge.c native/query_bridge.c native/hull_bridge.c native/joint_bridge.c native/hinge_bridge.c native/p2p_bridge.c native/mesh_bridge.c native/memory_diagnostics.c native/module_release.c)
set_target_properties(air_box3d_abi PROPERTIES C_STANDARD 17 C_STANDARD_REQUIRED YES)
target_include_directories(air_box3d_abi PUBLIC native PRIVATE "${AIR_STAGED_CORE}/src")
target_compile_definitions(air_box3d_abi PRIVATE "AIR_B3_SCHEMA_SHA=\"${AIR_SCHEMA_SHA}\"")
target_compile_definitions(air_box3d_abi PRIVATE "AIR_B3_PATCH_CHAIN_SHA=\"${AIR_VERIFIED_PATCH_SHA}\"")
target_link_libraries(air_box3d_abi PUBLIC box3d)

# Checked Hull and joint contracts. Core test includes hull.c, and Hull bridge test includes world_bridge.c.
foreach(hull_test hull_contract hull_core_contract hull_legacy_fingerprint joint_contract hinge_contract p2p_contract mesh_contract memory_contract)
    add_executable(air_box3d_${hull_test} native/${hull_test}.c)
    set_target_properties(air_box3d_${hull_test} PROPERTIES C_STANDARD 17 C_STANDARD_REQUIRED YES)
    target_include_directories(air_box3d_${hull_test} PRIVATE "${AIR_STAGED_CORE}/src")
    target_compile_definitions(air_box3d_${hull_test} PRIVATE BOX3D_DISABLE_AVX2 BOX3D_VALIDATE)
    target_link_libraries(air_box3d_${hull_test} PRIVATE air_box3d_abi)
    if(EMSCRIPTEN)
        set_target_properties(air_box3d_${hull_test} PROPERTIES SUFFIX ".cjs")
        target_link_options(air_box3d_${hull_test} PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
            -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2 -sALLOW_MEMORY_GROWTH=1)
    endif()
endforeach()

# Capsule fixture includes exact world_bridge.c with executable-only allocation control.
add_executable(air_box3d_capsule_contract native/capsule_contract.c)
target_include_directories(air_box3d_capsule_contract PRIVATE "${AIR_STAGED_CORE}/src")
target_link_libraries(air_box3d_capsule_contract PRIVATE air_box3d_abi)

add_executable(air_box3d_query_contract native/query_contract.c)
target_include_directories(air_box3d_query_contract PRIVATE "${AIR_STAGED_CORE}/src")
target_link_libraries(air_box3d_query_contract PRIVATE air_box3d_abi)

if(EMSCRIPTEN)
    set_target_properties(air_box3d_capsule_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_capsule_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    set_target_properties(air_box3d_query_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_query_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    # Qualification executable, never an application/module artifact.
    add_executable(air_box3d_geometry_contract native/geometry_contract.c)
    target_include_directories(air_box3d_geometry_contract PRIVATE "${AIR_STAGED_CORE}/src")
    target_link_libraries(air_box3d_geometry_contract PRIVATE air_box3d_abi)
    set_target_properties(air_box3d_geometry_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_geometry_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    # world_contract.c includes the exact collector with fixture-only allocation control.
    add_executable(air_box3d_world_contract native/world_contract.c)
    target_link_libraries(air_box3d_world_contract PRIVATE air_box3d_abi)
    set_target_properties(air_box3d_world_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_world_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    add_executable(air_box3d_body_contract native/body_contract.c)
    target_include_directories(air_box3d_body_contract PRIVATE "${AIR_STAGED_CORE}/src")
    target_link_libraries(air_box3d_body_contract PRIVATE air_box3d_abi)
    set_target_properties(air_box3d_body_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_body_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    add_executable(air_box3d_filter_contract native/filter_contract.c)
    target_include_directories(air_box3d_filter_contract PRIVATE "${AIR_STAGED_CORE}/src")
    target_link_libraries(air_box3d_filter_contract PRIVATE air_box3d_abi)
    set_target_properties(air_box3d_filter_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_filter_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    # motion_contract.c includes the exact world collector only for allocation-failure qualification.
    add_executable(air_box3d_motion_contract native/motion_contract.c)
    target_include_directories(air_box3d_motion_contract PRIVATE "${AIR_STAGED_CORE}/src")
    target_link_libraries(air_box3d_motion_contract PRIVATE air_box3d_abi)
    set_target_properties(air_box3d_motion_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_motion_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2)
    # Independent real command transport/arithmetic/ownership qualification.
    add_executable(air_box3d_command_contract native/command_contract.c)
    target_include_directories(air_box3d_command_contract PRIVATE "${AIR_STAGED_CORE}/src")
    target_link_libraries(air_box3d_command_contract PRIVATE air_box3d_abi)
    set_target_properties(air_box3d_command_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_command_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2 -sALLOW_MEMORY_GROWTH=1)
    add_executable(air_box3d native/wasm_entry.c)
    target_link_libraries(air_box3d PRIVATE air_box3d_abi)
    set_target_properties(air_box3d PROPERTIES OUTPUT_NAME "box3d-st" SUFFIX ".mjs")
    target_link_options(air_box3d PRIVATE
        -msimd128 -msse2 -fno-fast-math -ffp-contract=off --no-entry
        "-sEXPORTED_FUNCTIONS=@${CMAKE_CURRENT_LIST_DIR}/exports.json"
        "-sEXPORTED_RUNTIME_METHODS=['HEAPU8','HEAPU32','HEAPF32']"
        # Explicit initialization inputs only: bytes in Node, URL resolution on Web.
        # Emscripten 6.0.2 does not include wasmBinary in its default incoming API.
        "-sINCOMING_MODULE_JS_API=['wasmBinary','locateFile']"
        -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createBox3DCore
        -sDYNAMIC_EXECUTION=0 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0
        -sENVIRONMENT=web,node -sASSERTIONS=1
        "$<$<CONFIG:Debug>:-sASSERTIONS=2>")
else()
    add_executable(air_box3d_contract native/contract.c)
    target_link_libraries(air_box3d_contract PRIVATE air_box3d_abi)
    enable_testing()
    add_test(NAME native-foundation COMMAND air_box3d_contract)
    add_test(NAME native-memory COMMAND air_box3d_memory_contract)
    add_test(NAME native-query COMMAND air_box3d_query_contract)
    add_test(NAME native-capsule COMMAND air_box3d_capsule_contract)
    add_test(NAME native-hull COMMAND air_box3d_hull_contract)
    add_test(NAME native-hull-core COMMAND air_box3d_hull_core_contract)
    add_test(NAME native-hinge COMMAND air_box3d_hinge_contract)
    add_test(NAME native-p2p COMMAND air_box3d_p2p_contract)
endif()

# Additive real storage lifecycle qualification. This is not the C20 application host.
add_executable(air_box3d_world_storage_contract native/world_storage_contract.c)
set_target_properties(air_box3d_world_storage_contract PROPERTIES C_STANDARD 17 C_STANDARD_REQUIRED YES)
target_include_directories(air_box3d_world_storage_contract PRIVATE "${AIR_STAGED_CORE}/src")
target_compile_definitions(air_box3d_world_storage_contract PRIVATE BOX3D_DISABLE_AVX2 BOX3D_VALIDATE)
target_link_libraries(air_box3d_world_storage_contract PRIVATE air_box3d_abi)
if(EMSCRIPTEN)
    set_target_properties(air_box3d_world_storage_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_world_storage_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2 -sALLOW_MEMORY_GROWTH=1)
else()
    add_test(NAME native-world-storage COMMAND air_box3d_world_storage_contract)
endif()

# Same-module terminal release snapshot contract; not full application qualification.
add_executable(air_box3d_module_release_contract native/module_release_contract.c)
set_target_properties(air_box3d_module_release_contract PROPERTIES C_STANDARD 17 C_STANDARD_REQUIRED YES)
target_include_directories(air_box3d_module_release_contract PRIVATE "${AIR_STAGED_CORE}/src")
target_compile_definitions(air_box3d_module_release_contract PRIVATE BOX3D_DISABLE_AVX2 BOX3D_VALIDATE)
target_link_libraries(air_box3d_module_release_contract PRIVATE air_box3d_abi)
if(EMSCRIPTEN)
    set_target_properties(air_box3d_module_release_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_module_release_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2 -sALLOW_MEMORY_GROWTH=1)
else()
    add_test(NAME native-module-release COMMAND air_box3d_module_release_contract)
endif()
