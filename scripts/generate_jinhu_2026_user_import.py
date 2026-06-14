#!/usr/bin/env python3
"""Generate a safe production user import from the 2026 Jinhu duty document.

This script intentionally does not delete or disable existing production users,
roles, organizations, or posts. It only upserts the organization structure and
the users listed in the 2026 duties document, then assigns existing standard
RBAC roles based on each person's responsibility.
"""

from __future__ import annotations

import csv
import json
import os
import secrets
import string
import subprocess
from dataclasses import dataclass
from pathlib import Path


TENANT_ID = "10000001"
PARK_ID = "20000001"
SYSTEM_USER_ID = "360dfaa1-4a72-4559-bac6-967339c4dfc0"
SOURCE_DOC = "/Volumes/mac/Documents/1月23日会议/2026分工与考核文件/金湖集团部门及人员职责分工（2026）.docx"
REPORT_DIR = Path("database/import-reports/jinhu-2026-users")
SQL_OUT = REPORT_DIR / "jinhu_2026_users_import.sql"
CREDENTIALS_OUT = REPORT_DIR / "jinhu_2026_users_initial_credentials.csv"
SUMMARY_OUT = REPORT_DIR / "jinhu_2026_users_permission_mapping.json"


@dataclass(frozen=True)
class Org:
    code: str
    name: str
    org_type: str
    parent_code: str | None
    sort: int
    leader_username: str | None = None


@dataclass(frozen=True)
class Post:
    code: str
    name: str
    sort: int


@dataclass(frozen=True)
class User:
    username: str
    display_name: str
    org_code: str
    post_code: str
    role_codes: tuple[str, ...]
    duty: str


ORGS = (
    Org("JH_GROUP", "山东金湖集团有限公司", "group", None, 10, "zhaoyongwei"),
    Org("JH_EXEC", "集团管理层", "department", "JH_GROUP", 20, "zhaoyongwei"),
    Org("JH_HR_ADMIN", "人力资源与综合行政管理部", "department", "JH_GROUP", 30, "wuenguo"),
    Org("JH_FINANCE", "财务管理部", "department", "JH_GROUP", 40, "liuhantao"),
    Org("JH_LEGAL", "法律合规管理部", "department", "JH_GROUP", 50, "jiangbeiping"),
    Org("JH_ENGINEERING_PROPERTY", "工程建设与物业管理部", "department", "JH_GROUP", 60, "lirongjie"),
    Org("JH_LEASING_OPERATIONS", "招商与园区运营管理部", "department", "JH_GROUP", 70, "songqianchang"),
    Org("JH_SUBSIDIARIES", "成员公司及项目负责人", "department", "JH_GROUP", 80, "xuwanxi"),
    Org("JH_PRESIDENT_OFFICE", "总裁办公室", "department", "JH_GROUP", 90, "wangxinxin"),
    Org("JH_LY_GK_TECH_PARK", "临沂国控科技产业园开发有限公司", "company", "JH_SUBSIDIARIES", 110, "chengxiaojie"),
    Org("JH_NEW_MATERIALS", "山东金湖新材料科技有限公司", "company", "JH_SUBSIDIARIES", 120, "songyongshan"),
    Org("JH_REAL_ESTATE", "山东金湖置业有限公司", "company", "JH_SUBSIDIARIES", 130, "jiangbeiping"),
    Org("JH_HUIJIN_ZHICHUANG", "汇金智创（山东）产业发展有限公司", "company", "JH_SUBSIDIARIES", 140, "xuwanxi"),
    Org("JH_SHUAIKE_AUTO", "山东帅科自动化科技有限公司", "company", "JH_SUBSIDIARIES", 150, "wanglejin"),
)


