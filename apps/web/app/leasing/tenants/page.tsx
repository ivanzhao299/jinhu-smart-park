"use client";
import { DataTable, Drawer, Card, DrawerFooter, DrawerForm, DrawerFormGrid, DrawerHeader } from "@jinhu/ui";

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
const LEASING_CONTRACT_ENTITY = "leasing_contract";
const LEASING_RECEIVABLE_ENTITY = "leasing_receivable";
const LEASING_PAYMENT_ENTITY = "leasing_payment";
const LEASING_INVOICE_ENTITY = "leasing_invoice";
const LEASING_CHECKOUT_ENTITY = "leasing_checkout";
const LEASING_REFUND_ENTITY = "leasing_refund";
const WORKORDER_MODULE = "workorder";
const WORKORDER_ENTITY = "work_order";
const SAFETY_MODULE = "safety";
const SAFETY_HAZARD_ENTITY = "safety_hazard";
const FIELD_LEGAL_PERSON_ID = "legalPersonId";
const FIELD_CONTACT_MOBILE = "contactMobile";
const FIELD_CONTACT_ROW_MOBILE = "mobile";
const FIELD_CONTACT_ROW_EMAIL = "email";
const FIELD_QUALIFICATION_CERTIFICATE_NO = "certificateNo";
const FIELD_QUALIFICATION_FILE_ID = "fileId";
const FIELD_CONTRACT_TOTAL_AMOUNT = "totalAmount";
const FIELD_AMOUNT_DUE = "amountDue";
const FIELD_AMOUNT_PAID = "amountPaid";
const FIELD_AMOUNT_REMAIN = "amountRemain";
const FIELD_OVERDUE_AMOUNT = "overdueAmount";
const FIELD_PAY_AMOUNT = "payAmount";
const FIELD_UNAPPLIED_AMOUNT = "unappliedAmount";
const FIELD_INVOICE_AMOUNT = "amount";
const FIELD_CHECKOUT_REFUND_AMOUNT = "refundAmount";
const FIELD_CHECKOUT_TENANT_DUE = "amountDueFromTenant";
const FIELD_REFUND_AMOUNT = "refundAmount";
const FIELD_WORKORDER_REPORTER_MOBILE = "reporterMobile";
const FIELD_HAZARD_DESCRIPTION = "description";
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

interface Tenant360ContractRow {
  id: string;
  contract_code: string;
  contract_name: string;
  start_date: string | null;
  end_date: string | null;
  total_amount?: string | null;
  status: string;
}

interface Tenant360ContractsNode {
  available: boolean;
  items: Tenant360ContractRow[];
  summary?: {
    contract_count: number;
    active_contract_count: number;
  } | null;
}

interface Tenant360ReceivableRow {
  id: string;
  ar_code: string;
  contract_id: string | null;
  contract_code: string | null;
  fee_type: string;
  period_start: string;
  period_end: string;
  due_date: string;
  amount_due?: string | null;
  amount_paid?: string | null;
  amount_waived?: string | null;
  amount_remain?: string | null;
  late_fee?: string | null;
  overdue_days: number;
  invoice_status: string;
  status: string;
}

interface Tenant360ReceivablesNode {
  available: boolean;
  summary?: {
    total_amount_due?: string | null;
    total_amount_paid?: string | null;
    total_amount_remain?: string | null;
    overdue_amount?: string | null;
    overdue_count: number;
  } | null;
  recent_items: Tenant360ReceivableRow[];
}

interface Tenant360PaymentRow {
  id: string;
  pay_code: string;
  pay_time: string;
  pay_method: string;
  pay_amount?: string | null;
  unapplied_amount?: string | null;
  payer_name: string | null;
  status: string;
}

interface Tenant360PaymentsNode {
  available: boolean;
  summary?: {
    total_payment_amount?: string | null;
    unapplied_amount?: string | null;
  } | null;
  recent_items: Tenant360PaymentRow[];
}

interface Tenant360InvoiceRow {
  id: string;
  invoice_code: string;
  invoice_type: string;
  invoice_no: string | null;
  invoice_date: string;
  amount?: string | null;
  status: string;
}

interface Tenant360InvoicesNode {
  available: boolean;
  summary?: {
    invoice_count: number;
    invoice_amount?: string | null;
  } | null;
  recent_items: Tenant360InvoiceRow[];
}

interface Tenant360ContractChangeRow {
  id: string;
  change_code: string;
  contract_id: string;
  contract_code: string | null;
  change_type: string;
  effective_date: string;
  receivable_policy: string;
  status: string;
  update_time: string;
}

interface Tenant360ContractChangesNode {
  available: boolean;
  summary?: {
    pending_count: number;
    effective_count: number;
  } | null;
  recent_items: Tenant360ContractChangeRow[];
}

interface Tenant360CheckoutRow {
  id: string;
  checkout_code: string;
  contract_id: string;
  contract_code: string | null;
  checkout_type: string;
  planned_checkout_date: string;
  actual_checkout_date: string | null;
  release_unit_status: string;
  settlement_status: string;
  status: string;
  refund_amount?: string | null;
  amount_due_from_tenant?: string | null;
  update_time: string;
}

interface Tenant360CheckoutsNode {
  available: boolean;
  summary?: {
    pending_count: number;
    completed_count: number;
  } | null;
  recent_items: Tenant360CheckoutRow[];
}

interface Tenant360RefundRow {
  id: string;
  refund_code: string;
  checkout_id: string;
  checkout_code: string | null;
  contract_id: string;
  contract_code: string | null;
  refund_amount?: string | null;
  refund_method: string;
  refund_time: string;
  receiver_name: string | null;
  status: string;
}

interface Tenant360RefundsNode {
  available: boolean;
  summary?: {
    refund_count: number;
    refund_amount?: string | null;
  } | null;
  recent_items: Tenant360RefundRow[];
}

interface Tenant360WorkOrderRow {
  id: string;
  wo_code: string;
  title: string;
  wo_type: string;
  priority: string;
  urgency: string | null;
  status: string;
  location: string | null;
  reporter_name: string | null;
  reporter_mobile?: string | null;
  assignee_name: string | null;
  overdue_flag: boolean;
  create_time: string;
  update_time: string;
}

interface Tenant360WorkordersNode {
  available: boolean;
  summary?: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    avg_satisfaction: number;
  } | null;
  recent_items: Tenant360WorkOrderRow[];
}

