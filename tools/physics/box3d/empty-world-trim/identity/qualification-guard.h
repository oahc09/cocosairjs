/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
/* Force-included in every qualification core/fixture translation unit. Not production. */
#ifdef NDEBUG
#error "Identity qualification requires active core assertions: NDEBUG is forbidden"
#endif
#ifdef __FAST_MATH__
#error "Identity qualification forbids fast math"
#endif
#ifdef __EMSCRIPTEN_PTHREADS__
#error "Identity qualification profile is single threaded"
#endif