POSTS = (
    Post("GROUP_PRESIDENT", "集团总裁", 10),
    Post("GROUP_VP", "集团副总裁", 20),
    Post("HR_ADMIN_MANAGER", "人力资源管理中心、综合行政管理中心经理", 30),
    Post("HR_ASSISTANT", "人力资源助理", 40),
    Post("ADMIN_DEPUTY_DIRECTOR", "综合行政管理中心副主任", 50),
    Post("FINANCE_MANAGER", "财务管理中心经理", 60),
    Post("FINANCE_DEPUTY_MANAGER", "财务管理中心副经理", 70),
    Post("LEGAL_COMPLIANCE_MANAGER", "法律合规部经理", 80),
    Post("ENGINEERING_PROPERTY_MANAGER", "工程物管中心经理", 90),
    Post("ENGINEERING_PROJECT_MANAGER", "工程项目经理、总工程师", 100),
    Post("INSTALLATION_ENGINEER", "项目安装工程师", 110),
    Post("LEASING_LEAD", "园区招商负责人", 120),
    Post("PROPERTY_SITE_MANAGER", "园区物业管理负责人", 130),
    Post("SUBSIDIARY_GENERAL_MANAGER", "成员公司总经理/项目负责人", 140),
    Post("PRESIDENT_OFFICE_DEPUTY", "总裁办副主任、民宿业务负责人", 150),
    Post("PRESIDENT_ASSISTANT", "总裁助理", 160),
    Post("PRESIDENT_OFFICE_ASSISTANT", "总裁办综合事务助理", 170),
)


USERS = (
    User("zhaoyongwei", "赵永伟", "JH_EXEC", "GROUP_PRESIDENT", ("EXECUTIVE", "OPERATIONS_OWNER"), "全面负责集团发展战略、经营管理及重大事项决策"),
    User("xuwanxi", "许万玺", "JH_EXEC", "GROUP_VP", ("EXECUTIVE", "OPERATIONS_OWNER", "INVEST_MANAGER", "PROPERTY_MANAGER"), "分管重点项目、产业园招商运营、工程建设及综合协调；兼汇金智创总经理"),
    User("wuenguo", "吴恩国", "JH_HR_ADMIN", "HR_ADMIN_MANAGER", ("SYSTEM_ADMIN",), "负责人力资源管理体系、人员规划、薪酬绩效、劳动关系、社保及综合行政管理"),
    User("yuanhaitao", "苑海涛", "JH_HR_ADMIN", "HR_ASSISTANT", ("AUDITOR",), "协助劳动关系、社会保险、人事事务及生产后勤协调"),
    User("liuxia", "刘霞", "JH_HR_ADMIN", "ADMIN_DEPUTY_DIRECTOR", ("SYSTEM_ADMIN", "AUDITOR"), "负责档案、证章、会议组织、行政支持、统计报送及后勤协调"),
    User("liuhantao", "刘汉涛", "JH_FINANCE", "FINANCE_MANAGER", ("FINANCE_MANAGER",), "负责财务管理、资金运作、税务管理、融资协调及财务监督"),
    User("wangyanxiu", "王艳秀", "JH_FINANCE", "FINANCE_DEPUTY_MANAGER", ("FINANCE_SPECIALIST",), "协助财务核算、资金执行及相关财务管理"),
    User("jiangbeiping", "蒋北平", "JH_LEGAL", "LEGAL_COMPLIANCE_MANAGER", ("EXECUTIVE", "AUDITOR"), "负责法律事务、合规管理、合同审查、涉法涉诉及风险防控；兼金湖置业经营管理"),
    User("lirongjie", "李荣杰", "JH_ENGINEERING_PROPERTY", "ENGINEERING_PROPERTY_MANAGER", ("PROPERTY_MANAGER", "SAFETY_MANAGER", "IOT_MANAGER"), "负责工程建设管理及园区物业运营管理体系运行"),
    User("shaominghong", "邵明洪", "JH_ENGINEERING_PROPERTY", "ENGINEERING_PROJECT_MANAGER", ("PROPERTY_STAFF", "MAINTENANCE_ENGINEER"), "负责工程项目技术、质量、进度、验收及结算管理"),
    User("zhengziyong", "郑子勇", "JH_ENGINEERING_PROPERTY", "INSTALLATION_ENGINEER", ("MAINTENANCE_ENGINEER", "IOT_OPERATOR"), "负责机电安装及相关专业技术管理"),
    User("songqianchang", "宋乾昌", "JH_LEASING_OPERATIONS", "LEASING_LEAD", ("INVEST_MANAGER",), "负责园区招商策划、实施、客户服务及招商运营管理"),
    User("chenguohui", "陈国辉", "JH_LEASING_OPERATIONS", "PROPERTY_SITE_MANAGER", ("PROPERTY_MANAGER", "SAFETY_MANAGER"), "负责园区物业现场运营、服务管理及物业团队建设"),
    User("chengxiaojie", "程效杰", "JH_LY_GK_TECH_PARK", "SUBSIDIARY_GENERAL_MANAGER", ("EXECUTIVE",), "临沂国控科技产业园开发有限公司总经理"),
    User("songyongshan", "宋永山", "JH_NEW_MATERIALS", "SUBSIDIARY_GENERAL_MANAGER", ("EXECUTIVE",), "山东金湖新材料科技有限公司总经理"),
    User("wanglejin", "王乐金", "JH_SHUAIKE_AUTO", "SUBSIDIARY_GENERAL_MANAGER", ("EXECUTIVE",), "山东帅科自动化科技有限公司总经理"),
    User("wangxinxin", "王欣欣", "JH_PRESIDENT_OFFICE", "PRESIDENT_OFFICE_DEPUTY", ("SYSTEM_ADMIN", "EXECUTIVE"), "负责总裁办公室综合事务及集团民宿业务运营管理"),
    User("lixiaobin", "李晓斌", "JH_PRESIDENT_OFFICE", "PRESIDENT_ASSISTANT", ("EXECUTIVE",), "协助总裁处理日常事务、新业务拓展及综合协调"),
    User("zhaoweichen", "赵炜晨", "JH_PRESIDENT_OFFICE", "PRESIDENT_OFFICE_ASSISTANT", ("AUDITOR",), "协助总裁、副总裁开展日常事务协调及相关执行工作"),
)