interface Tenant360HazardRow {
  id: string;
  hazard_code: string;
  title: string;
  hazard_type: string | null;
  risk_level: string | null;
  source_type: string;
  status: string;
  location: string;
  description?: string | null;
  rectify_user_name: string | null;
  rectify_deadline: string | null;
  overdue_flag: boolean;
  update_time: string;
}

interface Tenant360HazardsNode {
  available: boolean;
  summary?: {
    total_count: number;
    open_count: number;
    overdue_count: number;
    major_count: number;
    closed_count: number;
  } | null;
  recent_items: Tenant360HazardRow[];
}

interface Tenant360EmergencyRow {
  id: string;
  emergency_code: string;
  title: string;
  incident_type: string;
  severity_level: string;
  response_level: string | null;
  status: string;
  location: string;
  reporter_name: string | null;
  report_time: string;
  update_time: string;
}

interface Tenant360EmergencyNode {
  available: boolean;
  summary?: {
    total_count: number;
    open_count: number;
    closed_count: number;
    major_count: number;
  } | null;
  recent_items: Tenant360EmergencyRow[];
}

interface Tenant360WorkPermitRow {
  id: string;
  permit_code: string;
  permit_type: string;
  risk_level: string;
  status: string;
  location: string;
  apply_user_name: string | null;
  contractor_name: string | null;
  monitor_user_name: string | null;
  time_start: string;
  time_end: string;
  violation_count: number;
  update_time: string;
}

interface Tenant360WorkPermitsNode {
  available: boolean;
  summary?: {
    total_count: number;
    in_progress_count: number;
    violation_count: number;
    closed_count: number;
  } | null;
  recent_items: Tenant360WorkPermitRow[];
}

interface Tenant360DeviceRow {
  id: string;
  device_code: string;
  device_name: string;
  device_type: string;
  online_status: string;
  status: string;
  location: string | null;
  last_data_time: string | null;
}

interface Tenant360DeviceAlertRow {
  id: string;
  alert_code: string;
  alert_title: string;
  alert_level: string;
  status: string;
  device_id: string;
  device_code: string;
  device_name: string;
  metric_code: string;
  trigger_value: string | null;
  last_trigger_time: string;
}

interface Tenant360DevicesNode {
  available: boolean;
  summary?: {
    device_count: number;
    online_count: number;
    active_alert_count: number;
  } | null;
  recent_devices: Tenant360DeviceRow[];
  recent_alerts: Tenant360DeviceAlertRow[];
}

interface ParkTenant360View {
  profile: ParkTenantRow;
  contacts: ParkTenantContactRow[];
  qualifications: ParkTenantQualificationRow[];
  riskLogs: ParkTenantRiskLogRow[];
  relatedUnits: unknown[];
  contracts: Tenant360ContractsNode;
  receivables: Tenant360ReceivablesNode;
  payments: Tenant360PaymentsNode;
  invoices: Tenant360InvoicesNode;
  contract_changes: Tenant360ContractChangesNode;
  checkouts: Tenant360CheckoutsNode;
  refunds: Tenant360RefundsNode;
  workorders: Tenant360WorkordersNode;
  hazards: Tenant360HazardsNode;
  emergency: Tenant360EmergencyNode;
  work_permits: Tenant360WorkPermitsNode;
  devices: Tenant360DevicesNode;
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
  const [detailTab, setDetailTab] = useState<
    | "profile"
    | "risk"
    | "contacts"
    | "qualifications"
    | "contracts"
    | "receivables"
    | "payments"
    | "invoices"
    | "contract_changes"
    | "checkouts"
    | "refunds"
    | "workorders"
    | "hazards"
    | "emergency"
    | "work_permits"
    | "devices"
    | "energy"
  >("profile");
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
  const canViewContractTotalAmount = canViewField(authUser, LEASING_MODULE, LEASING_CONTRACT_ENTITY, FIELD_CONTRACT_TOTAL_AMOUNT);
  const canViewReceivableAmountDue = canViewField(authUser, LEASING_MODULE, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_DUE);
  const canViewReceivableAmountPaid = canViewField(authUser, LEASING_MODULE, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_PAID);
  const canViewReceivableAmountRemain = canViewField(authUser, LEASING_MODULE, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_REMAIN);
  const canViewReceivableOverdueAmount = canViewField(authUser, LEASING_MODULE, LEASING_RECEIVABLE_ENTITY, FIELD_OVERDUE_AMOUNT);
  const canViewPaymentAmount = canViewField(authUser, LEASING_MODULE, LEASING_PAYMENT_ENTITY, FIELD_PAY_AMOUNT);
  const canViewPaymentUnappliedAmount = canViewField(authUser, LEASING_MODULE, LEASING_PAYMENT_ENTITY, FIELD_UNAPPLIED_AMOUNT);
  const canViewInvoiceAmount = canViewField(authUser, LEASING_MODULE, LEASING_INVOICE_ENTITY, FIELD_INVOICE_AMOUNT);
  const canViewCheckoutRefundAmount = canViewField(authUser, LEASING_MODULE, LEASING_CHECKOUT_ENTITY, FIELD_CHECKOUT_REFUND_AMOUNT);
  const canViewCheckoutTenantDue = canViewField(authUser, LEASING_MODULE, LEASING_CHECKOUT_ENTITY, FIELD_CHECKOUT_TENANT_DUE);
  const canViewRefundAmount = canViewField(authUser, LEASING_MODULE, LEASING_REFUND_ENTITY, FIELD_REFUND_AMOUNT);
  const canViewWorkOrderReporterMobile = canViewField(authUser, WORKORDER_MODULE, WORKORDER_ENTITY, FIELD_WORKORDER_REPORTER_MOBILE);
  const canViewHazardDescription = canViewField(authUser, SAFETY_MODULE, SAFETY_HAZARD_ENTITY, FIELD_HAZARD_DESCRIPTION);

