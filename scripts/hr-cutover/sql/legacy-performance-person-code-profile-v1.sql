SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;

IF DATABASEPROPERTYEX(DB_NAME(), 'Updateability') <> 'READ_ONLY'
  THROW 51000, 'PERFORMANCE_PERSON_CODE_SOURCE_NOT_READ_ONLY', 1;
IF COALESCE(IS_SRVROLEMEMBER('sysadmin'), 0) <> 0
   OR COALESCE(IS_ROLEMEMBER('db_datareader'), 0) <> 1
  THROW 51000, 'PERFORMANCE_PERSON_CODE_SOURCE_AUTHORITY_INVALID', 1;

DECLARE @source_set_sha256 varchar(64);

;WITH source_hashes AS (
  SELECT LOWER(CONVERT(varchar(64), HASHBYTES(
    'SHA2_256',
    CONVERT(varbinary(max), CONVERT(nvarchar(4000), source.person))
  ), 2)) AS raw_hash
  FROM dbo.person source
)
SELECT @source_set_sha256 = LOWER(CONVERT(varchar(64), HASHBYTES(
  'SHA2_256',
  (
    SELECT raw_hash AS [text()]
    FROM source_hashes
    ORDER BY raw_hash
    FOR XML PATH(''), TYPE
  ).value('.', 'varchar(max)')
), 2));

