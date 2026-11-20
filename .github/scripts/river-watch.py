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
import subprocess
import sys
import tomllib
import urllib.request
from pathlib import Path

POINTERS = "https://raw.githubusercontent.com/freenet/river/main/pointer-records.toml"
COMMITS_API = "https://api.github.com/repos/freenet/river/commits?path=pointer-records.toml&per_page=1"
ROOT = Path(__file__).resolve().parents[2]
MAX_WASM_BYTES = 20 * 1024 * 1024
HEX64_RE = re.compile(r"^[0-9a-f]{64}$")
HEX40_RE = re.compile(r"^[0-9a-f]{40}$")
HEX_EVEN_RE = re.compile(r"^(?:[0-9a-f]{2})+$")
WASM_REL_RE = re.compile(r"^[A-Za-z0-9._/-]+\.wasm$")


def single_line(val: object, name: str) -> str:
    s = str(val)
    if "\n" in s or "\r" in s:
        sys.exit(f"refusing multiline output for {name}")
    return s


def validate_room_record(room: dict) -> tuple[int, str, str | None, str]:
    version = room.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version <= 0:
        sys.exit(f"invalid upstream version: {version!r}")
    code_hash = room.get("code_hash")
    if not isinstance(code_hash, str) or not HEX64_RE.fullmatch(code_hash):
        sys.exit(f"invalid upstream code_hash: {code_hash!r}")
    state = room.get("state")
    if state is not None and (not isinstance(state, str) or not HEX_EVEN_RE.fullmatch(state)):
        sys.exit("invalid upstream state hex")
    wasm_rel = room.get("wasm_path", "ui/public/contracts/room_contract.wasm")
    if (
        not isinstance(wasm_rel, str)
        or wasm_rel.startswith("/")
        or ".." in Path(wasm_rel).parts
        or not WASM_REL_RE.fullmatch(wasm_rel)
    ):
        sys.exit(f"invalid upstream wasm_path: {wasm_rel!r}")
    return version, code_hash, state, wasm_rel


def verify_blake3(data: bytes, expected_hex: str) -> None:
    try:
        from blake3 import blake3  # type: ignore
        actual = blake3(data).hexdigest()
    except ImportError:
        blake3_js = ROOT / "ui/node_modules/@noble/hashes/blake3.js"
        if not blake3_js.exists():
            sys.exit("Cannot verify downloaded WASM BLAKE3 hash: neither python blake3 nor ui/node_modules/@noble/hashes/blake3.js found")
        script = (
            "import fs from 'node:fs';"
            f"import {{ blake3 }} from {json.dumps(blake3_js.as_uri())};"
            "import { bytesToHex } from " + json.dumps((ROOT / 'ui/node_modules/@noble/hashes/utils.js').as_uri()) + ";"
            "process.stdout.write(bytesToHex(blake3(fs.readFileSync(0))));"
        )
        res = subprocess.run(["node", "--input-type=module", "-e", script], input=data, capture_output=True, check=True)
        actual = res.stdout.decode("utf-8").strip()
    if actual.lower() != expected_hex.lower():
        sys.exit(f"BLAKE3 mismatch on downloaded room_contract.wasm: expected {expected_hex}, got {actual}")


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
        if isinstance(data, list) and data and isinstance(data[0].get("sha"), str) and HEX40_RE.fullmatch(data[0]["sha"]):
            return data[0]["sha"]
    except Exception as exc:
        print(f"[river-watch] Could not resolve River commit SHA ({exc})", file=sys.stderr)
    return ""


with urllib.request.urlopen(POINTERS, timeout=30) as r:
    records = tomllib.loads(r.read(1024 * 1024).decode("utf-8"))["record"]
room = next(r for r in records if r.get("app_id") == "river.room-contract")
version, code_hash, state, wasm_rel = validate_room_record(room)