  const statusItems = dicts.park_tenant_status ?? [];
  const typeItems = dicts.park_tenant_type ?? [];
  const riskItems = dicts.park_tenant_risk_level ?? [];
  const industryItems = dicts.industry_code ?? [];
  const sourceItems = dicts.park_tenant_source_type ?? [];
  const contactRoleItems = dicts.park_tenant_contact_role ?? [];
  const qualificationTypeItems = dicts.park_tenant_qualification_type ?? [];
  const contractStatusItems = dicts.leasing_contract_status ?? [];
  const feeTypeItems = dicts.leasing_fee_type ?? [];
  const receivableStatusItems = dicts.leasing_receivable_status ?? [];
  const invoiceStatusItems = dicts.leasing_invoice_status ?? [];
  const paymentMethodItems = dicts.leasing_payment_method ?? [];
  const paymentStatusItems = dicts.leasing_payment_status ?? [];
  const invoiceTypeItems = dicts.leasing_invoice_type ?? [];
  const contractChangeTypeItems = dicts.leasing_contract_change_type ?? [];
  const contractChangeStatusItems = dicts.leasing_contract_change_status ?? [];
  const receivablePolicyItems = dicts.leasing_receivable_adjust_policy ?? [];
  const checkoutTypeItems = dicts.leasing_checkout_type ?? [];
  const checkoutStatusItems = dicts.leasing_checkout_status ?? [];
  const settlementStatusItems = dicts.leasing_settlement_status ?? [];
  const releaseStatusItems = dicts.leasing_release_unit_status ?? [];
  const refundMethodItems = dicts.leasing_refund_method ?? [];
  const refundStatusItems = dicts.leasing_refund_status ?? [];
  const workOrderStatusItems = dicts.workorder_status ?? [];
  const workOrderTypeItems = dicts.workorder_type ?? [];
  const workOrderPriorityItems = dicts.workorder_priority ?? [];
  const hazardStatusItems = dicts.safety_hazard_status ?? [];
  const hazardTypeItems = dicts.safety_hazard_type ?? [];
  const hazardRiskItems = dicts.safety_risk_level ?? [];
  const hazardSourceItems = dicts.safety_hazard_source_type ?? [];
  const emergencyStatusItems = dicts.safety_emergency_status ?? [];
  const emergencyTypeItems = dicts.safety_emergency_incident_type ?? [];
  const emergencySeverityItems = dicts.safety_emergency_severity ?? [];
  const emergencyResponseItems = dicts.safety_emergency_response_level ?? [];
  const workPermitStatusItems = dicts.safety_work_permit_status ?? [];
  const workPermitTypeItems = dicts.safety_work_permit_type ?? [];
  const workPermitRiskItems = dicts.safety_risk_level ?? [];
  const iotDeviceTypeItems = dicts.iot_device_type ?? [];
  const iotDeviceStatusItems = dicts.iot_device_status ?? [];
  const iotAlertLevelItems = dicts.iot_alert_level ?? [];
  const iotAlertStatusItems = dicts.iot_alert_status ?? [];

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
      "park_tenant_qualification_type",
      "leasing_contract_status",
      "leasing_fee_type",
      "leasing_receivable_status",
      "leasing_invoice_status",
      "leasing_payment_method",
      "leasing_payment_status",
      "leasing_invoice_type",
      "leasing_contract_change_type",
      "leasing_contract_change_status",
      "leasing_receivable_adjust_policy",
      "leasing_checkout_type",
      "leasing_checkout_status",
      "leasing_settlement_status",
      "leasing_release_unit_status",
      "leasing_refund_method",
      "leasing_refund_status",
      "workorder_status",
      "workorder_type",
      "workorder_priority",
      "safety_hazard_status",
      "safety_hazard_type",
      "safety_risk_level",
      "safety_hazard_source_type",
      "safety_emergency_status",
      "safety_emergency_incident_type",
      "safety_emergency_severity",
      "safety_emergency_response_level",
      "safety_work_permit_status",
      "safety_work_permit_type",
      "iot_device_type",
      "iot_device_status",
      "iot_alert_level",
      "iot_alert_status"
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

  function openContractDetail(contract: Tenant360ContractRow) {
    window.sessionStorage.setItem("leasingContractFocusId", contract.id);
    window.location.href = "/leasing/contracts";
  }

  function openWorkOrderDetail(workOrder: Tenant360WorkOrderRow) {
    window.location.href = `/workorders/${workOrder.id}`;
  }

  function openHazardDetail(hazard: Tenant360HazardRow) {
    window.location.href = `/safety/hazards?hazard_id=${encodeURIComponent(hazard.id)}`;
  }

  function openEmergencyDetail(row: Tenant360EmergencyRow) {
    window.location.href = `/safety/emergencies?emergency_id=${encodeURIComponent(row.id)}`;
  }

  function openWorkPermitDetail(row: Tenant360WorkPermitRow) {
    window.location.href = `/safety/work-permits?permit_id=${encodeURIComponent(row.id)}`;
  }

  function openDeviceDetail(row: Tenant360DeviceRow) {
    window.location.href = `/iot/devices/${row.id}`;
  }

  function openIotAlert(row: Tenant360DeviceAlertRow) {
    window.location.href = `/iot/alerts?device_id=${encodeURIComponent(row.device_id)}`;
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
              <button className="secondary-button" type="button" onClick={() => void load(pageData.page).catch((error: Error) => setMessage(error.message))}>
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

          <Card className=" table-scroll">
            <DataTable >
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
            </DataTable>
            <div className="task-item">
              <span>共 {pageData.total} 条，第 {pageData.page} / {totalPages} 页</span>
              <span className="pagination-actions">
                <button className="pagination-button" type="button" disabled={pageData.page <= 1} onClick={() => void load(Math.max(1, pageData.page - 1)).catch((error: Error) => setMessage(error.message))}>上一页</button>
                <button className="pagination-button" type="button" disabled={pageData.page >= totalPages} onClick={() => void load(pageData.page + 1).catch((error: Error) => setMessage(error.message))}>下一页</button>
              </span>
            </div>
          </Card>

          {showForm ? (
            <Drawer size="lg" onClose={() => setShowForm(false)}>
              <DrawerHeader
                eyebrow="招商租赁"
                title={editing ? "编辑租户企业" : "新增租户企业"}
                description="维护租户企业的基础档案、联系信息与风险标签。"
                onClose={() => setShowForm(false)}
                closeIcon={<X size={18} />}
              />
              <DrawerForm onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
                <DrawerFormGrid>
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
                </DrawerFormGrid>
                <DrawerFormGrid single>
                  <TextAreaField label="经营范围" value={form.businessScope} onChange={(value) => setFormValue(setForm, "businessScope", value)} />
                  <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue(setForm, "remark", value)} />
                </DrawerFormGrid>
                <DrawerFooter>
                  <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>取消</button>
                  <button className="primary-button" type="submit">保存</button>
                </DrawerFooter>
              </DrawerForm>
            </Drawer>
          ) : null}

