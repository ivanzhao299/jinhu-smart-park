#!/usr/bin/env python3
"""Import Jinhu organization, roles, users, and role permissions from 2026 duties document."""

from __future__ import annotations

import argparse
import csv
import json
import secrets
import string
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


TENANT_ID = "10000001"
PARK_ID = "20000001"
SYSTEM_USER_ID = "00000000-0000-4000-8000-000000001001"
SOURCE_DOC = "/Volumes/mac/Documents/1月23日会议/2026分工与考核文件/金湖集团部门及人员职责分工（2026）.docx"
IMPORT_USER = "jinhu-rbac-import"
REPORT_DIR = Path("database/import-reports")
SQL_OUT = REPORT_DIR / "jinhu_rbac_import_20260518.sql"
CREDENTIALS_OUT = REPORT_DIR / "jinhu_rbac_initial_credentials_20260518.csv"
SUMMARY_OUT = REPORT_DIR / "jinhu_rbac_import_summary_20260518.json"


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
class Role:
    code: str
    name: str
    permissions: tuple[str, ...]
    sort: int
    remark: str
    data_scope: str = "50"


@dataclass(frozen=True)
class User:
    username: str
    name: str
    primary_org: str
    post_code: str
    role_codes: tuple[str, ...]
    duty: str


def uniq(items: Iterable[str]) -> tuple[str, ...]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        if item in seen:
            continue
        seen.add(item)
        result.append(item)
    return tuple(result)


SYSTEM_BASE = (
    "system:user:me",
)

BUSINESS_READ = SYSTEM_BASE + (
    "cockpit",
    "cockpit:read",
    "asset",
    "asset:park",
    "asset:building",
    "asset:floor",
    "asset:unit",
    "asset:dashboard",
    "asset:unit-status-board",
    "asset:statistics-page",
    "asset:read",
    "asset:statistics",
    "asset:statistics:read",
    "asset:status_board",
    "park:read",
    "building:read",
    "floor:read",
    "unit:read",
    "leasing",
    "leasing:tenant",
    "leasing:lead",
    "leasing:lead-pool",
    "leasing:invest",
    "leasing:contract",
    "leasing:contract-change",
    "leasing:checkout",
    "leasing:receivable",
    "leasing:payment",
    "leasing:aging",
    "leasing:invoice",
    "leasing:refund",
    "leasing:waiver",
    "invest:read",
    "leasing_statistics:funnel",
    "leasing_lead:read",
    "leasing_lead_pool:read",
    "leasing_follow:read",
    "leasing_visit:read",
    "leasing_quote:read",
    "leasing_contract:read",
    "leasing_contract:file_read",
    "leasing_contract:status_log",
    "leasing_contract:action_log",
    "leasing_contract_unit:read",
    "leasing_contract_change:read",
    "leasing_checkout:read",
    "leasing_receivable:read",
    "leasing_receivable:aging",
    "leasing_receivable:overdue",
    "leasing_payment:read",
    "leasing_invoice:read",
    "leasing_refund:read",
    "leasing_waiver:read",
    "park_tenant:read",
    "park_tenant:360",
    "park_tenant_contact:read",
    "park_tenant_qualification:read",
    "file:read",
    "file:download",
)

SYSTEM_READ = SYSTEM_BASE + (
    "system",
    "system:org",
    "system:user",
    "system:role",
    "system:dict-type",
    "system:dict-item",
    "system:audit",
    "system:audit-login-log",
    "system:file",
    "system:org:list",
    "system:org:detail",
    "system:user:list",
    "system:user:detail",
    "system:role:list",
    "system:role:detail",
    "system:dict-type:list",
    "system:dict-type:detail",
    "system:dict-item:list",
    "system:dict-item:detail",
    "system:audit:op-log:list",
    "system:audit:login-log:list",
    "system:attachment:list",
    "system:attachment:detail",
    "audit:read",
)

ORG_USER_MANAGE = SYSTEM_READ + (
    "system:org:create",
    "system:org:update",
    "system:user:create",
    "system:user:update",
    "system:user:reset-password",
    "system:user:assign-roles",
    "role:read",
)

ASSET_MANAGE = BUSINESS_READ + (
    "park:create",
    "park:update",
    "building:create",
    "building:update",
    "floor:create",
    "floor:update",
    "floor:upload_layout",
    "unit:create",
    "unit:update",
    "unit:change_status",
    "unit:transition_status",
    "unit:status_log",
    "unit:export",
    "asset:park:create",
    "asset:park:update",
    "asset:building:create",
    "asset:building:update",
    "asset:floor:create",
    "asset:floor:update",
    "asset:unit:create",
    "asset:unit:update",
    "file:upload",
)

