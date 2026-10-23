# Current environment preflight: 2026-10-23

**BLOCKED before browser startup. No Cocos, browser-matrix, physical-device or rendering acceptance result was produced.**

This is a new bounded observation in the restored environment, not a reuse of the previous environment's failures. The source is the retained e40 candidate; the remote branch at the time of this attempt was `1ff6b83db31468ac4f4cd7ae87e9d21cf157c41a`, whose only delta from the preserved candidate is evidence transport and the separate regression classification document. No engine rebuild or source change occurred.

## Performed checks

1. Ran the existing `tools/verify/port-gap-env-preflight.cjs` without `--launch-browsers`, with the installed Playwright directory supplied through `NODE_PATH`. Node 24.19.0, npm 11.9.0, Git and Playwright 1.62.1 are available. Root TypeScript/Jest/ts-jest dependencies remain uninstalled. The helper's browser cache inventory is Windows-path-specific; its absent `AppData/Local/ms-playwright` result does not prove that Linux browser binaries are absent.
2. Independently located the installed matching WebKit revision 2336 through Playwright's standard `executablePath()`. The probe does not supply an executable override, browser command-line flags, a custom wrapper, a proxy alteration or dependency-validation bypass.
3. Started a fresh loopback HTTP fixture and read it from the same process. HTTP 200 and its exact SHA-256 matched. Attempted one standard `webkit.launch({ headless: true, timeout: 15000 })`.
4. Playwright refused startup because its host dependency validation found six missing libraries. `launched=false`, `pageLoaded=false`, no screenshot and no GL pixel result exist. The fixture server was closed. The attempt exited 1; the outer 35-second timeout did not fire.
5. Queried the official installed Playwright CLI's documented `install-deps --dry-run webkit`. This invokes `apt-get install -s`, not installation. It failed with apt configuration permission and unavailable-index/package errors. This does not establish which packages would actually be installed.
6. Requested the supported escalated executor for a read-only official-source check and a simulation of only the six target packages. The executor failed before the shell command began because its own setup could not create a file on a read-only filesystem. No source inspection, apt simulation, package installation or system modification occurred. The exact tool error is retained in `dependency-install-preflight.json`. No alternate execution route was attempted.

## Exact missing dependencies

| Missing library reported by Playwright | Debian target package |
| -------------------------------------- | --------------------- |
| libgtk-4.so.1                          | libgtk-4-1            |
| libgraphene-1.0.so.0                   | libgraphene-1.0-0     |
| libharfbuzz-icu.so.0                   | libharfbuzz-icu0      |
| libmanette-0.2.so.0                    | libmanette-0.2-0      |
| libhyphen.so.0                         | libhyphen0            |
| libGLESv2.so.2                         | libgles2              |

The target list is minimal, but the package dependency closure and disk increment remain **unknown** until a supported official-source simulation succeeds. Do not mistake the package names for a completed source verification or installation receipt. No full browser suite was installed.

## Boundaries and next step

- Root dependency restoration, matching Firefox/Chromium binaries, full matrices, real physical devices and real model runs are still separate unfinished work.
- System Chromium was found read-only but not launched through the previously denied socket route. The cloud Chrome observation on an unrelated website is not this fixture or the required three-browser matrix.
- No sandbox/GPU flags were changed, no policy or dependency validation was disabled, and no previously denied file navigation or external deployment was attempted.
- The supplied probe is environment-only. Even a later successful execution is not an engine acceptance test or full campaign and does not provide the stricter campaign process-custody proof.
- Minimal unblock: restore a functioning supported escalated executor, verify official package sources and the six-package dependency/disk simulation, install the verified dependencies through that supported flow, then make one new standard preflight attempt. Preserve this failed attempt. Only a successful environment result permits a new frozen real collection.

`manifest.json` binds the exact script, raw output, HTML fixture and receipts. The original regression and evidence gates remain unchanged and BLOCKED.
