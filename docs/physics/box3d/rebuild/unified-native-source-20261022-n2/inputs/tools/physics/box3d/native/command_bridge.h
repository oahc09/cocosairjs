/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
#pragma once
#include <stdint.h>
/* Additive ABI-1 protocol. Never reinterpret the older motion-batch records. */
enum {
    AIR_B3_COMMAND_WIRE_VERSION = 1,
    AIR_B3_COMMAND_INPUT_MAGIC = 0x314D4355,
    AIR_B3_COMMAND_OUTPUT_MAGIC = 0x31524355,
    AIR_B3_COMMAND_HEADER_WORDS = 12,
    AIR_B3_COMMAND_BODY_INPUT_WORDS = 4,
    AIR_B3_COMMAND_OPERATION_WORDS = 16,
    AIR_B3_COMMAND_BODY_RESULT_WORDS = 160,
    AIR_B3_COMMAND_OPERATION_RESULT_WORDS = 80,
    AIR_B3_COMMAND_MAX_BODIES = 4096,
    AIR_B3_COMMAND_MAX_OPERATIONS = 16384,
    AIR_B3_COMMAND_MAX_INPUT_WORDS = 278540,
    AIR_B3_COMMAND_MAX_OUTPUT_WORDS = 1966092
};
enum {
    AIR_B3_COMMAND_FORCE = 1, AIR_B3_COMMAND_TORQUE, AIR_B3_COMMAND_LINEAR_IMPULSE,
    AIR_B3_COMMAND_ANGULAR_IMPULSE, AIR_B3_COMMAND_CLEAR_FORCES, AIR_B3_COMMAND_CLEAR_VELOCITY,
    AIR_B3_COMMAND_CLEAR_STATE, AIR_B3_COMMAND_RESET, AIR_B3_COMMAND_TARGET, AIR_B3_COMMAND_PAIRED_CLEAR
};
enum {
    AIR_B3_COMMAND_LOCAL = 1, AIR_B3_COMMAND_PRESERVE = 2, AIR_B3_COMMAND_WAKE = 4,
    AIR_B3_COMMAND_SCENE = 8, AIR_B3_COMMAND_IDLE = 16, AIR_B3_COMMAND_CLEANUP = 32
};
/* apply=0 is pure admission, with NULL/0 output. apply=1 always replans live state.
   Every documented nonzero status precedes mutation/output writes; an unexpected
   trap/status is unknown, never rollback. Empty apply also requires NULL/0 output. */
int air_b3_command_batch(uint32_t world, const uint32_t* input, int inputWords,
    uint32_t* output, int outputCapacityWords, int apply);