def main() -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    credentials = [(user, make_password()) for user in USERS]
    hashes = {user.username: bcrypt_hash(password) for user, password in credentials}
    SQL_OUT.write_text(build_sql(hashes), encoding="utf-8")
    write_credentials(credentials)
    write_summary()
    print(f"users={len(USERS)} orgs={len(ORGS)} posts={len(POSTS)}")
    print(SQL_OUT.resolve())
    print(CREDENTIALS_OUT.resolve())
    print(SUMMARY_OUT.resolve())


def make_password() -> str:
    alphabet = string.ascii_letters + string.digits
    token = "".join(secrets.choice(alphabet) for _ in range(14))
    return f"Jh@{token}"


def bcrypt_hash(password: str) -> str:
    script = "const bcrypt=require('bcrypt'); bcrypt.hash(process.env.PASSWORD, 10).then(h=>console.log(h));"
    result = subprocess.run(
        ["node", "-e", script],
        env={**os.environ, "PASSWORD": password},
        cwd="apps/api",
        text=True,
        check=True,
        capture_output=True,
    )
    return result.stdout.strip()


def build_sql(hashes: dict[str, str]) -> str:
    return "\n".join(
        [
            "BEGIN;",
            upsert_orgs(),
            update_org_parents(),
            upsert_posts(),
            upsert_users(hashes),
            upsert_password_identities(),
            set_org_leaders(),
            upsert_user_orgs(),
            upsert_user_roles(),
            "COMMIT;",
        ]
    )


