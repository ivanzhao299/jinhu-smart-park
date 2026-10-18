#!/usr/bin/env python3
"""Fixed-scope offsite backup relocation. Public output contains aggregate receipts only."""
import sys
sys.dont_write_bytecode = True
import datetime
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import stat
import subprocess
import tempfile
import time
from dataclasses import dataclass, asdict

PIN = "283c03b16d78afc856d2ba39c331ee2b953e77f015c4a580774a3e380860bc3a"
NAME = re.compile(r"release-[A-Za-z0-9_-]+\Z")
SHA = re.compile(r"[a-f0-9]{64}\Z")

class ArchiveError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code

def require(ok, code):
    if not ok:
        raise ArchiveError(code)

def encoded(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()

def digest(value):
    return hashlib.sha256(encoded(value)).hexdigest()

def identity(info):
    return [info.st_dev, info.st_ino]

def fact(info):
    return {"id": identity(info), "mode": info.st_mode, "uid": info.st_uid,
            "gid": info.st_gid, "size": info.st_size, "mtime": info.st_mtime_ns,
            "ctime": info.st_ctime_ns, "links": info.st_nlink}

def secure(info, directory=False, private=False):
    require(stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode), "UNSAFE_TYPE")
    require(info.st_uid == os.geteuid() and not info.st_mode & 0o022, "UNSAFE_OWNER_OR_MODE")
    if not directory:
        require(info.st_nlink == 1, "HARDLINK_REJECTED")
    if private:
        require(stat.S_IMODE(info.st_mode) == (0o700 if directory else 0o600), "PRIVATE_MODE_REQUIRED")

def ancestors(path, boundary=None):
    for current in [path, *path.parents]:
        info = current.lstat()
        require(stat.S_ISDIR(info.st_mode) and info.st_uid in (0, os.geteuid()) and not info.st_mode & 0o022,
                "UNSAFE_ANCESTOR")
        if boundary is not None and current == boundary:
            break

def read_regular(path, limit=65536, private=False):
    before = path.lstat()
    secure(before, private=private)
    require(before.st_size <= limit, "FILE_BOUND_EXCEEDED")
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        require(fact(os.fstat(fd)) == fact(before), "FILE_DRIFT")
        chunks, remaining = [], limit + 1
        while remaining:
            part = os.read(fd, min(remaining, 65536))
            if not part:
                break
            chunks.append(part)
            remaining -= len(part)
        value = b"".join(chunks)
        require(len(value) == before.st_size and fact(os.fstat(fd)) == fact(before), "FILE_DRIFT")
        return value
    finally:
        os.close(fd)

def document(path, limit=65536, private=False):
    result = json.loads(read_regular(path, limit, private))
    require(isinstance(result, dict), "DOCUMENT_INVALID")
    return result

@dataclass(frozen=True)
class Policy:
    reclaim: int = 28 * 1024**3
    transfer_cap: int = 40 * 1024**3
    reserve: int = 10 * 1024**3
    age: int = 7 * 86400
    time_tolerance: int = 300
    entries: int = 200000
    depth: int = 24

def allocated(path):
    result = subprocess.run(["du", "-P", "-x", "-s", "-k", "--", str(path)],
                            stdin=subprocess.DEVNULL, capture_output=True, timeout=30, check=True)
    fields = result.stdout.split()
    require(len(result.stdout.splitlines()) == 1 and fields and fields[0].isdigit(), "DU_UNAVAILABLE")
    return int(fields[0]) * 1024

def active_handles(tree, proc=Path("/proc")):
    """False is proof of a completed observation, not a lock against future root processes."""
    wanted = {tuple(row["id"]) for row in tree.values()}
    require(proc.is_dir(), "PROC_UNAVAILABLE")
    deadline, count = time.monotonic() + 30, 0
    for process in proc.iterdir():
        if not process.name.isdecimal():
            continue
        try:
            probes = [process / "cwd", process / "root"]
            with os.scandir(process / "fd") as descriptors:
                probes += [Path(entry.path) for entry in descriptors]
            for probe in probes:
                count += 1
                require(count <= 200000 and time.monotonic() < deadline, "PROC_BOUND_EXCEEDED")
                try:
                    if tuple(identity(probe.stat())) in wanted:
                        return True
                except FileNotFoundError:
                    continue  # Closed descriptor or exited process.
        except FileNotFoundError:
            require(not process.exists(), "PROC_INCOMPLETE")
            continue
        except PermissionError as error:
            raise ArchiveError("PROC_INCOMPLETE") from error
    return False