          {detail ? (
            <Drawer size="lg" onClose={() => setDetail(null)}>
              <DrawerHeader
                eyebrow="招商租赁"
                title="租户 360"
                description={detail.companyName}
                onClose={() => setDetail(null)}
                closeIcon={<X size={18} />}
              />
              <div className="system-tabs">
                <button className={detailTab === "profile" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("profile")}>基础信息</button>
                <button className={detailTab === "risk" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("risk")}>风险信息</button>
                <button className={detailTab === "contacts" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("contacts")}>联系人</button>
                <button className={detailTab === "qualifications" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("qualifications")}>资质附件</button>
                <button className={detailTab === "contracts" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("contracts")}>合同</button>
                <button className={detailTab === "receivables" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("receivables")}>应收</button>
                <button className={detailTab === "payments" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("payments")}>收款</button>
                <button className={detailTab === "invoices" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("invoices")}>发票</button>
                <button className={detailTab === "contract_changes" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("contract_changes")}>合同变更</button>
                <button className={detailTab === "checkouts" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("checkouts")}>退租记录</button>
                <button className={detailTab === "refunds" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("refunds")}>退款记录</button>
                <button className={detailTab === "workorders" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("workorders")}>工单</button>
                <button className={detailTab === "hazards" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("hazards")}>隐患</button>
                <button className={detailTab === "emergency" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("emergency")}>应急事件</button>
                <button className={detailTab === "work_permits" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("work_permits")}>作业许可</button>
                <button className={detailTab === "devices" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("devices")}>设备</button>
                <button className={detailTab === "energy" ? "primary-button" : undefined} type="button" onClick={() => setDetailTab("energy")}>能耗</button>
              </div>

              {tenant360Loading ? <Tenant360Skeleton /> : null}

              {!tenant360Loading && detailTab === "profile" ? (
                <DataTable >
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
                </DataTable>
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
                  <DataTable >
                    <tbody>
                      <DetailRow label="当前风险等级" value={<DictBadge items={riskItems} value={detail.riskLevel} />} />
                      <DetailRow label="风险标签" value={<TagList tags={detail.riskTags} />} />
                    </tbody>
                  </DataTable>

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
                      <button className="secondary-button" type="button" onClick={() => setShowRiskForm(false)}>取消</button>
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
                  <DataTable >
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
                  </DataTable>
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
                  <button className="secondary-button" type="button" onClick={() => setShowContactForm(false)}>取消</button>
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
                  <DataTable >
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
                  </DataTable>
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
                    <button className="secondary-button" type="button" onClick={() => setShowQualificationForm(false)}>取消</button>
                  </form>
                </section>
              ) : null}

              {!tenant360Loading && detailTab === "contracts" ? (
                <Tenant360ContractsTable
                  contracts={tenant360?.contracts}
                  statusItems={contractStatusItems}
                  authUser={authUser}
                  canViewTotalAmount={canViewContractTotalAmount}
                  onOpenContract={openContractDetail}
                />
              ) : null}
              {!tenant360Loading && detailTab === "receivables" ? (
                <Tenant360ReceivablesPanel
                  receivables={tenant360?.receivables}
                  feeTypeItems={feeTypeItems}
                  receivableStatusItems={receivableStatusItems}
                  invoiceStatusItems={invoiceStatusItems}
                  authUser={authUser}
                  visibility={{
                    amountDue: canViewReceivableAmountDue,
                    amountPaid: canViewReceivableAmountPaid,
                    amountRemain: canViewReceivableAmountRemain,
                    overdueAmount: canViewReceivableOverdueAmount
                  }}
                />
              ) : null}
              {!tenant360Loading && detailTab === "payments" ? (
                <Tenant360PaymentsPanel
                  payments={tenant360?.payments}
                  paymentMethodItems={paymentMethodItems}
                  paymentStatusItems={paymentStatusItems}
                  authUser={authUser}
                  visibility={{
                    payAmount: canViewPaymentAmount,
                    unappliedAmount: canViewPaymentUnappliedAmount
                  }}
                />
              ) : null}
              {!tenant360Loading && detailTab === "invoices" ? (
                <Tenant360InvoicesPanel
                  invoices={tenant360?.invoices}
                  invoiceTypeItems={invoiceTypeItems}
                  invoiceStatusItems={invoiceStatusItems}
                  authUser={authUser}
                  canViewInvoiceAmount={canViewInvoiceAmount}
                />
              ) : null}
              {!tenant360Loading && detailTab === "contract_changes" ? (
                <Tenant360ContractChangesPanel
                  contractChanges={tenant360?.contract_changes}
                  changeTypeItems={contractChangeTypeItems}
                  changeStatusItems={contractChangeStatusItems}
                  receivablePolicyItems={receivablePolicyItems}
                />
              ) : null}
              {!tenant360Loading && detailTab === "checkouts" ? (
                <Tenant360CheckoutsPanel
                  checkouts={tenant360?.checkouts}
                  checkoutTypeItems={checkoutTypeItems}
                  checkoutStatusItems={checkoutStatusItems}
                  settlementStatusItems={settlementStatusItems}
                  releaseStatusItems={releaseStatusItems}
                  authUser={authUser}
                  visibility={{
                    refundAmount: canViewCheckoutRefundAmount,
                    amountDueFromTenant: canViewCheckoutTenantDue
                  }}
                />
              ) : null}
              {!tenant360Loading && detailTab === "refunds" ? (
                <Tenant360RefundsPanel
                  refunds={tenant360?.refunds}
                  refundMethodItems={refundMethodItems}
                  refundStatusItems={refundStatusItems}
                  authUser={authUser}
                  canViewRefundAmount={canViewRefundAmount}
                />
              ) : null}
              {!tenant360Loading && detailTab === "workorders" ? (
                <Tenant360WorkordersPanel
                  workorders={tenant360?.workorders}
                  statusItems={workOrderStatusItems}
                  typeItems={workOrderTypeItems}
                  priorityItems={workOrderPriorityItems}
                  authUser={authUser}
                  canViewReporterMobile={canViewWorkOrderReporterMobile}
                  onOpenWorkOrder={openWorkOrderDetail}
                />
              ) : null}
              {!tenant360Loading && detailTab === "hazards" ? (
                <Tenant360HazardsPanel
                  hazards={tenant360?.hazards}
                  statusItems={hazardStatusItems}
                  typeItems={hazardTypeItems}
                  riskItems={hazardRiskItems}
                  sourceItems={hazardSourceItems}
                  authUser={authUser}
                  canViewDescription={canViewHazardDescription}
                  onOpenHazard={openHazardDetail}
                />
              ) : null}
              {!tenant360Loading && detailTab === "emergency" ? (
                <Tenant360EmergencyPanel
                  emergency={tenant360?.emergency}
                  statusItems={emergencyStatusItems}
                  typeItems={emergencyTypeItems}
                  severityItems={emergencySeverityItems}
                  responseItems={emergencyResponseItems}
                  onOpenEmergency={openEmergencyDetail}
                />
              ) : null}
              {!tenant360Loading && detailTab === "work_permits" ? (
                <Tenant360WorkPermitsPanel
                  workPermits={tenant360?.work_permits}
                  statusItems={workPermitStatusItems}
                  typeItems={workPermitTypeItems}
                  riskItems={workPermitRiskItems}
                  onOpenWorkPermit={openWorkPermitDetail}
                />
              ) : null}
              {!tenant360Loading && detailTab === "devices" ? (
                <Tenant360DevicesPanel
                  devices={tenant360?.devices}
                  deviceTypeItems={iotDeviceTypeItems}
                  deviceStatusItems={iotDeviceStatusItems}
                  alertLevelItems={iotAlertLevelItems}
                  alertStatusItems={iotAlertStatusItems}
                  onOpenDevice={openDeviceDetail}
                  onOpenAlert={openIotAlert}
                />
              ) : null}
              {!tenant360Loading && detailTab === "energy" ? <EmptyState title="能耗模块暂未接入" description={tenant360?.energy.available ? "暂无能耗数据" : "能耗能力将在后续阶段接入，当前不展示假数据。"} /> : null}
            </Drawer>
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
    <DataTable >
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
    </DataTable>
  );
}

function Tenant360ContractsTable({
  contracts,
  statusItems,
  authUser,
  canViewTotalAmount,
  onOpenContract
}: {
  contracts?: Tenant360ContractsNode;
  statusItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  canViewTotalAmount: boolean;
  onOpenContract: (contract: Tenant360ContractRow) => void;
}) {
  if (!contracts?.available) {
    return <EmptyState title="合同模块未启用" description="当前租户暂未启用合同能力，或当前账号无权查看合同数据。" />;
  }
  if (contracts.items.length === 0) {
    return <EmptyState title="暂无合同数据" description="该租户企业当前没有关联合同。" />;
  }
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="合同数量" value={String(contracts.summary?.contract_count ?? contracts.items.length)} />
        <MetricCard label="生效合同" value={String(contracts.summary?.active_contract_count ?? 0)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>合同编号</th>
            <th>合同名称</th>
            <th>租期</th>
            <th>合同总金额</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {contracts.items.map((contract) => (
            <tr key={contract.id}>
              <td>{contract.contract_code}</td>
              <td>{contract.contract_name}</td>
              <td>{formatDateRange(contract.start_date, contract.end_date)}</td>
              <td>{contractAmountText(authUser, canViewTotalAmount, contract.total_amount)}</td>
              <td><DictBadge items={statusItems} value={contract.status} /></td>
              <td>
                <button className="primary-button" type="button" onClick={() => onOpenContract(contract)}>
                  <Eye size={16} />
                  查看合同
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360ReceivablesPanel({
  receivables,
  feeTypeItems,
  receivableStatusItems,
  invoiceStatusItems,
  authUser,
  visibility
}: {
  receivables?: Tenant360ReceivablesNode;
  feeTypeItems: DictItemRow[];
  receivableStatusItems: DictItemRow[];
  invoiceStatusItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  visibility: {
    amountDue: boolean;
    amountPaid: boolean;
    amountRemain: boolean;
    overdueAmount: boolean;
  };
}) {
  if (!receivables?.available) {
    return <EmptyState title="应收模块未启用" description="当前租户暂未启用应收能力，或当前账号无权查看应收数据。" />;
  }
  const items = receivables.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="应收总额" value={financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_DUE, visibility.amountDue, receivables.summary?.total_amount_due)} />
        <MetricCard label="已收总额" value={financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_PAID, visibility.amountPaid, receivables.summary?.total_amount_paid)} />
        <MetricCard label="未收总额" value={financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_REMAIN, visibility.amountRemain, receivables.summary?.total_amount_remain)} />
        <MetricCard label="逾期金额" value={financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_OVERDUE_AMOUNT, visibility.overdueAmount, receivables.summary?.overdue_amount)} />
        <MetricCard label="逾期单数" value={String(receivables.summary?.overdue_count ?? 0)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>应收单号</th>
            <th>合同编号</th>
            <th>费用类型</th>
            <th>账期</th>
            <th>应收日</th>
            <th>应收金额</th>
            <th>已收金额</th>
            <th>未收金额</th>
            <th>开票状态</th>
            <th>应收状态</th>
            <th>逾期天数</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.ar_code}</td>
              <td>{fieldText(row.contract_code)}</td>
              <td>{labelFor(feeTypeItems, row.fee_type)}</td>
              <td>{formatDateRange(row.period_start, row.period_end)}</td>
              <td>{fieldText(row.due_date)}</td>
              <td>{financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_DUE, visibility.amountDue, row.amount_due)}</td>
              <td>{financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_PAID, visibility.amountPaid, row.amount_paid)}</td>
              <td>{financeAmountText(authUser, LEASING_RECEIVABLE_ENTITY, FIELD_AMOUNT_REMAIN, visibility.amountRemain, row.amount_remain)}</td>
              <td><DictBadge items={invoiceStatusItems} value={row.invoice_status} /></td>
              <td><DictBadge items={receivableStatusItems} value={row.status} /></td>
              <td>{row.overdue_days}</td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={11}>暂无应收数据</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360PaymentsPanel({
  payments,
  paymentMethodItems,
  paymentStatusItems,
  authUser,
  visibility
}: {
  payments?: Tenant360PaymentsNode;
  paymentMethodItems: DictItemRow[];
  paymentStatusItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  visibility: {
    payAmount: boolean;
    unappliedAmount: boolean;
  };
}) {
  if (!payments?.available) {
    return <EmptyState title="收款模块未启用" description="当前租户暂未启用收款能力，或当前账号无权查看收款数据。" />;
  }
  const items = payments.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="收款总额" value={financeAmountText(authUser, LEASING_PAYMENT_ENTITY, FIELD_PAY_AMOUNT, visibility.payAmount, payments.summary?.total_payment_amount)} />
        <MetricCard label="未核销金额" value={financeAmountText(authUser, LEASING_PAYMENT_ENTITY, FIELD_UNAPPLIED_AMOUNT, visibility.unappliedAmount, payments.summary?.unapplied_amount)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>收款单号</th>
            <th>收款时间</th>
            <th>收款方式</th>
            <th>付款人</th>
            <th>收款金额</th>
            <th>未核销金额</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.pay_code}</td>
              <td>{formatDateTime(row.pay_time)}</td>
              <td>{labelFor(paymentMethodItems, row.pay_method)}</td>
              <td>{fieldText(row.payer_name)}</td>
              <td>{financeAmountText(authUser, LEASING_PAYMENT_ENTITY, FIELD_PAY_AMOUNT, visibility.payAmount, row.pay_amount)}</td>
              <td>{financeAmountText(authUser, LEASING_PAYMENT_ENTITY, FIELD_UNAPPLIED_AMOUNT, visibility.unappliedAmount, row.unapplied_amount)}</td>
              <td><DictBadge items={paymentStatusItems} value={row.status} /></td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={7}>暂无收款数据</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360InvoicesPanel({
  invoices,
  invoiceTypeItems,
  invoiceStatusItems,
  authUser,
  canViewInvoiceAmount
}: {
  invoices?: Tenant360InvoicesNode;
  invoiceTypeItems: DictItemRow[];
  invoiceStatusItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  canViewInvoiceAmount: boolean;
}) {
  if (!invoices?.available) {
    return <EmptyState title="发票模块未启用" description="当前租户暂未启用发票能力，或当前账号无权查看发票数据。" />;
  }
  const items = invoices.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="发票数量" value={String(invoices.summary?.invoice_count ?? 0)} />
        <MetricCard label="开票金额" value={financeAmountText(authUser, LEASING_INVOICE_ENTITY, FIELD_INVOICE_AMOUNT, canViewInvoiceAmount, invoices.summary?.invoice_amount)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>发票单号</th>
            <th>发票类型</th>
            <th>发票号码</th>
            <th>发票日期</th>
            <th>金额</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.invoice_code}</td>
              <td>{labelFor(invoiceTypeItems, row.invoice_type)}</td>
              <td>{fieldText(row.invoice_no)}</td>
              <td>{fieldText(row.invoice_date)}</td>
              <td>{financeAmountText(authUser, LEASING_INVOICE_ENTITY, FIELD_INVOICE_AMOUNT, canViewInvoiceAmount, row.amount)}</td>
              <td><DictBadge items={invoiceStatusItems} value={row.status} /></td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={6}>暂无发票数据</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360ContractChangesPanel({
  contractChanges,
  changeTypeItems,
  changeStatusItems,
  receivablePolicyItems
}: {
  contractChanges?: Tenant360ContractChangesNode;
  changeTypeItems: DictItemRow[];
  changeStatusItems: DictItemRow[];
  receivablePolicyItems: DictItemRow[];
}) {
  if (!contractChanges?.available) {
    return <EmptyState title="合同变更未启用" description="当前租户暂未启用合同变更能力，或当前账号无权查看变更记录。" />;
  }
  const items = contractChanges.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="待处理变更" value={String(contractChanges.summary?.pending_count ?? 0)} />
        <MetricCard label="已生效变更" value={String(contractChanges.summary?.effective_count ?? 0)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>变更单号</th>
            <th>合同编号</th>
            <th>变更类型</th>
            <th>生效日期</th>
            <th>应收策略</th>
            <th>状态</th>
            <th>更新时间</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.change_code}</td>
              <td>{fieldText(row.contract_code)}</td>
              <td>{labelFor(changeTypeItems, row.change_type)}</td>
              <td>{fieldText(row.effective_date)}</td>
              <td>{labelFor(receivablePolicyItems, row.receivable_policy)}</td>
              <td><DictBadge items={changeStatusItems} value={row.status} /></td>
              <td>{formatDateTime(row.update_time)}</td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={7}>暂无合同变更记录</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360CheckoutsPanel({
  checkouts,
  checkoutTypeItems,
  checkoutStatusItems,
  settlementStatusItems,
  releaseStatusItems,
  authUser,
  visibility
}: {
  checkouts?: Tenant360CheckoutsNode;
  checkoutTypeItems: DictItemRow[];
  checkoutStatusItems: DictItemRow[];
  settlementStatusItems: DictItemRow[];
  releaseStatusItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  visibility: {
    refundAmount: boolean;
    amountDueFromTenant: boolean;
  };
}) {
  if (!checkouts?.available) {
    return <EmptyState title="退租结算未启用" description="当前租户暂未启用退租结算能力，或当前账号无权查看退租记录。" />;
  }
  const items = checkouts.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="待处理退租" value={String(checkouts.summary?.pending_count ?? 0)} />
        <MetricCard label="已完成退租" value={String(checkouts.summary?.completed_count ?? 0)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>退租单号</th>
            <th>合同编号</th>
            <th>退租类型</th>
            <th>计划退租日</th>
            <th>实际退租日</th>
            <th>释放状态</th>
            <th>结算状态</th>
            <th>应退金额</th>
            <th>租户应补</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.checkout_code}</td>
              <td>{fieldText(row.contract_code)}</td>
              <td>{labelFor(checkoutTypeItems, row.checkout_type)}</td>
              <td>{fieldText(row.planned_checkout_date)}</td>
              <td>{fieldText(row.actual_checkout_date)}</td>
              <td>{labelFor(releaseStatusItems, row.release_unit_status)}</td>
              <td><DictBadge items={settlementStatusItems} value={row.settlement_status} /></td>
              <td>{financeAmountText(authUser, LEASING_CHECKOUT_ENTITY, FIELD_CHECKOUT_REFUND_AMOUNT, visibility.refundAmount, row.refund_amount)}</td>
              <td>{financeAmountText(authUser, LEASING_CHECKOUT_ENTITY, FIELD_CHECKOUT_TENANT_DUE, visibility.amountDueFromTenant, row.amount_due_from_tenant)}</td>
              <td><DictBadge items={checkoutStatusItems} value={row.status} /></td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={10}>暂无退租记录</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360RefundsPanel({
  refunds,
  refundMethodItems,
  refundStatusItems,
  authUser,
  canViewRefundAmount
}: {
  refunds?: Tenant360RefundsNode;
  refundMethodItems: DictItemRow[];
  refundStatusItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  canViewRefundAmount: boolean;
}) {
  if (!refunds?.available) {
    return <EmptyState title="退款登记未启用" description="当前租户暂未启用退款登记能力，或当前账号无权查看退款记录。" />;
  }
  const items = refunds.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="退款笔数" value={String(refunds.summary?.refund_count ?? 0)} />
        <MetricCard label="退款金额" value={financeAmountText(authUser, LEASING_REFUND_ENTITY, FIELD_REFUND_AMOUNT, canViewRefundAmount, refunds.summary?.refund_amount)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>退款单号</th>
            <th>退租单号</th>
            <th>合同编号</th>
            <th>退款方式</th>
            <th>退款时间</th>
            <th>收款人</th>
            <th>退款金额</th>
            <th>状态</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.refund_code}</td>
              <td>{fieldText(row.checkout_code)}</td>
              <td>{fieldText(row.contract_code)}</td>
              <td>{labelFor(refundMethodItems, row.refund_method)}</td>
              <td>{formatDateTime(row.refund_time)}</td>
              <td>{fieldText(row.receiver_name)}</td>
              <td>{financeAmountText(authUser, LEASING_REFUND_ENTITY, FIELD_REFUND_AMOUNT, canViewRefundAmount, row.refund_amount)}</td>
              <td><DictBadge items={refundStatusItems} value={row.status} /></td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={8}>暂无退款记录</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360WorkordersPanel({
  workorders,
  statusItems,
  typeItems,
  priorityItems,
  authUser,
  canViewReporterMobile,
  onOpenWorkOrder
}: {
  workorders?: Tenant360WorkordersNode;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  priorityItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  canViewReporterMobile: boolean;
  onOpenWorkOrder: (workOrder: Tenant360WorkOrderRow) => void;
}) {
  if (!workorders?.available) {
    return <EmptyState title="工单模块未启用" description="当前租户暂未启用工单能力，或当前账号无权查看工单数据。" />;
  }
  const items = workorders.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="工单总数" value={String(workorders.summary?.total_count ?? 0)} />
        <MetricCard label="未闭环工单" value={String(workorders.summary?.open_count ?? 0)} />
        <MetricCard label="超时工单" value={String(workorders.summary?.overdue_count ?? 0)} />
        <MetricCard label="平均满意度" value={formatScore(workorders.summary?.avg_satisfaction)} />
      </div>
      <DataTable >
        <thead>
          <tr>
            <th>工单编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>优先级</th>
            <th>状态</th>
            <th>位置</th>
            <th>报告人</th>
            <th>处理人</th>
            <th>超时</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.wo_code}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.wo_type)}</td>
              <td><DictBadge items={priorityItems} value={row.priority} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>
                {fieldText(row.reporter_name)}
                {canViewReporterMobile ? ` / ${fieldText(maskField(authUser, WORKORDER_MODULE, WORKORDER_ENTITY, FIELD_WORKORDER_REPORTER_MOBILE, row.reporter_mobile))}` : ""}
              </td>
              <td>{fieldText(row.assignee_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超时" : "正常"}</span></td>
              <td>{formatDateTime(row.update_time)}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => onOpenWorkOrder(row)}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={11}>暂无工单数据</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360HazardsPanel({
  hazards,
  statusItems,
  typeItems,
  riskItems,
  sourceItems,
  authUser,
  canViewDescription,
  onOpenHazard
}: {
  hazards?: Tenant360HazardsNode;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  riskItems: DictItemRow[];
  sourceItems: DictItemRow[];
  authUser: Parameters<typeof maskField>[0];
  canViewDescription: boolean;
  onOpenHazard: (hazard: Tenant360HazardRow) => void;
}) {
  if (!hazards?.available) {
    return <EmptyState title="安全隐患未启用" description="当前租户暂未启用安全隐患能力，或当前账号无权查看隐患数据。" />;
  }
  const items = hazards.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="隐患总数" value={String(hazards.summary?.total_count ?? 0)} />
        <MetricCard label="未闭环隐患" value={String(hazards.summary?.open_count ?? 0)} />
        <MetricCard label="超期隐患" value={String(hazards.summary?.overdue_count ?? 0)} />
        <MetricCard label="重大隐患" value={String(hazards.summary?.major_count ?? 0)} />
        <MetricCard label="已闭环隐患" value={String(hazards.summary?.closed_count ?? 0)} />
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>隐患编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>风险</th>
            <th>来源</th>
            <th>状态</th>
            <th>位置</th>
            <th>描述</th>
            <th>整改人</th>
            <th>超期</th>
            <th>更新时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.hazard_code}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.hazard_type)}</td>
              <td><DictBadge items={riskItems} value={row.risk_level} /></td>
              <td>{labelFor(sourceItems, row.source_type)}</td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{canViewDescription ? fieldText(maskField(authUser, SAFETY_MODULE, SAFETY_HAZARD_ENTITY, FIELD_HAZARD_DESCRIPTION, row.description)) : "-"}</td>
              <td>{fieldText(row.rectify_user_name)}</td>
              <td><span className={`status-pill ${row.overdue_flag ? "status-danger" : "status-success"}`}>{row.overdue_flag ? "超期" : "正常"}</span></td>
              <td>{formatDateTime(row.update_time)}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => onOpenHazard(row)}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={12}>暂无隐患数据</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360EmergencyPanel({
  emergency,
  statusItems,
  typeItems,
  severityItems,
  responseItems,
  onOpenEmergency
}: {
  emergency?: Tenant360EmergencyNode;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  severityItems: DictItemRow[];
  responseItems: DictItemRow[];
  onOpenEmergency: (emergency: Tenant360EmergencyRow) => void;
}) {
  if (!emergency?.available) {
    return <EmptyState title="应急模块未启用" description="当前租户暂未启用安全应急能力，不展示假数据。" />;
  }
  const items = emergency.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="应急事件总数" value={String(emergency.summary?.total_count ?? 0)} />
        <MetricCard label="未闭环事件" value={String(emergency.summary?.open_count ?? 0)} />
        <MetricCard label="已闭环事件" value={String(emergency.summary?.closed_count ?? 0)} />
        <MetricCard label="重大事件" value={String(emergency.summary?.major_count ?? 0)} />
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>事件编号</th>
            <th>标题</th>
            <th>类型</th>
            <th>严重等级</th>
            <th>响应等级</th>
            <th>状态</th>
            <th>位置</th>
            <th>上报人</th>
            <th>上报时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.emergency_code}</td>
              <td>{row.title}</td>
              <td>{labelFor(typeItems, row.incident_type)}</td>
              <td><DictBadge items={severityItems} value={row.severity_level} /></td>
              <td><DictBadge items={responseItems} value={row.response_level} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.reporter_name)}</td>
              <td>{formatDateTime(row.report_time)}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => onOpenEmergency(row)}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={10}>暂无应急事件</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360WorkPermitsPanel({
  workPermits,
  statusItems,
  typeItems,
  riskItems,
  onOpenWorkPermit
}: {
  workPermits?: Tenant360WorkPermitsNode;
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  riskItems: DictItemRow[];
  onOpenWorkPermit: (workPermit: Tenant360WorkPermitRow) => void;
}) {
  if (!workPermits?.available) {
    return <EmptyState title="作业许可未启用" description="当前租户暂未启用作业许可能力，不展示假数据。" />;
  }
  const items = workPermits.recent_items ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="作业许可总数" value={String(workPermits.summary?.total_count ?? 0)} />
        <MetricCard label="开工中许可" value={String(workPermits.summary?.in_progress_count ?? 0)} />
        <MetricCard label="违规次数" value={String(workPermits.summary?.violation_count ?? 0)} />
        <MetricCard label="已闭环许可" value={String(workPermits.summary?.closed_count ?? 0)} />
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>许可编号</th>
            <th>类型</th>
            <th>风险</th>
            <th>状态</th>
            <th>位置</th>
            <th>申请人</th>
            <th>施工方</th>
            <th>监护人</th>
            <th>作业时间</th>
            <th>违规</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.permit_code}</td>
              <td>{labelFor(typeItems, row.permit_type)}</td>
              <td><DictBadge items={riskItems} value={row.risk_level} /></td>
              <td><DictBadge items={statusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{fieldText(row.apply_user_name)}</td>
              <td>{fieldText(row.contractor_name)}</td>
              <td>{fieldText(row.monitor_user_name)}</td>
              <td>{formatDateRange(row.time_start, row.time_end)}</td>
              <td>{row.violation_count}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => onOpenWorkPermit(row)}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 ? <tr><td colSpan={11}>暂无作业许可</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
  );
}

