#!/usr/bin/env python3
"""Verify embedded compressed derived manifests against the untouched original report."""
from pathlib import Path
import datetime
import gzip
import hashlib
import json

HERE = Path(__file__).resolve().parent
MAPPING = HERE / "mapping.json"
RECEIPT = HERE / "verification-receipt.json"

def digest(data):
    return hashlib.sha256(data).hexdigest()

def pointer(document, expression):
    current = document
    for part in expression.split("/")[1:]:
        part = part.replace("~1", "/").replace("~0", "~")
        current = current[int(part)] if isinstance(current, list) else current[part]
    return current

mapping_bytes = MAPPING.read_bytes()
mapping = json.loads(mapping_bytes)
original_path = Path(mapping["originalReport"]["path"])
original_bytes = original_path.read_bytes()
assert len(original_bytes) == mapping["originalReport"]["bytes"]
assert digest(original_bytes) == mapping["originalReport"]["sha256"]
original = json.loads(original_bytes)
required = {f"/candidates/{i}/arDataMemberManifestSha256" for i in range(len(original["candidates"]))}
required |= {f"/existingArchives/{i}/memberPathListSha256" for i in range(len(original["existingArchives"]))}
assert mapping["unverifiablePointers"] == 0 and not mapping["unverifiable"]
assert len(mapping["files"]) == len(required)
assert {item["sourceJsonPointer"] for item in mapping["files"]} == required
checked = []
for item in mapping["files"]:
    target = (HERE / item["newFile"]).resolve()
    assert target.parent == HERE
    compressed = target.read_bytes()
    decoded = gzip.decompress(compressed)
    original_hash = pointer(original, item["sourceJsonPointer"])
    assert len(compressed) == item["newFileBytes"]
    assert digest(compressed) == item["newFileSha256"]
    assert len(decoded) == item["decodedBytes"]
    assert digest(decoded) == item["decodedSha256"] == item["expectedSha256"] == original_hash
    checked.append({
        "sourceJsonPointer": item["sourceJsonPointer"],
        "embeddedCompressedFile": item["newFile"],
        "compressedBytes": len(compressed),
        "compressedSha256": digest(compressed),
        "exactDecodedBytes": len(decoded),
        "exactDecodedSha256": digest(decoded),
        "matchesOriginalPointer": True,
    })
assert original_path.read_bytes() == original_bytes
receipt = {
    "status": "PASS_ALL_22_ORIGINAL_DERIVED_HASH_PREIMAGES_VERIFIED",
    "classification": "EMBEDDED_LOSSLESS_COMPRESSED_DERIVED_MANIFESTS_NOT_EXTERNAL_RAW_OMISSION_EXCEPTION",
    "verifiedAtUTC": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "verificationScript": {"path": str(Path(__file__).resolve()), "sha256": digest(Path(__file__).read_bytes())},
    "mapping": {"path": str(MAPPING), "bytes": len(mapping_bytes), "sha256": digest(mapping_bytes)},
    "originalReport": {"path": str(original_path), "bytes": len(original_bytes), "sha256": digest(original_bytes), "unchangedAfterVerification": True},
    "verifiedPointers": len(checked),
    "exactDecodedBytesTotal": sum(x["exactDecodedBytes"] for x in checked),
    "compressedPreimageBytesTotal": sum(x["compressedBytes"] for x in checked),
    "files": checked,
    "limitations": "Verifies only complete embedded derived-list bytes and their original audit hashes. Does not back up .a/.o files, add members to original archives, or authorize deletion.",
}
encoded = (json.dumps(receipt, ensure_ascii=False, indent=2) + "\n").encode()
current_total = sum(f.stat().st_size for f in HERE.iterdir() if f.is_file() and f != RECEIPT)
assert current_total + len(encoded) <= 300000
RECEIPT.write_bytes(encoded)
print(json.dumps({"status": receipt["status"], "verifiedPointers": len(checked), "receiptPath": str(RECEIPT), "receiptBytes": len(encoded), "receiptSha256": digest(encoded), "mappingSha256": digest(mapping_bytes), "directoryBytes": current_total + len(encoded), "originalReportSha256": digest(original_bytes)}, indent=2))