def upsert_orgs() -> str:
    values = ",\n".join(f"({q(org.code)}, {q(org.name)}, {q(org.org_type)}, {org.sort})" for org in ORGS)
    return f"""
WITH src(org_code, org_name, org_type, sort_order) AS (
  VALUES
{values}
)
INSERT INTO sys_org (tenant_id, park_id, org_code, org_name, org_type, sort_order, status, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, org_code, org_name, org_type, sort_order, 'enabled', {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, {q(source_remark())}
FROM src
ON CONFLICT (tenant_id, park_id, org_code) WHERE is_deleted = false
DO UPDATE SET org_name = EXCLUDED.org_name,
              org_type = EXCLUDED.org_type,
              sort_order = EXCLUDED.sort_order,
              status = 'enabled',
              update_by = EXCLUDED.update_by,
              update_time = now(),
              remark = EXCLUDED.remark;
"""


def update_org_parents() -> str:
    values = ",\n".join(f"({q(org.code)}, {q(org.parent_code) if org.parent_code else 'NULL'})" for org in ORGS)
    return f"""
WITH src(org_code, parent_code) AS (
  VALUES
{values}
)
UPDATE sys_org child
   SET parent_id = parent.id,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
  FROM src
  LEFT JOIN sys_org parent
    ON parent.tenant_id = {q(TENANT_ID)}
   AND parent.park_id = {q(PARK_ID)}
   AND parent.org_code = src.parent_code
   AND parent.is_deleted = false
 WHERE child.tenant_id = {q(TENANT_ID)}
   AND child.park_id = {q(PARK_ID)}
   AND child.org_code = src.org_code
   AND child.is_deleted = false;
"""


def upsert_posts() -> str:
    values = ",\n".join(f"({q(post.code)}, {q(post.name)}, {post.sort})" for post in POSTS)
    return f"""
WITH src(post_code, post_name, sort_order) AS (
  VALUES
{values}
)
INSERT INTO sys_post (tenant_id, park_id, post_code, post_name, sort_order, status, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, post_code, post_name, sort_order, 'enabled', {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, {q(source_remark())}
FROM src
ON CONFLICT (tenant_id, park_id, post_code) WHERE is_deleted = false
DO UPDATE SET post_name = EXCLUDED.post_name,
              sort_order = EXCLUDED.sort_order,
              status = 'enabled',
              update_by = EXCLUDED.update_by,
              update_time = now(),
              remark = EXCLUDED.remark;
"""


def upsert_users(hashes: dict[str, str]) -> str:
    values = ",\n".join(
        f"({q(user.username)}, {q(user.display_name)}, {q(hashes[user.username])}, {q(user.duty)})"
        for user in USERS
    )
    return f"""
WITH src(username, display_name, password_hash, duty) AS (
  VALUES
{values}
)
INSERT INTO sys_user (tenant_id, park_id, username, display_name, password_hash, is_enabled, status, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, username, display_name, password_hash, true, 'enabled', {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, duty || '；' || {q(source_remark())}
FROM src
ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false
DO UPDATE SET display_name = EXCLUDED.display_name,
              is_enabled = true,
              status = 'enabled',
              update_by = EXCLUDED.update_by,
              update_time = now(),
              remark = EXCLUDED.remark;
"""


def upsert_password_identities() -> str:
    values = ",\n".join(f"({q(user.username)})" for user in USERS)
    return f"""
WITH src(username) AS (
  VALUES
{values}
),
resolved AS (
  SELECT users.id AS user_id, users.username, users.display_name, users.mobile, users.email, users.avatar_url
  FROM src
  JOIN sys_user users
    ON users.tenant_id = {q(TENANT_ID)}
   AND users.park_id = {q(PARK_ID)}
   AND users.username = src.username
   AND users.is_deleted = false
),
updated AS (
  UPDATE sys_user_identity identity
     SET provider_user_id = resolved.username,
         mobile = resolved.mobile,
         email = resolved.email,
         nickname = resolved.display_name,
         avatar_url = resolved.avatar_url,
         bind_status = 'bound',
         is_deleted = false,
         update_by = resolved.user_id,
         update_time = now(),
         remark = {q(source_remark())}
    FROM resolved
   WHERE identity.tenant_id = {q(TENANT_ID)}
     AND identity.park_id = {q(PARK_ID)}
     AND identity.user_id = resolved.user_id
     AND identity.provider = 'password'
   RETURNING identity.id
)
INSERT INTO sys_user_identity (
  tenant_id, park_id, user_id, provider, provider_user_id, mobile, email,
  nickname, avatar_url, bind_status, create_by, update_by, remark
)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, user_id, 'password', username, mobile, email,
       display_name, avatar_url, 'bound', user_id, user_id, {q(source_remark())}
FROM resolved
WHERE NOT EXISTS (
  SELECT 1 FROM sys_user_identity identity
   WHERE identity.tenant_id = {q(TENANT_ID)}
     AND identity.park_id = {q(PARK_ID)}
     AND identity.user_id = resolved.user_id
     AND identity.provider = 'password'
     AND identity.is_deleted = false
);
"""


