"""Small real SQLite/media bundles; no production connections or path overrides in CLI."""
import sys
sys.dont_write_bytecode = True
import contextlib
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import tempfile
import time
import types
import unittest
from unittest.mock import patch, Mock

ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/archive-production-offsite-backups.py"
FIXTURE = ROOT / "scripts/e2e/fixtures/smart-control-offsite-release-backup.pinned.py"
module = types.ModuleType("archive_under_test")
sys.modules[module.__name__] = module
exec(compile(SCRIPT.read_bytes(), str(SCRIPT), "exec"), module.__dict__)
pinned = {"__name__": "pinned_test_fixture"}
exec(compile(FIXTURE.read_bytes(), str(FIXTURE), "exec"), pinned)

class ArchiveTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.base = Path(self.temp.name)
        os.chmod(self.base, 0o700)
        self.source, self.mount, self.deploy = [self.base / name for name in ["source", "mount", "deploy"]]
        for path in [self.source, self.mount, self.deploy]:
            path.mkdir(mode=0o700)
        (self.deploy / "scripts").mkdir(mode=0o700)
        self.health = self.deploy / "scripts/prod-healthcheck.sh"
        self.health.write_text("printf 'API liveness OK: synthetic\\nAPI readiness OK: synthetic\\nWEB login OK: synthetic\\n'\n")
        self.tool = self.base / "verifier.py"
        self.tool.write_bytes(FIXTURE.read_bytes())
        self.tool.chmod(0o600)
        self.ctx = module.Context(self.deploy, source=self.source, mount=self.mount, verifier=self.tool,
                                  boundary=self.base, policy=module.Policy(reclaim=2, transfer_cap=2*1024**2, reserve=1024),
                                  device=lambda path: 2 if path == self.mount else 1,
                                  mounted=lambda path: True, free=lambda path: 10**9,
                                  du=lambda path: 1, handles=lambda tree: False)
        self.names = []
        for age in [14, 12, 10, 2, 1]:
            self.make_bundle(f"release-age-{age}", age)

    def make_bundle(self, name, age, copied=None):
        root = self.source / name
        root.mkdir(mode=0o700)
        db = root / "sqlite-synthetic"
        db.mkdir(mode=0o700)
        database = db / "database.sqlite"
        connection = sqlite3.connect(database)
        connection.execute("CREATE TABLE sample(id INTEGER PRIMARY KEY, value TEXT)")
        connection.execute("INSERT INTO sample VALUES(1,'synthetic')")
        connection.commit()
        if getattr(self, "wal_mode", False):
            connection.execute("PRAGMA journal_mode=WAL")
        connection.close()
        media = root / "media-synthetic"
        media.mkdir(mode=0o700)
        (media / "media").mkdir(mode=0o700)
        (media / "media" / "synthetic.bin").write_bytes(b"synthetic-media")
        inventory = {"version":1,"kind":"media-snapshot","entries":pinned["media_inventory"](media / "media")}
        (media / "manifest.json").write_text(json.dumps(inventory))
        checksum = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
        manifest = {"version":1,"kind":"release-recovery-bundle","sourceRevision":"a"*40,
                    "database":{"path":"sqlite-synthetic/database.sqlite","sizeBytes":database.stat().st_size,"sha256":checksum(database)},
                    "media":{"path":"media-synthetic","manifestSha256":checksum(media / "manifest.json")}}
        (root / "release.json").write_text(json.dumps(manifest))
        moment = copied if copied is not None else time.time() - age * 86400
        receipt = {"version":1,"kind":"offsite-release-backup-receipt","bundleName":name,
                   "copiedAt":datetime.datetime.fromtimestamp(moment,datetime.timezone.utc).isoformat(),
                   **pinned["verify_bundle"](root)}
        (root / "offsite-receipt.json").write_text(json.dumps(receipt))
        for file in root.rglob("*"):
            file.chmod(0o700 if file.is_dir() else 0o600)
        os.utime(root, (moment, moment))
        self.names.append(name)
        return root

    def ready(self):
        value = module.plan(self.ctx)
        return value, module.digest(value)

    def finish(self):
        value, sha = self.ready()
        result = module.apply(self.ctx, sha)
        self.assertEqual(result["status"], "ARCHIVE_COMPLETED")
        return value, sha, result

    def test_fixture_is_exact_pinned_source_and_real_verifier_runs(self):
        self.assertEqual(hashlib.sha256(FIXTURE.read_bytes()).hexdigest(), module.PIN)
        for name in self.names:
            self.assertEqual(pinned["verify_bundle"](self.source / name)["sourceRevision"], "a"*40)

    def test_plan_zero_writes_no_verifier_health_or_bytecode_and_stable_digest(self):
        def state():
            return {str(path.relative_to(self.base)):module.fact(path.lstat()) for path in [self.base,*self.base.rglob("*")]}
        before = state()
        with patch.object(module, "verifier", side_effect=AssertionError("not in plan")), patch.object(module, "health", side_effect=AssertionError("not in plan")):
            first = module.plan(self.ctx)
            second = module.plan(self.ctx, time.time()+2)
        self.assertEqual(module.digest(first), module.digest(second))
        self.assertEqual(state(), before)
        self.assertFalse(self.ctx.archive.exists())
        self.assertFalse(list(self.base.rglob("__pycache__")))
        self.assertEqual([row["name"] for row in first["selected"]], ["release-age-14","release-age-12"])

    def test_success_preserves_every_payload_and_protected_sources_repeat_is_verified(self):
        value, sha, result = self.finish()
        self.assertEqual(result["retired_bundles"], 2)
        for row in value["selected"]:
            self.assertFalse((self.source / row["name"]).exists())
            pinned["verify_bundle"](self.ctx.archive / row["name"])
        for name in ["release-age-10","release-age-2","release-age-1"]:
            self.assertTrue((self.source / name).exists())
        repeated = module.apply(self.ctx, sha)
        self.assertEqual(repeated, result)
        self.assertTrue((self.ctx.archive / ".operations" / sha / "recovery-index.json").is_file())

    def test_real_wal_verification_preserves_target_and_exact_resume(self):
        self.wal_mode = True
        self.make_bundle("release-real-wal", 18)
        value, sha = self.ready()
        def stop(event, index):
            if event == "verified" and index == 0:
                raise RuntimeError("synthetic interruption")
        self.ctx.hook = stop
        with self.assertRaises(RuntimeError): module.apply(self.ctx, sha)
        target = self.ctx.archive / value["selected"][0]["name"]
        before = module.snapshot(target, self.ctx.policy)
        self.ctx.hook = lambda event,index:None
        result = module.apply(self.ctx, sha)
        self.assertEqual(result["retired_bundles"], 2)
        self.assertEqual(module.snapshot(target, self.ctx.policy), before)
        self.assertEqual(module.apply(self.ctx, sha), result)
        self.assertFalse(list((self.ctx.archive / ".operations" / sha / ".verification").glob(".database-verify-*")))

    def test_wal_auxiliary_timestamp_only_recovery_preserves_original_plan(self):
        self.wal_mode = True
        self.make_bundle("release-real-wal", 18)
        value, sha = self.ready()
        self.ctx.hook = lambda event,index: (_ for _ in ()).throw(RuntimeError("stop")) if event=="verified" and index==0 else None
        with self.assertRaises(RuntimeError):module.apply(self.ctx,sha)
        target=self.ctx.archive/value["selected"][0]["name"]
        auxiliary=target/"sqlite-synthetic/database.sqlite-shm"
        self.assertTrue(auxiliary.exists())
        before=auxiliary.stat();os.utime(auxiliary,ns=(before.st_atime_ns,before.st_mtime_ns+1000000))
        self.ctx.hook=lambda event,index:None
        self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],2)
        journal=module.sealed_document(self.ctx.archive/".operations"/sha/"journal.json")
        self.assertEqual(len(journal["bundles"][0]["auxiliary_time_reconciliations"]),1)
        self.assertEqual(journal["plan_sha256"],sha)

    def test_private_database_checker_preserves_uncheckpointed_committed_wal_view(self):
        self.wal_mode=True
        root=self.make_bundle("release-real-wal",18)
        database=root/"sqlite-synthetic/database.sqlite"
        writer=sqlite3.connect(database)
        self.addCleanup(writer.close)
        writer.execute("PRAGMA wal_autocheckpoint=0")
        writer.execute("INSERT INTO sample VALUES(2,'committed-wal')")
        writer.commit()
        self.assertGreater(Path(str(database)+"-wal").stat().st_size,0)
        self.ctx.archive.mkdir(mode=0o700)
        scratch=self.ctx.archive/".verification-test"
        verify=module.verifier(self.tool.read_bytes(),self.ctx,scratch)
        before=module.snapshot(root,self.ctx.policy)
        connect=sqlite3.connect;observed=[]
        def inspect(database_uri,*args,**kwargs):
            connection=connect(database_uri,*args,**kwargs)
            if ".database-verify-" in str(database_uri):
                observed.append(connection.execute("SELECT count(*) FROM sample").fetchone()[0])
            return connection
        with patch.object(sqlite3,"connect",side_effect=inspect):verify(root)
        self.assertEqual(observed,[2])
        self.assertEqual(module.snapshot(root,self.ctx.policy),before)
        self.assertFalse(list(scratch.iterdir()))

    def test_wal_copied_reconciliation_survives_publish_before_journal(self):
        self.wal_mode=True;self.make_bundle("release-real-wal",18)
        value,sha=self.ready()
        self.ctx.hook=lambda event,index: (_ for _ in ()).throw(RuntimeError("stop")) if event=="copied" and index==0 else None
        with self.assertRaises(RuntimeError):module.apply(self.ctx,sha)
        stage=self.ctx.archive/".staging"/f"{sha}-0"
        auxiliary=stage/"sqlite-synthetic/database.sqlite-shm"
        before=auxiliary.stat();os.utime(auxiliary,ns=(before.st_atime_ns,before.st_mtime_ns+1000000))
        self.ctx.hook=lambda event,index:None
        original_rename=module.os.rename
        def interrupted(source,target):
            original_rename(source,target)
            if Path(source)==stage:raise RuntimeError("after publication")
        with patch.object(module.os,"rename",side_effect=interrupted),self.assertRaises(RuntimeError):module.apply(self.ctx,sha)
        self.assertTrue((self.ctx.archive/value["selected"][0]["name"]).exists())
        self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],2)

    def test_wal_auxiliary_corruption_and_other_file_timestamp_drift_still_fail(self):
        for changed in ("sqlite-synthetic/database.sqlite-shm", "media-synthetic/media/synthetic.bin"):
            with self.subTest(changed=changed):
                temp=ArchiveTest();temp.setUp();self.addCleanup(temp.doCleanups)
                temp.wal_mode=True;temp.make_bundle("release-real-wal",18)
                value,sha=temp.ready()
                temp.ctx.hook=lambda event,index: (_ for _ in ()).throw(RuntimeError("stop")) if event=="verified" and index==0 else None
                with self.assertRaises(RuntimeError):module.apply(temp.ctx,sha)
                file=temp.ctx.archive/value["selected"][0]["name"]/changed
                if changed.endswith("-shm"):
                    data=file.read_bytes();file.write_bytes(bytes([data[0]^1])+data[1:])
                else:
                    before=file.stat();os.utime(file,ns=(before.st_atime_ns,before.st_mtime_ns+1000000))
                temp.ctx.hook=lambda event,index:None
                with self.assertRaises(module.ArchiveError):module.apply(temp.ctx,sha)
                self.assertTrue(all((temp.source/row["name"]).exists() for row in value["selected"]))

    def test_wrong_pin_plan_digest_device_mount_and_space_fail_without_mutation(self):
        _, sha = self.ready()
        with self.assertRaises(module.ArchiveError): module.apply(self.ctx, "0"*64)
        self.assertFalse(self.ctx.archive.exists())
        for change in [dict(mounted=lambda path:False),dict(device=lambda path:1),dict(free=lambda path:0)]:
            with patch.multiple(self.ctx, **change), self.assertRaises(module.ArchiveError): module.plan(self.ctx)
        self.tool.write_bytes(b"PRIVATE_BAD_TOOL")
        with self.assertRaisesRegex(module.ArchiveError, "VERIFIER_PIN_MISMATCH"): module.plan(self.ctx)
        self.assertFalse(self.ctx.archive.exists())

    def test_logical_cap_and_sparse_file_budget_do_not_use_allocated_size(self):
        file = self.source / "release-age-14" / "sparse.bin"
        with file.open("wb") as stream: stream.truncate(3*1024**2)
        moment=module.metadata(file.parent)[0];os.utime(file.parent,(moment,moment))
        with self.assertRaisesRegex(module.ArchiveError,"SAFE_CANDIDATES_INSUFFICIENT"): self.ready()
        self.assertFalse(self.ctx.archive.exists())

    def test_newest_ties_recent_mismatched_times_unknown_and_incoming_are_preserved(self):
        moment=time.time()-86400
        self.make_bundle("release-tie",1,copied=moment)
        os.utime(self.source/"release-age-1",(moment,moment))
        # An untrusted timestamp is retained even if the directory is old.
        os.utime(self.source/"release-age-10",(time.time()-20*86400,)*2)
        (self.source/".incoming-protected").mkdir(mode=0o700)
        (self.source/"unknown").mkdir(mode=0o700)
        value,_=self.ready()
        self.assertTrue({"release-age-1","release-tie","release-age-10","unknown",".incoming-protected"} <= set(value["protected"]))

    def test_source_symlink_hardlink_special_file_and_drift_block(self):
        _,sha=self.ready()
        file=self.source/"release-age-14"/"release.json"
        original=file.read_bytes()
        file.write_bytes(original+b" ")
        with self.assertRaisesRegex(module.ArchiveError,"PLAN_CHANGED"): module.apply(self.ctx,sha)
        file.write_bytes(original)
        os.symlink("/PRIVATE_TARGET",self.source/"release-age-14"/"link")
        moment=module.metadata(file.parent)[0];os.utime(file.parent,(moment,moment))
        with self.assertRaises(module.ArchiveError): self.ready()
        (self.source/"release-age-14"/"link").unlink()
        os.link(self.source/"release-age-14/media-synthetic/media/synthetic.bin",self.source/"release-age-14"/"hardlink")
        os.utime(file.parent,(moment,moment))
        with self.assertRaises(module.ArchiveError): self.ready()
        (self.source/"release-age-14"/"hardlink").unlink()
        os.mkfifo(self.source/"release-age-14"/"pipe",0o600)
        os.utime(file.parent,(moment,moment))
        with self.assertRaises(module.ArchiveError): self.ready()

    def test_health_requires_all_three_markers_before_any_writes(self):
        _,sha=self.ready()
        self.health.write_text("printf 'API liveness OK: PRIVATE_URL\\n'\n")
        with self.assertRaisesRegex(module.ArchiveError,"HEALTH_GATE_FAILED"): module.apply(self.ctx,sha)
        self.assertFalse(self.ctx.archive.exists())

    def test_target_conflict_and_payload_verifier_failure_never_retire(self):
        _,sha=self.ready()
        self.ctx.archive.mkdir(mode=0o700)
        (self.ctx.archive/"release-age-14").mkdir(mode=0o700)
        with self.assertRaises(module.ArchiveError): module.apply(self.ctx,sha)
        (self.ctx.archive/"release-age-14").rmdir()
        # Metadata can match while actual database content is corrupt.
        db=self.source/"release-age-14/sqlite-synthetic/database.sqlite"
        with db.open("r+b") as stream: stream.write(b"INVALID_DATABASE")
        _,sha=self.ready()
        with self.assertRaises(Exception): module.apply(self.ctx,sha)
        self.assertTrue(all((self.source/name).exists() for name in self.names))

    def test_copy_failure_then_resume_uses_same_selection(self):
        value,sha=self.ready()
        def fail(event,item):
            if event=="file_copied": raise RuntimeError("PRIVATE_COPY_FAILURE")
        self.ctx.hook=fail
        with self.assertRaises(RuntimeError): module.apply(self.ctx,sha)
        self.assertTrue(all((self.source/name).exists() for name in self.names))
        self.ctx.hook=lambda event,item:None
        self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],len(value["selected"]))

    def test_resume_fsyncs_complete_staging_file_before_accepting_its_content(self):
        _,sha=self.ready()
        original_sync=module.os.fsync
        interrupted_id=[]
        def interrupt_before_sync(fd):
            file_id=module.identity(os.fstat(fd))
            staging=self.ctx.archive/".staging"
            if staging.exists() and any(path.is_file() and module.identity(path.lstat())==file_id
                                        for path in staging.rglob("*")):
                interrupted_id.append(file_id)
                raise KeyboardInterrupt()
            return original_sync(fd)
        with patch.object(module.os,"fsync",side_effect=interrupt_before_sync),self.assertRaises(KeyboardInterrupt):
            module.apply(self.ctx,sha)
        self.assertEqual(len(interrupted_id),1)
        def fail_reused_sync(fd):
            if module.identity(os.fstat(fd))==interrupted_id[0]:
                raise OSError("PRIVATE_REUSED_FSYNC_FAILURE")
            return original_sync(fd)
        with patch.object(module.os,"fsync",side_effect=fail_reused_sync),self.assertRaises(OSError):
            module.apply(self.ctx,sha)
        self.assertTrue(all((self.source/name).exists() for name in self.names))
        synced=[]
        def observe_sync(fd):
            if module.identity(os.fstat(fd))==interrupted_id[0]: synced.append(True)
            return original_sync(fd)
        with patch.object(module.os,"fsync",side_effect=observe_sync):
            self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],2)
        self.assertTrue(synced)

    def test_receipt_payload_evidence_mismatch_cannot_retire_valid_payload(self):
        for field,value in [("databaseSha256","0"*64),("mediaManifestSha256","0"*64),
                            ("mediaFileCount",999),("mediaBytes",999),("mediaFileCount",True)]:
            with self.subTest(field=field,value=value):
                child=ArchiveTest("test_fixture_is_exact_pinned_source_and_real_verifier_runs")
                child.setUp()
                try:
                    receipt=child.source/"release-age-14/offsite-receipt.json"
                    data=json.loads(receipt.read_text());data[field]=value
                    receipt.write_text(json.dumps(data))
                    # The actual SQLite/media payload and manifest remain completely valid.
                    pinned["verify_bundle"](receipt.parent)
                    _,sha=child.ready()
                    with self.assertRaisesRegex(module.ArchiveError,"TARGET_RECEIPT_INVALID"):
                        module.apply(child.ctx,sha)
                    self.assertTrue(all((child.source/name).exists() for name in child.names))
                finally: child.doCleanups()

    def test_crash_resume_each_durable_fence_and_partial_purge(self):
        # Each fresh fixture exercises an interruption and same-plan recovery.
        for event in ["stage_intent","stage_created_before_journal","copied","verified","index_durable","retire_intent","renamed_before_journal","renamed","purge_intent","purge_entry","retired"]:
            with self.subTest(event=event):
                with tempfile.TemporaryDirectory() as directory:
                    # Independent instance preserves test isolation without changing production CLI.
                    child=ArchiveTest("test_fixture_is_exact_pinned_source_and_real_verifier_runs")
                    child.setUp()
                    try:
                        _,sha=child.ready()
                        fired=[False]
                        def interrupt(point,item):
                            if point==event and not fired[0]:
                                fired[0]=True
                                raise KeyboardInterrupt()
                        child.ctx.hook=interrupt
                        with self.assertRaises(KeyboardInterrupt): module.apply(child.ctx,sha)
                        child.ctx.hook=lambda point,item:None
                        self.assertEqual(module.apply(child.ctx,sha)["retired_bundles"],2)
                    finally:
                        child.doCleanups()

    def test_active_handles_incomplete_scan_and_new_same_name_are_safe(self):
        _,sha=self.ready()
        self.ctx.handles=lambda tree:True
        with self.assertRaisesRegex(module.ArchiveError,"ACTIVE_HANDLE"): module.apply(self.ctx,sha)
        self.assertTrue((self.source/"release-age-14").exists())
        def incomplete(tree): raise module.ArchiveError("PROC_INCOMPLETE")
        self.ctx.handles=incomplete
        with self.assertRaisesRegex(module.ArchiveError,"PROC_INCOMPLETE"): module.apply(self.ctx,sha)
        self.ctx.handles=lambda tree:False
        fired=[False]
        def replace(event,item):
            if event=="renamed" and not fired[0]:
                fired[0]=True
                self.make_bundle("release-age-14",0)
                raise KeyboardInterrupt()
        self.ctx.hook=replace
        with self.assertRaises(KeyboardInterrupt): module.apply(self.ctx,sha)
        new_id=module.identity((self.source/"release-age-14").lstat())
        self.ctx.hook=lambda event,item:None
        module.apply(self.ctx,sha)
        self.assertEqual(module.identity((self.source/"release-age-14").lstat()),new_id)

    def test_purge_unknown_entry_target_drift_and_journal_tamper_stop(self):
        _,sha=self.ready()
        def halt(event,item):
            if event=="purge_intent": raise KeyboardInterrupt()
        self.ctx.hook=halt
        with self.assertRaises(KeyboardInterrupt): module.apply(self.ctx,sha)
        self.ctx.hook=lambda event,item:None
        retirement=self.source/f".archive-retiring-{sha}-0"
        (retirement/"PRIVATE_UNKNOWN").write_text("keep")
        with self.assertRaisesRegex(module.ArchiveError,"RETIREMENT_EXTRA_ENTRY"): module.apply(self.ctx,sha)
        (retirement/"PRIVATE_UNKNOWN").unlink()
        journal=self.ctx.archive/".operations"/sha/"journal.json"
        raw=json.loads(journal.read_text());raw["payload"]["bundles"][0]["state"]="RETIRED"
        journal.write_text(json.dumps(raw))
        with self.assertRaisesRegex(module.ArchiveError,"JOURNAL_INVALID"): module.apply(self.ctx,sha)

    def test_cli_stdin_is_single_redacted_json_and_rejects_path_overrides(self):
        result=subprocess.run([sys.executable,"-B","-","apply","PRIVATE_BAD_HASH",str(self.deploy)],input=SCRIPT.read_bytes(),capture_output=True)
        self.assertEqual(result.returncode,1)
        self.assertEqual(json.loads(result.stdout),{"status":"FAIL","fixed_failure_code":"EXPECTED_PLAN_REQUIRED"})
        self.assertEqual(result.stderr,b"")
        with patch.object(module,"Context",return_value=self.ctx),contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(module.main(["plan","-",str(self.deploy)]),0)
        public=json.loads(output.getvalue())
        self.assertEqual(public["status"],"PLAN_READY")
        self.assertFalse(any(token in output.getvalue() for token in ["release-age",str(self.base),"PRIVATE"]))

    def test_newest_three_way_tie_is_protected_and_plan_has_no_observation_fields(self):
        moment=time.time()-86400
        for suffix in ["a","b","c"]:
            self.make_bundle("release-tie-"+suffix,1,copied=moment)
        value,_=self.ready()
        self.assertTrue({"release-tie-a","release-tie-b","release-tie-c"} <= set(value["protected"]))
        self.assertNotIn("free",value)
        self.assertNotIn("now",value)
        self.assertFalse(any("atime" in info for row in value["selected"] for info in row["tree"].values()))

    def test_verifier_bytes_are_read_once_and_fsync_failure_preserves_all_sources(self):
        _,sha=self.ready()
        original=module.read_regular
        tool_reads=[]
        def read(path,*args,**kwargs):
            if path==self.tool: tool_reads.append(path)
            return original(path,*args,**kwargs)
        with patch.object(module,"read_regular",side_effect=read): module.apply(self.ctx,sha)
        self.assertEqual(len(tool_reads),1)
        # A different original fixture reaches a real copy before a forced fsync failure.
        child=ArchiveTest("test_fixture_is_exact_pinned_source_and_real_verifier_runs");child.setUp()
        try:
            _,sha=child.ready()
            original_sync=module.fsync_directory
            def sync(path):
                if ".staging" in path.parts: raise OSError("PRIVATE_FSYNC_FAILURE")
                return original_sync(path)
            with patch.object(module,"fsync_directory",side_effect=sync),self.assertRaises(OSError):module.apply(child.ctx,sha)
            self.assertTrue(all((child.source/name).exists() for name in child.names))
        finally: child.doCleanups()

    def test_verified_target_corruption_stops_before_any_retirement(self):
        _,sha=self.ready()
        def halt(event,item):
            if event=="index_durable":raise KeyboardInterrupt()
        self.ctx.hook=halt
        with self.assertRaises(KeyboardInterrupt):module.apply(self.ctx,sha)
        self.ctx.hook=lambda event,item:None
        file=self.ctx.archive/"release-age-14/media-synthetic/media/synthetic.bin"
        file.write_bytes(b"PRIVATE_CORRUPTION")
        with self.assertRaises(module.ArchiveError):module.apply(self.ctx,sha)
        self.assertTrue(all((self.source/name).exists() for name in self.names))

    def test_payload_verification_reused_only_in_current_apply_after_fresh_inventory(self):
        value,sha=self.ready()
        verified=[]
        def verify(path):
            verified.append(path)
            return pinned["verify_bundle"](path)
        with patch.object(module,"verifier",return_value=verify):
            self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],2)
            self.assertEqual(len(verified),len(value["selected"]))
            # Even a completed replay must perform the real verifier again.
            self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],2)
            self.assertEqual(len(verified),2*len(value["selected"]))

    def test_same_apply_target_drift_cannot_use_cached_payload_verification(self):
        _,sha=self.ready()
        def change(event,item):
            if event=="verified":
                file=self.ctx.archive/"release-age-14/media-synthetic/media/synthetic.bin"
                before=file.stat()
                file.write_bytes(b"x"*before.st_size)
                os.utime(file,ns=(before.st_atime_ns,before.st_mtime_ns))
        self.ctx.hook=change
        with self.assertRaisesRegex(module.ArchiveError,"SOURCE_DRIFT"):
            module.apply(self.ctx,sha)
        self.assertTrue(all((self.source/name).exists() for name in self.names))

    def test_completed_copy_resume_budget_counts_only_uncopied_payload(self):
        value,sha=self.ready()
        def halt(event,item):
            if event=="copied":raise KeyboardInterrupt()
        self.ctx.hook=halt
        with self.assertRaises(KeyboardInterrupt):module.apply(self.ctx,sha)
        # First bundle is fully copied; only the second bundle plus reserve is needed.
        budget=value["selected"][1]["logical"]+self.ctx.policy.reserve
        self.ctx.free=lambda path:budget
        self.ctx.hook=lambda event,item:None
        self.assertEqual(module.apply(self.ctx,sha)["retired_bundles"],2)

    def test_actual_descriptor_and_cwd_device_inode_scan_and_incomplete_probe(self):
        proc=self.base/"proc";proc.mkdir(mode=0o700)
        pid=proc/"123";pid.mkdir(mode=0o700);(pid/"fd").mkdir(mode=0o700)
        target=self.source/"release-age-14/media-synthetic/media/synthetic.bin"
        (pid/"fd/3").symlink_to(target)
        tree=module.snapshot(self.source/"release-age-14",self.ctx.policy)
        self.assertTrue(module.active_handles(tree,proc))
        (pid/"fd/3").unlink();(pid/"cwd").symlink_to(self.source/"release-age-14/media-synthetic")
        self.assertTrue(module.active_handles(tree,proc))
        (pid/"cwd").unlink();self.assertFalse(module.active_handles(tree,proc))
        (pid/"fd").rmdir()
        with self.assertRaisesRegex(module.ArchiveError,"PROC_INCOMPLETE"):module.active_handles(tree,proc)

    def test_writer_lock_health_timeout_and_second_health_failure(self):
        _,sha=self.ready()
        self.ctx.archive.mkdir(mode=0o700)
        fd=os.open(self.ctx.archive/".archive.lock",os.O_RDWR|os.O_CREAT,0o600)
        try:
            module.fcntl.flock(fd,module.fcntl.LOCK_EX|module.fcntl.LOCK_NB)
            with self.assertRaisesRegex(module.ArchiveError,"ARCHIVE_WRITER_BUSY"):module.apply(self.ctx,sha)
        finally:os.close(fd)
        process=Mock(pid=123456789)
        process.communicate.side_effect=[subprocess.TimeoutExpired("PRIVATE_COMMAND",120),(b"",b"")]
        with patch.object(module.subprocess,"Popen",return_value=process) as launch,patch.object(module.os,"killpg") as terminate:
            with self.assertRaisesRegex(module.ArchiveError,"HEALTH_GATE_FAILED"):module.health(self.ctx)
            self.assertIs(launch.call_args.kwargs["stdin"],subprocess.DEVNULL)
            self.assertTrue(launch.call_args.kwargs["start_new_session"])
            terminate.assert_called_once_with(process.pid,module.signal.SIGKILL)
        calls=[]
        def gate(ctx):
            calls.append(1)
            if len(calls)>1:raise module.ArchiveError("HEALTH_GATE_FAILED")
        with patch.object(module,"health",side_effect=gate),self.assertRaisesRegex(module.ArchiveError,"HEALTH_GATE_FAILED"):
            module.apply(self.ctx,sha)
        self.assertTrue(all((self.source/name).exists() for name in self.names))

if __name__ == "__main__":
    unittest.main()
