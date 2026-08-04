# Current UAT environment audit (read-only)

Audit time: 2026-08-04, before creating the Track C formal environment.

No container, database, volume, network or service was changed during this audit.

| Formal role | Current container | CPU limit | Memory limit | Storage/source | Formal verdict |
| --- | --- | ---: | ---: | --- | --- |
| Web | `jinhu-uat-web` | unlimited (`NanoCpus=0`) | unlimited (`Memory=0`) | writable repository bind mount | reject |
| API candidate | `nice_bhabha` | unlimited (`NanoCpus=0`) | unlimited (`Memory=0`) | writable repository bind mount | reject |
| PostgreSQL | `jinhu-smart-park-postgres` | unlimited (`NanoCpus=0`) | unlimited (`Memory=0`) | shared `docker_postgres-data` volume | reject |
| Browser worker | none | — | — | — | missing |

Additional isolation failures:

- Web/API use the default Docker bridge while PostgreSQL belongs to the existing
  `docker_default` Compose network; this is not one sealed performance topology.
- The PostgreSQL container serves existing development/UAT state and its shared
  volume. It cannot prove cleanup residual zero for a Track C run.
- The current UAT database `jinhu_uat_20260804` must remain untouched and is not a
  source database for the formal executor. A sanitized custom-format `pg_dump`
  snapshot is restored into a new `jinhu_perf_*` database on a new named volume.
- There is no fixed 2 CPU / 2 GiB worker in the current environment.

The isolated definition in `compose.formal.yml` therefore creates a new project
whose name must begin `jinhu-track-c-perf-`, pins external images by digest, builds
API/Web/control images from one commit, applies exact resource limits, and owns
its network, database volume and file volume. Cleanup targets only that validated
project and deletes its volumes and generated secret files.
