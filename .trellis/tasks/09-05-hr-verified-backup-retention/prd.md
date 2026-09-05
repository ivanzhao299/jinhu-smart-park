# Retain verified pre-import backups

The ongoing HR migration requires usable pre-import recovery material. Gate-19 currently deletes
its temporary dump/archive after a successful restore drill. Preserve that default, but add an
explicit opt-in retention path so a successful drill can leave real, hash-verified recovery files.

Acceptance:
- Default workflow and script do not retain backups or enable import.
- Opt-in checks the fixed independent production data mount before any dump; no root-disk fallback.
- Retain only the exact current-run database dump and file archive after existing restore checks.
- Private directories/files, exclusive new identity, bounded copy, source/destination hash and size
  equality, durable receipt, and no overwrite or automated deletion of retained data.
- Missing mount, unsafe path/permissions, low space, changed bytes, copy failure or timeout fail closed.
- Report only hashes, sizes, timestamps and an opaque backup ID, not paths or private contents.
- Synthetic failure/permission tests and existing deployment contracts pass. No production execution
  in this slice; a retained copy alone does not authorize import or claim full disaster recovery.
