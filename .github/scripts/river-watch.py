#!/usr/bin/env python3
"""Is River's room contract still the one Radica builds against?

River re-keys its room contract now and then and publishes the current code hash in `pointer-records.toml`. Radica
bundles one generation (river-wasm, ui/src/wasm/river_room_contract.wasm, the desktop app): once River moves on, the
web app turns River rooms read-only and the desktop app writes under a key River no longer uses.

Prints GitHub step outputs (`behind`, `version`, `code_hash`) and writes the issue body to river-watch.md.
"""
import re
import sys
import tomllib
import urllib.request
from pathlib import Path

POINTERS = "https://raw.githubusercontent.com/freenet/river/main/pointer-records.toml"
ROOT = Path(__file__).resolve().parents[2]


def ours(path: str, pattern: str) -> str:
    m = re.search(pattern, (ROOT / path).read_text())
    if not m:
        sys.exit(f"{path}: no match for {pattern}")
    return m.group(1)


with urllib.request.urlopen(POINTERS, timeout=30) as r:
    records = tomllib.loads(r.read().decode())["record"]
room = next(r for r in records if r["app_id"] == "river.room-contract")

web = ours("ui/src/riverPointer.ts", r'BUNDLED_ROOM_CODE = "([0-9a-f]{64})"')
desktop = ours("apps/desktop/src/river.rs", r'ROOM_CODE_HASH: &str = "([0-9a-f]{64})"')
rev = ours("river-wasm/Cargo.toml", r'rev = "([0-9a-f]{40})"')
behind = room["code_hash"] not in (web, desktop) or web != desktop

print(f"behind={'true' if behind else 'false'}")
print(f"version={room['version']}")
print(f"code_hash={room['code_hash']}")

Path("river-watch.md").write_text(f"""River's room contract is now **version {room['version']}** (`{room['code_hash']}`).

Radica still builds against:
- web (`ui/src/riverPointer.ts` `BUNDLED_ROOM_CODE`): `{web}`
- desktop (`apps/desktop/src/river.rs` `ROOM_CODE_HASH`): `{desktop}`
- river-wasm: river-core at `{rev}`

Until Radica follows, the web app keeps River rooms read-only and the desktop app writes under the old key.

To follow:
- [ ] bump `river-core` in `river-wasm/Cargo.toml` to the River commit that signed this record, and fix any API change
- [ ] rebuild `ui/src/wasm/river.wasm` and copy River's `ui/public/contracts/room_contract.wasm` to `ui/src/wasm/river_room_contract.wasm`
- [ ] set `BUNDLED_ROOM_CODE` (web) and `ROOM_CODE_HASH` (desktop) to `{room['code_hash']}`
- [ ] `npm test`, then publish the web app (`npm run freenet:update`)

Opened by `.github/workflows/river-watch.yml` from {POINTERS}.
""")
