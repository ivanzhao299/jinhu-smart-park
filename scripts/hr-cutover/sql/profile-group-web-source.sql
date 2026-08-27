SET NOCOUNT ON;
SET XACT_ABORT ON;
SET TRANSACTION ISOLATION LEVEL READ COMMITTED;

SELECT 'AUTH|'
  + CAST(COALESCE(IS_SRVROLEMEMBER('sysadmin'),0) AS varchar(1)) + '|'
  + CAST(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','SELECT') AS varchar(1)) + '|'
  + CAST(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','VIEW DEFINITION') AS varchar(1)) + '|'
  + CAST(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','INSERT') AS varchar(1)) + '|'
  + CAST(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','UPDATE') AS varchar(1)) + '|'
  + CAST(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','DELETE') AS varchar(1)) + '|'
  + CAST(HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','EXECUTE') AS varchar(1));

BEGIN TRANSACTION;
DECLARE @counts table (schema_name sysname NOT NULL,table_name sysname NOT NULL,row_count bigint NOT NULL,PRIMARY KEY (schema_name,table_name));
DECLARE @schema sysname,@table sysname,@rows bigint,@sql nvarchar(max);
DECLARE table_cursor CURSOR LOCAL FAST_FORWARD FOR SELECT s.name,t.name FROM sys.tables t JOIN sys.schemas s ON s.schema_id=t.schema_id ORDER BY s.name,t.name;
OPEN table_cursor;
FETCH NEXT FROM table_cursor INTO @schema,@table;
WHILE @@FETCH_STATUS=0
BEGIN
  SET @sql=N'SELECT @value=COUNT_BIG(*) FROM '+QUOTENAME(@schema)+N'.'+QUOTENAME(@table)+N';';
  EXEC sys.sp_executesql @sql,N'@value bigint OUTPUT',@value=@rows OUTPUT;
  INSERT INTO @counts(schema_name,table_name,row_count) VALUES(@schema,@table,@rows);
  FETCH NEXT FROM table_cursor INTO @schema,@table;
END;
CLOSE table_cursor;
DEALLOCATE table_cursor;

SELECT 'CATALOG|'+CAST((SELECT COUNT(*) FROM sys.tables) AS varchar(20))+'|'+CAST((SELECT COUNT(*) FROM sys.columns c JOIN sys.tables t ON t.object_id=c.object_id) AS varchar(20))+'|'+CAST((SELECT COUNT(*) FROM @counts WHERE row_count>0) AS varchar(20))+'|'+CAST((SELECT SUM(row_count) FROM @counts) AS varchar(30))+'|'+CAST((SELECT COUNT(*) FROM sys.views WHERE is_ms_shipped=0) AS varchar(20))+'|'+CAST((SELECT COUNT(*) FROM sys.procedures WHERE is_ms_shipped=0) AS varchar(20))+'|'+CAST((SELECT COUNT(*) FROM sys.objects WHERE type IN ('FN','IF','TF') AND is_ms_shipped=0) AS varchar(20))+'|'+CAST((SELECT COUNT(*) FROM sys.triggers WHERE parent_class_desc='OBJECT_OR_COLUMN' AND is_ms_shipped=0) AS varchar(20));

SELECT 'ROLLUP|'+prefix+'|'+CAST(COUNT(*) AS varchar(20))+'|'+CAST(SUM(row_count) AS varchar(30)) FROM (SELECT row_count,CASE WHEN LOWER(LEFT(table_name,3)) IN ('sys','att','com','dic','pub','emp','org','rec','con','per','tra','ser','civ') THEN LOWER(LEFT(table_name,3)) ELSE 'other' END AS prefix FROM @counts) grouped_counts GROUP BY prefix ORDER BY prefix;

SELECT 'KEY|'+table_name+'|'+CAST(row_count AS varchar(30)) FROM @counts WHERE table_name IN ('Emp_tBasicInfo','Emp_tExperiences','Emp_tFamily','Emp_tContract','Emp_tDimission','Emp_Punish_tApplay','Att_tAttend','Com_tTimeWage','Com_tPricesalary','Com_tDeductSalary','Per_tGuideline','Per_tAssessTemplate','Tra_TraPlan_tPlan','Tra_tEmployeeCourse','Rec_tResumeBasic','Sys_tOperation','Sys_tLogin') ORDER BY table_name;

ROLLBACK TRANSACTION;
