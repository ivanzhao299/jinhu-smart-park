-- Repair floor layout projections left behind by file deletions completed
-- before the floorplan detach workflow was introduced.
UPDATE biz_floor AS floor
SET layout_file_id = NULL,
    layout_url = NULL,
    update_time = now(),
    version = floor.version + 1
FROM sys_file AS layout_file
WHERE floor.layout_file_id = layout_file.id
  AND layout_file.is_deleted = true
  AND floor.is_deleted = false;
