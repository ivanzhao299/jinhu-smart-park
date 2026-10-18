#!/usr/bin/env python3
"""Read only fixed archival metadata and filesystem facts; never open payloads."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat

STATES = ("PLANNED", "COPIED", "VERIFIED", "RETIRE_INTENT", "RENAMED", "PURGE_INTENT", "RETIRED")

def sealed(path):
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.geteuid() or stat.S_IMODE(info.st_mode) != 0o600 or info.st_nlink != 1 or info.st_size > 64*1024**2:
        raise ValueError()
    with path.open("rb") as stream:
        value = json.load(stream)
    payload = value["payload"]
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode()
    if hashlib.sha256(raw).hexdigest() != value["sha256"]:
        raise ValueError()
    return payload

def tree(path, depth=0, result=None, relative=""):
    result = {} if result is None else result
    if depth > 24 or len(result) >= 200000:
        raise ValueError()
    s = path.lstat()
    if not (stat.S_ISREG(s.st_mode) or stat.S_ISDIR(s.st_mode)):
        raise ValueError()
    result[relative] = {"id":[s.st_dev,s.st_ino], "mode":s.st_mode, "uid":s.st_uid, "gid":s.st_gid,
                        "size":s.st_size,"mtime":s.st_mtime_ns,"ctime":s.st_ctime_ns,"links":s.st_nlink}
    if stat.S_ISDIR(s.st_mode):
        for name in sorted(os.listdir(path)):
            tree(path/name, depth+1, result, f"{relative}/{name}" if relative else name)
    return result

def difference(actual, expected):
    counts = {"added":len(actual.keys()-expected.keys()),"missing":len(expected.keys()-actual.keys()),
              "directory_time_only":0,"file_time_only":0,"other_changed":0}
    for key in actual.keys() & expected.keys():
        a,b=actual[key],expected[key]
        if a == b: continue
        stripped=lambda row:{k:v for k,v in row.items() if k not in ("mtime","ctime")}
        if stripped(a)==stripped(b):
            counts["directory_time_only" if stat.S_ISDIR(a["mode"]) else "file_time_only"]+=1
        else: counts["other_changed"]+=1
    return counts

def observe(archive=Path("/srv/jinhu-production-data/smart-control-release-archive"), source=Path("/var/backups/smart-control")):
    operations=archive/".operations"
    result={"status":"OBSERVED","operations":0,"states":{s:0 for s in STATES},"bundles":[]}
    if not operations.exists():return result
    for operation in sorted(operations.iterdir()):
        if result["operations"]>=16 or not re.fullmatch(r"[a-f0-9]{64}",operation.name) or operation.is_symlink() or not operation.is_dir():raise ValueError()
        plan=sealed(operation/"plan.json"); journal=sealed(operation/"journal.json")
        if journal["plan_sha256"]!=operation.name or len(plan["selected"])!=len(journal["bundles"]) or len(plan["selected"])>256:raise ValueError()
        result["operations"]+=1
        for index,(entry,record) in enumerate(zip(plan["selected"],journal["bundles"])):
            if not re.fullmatch(r"release-[A-Za-z0-9_-]+",entry["name"]) or record["state"] not in STATES:raise ValueError()
            row={"index":index,"state":record["state"]};result["states"][record["state"]]+=1
            original=source/entry["name"]
            row["source_exists"]=original.exists()
            if original.exists():row["source_difference"]=difference(tree(original),entry["tree"])
            target=archive/entry["name"]
            stage=archive/".staging"/f"{operation.name}-{index}"
            row["target_exists"]=target.exists();row["stage_exists"]=stage.exists()
            if record.get("target_tree") and (target.exists() or stage.exists()):
                row["target_difference"]=difference(tree(target if target.exists() else stage),record["target_tree"])
            result["bundles"].append(row)
    return result

if __name__=="__main__":
    try:result=observe()
    except Exception:result={"status":"OBSERVATION_UNAVAILABLE"}
    print(json.dumps(result,separators=(",",":")))
