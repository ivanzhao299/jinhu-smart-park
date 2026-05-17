"use client";

import { Ban, CheckCircle2, Download, Edit3, Plus, RefreshCw, Send, Search, Trash2, X } from "lucide-react";
import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import type { FileRecord, PaginatedResult } from "@jinhu/shared";
import { PermissionButton } from "../../../components/auth/PermissionButton";
import { PermissionGuard } from "../../../components/auth/PermissionGuard";
import { FileUploader } from "../../../components/files/FileUploader";
import { API_PREFIX, apiRequest, createIdempotencyKey } from "../../../lib/api-client";
import { useAuthUser } from "../../../lib/auth-context";
import { getAccessToken } from "../../../lib/authz";
import { canEditField, canViewField, maskField } from "../../../lib/field-policy";
import { hasPermission } from "../../../lib/permissions";

const LEASING_MODULE = "leasing";
const CONTRACT_ENTITY = "leasing_contract";
const CONTRACT_UNIT_ENTITY = "rel_leasing_contract_unit";
const FIELD_RENT_UNIT_PRICE = "rentUnitPrice";
const FIELD_RENT_PER_MONTH = "rentPerMonth";
const FIELD_TOTAL_AMOUNT = "totalAmount";
const FIELD_DEPOSIT_AMOUNT = "depositAmount";
const FIELD_PROPERTY_FEE_UNIT_PRICE = "propertyFeeUnitPrice";
const FIELD_CONTRACT_UNIT_RENT_UNIT_PRICE = "rentUnitPrice";
const FIELD_CONTRACT_UNIT_RENT_AMOUNT_PER_MONTH = "rentAmountPerMonth";
const CONTRACT_PERMISSIONS = {
  read: "leasing_contract:read",
  create: "leasing_contract:create",
  update: "leasing_contract:update",
  delete: "leasing_contract:delete",
  submit: "leasing_contract:submit",
  approve: "leasing_contract:approve",
  reject: "leasing_contract:reject",
  void: "leasing_contract:void",
  archive: "leasing_contract:archive",
  effective: "leasing_contract:effective",
  statusLog: "leasing_contract:status_log",
  fileRead: "leasing_contract:file_read",
  unitRead: "leasing_contract_unit:read",
  unitCreate: "leasing_contract_unit:create",
  unitUpdate: "leasing_contract_unit:update",
  unitDelete: "leasing_contract_unit:delete",
  recalculate: "leasing_contract:recalculate"
} as const;
const FILE_PERMISSIONS = {
  upload: "file:upload",
  download: "file:download"
} as const;
const CONTRACT_FILE_BIZ_TYPE = "leasing_contract";

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

interface ParkTenantRow {
  id: string;
  parkTenantCode: string;
  companyName: string;
}

interface BuildingRow {
  id: string;
  buildingCode: string;
  buildingName: string;
}

interface FloorRow {
  id: string;
  buildingId: string;
  floorCode: string;
  floorName: string;
}

interface UnitRow {
  id: string;
  code: string | null;
  unitCode: string;
  unitName: string;
  buildingId: string;
  floorId: string;
  unitArea: string;
  rentalStatus: number;
  refPrice?: string | null;
}

interface LeasingContractApproveRecord {
  action: "submit" | "approve" | "reject" | "void" | "sign" | "archive" | "effective";
  operatorId: string;
  operatorName: string;
  opTime: string;
  fromStatus: string;
  toStatus: string;
  opinion?: string | null;
  rejectReason?: string | null;
  attachments?: unknown[];
}

type ContractStatusAction = LeasingContractApproveRecord["action"] | "create" | "system";

interface LeasingContractRow {
  id: string;
  code: string | null;
  contractCode: string;
  contractName: string;
  contractType: string | null;
  parkTenantId: string;
  parkTenant?: ParkTenantRow | null;
  sourceType: string;
  sourceLeadId: string | null;
  sourceQuoteId: string | null;
  startDate: string;
  endDate: string;
  signDate: string | null;
  effectiveDate: string | null;
  rentUnitPrice: string;
  totalArea: string;
  rentPerMonth?: string | null;
  totalAmount?: string | null;
  depositMonths: string;
  depositAmount?: string | null;
  freeRentMonths: string;
  paymentPeriod: string | null;
  paymentAdvanceDays: number;
  lateFeeRule: string | null;
  propertyFeeUnitPrice: string;
  otherFeeRules: unknown[];
  status: string;
  approveRecords: LeasingContractApproveRecord[];
  contractPdfFileId?: string | null;
  scanPdfFileId?: string | null;
  remark: string | null;
  updateTime: string;
  createTime: string;
}

interface ContractUnitRow {
  id: string;
  contractId: string;
  unitId: string;
  unitCode: string;
  unitName: string;
  area: string;
  rentUnitPrice: string;
  rentAmountPerMonth: string;
  startDate: string;
  endDate: string;
  status: number;
  remark: string | null;
  unit?: UnitRow | null;
}

interface ContractStatusLogRow {
  id: string;
  contractId: string;
  beforeStatus: string | null;
  afterStatus: string;
  action: ContractStatusAction;
  reason: string | null;
  operatorId: string | null;
  operatorName: string | null;
  opTime: string;
  remark: string | null;
}

interface ContractFormState {
  contractCode: string;
  contractName: string;
  contractType: string;
  parkTenantId: string;
  startDate: string;
  endDate: string;
  signDate: string;
  effectiveDate: string;
  rentUnitPrice: string;
  totalArea: string;
  rentPerMonth: string;
  totalAmount: string;
  depositMonths: string;
  depositAmount: string;
  freeRentMonths: string;
  paymentPeriod: string;
  paymentAdvanceDays: string;
  lateFeeRule: string;
  propertyFeeUnitPrice: string;
  contractPdfFileId: string;
  scanPdfFileId: string;
  remark: string;
}

interface ContractUnitFormState {
  relId: string;
  unitId: string;
  area: string;
  rentUnitPrice: string;
  startDate: string;
  endDate: string;
  remark: string;
}

interface ArchiveFormState {
  contractPdfFileId: string;
  contractPdfName: string;
  scanPdfFileId: string;
  scanPdfName: string;
  signDate: string;
  effectiveDate: string;
  remark: string;
}

interface EffectiveFormState {
  effectiveDate: string;
  opinion: string;
}

const emptyPage: PaginatedResult<LeasingContractRow> = { items: [], page: 1, page_size: 20, total: 0 };
const emptyForm: ContractFormState = {
  contractCode: "",
  contractName: "",
  contractType: "",
  parkTenantId: "",
  startDate: "",
  endDate: "",
  signDate: "",
  effectiveDate: "",
  rentUnitPrice: "",
  totalArea: "",
  rentPerMonth: "",
  totalAmount: "",
  depositMonths: "",
  depositAmount: "",
  freeRentMonths: "",
  paymentPeriod: "",
  paymentAdvanceDays: "",
  lateFeeRule: "",
  propertyFeeUnitPrice: "",
  contractPdfFileId: "",
  scanPdfFileId: "",
  remark: ""
};

const emptyUnitForm: ContractUnitFormState = {
  relId: "",
  unitId: "",
  area: "",
  rentUnitPrice: "",
  startDate: "",
  endDate: "",
  remark: ""
};

const emptyArchiveForm: ArchiveFormState = {
  contractPdfFileId: "",
  contractPdfName: "",
  scanPdfFileId: "",
  scanPdfName: "",
  signDate: "",
  effectiveDate: "",
  remark: ""
};

const emptyEffectiveForm: EffectiveFormState = {
  effectiveDate: "",
  opinion: "合同已生效"
};