@dataclass
class Context:
    deploy: Path
    source: Path = Path("/var/backups/smart-control")
    mount: Path = Path("/srv/jinhu-production-data")
    verifier: Path = Path("/usr/local/sbin/smart-control-offsite-release-backup.py")
    policy: Policy = Policy()
    boundary: Path = None  # Internal fixtures only; CLI never accepts path overrides.
    device: object = lambda path: path.stat().st_dev
    mounted: object = os.path.ismount
    free: object = lambda path: shutil.disk_usage(path).free
    du: object = allocated
    handles: object = active_handles
    hook: object = lambda event, item: None

    @property
    def archive(self):
        return self.mount / "smart-control-release-archive"

def environment(ctx, tool=None):
    ancestors(ctx.source, ctx.boundary)
    ancestors(ctx.mount, ctx.boundary)
    require(ctx.mounted(ctx.mount), "DATA_MOUNT_REQUIRED")
    require(ctx.device(ctx.mount) != ctx.device(ctx.source), "SEPARATE_DEVICE_REQUIRED")
    secure(ctx.source.lstat(), directory=True)
    tool = read_regular(ctx.verifier) if tool is None else tool
    require(hashlib.sha256(tool).hexdigest() == PIN, "VERIFIER_PIN_MISMATCH")
    if ctx.archive.exists() or ctx.archive.is_symlink():
        secure(ctx.archive.lstat(), directory=True, private=True)
    return tool

def snapshot(path, policy):
    rows, root_dev = {}, path.lstat().st_dev
    def visit(current, relative, depth):
        require(depth <= policy.depth and len(rows) < policy.entries, "TREE_BOUND_EXCEEDED")
        info = current.lstat()
        is_dir = stat.S_ISDIR(info.st_mode)
        secure(info, directory=is_dir)
        require(info.st_dev == root_dev, "TREE_DEVICE_CHANGED")
        rows[relative] = fact(info)
        if is_dir:
            with os.scandir(current) as entries:
                names = sorted(entry.name for entry in entries)
            require(len(names) <= policy.entries, "TREE_BOUND_EXCEEDED")
            for name in names:
                visit(current / name, f"{relative}/{name}" if relative else name, depth + 1)
    visit(path, "", 0)
    return rows

def same_tree(actual, expected, renamed=False):
    if renamed:
        actual = {key: dict(value) for key, value in actual.items()}
        expected = {key: dict(value) for key, value in expected.items()}
        actual.get("", {}).pop("ctime", None)
        expected.get("", {}).pop("ctime", None)
    require(actual == expected, "SOURCE_DRIFT")

def metadata(path):
    raw = read_regular(path / "release.json")
    manifest = json.loads(raw)
    receipt_raw = read_regular(path / "offsite-receipt.json")
    receipt = json.loads(receipt_raw)
    require(manifest.get("kind") == "release-recovery-bundle" and manifest.get("version") == 1,
            "METADATA_INVALID")
    require(receipt.get("kind") == "offsite-release-backup-receipt" and receipt.get("version") == 1
            and receipt.get("bundleName") == path.name
            and receipt.get("manifestSha256") == hashlib.sha256(raw).hexdigest()
            and receipt.get("sourceRevision") == manifest.get("sourceRevision"), "METADATA_INVALID")
    moment = datetime.datetime.fromisoformat(receipt["copiedAt"].replace("Z", "+00:00"))
    require(moment.tzinfo is not None, "METADATA_INVALID")
    return moment.timestamp(), hashlib.sha256(raw).hexdigest(), hashlib.sha256(receipt_raw).hexdigest()

def catalog(ctx):
    with os.scandir(ctx.source) as entries:
        children = list(entries)
    require(len(children) <= 256, "CATALOG_BOUND_EXCEEDED")
    rows = []
    for entry in sorted(children, key=lambda item: item.name):
        info = Path(entry.path).lstat()
        row = {"name": entry.name, "fact": fact(info)}
        if NAME.fullmatch(entry.name) and stat.S_ISDIR(info.st_mode):
            try:
                copied, manifest, receipt = metadata(Path(entry.path))
                row.update(copied=copied, manifest=manifest, receipt=receipt)
            except Exception:
                row["metadata_unknown"] = True
        rows.append(row)
    return rows

