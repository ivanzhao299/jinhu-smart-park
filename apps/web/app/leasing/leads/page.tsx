"use client";

import { Edit3, Eye, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";

const LEASING_MODULE = "leasing";
const LEASING_LEAD_ENTITY = "leasing_lead";
const FOLLOW_FILE_BIZ_TYPE = "leasing_follow";
const VISIT_FILE_BIZ_TYPE = "leasing_visit";
const FIELD_CONTACT_MOBILE = "contactMobile";
const FIELD_DEMAND_PRICE = "demandPrice";
const LEAD_PERMISSIONS = {
  read: "leasing_lead:read",
  create: "leasing_lead:create",
  update: "leasing_lead:update",
  delete: "leasing_lead:delete"
} as const;
const FOLLOW_PERMISSIONS = {
  read: "leasing_follow:read",
  create: "leasing_follow:create",
  update: "leasing_follow:update",
  delete: "leasing_follow:delete"
} as const;
const VISIT_PERMISSIONS = {
  read: "leasing_visit:read",
  create: "leasing_visit:create",
  update: "leasing_visit:update",
  delete: "leasing_visit:delete"
} as const;
const FILE_PERMISSIONS = {
  upload: "file:upload"
} as const;

interface LeasingLeadRow {
  id: string;
  code: string | null;
  leadCode: string;
  customerName: string;
  contactName: string;
  contactMobile?: string | null;
  contactEmail: string | null;
  source: string | null;
  channelName: string | null;
  industryCode: string | null;
  industryDetail: string | null;
  demandArea: string | null;
  demandPrice?: string | null;
  demandUnitType: string | null;
  intentionLevel: string | null;
  followUserId: string | null;
  followUserName: string | null;
  parkTenantId: string | null;
  status: string;
  lostReason: string | null;
  lostRemark: string | null;
  lastFollowTime: string | null;
  nextFollowTime: string | null;
  expectedCloseDate: string | null;
  isInPool: boolean;
  poolEnterTime: string | null;
  remark: string | null;
  createTime: string;
  updateTime: string;
}

interface DictTypeRow {
  id: string;
  dictCode: string;
}

interface DictItemRow {
  id: string;
  itemLabel: string;
  itemValue: string;
  status: string;
  tagType?: string | null;
}

interface LeadFormState {
  leadCode: string;
  customerName: string;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
  source: string;
  channelName: string;
  industryCode: string;
  industryDetail: string;
  demandArea: string;
  demandPrice: string;
  demandUnitType: string;
  intentionLevel: string;
  followUserId: string;
  followUserName: string;
  status: string;
  lastFollowTime: string;
  nextFollowTime: string;
  expectedCloseDate: string;
  isInPool: string;
  remark: string;
}

interface LeasingFollowRow {
  id: string;
  leadId: string;
  followTime: string;
  followUserId: string | null;
  followUserName: string | null;
  followType: string | null;
  content: string;
  nextAction: string | null;
  nextFollowTime: string | null;
  attachmentFileIds: string[];
  remark: string | null;
  createTime: string;
  updateTime: string;
}

interface LeasingVisitRow {
  id: string;
  leadId: string;
  visitTime: string;
  visitorCount: number;
  receptionUserId: string | null;
  receptionUserName: string | null;
  unitIds: string[];
  visitResult: string | null;
  photoFileIds: string[];
  remark: string | null;
  createTime: string;
  updateTime: string;
}

interface UnitOptionRow {
  id: string;
  code: string | null;
  unitCode: string;
  unitName: string;
  unitArea: string;
  rentalStatus: number;
  buildingId: string;
  floorId: string;
  building?: {
    id: string;
    buildingCode: string;
    buildingName: string;
  };
  floor?: {
    id: string;
    floorCode: string;
    floorName: string;
  };
}

interface FollowFormState {
  followTime: string;
  followType: string;
  content: string;
  nextAction: string;
  nextFollowTime: string;
  attachmentFileIds: string[];
  remark: string;
}

interface VisitFormState {
  visitTime: string;
  visitorCount: string;
  receptionUserId: string;
  receptionUserName: string;
  unitIds: string[];
  visitResult: string;
  photoFileIds: string[];
  advanceStatus: string;
  remark: string;
}

const emptyPage: PaginatedResult<LeasingLeadRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: LeadFormState = {
  leadCode: "",
  customerName: "",
  contactName: "",
  contactMobile: "",
  contactEmail: "",
  source: "",
  channelName: "",
  industryCode: "",
  industryDetail: "",
  demandArea: "",
  demandPrice: "",
  demandUnitType: "",
  intentionLevel: "",
  followUserId: "",
  followUserName: "",
  status: "",
  lastFollowTime: "",
  nextFollowTime: "",
  expectedCloseDate: "",
  isInPool: "false",
  remark: ""
};

const emptyFollowForm: FollowFormState = {
  followTime: "",
  followType: "",
  content: "",
  nextAction: "",
  nextFollowTime: "",
  attachmentFileIds: [],
  remark: ""
};

const emptyVisitForm: VisitFormState = {
  visitTime: "",
  visitorCount: "1",
  receptionUserId: "",
  receptionUserName: "",
  unitIds: [],
  visitResult: "",
  photoFileIds: [],
  advanceStatus: "true",
  remark: ""
};

export default function LeasingLeadsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<LeasingLeadRow>>(emptyPage);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [filters, setFilters] = useState({
    keyword: "",
    status: "",
    source: "",
    intentionLevel: "",
    followUserId: "",
    isInPool: "",
    startDate: "",
    endDate: ""
  });
  const [form, setForm] = useState<LeadFormState>(emptyForm);
  const [editing, setEditing] = useState<LeasingLeadRow | null>(null);
  const [detail, setDetail] = useState<LeasingLeadRow | null>(null);
  const [detailTab, setDetailTab] = useState<"profile" | "follows" | "visits">("profile");
  const [follows, setFollows] = useState<LeasingFollowRow[]>([]);
  const [followForm, setFollowForm] = useState<FollowFormState>(emptyFollowForm);
  const [editingFollow, setEditingFollow] = useState<LeasingFollowRow | null>(null);
  const [showFollowForm, setShowFollowForm] = useState(false);
  const [followFileNames, setFollowFileNames] = useState<Record<string, string>>({});
  const [uploadingFollowFile, setUploadingFollowFile] = useState(false);
  const [visits, setVisits] = useState<LeasingVisitRow[]>([]);
  const [visitForm, setVisitForm] = useState<VisitFormState>(emptyVisitForm);
  const [editingVisit, setEditingVisit] = useState<LeasingVisitRow | null>(null);
  const [showVisitForm, setShowVisitForm] = useState(false);
  const [visitFileNames, setVisitFileNames] = useState<Record<string, string>>({});
  const [uploadingVisitPhoto, setUploadingVisitPhoto] = useState(false);
  const [visitUnitOptions, setVisitUnitOptions] = useState<UnitOptionRow[]>([]);
  const [visitBuildingOptions, setVisitBuildingOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [visitUnitFilters, setVisitUnitFilters] = useState({ buildingId: "", rentalStatus: "", keyword: "" });
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const canViewContactMobile = canViewField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE);
  const canEditContactMobile = canEditField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE);
  const canViewDemandPrice = canViewField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE);
  const canEditDemandPrice = canEditField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE);

  const statusItems = dicts.leasing_lead_status ?? [];
  const sourceItems = dicts.leasing_lead_source ?? [];
  const intentionItems = dicts.leasing_intention_level ?? [];
  const followTypeItems = dicts.leasing_follow_type ?? [];
  const industryItems = dicts.industry_code ?? [];
  const unitTypeItems = dicts.unit_usage_type ?? [];
  const rentalStatusItems = dicts.unit_rental_status ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.source) params.set("source", filters.source);
    if (filters.intentionLevel) params.set("intention_level", filters.intentionLevel);
    if (filters.followUserId.trim()) params.set("follow_user_id", filters.followUserId.trim());
    if (filters.isInPool) params.set("is_in_pool", filters.isInPool);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const response = await apiRequest<PaginatedResult<LeasingLeadRow>>(`/leasing/leads?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "leasing_lead_status",
      "leasing_lead_source",
      "leasing_intention_level",
      "leasing_follow_type",
      "industry_code",
      "unit_usage_type",
      "unit_rental_status"
    ];
    const entries = await Promise.all(
      codes.map(async (code) => {
        const dictTypeId = dictTypeMap.get(code);
        if (!dictTypeId) return [code, []] as const;
        const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
          token: getAccessToken()
        });
        return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
      })
    );
    setDicts(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
  }, [loadDicts]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      source: sourceItems[0]?.itemValue ?? "",
      status: statusItems[0]?.itemValue ?? "",
      intentionLevel: intentionItems[0]?.itemValue ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: LeasingLeadRow) {
    setEditing(row);
    setForm({
      leadCode: row.leadCode,
      customerName: row.customerName,
      contactName: row.contactName,
      contactMobile: typeof row.contactMobile === "string" ? row.contactMobile : "",
      contactEmail: row.contactEmail ?? "",
      source: row.source ?? "",
      channelName: row.channelName ?? "",
      industryCode: row.industryCode ?? "",
      industryDetail: row.industryDetail ?? "",
      demandArea: row.demandArea ?? "",
      demandPrice: typeof row.demandPrice === "string" ? row.demandPrice : "",
      demandUnitType: row.demandUnitType ?? "",
      intentionLevel: row.intentionLevel ?? "",
      followUserId: row.followUserId ?? "",
      followUserName: row.followUserName ?? "",
      status: row.status,
      lastFollowTime: toLocalInputValue(row.lastFollowTime),
      nextFollowTime: toLocalInputValue(row.nextFollowTime),
      expectedCloseDate: row.expectedCloseDate ?? "",
      isInPool: String(row.isInPool),
      remark: row.remark ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  async function openDetail(row: LeasingLeadRow) {
    setDetail(row);
    setDetailTab("profile");
    setFollows([]);
    setVisits([]);
    setShowFollowForm(false);
    setShowVisitForm(false);
    setEditingFollow(null);
    setEditingVisit(null);
    setFollowForm(emptyFollowForm);
    setVisitForm(emptyVisitForm);
    setMessage("");
    try {
      const response = await apiRequest<LeasingLeadRow>(`/leasing/leads/${row.id}`, { token: getAccessToken() });
      setDetail(response.data);
      await Promise.all([loadFollows(row.id), loadVisits(row.id), loadVisitUnits()]);
    } catch (error) {
      setMessage((error as Error).message);
    }
  }

  async function refreshDetail(leadId: string) {
    const response = await apiRequest<LeasingLeadRow>(`/leasing/leads/${leadId}`, { token: getAccessToken() });
    setDetail(response.data);
  }

  const loadFollows = useCallback(async (leadId: string) => {
    const response = await apiRequest<LeasingFollowRow[]>(`/leasing/leads/${leadId}/follows`, {
      token: getAccessToken()
    });
    setFollows(response.data);
  }, []);

  const loadVisits = useCallback(async (leadId: string) => {
    const response = await apiRequest<LeasingVisitRow[]>(`/leasing/leads/${leadId}/visits`, {
      token: getAccessToken()
    });
    setVisits(response.data);
  }, []);

  const loadVisitUnits = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "100" });
    if (visitUnitFilters.buildingId) params.set("building_id", visitUnitFilters.buildingId);
    if (visitUnitFilters.rentalStatus) params.set("rental_status", visitUnitFilters.rentalStatus);
    if (visitUnitFilters.keyword.trim()) params.set("keyword", visitUnitFilters.keyword.trim());
    const response = await apiRequest<PaginatedResult<UnitOptionRow>>(`/park-units?${params.toString()}`, {
      token: getAccessToken()
    });
    setVisitUnitOptions(response.data.items);
    setVisitBuildingOptions((current) => mergeBuildingOptions(current, response.data.items));
  }, [visitUnitFilters]);

  function openFollowCreate() {
    setEditingFollow(null);
    setFollowForm({
      ...emptyFollowForm,
      followTime: toLocalInputValue(new Date().toISOString()),
      followType: followTypeItems[0]?.itemValue ?? ""
    });
    setShowFollowForm(true);
    setMessage("");
  }

  function openFollowEdit(row: LeasingFollowRow) {
    setEditingFollow(row);
    setFollowForm({
      followTime: toLocalInputValue(row.followTime),
      followType: row.followType ?? "",
      content: row.content,
      nextAction: row.nextAction ?? "",
      nextFollowTime: toLocalInputValue(row.nextFollowTime),
      attachmentFileIds: row.attachmentFileIds ?? [],
      remark: row.remark ?? ""
    });
    setShowFollowForm(true);
    setMessage("");
  }

  function openVisitCreate() {
    setEditingVisit(null);
    setVisitForm({
      ...emptyVisitForm,
      visitTime: toLocalInputValue(new Date().toISOString())
    });
    setShowVisitForm(true);
    void loadVisitUnits().catch((error: Error) => setMessage(error.message));
    setMessage("");
  }

  function openVisitEdit(row: LeasingVisitRow) {
    setEditingVisit(row);
    setVisitForm({
      visitTime: toLocalInputValue(row.visitTime),
      visitorCount: String(row.visitorCount ?? 1),
      receptionUserId: row.receptionUserId ?? "",
      receptionUserName: row.receptionUserName ?? "",
      unitIds: row.unitIds ?? [],
      visitResult: row.visitResult ?? "",
      photoFileIds: row.photoFileIds ?? [],
      advanceStatus: "false",
      remark: row.remark ?? ""
    });
    setShowVisitForm(true);
    void loadVisitUnits().catch((error: Error) => setMessage(error.message));
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      leadCode: emptyToUndefined(form.leadCode),
      customerName: form.customerName.trim(),
      contactName: form.contactName.trim(),
      contactEmail: emptyToUndefined(form.contactEmail),
      source: emptyToUndefined(form.source),
      channelName: emptyToUndefined(form.channelName),
      industryCode: emptyToUndefined(form.industryCode),
      industryDetail: emptyToUndefined(form.industryDetail),
      demandArea: numberOrUndefined(form.demandArea),
      demandUnitType: emptyToUndefined(form.demandUnitType),
      intentionLevel: emptyToUndefined(form.intentionLevel),
      followUserId: emptyToUndefined(form.followUserId),
      followUserName: emptyToUndefined(form.followUserName),
      status: emptyToUndefined(form.status),
      lastFollowTime: dateTimeOrUndefined(form.lastFollowTime),
      nextFollowTime: dateTimeOrUndefined(form.nextFollowTime),
      expectedCloseDate: emptyToUndefined(form.expectedCloseDate),
      isInPool: form.isInPool === "true",
      remark: emptyToUndefined(form.remark)
    };
    if (canEditContactMobile) body.contactMobile = form.contactMobile.trim();
    if (canEditDemandPrice) body.demandPrice = numberOrUndefined(form.demandPrice);

    await apiRequest<LeasingLeadRow>(editing ? `/leasing/leads/${editing.id}` : "/leasing/leads", {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "leasing-lead-update" : "leasing-lead-create"),
      body
    });
    setShowForm(false);
    setEditing(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: LeasingLeadRow) {
    if (!window.confirm(`确认删除线索「${row.customerName}」？`)) return;
    await apiRequest<{ id: string }>(`/leasing/leads/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-lead-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  async function uploadFollowFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setUploadingFollowFile(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("biz_type", FOLLOW_FILE_BIZ_TYPE);
      formData.set("biz_id", detail.id);
      const response = await apiFormRequest<FileRecord>("/files", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("leasing-follow-file-upload"),
        body: formData
      });
      setFollowForm((current) => ({
        ...current,
        attachmentFileIds: [...new Set([...current.attachmentFileIds, response.data.id])]
      }));
      setFollowFileNames((current) => ({ ...current, [response.data.id]: response.data.originalName }));
      event.currentTarget.reset();
      setMessage("附件上传成功，请保存跟进记录");
    } finally {
      setUploadingFollowFile(false);
    }
  }

  async function submitFollow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    await apiRequest<LeasingFollowRow>(
      editingFollow ? `/leasing/leads/${detail.id}/follows/${editingFollow.id}` : `/leasing/leads/${detail.id}/follows`,
      {
        method: editingFollow ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingFollow ? "leasing-follow-update" : "leasing-follow-create"),
        body: {
          followTime: dateTimeOrUndefined(followForm.followTime),
          followType: emptyToUndefined(followForm.followType),
          content: followForm.content.trim(),
          nextAction: emptyToUndefined(followForm.nextAction),
          nextFollowTime: dateTimeOrUndefined(followForm.nextFollowTime),
          attachmentFileIds: followForm.attachmentFileIds,
          remark: emptyToUndefined(followForm.remark)
        }
      }
    );
    setShowFollowForm(false);
    setEditingFollow(null);
    setFollowForm(emptyFollowForm);
    setMessage("跟进记录保存成功");
    await Promise.all([loadFollows(detail.id), refreshDetail(detail.id), load(pageData.page)]);
  }

  async function removeFollow(row: LeasingFollowRow) {
    if (!detail || !window.confirm("确认删除这条跟进记录？")) return;
    await apiRequest<{ id: string }>(`/leasing/leads/${detail.id}/follows/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-follow-delete")
    });
    setMessage("跟进记录删除成功");
    await Promise.all([loadFollows(detail.id), refreshDetail(detail.id), load(pageData.page)]);
  }

  async function uploadVisitPhoto(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setUploadingVisitPhoto(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("biz_type", VISIT_FILE_BIZ_TYPE);
      formData.set("biz_id", detail.id);
      const response = await apiFormRequest<FileRecord>("/files", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("leasing-visit-photo-upload"),
        body: formData
      });
      setVisitForm((current) => ({
        ...current,
        photoFileIds: [...new Set([...current.photoFileIds, response.data.id])]
      }));
      setVisitFileNames((current) => ({ ...current, [response.data.id]: response.data.originalName }));
      event.currentTarget.reset();
      setMessage("看房照片上传成功，请保存看房记录");
    } finally {
      setUploadingVisitPhoto(false);
    }
  }

  async function submitVisit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    await apiRequest<LeasingVisitRow>(
      editingVisit ? `/leasing/leads/${detail.id}/visits/${editingVisit.id}` : `/leasing/leads/${detail.id}/visits`,
      {
        method: editingVisit ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingVisit ? "leasing-visit-update" : "leasing-visit-create"),
        body: {
          visitTime: dateTimeOrUndefined(visitForm.visitTime),
          visitorCount: numberOrUndefined(visitForm.visitorCount) ?? 1,
          receptionUserId: emptyToUndefined(visitForm.receptionUserId),
          receptionUserName: emptyToUndefined(visitForm.receptionUserName),
          unitIds: visitForm.unitIds,
          visitResult: emptyToUndefined(visitForm.visitResult),
          photoFileIds: visitForm.photoFileIds,
          advanceStatus: visitForm.advanceStatus === "true",
          remark: emptyToUndefined(visitForm.remark)
        }
      }
    );
    setShowVisitForm(false);
    setEditingVisit(null);
    setVisitForm(emptyVisitForm);
    setMessage("看房记录保存成功");
    await Promise.all([loadVisits(detail.id), refreshDetail(detail.id), load(pageData.page)]);
  }

  async function removeVisit(row: LeasingVisitRow) {
    if (!detail || !window.confirm("确认删除这条看房记录？")) return;
    await apiRequest<{ id: string }>(`/leasing/leads/${detail.id}/visits/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-visit-delete")
    });
    setMessage("看房记录删除成功");
    await loadVisits(detail.id);
  }

  return (
    <PermissionGuard module={LEASING_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={LEAD_PERMISSIONS.read} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
        <main className="page-container">
          <section className="page-header">
            <div className="header-title">
              <strong>招商线索</strong>
              <span>管理尚未签约或尚未转为园区租户企业的潜在客户</span>
            </div>
            <div className="page-actions">
              <button className="primary-button" type="button" onClick={() => void load(pageData.page)}>
                <RefreshCw size={16} />
                刷新
              </button>
              <PermissionButton className="primary-button" permission={LEAD_PERMISSIONS.create} type="button" onClick={openCreate}>
                <Plus size={16} />
                新增线索
              </PermissionButton>
            </div>
          </section>

          <section className="filter-bar">
            <div className="system-grid-three">
              <TextField label="关键词" value={filters.keyword} onChange={(value) => updateFilter("keyword", value)} placeholder="编码、客户、联系人、电话" />
              <SelectField label="状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={statusItems} allowEmpty />
              <SelectField label="来源" value={filters.source} onChange={(value) => updateFilter("source", value)} options={sourceItems} allowEmpty />
              <SelectField label="意向等级" value={filters.intentionLevel} onChange={(value) => updateFilter("intentionLevel", value)} options={intentionItems} allowEmpty />
              <TextField label="跟进人 ID" value={filters.followUserId} onChange={(value) => updateFilter("followUserId", value)} placeholder="用户 ID" />
              <SelectField
                label="是否公海"
                value={filters.isInPool}
                onChange={(value) => updateFilter("isInPool", value)}
                options={[
                  { id: "pool-yes", itemLabel: "是", itemValue: "true", status: "enabled" },
                  { id: "pool-no", itemLabel: "否", itemValue: "false", status: "enabled" }
                ]}
                allowEmpty
              />
              <DateField label="创建开始" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
              <DateField label="创建结束" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
              <div className="filter-actions">
                <button className="primary-button" type="button" onClick={() => void load(1)}>
                  <Search size={16} />
                  查询
                </button>
              </div>
            </div>
          </section>

          {message ? <p className="status-pill">{message}</p> : null}

          <section className="page-content table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>线索编码</th>
                  <th>客户名称</th>
                  <th>联系人</th>
                  <th>联系电话</th>
                  <th>来源</th>
                  <th>行业</th>
                  <th>需求面积</th>
                  <th>预算价格</th>
                  <th>意向等级</th>
                  <th>当前状态</th>
                  <th>跟进人</th>
                  <th>最近跟进</th>
                  <th>下次跟进</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.length === 0 ? (
                  <tr>
                    <td colSpan={14}>暂无线索数据</td>
                  </tr>
                ) : pageData.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.leadCode}</td>
                    <td>{row.customerName}</td>
                    <td>{row.contactName}</td>
                    <td>{fieldText(authUser, canViewContactMobile, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE, row.contactMobile)}</td>
                    <td>{labelFor(sourceItems, row.source)}</td>
                    <td>{labelFor(industryItems, row.industryCode)}</td>
                    <td>{formatArea(row.demandArea)}</td>
                    <td>{moneyText(authUser, canViewDemandPrice, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE, row.demandPrice)}</td>
                    <td><DictBadge items={intentionItems} value={row.intentionLevel} /></td>
                    <td><DictBadge items={statusItems} value={row.status} /></td>
                    <td>{row.followUserName ?? "-"}</td>
                    <td>{formatDateTime(row.lastFollowTime)}</td>
                    <td>{formatDateTime(row.nextFollowTime)}</td>
                    <td>
                      <span className="data-table-actions">
                        <button className="primary-button" type="button" onClick={() => void openDetail(row)}>
                          <Eye size={16} />
                          查看
                        </button>
                        <PermissionButton className="primary-button" permission={LEAD_PERMISSIONS.update} type="button" onClick={() => openEdit(row)}>
                          <Edit3 size={16} />
                          编辑
                        </PermissionButton>
                        <PermissionButton className="primary-button" permission={LEAD_PERMISSIONS.delete} type="button" onClick={() => void remove(row)}>
                          <Trash2 size={16} />
                          删除
                        </PermissionButton>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="system-toolbar">
              <span className="muted-text">共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
              <span className="page-actions">
                <button className="primary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1)}>上一页</button>
                <button className="primary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1)}>下一页</button>
              </span>
            </div>
          </section>

          {showForm ? (
            <section className="page-content drawer-panel drawer-panel-lg">
              <div className="system-toolbar">
                <h2>{editing ? "编辑招商线索" : "新增招商线索"}</h2>
                <button className="primary-button" type="button" onClick={() => setShowForm(false)}>
                  <X size={16} />
                  关闭
                </button>
              </div>
              <form className="form-stack" onSubmit={(event) => void submit(event)}>
                <div className="system-grid">
                  <TextField label="线索编码" value={form.leadCode} onChange={(value) => setFormValue("leadCode", value, setForm)} placeholder="留空自动生成" />
                  <SelectField label="状态" value={form.status} onChange={(value) => setFormValue("status", value, setForm)} options={statusItems} />
                  <TextField label="客户名称" value={form.customerName} onChange={(value) => setFormValue("customerName", value, setForm)} required />
                  <TextField label="联系人" value={form.contactName} onChange={(value) => setFormValue("contactName", value, setForm)} required />
                  {canEditContactMobile ? <TextField label="联系电话" value={form.contactMobile} onChange={(value) => setFormValue("contactMobile", value, setForm)} required /> : null}
                  <TextField label="联系人邮箱" value={form.contactEmail} onChange={(value) => setFormValue("contactEmail", value, setForm)} type="email" />
                  <SelectField label="来源" value={form.source} onChange={(value) => setFormValue("source", value, setForm)} options={sourceItems} />
                  <TextField label="渠道名称" value={form.channelName} onChange={(value) => setFormValue("channelName", value, setForm)} />
                  <SelectField label="行业" value={form.industryCode} onChange={(value) => setFormValue("industryCode", value, setForm)} options={industryItems} allowEmpty />
                  <TextField label="行业细分" value={form.industryDetail} onChange={(value) => setFormValue("industryDetail", value, setForm)} />
                  <NumberField label="需求面积" value={form.demandArea} onChange={(value) => setFormValue("demandArea", value, setForm)} />
                  {canEditDemandPrice ? <NumberField label="预算价格" value={form.demandPrice} onChange={(value) => setFormValue("demandPrice", value, setForm)} /> : null}
                  <SelectField label="需求房源类型" value={form.demandUnitType} onChange={(value) => setFormValue("demandUnitType", value, setForm)} options={unitTypeItems} allowEmpty />
                  <SelectField label="意向等级" value={form.intentionLevel} onChange={(value) => setFormValue("intentionLevel", value, setForm)} options={intentionItems} allowEmpty />
                  <TextField label="跟进人 ID" value={form.followUserId} onChange={(value) => setFormValue("followUserId", value, setForm)} />
                  <TextField label="跟进人名称" value={form.followUserName} onChange={(value) => setFormValue("followUserName", value, setForm)} />
                  <DateTimeField label="最近跟进时间" value={form.lastFollowTime} onChange={(value) => setFormValue("lastFollowTime", value, setForm)} />
                  <DateTimeField label="下次跟进时间" value={form.nextFollowTime} onChange={(value) => setFormValue("nextFollowTime", value, setForm)} />
                  <DateField label="预计成交日期" value={form.expectedCloseDate} onChange={(value) => setFormValue("expectedCloseDate", value, setForm)} />
                  <SelectField
                    label="是否公海"
                    value={form.isInPool}
                    onChange={(value) => setFormValue("isInPool", value, setForm)}
                    options={[
                      { id: "form-pool-yes", itemLabel: "是", itemValue: "true", status: "enabled" },
                      { id: "form-pool-no", itemLabel: "否", itemValue: "false", status: "enabled" }
                    ]}
                  />
                </div>
                <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value, setForm)} />
                <div className="page-actions">
                  <button className="primary-button" type="submit">保存</button>
                  <button className="primary-button" type="button" onClick={() => setShowForm(false)}>取消</button>
                </div>
              </form>
            </section>
          ) : null}

          {detail ? (
            <section className="page-content drawer-panel drawer-panel-md">
              <div className="system-toolbar">
                <h2>线索详情</h2>
                <button className="primary-button" type="button" onClick={() => setDetail(null)}>
                  <X size={16} />
                  关闭
                </button>
              </div>
              <div className="system-tabs">
                <button className={detailTab === "profile" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("profile")}>基础信息</button>
                <PermissionGuard permission={FOLLOW_PERMISSIONS.read}>
                  <button className={detailTab === "follows" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("follows")}>跟进记录</button>
                </PermissionGuard>
                <PermissionGuard permission={VISIT_PERMISSIONS.read}>
                  <button className={detailTab === "visits" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("visits")}>看房记录</button>
                </PermissionGuard>
              </div>
              {detailTab === "profile" ? (
                <DetailGrid>
                  <DetailItem label="线索编码" value={detail.leadCode} />
                  <DetailItem label="客户名称" value={detail.customerName} />
                  <DetailItem label="联系人" value={detail.contactName} />
                  <DetailItem label="联系电话" value={fieldText(authUser, canViewContactMobile, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE, detail.contactMobile)} />
                  <DetailItem label="来源" value={labelFor(sourceItems, detail.source)} />
                  <DetailItem label="行业" value={labelFor(industryItems, detail.industryCode)} />
                  <DetailItem label="需求面积" value={formatArea(detail.demandArea)} />
                  <DetailItem label="预算价格" value={moneyText(authUser, canViewDemandPrice, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE, detail.demandPrice)} />
                  <DetailItem label="意向等级" value={<DictBadge items={intentionItems} value={detail.intentionLevel} />} />
                  <DetailItem label="当前状态" value={<DictBadge items={statusItems} value={detail.status} />} />
                  <DetailItem label="跟进人" value={detail.followUserName ?? "-"} />
                  <DetailItem label="是否公海" value={detail.isInPool ? "是" : "否"} />
                  <DetailItem label="最近跟进" value={formatDateTime(detail.lastFollowTime)} />
                  <DetailItem label="下次跟进" value={formatDateTime(detail.nextFollowTime)} />
                  <DetailItem label="预计成交" value={detail.expectedCloseDate ?? "-"} />
                  <DetailItem label="备注" value={detail.remark ?? "-"} />
                </DetailGrid>
              ) : null}
              {detailTab === "follows" ? (
                <PermissionGuard permission={FOLLOW_PERMISSIONS.read} fallback={<p className="muted-text">当前账号没有查看跟进记录的权限。</p>}>
                  <section className="detail-stack">
                    <div className="task-item">
                      <h3>跟进记录</h3>
                      <PermissionButton className="primary-button" permission={FOLLOW_PERMISSIONS.create} type="button" onClick={openFollowCreate}>
                        <Plus size={16} />
                        新增跟进
                      </PermissionButton>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>跟进时间</th>
                          <th>方式</th>
                          <th>跟进人</th>
                          <th>内容</th>
                          <th>下步动作</th>
                          <th>下次跟进</th>
                          <th>附件</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {follows.length === 0 ? <tr><td colSpan={8}>暂无跟进记录</td></tr> : follows.map((follow) => (
                          <tr key={follow.id}>
                            <td>{formatDateTime(follow.followTime)}</td>
                            <td>{labelFor(followTypeItems, follow.followType)}</td>
                            <td>{follow.followUserName ?? "-"}</td>
                            <td>{follow.content}</td>
                            <td>{follow.nextAction ?? "-"}</td>
                            <td>{formatDateTime(follow.nextFollowTime)}</td>
                            <td>{formatFileList(follow.attachmentFileIds, followFileNames)}</td>
                            <td>
                              <span className="data-table-actions">
                                <PermissionButton className="primary-button" permission={FOLLOW_PERMISSIONS.update} type="button" onClick={() => openFollowEdit(follow)}>
                                  <Edit3 size={16} />
                                  编辑
                                </PermissionButton>
                                <PermissionButton className="primary-button" permission={FOLLOW_PERMISSIONS.delete} type="button" onClick={() => void removeFollow(follow)}>
                                  <Trash2 size={16} />
                                  删除
                                </PermissionButton>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {showFollowForm ? (
                      <section className="detail-stack">
                        <PermissionGuard permission={FILE_PERMISSIONS.upload} fallback={<p className="muted-text">当前账号没有附件上传权限。</p>}>
                          <form className="form-stack" onSubmit={(event) => void uploadFollowFile(event).catch((error: Error) => setMessage(error.message))}>
                            <h3>上传跟进附件</h3>
                            <label className="field">
                              <span>附件文件</span>
                              <input name="file" required type="file" />
                            </label>
                            <button className="primary-button" disabled={uploadingFollowFile} type="submit">
                              <Upload size={16} />
                              {uploadingFollowFile ? "上传中" : "上传附件"}
                            </button>
                            {followForm.attachmentFileIds.length > 0 ? <span className="status-pill">已上传：{formatFileList(followForm.attachmentFileIds, followFileNames)}</span> : null}
                          </form>
                        </PermissionGuard>
                        <form className="form-stack" onSubmit={(event) => void submitFollow(event).catch((error: Error) => setMessage(error.message))}>
                          <h3>{editingFollow ? "编辑跟进" : "新增跟进"}</h3>
                          <DateTimeField label="跟进时间" value={followForm.followTime} onChange={(value) => setFollowFormValue("followTime", value, setFollowForm)} />
                          <SelectField label="跟进方式" value={followForm.followType} onChange={(value) => setFollowFormValue("followType", value, setFollowForm)} options={followTypeItems} allowEmpty />
                          <TextAreaField label="跟进内容" value={followForm.content} onChange={(value) => setFollowFormValue("content", value, setFollowForm)} />
                          <TextAreaField label="下步动作" value={followForm.nextAction} onChange={(value) => setFollowFormValue("nextAction", value, setFollowForm)} />
                          <DateTimeField label="下次跟进时间" value={followForm.nextFollowTime} onChange={(value) => setFollowFormValue("nextFollowTime", value, setFollowForm)} />
                          <TextAreaField label="备注" value={followForm.remark} onChange={(value) => setFollowFormValue("remark", value, setFollowForm)} />
                          <div className="page-actions">
                            <button className="primary-button" type="submit">保存跟进</button>
                            <button className="primary-button" type="button" onClick={() => setShowFollowForm(false)}>取消</button>
                          </div>
                        </form>
                      </section>
                    ) : null}
                  </section>
                </PermissionGuard>
              ) : null}
              {detailTab === "visits" ? (
                <PermissionGuard permission={VISIT_PERMISSIONS.read} fallback={<p className="muted-text">当前账号没有查看看房记录的权限。</p>}>
                  <section className="detail-stack">
                    <div className="task-item">
                      <h3>看房记录</h3>
                      <PermissionButton className="primary-button" permission={VISIT_PERMISSIONS.create} type="button" onClick={openVisitCreate}>
                        <Plus size={16} />
                        新增看房
                      </PermissionButton>
                    </div>
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>看房时间</th>
                          <th>人数</th>
                          <th>接待人</th>
                          <th>看房房源</th>
                          <th>结果</th>
                          <th>照片</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visits.length === 0 ? <tr><td colSpan={7}>暂无看房记录</td></tr> : visits.map((visit) => (
                          <tr key={visit.id}>
                            <td>{formatDateTime(visit.visitTime)}</td>
                            <td>{visit.visitorCount}</td>
                            <td>{visit.receptionUserName ?? "-"}</td>
                            <td>{formatUnitList(visit.unitIds, visitUnitOptions)}</td>
                            <td>{visit.visitResult ?? "-"}</td>
                            <td>{formatFileList(visit.photoFileIds, visitFileNames)}</td>
                            <td>
                              <span className="data-table-actions">
                                <PermissionButton className="primary-button" permission={VISIT_PERMISSIONS.update} type="button" onClick={() => openVisitEdit(visit)}>
                                  <Edit3 size={16} />
                                  编辑
                                </PermissionButton>
                                <PermissionButton className="primary-button" permission={VISIT_PERMISSIONS.delete} type="button" onClick={() => void removeVisit(visit)}>
                                  <Trash2 size={16} />
                                  删除
                                </PermissionButton>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {showVisitForm ? (
                      <section className="detail-stack">
                        <PermissionGuard permission={FILE_PERMISSIONS.upload} fallback={<p className="muted-text">当前账号没有照片上传权限。</p>}>
                          <form className="form-stack" onSubmit={(event) => void uploadVisitPhoto(event).catch((error: Error) => setMessage(error.message))}>
                            <h3>上传看房照片</h3>
                            <label className="field">
                              <span>照片文件</span>
                              <input name="file" required type="file" />
                            </label>
                            <button className="primary-button" disabled={uploadingVisitPhoto} type="submit">
                              <Upload size={16} />
                              {uploadingVisitPhoto ? "上传中" : "上传照片"}
                            </button>
                            {visitForm.photoFileIds.length > 0 ? <span className="status-pill">已上传：{formatFileList(visitForm.photoFileIds, visitFileNames)}</span> : null}
                          </form>
                        </PermissionGuard>
                        <form className="form-stack" onSubmit={(event) => void submitVisit(event).catch((error: Error) => setMessage(error.message))}>
                          <h3>{editingVisit ? "编辑看房" : "新增看房"}</h3>
                          <div className="system-grid">
                            <DateTimeField label="看房时间" value={visitForm.visitTime} onChange={(value) => setVisitFormValue("visitTime", value, setVisitForm)} />
                            <NumberField label="看房人数" value={visitForm.visitorCount} onChange={(value) => setVisitFormValue("visitorCount", value, setVisitForm)} />
                            <TextField label="接待人 ID" value={visitForm.receptionUserId} onChange={(value) => setVisitFormValue("receptionUserId", value, setVisitForm)} />
                            <TextField label="接待人名称" value={visitForm.receptionUserName} onChange={(value) => setVisitFormValue("receptionUserName", value, setVisitForm)} />
                            <SelectField
                              label="推进状态"
                              value={visitForm.advanceStatus}
                              onChange={(value) => setVisitFormValue("advanceStatus", value, setVisitForm)}
                              options={[
                                { id: "visit-advance-yes", itemLabel: "推进为已看房", itemValue: "true", status: "enabled" },
                                { id: "visit-advance-no", itemLabel: "不推进", itemValue: "false", status: "enabled" }
                              ]}
                            />
                          </div>
                          <VisitUnitSelector
                            filters={visitUnitFilters}
                            buildingOptions={visitBuildingOptions}
                            rentalStatusItems={rentalStatusItems}
                            units={visitUnitOptions}
                            selectedIds={visitForm.unitIds}
                            onFilterChange={(key, value) => setVisitUnitFilters((current) => ({ ...current, [key]: value }))}
                            onRefresh={() => void loadVisitUnits().catch((error: Error) => setMessage(error.message))}
                            onToggle={(unitId) => setVisitForm((current) => ({ ...current, unitIds: toggleId(current.unitIds, unitId) }))}
                          />
                          <TextAreaField label="看房结果" value={visitForm.visitResult} onChange={(value) => setVisitFormValue("visitResult", value, setVisitForm)} />
                          <TextAreaField label="备注" value={visitForm.remark} onChange={(value) => setVisitFormValue("remark", value, setVisitForm)} />
                          <div className="page-actions">
                            <button className="primary-button" type="submit">保存看房</button>
                            <button className="primary-button" type="button" onClick={() => setShowVisitForm(false)}>取消</button>
                          </div>
                        </form>
                      </section>
                    ) : null}
                  </section>
                </PermissionGuard>
              ) : null}
            </section>
          ) : null}
        </main>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  required = false,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min="0" step="0.01" onFocus={(event) => event.target.select()} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateTimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="datetime-local" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} rows={3} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  allowEmpty = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DictItemRow[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部</option> : null}
        {options.map((option) => <option key={option.id} value={option.itemValue}>{option.itemLabel}</option>)}
      </select>
    </label>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  const item = items.find((option) => option.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="system-grid">{children}</div>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="task-item">
      <span className="muted-text">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <section className="page-content">
        <h1>403</h1>
        <p>当前账号没有访问招商线索的权限。</p>
      </section>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <section className="page-content module-denied">
        <h1>模块未授权</h1>
        <p>当前租户未启用招商租赁模块。</p>
      </section>
    </main>
  );
}

function setFormValue(key: keyof LeadFormState, value: string, setter: (updater: (current: LeadFormState) => LeadFormState) => void) {
  setter((current) => ({ ...current, [key]: value }));
}

function setFollowFormValue(key: keyof Omit<FollowFormState, "attachmentFileIds">, value: string, setter: (updater: (current: FollowFormState) => FollowFormState) => void) {
  setter((current) => ({ ...current, [key]: value }));
}

function setVisitFormValue(key: keyof Omit<VisitFormState, "unitIds" | "photoFileIds">, value: string, setter: (updater: (current: VisitFormState) => VisitFormState) => void) {
  setter((current) => ({ ...current, [key]: value }));
}

function VisitUnitSelector({
  filters,
  buildingOptions,
  rentalStatusItems,
  units,
  selectedIds,
  onFilterChange,
  onRefresh,
  onToggle
}: {
  filters: { buildingId: string; rentalStatus: string; keyword: string };
  buildingOptions: Array<{ id: string; label: string }>;
  rentalStatusItems: DictItemRow[];
  units: UnitOptionRow[];
  selectedIds: string[];
  onFilterChange: (key: "buildingId" | "rentalStatus" | "keyword", value: string) => void;
  onRefresh: () => void;
  onToggle: (unitId: string) => void;
}) {
  return (
    <section className="detail-stack">
      <h3>看房房源</h3>
      <div className="system-grid-three">
        <label className="field">
          <span>楼栋</span>
          <select value={filters.buildingId} onChange={(event) => onFilterChange("buildingId", event.target.value)}>
            <option value="">全部</option>
            {buildingOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
        <SelectField label="出租状态" value={filters.rentalStatus} onChange={(value) => onFilterChange("rentalStatus", value)} options={rentalStatusItems} allowEmpty />
        <TextField label="房源关键词" value={filters.keyword} onChange={(value) => onFilterChange("keyword", value)} placeholder="编码、名称" />
        <div className="filter-actions">
          <button className="primary-button" type="button" onClick={onRefresh}>
            <Search size={16} />
            筛选房源
          </button>
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>选择</th>
            <th>房源</th>
            <th>楼栋/楼层</th>
            <th>面积</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {units.length === 0 ? <tr><td colSpan={5}>暂无可选房源</td></tr> : units.map((unit) => (
            <tr key={unit.id}>
              <td>
                <input type="checkbox" checked={selectedIds.includes(unit.id)} onChange={() => onToggle(unit.id)} />
              </td>
              <td>{unitDisplay(unit)}</td>
              <td>{buildingFloorDisplay(unit)}</td>
              <td>{formatArea(unit.unitArea)}</td>
              <td>{labelFor(rentalStatusItems, String(unit.rentalStatus))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="status-pill">已选择：{selectedIds.length} 个房源</span>
    </section>
  );
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}

function numberOrUndefined(value: string): number | undefined {
  const text = value.trim();
  return text ? Number(text) : undefined;
}

function dateTimeOrUndefined(value: string): string | undefined {
  return value ? new Date(value).toISOString() : undefined;
}

function toLocalInputValue(value?: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function statusClass(tagType?: string | null): string {
  switch (tagType) {
    case "success":
      return "status-success";
    case "warning":
      return "status-warning";
    case "danger":
      return "status-danger";
    case "primary":
      return "status-primary";
    case "info":
      return "status-info";
    default:
      return "status-muted";
  }
}

function fieldText(
  user: ReturnType<typeof useAuthUser>,
  canView: boolean,
  moduleName: string,
  entityName: string,
  fieldKey: string,
  value: unknown
): string {
  if (!canView) return "-";
  const masked = maskField(user, moduleName, entityName, fieldKey, value);
  return masked === null || masked === undefined || masked === "" ? "-" : String(masked);
}

function moneyText(
  user: ReturnType<typeof useAuthUser>,
  canView: boolean,
  moduleName: string,
  entityName: string,
  fieldKey: string,
  value: unknown
): string {
  const text = fieldText(user, canView, moduleName, entityName, fieldKey, value);
  const numeric = Number(text);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : text;
}

function formatArea(value?: string | null): string {
  if (!value) return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)} m²` : value;
}

function formatFileList(fileIds: string[] | undefined, fileNames: Record<string, string>): string {
  const ids = fileIds ?? [];
  if (ids.length === 0) return "-";
  return ids.map((fileId) => fileNames[fileId] ?? fileId).join("，");
}

function formatUnitList(unitIds: string[] | undefined, units: UnitOptionRow[]): string {
  const ids = unitIds ?? [];
  if (ids.length === 0) return "-";
  const unitMap = new Map(units.map((unit) => [unit.id, unitDisplay(unit)]));
  return ids.map((unitId) => unitMap.get(unitId) ?? unitId).join("，");
}

function unitDisplay(unit: UnitOptionRow): string {
  return `${unit.unitName}（${unit.code ?? unit.unitCode}）`;
}

function buildingFloorDisplay(unit: UnitOptionRow): string {
  const building = unit.building ? `${unit.building.buildingName} ${unit.building.buildingCode}` : unit.buildingId;
  const floor = unit.floor ? `${unit.floor.floorName} ${unit.floor.floorCode}` : unit.floorId;
  return `${building} / ${floor}`;
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function mergeBuildingOptions(current: Array<{ id: string; label: string }>, units: UnitOptionRow[]): Array<{ id: string; label: string }> {
  const next = new Map(current.map((item) => [item.id, item.label]));
  for (const unit of units) {
    if (!unit.building) continue;
    next.set(unit.building.id, `${unit.building.buildingName} ${unit.building.buildingCode}`);
  }
  return [...next.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
}

function formatDateTime(value?: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}