function Tenant360DevicesPanel({
  devices,
  deviceTypeItems,
  deviceStatusItems,
  alertLevelItems,
  alertStatusItems,
  onOpenDevice,
  onOpenAlert
}: {
  devices?: Tenant360DevicesNode;
  deviceTypeItems: DictItemRow[];
  deviceStatusItems: DictItemRow[];
  alertLevelItems: DictItemRow[];
  alertStatusItems: DictItemRow[];
  onOpenDevice: (device: Tenant360DeviceRow) => void;
  onOpenAlert: (alert: Tenant360DeviceAlertRow) => void;
}) {
  if (!devices?.available) {
    return <EmptyState title="IoT 模块未启用" description="当前租户暂未启用 IoT 设备能力，不展示假数据。" />;
  }
  const deviceItems = devices.recent_devices ?? [];
  const alertItems = devices.recent_alerts ?? [];
  return (
    <section className="detail-stack">
      <div className="system-grid">
        <MetricCard label="设备总数" value={String(devices.summary?.device_count ?? 0)} />
        <MetricCard label="在线设备" value={String(devices.summary?.online_count ?? 0)} />
        <MetricCard label="活跃告警" value={String(devices.summary?.active_alert_count ?? 0)} />
      </div>
      <DataTable>
        <thead>
          <tr>
            <th>设备编号</th>
            <th>设备名称</th>
            <th>设备类型</th>
            <th>在线状态</th>
            <th>启停状态</th>
            <th>位置</th>
            <th>最近上报</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {deviceItems.map((row) => (
            <tr key={row.id}>
              <td>{row.device_code}</td>
              <td>{row.device_name}</td>
              <td>{labelFor(deviceTypeItems, row.device_type)}</td>
              <td><DictBadge items={deviceStatusItems} value={row.online_status} /></td>
              <td><DictBadge items={deviceStatusItems} value={row.status} /></td>
              <td>{fieldText(row.location)}</td>
              <td>{row.last_data_time ? formatDateTime(row.last_data_time) : "-"}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => onOpenDevice(row)}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {deviceItems.length === 0 ? <tr><td colSpan={8}>暂无关联设备</td></tr> : null}
        </tbody>
      </DataTable>
      <DataTable>
        <thead>
          <tr>
            <th>告警编号</th>
            <th>告警标题</th>
            <th>设备</th>
            <th>指标</th>
            <th>级别</th>
            <th>状态</th>
            <th>触发值</th>
            <th>最近触发</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {alertItems.map((row) => (
            <tr key={row.id}>
              <td>{row.alert_code}</td>
              <td>{row.alert_title}</td>
              <td>{row.device_name || row.device_code}</td>
              <td>{row.metric_code}</td>
              <td><DictBadge items={alertLevelItems} value={row.alert_level} /></td>
              <td><DictBadge items={alertStatusItems} value={row.status} /></td>
              <td>{fieldText(row.trigger_value)}</td>
              <td>{formatDateTime(row.last_trigger_time)}</td>
              <td>
                <button className="inline-action-button" type="button" onClick={() => onOpenAlert(row)}>
                  <Eye size={16} />
                  查看
                </button>
              </td>
            </tr>
          ))}
          {alertItems.length === 0 ? <tr><td colSpan={9}>暂无设备告警</td></tr> : null}
        </tbody>
      </DataTable>
    </section>
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="metric-card">
      <span>{label}</span>
      <strong className="metric-value">{value}</strong>
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
      <Card >
        <h1 className="panel-title">403</h1>
        <p className="muted-text">当前账号没有租户企业档案权限。</p>
      </Card>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <Card className=" module-denied">
        <h1 className="panel-title">模块未授权</h1>
        <p className="muted-text">当前租户未启用招商租赁模块。</p>
      </Card>
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

function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

function contractAmountText(user: Parameters<typeof maskField>[0], canView: boolean, value: unknown): string {
  if (!canView) return "-";
  const masked = maskContractField(user, FIELD_CONTRACT_TOTAL_AMOUNT, value);
  if (masked === null || masked === undefined || masked === "") return "-";
  const numberValue = Number(masked);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(masked);
}

function financeAmountText(user: Parameters<typeof maskField>[0], entity: string, fieldKey: string, canView: boolean, value: unknown): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, entity, fieldKey, value);
  if (masked === null || masked === undefined || masked === "") return "-";
  const numberValue = Number(masked);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(masked);
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

function maskContractField(user: Parameters<typeof maskField>[0], fieldKey: string, value: unknown): unknown {
  return maskField(user, LEASING_MODULE, LEASING_CONTRACT_ENTITY, fieldKey, value);
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
