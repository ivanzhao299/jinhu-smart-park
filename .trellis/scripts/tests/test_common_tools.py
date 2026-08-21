#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[3]
SCRIPTS_DIR = REPO_ROOT / ".trellis" / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from common import git as git_common  # noqa: E402
from common.io import write_json  # noqa: E402
from common.workflow_phase import _platform_matches  # noqa: E402


def _load_hook(path: Path):
    spec = importlib.util.spec_from_file_location(path.stem.replace("-", "_"), path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class CommonToolTests(unittest.TestCase):
    def test_write_json_preserves_existing_permissions(self) -> None:
        class ExistingStat:
            st_mode = 0o100640

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "state.json"
            target.write_text("{}", encoding="utf-8")

            with patch.object(Path, "stat", return_value=ExistingStat()):
                with patch.object(os, "chmod") as chmod:
                    self.assertTrue(write_json(target, {"ok": True}))

            chmod.assert_called_once()
            self.assertEqual(chmod.call_args.args[1], 0o640)
            self.assertEqual(json.loads(target.read_text(encoding="utf-8")), {"ok": True})

    def test_write_json_creates_group_readable_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "state.json"

            with patch.object(Path, "stat", side_effect=OSError):
                with patch.object(os, "chmod") as chmod:
                    self.assertTrue(write_json(target, {"ok": True}))

            chmod.assert_called_once()
            self.assertEqual(chmod.call_args.args[1], 0o644)

    def test_resolve_default_branch_preserves_slashes(self) -> None:
        original = git_common.run_git

        def fake_run_git(args, cwd=None, timeout=10):
            if args == ["symbolic-ref", "refs/remotes/origin/HEAD"]:
                return 0, "refs/remotes/origin/release/2026\n", ""
            raise AssertionError(f"unexpected git call: {args!r}")

        try:
            git_common.run_git = fake_run_git
            self.assertEqual(
                git_common.resolve_default_branch(Path.cwd()), "release/2026"
            )
        finally:
            git_common.run_git = original

    def test_platform_matching_accepts_canonical_aliases(self) -> None:
        self.assertTrue(_platform_matches("omp", ["Oh My Pi"]))
        self.assertTrue(_platform_matches("kimi", ["Kimi Code"]))
        self.assertTrue(_platform_matches("windsurf", ["Devin"]))

    def test_codex_dispatch_defaults_to_auto(self) -> None:
        hook = _load_hook(REPO_ROOT / ".codex" / "hooks" / "inject-workflow-state.py")

        self.assertEqual(hook.resolve_breadcrumb_key("implement", "codex", {}), "implement")
        self.assertEqual(
            hook.resolve_breadcrumb_key(
                "implement", "codex", {"codex": {"dispatch_mode": "inline"}}
            ),
            "implement-inline",
        )
        self.assertEqual(
            hook.resolve_breadcrumb_key(
                "implement", "codex", {"codex": {"dispatch_mode": "sub-agent"}}
            ),
            "implement",
        )

    def test_subagent_context_limits_are_utf8_safe(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        text = "abc" + ("€" * 10)
        truncated = hook._truncate_utf8(text, 8, "sample.md")

        self.assertIn("[trellis-hook] truncated sample.md to 8 bytes", truncated)
        self.assertTrue(truncated.startswith("abc"))

    def test_implement_context_applies_file_artifact_and_total_limits(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".git").mkdir()
            task_dir = root / ".trellis" / "tasks" / "demo"
            task_dir.mkdir(parents=True)
            docs_dir = root / "docs"
            docs_dir.mkdir()
            (docs_dir / "large.md").write_text("x" * 80, encoding="utf-8")
            (task_dir / "implement.jsonl").write_text(
                json.dumps({"file": "docs/large.md"}) + "\n",
                encoding="utf-8",
            )
            (task_dir / "prd.md").write_text("y" * 80, encoding="utf-8")

            context = hook.get_implement_context(
                str(root),
                ".trellis/tasks/demo",
                {
                    "max_file_bytes": 12,
                    "max_artifact_bytes": 14,
                    "max_total_bytes": 1000,
                },
            )

        self.assertIn("truncated docs/large.md to 12 bytes", context)
        self.assertIn("truncated .trellis/tasks/demo/prd.md to 14 bytes", context)

    def test_context_total_limit_is_applied(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        context = hook._limit_context_parts(["a" * 100, "b" * 100], 40)

        self.assertIn("truncated total injected context to 40 bytes", context)


if __name__ == "__main__":
    unittest.main()