PROPERTY_MANAGE = ASSET_MANAGE + (
    "workorder",
    "workorder:center",
    "wo:read",
    "iot",
    "iot:overview",
    "iot:read",
    "energy",
    "energy:overview",
    "energy:read",
    "video",
    "video:overview",
    "video:read",
    "bim",
    "bim:overview",
    "bim:read",
    "park_tenant:update",
)

LEASING_MANAGE = BUSINESS_READ + (
    "leasing_lead:create",
    "leasing_lead:update",
    "leasing_lead:delete",
    "leasing_lead:assign",
    "leasing_lead:reclaim",
    "leasing_lead:move_to_pool",
    "leasing_lead:change_status",
    "leasing_lead:force_change_status",
    "leasing_lead:convert_to_park_tenant",
    "leasing_lead:confirm_sign",
    "leasing_follow:create",
    "leasing_follow:update",
    "leasing_follow:delete",
    "leasing_visit:create",
    "leasing_visit:update",
    "leasing_visit:delete",
    "leasing_quote:create",
    "leasing_quote:update",
    "leasing_quote:delete",
    "leasing_quote:submit",
    "leasing_quote:approve",
    "leasing_quote:reject",
    "leasing_quote:create_contract",
    "leasing_contract:create",
    "leasing_contract:update",
    "leasing_contract:submit",
    "leasing_contract:recalculate",
    "leasing_contract_unit:create",
    "leasing_contract_unit:update",
    "leasing_contract_unit:delete",
    "park_tenant:create",
    "park_tenant:update",
    "park_tenant_contact:create",
    "park_tenant_contact:update",
    "park_tenant_qualification:create",
    "park_tenant_qualification:update",
    "file:upload",
)

FINANCE_STAFF = BUSINESS_READ + (
    "leasing_receivable:create",
    "leasing_receivable:update",
    "leasing_receivable:generate",
    "leasing_receivable:generate_batch",
    "leasing_receivable:status_log",
    "leasing_payment:create",
    "leasing_payment:update",
    "leasing_payment:apply",
    "leasing_invoice:create",
    "leasing_invoice:update",
    "leasing_refund:create",
    "leasing_checkout:preview_settlement",
    "file:upload",
)

FINANCE_MANAGER = FINANCE_STAFF + (
    "leasing_receivable:delete",
    "leasing_payment:delete",
    "leasing_invoice:delete",
    "leasing_checkout:confirm_settlement",
    "leasing_waiver:create",
    "leasing_waiver:approve",
    "leasing_waiver:reject",
)

LEGAL_MANAGER = BUSINESS_READ + (
    "leasing_contract:update",
    "leasing_contract:approve",
    "leasing_contract:reject",
    "leasing_contract:archive",
    "leasing_contract:void",
    "leasing_contract:effective",
    "leasing_contract_change:approve",
    "leasing_contract_change:reject",
    "leasing_contract_change:effective",
    "leasing_waiver:approve",
    "leasing_waiver:reject",
    "park_tenant:risk_update",
    "park_tenant:risk_log",
    "file:upload",
    "audit:read",
)

EXECUTIVE = BUSINESS_READ + SYSTEM_READ + (
    "leasing_contract:approve",
    "leasing_contract:reject",
    "leasing_contract:effective",
    "leasing_quote:approve",
    "leasing_quote:reject",
    "leasing_contract_change:approve",
    "leasing_contract_change:reject",
    "leasing_contract_change:effective",
    "leasing_checkout:approve",
    "leasing_checkout:reject",
    "leasing_checkout:effective",
    "leasing_waiver:approve",
    "leasing_waiver:reject",
    "audit:export",
)

PRESIDENT = EXECUTIVE + ORG_USER_MANAGE + (
    "tenant:read",
    "module:read",
    "plan:read",
    "tenant_module:read",
    "system:tenant",
    "system:module",
    "system:tenant-module:read",
)

VP = EXECUTIVE + LEASING_MANAGE + PROPERTY_MANAGE

ENGINEERING_STAFF = BUSINESS_READ + (
    "building:read",
    "floor:read",
    "unit:read",
    "floor:upload_layout",
    "file:upload",
    "workorder",
    "workorder:center",
    "wo:read",
    "bim",
    "bim:overview",
    "bim:read",
)

ADMIN_OFFICE = BUSINESS_READ + SYSTEM_READ + (
    "system:attachment:create",
    "system:attachment:delete",
    "file:upload",
)


