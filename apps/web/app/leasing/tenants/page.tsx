"use client";

import { AlertTriangle, CheckCircle2, Download, Edit3, Eye, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { type Dispatch, type FormEvent, type ReactNode, type SetStateAction, useCallback, useEffect, useMemo, useState } from "react";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { API_PREFIX, apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";

const LEASING_MODULE = "leasing";
const PARK_TENANT_ENTITY = "park_tenant";
const PARK_TENANT_CONTACT_ENTITY = "park_tenant_contact";
const PARK_TENANT_QUALIFICATION_ENTITY = "park_tenant_qualification";
const FIELD_LEGAL_PERSON_ID = "legalPersonId";
const FIELD_CONTACT_MOBILE = "contactMobile";
const FIELD_CONTACT_ROW_MOBILE = "mobile";
const FIELD_CONTACT_ROW_EMAIL = "email";
const FIELD_QUALIFICATION_CERTIFICATE_NO = "certificateNo";
const FIELD_QUALIFICATION_FILE_ID = "fileId";
const PARK_TENANT_PERMISSIONS = {
  read: "park_tenant:read",
  tenant360: "park_tenant:360",
  create: "park_tenant:create",
  update: "park_tenant:update",
  delete: "park_tenant:delete",
  riskUpdate: "park_tenant:risk_update",
  riskLog: "park_tenant:risk_log"
} as const;
const PARK_TENANT_CONTACT_PERMISSIONS = {
  read: "park_tenant_contact:read",
  create: "park_tenant_contact:create",
  update: "park_tenant_contact:update",
  delete: "park_tenant_contact:delete"
} as const;
const PARK_TENANT_QUALIFICATION_PERMISSIONS = {
  read: "park_tenant_qualification:read",
  create: "park_tenant_qualification:create",
  update: "park_tenant_qualification:update",
  delete: "park_tenant_qualification:delete"
} as const;
const FILE_PERMISSIONS = {
  upload: "file:upload",
  download: "file:download"
} as const;
const QUALIFICATION_FILE_BIZ_TYPE = "park_tenant_qualification";

interface ParkTenantRow {
  id: string;
  code: string | null;
  parkTenantCode: string;
  companyName: string;
  unifiedCreditCode: string | null;
  legalPerson: string | null;
  legalPersonId?: string | null;
  contactName: string | null;
  contactMobile?: string | null;
  contactEmail: string | null;
  industryCode: string | null;
  industryDetail: string | null;
  businessScope: string | null;
  tenantType: string | null;
  riskLevel: string | null;
  riskTags: string[];
  checkInDate: string | null;
  checkOutDate: string | null;
  status: string;
  sourceType: string;
  remark: string | null;
  updateTime: string;
  createTime: string;
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

interface ParkTenantFormState {
  parkTenantCode: string;
  companyName: string;
  unifiedCreditCode: string;
  legalPerson: string;
  legalPersonId: string;
  contactName: string;
  contactMobile: string;
  contactEmail: string;
  industryCode: string;
  industryDetail: string;
  businessScope: string;
  tenantType: string;
  riskLevel: string;
  riskTags: string;
  checkInDate: string;
  checkOutDate: string;
  status: string;
  sourceType: string;
  remark: string;
}

interface ParkTenantContactRow {
  id: string;
  parkTenantId: string;
  contactName: string;
  contactRole: string | null;
  mobile?: string | null;
  email: string | null;
  position: string | null;
  isPrimary: boolean;
  isEmergency: boolean;
  status: number;
  remark: string | null;
  updateTime: string;
}

interface ParkTenantContactFormState {
  contactName: string;
  contactRole: string;
  mobile: string;
  email: string;
  position: string;
  isPrimary: boolean;
  isEmergency: boolean;
  status: string;
  remark: string;
}

interface ParkTenantQualificationRow {
  id: string;
  parkTenantId: string;
  qualificationType: string;
  qualificationName: string;
  certificateNo: string | null;
  issueDate: string | null;
  expireDate: string | null;
  fileId: string | null;
  file?: FileRecord | null;
  status: number;
  remark: string | null;
  updateTime: string;
}

interface ParkTenantQualificationFormState {
  qualificationType: string;
  qualificationName: string;
  certificateNo: string;
  issueDate: string;
  expireDate: string;
  fileId: string;
  fileName: string;
  status: string;
  remark: string;
}

interface ParkTenantRiskLogRow {
  id: string;
  parkTenantId: string;
  beforeRiskLevel: string | null;
  afterRiskLevel: string;
  beforeRiskTags: string[];
  afterRiskTags: string[];
  reason: string;
  operatorName: string | null;
  opTime: string;
  remark: string | null;
}

interface ParkTenantRiskFormState {
  riskLevel: string;
  riskTags: string;
  reason: string;
}

interface ParkTenant360View {
  profile: ParkTenantRow;
  contacts: ParkTenantContactRow[];
  qualifications: ParkTenantQualificationRow[];
  riskLogs: ParkTenantRiskLogRow[];
  relatedUnits: unknown[];
  contracts: { available: boolean; items: unknown[] };
  receivables: { available: boolean; summary: unknown | null };
  workorders: { available: boolean; summary: unknown | null };
  hazards: { available: boolean; summary: unknown | null };
  energy: { available: boolean; summary: unknown | null };
}

const emptyPage: PaginatedResult<ParkTenantRow> = { items: [], page: 1, page_size: 20, total: 0 };

const emptyForm: ParkTenantFormState = {
  parkTenantCode: "",
  companyName: "",
  unifiedCreditCode: "",
  legalPerson: "",
  legalPersonId: "",
  contactName: "",
  contactMobile: "",
  contactEmail: "",
  industryCode: "",
  industryDetail: "",
  businessScope: "",
  tenantType: "",
  riskLevel: "",
  riskTags: "",
  checkInDate: "",
  checkOutDate: "",
  status: "",
  sourceType: "",
  remark: ""
};

const emptyContactForm: ParkTenantContactFormState = {
  contactName: "",
  contactRole: "",
  mobile: "",
  email: "",
  position: "",
  isPrimary: false,
  isEmergency: false,
  status: "1",
  remark: ""
};

const emptyQualificationForm: ParkTenantQualificationFormState = {
  qualificationType: "",
  qualificationName: "",
  certificateNo: "",
  issueDate: "",
  expireDate: "",
  fileId: "",
  fileName: "",
  status: "1",
  remark: ""
};

const emptyRiskForm: ParkTenantRiskFormState = {
  riskLevel: "",
  riskTags: "",
  reason: ""
};

export default function LeasingTenantsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<ParkTenantRow>>(emptyPage);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [filters, setFilters] = useState({ keyword: "", status: "", tenantType: "", riskLevel: "", industryCode: "" });
  const [form, setForm] = useState<ParkTenantFormState>(emptyForm);
  const [editing, setEditing] = useState<ParkTenantRow | null>(null);
  const [detail, setDetail] = useState<ParkTenantRow | null>(null);
  const [tenant360, setTenant360] = useState<ParkTenant360View | null>(null);
  const [tenant360Loading, setTenant360Loading] = useState(false);
  const [contacts, setContacts] = useState<ParkTenantContactRow[]>([]);
  const [contactForm, setContactForm] = useState<ParkTenantContactFormState>(emptyContactForm);
  const [editingContact, setEditingContact] = useState<ParkTenantContactRow | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);
  const [qualifications, setQualifications] = useState<ParkTenantQualificationRow[]>([]);
  const [qualificationForm, setQualificationForm] = useState<ParkTenantQualificationFormState>(emptyQualificationForm);
  const [editingQualification, setEditingQualification] = useState<ParkTenantQualificationRow | null>(null);
  const [showQualificationForm, setShowQualificationForm] = useState(false);
  const [uploadingQualificationFile, setUploadingQualificationFile] = useState(false);
  const [riskLogs, setRiskLogs] = useState<ParkTenantRiskLogRow[]>([]);
  const [riskForm, setRiskForm] = useState<ParkTenantRiskFormState>(emptyRiskForm);
  const [showRiskForm, setShowRiskForm] = useState(false);
  const [detailTab, setDetailTab] = useState<"profile" | "risk" | "contacts" | "qualifications" | "contracts" | "receivables" | "workorders" | "hazards" | "energy">("profile");
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const canViewLegalPersonId = canViewField(authUser, LEASING_MODULE, PARK_TENANT_ENTITY, FIELD_LEGAL_PERSON_ID);
  const canEditLegalPersonId = canEditField(authUser, LEASING_MODULE, PARK_TENANT_ENTITY, FIELD_LEGAL_PERSON_ID);
  const canViewContactMobile = canViewField(authUser, LEASING_MODULE, PARK_TENANT_ENTITY, FIELD_CONTACT_MOBILE);
  const canEditContactMobile = canEditField(authUser, LEASING_MODULE, PARK_TENANT_ENTITY, FIELD_CONTACT_MOBILE);
  const canViewContactRowMobile = canViewField(authUser, LEASING_MODULE, PARK_TENANT_CONTACT_ENTITY, FIELD_CONTACT_ROW_MOBILE);
  const canEditContactRowMobile = canEditField(authUser, LEASING_MODULE, PARK_TENANT_CONTACT_ENTITY, FIELD_CONTACT_ROW_MOBILE);
  const canViewContactRowEmail = canViewField(authUser, LEASING_MODULE, PARK_TENANT_CONTACT_ENTITY, FIELD_CONTACT_ROW_EMAIL);
  const canEditContactRowEmail = canEditField(authUser, LEASING_MODULE, PARK_TENANT_CONTACT_ENTITY, FIELD_CONTACT_ROW_EMAIL);
  const canViewQualificationCertificateNo = canViewField(authUser, LEASING_MODULE, PARK_TENANT_QUALIFICATION_ENTITY, FIELD_QUALIFICATION_CERTIFICATE_NO);
  const canEditQualificationCertificateNo = canEditField(authUser, LEASING_MODULE, PARK_TENANT_QUALIFICATION_ENTITY, FIELD_QUALIFICATION_CERTIFICATE_NO);
  const canViewQualificationFileId = canViewField(authUser, LEASING_MODULE, PARK_TENANT_QUALIFICATION_ENTITY, FIELD_QUALIFICATION_FILE_ID);
  const canEditQualificationFileId = canEditField(authUser, LEASING_MODULE, PARK_TENANT_QUALIFICATION_ENTITY, FIELD_QUALIFICATION_FILE_ID);

  const statusItems = dicts.park_tenant_status ?? [];
  const typeItems = dicts.park_tenant_type ?? [];
  const riskItems = dicts.park_tenant_risk_level ?? [];
  const industryItems = dicts.industry_code ?? [];
  const sourceItems = dicts.park_tenant_source_type ?? [];
  const contactRoleItems = dicts.park_tenant_contact_role ?? [];
  const qualificationTypeItems = dicts.park_tenant_qualification_type ?? [];

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: "20" });
    if (filters.keyword.trim()) params.set("keyword", filters.keyword.trim());
    if (filters.status) params.set("status", filters.status);
    if (filters.tenantType) params.set("tenant_type", filters.tenantType);
    if (filters.riskLevel) params.set("risk_level", filters.riskLevel);
    if (filters.industryCode) params.set("industry_code", filters.industryCode);
    const response = await apiRequest<PaginatedResult<ParkTenantRow>>(`/park-tenants?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters]);

  const loadTenant360 = useCallback(async (parkTenantId: string) => {
    setTenant360Loading(true);
    try {
      const response = await apiRequest<ParkTenant360View>(`/park-tenants/${parkTenantId}/360`, {
        token: getAccessToken()
      });
      setTenant360(response.data);
      setDetail(response.data.profile);
      setContacts(response.data.contacts);
      setQualifications(response.data.qualifications);
      setRiskLogs(response.data.riskLogs);
    } finally {
      setTenant360Loading(false);
    }
  }, []);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = [
      "park_tenant_status",
      "park_tenant_type",
      "park_tenant_risk_level",
      "industry_code",
      "park_tenant_source_type",
      "park_tenant_contact_role",
      "park_tenant_qualification_type"
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
    setForm({ ...emptyForm, status: statusItems[0]?.itemValue ?? "", tenantType: typeItems[0]?.itemValue ?? "", riskLevel: riskItems[0]?.itemValue ?? "" });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(row: ParkTenantRow) {
    setEditing(row);
    setForm({
      parkTenantCode: row.parkTenantCode,
      companyName: row.companyName,
      unifiedCreditCode: row.unifiedCreditCode ?? "",
      legalPerson: row.legalPerson ?? "",
      legalPersonId: typeof row.legalPersonId === "string" ? row.legalPersonId : "",
      contactName: row.contactName ?? "",
      contactMobile: typeof row.contactMobile === "string" ? row.contactMobile : "",
      contactEmail: row.contactEmail ?? "",
      industryCode: row.industryCode ?? "",
      industryDetail: row.industryDetail ?? "",
      businessScope: row.businessScope ?? "",
      tenantType: row.tenantType ?? "",
      riskLevel: row.riskLevel ?? "",
      riskTags: (row.riskTags ?? []).join(","),
      checkInDate: row.checkInDate ?? "",
      checkOutDate: row.checkOutDate ?? "",
      status: row.status,
      sourceType: row.sourceType,
      remark: row.remark ?? ""
    });
    setShowForm(true);
    setMessage("");
  }

  function openDetail(row: ParkTenantRow) {
    setDetail(row);
    setTenant360(null);
    setContacts([]);
    setQualifications([]);
    setRiskLogs([]);
    setDetailTab("profile");
    setShowContactForm(false);
    setEditingContact(null);
    setContactForm(emptyContactForm);
    setShowQualificationForm(false);
    setEditingQualification(null);
    setQualificationForm(emptyQualificationForm);
    setShowRiskForm(false);
    setRiskForm({ ...emptyRiskForm, riskLevel: row.riskLevel ?? "", riskTags: (row.riskTags ?? []).join("，") });
    setMessage("");
    void loadTenant360(row.id).catch((error: Error) => setMessage(error.message));
  }

  function openContactCreate() {
    setEditingContact(null);
    setContactForm({ ...emptyContactForm, contactRole: contactRoleItems[0]?.itemValue ?? "" });
    setShowContactForm(true);
    setMessage("");
  }

  function openContactEdit(row: ParkTenantContactRow) {
    setEditingContact(row);
    setContactForm({
      contactName: row.contactName,
      contactRole: row.contactRole ?? "",
      mobile: typeof row.mobile === "string" ? row.mobile : "",
      email: row.email ?? "",
      position: row.position ?? "",
      isPrimary: row.isPrimary,
      isEmergency: row.isEmergency,
      status: String(row.status),
      remark: row.remark ?? ""
    });
    setShowContactForm(true);
    setMessage("");
  }

  function openQualificationCreate() {
    setEditingQualification(null);
    setQualificationForm({ ...emptyQualificationForm, qualificationType: qualificationTypeItems[0]?.itemValue ?? "" });
    setShowQualificationForm(true);
    setMessage("");
  }

  function openQualificationEdit(row: ParkTenantQualificationRow) {
    setEditingQualification(row);
    setQualificationForm({
      qualificationType: row.qualificationType,
      qualificationName: row.qualificationName,
      certificateNo: row.certificateNo ?? "",
      issueDate: row.issueDate ?? "",
      expireDate: row.expireDate ?? "",
      fileId: row.fileId ?? "",
      fileName: row.file?.originalName ?? "",
      status: String(row.status),
      remark: row.remark ?? ""
    });
    setShowQualificationForm(true);
    setMessage("");
  }

  function openRiskChange() {
    if (!detail) return;
    setRiskForm({
      riskLevel: detail.riskLevel ?? "",
      riskTags: (detail.riskTags ?? []).join("，"),
      reason: ""
    });
    setShowRiskForm(true);
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = {
      parkTenantCode: emptyToUndefined(form.parkTenantCode),
      companyName: form.companyName.trim(),
      unifiedCreditCode: emptyToUndefined(form.unifiedCreditCode),
      legalPerson: emptyToUndefined(form.legalPerson),
      contactName: emptyToUndefined(form.contactName),
      contactEmail: emptyToUndefined(form.contactEmail),
      industryCode: emptyToUndefined(form.industryCode),
      industryDetail: emptyToUndefined(form.industryDetail),
      businessScope: emptyToUndefined(form.businessScope),
      tenantType: emptyToUndefined(form.tenantType),
      riskLevel: emptyToUndefined(form.riskLevel),
      riskTags: splitTags(form.riskTags),
      checkInDate: emptyToUndefined(form.checkInDate),
      checkOutDate: emptyToUndefined(form.checkOutDate),
      status: emptyToUndefined(form.status),
      sourceType: emptyToUndefined(form.sourceType),
      remark: emptyToUndefined(form.remark)
    };
    if (canEditLegalPersonId) body.legalPersonId = emptyToUndefined(form.legalPersonId);
    if (canEditContactMobile) body.contactMobile = emptyToUndefined(form.contactMobile);

    await apiRequest<ParkTenantRow>(editing ? `/park-tenants/${editing.id}` : "/park-tenants", {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "park-tenant-update" : "park-tenant-create"),
      body
    });
    setShowForm(false);
    setEditing(null);
    setMessage("保存成功");
    await load(pageData.page);
  }

  async function remove(row: ParkTenantRow) {
    if (!window.confirm(`确认删除企业「${row.companyName}」？`)) return;
    await apiRequest<{ id: string }>(`/park-tenants/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("park-tenant-delete")
    });
    setMessage("删除成功");
    await load(pageData.page);
  }

  async function submitContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const body: Record<string, unknown> = {
      contactName: contactForm.contactName.trim(),
      contactRole: emptyToUndefined(contactForm.contactRole),
      position: emptyToUndefined(contactForm.position),
      isPrimary: contactForm.isPrimary,
      isEmergency: contactForm.isEmergency,
      status: Number(contactForm.status),
      remark: emptyToUndefined(contactForm.remark)
    };
    if (canEditContactRowMobile) body.mobile = emptyToUndefined(contactForm.mobile);
    if (canEditContactRowEmail) body.email = emptyToUndefined(contactForm.email);
    await apiRequest<ParkTenantContactRow>(
      editingContact ? `/park-tenants/${detail.id}/contacts/${editingContact.id}` : `/park-tenants/${detail.id}/contacts`,
      {
        method: editingContact ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingContact ? "park-tenant-contact-update" : "park-tenant-contact-create"),
        body
      }
    );
    setShowContactForm(false);
    setEditingContact(null);
    setMessage("联系人保存成功");
    await loadTenant360(detail.id);
  }

  async function removeContact(row: ParkTenantContactRow) {
    if (!detail || !window.confirm(`确认删除联系人「${row.contactName}」？`)) return;
    await apiRequest<{ id: string }>(`/park-tenants/${detail.id}/contacts/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("park-tenant-contact-delete")
    });
    setMessage("联系人删除成功");
    await loadTenant360(detail.id);
  }

  async function setPrimaryContact(row: ParkTenantContactRow) {
    if (!detail) return;
    await apiRequest<ParkTenantContactRow>(`/park-tenants/${detail.id}/contacts/${row.id}`, {
      method: "PUT",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("park-tenant-contact-primary"),
      body: { isPrimary: true }
    });
    setMessage("已设置主联系人");
    await loadTenant360(detail.id);
  }

  async function uploadQualificationFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    setUploadingQualificationFile(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.set("biz_type", QUALIFICATION_FILE_BIZ_TYPE);
      const response = await apiFormRequest<FileRecord>("/files", {
        method: "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey("park-tenant-qualification-file-upload"),
        body: formData
      });
      setQualificationForm((current) => ({ ...current, fileId: response.data.id, fileName: response.data.originalName }));
      event.currentTarget.reset();
      setMessage("附件上传成功，请保存资质");
    } finally {
      setUploadingQualificationFile(false);
    }
  }

  async function submitQualification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    await apiRequest<ParkTenantQualificationRow>(
      editingQualification ? `/park-tenants/${detail.id}/qualifications/${editingQualification.id}` : `/park-tenants/${detail.id}/qualifications`,
      {
        method: editingQualification ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingQualification ? "park-tenant-qualification-update" : "park-tenant-qualification-create"),
        body: {
          qualificationType: qualificationForm.qualificationType,
          qualificationName: qualificationForm.qualificationName.trim(),
          issueDate: emptyToUndefined(qualificationForm.issueDate),
          expireDate: emptyToUndefined(qualificationForm.expireDate),
          status: Number(qualificationForm.status),
          remark: emptyToUndefined(qualificationForm.remark),
          ...(canEditQualificationCertificateNo ? { certificateNo: emptyToUndefined(qualificationForm.certificateNo) } : {}),
          ...(canEditQualificationFileId ? { fileId: emptyToUndefined(qualificationForm.fileId) } : {})
        }
      }
    );
    setShowQualificationForm(false);
    setEditingQualification(null);
    setMessage("资质保存成功");
    await loadTenant360(detail.id);
  }

  async function removeQualification(row: ParkTenantQualificationRow) {
    if (!detail || !window.confirm(`确认删除资质「${row.qualificationName}」？`)) return;
    await apiRequest<{ id: string }>(`/park-tenants/${detail.id}/qualifications/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("park-tenant-qualification-delete")
    });
    setMessage("资质删除成功");
    await loadTenant360(detail.id);
  }

  async function downloadQualificationFile(file: FileRecord, preview = false) {
    const response = await fetch(`${API_PREFIX}/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
    });
    if (!response.ok) {
      throw new Error("附件下载失败");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (preview) {
      window.open(url, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      return;
    }
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function submitRiskChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const response = await apiRequest<ParkTenantRow>(`/park-tenants/${detail.id}/change-risk-level`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("park-tenant-risk-change"),
      body: {
        risk_level: riskForm.riskLevel,
        risk_tags: splitTags(riskForm.riskTags),
        reason: riskForm.reason.trim()
      }
    });
    setDetail(response.data);
    setShowRiskForm(false);
    setMessage("风险等级已更新");
    await Promise.all([
      load(pageData.page),
      loadTenant360(detail.id)
    ]);
  }

  return (
    <PermissionGuard module={LEASING_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={PARK_TENANT_PERMISSIONS.read} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
        <main className="page-container">
          <header className="page-header">
            <div className="header-title">
              <strong>租户企业档案</strong>
              <span>园区入驻企业主档案</span>
            </div>
            <div className="page-actions">
              <button type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
                <RefreshCw size={16} />
                刷新
              </button>
              <PermissionButton className="primary-button" permission={PARK_TENANT_PERMISSIONS.create} type="button" onClick={openCreate}>
                <Plus size={16} />
                新增企业
              </PermissionButton>
            </div>
          </header>

          <section className="filter-bar">
            <form className="form-stack" onSubmit={(event) => { event.preventDefault(); void load(1).catch((error: Error) => setMessage(error.message)); }}>
              <div className="dashboard-grid">
                <TextField label="关键词" value={filters.keyword} placeholder="企业名称、编码、信用代码、联系人" onChange={(value) => updateFilter("keyword", value)} />
                <SelectField label="企业状态" value={filters.status} onChange={(value) => updateFilter("status", value)}>
                  <option value="">全部状态</option>
                  {statusItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <SelectField label="租户类型" value={filters.tenantType} onChange={(value) => updateFilter("tenantType", value)}>
                  <option value="">全部类型</option>
                  {typeItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <SelectField label="风险等级" value={filters.riskLevel} onChange={(value) => updateFilter("riskLevel", value)}>
                  <option value="">全部风险</option>
                  {riskItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <SelectField label="行业" value={filters.industryCode} onChange={(value) => updateFilter("industryCode", value)}>
                  <option value="">全部行业</option>
                  {industryItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
              </div>
              <button className="primary-button" type="submit">
                <Search size={16} />
                查询
              </button>
            </form>
          </section>

          <section className="page-content table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>企业编码</th>
                  <th>企业名称</th>
                  <th>统一社会信用代码</th>
                  <th>主联系人</th>
                  <th>联系电话</th>
                  <th>行业</th>
                  <th>租户类型</th>
                  <th>风险等级</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.parkTenantCode}</td>
                    <td>{row.companyName}</td>
                    <td>{fieldText(row.unifiedCreditCode)}</td>
                    <td>{fieldText(row.contactName)}</td>
                    <td>{canViewContactMobile ? fieldText(maskTenantField(authUser, FIELD_CONTACT_MOBILE, row.contactMobile)) : "-"}</td>
                    <td>{labelFor(industryItems, row.industryCode)}</td>
                    <td>{labelFor(typeItems, row.tenantType)}</td>
                    <td><DictBadge items={riskItems} value={row.riskLevel} /></td>
                    <td><DictBadge items={statusItems} value={row.status} /></td>
                    <td>{formatDateTime(row.updateTime)}</td>
                    <td>
                      <span className="data-table-actions">
                        <PermissionButton permission={PARK_TENANT_PERMISSIONS.tenant360} title="360 视图" type="button" onClick={() => openDetail(row)}><Eye size={16} /></PermissionButton>
                        <PermissionButton permission={PARK_TENANT_PERMISSIONS.update} title="编辑" type="button" onClick={() => openEdit(row)}>
                          <Edit3 size={16} />
                        </PermissionButton>
                        <PermissionButton permission={PARK_TENANT_PERMISSIONS.delete} title="删除" type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
                          <Trash2 size={16} />
                        </PermissionButton>
                      </span>
                    </td>
                  </tr>
                ))}
                {pageData.items.length === 0 ? <tr><td colSpan={11}>暂无租户企业数据</td></tr> : null}
              </tbody>
            </table>
            <div className="task-item">
              <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
              <span>
                <button type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
                <button type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
              </span>
            </div>
          </section>

          {showForm ? (
            <section className="login-panel drawer-panel drawer-panel-lg">
              <div className="task-item">
                <h2 className="panel-title">{editing ? "编辑租户企业" : "新增租户企业"}</h2>
                <button title="关闭" type="button" onClick={() => setShowForm(false)}><X size={16} /></button>
              </div>
              <form className="form-stack" onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
                <TextField label="企业编码" value={form.parkTenantCode} placeholder="为空时按编码规则生成" onChange={(value) => setFormValue(setForm, "parkTenantCode", value)} />
                <TextField label="企业名称" value={form.companyName} required onChange={(value) => setFormValue(setForm, "companyName", value)} />
                <TextField label="统一社会信用代码" value={form.unifiedCreditCode} onChange={(value) => setFormValue(setForm, "unifiedCreditCode", value)} />
                <TextField label="法人姓名" value={form.legalPerson} onChange={(value) => setFormValue(setForm, "legalPerson", value)} />
                {canEditLegalPersonId ? <TextField label="法人证件号" value={form.legalPersonId} onChange={(value) => setFormValue(setForm, "legalPersonId", value)} /> : null}
                <TextField label="主联系人" value={form.contactName} onChange={(value) => setFormValue(setForm, "contactName", value)} />
                {canEditContactMobile ? <TextField label="联系电话" value={form.contactMobile} onChange={(value) => setFormValue(setForm, "contactMobile", value)} /> : null}
                <TextField label="联系邮箱" value={form.contactEmail} onChange={(value) => setFormValue(setForm, "contactEmail", value)} />
                <SelectField label="行业" value={form.industryCode} onChange={(value) => setFormValue(setForm, "industryCode", value)}>
                  <option value="">请选择行业</option>
                  {industryItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <TextField label="行业细分" value={form.industryDetail} onChange={(value) => setFormValue(setForm, "industryDetail", value)} />
                <SelectField label="租户类型" value={form.tenantType} onChange={(value) => setFormValue(setForm, "tenantType", value)}>
                  <option value="">请选择类型</option>
                  {typeItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <SelectField label="风险等级" value={form.riskLevel} onChange={(value) => setFormValue(setForm, "riskLevel", value)}>
                  <option value="">请选择风险</option>
                  {riskItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <TextField label="风险标签" value={form.riskTags} placeholder="多个标签用逗号分隔" onChange={(value) => setFormValue(setForm, "riskTags", value)} />
                <DateField label="入驻日期" value={form.checkInDate} onChange={(value) => setFormValue(setForm, "checkInDate", value)} />
                <DateField label="退园日期" value={form.checkOutDate} onChange={(value) => setFormValue(setForm, "checkOutDate", value)} />
                <SelectField label="状态" value={form.status} onChange={(value) => setFormValue(setForm, "status", value)}>
                  <option value="">请选择状态</option>
                  {statusItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <SelectField label="来源" value={form.sourceType} onChange={(value) => setFormValue(setForm, "sourceType", value)}>
                  <option value="">请选择来源</option>
                  {sourceItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                </SelectField>
                <TextAreaField label="经营范围" value={form.businessScope} onChange={(value) => setFormValue(setForm, "businessScope", value)} />
                <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue(setForm, "remark", value)} />
                <button className="primary-button" type="submit">保存</button>
                <button type="button" onClick={() => setShowForm(false)}>取消</button>
              </form>
            </section>
          ) : null}

          {detail ? (
            <section className="login-panel drawer-panel drawer-panel-lg">
              <div className="task-item">
                <h2 className="panel-title">租户 360</h2>
                <button title="关闭" type="button" onClick={() => setDetail(null)}><X size={16} /></button>
              </div>
              <div className="system-tabs">
                <button className={detailTab === "profile" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("profile")}>基础信息</button>
                <button className={detailTab === "risk" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("risk")}>风险信息</button>
                <button className={detailTab === "contacts" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("contacts")}>联系人</button>
                <button className={detailTab === "qualifications" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("qualifications")}>资质附件</button>
                <button className={detailTab === "contracts" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("contracts")}>合同</button>
                <button className={detailTab === "receivables" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("receivables")}>应收</button>
                <button className={detailTab === "workorders" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("workorders")}>工单</button>
                <button className={detailTab === "hazards" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("hazards")}>隐患</button>
                <button className={detailTab === "energy" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("energy")}>能耗</button>
              </div>

              {tenant360Loading ? <Tenant360Skeleton /> : null}

              {!tenant360Loading && detailTab === "profile" ? (
                <table className="data-table">
                  <tbody>
                    <DetailRow label="企业编码" value={detail.parkTenantCode} />
                    <DetailRow label="企业名称" value={detail.companyName} />
                    <DetailRow label="统一社会信用代码" value={fieldText(detail.unifiedCreditCode)} />
                    <DetailRow label="法人姓名" value={fieldText(detail.legalPerson)} />
                    {canViewLegalPersonId ? <DetailRow label="法人证件号" value={fieldText(maskTenantField(authUser, FIELD_LEGAL_PERSON_ID, detail.legalPersonId))} /> : null}
                    <DetailRow label="主联系人" value={fieldText(detail.contactName)} />
                    {canViewContactMobile ? <DetailRow label="联系电话" value={fieldText(maskTenantField(authUser, FIELD_CONTACT_MOBILE, detail.contactMobile))} /> : null}
                    <DetailRow label="联系邮箱" value={fieldText(detail.contactEmail)} />
                    <DetailRow label="行业" value={labelFor(industryItems, detail.industryCode)} />
                    <DetailRow label="租户类型" value={labelFor(typeItems, detail.tenantType)} />
                    <DetailRow label="风险等级" value={labelFor(riskItems, detail.riskLevel)} />
                    <DetailRow label="状态" value={labelFor(statusItems, detail.status)} />
                    <DetailRow label="来源" value={labelFor(sourceItems, detail.sourceType)} />
                    <DetailRow label="风险标签" value={(detail.riskTags ?? []).join("，") || "-"} />
                    <DetailRow label="入驻日期" value={fieldText(detail.checkInDate)} />
                    <DetailRow label="退园日期" value={fieldText(detail.checkOutDate)} />
                    <DetailRow label="经营范围" value={fieldText(detail.businessScope)} />
                    <DetailRow label="备注" value={fieldText(detail.remark)} />
                  </tbody>
                </table>
              ) : null}

              {!tenant360Loading && detailTab === "risk" ? (
                <section className="detail-stack">
                  <div className="task-item">
                    <h3 className="panel-title">风险信息</h3>
                    <PermissionButton permission={PARK_TENANT_PERMISSIONS.riskUpdate} type="button" onClick={openRiskChange}>
                      <AlertTriangle size={16} />
                      调整风险
                    </PermissionButton>
                  </div>
                  <table className="data-table">
                    <tbody>
                      <DetailRow label="当前风险等级" value={<DictBadge items={riskItems} value={detail.riskLevel} />} />
                      <DetailRow label="风险标签" value={<TagList tags={detail.riskTags} />} />
                    </tbody>
                  </table>

                  {showRiskForm ? (
                    <form className="form-stack" onSubmit={(event) => void submitRiskChange(event).catch((error: Error) => setMessage(error.message))}>
                      <h3 className="panel-title">风险变更</h3>
                      <SelectField label="风险等级" value={riskForm.riskLevel} onChange={(value) => setRiskFormValue(setRiskForm, "riskLevel", value)}>
                        <option value="">请选择风险等级</option>
                        {riskItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                      </SelectField>
                      <TextField label="风险标签" value={riskForm.riskTags} placeholder="多个标签用逗号分隔" onChange={(value) => setRiskFormValue(setRiskForm, "riskTags", value)} />
                      <TextAreaField label="变更原因" value={riskForm.reason} required onChange={(value) => setRiskFormValue(setRiskForm, "reason", value)} />
                      <button className="primary-button" type="submit">保存风险变更</button>
                      <button type="button" onClick={() => setShowRiskForm(false)}>取消</button>
                    </form>
                  ) : null}

                  <RiskLogTable riskLogs={riskLogs} riskItems={riskItems} />
                </section>
              ) : null}

              {!tenant360Loading && detailTab === "contacts" ? (
                <section className="detail-stack">
                  <div className="task-item">
                    <h3 className="panel-title">联系人</h3>
                    <PermissionButton permission={PARK_TENANT_CONTACT_PERMISSIONS.create} type="button" onClick={openContactCreate}>
                      <Plus size={16} />
                      新增联系人
                    </PermissionButton>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>姓名</th>
                        <th>角色</th>
                        <th>手机</th>
                        <th>邮箱</th>
                        <th>职位</th>
                        <th>标识</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {contacts.map((contact) => (
                        <tr key={contact.id}>
                          <td>{contact.contactName}</td>
                          <td>{labelFor(contactRoleItems, contact.contactRole)}</td>
                          <td>{canViewContactRowMobile ? fieldText(maskContactField(authUser, contact.mobile)) : "-"}</td>
                          <td>{canViewContactRowEmail ? fieldText(maskContactEmailField(authUser, contact.email)) : "-"}</td>
                          <td>{fieldText(contact.position)}</td>
                          <td>
                            <span className="data-table-actions">
                              {contact.isPrimary ? <span className="status-pill status-primary">主联系人</span> : null}
                              {contact.isEmergency ? <span className="status-pill status-warning">应急</span> : null}
                            </span>
                          </td>
                          <td><span className={`status-pill ${contact.status === 1 ? "status-success" : "status-muted"}`}>{contact.status === 1 ? "启用" : "停用"}</span></td>
                          <td>
                            <span className="data-table-actions">
                              {!contact.isPrimary ? (
                                <PermissionButton permission={PARK_TENANT_CONTACT_PERMISSIONS.update} title="设为主联系人" type="button" onClick={() => void setPrimaryContact(contact).catch((error: Error) => setMessage(error.message))}>
                                  <CheckCircle2 size={16} />
                                </PermissionButton>
                              ) : null}
                              <PermissionButton permission={PARK_TENANT_CONTACT_PERMISSIONS.update} title="编辑联系人" type="button" onClick={() => openContactEdit(contact)}>
                                <Edit3 size={16} />
                              </PermissionButton>
                              <PermissionButton permission={PARK_TENANT_CONTACT_PERMISSIONS.delete} title="删除联系人" type="button" onClick={() => void removeContact(contact).catch((error: Error) => setMessage(error.message))}>
                                <Trash2 size={16} />
                              </PermissionButton>
                            </span>
                          </td>
                        </tr>
                      ))}
                      {contacts.length === 0 ? <tr><td colSpan={8}>暂无联系人</td></tr> : null}
                    </tbody>
                  </table>
                </section>
              ) : null}

              {detailTab === "contacts" && showContactForm ? (
                <form className="form-stack" onSubmit={(event) => void submitContact(event).catch((error: Error) => setMessage(error.message))}>
                  <h3 className="panel-title">{editingContact ? "编辑联系人" : "新增联系人"}</h3>
                  <TextField label="联系人姓名" value={contactForm.contactName} required onChange={(value) => setContactFormValue(setContactForm, "contactName", value)} />
                  <SelectField label="联系人角色" value={contactForm.contactRole} onChange={(value) => setContactFormValue(setContactForm, "contactRole", value)}>
                    <option value="">请选择角色</option>
                    {contactRoleItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                  </SelectField>
                  {canEditContactRowMobile ? <TextField label="手机号" value={contactForm.mobile} onChange={(value) => setContactFormValue(setContactForm, "mobile", value)} /> : null}
                  {canEditContactRowEmail ? <TextField label="邮箱" value={contactForm.email} onChange={(value) => setContactFormValue(setContactForm, "email", value)} /> : null}
                  <TextField label="职位" value={contactForm.position} onChange={(value) => setContactFormValue(setContactForm, "position", value)} />
                  <SelectField label="状态" value={contactForm.status} onChange={(value) => setContactFormValue(setContactForm, "status", value)}>
                    <option value="1">启用</option>
                    <option value="0">停用</option>
                  </SelectField>
                  <CheckboxField label="主联系人" checked={contactForm.isPrimary} onChange={(value) => setContactFormBool(setContactForm, "isPrimary", value)} />
                  <CheckboxField label="应急联系人" checked={contactForm.isEmergency} onChange={(value) => setContactFormBool(setContactForm, "isEmergency", value)} />
                  <TextAreaField label="联系人备注" value={contactForm.remark} onChange={(value) => setContactFormValue(setContactForm, "remark", value)} />
                  <button className="primary-button" type="submit">保存联系人</button>
                  <button type="button" onClick={() => setShowContactForm(false)}>取消</button>
                </form>
              ) : null}

              {!tenant360Loading && detailTab === "qualifications" ? (
                <section className="detail-stack">
                  <div className="task-item">
                    <h3 className="panel-title">资质附件</h3>
                    <PermissionButton permission={PARK_TENANT_QUALIFICATION_PERMISSIONS.create} type="button" onClick={openQualificationCreate}>
                      <Plus size={16} />
                      新增资质
                    </PermissionButton>
                  </div>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>资质类型</th>
                        <th>资质名称</th>
                        <th>证书编号</th>
                        <th>有效期</th>
                        <th>附件</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {qualifications.map((qualification) => (
                        <tr key={qualification.id}>
                          <td>{labelFor(qualificationTypeItems, qualification.qualificationType)}</td>
                          <td>{qualification.qualificationName}</td>
                          <td>{canViewQualificationCertificateNo ? fieldText(maskQualificationField(authUser, FIELD_QUALIFICATION_CERTIFICATE_NO, qualification.certificateNo)) : "-"}</td>
                          <td>{formatDateRange(qualification.issueDate, qualification.expireDate)}</td>
                          <td>{canViewQualificationFileId && qualification.file ? qualification.file.originalName : "-"}</td>
                          <td><QualificationStatusBadge row={qualification} /></td>
                          <td>
                            <span className="data-table-actions">
                              {canViewQualificationFileId && qualification.file ? (
                                <>
                                  <PermissionButton permission={FILE_PERMISSIONS.download} title="预览附件" type="button" onClick={() => void downloadQualificationFile(qualification.file as FileRecord, true).catch((error: Error) => setMessage(error.message))}>
                                    <Eye size={16} />
                                  </PermissionButton>
                                  <PermissionButton permission={FILE_PERMISSIONS.download} title="下载附件" type="button" onClick={() => void downloadQualificationFile(qualification.file as FileRecord).catch((error: Error) => setMessage(error.message))}>
                                    <Download size={16} />
                                  </PermissionButton>
                                </>
                              ) : null}
                              <PermissionButton permission={PARK_TENANT_QUALIFICATION_PERMISSIONS.update} title="编辑资质" type="button" onClick={() => openQualificationEdit(qualification)}>
                                <Edit3 size={16} />
                              </PermissionButton>
                              <PermissionButton permission={PARK_TENANT_QUALIFICATION_PERMISSIONS.delete} title="删除资质" type="button" onClick={() => void removeQualification(qualification).catch((error: Error) => setMessage(error.message))}>
                                <Trash2 size={16} />
                              </PermissionButton>
                            </span>
                          </td>
                        </tr>
                      ))}
                      {qualifications.length === 0 ? <tr><td colSpan={7}>暂无资质附件</td></tr> : null}
                    </tbody>
                  </table>
                </section>
              ) : null}

              {detailTab === "qualifications" && showQualificationForm ? (
                <section className="detail-stack">
                  <PermissionGuard permission={FILE_PERMISSIONS.upload} fallback={<p className="muted-text">当前账号没有附件上传权限。</p>}>
                    {canEditQualificationFileId ? (
                      <form className="form-stack" onSubmit={(event) => void uploadQualificationFile(event).catch((error: Error) => setMessage(error.message))}>
                        <h3 className="panel-title">上传资质附件</h3>
                        <div className="field">
                          <label htmlFor="qualificationFile">附件文件</label>
                          <input id="qualificationFile" name="file" required type="file" />
                        </div>
                        <button className="primary-button" disabled={uploadingQualificationFile} type="submit">
                          <Upload size={16} />
                          {uploadingQualificationFile ? "上传中" : "上传附件"}
                        </button>
                        {qualificationForm.fileName ? <span className="status-pill">已选择：{qualificationForm.fileName}</span> : null}
                      </form>
                    ) : <p className="muted-text">当前账号没有资质附件字段编辑权限。</p>}
                  </PermissionGuard>
                  <form className="form-stack" onSubmit={(event) => void submitQualification(event).catch((error: Error) => setMessage(error.message))}>
                    <h3 className="panel-title">{editingQualification ? "编辑资质" : "新增资质"}</h3>
                    <SelectField label="资质类型" value={qualificationForm.qualificationType} onChange={(value) => setQualificationFormValue(setQualificationForm, "qualificationType", value)}>
                      <option value="">请选择资质类型</option>
                      {qualificationTypeItems.map((item) => <option key={item.id} value={item.itemValue}>{item.itemLabel}</option>)}
                    </SelectField>
                    <TextField label="资质名称" value={qualificationForm.qualificationName} required onChange={(value) => setQualificationFormValue(setQualificationForm, "qualificationName", value)} />
                    {canEditQualificationCertificateNo ? <TextField label="证书编号" value={qualificationForm.certificateNo} onChange={(value) => setQualificationFormValue(setQualificationForm, "certificateNo", value)} /> : null}
                    <DateField label="签发日期" value={qualificationForm.issueDate} onChange={(value) => setQualificationFormValue(setQualificationForm, "issueDate", value)} />
                    <DateField label="到期日期" value={qualificationForm.expireDate} onChange={(value) => setQualificationFormValue(setQualificationForm, "expireDate", value)} />
                    <SelectField label="状态" value={qualificationForm.status} onChange={(value) => setQualificationFormValue(setQualificationForm, "status", value)}>
                      <option value="1">启用</option>
                      <option value="0">停用</option>
                    </SelectField>
                    <TextAreaField label="资质备注" value={qualificationForm.remark} onChange={(value) => setQualificationFormValue(setQualificationForm, "remark", value)} />
                    <button className="primary-button" type="submit">保存资质</button>
                    <button type="button" onClick={() => setShowQualificationForm(false)}>取消</button>
                  </form>
                </section>
              ) : null}

              {!tenant360Loading && detailTab === "contracts" ? <EmptyState title="合同模块尚未开发" description={tenant360?.contracts.available ? "暂无合同数据" : "当前阶段仅预留合同入口，不展示假数据。"} /> : null}
              {!tenant360Loading && detailTab === "receivables" ? <EmptyState title="应收模块尚未开发" description={tenant360?.receivables.available ? "暂无应收数据" : "当前阶段仅预留应收入口，不展示假数据。"} /> : null}
              {!tenant360Loading && detailTab === "workorders" ? <EmptyState title="工单模块尚未开发" description={tenant360?.workorders.available ? "暂无工单数据" : "当前阶段仅预留工单入口，不展示假数据。"} /> : null}
              {!tenant360Loading && detailTab === "hazards" ? <EmptyState title="安全模块尚未开发" description={tenant360?.hazards.available ? "暂无隐患数据" : "当前阶段仅预留安全入口，不展示假数据。"} /> : null}
              {!tenant360Loading && detailTab === "energy" ? <EmptyState title="能耗模块尚未开发" description={tenant360?.energy.available ? "暂无能耗数据" : "当前阶段仅预留能耗入口，不展示假数据。"} /> : null}
            </section>
          ) : null}

          {message ? <p className="status-pill">{message}</p> : null}
        </main>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function TextField({ label, value, onChange, required, placeholder }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; placeholder?: string }) {
  const id = label;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} value={value} required={required} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = label;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TextAreaField({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  const id = label;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} value={value} required={required} rows={4} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function SelectField({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const id = label;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </div>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  const id = label;
  return (
    <label className="task-item" htmlFor={id}>
      <span>{label}</span>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value: string | null }) {
  const item = items.find((entry) => entry.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function TagList({ tags }: { tags: string[] | null | undefined }) {
  const values = tags ?? [];
  if (values.length === 0) {
    return <span>-</span>;
  }
  return (
    <span className="data-table-actions">
      {values.map((tag) => <span className="status-pill status-warning" key={tag}>{tag}</span>)}
    </span>
  );
}

function RiskLogTable({ riskLogs, riskItems }: { riskLogs: ParkTenantRiskLogRow[]; riskItems: DictItemRow[] }) {
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>变更时间</th>
          <th>变更前</th>
          <th>变更后</th>
          <th>风险标签</th>
          <th>原因</th>
          <th>操作人</th>
        </tr>
      </thead>
      <tbody>
        {riskLogs.map((log) => (
          <tr key={log.id}>
            <td>{formatDateTime(log.opTime)}</td>
            <td>{labelFor(riskItems, log.beforeRiskLevel)}</td>
            <td><DictBadge items={riskItems} value={log.afterRiskLevel} /></td>
            <td><TagList tags={log.afterRiskTags} /></td>
            <td>{log.reason}</td>
            <td>{fieldText(log.operatorName)}</td>
          </tr>
        ))}
        {riskLogs.length === 0 ? <tr><td colSpan={6}>暂无风险变更日志</td></tr> : null}
      </tbody>
    </table>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <section className="empty-state">
      <strong>{title}</strong>
      <p className="muted-text">{description}</p>
    </section>
  );
}

function Tenant360Skeleton() {
  return (
    <section className="skeleton-stack" aria-label="租户 360 加载中">
      <span className="skeleton-line skeleton-line-lg" />
      <span className="skeleton-line" />
      <span className="skeleton-line" />
      <span className="skeleton-line skeleton-line-sm" />
    </section>
  );
}

function QualificationStatusBadge({ row }: { row: ParkTenantQualificationRow }) {
  if (isExpired(row.expireDate)) {
    return <span className="status-pill status-danger">已过期</span>;
  }
  return <span className={`status-pill ${row.status === 1 ? "status-success" : "status-muted"}`}>{row.status === 1 ? "启用" : "停用"}</span>;
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value}</td>
    </tr>
  );
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <section className="page-content">
        <h1 className="panel-title">403</h1>
        <p className="muted-text">当前账号没有租户企业档案权限。</p>
      </section>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <section className="page-content module-denied">
        <h1 className="panel-title">模块未授权</h1>
        <p className="muted-text">当前租户未启用招商租赁模块。</p>
      </section>
    </main>
  );
}

function labelFor(items: DictItemRow[], value: string | null): string {
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value ?? "-";
}

function statusClass(tagType?: string | null): string {
  if (tagType === "success" || tagType === "warning" || tagType === "danger" || tagType === "primary" || tagType === "info") {
    return `status-${tagType}`;
  }
  return "status-muted";
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatDateRange(start: string | null, end: string | null): string {
  if (!start && !end) return "-";
  return `${start ?? "-"} 至 ${end ?? "-"}`;
}

function isExpired(value: string | null): boolean {
  if (!value) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expireDate = new Date(value);
  expireDate.setHours(0, 0, 0, 0);
  return expireDate.getTime() < today.getTime();
}

function fieldText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}

function splitTags(value: string): string[] {
  return [...new Set(value.split(/[,，]/u).map((item) => item.trim()).filter(Boolean))];
}

function maskTenantField(user: Parameters<typeof maskField>[0], fieldKey: string, value: unknown): unknown {
  return maskField(user, LEASING_MODULE, PARK_TENANT_ENTITY, fieldKey, value);
}

function maskContactField(user: Parameters<typeof maskField>[0], value: unknown): unknown {
  return maskField(user, LEASING_MODULE, PARK_TENANT_CONTACT_ENTITY, FIELD_CONTACT_ROW_MOBILE, value);
}

function maskContactEmailField(user: Parameters<typeof maskField>[0], value: unknown): unknown {
  return maskField(user, LEASING_MODULE, PARK_TENANT_CONTACT_ENTITY, FIELD_CONTACT_ROW_EMAIL, value);
}

function maskQualificationField(user: Parameters<typeof maskField>[0], fieldKey: string, value: unknown): unknown {
  return maskField(user, LEASING_MODULE, PARK_TENANT_QUALIFICATION_ENTITY, fieldKey, value);
}

function setFormValue(
  setForm: Dispatch<SetStateAction<ParkTenantFormState>>,
  key: keyof ParkTenantFormState,
  value: string
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function setContactFormValue(
  setContactForm: Dispatch<SetStateAction<ParkTenantContactFormState>>,
  key: keyof ParkTenantContactFormState,
  value: string
) {
  setContactForm((current) => ({ ...current, [key]: value }));
}

function setContactFormBool(
  setContactForm: Dispatch<SetStateAction<ParkTenantContactFormState>>,
  key: "isPrimary" | "isEmergency",
  value: boolean
) {
  setContactForm((current) => ({ ...current, [key]: value }));
}

function setRiskFormValue(
  setRiskForm: Dispatch<SetStateAction<ParkTenantRiskFormState>>,
  key: keyof ParkTenantRiskFormState,
  value: string
) {
  setRiskForm((current) => ({ ...current, [key]: value }));
}

function setQualificationFormValue(
  setQualificationForm: Dispatch<SetStateAction<ParkTenantQualificationFormState>>,
  key: keyof ParkTenantQualificationFormState,
  value: string
) {
  setQualificationForm((current) => ({ ...current, [key]: value }));
}
