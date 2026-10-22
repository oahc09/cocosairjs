Derived evidence closure for native-cache-readonly-audit.json

Original report SHA256: 3c37f19bbc6b0a5a3af601dd86e095445175c3a68f91598a9e21b8d6c1a20b08
The original report is unchanged. No .a, .o, source, output, Git, SDK, or remote was modified.
Each .json.gz or .txt.gz is a lossless gzip representation of one complete exact original SHA256 preimage. No archive payload was extracted.
Use mapping.json to map the original JSON pointer to the new file. newFileSha256 hashes the stored compressed file; decodedSha256 hashes all bytes after gzip decoding and must equal expectedSha256 from the original report.
Ar JSON uses Python json.dumps(member_list, sort_keys=True, separators=(",", ":")) with default ensure_ascii=True, followed by UTF-8 encoding and no final newline.
Tar path lists preserve tarfile r|gz iteration order. Each entry is member name + NUL + decimal member size + LF, UTF-8 encoded. The NUL separator is deliberate.
These files close only the derived-hash audit trail. They do not add .a/.o members to any original archive and do not make any file eligible for deletion.

Classification: embedded lossless compressed derived manifests, NOT an external-raw omission exception.
Run python verify-derived.py in this directory to independently verify every embedded preimage against the unchanged original report. It writes only verification-receipt.json here.