ORGS = (
    Org("JH_GROUP", "山东金湖集团有限公司", "group", None, 10, "zhao_yongwei"),
    Org("JH_EXEC", "集团管理层", "department", "JH_GROUP", 20, "zhao_yongwei"),
    Org("JH_HR_ADMIN", "人力资源与综合行政管理部", "department", "JH_GROUP", 30, "wu_enguo"),
    Org("JH_FINANCE", "财务管理部", "department", "JH_GROUP", 40, "liu_hantao"),
    Org("JH_LEGAL", "法律合规管理部", "department", "JH_GROUP", 50, "jiang_beiping"),
    Org("JH_ENGINEERING_PROPERTY", "工程建设与物业管理部", "department", "JH_GROUP", 60, "li_rongjie"),
    Org("JH_LEASING_OPERATIONS", "招商与园区运营管理部", "department", "JH_GROUP", 70, "song_qianchang"),
    Org("JH_SUBSIDIARIES", "成员公司及项目负责人", "department", "JH_GROUP", 80, "xu_wanxi"),
    Org("JH_PRESIDENT_OFFICE", "总裁办公室", "department", "JH_GROUP", 90, "wang_xinxin"),
    Org("JH_LY_GK_TECH_PARK", "临沂国控科技产业园开发有限公司", "company", "JH_SUBSIDIARIES", 110, "cheng_xiaojie"),
    Org("JH_NEW_MATERIALS", "山东金湖新材料科技有限公司", "company", "JH_SUBSIDIARIES", 120, "song_yongshan"),
    Org("JH_REAL_ESTATE", "山东金湖置业有限公司", "company", "JH_SUBSIDIARIES", 130, "jiang_beiping"),
    Org("JH_HUIJIN_ZHICHUANG", "汇金智创（山东）产业发展有限公司", "company", "JH_SUBSIDIARIES", 140, "xu_wanxi"),
    Org("JH_SHUAIKE_AUTO", "山东帅科自动化科技有限公司", "company", "JH_SUBSIDIARIES", 150, "wang_lejin"),
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

ROLES = (
    Role("JH_GROUP_PRESIDENT", "集团总裁", uniq(PRESIDENT), 10, "全面负责集团战略、经营管理和重大事项决策"),
    Role("JH_GROUP_VP", "集团副总裁", uniq(VP), 20, "分管重点项目、产业园招商运营、工程建设和综合协调"),
    Role("JH_HR_ADMIN_MANAGER", "人力行政负责人", uniq(ORG_USER_MANAGE + BUSINESS_READ), 30, "统筹人力资源、薪酬绩效、劳动关系、社保与综合行政"),
    Role("JH_HR_ASSISTANT", "人力资源助理", uniq(SYSTEM_READ + BUSINESS_READ), 40, "协助劳动关系、社保、人事事务和生产后勤协调"),
    Role("JH_ADMIN_DEPUTY", "综合行政副主任", uniq(ADMIN_OFFICE + ORG_USER_MANAGE), 50, "档案、证章、会议、行政支持、统计报送和后勤协调"),
    Role("JH_FINANCE_MANAGER", "财务负责人", uniq(FINANCE_MANAGER), 60, "集团及成员公司财务、资金、税务、融资和财务监督"),
    Role("JH_FINANCE_DEPUTY", "财务副经理", uniq(FINANCE_STAFF), 70, "财务核算、资金执行及相关财务管理"),
    Role("JH_LEGAL_COMPLIANCE_MANAGER", "法律合规负责人", uniq(LEGAL_MANAGER), 80, "法律事务、合规管理、合同审查、涉法涉诉和风险防控"),
    Role("JH_ENGINEERING_PROPERTY_MANAGER", "工程物管负责人", uniq(PROPERTY_MANAGE), 90, "工程建设管理和园区物业运营管理体系"),
    Role("JH_ENGINEERING_PROJECT_MANAGER", "工程项目经理", uniq(ENGINEERING_STAFF + ("building:update", "floor:update", "unit:update")), 100, "工程技术、质量、进度、验收及结算管理"),
    Role("JH_INSTALLATION_ENGINEER", "安装工程师", uniq(ENGINEERING_STAFF), 110, "机电安装及相关专业技术管理"),
    Role("JH_LEASING_LEAD", "园区招商负责人", uniq(LEASING_MANAGE), 120, "园区招商策划、实施、客户服务及招商运营管理"),
    Role("JH_PROPERTY_SITE_MANAGER", "园区物业负责人", uniq(PROPERTY_MANAGE), 130, "园区物业现场运营、服务管理及物业团队建设"),
    Role("JH_SUBSIDIARY_MANAGER", "成员公司负责人", uniq(BUSINESS_READ), 140, "成员公司日常经营管理与集团协同"),
    Role("JH_PRESIDENT_OFFICE_DEPUTY", "总裁办副主任", uniq(ADMIN_OFFICE + BUSINESS_READ), 150, "总裁办综合事务与民宿业务运营管理"),
    Role("JH_PRESIDENT_ASSISTANT", "总裁助理", uniq(ADMIN_OFFICE + BUSINESS_READ), 160, "协助总裁日常事务、新业务拓展和综合协调"),
    Role("JH_PRESIDENT_OFFICE_ASSISTANT", "总裁办综合事务助理", uniq(SYSTEM_READ + BUSINESS_READ), 170, "协助总裁、副总裁日常事务协调和执行"),
)

USERS = (
    User("zhao_yongwei", "赵永伟", "JH_EXEC", "GROUP_PRESIDENT", ("JH_GROUP_PRESIDENT",), "全面负责集团发展战略、经营管理及重大事项决策"),
    User("xu_wanxi", "许万玺", "JH_EXEC", "GROUP_VP", ("JH_GROUP_VP", "JH_SUBSIDIARY_MANAGER"), "分管重点项目、产业园招商运营、工程建设及综合协调；兼汇金智创总经理"),
    User("wu_enguo", "吴恩国", "JH_HR_ADMIN", "HR_ADMIN_MANAGER", ("JH_HR_ADMIN_MANAGER",), "人力资源管理中心、综合行政管理中心经理"),
    User("yuan_haitao", "苑海涛", "JH_HR_ADMIN", "HR_ASSISTANT", ("JH_HR_ASSISTANT",), "人力资源助理"),
    User("liu_xia", "刘霞", "JH_HR_ADMIN", "ADMIN_DEPUTY_DIRECTOR", ("JH_ADMIN_DEPUTY",), "综合行政管理中心副主任"),
    User("liu_hantao", "刘汉涛", "JH_FINANCE", "FINANCE_MANAGER", ("JH_FINANCE_MANAGER",), "财务管理中心经理"),
    User("wang_yanxiu", "王艳秀", "JH_FINANCE", "FINANCE_DEPUTY_MANAGER", ("JH_FINANCE_DEPUTY",), "财务管理中心副经理"),
    User("jiang_beiping", "蒋北平", "JH_LEGAL", "LEGAL_COMPLIANCE_MANAGER", ("JH_LEGAL_COMPLIANCE_MANAGER", "JH_SUBSIDIARY_MANAGER"), "法律合规部经理；兼山东金湖置业有限公司副总经理"),
    User("li_rongjie", "李荣杰", "JH_ENGINEERING_PROPERTY", "ENGINEERING_PROPERTY_MANAGER", ("JH_ENGINEERING_PROPERTY_MANAGER",), "工程物管中心经理"),
    User("shao_minghong", "邵明洪", "JH_ENGINEERING_PROPERTY", "ENGINEERING_PROJECT_MANAGER", ("JH_ENGINEERING_PROJECT_MANAGER",), "工程项目经理、总工程师"),
    User("zheng_ziyong", "郑子勇", "JH_ENGINEERING_PROPERTY", "INSTALLATION_ENGINEER", ("JH_INSTALLATION_ENGINEER",), "项目安装工程师"),
    User("song_qianchang", "宋乾昌", "JH_LEASING_OPERATIONS", "LEASING_LEAD", ("JH_LEASING_LEAD",), "园区招商负责人"),
    User("chen_guohui", "陈国辉", "JH_LEASING_OPERATIONS", "PROPERTY_SITE_MANAGER", ("JH_PROPERTY_SITE_MANAGER",), "园区物业管理负责人"),
    User("cheng_xiaojie", "程效杰", "JH_LY_GK_TECH_PARK", "SUBSIDIARY_GENERAL_MANAGER", ("JH_SUBSIDIARY_MANAGER",), "临沂国控科技产业园开发有限公司总经理"),
    User("song_yongshan", "宋永山", "JH_NEW_MATERIALS", "SUBSIDIARY_GENERAL_MANAGER", ("JH_SUBSIDIARY_MANAGER",), "山东金湖新材料科技有限公司总经理"),
    User("wang_lejin", "王乐金", "JH_SHUAIKE_AUTO", "SUBSIDIARY_GENERAL_MANAGER", ("JH_SUBSIDIARY_MANAGER",), "山东帅科自动化科技有限公司总经理"),
    User("wang_xinxin", "王欣欣", "JH_PRESIDENT_OFFICE", "PRESIDENT_OFFICE_DEPUTY", ("JH_PRESIDENT_OFFICE_DEPUTY",), "总裁办副主任、民宿业务负责人"),
    User("li_xiaobin", "李晓斌", "JH_PRESIDENT_OFFICE", "PRESIDENT_ASSISTANT", ("JH_PRESIDENT_ASSISTANT",), "总裁助理"),
    User("zhao_weichen", "赵炜晨", "JH_PRESIDENT_OFFICE", "PRESIDENT_OFFICE_ASSISTANT", ("JH_PRESIDENT_OFFICE_ASSISTANT",), "总裁办综合事务助理"),
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    existing_users = existing_active_usernames()
    credentials = build_credentials(existing_users)
    sql = build_sql(credentials)
    SQL_OUT.write_text(sql, encoding="utf-8")
    write_credentials(credentials)
    write_summary(credentials)

    print(f"roles={len(ROLES)} users={len(USERS)} orgs={len(ORGS)} posts={len(POSTS)}")
    print(f"sql: {SQL_OUT.resolve()}")
    print(f"credentials: {CREDENTIALS_OUT.resolve()}")
    print(f"summary: {SUMMARY_OUT.resolve()}")
    if not args.apply:
        print("dry-run only; pass --apply to import")
        return
    run_psql(sql)
    print("import applied")


def existing_active_usernames() -> set[str]:
    query = "select username from sys_user where tenant_id='10000001' and park_id='20000001' and is_deleted=false;"
    result = subprocess.run(
        ["docker", "exec", "jinhu-smart-park-postgres", "psql", "-U", "jinhu", "-d", "jinhu_smart_park", "-At", "-c", query],
        text=True,
        check=True,
        capture_output=True,
    )
    return {line.strip() for line in result.stdout.splitlines() if line.strip()}


def build_credentials(existing_users: set[str]) -> dict[str, tuple[str, str, bool]]:
    credentials: dict[str, tuple[str, str, bool]] = {}
    for user in USERS:
        rotate_password = user.username not in existing_users
        password = make_password() if rotate_password else ""
        password_hash = bcrypt_hash(password) if rotate_password else ""
        credentials[user.username] = (password, password_hash, rotate_password)
    return credentials


def make_password() -> str:
    alphabet = string.ascii_letters + string.digits
    token = "".join(secrets.choice(alphabet) for _ in range(14))
    return f"Jh@{token}"


def bcrypt_hash(password: str) -> str:
    script = "const bcrypt=require('bcrypt'); bcrypt.hash(process.env.PASSWORD, 10).then((h)=>console.log(h));"
    result = subprocess.run(
        ["pnpm", "--filter", "@jinhu/api", "exec", "node", "-e", script],
        env={**dict(__import__("os").environ), "PASSWORD": password},
        text=True,
        check=True,
        capture_output=True,
    )
    return result.stdout.strip()


def build_sql(credentials: dict[str, tuple[str, str, bool]]) -> str:
    desired_usernames = [user.username for user in USERS] + ["admin"]
    desired_role_codes = [role.code for role in ROLES] + ["SUPER_ADMIN"]
    desired_org_codes = [org.code for org in ORGS]
    desired_post_codes = [post.code for post in POSTS]
    role_permissions = [(role.code, permission) for role in ROLES for permission in role.permissions]
    user_roles = [(user.username, role_code) for user in USERS for role_code in user.role_codes]
    user_orgs = [(user.username, user.primary_org, user.post_code) for user in USERS]

    return "\n".join(
        [
            "BEGIN;",
            soft_delete_unrelated("rel_user_org", None, None),
            soft_delete_unrelated_links(),
            upsert_orgs(),
            upsert_posts(),
            upsert_roles(),
            upsert_users(credentials),
            set_org_leaders(),
            upsert_user_orgs(user_orgs),
            upsert_user_roles(user_roles),
            upsert_role_permissions(role_permissions),
            cleanup_role_permissions(role_permissions),
            cleanup_user_roles(user_roles),
            cleanup_user_orgs(user_orgs),
            cleanup_unrelated_users(desired_usernames),
            cleanup_unrelated_roles(desired_role_codes),
            cleanup_unrelated_orgs(desired_org_codes),
            cleanup_unrelated_posts(desired_post_codes),
            "COMMIT;",
        ]
    )


def upsert_orgs() -> str:
    values = ",\n".join(
        f"({q(org.code)}, {q(org.name)}, {q(org.org_type)}, {q(org.parent_code) if org.parent_code else 'NULL'}, {org.sort})"
        for org in ORGS
    )
    return f"""
WITH src(org_code, org_name, org_type, parent_code, sort_order) AS (
  VALUES
{values}
),
resolved AS (
  SELECT src.*, parent.id AS parent_id
  FROM src
  LEFT JOIN sys_org parent
    ON parent.tenant_id = {q(TENANT_ID)}
   AND parent.park_id = {q(PARK_ID)}
   AND parent.org_code = src.parent_code
   AND parent.is_deleted = false
)
INSERT INTO sys_org (tenant_id, park_id, parent_id, org_code, org_name, org_type, sort_order, status, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, parent_id, org_code, org_name, org_type, sort_order, 'enabled', {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, {q(source_remark())}
FROM resolved
ON CONFLICT (tenant_id, park_id, org_code) WHERE is_deleted = false
DO UPDATE SET parent_id = EXCLUDED.parent_id,
              org_name = EXCLUDED.org_name,
              org_type = EXCLUDED.org_type,
              sort_order = EXCLUDED.sort_order,
              status = 'enabled',
              update_by = EXCLUDED.update_by,
              update_time = now(),
              remark = EXCLUDED.remark;
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


def upsert_roles() -> str:
    values = ",\n".join(f"({q(role.code)}, {q(role.name)}, {role.sort}, {q(role.remark)}, {q(role.data_scope)})" for role in ROLES)
    return f"""
WITH src(code, name, sort_no, role_remark, data_scope) AS (
  VALUES
{values}
)
INSERT INTO sys_role (
  tenant_id, park_id, code, name, sort_no, role_type, role_scope, data_scope, data_scope_config,
  is_template, is_system, is_builtin, is_super, editable, is_editable, is_deletable,
  is_enabled, status, create_by, update_by, remark
)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, code, name, sort_no, 'production', 'tenant', data_scope, '{{}}'::jsonb,
       false, false, false, false, true, true, true,
       true, 'enabled', {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, role_remark || '；' || {q(source_remark())}
FROM src
ON CONFLICT (tenant_id, code) WHERE is_deleted = false
DO UPDATE SET park_id = EXCLUDED.park_id,
              name = EXCLUDED.name,
              sort_no = EXCLUDED.sort_no,
              role_type = EXCLUDED.role_type,
              role_scope = EXCLUDED.role_scope,
              data_scope = EXCLUDED.data_scope,
              is_enabled = true,
              status = 'enabled',
              update_by = EXCLUDED.update_by,
              update_time = now(),
              remark = EXCLUDED.remark;
"""


def upsert_users(credentials: dict[str, tuple[str, str, bool]]) -> str:
    values = ",\n".join(
        "("
        f"{q(user.username)}, {q(user.name)}, {q(credentials[user.username][1])}, {str(credentials[user.username][2]).lower()}, "
        f"{q(user.duty)}"
        ")"
        for user in USERS
    )
    return f"""
WITH src(username, display_name, password_hash, rotate_password, duty) AS (
  VALUES
{values}
)
INSERT INTO sys_user (
  tenant_id, park_id, username, display_name, password_hash, is_enabled, status,
  create_by, update_by, remark
)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, username, display_name, password_hash, true, 'enabled',
       {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, duty || '；' || {q(source_remark())}
FROM src
ON CONFLICT (tenant_id, park_id, username) WHERE is_deleted = false
DO UPDATE SET display_name = EXCLUDED.display_name,
              password_hash = CASE WHEN EXCLUDED.password_hash <> '' THEN EXCLUDED.password_hash ELSE sys_user.password_hash END,
              is_enabled = true,
              status = 'enabled',
              update_by = EXCLUDED.update_by,
              update_time = now(),
              remark = EXCLUDED.remark;
"""


def set_org_leaders() -> str:
    values = ",\n".join(
        f"({q(org.code)}, {q(org.leader_username)})"
        for org in ORGS
        if org.leader_username
    )
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


def upsert_user_orgs(rows: list[tuple[str, str, str]]) -> str:
    values = ",\n".join(f"({q(username)}, {q(org_code)}, {q(post_code)})" for username, org_code, post_code in rows)
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


def upsert_user_roles(rows: list[tuple[str, str]]) -> str:
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


def upsert_role_permissions(rows: list[tuple[str, str]]) -> str:
    values = ",\n".join(f"({q(role_code)}, {q(permission_code)})" for role_code, permission_code in rows)
    return f"""
WITH src(role_code, permission_code) AS (
  VALUES
{values}
),
resolved AS (
  SELECT role.id AS role_id, permission.id AS permission_id
  FROM src
  JOIN sys_role role ON role.tenant_id = {q(TENANT_ID)} AND role.park_id = {q(PARK_ID)} AND role.code = src.role_code AND role.is_deleted = false
  JOIN sys_permission permission ON permission.tenant_id = {q(TENANT_ID)} AND permission.park_id = {q(PARK_ID)} AND permission.code = src.permission_code AND permission.is_deleted = false
),
reactivated AS (
  UPDATE rel_role_perm link
     SET is_deleted = false,
         update_by = {q(SYSTEM_USER_ID)},
         update_time = now(),
         remark = {q(source_remark())}
    FROM resolved
   WHERE link.tenant_id = {q(TENANT_ID)}
     AND link.park_id = {q(PARK_ID)}
     AND link.role_id = resolved.role_id
     AND link.permission_id = resolved.permission_id
   RETURNING link.id
)
INSERT INTO rel_role_perm (tenant_id, park_id, role_id, permission_id, create_by, update_by, remark)
SELECT {q(TENANT_ID)}, {q(PARK_ID)}, role_id, permission_id, {q(SYSTEM_USER_ID)}, {q(SYSTEM_USER_ID)}, {q(source_remark())}
FROM resolved
WHERE NOT EXISTS (
  SELECT 1 FROM rel_role_perm link
  WHERE link.tenant_id = {q(TENANT_ID)} AND link.park_id = {q(PARK_ID)}
    AND link.role_id = resolved.role_id AND link.permission_id = resolved.permission_id AND link.is_deleted = false
);
"""


def cleanup_role_permissions(rows: list[tuple[str, str]]) -> str:
    values = ",\n".join(f"({q(role_code)}, {q(permission_code)})" for role_code, permission_code in rows)
    return f"""
WITH desired(role_code, permission_code) AS (
  VALUES
{values}
),
desired_ids AS (
  SELECT role.id AS role_id, permission.id AS permission_id
  FROM desired
  JOIN sys_role role ON role.tenant_id = {q(TENANT_ID)} AND role.park_id = {q(PARK_ID)} AND role.code = desired.role_code AND role.is_deleted = false
  JOIN sys_permission permission ON permission.tenant_id = {q(TENANT_ID)} AND permission.park_id = {q(PARK_ID)} AND permission.code = desired.permission_code AND permission.is_deleted = false
),
managed_roles AS (
  SELECT id FROM sys_role
  WHERE tenant_id = {q(TENANT_ID)} AND park_id = {q(PARK_ID)} AND code IN ({csvq([role.code for role in ROLES])})
)
UPDATE rel_role_perm link
   SET is_deleted = true,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
 WHERE link.tenant_id = {q(TENANT_ID)}
   AND link.park_id = {q(PARK_ID)}
   AND link.is_deleted = false
   AND link.role_id IN (SELECT id FROM managed_roles)
   AND NOT EXISTS (
     SELECT 1 FROM desired_ids desired
     WHERE desired.role_id = link.role_id AND desired.permission_id = link.permission_id
   );
"""


def cleanup_user_roles(rows: list[tuple[str, str]]) -> str:
    values = ",\n".join(f"({q(username)}, {q(role_code)})" for username, role_code in rows)
    return f"""
WITH desired(username, role_code) AS (
  VALUES
{values}
),
desired_ids AS (
  SELECT users.id AS user_id, role.id AS role_id
  FROM desired
  JOIN sys_user users ON users.tenant_id = {q(TENANT_ID)} AND users.park_id = {q(PARK_ID)} AND users.username = desired.username AND users.is_deleted = false
  JOIN sys_role role ON role.tenant_id = {q(TENANT_ID)} AND role.park_id = {q(PARK_ID)} AND role.code = desired.role_code AND role.is_deleted = false
),
managed_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = {q(TENANT_ID)} AND park_id = {q(PARK_ID)} AND username IN ({csvq([user.username for user in USERS])})
)
UPDATE rel_user_role link
   SET is_deleted = true,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
 WHERE link.tenant_id = {q(TENANT_ID)}
   AND link.park_id = {q(PARK_ID)}
   AND link.is_deleted = false
   AND link.user_id IN (SELECT id FROM managed_users)
   AND NOT EXISTS (
     SELECT 1 FROM desired_ids desired
     WHERE desired.user_id = link.user_id AND desired.role_id = link.role_id
   );
"""


def cleanup_user_orgs(rows: list[tuple[str, str, str]]) -> str:
    values = ",\n".join(f"({q(username)}, {q(org_code)}, {q(post_code)})" for username, org_code, post_code in rows)
    return f"""
WITH desired(username, org_code, post_code) AS (
  VALUES
{values}
),
desired_ids AS (
  SELECT users.id AS user_id, org.id AS org_id, post.id AS post_id
  FROM desired
  JOIN sys_user users ON users.tenant_id = {q(TENANT_ID)} AND users.park_id = {q(PARK_ID)} AND users.username = desired.username AND users.is_deleted = false
  JOIN sys_org org ON org.tenant_id = {q(TENANT_ID)} AND org.park_id = {q(PARK_ID)} AND org.org_code = desired.org_code AND org.is_deleted = false
  JOIN sys_post post ON post.tenant_id = {q(TENANT_ID)} AND post.park_id = {q(PARK_ID)} AND post.post_code = desired.post_code AND post.is_deleted = false
),
managed_users AS (
  SELECT id FROM sys_user
  WHERE tenant_id = {q(TENANT_ID)} AND park_id = {q(PARK_ID)} AND username IN ({csvq([user.username for user in USERS])})
)
UPDATE rel_user_org link
   SET is_deleted = true,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
 WHERE link.tenant_id = {q(TENANT_ID)}
   AND link.park_id = {q(PARK_ID)}
   AND link.is_deleted = false
   AND link.user_id IN (SELECT id FROM managed_users)
   AND NOT EXISTS (
     SELECT 1 FROM desired_ids desired
     WHERE desired.user_id = link.user_id AND desired.org_id = link.org_id AND desired.post_id = link.post_id
   );
"""


def cleanup_unrelated_users(usernames: list[str]) -> str:
    return f"""
UPDATE sys_user
   SET is_deleted = true,
       status = 'disabled',
       is_enabled = false,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now(),
       remark = coalesce(remark, '') || '；RBAC生产导入清理'
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false
   AND username NOT IN ({csvq(usernames)});
"""


def cleanup_unrelated_roles(role_codes: list[str]) -> str:
    return f"""
UPDATE sys_role
   SET is_deleted = true,
       status = 'disabled',
       is_enabled = false,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now(),
       remark = coalesce(remark, '') || '；RBAC生产导入清理'
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false
   AND code NOT IN ({csvq(role_codes)});
"""


def cleanup_unrelated_orgs(org_codes: list[str]) -> str:
    return f"""
UPDATE sys_org
   SET is_deleted = true,
       status = 'disabled',
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now(),
       remark = coalesce(remark, '') || '；RBAC生产导入清理'
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false
   AND org_code NOT IN ({csvq(org_codes)});
"""


def cleanup_unrelated_posts(post_codes: list[str]) -> str:
    return f"""
UPDATE sys_post
   SET is_deleted = true,
       status = 'disabled',
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now(),
       remark = coalesce(remark, '') || '；RBAC生产导入清理'
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false
   AND post_code NOT IN ({csvq(post_codes)});
"""


def soft_delete_unrelated(table: str, _column: str | None, _values: list[str] | None) -> str:
    return f"""
UPDATE {table}
   SET is_deleted = true,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false;
"""


def soft_delete_unrelated_links() -> str:
    return f"""
UPDATE rel_user_role
   SET is_deleted = true,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false
   AND (
     user_id IN (SELECT id FROM sys_user WHERE tenant_id = {q(TENANT_ID)} AND park_id = {q(PARK_ID)} AND username <> 'admin')
     OR role_id IN (SELECT id FROM sys_role WHERE tenant_id = {q(TENANT_ID)} AND park_id = {q(PARK_ID)} AND code <> 'SUPER_ADMIN')
   );

UPDATE rel_role_perm
   SET is_deleted = true,
       update_by = {q(SYSTEM_USER_ID)},
       update_time = now()
 WHERE tenant_id = {q(TENANT_ID)}
   AND park_id = {q(PARK_ID)}
   AND is_deleted = false
   AND role_id IN (SELECT id FROM sys_role WHERE tenant_id = {q(TENANT_ID)} AND park_id = {q(PARK_ID)} AND code <> 'SUPER_ADMIN');
"""


def write_credentials(credentials: dict[str, tuple[str, str, bool]]) -> None:
    with CREDENTIALS_OUT.open("w", encoding="utf-8-sig", newline="") as file:
        writer = csv.writer(file)
        writer.writerow(["username", "display_name", "initial_password", "password_created_now", "roles", "post", "department", "duty"])
        org_map = {org.code: org.name for org in ORGS}
        post_map = {post.code: post.name for post in POSTS}
        for user in USERS:
            password, _password_hash, rotate_password = credentials[user.username]
            writer.writerow([
                user.username,
                user.name,
                password if rotate_password else "保留原密码",
                "yes" if rotate_password else "no",
                ";".join(user.role_codes),
                post_map[user.post_code],
                org_map[user.primary_org],
                user.duty,
            ])


def write_summary(credentials: dict[str, tuple[str, str, bool]]) -> None:
    summary = {
        "source_doc": SOURCE_DOC,
        "tenant_id": TENANT_ID,
        "park_id": PARK_ID,
        "org_count": len(ORGS),
        "post_count": len(POSTS),
        "role_count": len(ROLES),
        "user_count": len(USERS),
        "new_password_count": sum(1 for _user, data in credentials.items() if data[2]),
        "users": [
            {
                "username": user.username,
                "display_name": user.name,
                "org": user.primary_org,
                "post": user.post_code,
                "roles": list(user.role_codes),
            }
            for user in USERS
        ],
        "roles": [
            {
                "code": role.code,
                "name": role.name,
                "permission_count": len(role.permissions),
            }
            for role in ROLES
        ],
    }
    SUMMARY_OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def run_psql(sql: str) -> None:
    subprocess.run(
        ["docker", "exec", "-i", "jinhu-smart-park-postgres", "psql", "-U", "jinhu", "-d", "jinhu_smart_park", "-v", "ON_ERROR_STOP=1"],
        input=sql,
        text=True,
        check=True,
    )


def source_remark() -> str:
    return "依据《金湖集团部门及人员职责分工（2026）》生产导入"


def q(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def csvq(values: Iterable[str]) -> str:
    return ", ".join(q(value) for value in values)


if __name__ == "__main__":
    main()
