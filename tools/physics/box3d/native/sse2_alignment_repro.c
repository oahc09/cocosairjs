/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Internal upstream diagnostic only. No physics mock or replacement. */
#include "simd_sse2.h"
#include <stdio.h>
int main(void) {
    _Alignas(8) float storage[4] = {0, 1, 2, 3};
    b3V32 value = b3LoadV(storage + 1);
    float actual[4]; _mm_storeu_ps(actual, value);
    if (actual[0] != 1 || actual[1] != 2 || actual[2] != 3 || actual[3] != 0) return 2;
    printf("{\"status\":\"PASS\",\"values\":[1,2,3,0],\"inputAlignmentModulo8\":4}\n");
    return 0;
}
