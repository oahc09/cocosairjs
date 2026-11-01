# Frozen v1 input history

`api-contract-v1.json` is the exact original `api-contract.json` from commit
`338ecaaf`, before `d8e2c328` introduced `box3d-rebuild-contract-2`. Its 3,005 bytes
have SHA256 `0e53683159e025ecdf07ae495abcf54e902529b51c6938ce3717fab4dd6e7fc9`,
the digest already required by the frozen v1 candidate. Do not format, regenerate
or update this historical payload.

The current canonical API contract remains version 2. The original v1 verifier
correctly rejects that changed input; neither its pinned hashes nor the original
candidate, freeze, review or test files have been rewritten.

Use the separate, read-only historical verifier:

```sh
node tools/verify/box3d/inventory-v1-history.cjs --check
node --test tools/verify/box3d/inventory-v1-history.test.cjs
```

It uses this explicit historical path for the displaced API input, checks every
other original input and immutable digest, and calls the original shared document
validator. It reconstructs all 2,128 required cells and 186 execution definitions
with their original `NOT_RUN` state. This proves recoverability of the historical
denominator, not current API conformance, implementation completion or Gate PASS.

Tests also verify byte-identical candidate expansion from the original inputs,
recovery in a second directory, and rejection of missing or altered history. No
command repairs the current source tree or imports historical acceptance results.
