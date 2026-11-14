#!/usr/bin/env python3
"""Is River's room contract still the one Radica builds against?

River re-keys its room contract now and then and publishes the current code hash in `pointer-records.toml`. Radica
bundles one generation (river-wasm, ui/src/wasm/river_room_contract.wasm) for opt-in / external River room
interoperability (native Radica rooms & channels are unaffected).

Default mode prints GitHub step outputs (`behind`, `version`, `code_hash`, `target_rev`) and writes `river-watch.md`.
With `--apply`, downloads the updated `room_contract.wasm` and bumps `river-wasm/Cargo.toml`, `ui/src/riverPointer.ts`,
and `ui/tests/riverPointer.test.ts` ready for build + test verification.
"""
import json
import os
import re
import sys
import tomllib
import urllib.request
from pathlib import Path

POINTERS = "https://raw.githubusercontent.com/freenet/river/main/pointer-records.toml"
COMMITS_API = "https://api.github.com/repos/freenet/river/commits?path=pointer-records.toml&per_page=1"
ROOT = Path(__file__).resolve().parents[2]


def ours(path: str, pattern: str) -> str:
    m = re.search(pattern, (ROOT / path).read_text(encoding="utf-8"))
    if not m:
        sys.exit(f"{path}: no match for {pattern}")
    return m.group(1)


def replace_one(path: str, pattern: str, replacement: str) -> None:
    p = ROOT / path
    src = p.read_text(encoding="utf-8")
    out, count = re.subn(pattern, replacement, src, count=1)
    if count != 1:
        sys.exit(f"{path}: expected 1 match for {pattern}, got {count}")
    p.write_text(out, encoding="utf-8")


def fetch_latest_river_rev() -> str:
    headers = {"User-Agent": "radica-river-watch"}
    token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        req = urllib.request.Request(COMMITS_API, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.loads(r.read().decode("utf-8"))
        if isinstance(data, list) and data and isinstance(data[0].get("sha"), str):
            return data[0]["sha"]
    except Exception as exc:
        print(f"[river-watch] Could not resolve River commit SHA ({exc}), falling back to 'main'", file=sys.stderr)
    return "main"


with urllib.request.urlopen(POINTERS, timeout=30) as r:
    records = tomllib.loads(r.read().decode("utf-8"))["record"]
room = next(r for r in records if r["app_id"] == "river.room-contract")

web = ours("ui/src/riverPointer.ts", r'BUNDLED_ROOM_CODE = "([0-9a-f]{64})"')
rev = ours("river-wasm/Cargo.toml", r'rev = "([0-9a-f]{40})"')
behind = room["code_hash"] != web
target_rev = fetch_latest_river_rev() if behind else rev

if "--apply" in sys.argv:
    wasm_rel = room.get("wasm_path", "ui/public/contracts/room_contract.wasm")
    wasm_url = f"https://raw.githubusercontent.com/freenet/river/{target_rev}/{wasm_rel}"
    with urllib.request.urlopen(wasm_url, timeout=60) as r:
        (ROOT / "ui/src/wasm/river_room_contract.wasm").write_bytes(r.read())

    if re.fullmatch(r"[0-9a-f]{40}", target_rev):
        cargo_path = ROOT / "river-wasm/Cargo.toml"
        cargo_src = cargo_path.read_text(encoding="utf-8")
        cargo_out, count = re.subn(r'rev = "[0-9a-f]{40}"', f'rev = "{target_rev}"', cargo_src)
        if count < 1:
            sys.exit("river-wasm/Cargo.toml: no rev entries replaced")
        cargo_path.write_text(cargo_out, encoding="utf-8")

    replace_one(
        "ui/src/riverPointer.ts",
        r"(\*\* The room contract river\.wasm is built against \(River's pointer record version )\d+(\)\. \*/)",
        rf"\g<1>{room['version']}\g<2>",
    )
    replace_one(
        "ui/src/riverPointer.ts",
        r'BUNDLED_ROOM_CODE = "[0-9a-f]{64}"',
        f'BUNDLED_ROOM_CODE = "{room["code_hash"]}"',
    )

    if isinstance(room.get("state"), str):
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r"(// River's published record at the commit river-wasm pins \(pointer-records\.toml\): version )\d+(, BUNDLED_ROOM_CODE\.)",
            rf"\g<1>{room['version']}\g<2>",
        )
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r'const RECORD = "[0-9a-f]+";',
            f'const RECORD = "{room["state"]}";',
        )
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r'const forged = "[0-9a-f]{8}" \+ RECORD\.slice\(8\);',
            f'const forged = "{room["version"] + 1:08x}" + RECORD.slice(8);',
        )
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r'(\.toEqual\(|\bassert\.equal\(JSON\.parse\(store\.get\("radica_river_pointer"\)!\)\.version, )\d+(\);)',
            rf"\g<1>{room['version']}\g<2>",
        )
else:
    print(f"behind={'true' if behind else 'false'}")
    print(f"version={room['version']}")
    print(f"code_hash={room['code_hash']}")
    print(f"target_rev={target_rev}")

Path("river-watch.md").write_text(
    f"""River's room contract is now **version {room['version']}** (`{room['code_hash']}`) at commit `{target_rev}`.

Radica still builds against:
- web (`ui/src/riverPointer.ts` `BUNDLED_ROOM_CODE`): `{web}`
- river-wasm: river-core at `{rev}`

> Note: Radica's default Private Rooms & Broadcast Channels run natively on Radica's own contracts and are unaffected. This update keeps opt-in and external River room interoperability in sync.

Checklist:
- [x] target `river-core` commit: `{target_rev}` (`river-wasm/Cargo.toml`)
- [x] sync `ui/src/wasm/river_room_contract.wasm` and `ui/src/wasm/river.wasm`
- [x] set `BUNDLED_ROOM_CODE` to `{room['code_hash']}` and update `ui/tests/riverPointer.test.ts`

Opened by `.github/workflows/river-watch.yml` from {POINTERS}.
""",
    encoding="utf-8",
)