export default function LeasingContractsPage() {
  const authUser = useAuthUser();
  const [pageData, setPageData] = useState<PaginatedResult<LeasingContractRow>>(emptyPage);
  const [dicts, setDicts] = useState<Record<string, DictItemRow[]>>({});
  const [parkTenants, setParkTenants] = useState<ParkTenantRow[]>([]);
  const [buildings, setBuildings] = useState<BuildingRow[]>([]);
  const [floors, setFloors] = useState<FloorRow[]>([]);
  const [unitOptions, setUnitOptions] = useState<UnitRow[]>([]);
  const [contractUnits, setContractUnits] = useState<ContractUnitRow[]>([]);
  const [contractFiles, setContractFiles] = useState<FileRecord[]>([]);
  const [contractStatusLogs, setContractStatusLogs] = useState<ContractStatusLogRow[]>([]);
  const [message, setMessage] = useState("");
  const [filters, setFilters] = useState({ keyword: "", status: "", contractType: "", parkTenantId: "", startDate: "", endDate: "" });
  const [unitFilters, setUnitFilters] = useState({ buildingId: "", floorId: "", rentalStatus: "" });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LeasingContractRow | null>(null);
  const [form, setForm] = useState<ContractFormState>(emptyForm);
  const [unitForm, setUnitForm] = useState<ContractUnitFormState>(emptyUnitForm);
  const [archiveForm, setArchiveForm] = useState<ArchiveFormState>(emptyArchiveForm);
  const [effectiveForm, setEffectiveForm] = useState<EffectiveFormState>(emptyEffectiveForm);

  const statusItems = dicts.leasing_contract_status ?? [];
  const typeItems = dicts.leasing_contract_type ?? [];
  const paymentItems = dicts.leasing_payment_period ?? [];
  const unitRentalStatusItems = dicts.unit_rental_status ?? [];
  const canReadContractUnits = hasPermission(authUser, CONTRACT_PERMISSIONS.unitRead);
  const canReadContractFiles = hasPermission(authUser, CONTRACT_PERMISSIONS.fileRead);
  const canReadContractStatusLogs = hasPermission(authUser, CONTRACT_PERMISSIONS.statusLog);
  const canCreateContractUnits = hasPermission(authUser, CONTRACT_PERMISSIONS.unitCreate);
  const canUpdateContractUnits = hasPermission(authUser, CONTRACT_PERMISSIONS.unitUpdate);
  const canDeleteContractUnits = hasPermission(authUser, CONTRACT_PERMISSIONS.unitDelete);
  const canRecalculate = hasPermission(authUser, CONTRACT_PERMISSIONS.recalculate);
  const canViewRentUnitPrice = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_RENT_UNIT_PRICE);
  const canViewRentPerMonth = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_RENT_PER_MONTH);
  const canViewTotalAmount = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_TOTAL_AMOUNT);
  const canViewDepositAmount = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_DEPOSIT_AMOUNT);
  const canViewPropertyFeeUnitPrice = canViewField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_PROPERTY_FEE_UNIT_PRICE);
  const canEditRentUnitPrice = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_RENT_UNIT_PRICE);
  const canEditRentPerMonth = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_RENT_PER_MONTH);
  const canEditTotalAmount = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_TOTAL_AMOUNT);
  const canEditDepositAmount = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_DEPOSIT_AMOUNT);
  const canEditPropertyFeeUnitPrice = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, FIELD_PROPERTY_FEE_UNIT_PRICE);
  const canViewContractUnitRentUnitPrice = canViewField(authUser, LEASING_MODULE, CONTRACT_UNIT_ENTITY, FIELD_CONTRACT_UNIT_RENT_UNIT_PRICE);
  const canViewContractUnitRentAmountPerMonth = canViewField(authUser, LEASING_MODULE, CONTRACT_UNIT_ENTITY, FIELD_CONTRACT_UNIT_RENT_AMOUNT_PER_MONTH);
  const canEditContractUnitRentUnitPrice = canEditField(authUser, LEASING_MODULE, CONTRACT_UNIT_ENTITY, FIELD_CONTRACT_UNIT_RENT_UNIT_PRICE);
  const canEditContractPdf = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "contractPdfFileId");
  const canEditScanPdf = canEditField(authUser, LEASING_MODULE, CONTRACT_ENTITY, "scanPdfFileId");

  const load = useCallback(async (page = 1) => {
    const params = new URLSearchParams({ page: String(page), page_size: String(pageData.page_size) });
    if (filters.keyword) params.set("keyword", filters.keyword);
    if (filters.status) params.set("status", filters.status);
    if (filters.contractType) params.set("contract_type", filters.contractType);
    if (filters.parkTenantId) params.set("park_tenant_id", filters.parkTenantId);
    if (filters.startDate) params.set("start_date", filters.startDate);
    if (filters.endDate) params.set("end_date", filters.endDate);
    const response = await apiRequest<PaginatedResult<LeasingContractRow>>(`/leasing/contracts?${params.toString()}`, {
      token: getAccessToken()
    });
    setPageData(response.data);
  }, [filters, pageData.page_size]);

  const loadDicts = useCallback(async () => {
    const dictTypeResponse = await apiRequest<PaginatedResult<DictTypeRow>>("/dict-types?page=1&page_size=100", {
      token: getAccessToken()
    });
    const dictTypeMap = new Map(dictTypeResponse.data.items.map((item) => [item.dictCode, item.id]));
    const codes = ["leasing_contract_status", "leasing_contract_type", "leasing_payment_period", "unit_rental_status"];
    const entries = await Promise.all(codes.map(async (code) => {
      const dictTypeId = dictTypeMap.get(code);
      if (!dictTypeId) return [code, []] as const;
      const response = await apiRequest<PaginatedResult<DictItemRow>>(`/dict-items?page=1&page_size=100&dict_type_id=${dictTypeId}`, {
        token: getAccessToken()
      });
      return [code, response.data.items.filter((item) => item.status === "enabled")] as const;
    }));
    setDicts(Object.fromEntries(entries));
  }, []);

  const loadParkTenants = useCallback(async () => {
    const response = await apiRequest<PaginatedResult<ParkTenantRow>>("/park-tenants?page=1&page_size=100", {
      token: getAccessToken()
    });
    setParkTenants(response.data.items);
  }, []);

  const loadAssetLookups = useCallback(async () => {
    const [buildingResponse, floorResponse] = await Promise.all([
      apiRequest<PaginatedResult<BuildingRow>>("/buildings?page=1&page_size=100&sort=sortNo", { token: getAccessToken() }),
      apiRequest<PaginatedResult<FloorRow>>("/floors?page=1&page_size=100&sort=floorNo", { token: getAccessToken() })
    ]);
    setBuildings(buildingResponse.data.items);
    setFloors(floorResponse.data.items);
  }, []);

  const loadUnitOptions = useCallback(async () => {
    const params = new URLSearchParams({ page: "1", page_size: "100", sort: "unitCode" });
    if (unitFilters.buildingId) params.set("building_id", unitFilters.buildingId);
    if (unitFilters.floorId) params.set("floor_id", unitFilters.floorId);
    if (unitFilters.rentalStatus) params.set("rental_status", unitFilters.rentalStatus);
    const response = await apiRequest<PaginatedResult<UnitRow>>(`/park-units?${params.toString()}`, {
      token: getAccessToken()
    });
    setUnitOptions(response.data.items);
  }, [unitFilters]);

  const loadContractUnits = useCallback(async (contractId: string) => {
    if (!canReadContractUnits) return;
    const response = await apiRequest<ContractUnitRow[]>(`/leasing/contracts/${contractId}/units`, {
      token: getAccessToken()
    });
    setContractUnits(response.data);
  }, [canReadContractUnits]);

  const loadContractFiles = useCallback(async (contractId: string) => {
    if (!canReadContractFiles) return;
    const response = await apiRequest<FileRecord[]>(`/leasing/contracts/${contractId}/files`, {
      token: getAccessToken()
    });
    setContractFiles(response.data);
    setArchiveForm((current) => ({
      ...current,
      contractPdfName: response.data.find((file) => file.id === current.contractPdfFileId)?.originalName ?? current.contractPdfName,
      scanPdfName: response.data.find((file) => file.id === current.scanPdfFileId)?.originalName ?? current.scanPdfName
    }));
  }, [canReadContractFiles]);

  const loadContractStatusLogs = useCallback(async (contractId: string) => {
    if (!canReadContractStatusLogs) return;
    const response = await apiRequest<PaginatedResult<ContractStatusLogRow>>(`/leasing/contracts/${contractId}/status-logs?page=1&page_size=100`, {
      token: getAccessToken()
    });
    setContractStatusLogs(response.data.items);
  }, [canReadContractStatusLogs]);

  const refreshEditingContract = useCallback(async (contractId: string) => {
    const response = await apiRequest<LeasingContractRow>(`/leasing/contracts/${contractId}`, {
      token: getAccessToken()
    });
    setEditing(response.data);
    syncFormFromContract(response.data, setForm);
    syncArchiveFormFromContract(response.data, setArchiveForm);
    syncEffectiveFormFromContract(response.data, setEffectiveForm);
    await load(pageData.page);
    await loadContractFiles(contractId);
    await loadContractStatusLogs(contractId);
  }, [load, loadContractFiles, loadContractStatusLogs, pageData.page]);

  const openContractDrawer = useCallback((row: LeasingContractRow) => {
    setEditing(row);
    syncFormFromContract(row, setForm);
    syncArchiveFormFromContract(row, setArchiveForm);
    syncEffectiveFormFromContract(row, setEffectiveForm);
    setUnitForm(emptyUnitForm);
    void loadContractUnits(row.id).catch((error: Error) => setMessage(error.message));
    void loadContractFiles(row.id).catch((error: Error) => setMessage(error.message));
    void loadContractStatusLogs(row.id).catch((error: Error) => setMessage(error.message));
    setShowForm(true);
  }, [loadContractFiles, loadContractStatusLogs, loadContractUnits]);

  useEffect(() => {
    void loadDicts().catch((error: Error) => setMessage(error.message));
    void loadParkTenants().catch((error: Error) => setMessage(error.message));
    void loadAssetLookups().catch((error: Error) => setMessage(error.message));
  }, [loadAssetLookups, loadDicts, loadParkTenants]);

  useEffect(() => {
    void loadUnitOptions().catch((error: Error) => setMessage(error.message));
  }, [loadUnitOptions]);

  useEffect(() => {
    void load().catch((error: Error) => setMessage(error.message));
  }, [load]);

  useEffect(() => {
    const focusId = window.sessionStorage.getItem("leasingContractFocusId");
    if (!focusId) return;
    window.sessionStorage.removeItem("leasingContractFocusId");
    void apiRequest<LeasingContractRow>(`/leasing/contracts/${focusId}`, {
      token: getAccessToken()
    })
      .then((response) => openContractDrawer(response.data))
      .catch((error: Error) => setMessage(error.message));
  }, [openContractDrawer]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(pageData.total / pageData.page_size)), [pageData]);
  const coreDisabled = Boolean(editing && !["10", "50"].includes(editing.status));

  function openCreate() {
    setEditing(null);
    setForm({ ...emptyForm, contractType: typeItems[0]?.itemValue ?? "", paymentPeriod: paymentItems[0]?.itemValue ?? "" });
    setContractUnits([]);
    setContractFiles([]);
    setContractStatusLogs([]);
    setUnitForm(emptyUnitForm);
    setArchiveForm(emptyArchiveForm);
    setEffectiveForm(emptyEffectiveForm);
    setShowForm(true);
  }

  function openEdit(row: LeasingContractRow) {
    openContractDrawer(row);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const body: Record<string, unknown> = coreDisabled ? {
      remark: emptyToUndefined(form.remark)
    } : {
      contract_code: emptyToUndefined(form.contractCode),
      contract_name: form.contractName,
      contract_type: emptyToUndefined(form.contractType),
      park_tenant_id: form.parkTenantId,
      start_date: form.startDate,
      end_date: form.endDate,
      sign_date: emptyToUndefined(form.signDate),
      effective_date: emptyToUndefined(form.effectiveDate),
      total_area: numberOrUndefined(form.totalArea),
      deposit_months: numberOrUndefined(form.depositMonths),
      free_rent_months: numberOrUndefined(form.freeRentMonths),
      payment_period: emptyToUndefined(form.paymentPeriod),
      payment_advance_days: integerOrUndefined(form.paymentAdvanceDays),
      late_fee_rule: emptyToUndefined(form.lateFeeRule),
      remark: emptyToUndefined(form.remark)
    };
    if (!coreDisabled && canEditRentUnitPrice) body.rent_unit_price = numberOrUndefined(form.rentUnitPrice);
    if (!coreDisabled && canEditRentPerMonth) body.rent_per_month = numberOrUndefined(form.rentPerMonth);
    if (!coreDisabled && canEditTotalAmount) body.total_amount = numberOrUndefined(form.totalAmount);
    if (!coreDisabled && canEditDepositAmount) body.deposit_amount = numberOrUndefined(form.depositAmount);
    if (!coreDisabled && canEditPropertyFeeUnitPrice) body.property_fee_unit_price = numberOrUndefined(form.propertyFeeUnitPrice);
    if (canEditContractPdf) body.contract_pdf_file_id = emptyToUndefined(form.contractPdfFileId);
    if (canEditScanPdf) body.scan_pdf_file_id = emptyToUndefined(form.scanPdfFileId);
    const path = editing ? `/leasing/contracts/${editing.id}` : "/leasing/contracts";
    await apiRequest<LeasingContractRow>(path, {
      method: editing ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(editing ? "leasing-contract-update" : "leasing-contract-create"),
      body
    });
    setShowForm(false);
    setMessage(editing ? "合同已更新" : "合同草稿已创建");
    await load(editing ? pageData.page : 1);
  }

  async function remove(row: LeasingContractRow) {
    if (!window.confirm(`确认删除合同 ${row.contractCode}？`)) return;
    await apiRequest<{ id: string }>(`/leasing/contracts/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-contract-delete")
    });
    setMessage("合同已删除");
    await load(pageData.page);
  }

  async function submitUnit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const body = {
      unit_id: unitForm.unitId,
      area: numberOrUndefined(unitForm.area),
      start_date: emptyToUndefined(unitForm.startDate),
      end_date: emptyToUndefined(unitForm.endDate),
      remark: emptyToUndefined(unitForm.remark)
    };
    if (canEditContractUnitRentUnitPrice) {
      Object.assign(body, { rent_unit_price: numberOrUndefined(unitForm.rentUnitPrice) });
    }
    await apiRequest<ContractUnitRow>(unitForm.relId ? `/leasing/contracts/${editing.id}/units/${unitForm.relId}` : `/leasing/contracts/${editing.id}/units`, {
      method: unitForm.relId ? "PUT" : "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(unitForm.relId ? "leasing-contract-unit-update" : "leasing-contract-unit-create"),
      body
    });
    setUnitForm(emptyUnitForm);
    setMessage(unitForm.relId ? "合同房源已更新" : "合同房源已添加");
    await loadContractUnits(editing.id);
    await refreshEditingContract(editing.id);
  }

  function openUnitEdit(row: ContractUnitRow) {
    setUnitForm({
      relId: row.id,
      unitId: row.unitId,
      area: row.area ?? "",
      rentUnitPrice: row.rentUnitPrice ?? "",
      startDate: row.startDate ?? "",
      endDate: row.endDate ?? "",
      remark: row.remark ?? ""
    });
  }

  async function removeUnit(row: ContractUnitRow) {
    if (!editing || !window.confirm(`确认移除房源 ${row.unitCode}？`)) return;
    await apiRequest<{ id: string }>(`/leasing/contracts/${editing.id}/units/${row.id}`, {
      method: "DELETE",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-contract-unit-delete")
    });
    setMessage("合同房源已移除");
    await loadContractUnits(editing.id);
    await refreshEditingContract(editing.id);
  }

  async function recalculateContract() {
    if (!editing) return;
    await apiRequest<LeasingContractRow>(`/leasing/contracts/${editing.id}/recalculate`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-contract-recalculate"),
      body: {}
    });
    setMessage("合同金额已重算");
    await loadContractUnits(editing.id);
    await refreshEditingContract(editing.id);
  }

  async function submitContractApproval(row: LeasingContractRow) {
    const opinion = window.prompt("请输入提交意见", "提交合同审批");
    if (opinion === null) return;
    await runContractAction(row, "submit", { opinion: emptyToUndefined(opinion) });
    setMessage("合同已提交审批");
  }

  async function approveContract(row: LeasingContractRow) {
    const opinion = window.prompt("请输入审批意见", "同意");
    if (opinion === null) return;
    await runContractAction(row, "approve", { opinion: emptyToUndefined(opinion) });
    setMessage("合同审批通过，已进入待签章");
  }

  async function rejectContract(row: LeasingContractRow) {
    const rejectReason = window.prompt("请输入驳回原因");
    if (!rejectReason?.trim()) {
      setMessage("驳回原因必填");
      return;
    }
    const opinion = window.prompt("请输入审批意见", rejectReason.trim());
    if (opinion === null) return;
    await runContractAction(row, "reject", { opinion: emptyToUndefined(opinion), reject_reason: rejectReason.trim() });
    setMessage("合同已驳回");
  }

  async function voidContract(row: LeasingContractRow) {
    if (!window.confirm(`确认作废合同 ${row.contractCode}？`)) return;
    const opinion = window.prompt("请输入作废原因", "作废合同");
    if (opinion === null) return;
    await runContractAction(row, "void", { opinion: emptyToUndefined(opinion) });
    setMessage("合同已作废");
  }

  async function runContractAction(row: LeasingContractRow, action: "submit" | "approve" | "reject" | "void", body: Record<string, unknown>) {
    const response = await apiRequest<LeasingContractRow>(`/leasing/contracts/${row.id}/${action}`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey(`leasing-contract-${action}`),
      body
    });
    if (editing?.id === row.id) {
      setEditing(response.data);
      syncFormFromContract(response.data, setForm);
      syncEffectiveFormFromContract(response.data, setEffectiveForm);
      await loadContractUnits(row.id);
      await loadContractStatusLogs(row.id);
    }
    await load(pageData.page);
  }

  async function archiveContract() {
    if (!editing) return;
    if (!archiveForm.contractPdfFileId || !archiveForm.scanPdfFileId || !archiveForm.signDate) {
      setMessage("请上传合同 PDF、签章扫描件，并填写签订日期");
      return;
    }
    const response = await apiRequest<LeasingContractRow>(`/leasing/contracts/${editing.id}/archive`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-contract-archive"),
      body: {
        contract_pdf_file_id: archiveForm.contractPdfFileId,
        scan_pdf_file_id: archiveForm.scanPdfFileId,
        sign_date: archiveForm.signDate,
        effective_date: emptyToUndefined(archiveForm.effectiveDate),
        remark: emptyToUndefined(archiveForm.remark)
      }
    });
    setMessage("合同已签章归档");
    setEditing(response.data);
    syncFormFromContract(response.data, setForm);
    syncArchiveFormFromContract(response.data, setArchiveForm);
    syncEffectiveFormFromContract(response.data, setEffectiveForm);
    await loadContractFiles(editing.id);
    await loadContractStatusLogs(editing.id);
    await load(pageData.page);
  }

  async function effectiveContract() {
    if (!editing) return;
    if (!effectiveForm.effectiveDate) {
      setMessage("请填写生效日期");
      return;
    }
    if (!window.confirm(`确认将合同 ${editing.contractCode} 标记为已生效，并将关联房源更新为已出租？`)) return;
    const response = await apiRequest<LeasingContractRow>(`/leasing/contracts/${editing.id}/effective`, {
      method: "POST",
      token: getAccessToken(),
      idempotencyKey: createIdempotencyKey("leasing-contract-effective"),
      body: {
        effective_date: effectiveForm.effectiveDate,
        opinion: emptyToUndefined(effectiveForm.opinion)
      }
    });
    setMessage("合同已生效，关联房源已更新为已出租");
    setEditing(response.data);
    syncFormFromContract(response.data, setForm);
    syncArchiveFormFromContract(response.data, setArchiveForm);
    syncEffectiveFormFromContract(response.data, setEffectiveForm);
    await loadContractUnits(editing.id);
    await loadContractStatusLogs(editing.id);
    await load(pageData.page);
  }

  async function downloadContractFile(file: FileRecord) {
    const response = await fetch(`${API_PREFIX}/files/${file.id}/download`, {
      headers: { Authorization: `Bearer ${getAccessToken()}` }
    });
    if (!response.ok) {
      throw new Error("合同附件下载失败");
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.originalName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function handleContractPdfUploaded(file: FileRecord) {
    setArchiveForm((current) => ({ ...current, contractPdfFileId: file.id, contractPdfName: file.originalName }));
    if (editing) {
      void loadContractFiles(editing.id).catch((error: Error) => setMessage(error.message));
    }
  }

  function handleScanPdfUploaded(file: FileRecord) {
    setArchiveForm((current) => ({ ...current, scanPdfFileId: file.id, scanPdfName: file.originalName }));
    if (editing) {
      void loadContractFiles(editing.id).catch((error: Error) => setMessage(error.message));
    }
  }

  function updateFilter(key: keyof typeof filters, value: string) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function updateUnitFilter(key: keyof typeof unitFilters, value: string) {
    setUnitFilters((current) => ({ ...current, [key]: value, ...(key === "buildingId" ? { floorId: "" } : {}) }));
  }

  return (
    <PermissionGuard module={LEASING_MODULE} fallback={<ModuleUnauthorizedInline />}>
      <PermissionGuard permission={CONTRACT_PERMISSIONS.read} module={LEASING_MODULE} fallback={<ForbiddenInline />}>
        <main className="page-container">
          <section className="page-header">
            <div className="header-title">
              <strong>合同管理</strong>
              <span>维护租赁合同主档案，本阶段不生成应收账单</span>
            </div>
            <div className="page-actions">
              <button className="primary-button" type="button" onClick={() => void load(pageData.page)}>
                <RefreshCw size={16} />
                刷新
              </button>
              <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.create} type="button" onClick={openCreate}>
                <Plus size={16} />
                新增合同
              </PermissionButton>
            </div>
          </section>

          <section className="filter-bar">
            <div className="system-grid-three">
              <TextField label="关键词" value={filters.keyword} onChange={(value) => updateFilter("keyword", value)} placeholder="编号、名称、企业" />
              <SelectField label="合同状态" value={filters.status} onChange={(value) => updateFilter("status", value)} options={statusItems} allowEmpty />
              <SelectField label="合同类型" value={filters.contractType} onChange={(value) => updateFilter("contractType", value)} options={typeItems} allowEmpty />
              <ParkTenantSelect label="租户企业" value={filters.parkTenantId} onChange={(value) => updateFilter("parkTenantId", value)} items={parkTenants} allowEmpty />
              <DateField label="租期开始" value={filters.startDate} onChange={(value) => updateFilter("startDate", value)} />
              <DateField label="租期结束" value={filters.endDate} onChange={(value) => updateFilter("endDate", value)} />
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
                  <th>合同编号</th>
                  <th>合同名称</th>
                  <th>租户企业</th>
                  <th>合同类型</th>
                  <th>租期</th>
                  <th>总面积</th>
                  <th>月租金</th>
                  <th>合同总金额</th>
                  <th>押金</th>
                  <th>付款周期</th>
                  <th>状态</th>
                  <th>更新时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {pageData.items.length === 0 ? (
                  <tr>
                    <td colSpan={13}>暂无合同数据</td>
                  </tr>
                ) : pageData.items.map((row) => (
                  <tr key={row.id}>
                    <td>{row.contractCode}</td>
                    <td>{row.contractName}</td>
                    <td>{row.parkTenant?.companyName ?? tenantName(parkTenants, row.parkTenantId)}</td>
                    <td>{labelFor(typeItems, row.contractType)}</td>
                    <td>{formatDate(row.startDate)} 至 {formatDate(row.endDate)}</td>
                    <td>{formatArea(row.totalArea)}</td>
                    <td>{moneyText(authUser, canViewRentPerMonth, "rentPerMonth", row.rentPerMonth)}</td>
                    <td>{moneyText(authUser, canViewTotalAmount, "totalAmount", row.totalAmount)}</td>
                    <td>{moneyText(authUser, canViewDepositAmount, "depositAmount", row.depositAmount)}</td>
                    <td>{labelFor(paymentItems, row.paymentPeriod)}</td>
                    <td><DictBadge items={statusItems} value={row.status} /></td>
                    <td>{formatDateTime(row.updateTime)}</td>
                    <td>
                      <span className="data-table-actions">
                        <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.update} type="button" onClick={() => openEdit(row)}>
                          <Edit3 size={16} />
                          编辑
                        </PermissionButton>
                        {["10", "50"].includes(row.status) ? (
                          <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.submit} type="button" onClick={() => void submitContractApproval(row).catch((error: Error) => setMessage(error.message))}>
                            <Send size={16} />
                            提交
                          </PermissionButton>
                        ) : null}
                        {row.status === "30" ? (
                          <>
                            <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.approve} type="button" onClick={() => void approveContract(row).catch((error: Error) => setMessage(error.message))}>
                              <CheckCircle2 size={16} />
                              通过
                            </PermissionButton>
                            <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.reject} type="button" onClick={() => void rejectContract(row).catch((error: Error) => setMessage(error.message))}>
                              驳回
                            </PermissionButton>
                          </>
                        ) : null}
                        {["10", "30", "50"].includes(row.status) ? (
                          <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.void} type="button" onClick={() => void voidContract(row).catch((error: Error) => setMessage(error.message))}>
                            <Ban size={16} />
                            作废
                          </PermissionButton>
                        ) : null}
                        {row.status === "70" ? (
                          <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.effective} type="button" onClick={() => openEdit(row)}>
                            <CheckCircle2 size={16} />
                            生效
                          </PermissionButton>
                        ) : null}
                        <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.delete} type="button" onClick={() => void remove(row).catch((error: Error) => setMessage(error.message))}>
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
                <h2>{editing ? "合同详情" : "新增合同草稿"}</h2>
                <button className="primary-button" type="button" onClick={() => setShowForm(false)}>
                  <X size={16} />
                  关闭
                </button>
              </div>
              {coreDisabled ? <p className="status-pill status-warning">当前合同状态不允许编辑核心金额与日期字段</p> : null}
              {editing ? (
                <ContractOverview
                  contract={editing}
                  parkTenants={parkTenants}
                  statusItems={statusItems}
                  typeItems={typeItems}
                  paymentItems={paymentItems}
                  authUser={authUser}
                  canViewRentPerMonth={canViewRentPerMonth}
                  canViewTotalAmount={canViewTotalAmount}
                  canViewDepositAmount={canViewDepositAmount}
                  canViewRentUnitPrice={canViewRentUnitPrice}
                  canViewPropertyFeeUnitPrice={canViewPropertyFeeUnitPrice}
                />
              ) : null}
              {editing ? (
                <section className="detail-stack">
                  <div className="system-toolbar">
                    <span className="status-pill">当前状态：<DictBadge items={statusItems} value={editing.status} /></span>
                    <span className="page-actions">
                      {["10", "50"].includes(editing.status) ? (
                        <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.submit} type="button" onClick={() => void submitContractApproval(editing).catch((error: Error) => setMessage(error.message))}>
                          <Send size={16} />
                          提交审批
                        </PermissionButton>
                      ) : null}
                      {editing.status === "30" ? (
                        <>
                          <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.approve} type="button" onClick={() => void approveContract(editing).catch((error: Error) => setMessage(error.message))}>
                            <CheckCircle2 size={16} />
                            审批通过
                          </PermissionButton>
                          <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.reject} type="button" onClick={() => void rejectContract(editing).catch((error: Error) => setMessage(error.message))}>
                            驳回
                          </PermissionButton>
                        </>
                      ) : null}
                      {["10", "30", "50"].includes(editing.status) ? (
                        <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.void} type="button" onClick={() => void voidContract(editing).catch((error: Error) => setMessage(error.message))}>
                          <Ban size={16} />
                          作废
                        </PermissionButton>
                      ) : null}
                      {editing.status === "70" ? (
                        <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.effective} type="button" onClick={() => void effectiveContract().catch((error: Error) => setMessage(error.message))}>
                          <CheckCircle2 size={16} />
                          标记生效
                        </PermissionButton>
                      ) : null}
                    </span>
                  </div>
                  <ApprovalTrail records={editing.approveRecords ?? []} statusItems={statusItems} />
                  <PermissionGuard permission={CONTRACT_PERMISSIONS.statusLog} fallback={<p className="muted-text">当前账号没有查看合同状态日志的权限。</p>}>
                    <ContractStatusTimeline logs={contractStatusLogs} statusItems={statusItems} />
                  </PermissionGuard>
                </section>
              ) : null}
              {editing ? (
                <section className="detail-stack">
                  <div className="system-toolbar">
                    <h3>合同签章归档与附件</h3>
                    {editing.status === "60" ? (
                      <PermissionButton className="primary-button" permission={CONTRACT_PERMISSIONS.archive} type="button" onClick={() => void archiveContract().catch((error: Error) => setMessage(error.message))}>
                        <CheckCircle2 size={16} />
                        归档为已签章
                      </PermissionButton>
                    ) : null}
                  </div>
                  <PermissionGuard permission={CONTRACT_PERMISSIONS.fileRead} fallback={<p className="muted-text">当前账号没有查看合同附件的权限。</p>}>
                    <div className="system-grid">
                      <MetricTile label="合同 PDF" value={archiveForm.contractPdfName || archiveForm.contractPdfFileId || "-"} />
                      <MetricTile label="签章扫描件" value={archiveForm.scanPdfName || archiveForm.scanPdfFileId || "-"} />
                    </div>
                    <div className="table-scroll">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>文件编号</th>
                            <th>文件名</th>
                            <th>类型</th>
                            <th>大小</th>
                            <th>操作</th>
                          </tr>
                        </thead>
                        <tbody>
                          {contractFiles.length === 0 ? (
                            <tr><td colSpan={5}>暂无合同附件</td></tr>
                          ) : contractFiles.map((file) => (
                            <tr key={file.id}>
                              <td>{file.fileCode}</td>
                              <td>{file.originalName}</td>
                              <td>{file.mimeType}</td>
                              <td>{file.fileSize} B</td>
                              <td>
                                <PermissionButton className="primary-button" permission={FILE_PERMISSIONS.download} type="button" onClick={() => void downloadContractFile(file).catch((error: Error) => setMessage(error.message))}>
                                  <Download size={16} />
                                  下载
                                </PermissionButton>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </PermissionGuard>
                  {editing.status === "60" ? (
                    <PermissionGuard permission={FILE_PERMISSIONS.upload} fallback={<p className="muted-text">当前账号没有上传附件权限。</p>}>
                      <div className="system-grid">
                        <section className="detail-stack">
                          <h4>上传合同 PDF</h4>
                          <FileUploader bizType={CONTRACT_FILE_BIZ_TYPE} bizId={editing.id} onUploaded={handleContractPdfUploaded} />
                        </section>
                        <section className="detail-stack">
                          <h4>上传签章扫描件</h4>
                          <FileUploader bizType={CONTRACT_FILE_BIZ_TYPE} bizId={editing.id} onUploaded={handleScanPdfUploaded} />
                        </section>
                      </div>
                    </PermissionGuard>
                  ) : null}
                  {editing.status === "60" ? (
                    <div className="system-grid">
                      <DateField label="签订日期" value={archiveForm.signDate} onChange={(value) => setArchiveFormValue("signDate", value, setArchiveForm)} required />
                      <DateField label="拟生效日期" value={archiveForm.effectiveDate} onChange={(value) => setArchiveFormValue("effectiveDate", value, setArchiveForm)} />
                      <TextField label="归档备注" value={archiveForm.remark} onChange={(value) => setArchiveFormValue("remark", value, setArchiveForm)} />
                    </div>
                  ) : null}
                  {editing.status === "70" ? (
                    <PermissionGuard permission={CONTRACT_PERMISSIONS.effective} fallback={<p className="muted-text">当前账号没有合同生效权限。</p>}>
                      <div className="system-grid">
                        <DateField label="生效日期" value={effectiveForm.effectiveDate} onChange={(value) => setEffectiveFormValue("effectiveDate", value, setEffectiveForm)} required />
                        <TextField label="生效意见" value={effectiveForm.opinion} onChange={(value) => setEffectiveFormValue("opinion", value, setEffectiveForm)} />
                        <label className="field">
                          <span>生效动作</span>
                          <button className="primary-button" type="button" onClick={() => void effectiveContract().catch((error: Error) => setMessage(error.message))}>
                            <CheckCircle2 size={16} />
                            标记合同生效
                          </button>
                        </label>
                      </div>
                    </PermissionGuard>
                  ) : null}
                </section>
              ) : null}
              <form className="form-stack" onSubmit={(event) => void submit(event).catch((error: Error) => setMessage(error.message))}>
                <div className="system-grid">
                  <TextField label="合同编号" value={form.contractCode} onChange={(value) => setFormValue("contractCode", value, setForm)} placeholder="留空自动生成" disabled={coreDisabled} />
                  <TextField label="合同名称" value={form.contractName} onChange={(value) => setFormValue("contractName", value, setForm)} required disabled={coreDisabled} />
                  <SelectField label="合同类型" value={form.contractType} onChange={(value) => setFormValue("contractType", value, setForm)} options={typeItems} allowEmpty disabled={coreDisabled} />
                  <ParkTenantSelect label="租户企业" value={form.parkTenantId} onChange={(value) => setFormValue("parkTenantId", value, setForm)} items={parkTenants} required disabled={coreDisabled} />
                  <DateField label="开始日期" value={form.startDate} onChange={(value) => setFormValue("startDate", value, setForm)} required disabled={coreDisabled} />
                  <DateField label="结束日期" value={form.endDate} onChange={(value) => setFormValue("endDate", value, setForm)} required disabled={coreDisabled} />
                  <DateField label="签署日期" value={form.signDate} onChange={(value) => setFormValue("signDate", value, setForm)} disabled={coreDisabled} />
                  <DateField label="生效日期" value={form.effectiveDate} onChange={(value) => setFormValue("effectiveDate", value, setForm)} disabled={coreDisabled} />
                  {canEditRentUnitPrice ? <NumberField label="租金单价" value={form.rentUnitPrice} onChange={(value) => setFormValue("rentUnitPrice", value, setForm)} disabled={coreDisabled} /> : null}
                  <NumberField label="总面积" value={form.totalArea} onChange={(value) => setFormValue("totalArea", value, setForm)} disabled={coreDisabled} />
                  {canEditRentPerMonth ? <NumberField label="月租金" value={form.rentPerMonth} onChange={(value) => setFormValue("rentPerMonth", value, setForm)} disabled={coreDisabled} /> : null}
                  {canEditTotalAmount ? <NumberField label="合同总金额" value={form.totalAmount} onChange={(value) => setFormValue("totalAmount", value, setForm)} disabled={coreDisabled} /> : null}
                  <NumberField label="押金月数" value={form.depositMonths} onChange={(value) => setFormValue("depositMonths", value, setForm)} disabled={coreDisabled} />
                  {canEditDepositAmount ? <NumberField label="押金金额" value={form.depositAmount} onChange={(value) => setFormValue("depositAmount", value, setForm)} disabled={coreDisabled} /> : null}
                  <NumberField label="免租月数" value={form.freeRentMonths} onChange={(value) => setFormValue("freeRentMonths", value, setForm)} disabled={coreDisabled} />
                  <SelectField label="付款周期" value={form.paymentPeriod} onChange={(value) => setFormValue("paymentPeriod", value, setForm)} options={paymentItems} allowEmpty disabled={coreDisabled} />
                  <NumberField label="提前付款天数" value={form.paymentAdvanceDays} onChange={(value) => setFormValue("paymentAdvanceDays", value, setForm)} step="1" disabled={coreDisabled} />
                  {canEditPropertyFeeUnitPrice ? <NumberField label="物业费单价" value={form.propertyFeeUnitPrice} onChange={(value) => setFormValue("propertyFeeUnitPrice", value, setForm)} disabled={coreDisabled} /> : null}
                  {canEditContractPdf ? <TextField label="合同正文文件 ID" value={form.contractPdfFileId} onChange={(value) => setFormValue("contractPdfFileId", value, setForm)} /> : null}
                  {canEditScanPdf ? <TextField label="扫描件文件 ID" value={form.scanPdfFileId} onChange={(value) => setFormValue("scanPdfFileId", value, setForm)} /> : null}
                </div>
                <section className="page-content">
                  <div className="system-toolbar">
                    <h3>合同房源</h3>
                    <span className="page-actions">
                      {canRecalculate && editing ? (
                        <button className="primary-button" type="button" onClick={() => void recalculateContract().catch((error: Error) => setMessage(error.message))}>
                          <RefreshCw size={16} />
                          重新计算金额
                        </button>
                      ) : null}
                    </span>
                  </div>
                  <div className="system-grid">
                    <MetricTile label="总面积" value={formatArea(form.totalArea)} />
                    <MetricTile label="月租金" value={moneyText(authUser, canViewRentPerMonth, "rentPerMonth", form.rentPerMonth)} />
                    <MetricTile label="合同总金额" value={moneyText(authUser, canViewTotalAmount, "totalAmount", form.totalAmount)} />
                    <MetricTile label="押金金额" value={moneyText(authUser, canViewDepositAmount, "depositAmount", form.depositAmount)} />
                  </div>
                  {!editing ? <p className="status-pill status-muted">请先保存合同草稿，再维护合同房源。</p> : null}
                  {editing && canReadContractUnits ? (
                    <>
                      <div className="system-grid-three">
                        <BuildingSelect label="楼栋" value={unitFilters.buildingId} onChange={(value) => updateUnitFilter("buildingId", value)} items={buildings} allowEmpty />
                        <FloorSelect label="楼层" value={unitFilters.floorId} onChange={(value) => updateUnitFilter("floorId", value)} items={floors.filter((floor) => !unitFilters.buildingId || floor.buildingId === unitFilters.buildingId)} allowEmpty />
                        <SelectField label="出租状态" value={unitFilters.rentalStatus} onChange={(value) => updateUnitFilter("rentalStatus", value)} options={unitRentalStatusItems} allowEmpty />
                      </div>
                      {(unitForm.relId ? canUpdateContractUnits : canCreateContractUnits) ? (
                        <form className="form-stack" onSubmit={(event) => void submitUnit(event).catch((error: Error) => setMessage(error.message))}>
                          <div className="system-grid">
                            <UnitSelect label="房源" value={unitForm.unitId} onChange={(value) => setUnitFormValue("unitId", value, setUnitForm)} items={unitOptions} required />
                            <NumberField label="关联面积" value={unitForm.area} onChange={(value) => setUnitFormValue("area", value, setUnitForm)} placeholder={selectedUnitArea(unitOptions, unitForm.unitId)} />
                            {canEditContractUnitRentUnitPrice ? (
                              <NumberField label="租金单价" value={unitForm.rentUnitPrice} onChange={(value) => setUnitFormValue("rentUnitPrice", value, setUnitForm)} placeholder={selectedUnitRefPrice(unitOptions, unitForm.unitId)} />
                            ) : null}
                            <DateField label="开始日期" value={unitForm.startDate} onChange={(value) => setUnitFormValue("startDate", value, setUnitForm)} />
                            <DateField label="结束日期" value={unitForm.endDate} onChange={(value) => setUnitFormValue("endDate", value, setUnitForm)} />
                            <TextField label="备注" value={unitForm.remark} onChange={(value) => setUnitFormValue("remark", value, setUnitForm)} />
                          </div>
                          <div className="page-actions">
                            <button className="primary-button" type="submit">{unitForm.relId ? "保存房源" : "添加房源"}</button>
                            {unitForm.relId ? <button className="primary-button" type="button" onClick={() => setUnitForm(emptyUnitForm)}>取消编辑</button> : null}
                          </div>
                        </form>
                      ) : null}
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>房源编码</th>
                              <th>房源名称</th>
                              <th>面积</th>
                              <th>租金单价</th>
                              <th>月租金</th>
                              <th>出租状态</th>
                              <th>参考租金</th>
                              <th>关联租期</th>
                              <th>操作</th>
                            </tr>
                          </thead>
                          <tbody>
                            {contractUnits.length === 0 ? (
                              <tr><td colSpan={9}>暂无合同房源</td></tr>
                            ) : contractUnits.map((row) => (
                              <tr key={row.id}>
                                <td>{row.unitCode}</td>
                                <td>{row.unitName}</td>
                                <td>{formatArea(row.area)}</td>
                                <td>{unitMoneyText(authUser, canViewContractUnitRentUnitPrice, FIELD_CONTRACT_UNIT_RENT_UNIT_PRICE, row.rentUnitPrice)}</td>
                                <td>{unitMoneyText(authUser, canViewContractUnitRentAmountPerMonth, FIELD_CONTRACT_UNIT_RENT_AMOUNT_PER_MONTH, row.rentAmountPerMonth)}</td>
                                <td><DictBadge items={unitRentalStatusItems} value={String(row.unit?.rentalStatus ?? "")} /></td>
                                <td>{formatMoney(row.unit?.refPrice)}</td>
                                <td>{formatDate(row.startDate)} 至 {formatDate(row.endDate)}</td>
                                <td>
                                  <span className="data-table-actions">
                                    {canUpdateContractUnits ? (
                                      <button className="primary-button" type="button" onClick={() => openUnitEdit(row)}>
                                        <Edit3 size={16} />
                                        编辑
                                      </button>
                                    ) : null}
                                    {canDeleteContractUnits ? (
                                      <button className="primary-button" type="button" onClick={() => void removeUnit(row).catch((error: Error) => setMessage(error.message))}>
                                        <Trash2 size={16} />
                                        删除
                                      </button>
                                    ) : null}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </section>
                {editing ? <ContractFutureTabs /> : null}
                <TextAreaField label="滞纳金规则" value={form.lateFeeRule} onChange={(value) => setFormValue("lateFeeRule", value, setForm)} disabled={coreDisabled} />
                <TextAreaField label="备注" value={form.remark} onChange={(value) => setFormValue("remark", value, setForm)} />
                <div className="page-actions">
                  <button className="primary-button" type="submit">保存</button>
                  <button className="primary-button" type="button" onClick={() => setShowForm(false)}>取消</button>
                </div>
              </form>
            </section>
          ) : null}
        </main>
      </PermissionGuard>
    </PermissionGuard>
  );
}

function TextField({ label, value, onChange, placeholder, required, disabled, type = "text" }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value} placeholder={placeholder} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, onChange, required, disabled, step = "0.01", placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  step?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="number" value={value} min="0" step={step} required={required} disabled={disabled} placeholder={placeholder} onFocus={(event) => event.target.select()} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function DateField({ label, value, onChange, required, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type="date" value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextAreaField({ label, value, onChange, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} rows={3} />
    </label>
  );
}

function ContractOverview({
  contract,
  parkTenants,
  statusItems,
  typeItems,
  paymentItems,
  authUser,
  canViewRentPerMonth,
  canViewTotalAmount,
  canViewDepositAmount,
  canViewRentUnitPrice,
  canViewPropertyFeeUnitPrice
}: {
  contract: LeasingContractRow;
  parkTenants: ParkTenantRow[];
  statusItems: DictItemRow[];
  typeItems: DictItemRow[];
  paymentItems: DictItemRow[];
  authUser: ReturnType<typeof useAuthUser>;
  canViewRentPerMonth: boolean;
  canViewTotalAmount: boolean;
  canViewDepositAmount: boolean;
  canViewRentUnitPrice: boolean;
  canViewPropertyFeeUnitPrice: boolean;
}) {
  const tenant = contract.parkTenant ?? parkTenants.find((item) => item.id === contract.parkTenantId) ?? null;
  return (
    <section className="detail-stack">
      <div className="system-toolbar">
        <h3>合同基础信息</h3>
        <DictBadge items={statusItems} value={contract.status} />
      </div>
      <div className="system-grid">
        <MetricTile label="总面积" value={formatArea(contract.totalArea)} />
        <MetricTile label="月租金" value={moneyText(authUser, canViewRentPerMonth, "rentPerMonth", contract.rentPerMonth)} />
        <MetricTile label="合同总金额" value={moneyText(authUser, canViewTotalAmount, "totalAmount", contract.totalAmount)} />
        <MetricTile label="押金金额" value={moneyText(authUser, canViewDepositAmount, "depositAmount", contract.depositAmount)} />
      </div>
      <table className="data-table">
        <tbody>
          <DetailRow label="合同编号" value={contract.contractCode} />
          <DetailRow label="合同名称" value={contract.contractName} />
          <DetailRow label="合同类型" value={labelFor(typeItems, contract.contractType)} />
          <DetailRow label="租户企业" value={tenant ? `${tenant.parkTenantCode} ${tenant.companyName}` : contract.parkTenantId} />
          <DetailRow label="租期" value={`${formatDate(contract.startDate)} 至 ${formatDate(contract.endDate)}`} />
          <DetailRow label="租金单价" value={moneyText(authUser, canViewRentUnitPrice, FIELD_RENT_UNIT_PRICE, contract.rentUnitPrice)} />
          <DetailRow label="签署日期" value={formatDate(contract.signDate)} />
          <DetailRow label="生效日期" value={formatDate(contract.effectiveDate)} />
          <DetailRow label="付款周期" value={labelFor(paymentItems, contract.paymentPeriod)} />
          <DetailRow label="提前付款天数" value={String(contract.paymentAdvanceDays ?? 0)} />
          <DetailRow label="物业费单价" value={moneyText(authUser, canViewPropertyFeeUnitPrice, FIELD_PROPERTY_FEE_UNIT_PRICE, contract.propertyFeeUnitPrice)} />
          <DetailRow label="来源类型" value={contract.sourceType} />
        </tbody>
      </table>
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <tr>
      <th>{label}</th>
      <td>{value || "-"}</td>
    </tr>
  );
}

function ContractFutureTabs() {
  const [activeTab, setActiveTab] = useState<"receivables" | "payments">("receivables");
  return (
    <section className="page-content">
      <h3>后续业务</h3>
      <div className="system-tabs">
        <button className={activeTab === "receivables" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("receivables")}>后续应收账单</button>
        <button className={activeTab === "payments" ? "primary-button" : undefined} type="button" onClick={() => setActiveTab("payments")}>后续收款记录</button>
      </div>
      {activeTab === "receivables" ? (
        <EmptyState title="应收模块尚未开发" description="当前阶段不生成应收账单，不展示假数据。" />
      ) : null}
      {activeTab === "payments" ? (
        <EmptyState title="收款模块尚未开发" description="当前阶段不展示收款记录，不展示假数据。" />
      ) : null}
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

function ApprovalTrail({ records, statusItems }: { records: LeasingContractApproveRecord[]; statusItems: DictItemRow[] }) {
  return (
    <section className="table-scroll">
      <h3>审批轨迹</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>动作</th>
            <th>状态变化</th>
            <th>操作人</th>
            <th>意见</th>
            <th>驳回原因</th>
          </tr>
        </thead>
        <tbody>
          {records.length === 0 ? (
            <tr><td colSpan={6}>暂无审批轨迹</td></tr>
          ) : records.map((record, index) => (
            <tr key={`${record.action}-${record.opTime}-${index}`}>
              <td>{formatDateTime(record.opTime)}</td>
              <td>{contractActionLabel(record.action)}</td>
              <td><DictBadge items={statusItems} value={record.fromStatus} /> → <DictBadge items={statusItems} value={record.toStatus} /></td>
              <td>{record.operatorName}</td>
              <td>{record.opinion ?? "-"}</td>
              <td>{record.rejectReason ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ContractStatusTimeline({ logs, statusItems }: { logs: ContractStatusLogRow[]; statusItems: DictItemRow[] }) {
  return (
    <section className="table-scroll">
      <h3>状态日志</h3>
      <table className="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>状态变化</th>
            <th>动作</th>
            <th>操作人</th>
            <th>原因</th>
            <th>备注</th>
          </tr>
        </thead>
        <tbody>
          {logs.length === 0 ? (
            <tr><td colSpan={6}>暂无状态日志</td></tr>
          ) : logs.map((log) => (
            <tr key={log.id}>
              <td>{formatDateTime(log.opTime)}</td>
              <td><DictBadge items={statusItems} value={log.beforeStatus} /> → <DictBadge items={statusItems} value={log.afterStatus} /></td>
              <td>{contractStatusLogActionLabel(log.action)}</td>
              <td>{log.operatorName ?? "-"}</td>
              <td>{log.reason ?? "-"}</td>
              <td>{log.remark ?? "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function SelectField({ label, value, onChange, options, allowEmpty, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DictItemRow[];
  allowEmpty?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部/不选择</option> : null}
        {options.map((option) => (
          <option key={option.id} value={option.itemValue}>{option.itemLabel}</option>
        ))}
      </select>
    </label>
  );
}

function ParkTenantSelect({ label, value, onChange, items, allowEmpty, required, disabled }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: ParkTenantRow[];
  allowEmpty?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部/不选择</option> : <option value="">请选择</option>}
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.companyName}</option>
        ))}
      </select>
    </label>
  );
}

function BuildingSelect({ label, value, onChange, items, allowEmpty }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: BuildingRow[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部/不选择</option> : null}
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.buildingCode} {item.buildingName}</option>
        ))}
      </select>
    </label>
  );
}

function FloorSelect({ label, value, onChange, items, allowEmpty }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: FloorRow[];
  allowEmpty?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {allowEmpty ? <option value="">全部/不选择</option> : null}
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.floorCode} {item.floorName}</option>
        ))}
      </select>
    </label>
  );
}

function UnitSelect({ label, value, onChange, items, required }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: UnitRow[];
  required?: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} required={required} onChange={(event) => onChange(event.target.value)}>
        <option value="">请选择</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>{item.unitCode} {item.unitName}</option>
        ))}
      </select>
    </label>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <section className="metric-card">
      <span>{label}</span>
      <strong className="metric-value">{value || "-"}</strong>
    </section>
  );
}

function DictBadge({ items, value }: { items: DictItemRow[]; value?: string | null }) {
  const item = items.find((entry) => entry.itemValue === value);
  return <span className={`status-pill ${statusClass(item?.tagType)}`}>{item?.itemLabel ?? value ?? "-"}</span>;
}

function statusClass(tagType?: string | null): string {
  if (tagType === "success") return "status-success";
  if (tagType === "warning") return "status-warning";
  if (tagType === "danger") return "status-danger";
  if (tagType === "primary") return "status-primary";
  if (tagType === "info") return "status-info";
  return "status-muted";
}

function labelFor(items: DictItemRow[], value?: string | null): string {
  if (!value) return "-";
  return items.find((item) => item.itemValue === value)?.itemLabel ?? value;
}

function contractActionLabel(action: LeasingContractApproveRecord["action"]): string {
  const labels: Record<LeasingContractApproveRecord["action"], string> = {
    submit: "提交审批",
    approve: "审批通过",
    reject: "审批驳回",
    void: "作废",
    sign: "签章",
    archive: "归档",
    effective: "生效"
  };
  return labels[action] ?? action;
}

function contractStatusLogActionLabel(action: ContractStatusAction): string {
  const labels: Record<ContractStatusAction, string> = {
    create: "创建",
    submit: "提交审批",
    approve: "审批通过",
    reject: "审批驳回",
    void: "作废",
    sign: "签章",
    archive: "归档",
    effective: "生效",
    system: "系统"
  };
  return labels[action] ?? action;
}

function tenantName(items: ParkTenantRow[], id: string): string {
  return items.find((item) => item.id === id)?.companyName ?? "-";
}

function moneyText(user: ReturnType<typeof useAuthUser>, canView: boolean, fieldKey: string, value?: string | null): string {
  return scopedMoneyText(user, canView, CONTRACT_ENTITY, fieldKey, value);
}

function unitMoneyText(user: ReturnType<typeof useAuthUser>, canView: boolean, fieldKey: string, value?: string | null): string {
  return scopedMoneyText(user, canView, CONTRACT_UNIT_ENTITY, fieldKey, value);
}

function scopedMoneyText(user: ReturnType<typeof useAuthUser>, canView: boolean, entityName: string, fieldKey: string, value?: string | null): string {
  if (!canView) return "-";
  const masked = maskField(user, LEASING_MODULE, entityName, fieldKey, value);
  const numberValue = Number(masked);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(masked ?? "-");
}

function formatMoney(value?: string | null): string {
  const numberValue = Number(value ?? 0);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : String(value ?? "-");
}

function formatArea(value?: string | null): string {
  const numberValue = Number(value ?? 0);
  return `${Number.isFinite(numberValue) ? numberValue.toFixed(2) : "0.00"} m²`;
}

function formatDate(value?: string | null): string {
  return value ? value.slice(0, 10) : "-";
}

function formatDateTime(value?: string | null): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-";
}

function emptyToUndefined(value: string): string | undefined {
  const text = value.trim();
  return text ? text : undefined;
}

function numberOrUndefined(value: string): number | undefined {
  const text = value.trim();
  return text ? Number(text) : undefined;
}

function integerOrUndefined(value: string): number | undefined {
  const numberValue = numberOrUndefined(value);
  return numberValue === undefined ? undefined : Math.trunc(numberValue);
}

function selectedUnitArea(items: UnitRow[], unitId: string): string {
  return items.find((item) => item.id === unitId)?.unitArea ?? "";
}

function selectedUnitRefPrice(items: UnitRow[], unitId: string): string {
  return items.find((item) => item.id === unitId)?.refPrice ?? "";
}

function syncFormFromContract(row: LeasingContractRow, setter: (updater: (current: ContractFormState) => ContractFormState) => void) {
  setter(() => ({
    contractCode: row.contractCode,
    contractName: row.contractName,
    contractType: row.contractType ?? "",
    parkTenantId: row.parkTenantId,
    startDate: row.startDate ?? "",
    endDate: row.endDate ?? "",
    signDate: row.signDate ?? "",
    effectiveDate: row.effectiveDate ?? "",
    rentUnitPrice: row.rentUnitPrice ?? "",
    totalArea: row.totalArea ?? "",
    rentPerMonth: row.rentPerMonth ?? "",
    totalAmount: row.totalAmount ?? "",
    depositMonths: row.depositMonths ?? "",
    depositAmount: row.depositAmount ?? "",
    freeRentMonths: row.freeRentMonths ?? "",
    paymentPeriod: row.paymentPeriod ?? "",
    paymentAdvanceDays: String(row.paymentAdvanceDays ?? ""),
    lateFeeRule: row.lateFeeRule ?? "",
    propertyFeeUnitPrice: row.propertyFeeUnitPrice ?? "",
    contractPdfFileId: row.contractPdfFileId ?? "",
    scanPdfFileId: row.scanPdfFileId ?? "",
    remark: row.remark ?? ""
  }));
}

function syncArchiveFormFromContract(row: LeasingContractRow, setter: (updater: (current: ArchiveFormState) => ArchiveFormState) => void) {
  setter((current) => ({
    ...current,
    contractPdfFileId: row.contractPdfFileId ?? current.contractPdfFileId,
    scanPdfFileId: row.scanPdfFileId ?? current.scanPdfFileId,
    signDate: row.signDate ?? current.signDate,
    effectiveDate: row.effectiveDate ?? current.effectiveDate,
    remark: row.remark ?? current.remark
  }));
}

function syncEffectiveFormFromContract(row: LeasingContractRow, setter: (updater: (current: EffectiveFormState) => EffectiveFormState) => void) {
  setter((current) => ({
    ...current,
    effectiveDate: row.effectiveDate ?? current.effectiveDate,
    opinion: current.opinion || emptyEffectiveForm.opinion
  }));
}

function setFormValue<K extends keyof ContractFormState>(
  key: K,
  value: ContractFormState[K],
  setter: (updater: (current: ContractFormState) => ContractFormState) => void
) {
  setter((current) => ({ ...current, [key]: value }));
}

function setUnitFormValue<K extends keyof ContractUnitFormState>(
  key: K,
  value: ContractUnitFormState[K],
  setter: (updater: (current: ContractUnitFormState) => ContractUnitFormState) => void
) {
  setter((current) => ({ ...current, [key]: value }));
}

function setArchiveFormValue<K extends keyof ArchiveFormState>(
  key: K,
  value: ArchiveFormState[K],
  setter: (updater: (current: ArchiveFormState) => ArchiveFormState) => void
) {
  setter((current) => ({ ...current, [key]: value }));
}

function setEffectiveFormValue<K extends keyof EffectiveFormState>(
  key: K,
  value: EffectiveFormState[K],
  setter: (updater: (current: EffectiveFormState) => EffectiveFormState) => void
) {
  setter((current) => ({ ...current, [key]: value }));
}

function ForbiddenInline() {
  return (
    <main className="page-container">
      <section className="module-denied">
        <strong>403</strong>
        <span>当前账号没有合同管理权限。</span>
      </section>
    </main>
  );
}

function ModuleUnauthorizedInline() {
  return (
    <main className="page-container">
      <section className="module-denied">
        <strong>模块未授权</strong>
        <span>当前租户未启用招商租赁模块。</span>
      </section>
    </main>
  );
}
