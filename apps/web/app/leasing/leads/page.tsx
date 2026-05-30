"use client";
import {
  Card,
  DataTable,
  Drawer,
  DrawerActions,
  DrawerDetailGrid,
  DrawerDetailItem,
  DrawerFooter,
  DrawerForm,
  DrawerFormGrid,
  DrawerHeader,
  DrawerSection,
  DrawerTabButton,
  DrawerTabs
} from "@jinhu/ui";

import { Archive, Building2, Edit3, Eye, GitBranch, History, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { apiFormRequest, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const LEASING_LEAD_ENTITY = "leasing_lead";
const LEASING_QUOTE_ENTITY = "leasing_quote";
const LEASING_FOLLOW_ENTITY = "leasing_follow";
const FOLLOW_FILE_BIZ_TYPE = "leasing_follow";
const VISIT_FILE_BIZ_TYPE = "leasing_visit";
const FIELD_CONTACT_MOBILE = "contactMobile";
const FIELD_DEMAND_PRICE = "demandPrice";
const FIELD_QUOTE_PRICE = "quotePrice";
const FIELD_PROPERTY_FEE_PRICE = "propertyFeePrice";
const FIELD_FOLLOW_CONTENT = "content";
const LEAD_PERMISSIONS = {
  read: "leasing_lead:read",
  create: "leasing_lead:create",
  update: "leasing_lead:update",
  delete: "leasing_lead:delete",
  changeStatus: "leasing_lead:change_status",
  forceChangeStatus: "leasing_lead:force_change_status",
  confirmSign: "leasing_lead:confirm_sign",
  statusLog: "leasing_lead:status_log",
  convertToParkTenant: "leasing_lead:convert_to_park_tenant",
  moveToPool: "leasing_lead:move_to_pool"
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
const QUOTE_PERMISSIONS = {
  read: "leasing_quote:read",
  create: "leasing_quote:create",
  update: "leasing_quote:update",
  delete: "leasing_quote:delete",
  submit: "leasing_quote:submit",
  approve: "leasing_quote:approve",
  reject: "leasing_quote:reject",
  createContract: "leasing_quote:create_contract"
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
  content?: string | null;
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
  refPrice?: string | null;
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

interface LeasingQuoteApproveRecord {
  action: "submit" | "approve" | "reject";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
  priceWarning?: string | null;
}

interface LeasingQuoteRow {
  id: string;
  leadId: string;
  unitId: string;
  unit?: UnitOptionRow | null;
  quotePrice?: string | null;
  quotePeriod: string | null;
  freeRentMonths: string;
  depositMonths: string;
  paymentPeriod: string | null;
  propertyFeePrice: string;
  quoteStatus: string;
  approveRecords: LeasingQuoteApproveRecord[];
  submitTime: string | null;
  approveTime: string | null;
  approveBy: string | null;
  rejectReason: string | null;
  contractDraft?: {
    id: string;
    contractCode: string;
    contractName: string;
    status: string;
  } | null;
  remark: string | null;
  createTime: string;
  updateTime: string;
}

interface LeasingLeadStatusLogRow {
  id: string;
  leadId: string;
  beforeStatus: string;
  afterStatus: string;
  reason: string;
  operatorId: string | null;
  operatorName: string | null;
  opTime: string;
  remark: string | null;
  createTime: string;
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

interface QuoteFormState {
  unitId: string;
  quotePrice: string;
  quotePeriod: string;
  freeRentMonths: string;
  depositMonths: string;
  paymentPeriod: string;
  propertyFeePrice: string;
  remark: string;
}

interface StatusFormState {
  afterStatus: string;
  reason: string;
  lostReason: string;
  lostRemark: string;
}

interface ConvertParkTenantFormState {
  companyName: string;
  unifiedCreditCode: string;
  legalPerson: string;
  contactName: string;
  contactMobile: string;
  tenantType: string;
  industryCode: string;
  riskLevel: string;
  afterStatus: "78" | "keep";
  remark: string;
}

interface ParkTenantSummary {
  id: string;
  code: string | null;
  parkTenantCode: string;
  companyName: string;
  unifiedCreditCode: string | null;
  contactName: string | null;
  contactMobile?: string | null;
  tenantType: string | null;
  industryCode: string | null;
  riskLevel: string | null;
  status: string;
  sourceType: string;
}

interface ConvertParkTenantResult {
  lead_id: string;
  lead_code: string;
  park_tenant_id: string;
  created: boolean;
  status: string;
  park_tenant: ParkTenantSummary;
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

const emptyQuoteForm: QuoteFormState = {
  unitId: "",
  quotePrice: "",
  quotePeriod: "",
  freeRentMonths: "0",
  depositMonths: "0",
  paymentPeriod: "",
  propertyFeePrice: "0",
  remark: ""
};

const emptyStatusForm: StatusFormState = {
  afterStatus: "",
  reason: "",
  lostReason: "",
  lostRemark: ""
};

const emptyConvertForm: ConvertParkTenantFormState = {
  companyName: "",
  unifiedCreditCode: "",
  legalPerson: "",
  contactName: "",
  contactMobile: "",
  tenantType: "",
  industryCode: "",
  riskLevel: "",
  afterStatus: "78",
  remark: "由招商线索转入"
};

const ALLOWED_LEAD_STATUS_TRANSITIONS: Record<string, string[]> = {
  "10": ["20", "90", "91"],
  "20": ["30", "80", "91"],
  "30": ["40", "91"],
  "40": ["50", "91"],
  "50": ["60", "91"],
  "60": ["70", "91"],
  "70": ["75", "91"],
  "75": ["78"],
  "80": ["20", "91"]
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
  const [detailTab, setDetailTab] = useState<"profile" | "follows" | "visits" | "quotes" | "statusLogs">("profile");
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
  const [quotes, setQuotes] = useState<LeasingQuoteRow[]>([]);
  const [quoteForm, setQuoteForm] = useState<QuoteFormState>(emptyQuoteForm);
  const [editingQuote, setEditingQuote] = useState<LeasingQuoteRow | null>(null);
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteUnitOptions, setQuoteUnitOptions] = useState<UnitOptionRow[]>([]);
  const [quoteBuildingOptions, setQuoteBuildingOptions] = useState<Array<{ id: string; label: string }>>([]);
  const [quoteUnitFilters, setQuoteUnitFilters] = useState({ buildingId: "", rentalStatus: "", keyword: "" });
  const [statusLogs, setStatusLogs] = useState<LeasingLeadStatusLogRow[]>([]);
  const [statusForm, setStatusForm] = useState<StatusFormState>(emptyStatusForm);
  const [statusTarget, setStatusTarget] = useState<LeasingLeadRow | null>(null);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [convertForm, setConvertForm] = useState<ConvertParkTenantFormState>(emptyConvertForm);
  const [showConvertForm, setShowConvertForm] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [message, setMessage] = useState("");

  const canViewContactMobile = canViewField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE);
  const canEditContactMobile = canEditField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE);
  const canViewDemandPrice = canViewField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE);
  const canEditDemandPrice = canEditField(authUser, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE);
  const canViewQuotePrice = canViewField(authUser, LEASING_MODULE, LEASING_QUOTE_ENTITY, FIELD_QUOTE_PRICE);
  const canEditQuotePrice = canEditField(authUser, LEASING_MODULE, LEASING_QUOTE_ENTITY, FIELD_QUOTE_PRICE);
  const canViewPropertyFeePrice = canViewField(authUser, LEASING_MODULE, LEASING_QUOTE_ENTITY, FIELD_PROPERTY_FEE_PRICE);
  const canEditPropertyFeePrice = canEditField(authUser, LEASING_MODULE, LEASING_QUOTE_ENTITY, FIELD_PROPERTY_FEE_PRICE);
  const canViewFollowContent = canViewField(authUser, LEASING_MODULE, LEASING_FOLLOW_ENTITY, FIELD_FOLLOW_CONTENT);

  const statusItems = dicts.leasing_lead_status ?? [];
  const lostReasonItems = dicts.leasing_lost_reason ?? dicts.leasing_lead_lost_reason ?? [];
  const sourceItems = dicts.leasing_lead_source ?? [];
  const intentionItems = dicts.leasing_intention_level ?? [];
  const followTypeItems = dicts.leasing_follow_type ?? [];
  const industryItems = dicts.industry_code ?? [];
  const unitTypeItems = dicts.unit_usage_type ?? [];
  const rentalStatusItems = dicts.unit_rental_status ?? [];
  const paymentPeriodItems = dicts.leasing_payment_period ?? [];
  const quoteStatusItems = dicts.leasing_quote_status ?? [];
  const parkTenantTypeItems = dicts.park_tenant_type ?? [];
  const parkTenantRiskItems = dicts.park_tenant_risk_level ?? [];

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
      "leasing_lost_reason",
      "leasing_lead_lost_reason",
      "leasing_lead_source",
      "leasing_intention_level",
      "leasing_follow_type",
      "leasing_payment_period",
      "leasing_quote_status",
      "industry_code",
      "unit_usage_type",
      "unit_rental_status",
      "park_tenant_type",
      "park_tenant_risk_level"
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
    setQuotes([]);
    setStatusLogs([]);
    setShowFollowForm(false);
    setShowVisitForm(false);
    setShowQuoteForm(false);
    setShowStatusForm(false);
    setShowConvertForm(false);
    setEditingFollow(null);
    setEditingVisit(null);
    setEditingQuote(null);
    setStatusTarget(null);
    setFollowForm(emptyFollowForm);
    setVisitForm(emptyVisitForm);
    setQuoteForm(emptyQuoteForm);
    setStatusForm(emptyStatusForm);
    setConvertForm(emptyConvertForm);
    setMessage("");
    try {
      const response = await apiRequest<LeasingLeadRow>(`/leasing/leads/${row.id}`, { token: getAccessToken() });
      setDetail(response.data);
      await Promise.all([loadFollows(row.id), loadVisits(row.id), loadQuotes(row.id), loadStatusLogs(row.id), loadVisitUnits(), loadQuoteUnits()]);
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

  const loadQuotes = useCallback(async (leadId: string) => {
    const response = await apiRequest<LeasingQuoteRow[]>(`/leasing/leads/${leadId}/quotes`, {
      token: getAccessToken()
    });
    setQuotes(response.data);
    setQuoteUnitOptions((current) => mergeUnitOptions(current, response.data.map((quote) => quote.unit).filter(Boolean) as UnitOptionRow[]));
    setQuoteBuildingOptions((current) => mergeBuildingOptions(current, response.data.map((quote) => quote.unit).filter(Boolean) as UnitOptionRow[]));
  }, []);

  const loadStatusLogs = useCallback(async (leadId: string) => {
    const response = await apiRequest<PaginatedResult<LeasingLeadStatusLogRow>>(`/leasing/leads/${leadId}/status-logs?page=1&page_size=50`, {
      token: getAccessToken()
    });
    setStatusLogs(response.data.items);
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

  const loadQuoteUnits = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "100" });
    if (quoteUnitFilters.buildingId) params.set("building_id", quoteUnitFilters.buildingId);
    if (quoteUnitFilters.rentalStatus) params.set("rental_status", quoteUnitFilters.rentalStatus);
    if (quoteUnitFilters.keyword.trim()) params.set("keyword", quoteUnitFilters.keyword.trim());
    const response = await apiRequest<PaginatedResult<UnitOptionRow>>(`/park-units?${params.toString()}`, {
      token: getAccessToken()
    });
    setQuoteUnitOptions(response.data.items);
    setQuoteBuildingOptions((current) => mergeBuildingOptions(current, response.data.items));
  }, [quoteUnitFilters]);

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
      content: row.content ?? "",
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

  function openQuoteCreate() {
    setEditingQuote(null);
    setQuoteForm({
      ...emptyQuoteForm,
      paymentPeriod: paymentPeriodItems[0]?.itemValue ?? ""
    });
    setShowQuoteForm(true);
    void loadQuoteUnits().catch((error: Error) => setMessage(error.message));
    setMessage("");
  }

  function openQuoteEdit(row: LeasingQuoteRow) {
    setEditingQuote(row);
    setQuoteForm({
      unitId: row.unitId,
      quotePrice: typeof row.quotePrice === "string" ? row.quotePrice : "",
      quotePeriod: row.quotePeriod ?? "",
      freeRentMonths: row.freeRentMonths ?? "0",
      depositMonths: row.depositMonths ?? "0",
      paymentPeriod: row.paymentPeriod ?? "",
      propertyFeePrice: row.propertyFeePrice ?? "0",
      remark: row.remark ?? ""
    });
    setShowQuoteForm(true);
    if (row.unit) {
      setQuoteUnitOptions((current) => mergeUnitOptions(current, [row.unit].filter(Boolean) as UnitOptionRow[]));
      setQuoteBuildingOptions((current) => mergeBuildingOptions(current, [row.unit].filter(Boolean) as UnitOptionRow[]));
    }
    void loadQuoteUnits().catch((error: Error) => setMessage(error.message));
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

  async function moveToPool(row: LeasingLeadRow) {
    const reason = window.prompt(`请输入将线索「${row.customerName}」移入公海池的原因`);
    if (reason === null) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setMessage("移入公海池原因必填");
      return;
    }
    await apiRequest<LeasingLeadRow>(`/leasing/leads/${row.id}/move-to-pool`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-lead-move-to-pool"),
      body: { reason: trimmedReason }
    });
    setMessage("已移入公海池");
    await load(pageData.page);
    if (detail?.id === row.id) {
      await refreshDetail(row.id);
    }
  }

  function openConvertToParkTenant() {
    if (!detail) return;
    setConvertForm({
      ...emptyConvertForm,
      companyName: detail.customerName,
      contactName: detail.contactName,
      contactMobile: typeof detail.contactMobile === "string" ? detail.contactMobile : "",
      tenantType: parkTenantTypeItems[0]?.itemValue ?? "",
      industryCode: detail.industryCode ?? "",
      riskLevel: parkTenantRiskItems[0]?.itemValue ?? "",
      afterStatus: detail.status === "78" ? "keep" : "78"
    });
    setShowConvertForm(true);
    setMessage("");
  }

  async function submitConvertToParkTenant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const response = await apiRequest<ConvertParkTenantResult>(`/leasing/leads/${detail.id}/convert-to-park-tenant`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-lead-convert-to-park-tenant"),
      body: {
        company_name: convertForm.companyName.trim(),
        unified_credit_code: emptyToUndefined(convertForm.unifiedCreditCode),
        legal_person: emptyToUndefined(convertForm.legalPerson),
        contact_name: emptyToUndefined(convertForm.contactName),
        contact_mobile: emptyToUndefined(convertForm.contactMobile),
        tenant_type: emptyToUndefined(convertForm.tenantType),
        industry_code: emptyToUndefined(convertForm.industryCode),
        risk_level: emptyToUndefined(convertForm.riskLevel),
        after_status: convertForm.afterStatus,
        remark: emptyToUndefined(convertForm.remark)
      }
    });
    setShowConvertForm(false);
    setConvertForm(emptyConvertForm);
    setMessage(response.data.created ? "已创建并关联租户企业" : "已关联已有租户企业");
    await Promise.all([refreshDetail(detail.id), load(pageData.page)]);
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

  async function submitQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const body: Record<string, unknown> = {
      unitId: quoteForm.unitId,
      quotePeriod: emptyToUndefined(quoteForm.quotePeriod),
      freeRentMonths: numberOrUndefined(quoteForm.freeRentMonths) ?? 0,
      depositMonths: numberOrUndefined(quoteForm.depositMonths) ?? 0,
      paymentPeriod: emptyToUndefined(quoteForm.paymentPeriod),
      remark: emptyToUndefined(quoteForm.remark)
    };
    if (canEditQuotePrice) body.quotePrice = numberOrUndefined(quoteForm.quotePrice) ?? 0;
    if (canEditPropertyFeePrice) body.propertyFeePrice = numberOrUndefined(quoteForm.propertyFeePrice) ?? 0;
    await apiRequest<LeasingQuoteRow>(
      editingQuote ? `/leasing/leads/${detail.id}/quotes/${editingQuote.id}` : `/leasing/leads/${detail.id}/quotes`,
      {
        method: editingQuote ? "PUT" : "POST",
        token: getAccessToken(),
        idempotencyKey: createIdempotencyKey(editingQuote ? "leasing-quote-update" : "leasing-quote-create"),
        body
      }
    );
    setShowQuoteForm(false);
    setEditingQuote(null);
    setQuoteForm(emptyQuoteForm);
    setMessage("报价方案保存成功");
    await loadQuotes(detail.id);
  }

  async function removeQuote(row: LeasingQuoteRow) {
    if (!detail || !window.confirm("确认删除这条报价方案？")) return;
    await apiRequest<{ id: string }>(`/leasing/leads/${detail.id}/quotes/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-quote-delete")
    });
    setMessage("报价方案删除成功");
    await loadQuotes(detail.id);
  }

  async function submitQuoteApproval(row: LeasingQuoteRow) {
    if (!detail) return;
    await apiRequest<LeasingQuoteRow>(`/leasing/quotes/${row.id}/submit`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-quote-submit"),
      body: { opinion: "提交报价审批" }
    });
    setMessage("报价已提交审批");
    await loadQuotes(detail.id);
  }

  async function approveQuote(row: LeasingQuoteRow) {
    if (!detail) return;
    await apiRequest<LeasingQuoteRow>(`/leasing/quotes/${row.id}/approve`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-quote-approve"),
      body: { opinion: "审批通过" }
    });
    setMessage("报价审批通过");
    await Promise.all([loadQuotes(detail.id), refreshDetail(detail.id), load(pageData.page)]);
  }

  async function rejectQuote(row: LeasingQuoteRow) {
    if (!detail) return;
    const rejectReason = window.prompt("请输入驳回原因");
    if (!rejectReason?.trim()) {
      setMessage("驳回原因必填");
      return;
    }
    await apiRequest<LeasingQuoteRow>(`/leasing/quotes/${row.id}/reject`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-quote-reject"),
      body: { rejectReason: rejectReason.trim() }
    });
    setMessage("报价已驳回");
    await loadQuotes(detail.id);
  }

  async function createContractDraftFromQuote(row: LeasingQuoteRow) {
    if (!detail) return;
    if (row.quoteStatus !== "40") {
      setMessage("只有已通过的报价才能生成合同草稿");
      return;
    }
    if (row.contractDraft) {
      window.location.href = "/leasing/contracts";
      return;
    }
    if (!detail.parkTenantId) {
      setMessage("请先将线索转为租户企业，再生成合同草稿");
      return;
    }
    const contractName = `${detail.customerName}租赁合同`;
    await apiRequest<{ id: string; contractCode: string; contractName: string }>(`/leasing/quotes/${row.id}/create-contract-draft`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-quote-create-contract"),
      body: { contract_name: contractName }
    });
    setMessage("合同草稿已生成");
    await loadQuotes(detail.id);
    window.location.href = "/leasing/contracts";
  }

  function openStatusChange(row: LeasingLeadRow) {
    const allowedTargets = ALLOWED_LEAD_STATUS_TRANSITIONS[row.status] ?? [];
    setStatusTarget(row);
    setStatusForm({
      ...emptyStatusForm,
      afterStatus: allowedTargets[0] ?? ""
    });
    setShowStatusForm(true);
    setMessage("");
  }

  async function submitStatusChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!statusTarget) return;
    const body: Record<string, unknown> = {
      after_status: statusForm.afterStatus,
      reason: emptyToUndefined(statusForm.reason)
    };
    if (statusForm.afterStatus === "91") {
      body.lost_reason = statusForm.lostReason;
      body.lost_remark = emptyToUndefined(statusForm.lostRemark);
    }
    await apiRequest(`/leasing/leads/${statusTarget.id}/change-status`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-lead-change-status"),
      body
    });
    setShowStatusForm(false);
    setStatusTarget(null);
    setStatusForm(emptyStatusForm);
    setMessage("状态变更成功");
    await load(pageData.page);
    if (detail?.id === statusTarget.id) {
      await Promise.all([refreshDetail(statusTarget.id), loadStatusLogs(statusTarget.id)]);
    }
  }

  const statusSelectItems = statusTarget ? selectableLeadStatusItems(statusItems, statusTarget.status, authUser) : statusItems;
  const statusHint = statusTarget ? leadStatusTransitionHint(statusTarget.status, statusForm.afterStatus, authUser) : null;
  const closeDetailDrawer = () => {
    setDetail(null);
    setShowConvertForm(false);
  };

  return (
    <PermissionGuard module={LEASING_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={LEAD_PERMISSIONS.read} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
        <main className="page-container leasing-leads-page">
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

          <Card className="lead-table-card">
            <DataTable className="lead-list-table">
              <thead>
                <tr>
                  <th>线索 / 客户</th>
                  <th>联系人</th>
                  <th>需求信息</th>
                  <th>阶段</th>
                  <th>跟进计划</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.length === 0 ? (
                  <tr>
                    <td colSpan={6}>暂无线索数据</td>
                  </tr>
                ) : pageData.items.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <div className="lead-primary-cell">
                        <span className="lead-code">{row.leadCode}</span>
                        <strong title={row.customerName}>{row.customerName}</strong>
                        <span className="lead-meta-line">
                          <span>{labelFor(sourceItems, row.source)}</span>
                          <span>{labelFor(industryItems, row.industryCode)}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="lead-stacked-cell">
                        <strong title={row.contactName}>{row.contactName}</strong>
                        <span>{fieldText(authUser, canViewContactMobile, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE, row.contactMobile)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="lead-facts">
                        <span><em>面积</em>{formatArea(row.demandArea)}</span>
                        <span><em>预算</em>{moneyText(authUser, canViewDemandPrice, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_DEMAND_PRICE, row.demandPrice)}</span>
                      </div>
                    </td>
                    <td>
                      <div className="lead-stage-cell">
                        <DictBadge items={statusItems} value={row.status} />
                        <DictBadge items={intentionItems} value={row.intentionLevel} />
                        {row.isInPool ? <span className="status-pill status-warning">公海</span> : null}
                      </div>
                    </td>
                    <td>
                      <div className="lead-timeline-cell">
                        <span><em>跟进人</em>{row.followUserName ?? "-"}</span>
                        <span><em>最近</em>{formatDateTime(row.lastFollowTime)}</span>
                        <span><em>下次</em>{formatDateTime(row.nextFollowTime)}</span>
                      </div>
                    </td>
                    <td>
                      <span className="data-table-actions lead-row-actions">
                        <button aria-label="查看线索" className="primary-button row-action-button" title="查看" type="button" onClick={() => void openDetail(row)}>
                          <Eye size={16} />
                        </button>
                        <PermissionButton aria-label="编辑线索" className="primary-button row-action-button" permission={LEAD_PERMISSIONS.update} title="编辑" type="button" onClick={() => openEdit(row)}>
                          <Edit3 size={16} />
                        </PermissionButton>
                        <PermissionButton aria-label="线索状态流转" className="primary-button row-action-button" permission={LEAD_PERMISSIONS.changeStatus} title="状态流转" type="button" onClick={() => openStatusChange(row)}>
                          <GitBranch size={16} />
                        </PermissionButton>
                        {!row.isInPool ? (
                          <PermissionButton aria-label="移入公海池" className="primary-button row-action-button" permission={LEAD_PERMISSIONS.moveToPool} title="移入公海池" type="button" onClick={() => void moveToPool(row).catch((error: Error) => setMessage(error.message))}>
                            <Archive size={16} />
                          </PermissionButton>
                        ) : null}
                        <PermissionButton aria-label="删除线索" className="primary-button row-action-button row-action-danger" permission={LEAD_PERMISSIONS.delete} title="删除" type="button" onClick={() => void remove(row)}>
                          <Trash2 size={16} />
                        </PermissionButton>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
            <div className="system-toolbar">
              <span className="muted-text">共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
              <span className="page-actions">
                <button className="primary-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(pageData.page - 1)}>上一页</button>
                <button className="primary-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1)}>下一页</button>
              </span>
            </div>
          </Card>

          {showForm ? (
            <Drawer className="lead-form-drawer" size="md" onClose={() => setShowForm(false)}>
              <DrawerHeader
                eyebrow="招商线索"
                title={editing ? "编辑招商线索" : "新增招商线索"}
                description="维护客户、需求和跟进计划，线索编码留空时由系统生成。"
                closeIcon={<X size={18} />}
                onClose={() => setShowForm(false)}
              />
              <DrawerForm onSubmit={(event: FormEvent<HTMLFormElement>) => void submit(event)}>
                <DrawerSection title="客户信息">
                  <DrawerFormGrid>
                    <TextField label="线索编码" value={form.leadCode} onChange={(value) => setFormValue("leadCode", value, setForm)} placeholder="留空自动生成" />
                    <TextField label="客户名称" value={form.customerName} onChange={(value) => setFormValue("customerName", value, setForm)} required />
                    <TextField label="联系人" value={form.contactName} onChange={(value) => setFormValue("contactName", value, setForm)} required />
                    {canEditContactMobile ? <TextField label="联系电话" value={form.contactMobile} onChange={(value) => setFormValue("contactMobile", value, setForm)} required /> : null}
                    <TextField label="联系人邮箱" value={form.contactEmail} onChange={(value) => setFormValue("contactEmail", value, setForm)} type="email" />
                  </DrawerFormGrid>
                </DrawerSection>

                <DrawerSection title="来源与需求">
                  <DrawerFormGrid>
                    <SelectField label="来源" value={form.source} onChange={(value) => setFormValue("source", value, setForm)} options={sourceItems} />
                    <TextField label="渠道名称" value={form.channelName} onChange={(value) => setFormValue("channelName", value, setForm)} />
                    <SelectField label="行业" value={form.industryCode} onChange={(value) => setFormValue("industryCode", value, setForm)} options={industryItems} allowEmpty />
                    <TextField label="行业细分" value={form.industryDetail} onChange={(value) => setFormValue("industryDetail", value, setForm)} />
                    <NumberField label="需求面积" value={form.demandArea} onChange={(value) => setFormValue("demandArea", value, setForm)} />
                    {canEditDemandPrice ? <NumberField label="预算价格" value={form.demandPrice} onChange={(value) => setFormValue("demandPrice", value, setForm)} /> : null}
                    <SelectField label="需求房源类型" value={form.demandUnitType} onChange={(value) => setFormValue("demandUnitType", value, setForm)} options={unitTypeItems} allowEmpty />
                    <SelectField label="意向等级" value={form.intentionLevel} onChange={(value) => setFormValue("intentionLevel", value, setForm)} options={intentionItems} allowEmpty />
                  </DrawerFormGrid>
                </DrawerSection>

                <DrawerSection title="跟进计划">
                  <DrawerFormGrid>
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
                  </DrawerFormGrid>
                </DrawerSection>

                <DrawerSection title="备注">
                  <DrawerFormGrid single>
                    <TextAreaField label="备注说明" value={form.remark} onChange={(value) => setFormValue("remark", value, setForm)} />
                  </DrawerFormGrid>
                </DrawerSection>

                <DrawerFooter>
                  <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>取消</button>
                  <button className="primary-button" type="submit">保存线索</button>
                </DrawerFooter>
              </DrawerForm>
            </Drawer>
          ) : null}

          {detail ? (
            <Drawer className="lead-detail-drawer" size="lg" onClose={closeDetailDrawer}>
              <DrawerHeader
                eyebrow="招商线索详情"
                title={detail.customerName}
                description={`${detail.leadCode} · ${detail.contactName} · ${fieldText(authUser, canViewContactMobile, LEASING_MODULE, LEASING_LEAD_ENTITY, FIELD_CONTACT_MOBILE, detail.contactMobile)}`}
                closeIcon={<X size={18} />}
                onClose={closeDetailDrawer}
              />
              <DrawerActions>
                  <PermissionButton className="primary-button drawer-action-button" permission={LEAD_PERMISSIONS.changeStatus} type="button" onClick={() => openStatusChange(detail)}>
                    <GitBranch size={16} />
                    状态流转
                  </PermissionButton>
                  {!detail.isInPool ? (
                    <PermissionButton className="primary-button drawer-action-button" permission={LEAD_PERMISSIONS.moveToPool} type="button" onClick={() => void moveToPool(detail).catch((error: Error) => setMessage(error.message))}>
                      <Archive size={16} />
                      移入公海池
                    </PermissionButton>
                  ) : null}
                  {detail.parkTenantId ? (
                    <a className="primary-button drawer-action-button" href="/leasing/tenants">
                      <Building2 size={16} />
                      租户企业入口
                    </a>
                  ) : (
                    <PermissionButton className="primary-button drawer-action-button" permission={LEAD_PERMISSIONS.convertToParkTenant} type="button" onClick={openConvertToParkTenant}>
                      <Building2 size={16} />
                      转为租户企业
                    </PermissionButton>
                  )}
              </DrawerActions>
              <DrawerTabs>
                <DrawerTabButton active={detailTab === "profile"} onClick={() => setDetailTab("profile")}>基础信息</DrawerTabButton>
                <PermissionGuard permission={FOLLOW_PERMISSIONS.read}>
                  <DrawerTabButton active={detailTab === "follows"} onClick={() => setDetailTab("follows")}>跟进记录</DrawerTabButton>
                </PermissionGuard>
                <PermissionGuard permission={VISIT_PERMISSIONS.read}>
                  <DrawerTabButton active={detailTab === "visits"} onClick={() => setDetailTab("visits")}>看房记录</DrawerTabButton>
                </PermissionGuard>
                <PermissionGuard permission={QUOTE_PERMISSIONS.read}>
                  <DrawerTabButton active={detailTab === "quotes"} onClick={() => setDetailTab("quotes")}>报价方案</DrawerTabButton>
                </PermissionGuard>
                <PermissionGuard permission={LEAD_PERMISSIONS.statusLog}>
                  <DrawerTabButton active={detailTab === "statusLogs"} onClick={() => setDetailTab("statusLogs")}>
                    <History size={16} />
                    状态日志
                  </DrawerTabButton>
                </PermissionGuard>
              </DrawerTabs>
              {detailTab === "profile" ? (
                <>
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
                    <DetailItem label="流失原因" value={labelFor(lostReasonItems, detail.lostReason)} />
                    <DetailItem label="流失备注" value={detail.lostRemark ?? "-"} />
                    <DetailItem label="跟进人" value={detail.followUserName ?? "-"} />
                    <DetailItem label="是否公海" value={detail.isInPool ? "是" : "否"} />
                    <DetailItem label="关联租户企业" value={detail.parkTenantId ?? "未转化"} />
                    <DetailItem label="最近跟进" value={formatDateTime(detail.lastFollowTime)} />
                    <DetailItem label="下次跟进" value={formatDateTime(detail.nextFollowTime)} />
                    <DetailItem label="预计成交" value={detail.expectedCloseDate ?? "-"} />
                    <DetailItem label="备注" value={detail.remark ?? "-"} />
                  </DetailGrid>
                  {showConvertForm ? (
                    <PermissionGuard permission={LEAD_PERMISSIONS.convertToParkTenant} fallback={<p className="muted-text">当前账号没有线索转租户企业权限。</p>}>
                      <form className="form-stack" onSubmit={(event) => void submitConvertToParkTenant(event).catch((error: Error) => setMessage(error.message))}>
                        <h3>转为租户企业</h3>
                        <div className="system-grid">
                          <TextField label="企业名称" value={convertForm.companyName} onChange={(value) => setConvertFormValue("companyName", value, setConvertForm)} required />
                          <TextField label="统一社会信用代码" value={convertForm.unifiedCreditCode} onChange={(value) => setConvertFormValue("unifiedCreditCode", value, setConvertForm)} />
                          <TextField label="法定代表人" value={convertForm.legalPerson} onChange={(value) => setConvertFormValue("legalPerson", value, setConvertForm)} />
                          <TextField label="主联系人" value={convertForm.contactName} onChange={(value) => setConvertFormValue("contactName", value, setConvertForm)} />
                          <TextField label="联系电话" value={convertForm.contactMobile} onChange={(value) => setConvertFormValue("contactMobile", value, setConvertForm)} />
                          <SelectField label="租户类型" value={convertForm.tenantType} onChange={(value) => setConvertFormValue("tenantType", value, setConvertForm)} options={parkTenantTypeItems} allowEmpty />
                          <SelectField label="行业" value={convertForm.industryCode} onChange={(value) => setConvertFormValue("industryCode", value, setConvertForm)} options={industryItems} allowEmpty />
                          <SelectField label="风险等级" value={convertForm.riskLevel} onChange={(value) => setConvertFormValue("riskLevel", value, setConvertForm)} options={parkTenantRiskItems} allowEmpty />
                          <SelectField
                            label="线索状态处理"
                            value={convertForm.afterStatus}
                            onChange={(value) => setConvertForm((current) => ({ ...current, afterStatus: value === "keep" ? "keep" : "78" }))}
                            options={[
                              { id: "convert-status-moved-in", itemLabel: "转为已入驻", itemValue: "78", status: "enabled" },
                              { id: "convert-status-keep", itemLabel: "保持当前状态", itemValue: "keep", status: "enabled" }
                            ]}
                          />
                        </div>
                        <TextAreaField label="备注" value={convertForm.remark} onChange={(value) => setConvertFormValue("remark", value, setConvertForm)} />
                        <div className="page-actions">
                          <button className="primary-button" type="submit">确认转化</button>
                          <button className="primary-button" type="button" onClick={() => setShowConvertForm(false)}>取消</button>
                        </div>
                      </form>
                    </PermissionGuard>
                  ) : null}
                </>
              ) : null}
              {detailTab === "statusLogs" ? (
                <PermissionGuard permission={LEAD_PERMISSIONS.statusLog} fallback={<p className="muted-text">当前账号没有查看状态日志的权限。</p>}>
                  <section className="detail-stack">
                    <div className="task-item">
                      <h3>状态日志</h3>
                      <button className="primary-button" type="button" onClick={() => void loadStatusLogs(detail.id).catch((error: Error) => setMessage(error.message))}>
                        <RefreshCw size={16} />
                        刷新日志
                      </button>
                    </div>
                    <DataTable >
                      <thead>
                        <tr>
                          <th>变更时间</th>
                          <th>变更前</th>
                          <th>变更后</th>
                          <th>原因</th>
                          <th>操作人</th>
                          <th>备注</th>
                        </tr>
                      </thead>
                      <tbody>
                        {statusLogs.length === 0 ? <tr><td colSpan={6}>暂无状态变更日志</td></tr> : statusLogs.map((log) => (
                          <tr key={log.id}>
                            <td>{formatDateTime(log.opTime)}</td>
                            <td><DictBadge items={statusItems} value={log.beforeStatus} /></td>
                            <td><DictBadge items={statusItems} value={log.afterStatus} /></td>
                            <td>{log.reason}</td>
                            <td>{log.operatorName ?? "-"}</td>
                            <td>{log.remark ?? "-"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                  </section>
                </PermissionGuard>
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
                    <DataTable >
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
                            <td>{fieldText(authUser, canViewFollowContent, LEASING_MODULE, LEASING_FOLLOW_ENTITY, FIELD_FOLLOW_CONTENT, follow.content)}</td>
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
                    </DataTable>
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
                    <DataTable >
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
                    </DataTable>
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
              {detailTab === "quotes" ? (
                <PermissionGuard permission={QUOTE_PERMISSIONS.read} fallback={<p className="muted-text">当前账号没有查看报价方案的权限。</p>}>
                  <section className="detail-stack">
                    <div className="task-item">
                      <h3>报价方案</h3>
                      <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.create} type="button" onClick={openQuoteCreate}>
                        <Plus size={16} />
                        新增报价
                      </PermissionButton>
                    </div>
                    <DataTable >
                      <thead>
                        <tr>
                          <th>房源</th>
                          <th>报价单价</th>
                          <th>参考价</th>
                          <th>付款周期</th>
                          <th>免租期</th>
                          <th>押金</th>
                          <th>物业费</th>
                          <th>状态</th>
                          <th>审批记录</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quotes.length === 0 ? <tr><td colSpan={10}>暂无报价方案</td></tr> : quotes.map((quote) => (
                          <tr key={quote.id}>
                            <td>{unitDisplay(quoteUnitFor(quote, quoteUnitOptions))}</td>
                            <td>{moneyText(authUser, canViewQuotePrice, LEASING_MODULE, LEASING_QUOTE_ENTITY, FIELD_QUOTE_PRICE, quote.quotePrice)}</td>
                            <td>{formatCurrency(quoteUnitFor(quote, quoteUnitOptions).refPrice)}</td>
                            <td>{labelFor(paymentPeriodItems, quote.paymentPeriod)}</td>
                            <td>{formatMonthCount(quote.freeRentMonths)}</td>
                            <td>{formatMonthCount(quote.depositMonths)}</td>
                            <td>{moneyText(authUser, canViewPropertyFeePrice, LEASING_MODULE, LEASING_QUOTE_ENTITY, FIELD_PROPERTY_FEE_PRICE, quote.propertyFeePrice)}</td>
                            <td><DictBadge items={quoteStatusItems} value={quote.quoteStatus} /></td>
                            <td>{formatApproveRecords(quote.approveRecords)}</td>
                            <td>
                              <span className="data-table-actions">
                                <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.update} type="button" onClick={() => openQuoteEdit(quote)}>
                                  <Edit3 size={16} />
                                  编辑
                                </PermissionButton>
                                <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.submit} type="button" onClick={() => void submitQuoteApproval(quote).catch((error: Error) => setMessage(error.message))}>
                                  提交
                                </PermissionButton>
                                <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.approve} type="button" onClick={() => void approveQuote(quote).catch((error: Error) => setMessage(error.message))}>
                                  通过
                                </PermissionButton>
                                <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.reject} type="button" onClick={() => void rejectQuote(quote).catch((error: Error) => setMessage(error.message))}>
                                  驳回
                                </PermissionButton>
                                {quote.contractDraft ? (
                                  <a className="primary-button" href="/leasing/contracts">
                                    <Eye size={16} />
                                    查看合同
                                  </a>
                                ) : quote.quoteStatus === "40" ? (
                                  <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.createContract} type="button" onClick={() => void createContractDraftFromQuote(quote).catch((error: Error) => setMessage(error.message))}>
                                    <Building2 size={16} />
                                    生成合同草稿
                                  </PermissionButton>
                                ) : null}
                                <PermissionButton className="primary-button" permission={QUOTE_PERMISSIONS.delete} type="button" onClick={() => void removeQuote(quote).catch((error: Error) => setMessage(error.message))}>
                                  <Trash2 size={16} />
                                  删除
                                </PermissionButton>
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </DataTable>
                    {showQuoteForm ? (
                      <form className="form-stack" onSubmit={(event) => void submitQuote(event).catch((error: Error) => setMessage(error.message))}>
                        <h3>{editingQuote ? "编辑报价" : "新增报价"}</h3>
                        <QuoteUnitSelector
                          filters={quoteUnitFilters}
                          buildingOptions={quoteBuildingOptions}
                          rentalStatusItems={rentalStatusItems}
                          units={quoteUnitOptions}
                          selectedId={quoteForm.unitId}
                          onFilterChange={(key, value) => setQuoteUnitFilters((current) => ({ ...current, [key]: value }))}
                          onRefresh={() => void loadQuoteUnits().catch((error: Error) => setMessage(error.message))}
                          onSelect={(unitId) => setQuoteForm((current) => ({ ...current, unitId }))}
                        />
                        {quotePriceWarningText(quoteForm.quotePrice, quoteUnitOptions.find((unit) => unit.id === quoteForm.unitId)) ? (
                          <span className="status-pill status-warning">{quotePriceWarningText(quoteForm.quotePrice, quoteUnitOptions.find((unit) => unit.id === quoteForm.unitId))}</span>
                        ) : null}
                        <div className="system-grid">
                          {canEditQuotePrice ? <NumberField label="报价单价" value={quoteForm.quotePrice} onChange={(value) => setQuoteFormValue("quotePrice", value, setQuoteForm)} /> : null}
                          <TextField label="报价周期" value={quoteForm.quotePeriod} onChange={(value) => setQuoteFormValue("quotePeriod", value, setQuoteForm)} placeholder="例如 2026-06 至 2029-05" />
                          <NumberField label="免租期（月）" value={quoteForm.freeRentMonths} onChange={(value) => setQuoteFormValue("freeRentMonths", value, setQuoteForm)} />
                          <NumberField label="押金（月）" value={quoteForm.depositMonths} onChange={(value) => setQuoteFormValue("depositMonths", value, setQuoteForm)} />
                          <SelectField label="付款周期" value={quoteForm.paymentPeriod} onChange={(value) => setQuoteFormValue("paymentPeriod", value, setQuoteForm)} options={paymentPeriodItems} allowEmpty />
                          {canEditPropertyFeePrice ? <NumberField label="物业费单价" value={quoteForm.propertyFeePrice} onChange={(value) => setQuoteFormValue("propertyFeePrice", value, setQuoteForm)} /> : null}
                        </div>
                        <TextAreaField label="备注" value={quoteForm.remark} onChange={(value) => setQuoteFormValue("remark", value, setQuoteForm)} />
                        <div className="page-actions">
                          <button className="primary-button" type="submit">保存报价</button>
                          <button className="primary-button" type="button" onClick={() => setShowQuoteForm(false)}>取消</button>
                        </div>
                      </form>
                    ) : null}
                  </section>
                </PermissionGuard>
              ) : null}
            </Drawer>
          ) : null}

          {showStatusForm && statusTarget ? (
            <Drawer size="md" onClose={() => setShowStatusForm(false)}>
              <div className="system-toolbar">
                <h2>线索状态流转</h2>
                <button className="primary-button" type="button" onClick={() => setShowStatusForm(false)}>
                  <X size={16} />
                  关闭
                </button>
              </div>
              <form className="form-stack" onSubmit={(event) => void submitStatusChange(event).catch((error: Error) => setMessage(error.message))}>
                <DetailGrid>
                  <DetailItem label="线索编码" value={statusTarget.leadCode} />
                  <DetailItem label="客户名称" value={statusTarget.customerName} />
                  <DetailItem label="当前状态" value={<DictBadge items={statusItems} value={statusTarget.status} />} />
                  <DetailItem label="目标状态" value={<DictBadge items={statusItems} value={statusForm.afterStatus} />} />
                </DetailGrid>
                <SelectField
                  label="目标状态"
                  value={statusForm.afterStatus}
                  onChange={(value) => setStatusFormValue("afterStatus", value, setStatusForm)}
                  options={statusSelectItems}
                />
                {statusHint ? <span className="status-pill status-warning">{statusHint}</span> : null}
                <TextAreaField label="变更原因" value={statusForm.reason} onChange={(value) => setStatusFormValue("reason", value, setStatusForm)} />
                {statusForm.afterStatus === "91" ? (
                  <div className="system-grid">
                    <SelectField label="流失原因" value={statusForm.lostReason} onChange={(value) => setStatusFormValue("lostReason", value, setStatusForm)} options={lostReasonItems} />
                    <TextAreaField label="流失备注" value={statusForm.lostRemark} onChange={(value) => setStatusFormValue("lostRemark", value, setStatusForm)} />
                  </div>
                ) : null}
                <div className="page-actions">
                  <button className="primary-button" type="submit">确认变更</button>
                  <button className="primary-button" type="button" onClick={() => setShowStatusForm(false)}>取消</button>
                </div>
              </form>
            </Drawer>
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
  return <DrawerDetailGrid>{children}</DrawerDetailGrid>;
}

function DetailItem({ label, value }: { label: string; value: ReactNode }) {
  return <DrawerDetailItem label={label} value={value} />;
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <Card >
        <h1>403</h1>
        <p>当前账号没有访问招商线索的权限。</p>
      </Card>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <Card className=" module-denied">
        <h1>模块未授权</h1>
        <p>当前租户未启用招商租赁模块。</p>
      </Card>
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

function setQuoteFormValue(key: keyof QuoteFormState, value: string, setter: (updater: (current: QuoteFormState) => QuoteFormState) => void) {
  setter((current) => ({ ...current, [key]: value }));
}

function setStatusFormValue(key: keyof StatusFormState, value: string, setter: (updater: (current: StatusFormState) => StatusFormState) => void) {
  setter((current) => ({ ...current, [key]: value }));
}

function setConvertFormValue(
  key: keyof Omit<ConvertParkTenantFormState, "afterStatus">,
  value: string,
  setter: (updater: (current: ConvertParkTenantFormState) => ConvertParkTenantFormState) => void
) {
  setter((current) => ({ ...current, [key]: value }));
}

function selectableLeadStatusItems(items: DictItemRow[], currentStatus: string, user: ReturnType<typeof useAuthUser>): DictItemRow[] {
  const allowed = new Set(ALLOWED_LEAD_STATUS_TRANSITIONS[currentStatus] ?? []);
  const canForce = hasPermission(user, LEAD_PERMISSIONS.forceChangeStatus);
  const canConfirmSign = hasPermission(user, LEAD_PERMISSIONS.confirmSign);
  return items.filter((item) => {
    if (item.itemValue === currentStatus) return false;
    if (["75", "78"].includes(item.itemValue) && !canConfirmSign) return false;
    return canForce || allowed.has(item.itemValue);
  });
}

function leadStatusTransitionHint(currentStatus: string, targetStatus: string, user: ReturnType<typeof useAuthUser>): string | null {
  if (!targetStatus) return "请选择目标状态";
  const allowed = ALLOWED_LEAD_STATUS_TRANSITIONS[currentStatus] ?? [];
  if (targetStatus === "91") return "流失必须选择流失原因，后端会写状态日志和操作日志";
  if (targetStatus === "90") return "无效线索必须填写变更原因";
  if (["75", "78"].includes(targetStatus) && !hasPermission(user, LEAD_PERMISSIONS.confirmSign)) {
    return "已签约、已入驻需要确认签约权限";
  }
  if (!allowed.includes(targetStatus)) {
    return "当前为强制流转，必须填写变更原因且具备强制状态变更权限";
  }
  return null;
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
      <DataTable >
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
      </DataTable>
      <span className="status-pill">已选择：{selectedIds.length} 个房源</span>
    </section>
  );
}

function QuoteUnitSelector({
  filters,
  buildingOptions,
  rentalStatusItems,
  units,
  selectedId,
  onFilterChange,
  onRefresh,
  onSelect
}: {
  filters: { buildingId: string; rentalStatus: string; keyword: string };
  buildingOptions: Array<{ id: string; label: string }>;
  rentalStatusItems: DictItemRow[];
  units: UnitOptionRow[];
  selectedId: string;
  onFilterChange: (key: "buildingId" | "rentalStatus" | "keyword", value: string) => void;
  onRefresh: () => void;
  onSelect: (unitId: string) => void;
}) {
  return (
    <section className="detail-stack">
      <h3>报价房源</h3>
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
      <DataTable >
        <thead>
          <tr>
            <th>选择</th>
            <th>房源</th>
            <th>楼栋/楼层</th>
            <th>面积</th>
            <th>参考价</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {units.length === 0 ? <tr><td colSpan={6}>暂无可选房源</td></tr> : units.map((unit) => (
            <tr key={unit.id}>
              <td>
                <input type="radio" name="quote-unit" checked={selectedId === unit.id} onChange={() => onSelect(unit.id)} />
              </td>
              <td>{unitDisplay(unit)}</td>
              <td>{buildingFloorDisplay(unit)}</td>
              <td>{formatArea(unit.unitArea)}</td>
              <td>{formatCurrency(unit.refPrice)}</td>
              <td>{labelFor(rentalStatusItems, String(unit.rentalStatus))}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <span className="status-pill">已选择：{selectedId ? unitDisplay(units.find((unit) => unit.id === selectedId) ?? fallbackUnit(selectedId)) : "未选择"}</span>
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

function formatCurrency(value?: string | null): string {
  if (!value) return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(2) : value;
}

function formatMonthCount(value?: string | null): string {
  if (!value) return "-";
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${numeric.toFixed(2)} 月` : value;
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

function fallbackUnit(unitId: string): UnitOptionRow {
  return {
    id: unitId,
    code: null,
    unitCode: unitId,
    unitName: unitId,
    unitArea: "",
    refPrice: null,
    rentalStatus: 10,
    buildingId: "",
    floorId: ""
  };
}

function quoteUnitFor(quote: LeasingQuoteRow, units: UnitOptionRow[]): UnitOptionRow {
  return quote.unit ?? units.find((unit) => unit.id === quote.unitId) ?? fallbackUnit(quote.unitId);
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

function mergeUnitOptions(current: UnitOptionRow[], units: UnitOptionRow[]): UnitOptionRow[] {
  const next = new Map(current.map((unit) => [unit.id, unit]));
  for (const unit of units) {
    next.set(unit.id, unit);
  }
  return [...next.values()];
}

function quotePriceWarningText(quotePriceValue: string, unit?: UnitOptionRow): string | null {
  const quotePrice = Number(quotePriceValue);
  const refPrice = Number(unit?.refPrice);
  if (!Number.isFinite(quotePrice) || !Number.isFinite(refPrice) || refPrice <= 0) return null;
  if (quotePrice < refPrice * 0.8) return "报价低于房源参考价 20% 以上，需要运营负责人或高层重点审批";
  if (quotePrice < refPrice * 0.9) return "报价低于房源参考价 10% 以上，需要招商主管或运营负责人审批";
  return null;
}

function formatApproveRecords(records: LeasingQuoteApproveRecord[] | undefined): string {
  const items = records ?? [];
  if (items.length === 0) return "-";
  return items
    .slice(-2)
    .map((record) => `${approveActionLabel(record.action)} ${record.operatorName} ${formatDateTime(record.opTime)}`)
    .join("；");
}

function approveActionLabel(action: LeasingQuoteApproveRecord["action"]): string {
  switch (action) {
    case "submit":
      return "提交";
    case "approve":
      return "通过";
    case "reject":
      return "驳回";
    default:
      return action;
  }
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
