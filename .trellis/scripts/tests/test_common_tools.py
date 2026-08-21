#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
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
from common import session_context  # noqa: E402
from common.io import write_json  # noqa: E402
from common.task_store import _has_subagent_platform  # noqa: E402
from common.task_utils import is_within_tasks_dir  # noqa: E402
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
        self.assertEqual(
            hook.resolve_breadcrumb_key("implement", "codex", {"codex": {}}),
            "implement",
        )
        self.assertEqual(
            hook.resolve_breadcrumb_key(
                "implement", "codex", {"codex": {"dispatch_mode": " AUTO "}}
            ),
            "implement",
        )

    def test_prompt_injection_skip_keyword_is_honored(self) -> None:
        hook = _load_hook(REPO_ROOT / ".codex" / "hooks" / "inject-workflow-state.py")

        self.assertTrue(
            hook._should_skip_prompt_injection(REPO_ROOT, {"prompt": "please no-trellis"})
        )
        self.assertFalse(
            hook._should_skip_prompt_injection(REPO_ROOT, {"prompt": "please note-trellis"})
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

    def test_limited_file_read_truncates_without_full_text(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        with tempfile.TemporaryDirectory() as tmp:
            target = Path(tmp) / "large.md"
            target.write_text("a" * 200, encoding="utf-8")

            content = hook.read_file_content(tmp, "large.md", max_bytes=16)

        self.assertIn("truncated large.md to 16 bytes", content)
        self.assertNotIn("a" * 80, content)

    def test_context_total_limit_is_applied(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        context = hook._limit_context_parts(["a" * 100, "b" * 100], 40)

        self.assertIn("truncated total injected context to 40 bytes", context)

    def test_jsonl_entries_stop_at_total_budget(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            docs_dir = root / "docs"
            docs_dir.mkdir()
            for idx in range(5):
                (docs_dir / f"{idx}.md").write_text("x" * 100, encoding="utf-8")
            manifest = root / "manifest.jsonl"
            manifest.write_text(
                "\n".join(
                    json.dumps({"file": f"docs/{idx}.md"}) for idx in range(5)
                )
                + "\n",
                encoding="utf-8",
            )

            entries = hook.read_jsonl_entries(
                str(root),
                "manifest.jsonl",
                max_file_bytes=100,
                max_total_bytes=150,
            )

        self.assertLess(len(entries), 5)

    def test_check_context_applies_total_budget_to_manifest(self) -> None:
        hook = _load_hook(REPO_ROOT / ".claude" / "hooks" / "inject-subagent-context.py")

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            task_dir = root / ".trellis" / "tasks" / "demo"
            task_dir.mkdir(parents=True)
            docs_dir = root / "docs"
            docs_dir.mkdir()
            for idx in range(5):
                (docs_dir / f"{idx}.md").write_text("x" * 100, encoding="utf-8")
            (task_dir / "check.jsonl").write_text(
                "\n".join(json.dumps({"file": f"docs/{idx}.md"}) for idx in range(5))
                + "\n",
                encoding="utf-8",
            )

            context = hook.get_check_context(
                str(root),
                ".trellis/tasks/demo",
                {
                    "max_file_bytes": 100,
                    "max_artifact_bytes": 100,
                    "max_total_bytes": 150,
                },
            )

        self.assertLess(context.count("=== docs/"), 5)

    def test_archive_guard_rejects_archive_children(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            active_task = root / ".trellis" / "tasks" / "active"
            archived_task = root / ".trellis" / "tasks" / "archive" / "2026-08" / "old"
            active_task.mkdir(parents=True)
            archived_task.mkdir(parents=True)

            self.assertTrue(is_within_tasks_dir(active_task, root))
            self.assertFalse(is_within_tasks_dir(archived_task, root))

    def test_codex_session_start_defines_context_key(self) -> None:
        result = subprocess.run(
            [sys.executable, str(REPO_ROOT / ".codex" / "hooks" / "session-start.py")],
            input=json.dumps({"cwd": str(REPO_ROOT)}),
            text=True,
            capture_output=True,
            encoding="utf-8",
            timeout=10,
            cwd=str(REPO_ROOT),
        )

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("hookSpecificOutput", result.stdout)

    def test_package_git_status_failure_preserves_repo(self) -> None:
        original = session_context.run_git

        def fake_run_git(args, cwd=None, timeout=10):
            if args == ["status", "--porcelain"]:
                return 1, "", "timeout"
            if args == ["branch", "--show-current"]:
                return 0, "main\n", ""
            if args == ["log", "--oneline", "-5"]:
                return 0, "abc123 test commit\n", ""
            return 0, "", ""

        with tempfile.TemporaryDirectory() as tmp:
            repo = Path(tmp) / "pkg"
            (repo / ".git").mkdir(parents=True)
            try:
                session_context.run_git = fake_run_git
                info = session_context._collect_git_repo_info("pkg", "pkg", repo)
            finally:
                session_context.run_git = original

        self.assertIsNotNone(info)
        assert info is not None
        self.assertFalse(info["statusAvailable"])
        self.assertEqual(info["branch"], "main")

    def test_root_git_status_failure_reports_unavailable(self) -> None:
        original = session_context.run_git
        original_is_git = session_context._is_git_worktree

        def fake_run_git(args, cwd=None, timeout=10):
            if args == ["status", "--porcelain"]:
                return 1, "", "timeout"
            if args == ["status", "--short"]:
                return 1, "", "timeout"
            if args == ["branch", "--show-current"]:
                return 0, "main\n", ""
            if args == ["log", "--oneline", "-5"]:
                return 0, "", ""
            return 0, "", ""

        try:
            session_context.run_git = fake_run_git
            session_context._is_git_worktree = lambda repo_root: True
            info = session_context._collect_root_git_info(Path.cwd())
        finally:
            session_context.run_git = original
            session_context._is_git_worktree = original_is_git

        self.assertFalse(info["statusAvailable"])
        lines: list[str] = []
        session_context._append_root_git_context(lines, info)
        self.assertIn("Working directory: status unavailable", "\n".join(lines))

    def test_agents_directory_seeds_subagent_manifests(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".agents" / "skills").mkdir(parents=True)

            self.assertTrue(_has_subagent_platform(root))

    def test_continue_routes_do_not_reference_removed_phase(self) -> None:
        checked_paths = [
            REPO_ROOT / ".agents" / "skills" / "trellis-continue" / "SKILL.md",
            REPO_ROOT / ".claude" / "commands" / "trellis" / "continue.md",
            REPO_ROOT / ".cursor" / "commands" / "trellis-continue.md",
        ]

        for path in checked_paths:
            self.assertNotIn("**3.1**", path.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
