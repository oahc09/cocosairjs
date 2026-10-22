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
add_subdirectory("${AIR_REPO_ROOT}/vendor/box3d/core" "core")
file(SHA256 "${CMAKE_CURRENT_LIST_DIR}/abi-schema.json" AIR_SCHEMA_SHA)
add_library(air_box3d_abi STATIC native/air_box3d.c)
set_target_properties(air_box3d_abi PROPERTIES C_STANDARD 17 C_STANDARD_REQUIRED YES)
target_include_directories(air_box3d_abi PUBLIC native)
target_compile_definitions(air_box3d_abi PRIVATE "AIR_B3_SCHEMA_SHA=\"${AIR_SCHEMA_SHA}\"")
target_link_libraries(air_box3d_abi PUBLIC box3d)

if(EMSCRIPTEN)
    add_executable(air_box3d native/wasm_entry.c)
    target_link_libraries(air_box3d PRIVATE air_box3d_abi)
    set_target_properties(air_box3d PROPERTIES OUTPUT_NAME "box3d-st" SUFFIX ".mjs")
    target_link_options(air_box3d PRIVATE
        -msimd128 -msse2 -fno-fast-math -ffp-contract=off --no-entry
        "-sEXPORTED_FUNCTIONS=@${CMAKE_CURRENT_LIST_DIR}/exports.json"
        "-sEXPORTED_RUNTIME_METHODS=['HEAPU8','HEAPU32','HEAPF32']"
        -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createBox3DCore
        -sDYNAMIC_EXECUTION=0 -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=0
        -sENVIRONMENT=web,node -sASSERTIONS=1
        "$<$<CONFIG:Debug>:-sASSERTIONS=2>")
else()
    add_executable(air_box3d_contract native/contract.c)
    target_link_libraries(air_box3d_contract PRIVATE air_box3d_abi)
    enable_testing()
    add_test(NAME native-foundation COMMAND air_box3d_contract)
endif()
