-- Make the robot platform permission labels cover EZVIZ device discovery,
-- local sync and detail refresh endpoints introduced after the original seed.

UPDATE sys_permission
SET name = '机器人萤石平台读取',
    api_path = '/api/v1/robots/cleaning/ezviz-*',
    remark = 'Covers EZVIZ config and platform device discovery for cleaning robots',
    update_time = now()
WHERE code = 'robot_platform_config:read'
  AND is_deleted = false;

UPDATE sys_permission
SET name = '机器人萤石平台维护',
    api_path = '/api/v1/robots/cleaning/ezviz-*',
    remark = 'Covers EZVIZ config, platform device add/sync and robot detail refresh',
    update_time = now()
WHERE code = 'robot_platform_config:update'
  AND is_deleted = false;