web = ours("ui/src/riverPointer.ts", r'BUNDLED_ROOM_CODE = "([0-9a-f]{64})"')
rev = ours("river-wasm/Cargo.toml", r'rev = "([0-9a-f]{40})"')
behind = code_hash != web
target_rev = fetch_latest_river_rev() if behind else rev

if "--apply" in sys.argv:
    if not HEX40_RE.fullmatch(target_rev):
        sys.exit(f"Refusing --apply without pinned 40-char commit SHA, got {target_rev!r}")
    wasm_url = f"https://raw.githubusercontent.com/freenet/river/{target_rev}/{wasm_rel}"
    with urllib.request.urlopen(wasm_url, timeout=60) as r:
        wasm_bytes = r.read(MAX_WASM_BYTES + 1)
    if len(wasm_bytes) > MAX_WASM_BYTES or len(wasm_bytes) < 8:
        sys.exit(f"Unexpected WASM download size: {len(wasm_bytes)} bytes")
    verify_blake3(wasm_bytes, code_hash)
    (ROOT / "ui/src/wasm/river_room_contract.wasm").write_bytes(wasm_bytes)

    cargo_path = ROOT / "river-wasm/Cargo.toml"
    cargo_src = cargo_path.read_text(encoding="utf-8")
    cargo_out, count = re.subn(r'rev = "[0-9a-f]{40}"', f'rev = "{target_rev}"', cargo_src)
    if count < 1:
        sys.exit("river-wasm/Cargo.toml: no rev entries replaced")
    cargo_path.write_text(cargo_out, encoding="utf-8")

    replace_one(
        "ui/src/riverPointer.ts",
        r"(\*\* The room contract river\.wasm is built against \(River's pointer record version )\d+(\)\. \*/)",
        rf"\g<1>{version}\g<2>",
    )
    replace_one(
        "ui/src/riverPointer.ts",
        r'BUNDLED_ROOM_CODE = "[0-9a-f]{64}"',
        f'BUNDLED_ROOM_CODE = "{code_hash}"',
    )

    if state is not None:
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r"(// River's published record at the commit river-wasm pins \(pointer-records\.toml\): version )\d+(, BUNDLED_ROOM_CODE\.)",
            rf"\g<1>{version}\g<2>",
        )
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r'const RECORD = "[0-9a-f]+";',
            f'const RECORD = "{state}";',
        )
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r'const forged = "[0-9a-f]{8}" \+ RECORD\.slice\(8\);',
            f'const forged = "{version + 1:08x}" + RECORD.slice(8);',
        )
        replace_one(
            "ui/tests/riverPointer.test.ts",
            r'(\.toEqual\(|\bassert\.equal\(JSON\.parse\(store\.get\("radica_river_pointer"\)!\)\.version, )\d+(\);)',
            rf"\g<1>{version}\g<2>",
        )
else:
    print(f"behind={'true' if behind else 'false'}")
    print(f"version={single_line(version, 'version')}")
    print(f"code_hash={single_line(code_hash, 'code_hash')}")
    print(f"target_rev={single_line(target_rev or rev, 'target_rev')}")

Path("river-watch.md").write_text(
    f"""River's room contract is now **version {version}** (`{code_hash}`) at commit `{target_rev or 'unresolved'}`.

Radica still builds against:
- web (`ui/src/riverPointer.ts` `BUNDLED_ROOM_CODE`): `{web}`
- river-wasm: river-core at `{rev}`

> Note: Radica's default Private Rooms & Broadcast Channels run natively on Radica's own contracts and are unaffected. This update keeps opt-in and external River room interoperability in sync.

Checklist:
- [x] target `river-core` commit: `{target_rev or 'unresolved'}` (`river-wasm/Cargo.toml`)
- [x] sync `ui/src/wasm/river_room_contract.wasm` and `ui/src/wasm/river.wasm`
- [x] set `BUNDLED_ROOM_CODE` to `{code_hash}` and update `ui/tests/riverPointer.test.ts`

Opened by `.github/workflows/river-watch.yml` from {POINTERS}.
""",
    encoding="utf-8",
)
