"""Run the validation engine over tests/fixtures and print a confusion report
(markdown). Real models only.

  python -I scripts/evaluate_fixtures.py                 # full engine (fails if a detector is missing)
  python -I scripts/evaluate_fixtures.py --allow-missing # PARTIAL engine: skips unavailable detectors
                                                         # and says so in the report
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from ai_service.validation.config import load_config  # noqa: E402
from ai_service.validation.detectors import build_detectors  # noqa: E402
from ai_service.validation.pipeline import ValidationEngine  # noqa: E402

FIX = ROOT / "tests" / "fixtures"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--allow-missing", action="store_true")
    ap.add_argument("--models", default=str(ROOT / "models"))
    ap.add_argument("--out", type=Path)
    args = ap.parse_args()

    cfg = load_config()
    det = build_detectors(Path(args.models), cfg)
    det.load_all()
    states = {d.name: d.status.state for d in det.all()}
    missing = [n for n, s in states.items() if s != "ready"]
    if missing and not args.allow_missing:
        print(f"detectors not ready: {states}; use --allow-missing for a PARTIAL run", file=sys.stderr)
        return 2
    if missing:
        cfg = load_config(overrides={"required_detectors": [n for n in cfg.required_detectors if n not in missing]})
    engine = ValidationEngine(cfg, det)

    manifest = json.loads((FIX / "manifest.json").read_text())
    rows, conf = [], Counter()
    for item in manifest:
        data = (FIX / item["file"]).read_bytes()
        t = time.perf_counter()
        res = engine.validate(data)
        ms = round((time.perf_counter() - t) * 1000)
        codes = [r.code.value for r in res.rejectionReasons]
        exp_accept = item["expected"] == "accept"
        got_accept = res.isValid
        conf[(exp_accept, got_accept)] += 1
        if exp_accept:
            ok = got_accept
        else:
            ok = (not got_accept) and item["expected"] in codes
        needs = {"UNSUPPORTED_CATEGORY": "category", "BODY_PART_DETECTED": "body_parts"}.get(item["expected"])
        judged = needs not in missing if needs else True
        if exp_accept and "category" in missing:
            judged_note = "category not checked"
        else:
            judged_note = ""
        rows.append(
            (
                item["file"],
                item["expected"],
                ", ".join(codes) or "accept",
                res.qualityScore,
                "✅" if ok else ("⚪ not judgeable" if not judged else "❌"),
                ms,
                judged_note,
            )
        )

    lines = []
    lines.append(f"Config: `{cfg.version}`  ")
    lines.append("Detectors: " + ", ".join(f"{k}={v}" for k, v in states.items()) + "  ")
    if missing:
        lines.append(f"**PARTIAL RUN**: {', '.join(missing)} unavailable; their checks were skipped.  ")
    lines.append("")
    lines.append("| Fixture | Expected | Engine result | Score | Correct | ms | Note |")
    lines.append("|---|---|---|---|---|---|---|")
    for r in rows:
        lines.append("| " + " | ".join(str(x) if x is not None else "–" for x in r) + " |")
    lines.append("")
    lines.append("Accept/reject confusion (rows = expected, columns = engine):")
    lines.append("")
    lines.append("| | engine accept | engine reject |")
    lines.append("|---|---|---|")
    lines.append(f"| expected accept | {conf[(True, True)]} | {conf[(True, False)]} |")
    lines.append(f"| expected reject | {conf[(False, True)]} | {conf[(False, False)]} |")
    correct_codes = sum(1 for r in rows if r[4] == "✅")
    lines.append("")
    lines.append(
        f"Exact-outcome accuracy: {correct_codes}/{len(rows)} (reject counts as correct only if the expected code is among the reasons)."
    )
    report = "\n".join(lines)
    print(report)
    if args.out:
        args.out.write_text(report + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