def set_org_leaders() -> str:
    values = ",\n".join(f"({q(org.code)}, {q(org.leader_username)})" for org in ORGS if org.leader_username)
    return f"""
WITH src(org_code, username) AS (
  VALUES
{values}
)
UPDATE sys_org org
   SET leader_user_id = users.id,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
  FROM src
  JOIN sys_user users
    ON users.tenant_id = {q(TENANT_ID)}
   AND users.park_id = {q(PARK_ID)}
   AND users.username = src.username
   AND users.is_deleted = false
 WHERE org.tenant_id = {q(TENANT_ID)}
   AND org.park_id = {q(PARK_ID)}
   AND org.org_code = src.org_code
   AND org.is_deleted = false;
"""


def upsert_user_orgs() -> str:
    values = ",\n".join(f"({q(user.username)}, {q(user.org_code)}, {q(user.post_code)})" for user in USERS)
    return f"""
WITH src(username, org_code, post_code) AS (
  VALUES
{values}
),
resolved AS (
  SELECT users.id AS user_id, org.id AS org_id, post.id AS post_id
  FROM src
  JOIN sys_user users ON users.tenant_id = {q(TENANT_ID)} AND users.park_id = {q(PARK_ID)} AND users.username = src.username AND users.is_deleted = false
  JOIN sys_org org ON org.tenant_id = {q(TENANT_ID)} AND org.park_id = {q(PARK_ID)} AND org.org_code = src.org_code AND org.is_deleted = false
  JOIN sys_post post ON post.tenant_id = {q(TENANT_ID)} AND post.park_id = {q(PARK_ID)} AND post.post_code = src.post_code AND post.is_deleted = false
),
updated AS (
  UPDATE rel_user_org link
     SET org_id = resolved.org_id,
         post_id = resolved.post_id,
         is_primary = true,
         is_deleted = false,
         update_by = {q(SYSTEM_USER_ID)},
         update_time = now(),
         remark = {q(source_remark())}
    FROM resolved
   WHERE link.tenant_id = {q(TENANT_ID)}
     AND link.park_id = {q(PARK_ID)}
     AND link.user_id = resolved.user_id
     AND link.is_primary = true
   RETURNING link.id
)
INSERT INTO rel_user_org (tenant_id, park_id, user_id, org_id, post_id, is_primary, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, user_id, org_id, post_id, true, {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, {q(source_remark())}
FROM resolved
WHERE NOT EXISTS (
  SELECT 1 FROM rel_user_org link
  WHERE link.tenant_id = {q(TENANT_ID)} AND link.park_id = {q(PARK_ID)}
    AND link.user_id = resolved.user_id AND link.is_primary = true AND link.is_deleted = false
);
"""


