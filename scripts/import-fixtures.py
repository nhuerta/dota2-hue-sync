"""Import recorded GSI logs into a deduplicated, time-ordered JSONL fixture.

Usage:
    python -I scripts/import-fixtures.py <logs-dir> <out.jsonl.gz> [glob]

The old replay-capture recorder wrapped every payload as {"timestamp": iso, ...payload}
and wrote each payload up to four times. Payloads are deduplicated by content hash
(the wrapper timestamp excluded), sorted by capture time, and written one per line as
{"t": iso, "payload": {...}}. The payload is stored untouched.
"""
import glob
import gzip
import hashlib
import json
import os
import sys


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__)
        return 2
    logs_dir, out_path = sys.argv[1], sys.argv[2]
    pattern = sys.argv[3] if len(sys.argv) > 3 else 'match_*.json'
    files = sorted(glob.glob(os.path.join(logs_dir, pattern)))
    unique: dict[str, tuple[str, dict]] = {}
    total = 0
    for path in files:
        with open(path, encoding='utf-8') as fh:
            entries = json.load(fh)
        for entry in entries:
            total += 1
            captured = entry.pop('timestamp', None)
            digest = hashlib.sha1(json.dumps(entry, sort_keys=True).encode()).hexdigest()
            if digest not in unique:
                unique[digest] = (captured or '', entry)
    records = sorted(unique.values(), key=lambda item: item[0])
    with gzip.open(out_path, 'wt', encoding='utf-8') as out:
        for captured, payload in records:
            out.write(json.dumps({'t': captured, 'payload': payload}, separators=(',', ':')) + '\n')
    heartbeats = sum(1 for _, p in records if 'previously' not in p)
    print(f'files={len(files)} entries={total} unique={len(records)} no_previously={heartbeats} -> {out_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
