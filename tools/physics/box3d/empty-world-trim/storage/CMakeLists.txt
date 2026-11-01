cmake_minimum_required(VERSION 3.22)
# Refuse the wrong configuration before compiler identification/probes as well.
if(NOT CMAKE_BUILD_TYPE STREQUAL "Debug" OR CMAKE_CONFIGURATION_TYPES)
    message(FATAL_ERROR "Identity qualification requires single-config Debug")
endif()
project(air_box3d_empty_storage_qualification LANGUAGES C CXX)
# Independent executable only. Never builds a production module; only this isolated executable enables trim.
if(NOT AIR_SOURCE_ROOT OR NOT AIR_STORAGE_CORE)
    message(FATAL_ERROR "Set AIR_SOURCE_ROOT and AIR_STORAGE_CORE to the verified staged closure")
endif()
if(NOT CMAKE_C_COMPILER_ID MATCHES "GNU|Clang")
    message(FATAL_ERROR "Only the reviewed GCC/Clang qualification flags are supported")
endif()
find_program(AIR_NODE node REQUIRED)
# Same functional admission used by CPU positive/negative tests. Prefix every argument
# with a key so empty CMake values still reach Node as explicit nonempty arguments.
execute_process(COMMAND "${AIR_NODE}" "${AIR_SOURCE_ROOT}/tools/physics/box3d/empty-world-trim/identity/profile.mjs" --check-build-profile
    "buildType=${CMAKE_BUILD_TYPE}" "multiConfig=${CMAKE_CONFIGURATION_TYPES}"
    "flag0=${CMAKE_C_FLAGS}" "flag1=${CMAKE_CXX_FLAGS}"
    "flag2=${CMAKE_C_FLAGS_DEBUG}" "flag3=${CMAKE_CXX_FLAGS_DEBUG}"
    RESULT_VARIABLE AIR_CONFIG_STATUS)
if(NOT AIR_CONFIG_STATUS EQUAL 0)
    message(FATAL_ERROR "Identity qualification requires single-config Debug without NDEBUG")
endif()
option(AIR_STORAGE_CONTROL "Build the identity-only prefix for initial-ledger comparison" OFF)
set(AIR_VERIFY_MODE --verify)
if(AIR_STORAGE_CONTROL)
    set(AIR_VERIFY_MODE --verify-control)
endif()
execute_process(COMMAND "${AIR_NODE}" "${CMAKE_CURRENT_LIST_DIR}/stage.mjs" "${AIR_VERIFY_MODE}"
    "${AIR_SOURCE_ROOT}" "${AIR_STORAGE_CORE}" RESULT_VARIABLE AIR_STAGE_STATUS)
if(NOT AIR_STAGE_STATUS EQUAL 0)
    message(FATAL_ERROR "Exact identity qualification staging verification failed")
endif()
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)
set(BOX3D_PROFILE OFF CACHE BOOL "No profiling dependency downloads" FORCE)
set(BOX3D_SAMPLES OFF CACHE BOOL "No samples" FORCE)
set(BOX3D_UNIT_TESTS OFF CACHE BOOL "Own bounded contract" FORCE)
set(BOX3D_BENCHMARKS OFF CACHE BOOL "No benchmarks" FORCE)
set(BOX3D_DOCS OFF CACHE BOOL "No docs" FORCE)
set(BOX3D_AVX2 OFF CACHE BOOL "SSE2/WASM SIMD" FORCE)
set(BOX3D_DISABLE_SIMD OFF CACHE BOOL "SIMD required" FORCE)
set(BOX3D_DOUBLE_PRECISION OFF CACHE BOOL "Float32" FORCE)
set(BOX3D_VALIDATE ON CACHE BOOL "Validation enabled; NDEBUG separately forbidden" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "Static core" FORCE)
add_compile_options(-fno-fast-math -ffp-contract=off)
# This is a compiler-enforced effective-macro guard, not merely a README or flag regex.
# It also catches NDEBUG originating in response files or later target definitions.
add_compile_options(-include "${AIR_SOURCE_ROOT}/tools/physics/box3d/empty-world-trim/identity/qualification-guard.h")
if(EMSCRIPTEN)
    add_compile_options(-msimd128 -msse2)
endif()
add_subdirectory("${AIR_STORAGE_CORE}" core)
add_executable(air_box3d_empty_storage_contract native-contract.c)
if(AIR_STORAGE_CONTROL)
    target_compile_definitions(air_box3d_empty_storage_contract PRIVATE AIR_STORAGE_BASELINE_ONLY)
else()
    target_sources(air_box3d_empty_storage_contract PRIVATE "${AIR_STORAGE_CORE}.step-adapter.c")
endif()
set_target_properties(air_box3d_empty_storage_contract PROPERTIES C_STANDARD 17 C_STANDARD_REQUIRED YES)
target_compile_definitions(air_box3d_empty_storage_contract PRIVATE BOX3D_DISABLE_AVX2 BOX3D_VALIDATE)
target_include_directories(air_box3d_empty_storage_contract PRIVATE "${AIR_STORAGE_CORE}/src"
    "${AIR_SOURCE_ROOT}/tools/physics/box3d/native")
target_link_libraries(air_box3d_empty_storage_contract PRIVATE box3d)
if(EMSCRIPTEN)
    set_target_properties(air_box3d_empty_storage_contract PROPERTIES SUFFIX ".cjs")
    target_link_options(air_box3d_empty_storage_contract PRIVATE -msimd128 -msse2 -fno-fast-math -ffp-contract=off
        -sENVIRONMENT=node -sSINGLE_FILE=1 -sEXIT_RUNTIME=1 -sFILESYSTEM=0 -sASSERTIONS=2 -sALLOW_MEMORY_GROWTH=1)
endif()
