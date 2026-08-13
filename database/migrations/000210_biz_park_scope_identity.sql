BEGIN;

-- park_id identifies a scope, not a biz_park source row. Historical canonical
-- reconciliation may intentionally retain several source rows in one scope.
DROP INDEX IF EXISTS uq_biz_park_park_id_active;

COMMIT;
