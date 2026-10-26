# Android c++_static + SDL 3.2.30 / 16KB source patch

Base: `3cea6b450b71661e114a04b8bde777ff6d29f67f`. Apply to that existing Mystral interop baseline, not directly to the original upstream baseline.

`mystral-sdl330-16k.patch` changes six files. `base-source/` and `modified-source/` retain their exact before/after bytes. A fresh local clone was checked out at the fixed base; both `git apply --check` and the actual apply passed, and all six applied hashes match current source and the x86_64 compiled source map.

Use `-PmystralAndroidStl=c++_static -PmystralV8LibraryKind=static -PmystralV8StartupData=embedded -PmystralSdlVersion=3.2.30`. Supply the exact V8 11.6.189.22 static archives and shared include tree in `build-profile.json`/`v8-include-files.json`. The 118 include-tree files contain 107 C/C++ headers and 11 metadata/protocol files. Binaries are referenced by URL/hash and are not copied into this source package.

SDL comes from the complete official 3.2.30 Android distribution: the fixed ZIP, its complete AAR, and every materialized AAR entry were compared byte for byte. Matching Java, native libraries and Prefab headers must stay together. Their inventory and the original SDL license are retained in this package.

The isolated Android Emulator 37.2.12 / API 37 Google APIs 16KB x86_64 environment is recorded in `sdk-provenance/`. Its installed package.xml reports revision 8 while the vendor source.properties reports 7; both are retained verbatim. SDK license text remains in the package metadata. No SDK binary is redistributed here.

Legacy shared startup remains explicit: `-PmystralAndroidStl=c++_shared -PmystralV8LibraryKind=shared -PmystralV8StartupData=external`, with its original compatible shared V8 and actual external snapshots. Embedded startup does not read or fabricate an external snapshot. JNI records the actual compiled startup mode and V8 version.

Mystral's MIT text and the official [V8 11.6.189.22 root license](https://raw.githubusercontent.com/v8/v8/11.6.189.22/LICENSE) are retained verbatim in `licenses/`. The V8 root text also lists separately licensed components; this sidecar is not a complete third-party inventory for a redistributed binary.

This package provides source/apply/dependency evidence. Runtime acceptance is kept separate; it does not establish physical-device, 16KB-page, performance or release readiness. No original source, SDK, staged asset or prior patch package was modified by this export.