def protected(rows, now, policy):
    times = sorted([row["copied"] for row in rows if "copied" in row], reverse=True)
    cutoff = times[min(1, len(times) - 1)] if times else float("inf")
    result = set()
    for row in rows:
        copied, modified = row.get("copied"), row["fact"]["mtime"] / 1e9
        if copied is None or copied >= cutoff or min(now - copied, now - modified) < policy.age or abs(copied - modified) > policy.time_tolerance:
            result.add(row["name"])
    return result

def plan(ctx, now=None, tool=None):
    environment(ctx, tool)
    now = time.time() if now is None else now
    rows = catalog(ctx)
    keep = protected(rows, now, ctx.policy)
    selected, blocks, logical = [], 0, 0
    for row in sorted((row for row in rows if row["name"] not in keep), key=lambda row: (row["copied"], row["name"])):
        tree = snapshot(ctx.source / row["name"], ctx.policy)
        size = sum(item["size"] for item in tree.values() if stat.S_ISREG(item["mode"]))
        require(not (ctx.archive / row["name"]).exists() and not (ctx.archive / row["name"]).is_symlink(), "TARGET_CONFLICT")
        if logical + size > ctx.policy.transfer_cap:
            break
        used = ctx.du(ctx.source / row["name"])
        require(isinstance(used, int) and used >= 0, "DU_UNAVAILABLE")
        selected.append({**row, "tree": tree, "logical": size, "allocated": used})
        logical += size
        blocks += used
        if blocks >= ctx.policy.reclaim:
            break
    require(blocks >= ctx.policy.reclaim and selected, "SAFE_CANDIDATES_INSUFFICIENT")
    require(ctx.free(ctx.mount) >= logical + ctx.policy.reserve, "DATA_RESERVE_INSUFFICIENT")
    value = {"format": 1, "source": str(ctx.source), "archive": str(ctx.archive),
             "source_device": ctx.device(ctx.source), "data_device": ctx.device(ctx.mount),
             "verifier": PIN, "policy": asdict(ctx.policy), "catalog": rows,
             "protected": sorted(keep), "selected": selected}
    require(len(encoded(value)) <= 32 * 1024**2, "PLAN_BOUND_EXCEEDED")
    return value

def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)

def private_directory(path):
    try:
        path.mkdir(mode=0o700)
        fsync_directory(path.parent)
    except FileExistsError:
        pass
    secure(path.lstat(), directory=True, private=True)