;WITH source_rows AS (
  SELECT source.id AS source_row_id,
         CONVERT(nvarchar(4000), source.person) AS source_code
  FROM dbo.person source
), tally AS (
  SELECT TOP (10) ROW_NUMBER() OVER (ORDER BY (SELECT NULL)) AS position
  FROM sys.all_objects
), code_units AS (
  SELECT source.source_row_id,
         UNICODE(SUBSTRING(source.source_code, tally.position, 1)) AS code_unit
  FROM source_rows source
  JOIN tally
    ON tally.position <= CASE
      WHEN source.source_code IS NULL THEN 0
      ELSE DATALENGTH(source.source_code) / 2
    END
), row_profile AS (
  SELECT source.source_row_id,
         source.source_code,
         CASE
           WHEN source.source_code IS NULL THEN 0
           ELSE DATALENGTH(source.source_code) / 2
         END AS code_unit_count,
         CONVERT(varchar(64), HASHBYTES(
           'SHA2_256',
           CONVERT(varbinary(max), COALESCE(source.source_code, N'<NULL>'))
         ), 2) AS exact_hash,
         CONVERT(varchar(64), HASHBYTES(
           'SHA2_256',
           CONVERT(varbinary(max), COALESCE(TRIM(source.source_code), N'<NULL>'))
         ), 2) AS trimmed_hash,
         CONVERT(varchar(64), HASHBYTES(
           'SHA2_256',
           CONVERT(varbinary(max), COALESCE(LOWER(TRIM(source.source_code)), N'<NULL>'))
         ), 2) AS case_fold_hash,
         COALESCE(MAX(CASE WHEN unit.code_unit > 127 THEN 1 ELSE 0 END), 0) AS has_non_ascii,
         COALESCE(MAX(CASE
           WHEN unit.code_unit BETWEEN 13312 AND 19903
             OR unit.code_unit BETWEEN 19968 AND 40959
             OR unit.code_unit BETWEEN 63744 AND 64255
           THEN 1 ELSE 0
         END), 0) AS has_han,
         COALESCE(MAX(CASE
           WHEN unit.code_unit > 127
             AND NOT (
               unit.code_unit BETWEEN 13312 AND 19903
               OR unit.code_unit BETWEEN 19968 AND 40959
               OR unit.code_unit BETWEEN 63744 AND 64255
             )
           THEN 1 ELSE 0
         END), 0) AS has_non_ascii_non_han,
         COALESCE(MAX(CASE
           WHEN unit.code_unit BETWEEN 0 AND 31 OR unit.code_unit BETWEEN 127 AND 159
           THEN 1 ELSE 0
         END), 0) AS has_control,
         COALESCE(MAX(CASE
           WHEN unit.code_unit IN (9,10,11,12,13,32,160,5760,8232,8233,8239,8287,12288)
             OR unit.code_unit BETWEEN 8192 AND 8202
           THEN 1 ELSE 0
         END), 0) AS has_whitespace,
         COALESCE(MAX(CASE
           WHEN unit.code_unit BETWEEN 33 AND 126
             AND NOT (
               unit.code_unit BETWEEN 48 AND 57
               OR unit.code_unit BETWEEN 65 AND 90
               OR unit.code_unit BETWEEN 97 AND 122
               OR unit.code_unit IN (45,95)
             )
           THEN 1 ELSE 0
         END), 0) AS has_ascii_other,
         COALESCE(MAX(CASE WHEN unit.code_unit IN (37,42,63) THEN 1 ELSE 0 END), 0) AS has_wildcard,
         COALESCE(MAX(CASE WHEN unit.code_unit IN (34,39,59,92) THEN 1 ELSE 0 END), 0) AS has_sql_meta
  FROM source_rows source
  LEFT JOIN code_units unit ON unit.source_row_id = source.source_row_id
  GROUP BY source.source_row_id, source.source_code
), exact_duplicates AS (
  SELECT exact_hash
  FROM row_profile
  GROUP BY exact_hash
  HAVING COUNT_BIG(*) > 1
), trim_collisions AS (
  SELECT trimmed_hash
  FROM row_profile
  GROUP BY trimmed_hash
  HAVING COUNT(DISTINCT exact_hash) > 1
), case_fold_collisions AS (
  SELECT case_fold_hash
  FROM row_profile
  GROUP BY case_fold_hash
  HAVING COUNT(DISTINCT trimmed_hash) > 1
)
SELECT
  CAST(1 AS bit) AS databaseReadOnly,
  (SELECT type_info.name
   FROM sys.columns column_info
   JOIN sys.types type_info ON type_info.user_type_id = column_info.user_type_id
   WHERE column_info.object_id = OBJECT_ID(N'dbo.person')
     AND column_info.name = N'person') AS sourceType,
  (SELECT column_info.max_length
   FROM sys.columns column_info
   WHERE column_info.object_id = OBJECT_ID(N'dbo.person')
     AND column_info.name = N'person') AS sourceMaxBytes,
  COUNT_BIG(*) AS totalRows,
  SUM(CASE WHEN source_code IS NULL THEN 1 ELSE 0 END) AS nullRows,
  SUM(CASE WHEN source_code IS NOT NULL AND code_unit_count = 0 THEN 1 ELSE 0 END) AS emptyRows,
  MIN(CASE WHEN source_code IS NOT NULL THEN code_unit_count END) AS minCodeUnits,
  MAX(code_unit_count) AS maxCodeUnits,
  SUM(CASE WHEN source_code <> TRIM(source_code) THEN 1 ELSE 0 END) AS outerSpaceRows,
  SUM(has_whitespace) AS whitespaceRows,
  SUM(has_control) AS controlRows,
  SUM(has_non_ascii) AS nonAsciiRows,
  SUM(has_han) AS hanRows,
  SUM(has_non_ascii_non_han) AS nonAsciiNonHanRows,
  SUM(has_ascii_other) AS asciiOtherRows,
  SUM(has_wildcard) AS wildcardRows,
  SUM(has_sql_meta) AS sqlMetaRows,
  (SELECT COUNT_BIG(*) FROM exact_duplicates) AS exactDuplicateGroups,
  (SELECT COUNT_BIG(*) FROM trim_collisions) AS trimCollisionGroups,
  (SELECT COUNT_BIG(*) FROM case_fold_collisions) AS caseFoldCollisionGroups,
  @source_set_sha256 AS sourceSetSha256
FROM row_profile
FOR JSON PATH, WITHOUT_ARRAY_WRAPPER;