def upsert_user_roles() -> str:
    rows = [(user.username, role_code) for user in USERS for role_code in user.role_codes]
    values = ",\n".join(f"({q(username)}, {q(role_code)})" for username, role_code in rows)
    return f"""
WITH src(username, role_code) AS (
  VALUES
{values}
),
resolved AS (
  SELECT users.id AS user_id, role.id AS role_id
  FROM src
  JOIN sys_user users ON users.tenant_id = {q(TENANT_ID)} AND users.park_id = {q(PARK_ID)} AND users.username = src.username AND users.is_deleted = false
  JOIN sys_role role ON role.tenant_id = {q(TENANT_ID)} AND role.park_id = {q(PARK_ID)} AND role.code = src.role_code AND role.is_deleted = false
),
reactivated AS (
  UPDATE rel_user_role link
     SET is_deleted = false,
         update_by = {q(SYSTEM_USER_ID)},
         update_time = now(),
         remark = {q(source_remark())}
    FROM resolved
   WHERE link.tenant_id = {q(TENANT_ID)}
     AND link.park_id = {q(PARK_ID)}
     AND link.user_id = resolved.user_id
     AND link.role_id = resolved.role_id
   RETURNING link.id
)
INSERT INTO rel_user_role (tenant_id, park_id, user_id, role_id, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, user_id, role_id, {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, {q(source_remark())}
FROM resolved
WHERE NOT EXISTS (
  SELECT 1 FROM rel_user_role link
  WHERE link.tenant_id = {q(TENANT_ID)} AND link.park_id = {q(PARK_ID)}
    AND link.user_id = resolved.user_id AND link.role_id = resolved.role_id AND link.is_deleted = false
);
"""


def write_credentials(credentials: list[tuple[User, str]]) -> None:
    org_names = {org.code: org.name for org in ORGS}
    post_names = {post.code: post.name for post in POSTS}
    with CREDENTIALS_OUT.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["username", "display_name", "initial_password", "roles", "department", "post", "duty"])
        for user, password in credentials:
            writer.writerow([
                user.username,
                user.display_name,
                password,
                ";".join(user.role_codes),
                org_names[user.org_code],
                post_names[user.post_code],
                user.duty,
            ])


def write_summary() -> None:
    org_names = {org.code: org.name for org in ORGS}
    post_names = {post.code: post.name for post in POSTS}
    summary = {
        "source_doc": SOURCE_DOC,
        "tenant_id": TENANT_ID,
        "park_id": PARK_ID,
        "strategy": "只新增/更新职责文档人员、组织、岗位和角色关系；不清理任何现有生产用户、角色、组织或岗位。",
        "users": [
            {
                "username": user.username,
                "display_name": user.display_name,
                "department": org_names[user.org_code],
                "post": post_names[user.post_code],
                "role_codes": list(user.role_codes),
                "duty": user.duty,
            }
            for user in USERS
        ],
        "role_mapping_notes": {
            "EXECUTIVE": "高层/成员公司负责人，只读经营数据并可参与关键审批。",
            "OPERATIONS_OWNER": "园区运营负责人，覆盖招商、物业、安全、IoT、能源等运营权限。",
            "SYSTEM_ADMIN": "系统管理类权限，用于组织、用户、角色、字典等后台维护。",
            "FINANCE_MANAGER": "财务主管权限。",
            "FINANCE_SPECIALIST": "财务专员权限。",
            "INVEST_MANAGER": "招商主管权限。",
            "PROPERTY_MANAGER": "物业主管权限。",
            "SAFETY_MANAGER": "安全主管权限。",
            "IOT_MANAGER": "设备主管权限。",
            "IOT_OPERATOR": "设备运维权限。",
            "MAINTENANCE_ENGINEER": "维修工程师权限。",
            "PROPERTY_STAFF": "物业专员/派单员权限。",
            "AUDITOR": "审计/只读权限。"
        },
        "known_gaps": [
            "文档未提供手机号，当前只创建账号密码登录；手机号登录需后续补充手机号并绑定身份。",
            "系统暂无独立法务、人事、总裁办业务模块，因此先映射到现有标准角色；后续可按实际审批流程细化专用角色。",
            "成员公司负责人当前映射为 EXECUTIVE，只读/审批能力偏高，生产使用后可根据实际数据范围再收窄。"
        ],
    }
    SUMMARY_OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def source_remark() -> str:
    return "依据《金湖集团部门及人员职责分工（2026）》生产导入"


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


if __name__ == "__main__":
    main()
