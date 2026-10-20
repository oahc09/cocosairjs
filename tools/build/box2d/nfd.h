/* Copyright (c) 2026-2027 oahc09@gmail.com. MIT.
 * Browser host substitutes the desktop-only file picker. Replay data is supplied by the host. */
#pragma once
typedef char nfdu8char_t;
struct nfdu8filteritem_t { const char* name; const char* spec; };
enum { NFD_CANCEL=0, NFD_OKAY=1 };
inline void NFD_Init() {}
inline void NFD_Quit() {}
inline int NFD_OpenDialogU8(char**, const nfdu8filteritem_t*, unsigned, const char*) { return NFD_CANCEL; }
inline void NFD_FreePathU8(char*) {}