def atomic_document(path, value):
    data = encoded({"payload": value, "sha256": digest(value)})
    require(len(data) <= 64 * 1024**2, "JOURNAL_BOUND_EXCEEDED")
    fd, name = tempfile.mkstemp(prefix=".write-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
        fsync_directory(path.parent)
    finally:
        if os.path.exists(name):
            os.unlink(name)

def sealed_document(path):
    envelope = document(path, 64 * 1024**2, private=True)
    require(set(envelope) == {"payload", "sha256"} and digest(envelope["payload"]) == envelope["sha256"], "JOURNAL_INVALID")
    return envelope["payload"]

def health(ctx):
    try:
        process = subprocess.Popen(["sh", str(ctx.deploy / "scripts/prod-healthcheck.sh")],
                                   env={**os.environ, "MODE": "full"}, stdin=subprocess.DEVNULL,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        try:
            output, _ = process.communicate(timeout=120)
        except subprocess.TimeoutExpired as error:
            # Only our own health-check session; never signal running application services.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            try:
                process.communicate(timeout=5)
            except subprocess.SubprocessError:
                process.stdout.close()
                process.stderr.close()
                try:
                    process.wait(timeout=5)
                except subprocess.SubprocessError:
                    pass
            raise ArchiveError("HEALTH_GATE_FAILED") from error
    except (subprocess.SubprocessError, OSError) as error:
        raise ArchiveError("HEALTH_GATE_FAILED") from error
    require(process.returncode == 0 and all(marker in output for marker in
            [b"API liveness OK:", b"API readiness OK:", b"WEB login OK:"]), "HEALTH_GATE_FAILED")

def hashes(path, tree):
    result = {}
    for relative, expected in tree.items():
        if not stat.S_ISREG(expected["mode"]):
            continue
        file = path / relative
        before = file.lstat()
        require(fact(before) == expected, "FILE_DRIFT")
        fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            require(fact(os.fstat(fd)) == expected, "FILE_DRIFT")
            checksum = hashlib.sha256()
            while True:
                part = os.read(fd, 1024 * 1024)
                if not part:
                    break
                checksum.update(part)
            require(fact(os.fstat(fd)) == expected, "FILE_DRIFT")
            result[relative] = {"size": before.st_size, "sha256": checksum.hexdigest()}
        finally:
            os.close(fd)
    return result

def verifier(tool, ctx, scratch_root):
    namespace = {"__name__": "pinned_offsite_verifier"}
    exec(compile(tool, "<pinned-offsite-verifier>", "exec"), namespace)
    original_check = namespace["check_database"]
    private_directory(scratch_root)
    def scratch_check(database, expected):
        # SQLite mode=ro can write WAL/SHM companions. Run the original checker
        # against an exact private copy of the complete SQLite engine view.
        files = [database]
        for suffix in ("-wal", "-shm", "-journal"):
            companion = Path(str(database) + suffix)
            if companion.exists() or companion.is_symlink():
                files.append(companion)
        facts = {file: fact(file.lstat()) for file in files}
        for file in files:
            secure(file.lstat())
        require(ctx.free(ctx.mount) >= sum(row["size"] for row in facts.values()) + ctx.policy.reserve,
                "DATA_RESERVE_INSUFFICIENT")
        with tempfile.TemporaryDirectory(prefix=".database-verify-", dir=scratch_root) as temporary:
            for file in files:
                source_fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    require(fact(os.fstat(source_fd)) == facts[file], "FILE_DRIFT")
                    destination_fd = os.open(Path(temporary) / file.name,
                                             os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
                    with os.fdopen(destination_fd, "wb") as stream:
                        while True:
                            part = os.read(source_fd, 1024 * 1024)
                            if not part:
                                break
                            stream.write(part)
                    require(fact(os.fstat(source_fd)) == facts[file], "FILE_DRIFT")
                finally:
                    os.close(source_fd)
            original_check(Path(temporary) / database.name, expected)
        require(all(fact(file.lstat()) == row for file, row in facts.items()), "FILE_DRIFT")
    namespace["check_database"] = scratch_check
    return namespace["verify_bundle"]

def verify_target(path, entry, record, verify, verified_targets=None, ctx=None):
    tree = snapshot(path, Policy(**record["policy"]))
    previous = record["target_tree"]
    reconciled = tree != previous
    changed = []
    if reconciled:
        # Recover only the observed legacy-verifier WAL/SHM timestamp side effect.
        # Every identity, path, size and other fact remains pinned; full source
        # and target byte evidence is mandatory before accepting new timestamps.
        require(ctx is not None and record["state"] in ("COPIED", "VERIFIED")
                and set(tree) == set(previous), "SOURCE_DRIFT")
        manifest = document(path / "release.json")
        database = manifest.get("database", {}).get("path", "")
        require(re.fullmatch(r"sqlite-[A-Za-z0-9_-]+/database\.sqlite", database) is not None,
                "TARGET_RECEIPT_INVALID")
        allowed = {database + "-wal", database + "-shm"}
        for relative in tree:
            if tree[relative] == previous[relative]:
                continue
            require(relative in allowed and stat.S_ISREG(tree[relative]["mode"])
                    and {k:v for k,v in tree[relative].items() if k not in ("mtime", "ctime")}
                    == {k:v for k,v in previous[relative].items() if k not in ("mtime", "ctime")}, "SOURCE_DRIFT")
            changed.append({"path": relative, "before": previous[relative], "after": tree[relative]})
        source = ctx.source / entry["name"]
        same_tree(snapshot(source, ctx.policy), entry["tree"])
        require(hashes(source, entry["tree"]) == record["hashes"], "SOURCE_DRIFT")
    # This process alone may reuse verified payload evidence after a fresh exact
    # inventory check. Our stage-to-final rename changes only the root ctime.
    # All file facts, the complete path set and root identity remain in the key.
    normalized = {relative: {key: value for key, value in row.items()
                            if not (relative == "" and key == "ctime")}
                  for relative, row in tree.items()}
    verification_key = digest(normalized)
    if not reconciled and verified_targets is not None and verification_key in verified_targets:
        return
    require(hashes(path, tree) == record["hashes"], "TARGET_CONTENT_MISMATCH")
    evidence = verify(path)
    receipt = document(path / "offsite-receipt.json")
    require(evidence["manifestSha256"] == entry["manifest"]
            and receipt.get("kind") == "offsite-release-backup-receipt"
            and type(receipt.get("version")) is int and receipt["version"] == 1
            and receipt.get("bundleName") == entry["name"]
            and all(type(receipt.get(key)) is type(value) and receipt[key] == value
                    for key, value in evidence.items()), "TARGET_RECEIPT_INVALID")
    same_tree(snapshot(path, Policy(**record["policy"])), tree)
    if reconciled:
        for row in changed:
            fd = os.open(path / row["path"], os.O_RDONLY | os.O_NOFOLLOW)
            try:
                require(fact(os.fstat(fd)) == row["after"], "FILE_DRIFT")
                os.fsync(fd)
            finally:
                os.close(fd)
        same_tree(snapshot(path, Policy(**record["policy"])), tree)
        record["auxiliary_time_reconciliations"] = record.get("auxiliary_time_reconciliations", []) + changed
        record["target_tree"] = tree
    if verified_targets is not None:
        verified_targets.add(verification_key)

def copy_bundle(ctx, entry, stage, record):
    expected = entry["tree"]
    if stage.exists() or stage.is_symlink():
        require(identity(stage.lstat()) == record["stage_id"], "STAGING_CONFLICT")
        partial = snapshot(stage, ctx.policy)
        require(set(partial) <= set(expected), "STAGING_CONFLICT")
        for key, value in partial.items():
            require(stat.S_IFMT(value["mode"]) == stat.S_IFMT(expected[key]["mode"]), "STAGING_CONFLICT")
    else:
        require(record.get("stage_id") is None, "STAGING_MISSING")
        private_directory(stage)
        record["stage_id"] = identity(stage.lstat())
    source = ctx.source / entry["name"]
    same_tree(snapshot(source, ctx.policy), expected)
    source_hashes = hashes(source, expected)
    for relative, info in expected.items():
        if relative == "":
            continue
        target = stage / relative
        if stat.S_ISDIR(info["mode"]):
            private_directory(target)
            continue
        if target.exists():
            existing = fact(target.lstat())
            if hashes(stage, {relative: existing}).get(relative) == source_hashes[relative]:
                # A killed prior writer may have completed the bytes but not their fsync.
                # Matching content alone cannot establish durable staging data on resume.
                reused_fd = os.open(target, os.O_RDONLY | os.O_NOFOLLOW)
                try:
                    require(fact(os.fstat(reused_fd)) == existing, "FILE_DRIFT")
                    os.fsync(reused_fd)
                    require(fact(os.fstat(reused_fd)) == existing, "FILE_DRIFT")
                finally:
                    os.close(reused_fd)
                continue
        source_fd = os.open(source / relative, os.O_RDONLY | os.O_NOFOLLOW)
        target_fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
        try:
            secure(os.fstat(target_fd), private=True)
            require(fact(os.fstat(source_fd)) == info, "SOURCE_DRIFT")
            while True:
                chunk = os.read(source_fd, 1024 * 1024)
                if not chunk:
                    break
                view = memoryview(chunk)
                while view:
                    view = view[os.write(target_fd, view):]
            require(fact(os.fstat(source_fd)) == info, "SOURCE_DRIFT")
            os.fsync(target_fd)
        finally:
            os.close(source_fd)
            os.close(target_fd)
        ctx.hook("file_copied", relative)
    same_tree(snapshot(source, ctx.policy), expected)
    for relative, info in sorted(expected.items(), key=lambda item: (item[0].count("/"), len(item[0])), reverse=True):
        if stat.S_ISDIR(info["mode"]):
            fsync_directory(stage / relative)
    target_tree = snapshot(stage, ctx.policy)
    require(hashes(stage, target_tree) == source_hashes, "COPY_CONTENT_MISMATCH")
    record.update(hashes=source_hashes, target_tree=target_tree, policy=asdict(ctx.policy))

def check_subset(path, expected, expected_hashes, policy):
    actual = snapshot(path, policy)
    require(set(actual) <= set(expected), "RETIREMENT_EXTRA_ENTRY")
    for key, row in actual.items():
        old = expected[key]
        if stat.S_ISDIR(row["mode"]):
            require(all(row[field] == old[field] for field in ["id", "mode", "uid", "gid"]), "RETIREMENT_DRIFT")
        else:
            require(row == old, "RETIREMENT_DRIFT")
    require(hashes(path, actual) == {key: expected_hashes[key] for key in actual if key in expected_hashes}, "RETIREMENT_DRIFT")
    return actual

def purge(ctx, path, record):
    actual = check_subset(path, record["retirement_tree"], record["hashes"], ctx.policy)
    require(not ctx.handles(actual), "ACTIVE_HANDLE")
    for relative, info in sorted(actual.items(), key=lambda item: (item[0].count("/"), len(item[0])), reverse=True):
        target = path / relative
        require(identity(target.lstat()) == info["id"], "RETIREMENT_DRIFT")
        if stat.S_ISDIR(info["mode"]):
            os.rmdir(target)
        else:
            os.unlink(target)
        fsync_directory(target.parent)
        ctx.hook("purge_entry", relative)

def validate_resume(ctx, value, expected):
    require(digest(value) == expected and value["format"] == 1 and value["source"] == str(ctx.source)
            and value["archive"] == str(ctx.archive) and value["policy"] == asdict(ctx.policy)
            and value["source_device"] == ctx.device(ctx.source) and value["data_device"] == ctx.device(ctx.mount)
            and value["verifier"] == PIN, "PLAN_BINDING_MISMATCH")

def apply(ctx, expected):
    require(SHA.fullmatch(expected) is not None, "EXPECTED_PLAN_REQUIRED")
    tool = environment(ctx)
    operation = ctx.archive / ".operations" / expected
    saved = operation / "plan.json"
    if saved.exists() or saved.is_symlink():
        ancestors(operation, ctx.boundary)
        secure((ctx.archive / ".operations").lstat(), directory=True, private=True)
        secure(operation.lstat(), directory=True, private=True)
        value = sealed_document(saved)
        validate_resume(ctx, value, expected)
    else:
        value = plan(ctx, tool=tool)
        require(digest(value) == expected, "PLAN_CHANGED")
    health(ctx)  # No mkdir, lock, cache or journal write precedes this gate.
    private_directory(ctx.archive)
    lock_fd = os.open(ctx.archive / ".archive.lock", os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    journal, journal_path = None, operation / "journal.json"
    try:
        secure(os.fstat(lock_fd), private=True)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise ArchiveError("ARCHIVE_WRITER_BUSY") from error
        environment(ctx, tool)
        if saved.exists():
            value = sealed_document(saved)
            validate_resume(ctx, value, expected)
        else:
            require(digest(plan(ctx, tool=tool)) == expected, "PLAN_CHANGED")
            private_directory(ctx.archive / ".operations")
            private_directory(operation)
            atomic_document(saved, value)
        if journal_path.exists() or journal_path.is_symlink():
            journal = sealed_document(journal_path)
            require(journal.get("plan_sha256") == expected and len(journal.get("bundles", [])) == len(value["selected"]), "JOURNAL_INVALID")
        else:
            journal = {"plan_sha256": expected, "bundles": [{"state": "PLANNED", "stage_id": None} for _ in value["selected"]]}
            atomic_document(journal_path, journal)
        pending = 0
        for index, (entry, record) in enumerate(zip(value["selected"], journal["bundles"])):
            if record["state"] != "PLANNED":
                continue
            remaining = entry["logical"]
            stage = ctx.archive / ".staging" / f"{expected}-{index}"
            if record.get("stage_id") is not None:
                require(stage.exists() and identity(stage.lstat()) == record["stage_id"], "STAGING_CONFLICT")
                partial = snapshot(stage, ctx.policy)
                require(set(partial) <= set(entry["tree"]), "STAGING_CONFLICT")
                same_tree(snapshot(ctx.source / entry["name"], ctx.policy), entry["tree"])
                source_hashes = hashes(ctx.source / entry["name"], entry["tree"])
                partial_hashes = hashes(stage, partial)
                remaining -= sum(row["size"] for name, row in partial_hashes.items() if source_hashes.get(name) == row)
            pending += remaining
        require(ctx.free(ctx.mount) >= pending + ctx.policy.reserve, "DATA_RESERVE_INSUFFICIENT")
        verify = verifier(tool, ctx, operation / ".verification")
        verified_targets = set()  # Never persisted or reused across apply/resume calls.
        private_directory(ctx.archive / ".staging")
        # Complete and durably verify every destination before retiring any source.
        for index, (entry, record) in enumerate(zip(value["selected"], journal["bundles"])):
            target = ctx.archive / entry["name"]
            stage = ctx.archive / ".staging" / f"{expected}-{index}"
            require(record["state"] in ["PLANNED", "COPIED", "VERIFIED", "RETIRE_INTENT", "RENAMED", "PURGE_INTENT", "RETIRED"], "JOURNAL_INVALID")
            if record["state"] == "PLANNED":
                require(not target.exists() and not target.is_symlink(), "TARGET_CONFLICT")
                if record.get("stage_id") is None:
                    if not record.get("stage_intent"):
                        require(not stage.exists() and not stage.is_symlink(), "STAGING_CONFLICT")
                        record["stage_intent"] = True
                        atomic_document(journal_path, journal)
                        ctx.hook("stage_intent", index)
                    if not stage.exists() and not stage.is_symlink():
                        private_directory(stage)
                        ctx.hook("stage_created_before_journal", index)
                    secure(stage.lstat(), directory=True, private=True)
                    partial = snapshot(stage, ctx.policy)
                    require(set(partial) <= set(entry["tree"]), "STAGING_CONFLICT")
                    record["stage_id"] = identity(stage.lstat())
                    atomic_document(journal_path, journal)
                copy_bundle(ctx, entry, stage, record)
                record["state"] = "COPIED"
                atomic_document(journal_path, journal)
                ctx.hook("copied", index)
            if record["state"] == "COPIED":
                if not target.exists() and not target.is_symlink():
                    require(identity(stage.lstat()) == record["stage_id"], "STAGING_CONFLICT")
                    verify_target(stage, entry, record, verify, verified_targets, ctx)
                    atomic_document(journal_path, journal)
                    os.rename(stage, target)
                    fsync_directory(stage.parent)
                    fsync_directory(ctx.archive)
                    # Renaming changes the directory ctime; pin the published identity.
                    record["target_tree"] = snapshot(target, ctx.policy)
                else:
                    require(identity(target.lstat()) == record["stage_id"] and not stage.exists(), "TARGET_CONFLICT")
                    published = snapshot(target, ctx.policy)
                    previous = {key:dict(row) for key,row in record["target_tree"].items()}
                    # A completed stage publication changes only its root ctime.
                    # All remaining facts go through the same bounded recovery.
                    previous[""]["ctime"] = published[""]["ctime"]
                    record["target_tree"] = previous
                verify_target(target, entry, record, verify, verified_targets, ctx)
                record["state"] = "VERIFIED"
                atomic_document(journal_path, journal)
                ctx.hook("verified", index)
            verify_target(target, entry, record, verify, verified_targets, ctx)
            atomic_document(journal_path, journal)
        atomic_document(operation / "recovery-index.json", {"plan_sha256": expected,
                        "bundles": [{"name": entry["name"], "target": str(ctx.archive / entry["name"]),
                                     "manifest": entry["manifest"], "source_id": entry["tree"][""]["id"]}
                                    for entry in value["selected"]]})
        ctx.hook("index_durable", 0)
        for index, (entry, record) in enumerate(zip(value["selected"], journal["bundles"])):
            source, target = ctx.source / entry["name"], ctx.archive / entry["name"]
            retirement = ctx.source / f".archive-retiring-{expected}-{index}"
            verify_target(target, entry, record, verify, verified_targets, ctx)
            if record["state"] == "RETIRED":
                require(not retirement.exists() and not retirement.is_symlink(), "RETIREMENT_CONFLICT")
                if source.exists() or source.is_symlink():
                    require(identity(source.lstat()) != entry["tree"][""]["id"], "SOURCE_REAPPEARED")
                continue
            if record["state"] == "VERIFIED":
                require(entry["name"] not in protected(catalog(ctx), time.time(), ctx.policy), "PROTECTED_BUNDLE")
                same_tree(snapshot(source, ctx.policy), entry["tree"])
                require(hashes(source, entry["tree"]) == record["hashes"], "SOURCE_DRIFT")
                require(not ctx.handles(entry["tree"]), "ACTIVE_HANDLE")
                health(ctx)
                record["state"] = "RETIRE_INTENT"
                atomic_document(journal_path, journal)
                ctx.hook("retire_intent", index)
            if record["state"] == "RETIRE_INTENT":
                if retirement.exists() or retirement.is_symlink():
                    require(identity(retirement.lstat()) == entry["tree"][""]["id"], "RETIREMENT_CONFLICT")
                    require(not source.exists() or identity(source.lstat()) != entry["tree"][""]["id"], "RETIREMENT_CONFLICT")
                else:
                    require(entry["name"] not in protected(catalog(ctx), time.time(), ctx.policy), "PROTECTED_BUNDLE")
                    same_tree(snapshot(source, ctx.policy), entry["tree"])
                    require(not ctx.handles(entry["tree"]), "ACTIVE_HANDLE")
                    require(not retirement.exists() and not retirement.is_symlink(), "RETIREMENT_CONFLICT")
                    os.rename(source, retirement)
                    fsync_directory(ctx.source)
                    ctx.hook("renamed_before_journal", index)
                retired_tree = snapshot(retirement, ctx.policy)
                same_tree(retired_tree, entry["tree"], renamed=True)
                record["retirement_tree"] = retired_tree
                record["state"] = "RENAMED"
                atomic_document(journal_path, journal)
                ctx.hook("renamed", index)
            if record["state"] == "RENAMED":
                same_tree(snapshot(retirement, ctx.policy), record["retirement_tree"])
                require(not ctx.handles(record["retirement_tree"]), "ACTIVE_HANDLE")
                health(ctx)
                record["state"] = "PURGE_INTENT"
                atomic_document(journal_path, journal)
                ctx.hook("purge_intent", index)
            if record["state"] == "PURGE_INTENT":
                health(ctx)
                verify_target(target, entry, record, verify, verified_targets, ctx)
                if retirement.exists() or retirement.is_symlink():
                    purge(ctx, retirement, record)
                record["state"] = "RETIRED"
                atomic_document(journal_path, journal)
                ctx.hook("retired", index)
        journal.pop("failure_code", None)
        atomic_document(journal_path, journal)
        return summary(value, expected, "ARCHIVE_COMPLETED", sum(record["state"] == "RETIRED" for record in journal["bundles"]), ctx.free(ctx.source))
    except Exception as error:
        if journal is not None:
            journal["failure_code"] = error.code if isinstance(error, ArchiveError) else "ARCHIVE_OPERATION_FAILED"
            atomic_document(journal_path, journal)
        raise
    finally:
        os.close(lock_fd)

def summary(value, sha, status, retired=0, free=None):
    result = {"status": status, "plan_sha256": sha, "planned_bundles": len(value["selected"]),
              "expected_reclaimed_bytes": sum(row["allocated"] for row in value["selected"]),
              "logical_transfer_bytes": sum(row["logical"] for row in value["selected"]), "retired_bundles": retired}
    if free is not None:
        result["actual_host_free_bytes"] = free
    return result

def main(argv):
    try:
        require(len(argv) == 3 and argv[0] in ["plan", "apply"], "INVALID_ARGUMENTS")
        mode, expected, deploy = argv
        require(mode != "plan" or expected == "-", "INVALID_ARGUMENTS")
        require(Path(deploy).is_absolute() and Path(deploy).is_dir(), "DEPLOY_ROOT_INVALID")
        ctx = Context(Path(deploy))
        if mode == "plan":
            value = plan(ctx)
            result = summary(value, digest(value), "PLAN_READY")
        else:
            result = apply(ctx, expected)
        code = 0
    except Exception as error:
        result = {"status": "FAIL", "fixed_failure_code": error.code if isinstance(error, ArchiveError) else "ARCHIVE_OPERATION_FAILED"}
        code = 1
    print(json.dumps(result, separators=(",", ":")))
    return code

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
