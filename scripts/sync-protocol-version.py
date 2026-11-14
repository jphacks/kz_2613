"""通信版の正本から、RustとWebの定数を生成する。"""

import argparse
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "apps/host-rs/protocol-version.txt"
SPECIFICATION = ROOT / "docs/protocol-specification.md"
GENERATED_HEADER = "// scripts/sync-protocol-version.py で生成。"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="書き込まず差分を検査する")
    args = parser.parse_args()

    version = SOURCE.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"[1-9][0-9]{0,15}", version) or int(version) > 2**53 - 1:
        parser.error(f"{SOURCE.relative_to(ROOT)} にJavaScriptの安全な正の整数を指定してください")

    outputs = {
        "apps/host-rs/src/protocol_version.rs": f"pub const PROTOCOL_VERSION: u64 = {version};",
        "apps/web/src/shared/transport/version.ts": f"export const PHONE_PROTOCOL_VERSION = {version};",
    }
    stale = []
    for relative_path, definition in outputs.items():
        path = ROOT / relative_path
        expected = f"{GENERATED_HEADER}\n{definition}\n"
        if not args.check:
            path.write_text(expected, encoding="utf-8", newline="\n")
        elif not path.is_file() or path.read_text(encoding="utf-8") != expected:
            stale.append(relative_path)

    if stale:
        parser.exit(
            1,
            f"通信版の生成差分: {', '.join(stale)}\n"
            "python scripts/sync-protocol-version.py を実行してください。\n",
        )
    if args.check:
        specification = SPECIFICATION.read_text(encoding="utf-8")
        documented_versions = re.findall(r"^\*\*通信契約\*\*: `protocolVersion = ([0-9]+)`", specification, re.MULTILINE)
        if documented_versions != [version]:
            parser.exit(1, f"{SPECIFICATION.relative_to(ROOT)} の通信版を {version} に更新してください。\n")


if __name__ == "__main__":
    main()
