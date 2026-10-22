# Official Emscripten 6.0.2 toolchain recovery

Status: Emscripten, CMake, and Ninja installed locally; all executable version checks passed.

Use only in the current shell or a subshell:

```sh
source /workspace/scratch/62d43a81bbde/box3d-toolchain-20261022/use-toolchain.sh
emcc --version
```

The source checkout is the official emscripten-core/emsdk tag 6.0.2 at ca38f487f28b7c3c16f8f70cd0e012099ac4b7e2. It is clean and detached at the tag. The released SDK build is 004876f1984e18a9eb0736c5ca417ac86d386fb8. Emscripten reports 6.0.2 (7a2d97d627ff4945eae28847ce0387ac52b92c09).

The Linux x64 SDK and Node 22.16.0 packages were installed using the official emsdk script and retained under emsdk/downloads. See toolchain-provenance.json for exact URLs, sizes, SHA256 and MD5, metadata blob hashes, commands and scope. The SDK package MD5 matches official HTTP x-goog-hash metadata. Its SHA256 is locally measured, not a claim of an upstream published SHA256.

No global PATH or shell startup file was changed. No Box3D source tree was modified. No project compilation was started. The installer activation is local to this emsdk checkout.

The initial exact package HEAD probe succeeded with a 10-second connection allowance; the previous 5-second timeout was not a definitive network blocker. There were no permission denials during this restoration.

CMake 4.4.4 and Ninja 1.13.2 were installed separately from their official GitHub releases. Both archive SHA256 digests match official release metadata before extraction or execution. CMake source commit is 2e0b3aec14fe2e3e555faac4698e281749aae4b5; Ninja source commit is 3441b633c2fe2c494e958780ba0f4227b1327634. Their version commands passed. The environment helper adds their paths only to the sourcing shell, sets explicit local EM_CONFIG, and defaults CMAKE_BUILD_PARALLEL_LEVEL=1. It does not start any builds.
