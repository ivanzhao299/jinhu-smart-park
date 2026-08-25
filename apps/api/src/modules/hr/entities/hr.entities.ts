import { Column, Entity, Index } from "typeorm";
import { AuditableEntity } from "../../../shared/entities/auditable.entity";

@Entity("hr_position") @Index(["tenantId","parkId","positionCode"],{unique:true,where:"is_deleted = false"})
export class HrPositionEntity extends AuditableEntity {
 @Column({name:"org_id",type:"uuid"}) orgId!:string;
 @Column({name:"position_code",length:64}) positionCode!:string;
 @Column({name:"position_name",length:100}) positionName!:string;
 @Column({name:"job_family",type:"varchar",length:64,nullable:true}) jobFamily!:string|null;
 @Column({name:"job_level",type:"varchar",length:32,nullable:true}) jobLevel!:string|null;
 @Column({name:"headcount_limit",type:"integer",nullable:true}) headcountLimit!:number|null;
 @Column({length:32,default:"enabled"}) status!:string;
}

@Entity("hr_employee") @Index(["tenantId","parkId","employeeCode"],{unique:true,where:"is_deleted = false"})
export class HrEmployeeEntity extends AuditableEntity {
 @Column({name:"employee_code",length:64}) employeeCode!:string;
 @Column({name:"full_name",length:100}) fullName!:string;
 @Column({name:"user_id",type:"uuid",nullable:true}) userId!:string|null;
 @Column({name:"primary_org_id",type:"uuid",nullable:true}) primaryOrgId!:string|null;
 @Column({name:"position_id",type:"uuid",nullable:true}) positionId!:string|null;
 @Column({name:"manager_employee_id",type:"uuid",nullable:true}) managerEmployeeId!:string|null;
 @Column({name:"employment_type",length:32,default:"full_time"}) employmentType!:string;
 @Column({name:"employment_status",length:32,default:"preboarding"}) employmentStatus!:string;
 @Column({name:"hire_date",type:"date",nullable:true}) hireDate!:string|null;
 @Column({name:"probation_end_date",type:"date",nullable:true}) probationEndDate!:string|null;
 @Column({name:"departure_date",type:"date",nullable:true}) departureDate!:string|null;
 @Column({name:"work_location",type:"varchar",length:128,nullable:true}) workLocation!:string|null;
 @Column({name:"work_mobile",type:"varchar",length:32,nullable:true}) workMobile!:string|null;
 @Column({name:"work_email",type:"varchar",length:128,nullable:true}) workEmail!:string|null;
}

@Entity("hr_employee_profile")
export class HrEmployeeProfileEntity extends AuditableEntity {
 @Column({name:"employee_id",type:"uuid"}) employeeId!:string;
 @Column({name:"id_type",type:"varchar",length:32,nullable:true}) idType!:string|null;
 @Column({name:"id_number_masked",type:"varchar",length:64,nullable:true}) idNumberMasked!:string|null;
 @Column({name:"personal_mobile",type:"varchar",length:32,nullable:true}) personalMobile!:string|null;
 @Column({name:"personal_email",type:"varchar",length:128,nullable:true}) personalEmail!:string|null;
 @Column({type:"varchar",length:500,nullable:true}) address!:string|null;
 @Column({name:"emergency_contact_name",type:"varchar",length:100,nullable:true}) emergencyContactName!:string|null;
 @Column({name:"emergency_contact_mobile",type:"varchar",length:32,nullable:true}) emergencyContactMobile!:string|null;
}

@Entity("hr_employment_event")
export class HrEmploymentEventEntity extends AuditableEntity {
 @Column({name:"employee_id",type:"uuid"}) employeeId!:string;
 @Column({name:"event_type",length:32}) eventType!:string;
 @Column({name:"effective_date",type:"date"}) effectiveDate!:string;
 @Column({name:"before_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) beforeSnapshot!:Record<string,unknown>;
 @Column({name:"after_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) afterSnapshot!:Record<string,unknown>;
 @Column({type:"varchar",length:500,nullable:true}) reason!:string|null;
 @Column({length:32,default:"effective"}) status!:string;
 @Column({name:"legacy_event_no",type:"varchar",length:64,nullable:true}) legacyEventNo!:string|null;
 @Column({name:"legacy_event_type",type:"varchar",length:32,nullable:true}) legacyEventType!:string|null;
 @Column({name:"legacy_state",type:"varchar",length:32,nullable:true}) legacyState!:string|null;
 @Column({name:"source_effective_at",type:"timestamp",nullable:true}) sourceEffectiveAt!:Date|null;
 @Column({name:"migration_decision",type:"varchar",length:32,nullable:true}) migrationDecision!:string|null;
 @Column({name:"is_historical_import",type:"boolean",default:false}) isHistoricalImport!:boolean;
}

@Entity("hr_employee_document")
export class HrEmployeeDocumentEntity extends AuditableEntity {
 @Column({name:"employee_id",type:"uuid"}) employeeId!:string;
 @Column({name:"document_type",length:64}) documentType!:string;
 @Column({name:"file_id",type:"uuid"}) fileId!:string;
 @Column({name:"document_name",length:255}) documentName!:string;
 @Column({name:"valid_from",type:"date",nullable:true}) validFrom!:string|null;
 @Column({name:"valid_to",type:"date",nullable:true}) validTo!:string|null;
 @Column({length:32,default:"active"}) status!:string;
}

@Entity("hr_goal_cycle") @Index(["tenantId","parkId","cycleCode"],{unique:true,where:"is_deleted = false"})
export class HrGoalCycleEntity extends AuditableEntity {
 @Column({name:"cycle_code",length:64}) cycleCode!:string; @Column({name:"cycle_name",length:100}) cycleName!:string;
 @Column({name:"start_date",type:"date"}) startDate!:string; @Column({name:"end_date",type:"date"}) endDate!:string;
 @Column({length:32,default:"draft"}) status!:string;
}

@Entity("hr_goal")
export class HrGoalEntity extends AuditableEntity {
 @Column({name:"cycle_id",type:"uuid"}) cycleId!:string; @Column({name:"parent_goal_id",type:"uuid",nullable:true}) parentGoalId!:string|null;
 @Column({name:"goal_level",length:32}) goalLevel!:string; @Column({name:"goal_name",length:200}) goalName!:string;
 @Column({name:"owner_org_id",type:"uuid",nullable:true}) ownerOrgId!:string|null; @Column({name:"owner_employee_id",type:"uuid",nullable:true}) ownerEmployeeId!:string|null;
 @Column({type:"numeric",precision:7,scale:4,default:1}) weight!:string; @Column({name:"metric_name",type:"varchar",length:100,nullable:true}) metricName!:string|null;
 @Column({name:"target_value",type:"numeric",precision:18,scale:4,nullable:true}) targetValue!:string|null; @Column({name:"current_value",type:"numeric",precision:18,scale:4,nullable:true}) currentValue!:string|null;
 @Column({type:"varchar",length:32,nullable:true}) unit!:string|null; @Column({type:"numeric",precision:7,scale:4,default:0}) progress!:string;
 @Column({name:"start_date",type:"date"}) startDate!:string; @Column({name:"due_date",type:"date"}) dueDate!:string; @Column({length:32,default:"draft"}) status!:string;
}

@Entity("hr_goal_checkin")
export class HrGoalCheckinEntity extends AuditableEntity {
 @Column({name:"goal_id",type:"uuid"}) goalId!:string; @Column({type:"numeric",precision:7,scale:4}) progress!:string;
 @Column({name:"current_value",type:"numeric",precision:18,scale:4,nullable:true}) currentValue!:string|null;
 @Column({length:2000}) summary!:string; @Column({type:"varchar",length:2000,nullable:true}) risks!:string|null;
 @Column({name:"evidence_file_id",type:"uuid",nullable:true}) evidenceFileId!:string|null;
}

@Entity("hr_work_report") @Index(["tenantId","parkId","employeeId","reportType","periodStart"],{unique:true,where:"is_deleted = false"})
export class HrWorkReportEntity extends AuditableEntity {
 @Column({name:"employee_id",type:"uuid"}) employeeId!:string; @Column({name:"report_type",length:16}) reportType!:string;
 @Column({name:"period_start",type:"date"}) periodStart!:string; @Column({name:"period_end",type:"date"}) periodEnd!:string;
 @Column({name:"completed_work",type:"text"}) completedWork!:string; @Column({name:"next_plan",type:"text",nullable:true}) nextPlan!:string|null;
 @Column({type:"text",nullable:true}) risks!:string|null; @Column({name:"collaboration_needs",type:"text",nullable:true}) collaborationNeeds!:string|null;
 @Column({type:"numeric",precision:8,scale:2,nullable:true}) hours!:string|null; @Column({length:32,default:"draft"}) status!:string;
 @Column({name:"reviewer_employee_id",type:"uuid",nullable:true}) reviewerEmployeeId!:string|null; @Column({name:"review_comment",type:"varchar",length:1000,nullable:true}) reviewComment!:string|null;
 @Column({name:"submitted_at",type:"timestamptz",nullable:true}) submittedAt!:Date|null; @Column({name:"reviewed_at",type:"timestamptz",nullable:true}) reviewedAt!:Date|null;
}

@Entity("hr_work_report_goal") @Index(["tenantId","parkId","reportId","goalId"],{unique:true,where:"is_deleted = false"})
export class HrWorkReportGoalEntity extends AuditableEntity {
 @Column({name:"report_id",type:"uuid"}) reportId!:string; @Column({name:"goal_id",type:"uuid"}) goalId!:string;
 @Column({name:"progress_delta",type:"numeric",precision:7,scale:4,nullable:true}) progressDelta!:string|null;
}

@Entity("hr_performance_cycle") @Index(["tenantId","parkId","cycleCode"],{unique:true,where:"is_deleted = false"})
export class HrPerformanceCycleEntity extends AuditableEntity {
 @Column({name:"cycle_code",length:64}) cycleCode!:string; @Column({name:"cycle_name",length:100}) cycleName!:string;
 @Column({name:"start_date",type:"date"}) startDate!:string; @Column({name:"end_date",type:"date"}) endDate!:string;
 @Column({name:"self_review_end",type:"date",nullable:true}) selfReviewEnd!:string|null; @Column({name:"manager_review_end",type:"date",nullable:true}) managerReviewEnd!:string|null;
 @Column({name:"calibration_end",type:"date",nullable:true}) calibrationEnd!:string|null; @Column({length:32,default:"draft"}) status!:string;
}
@Entity("hr_performance_plan") @Index(["tenantId","parkId","cycleId","employeeId"],{unique:true,where:"is_deleted = false"})
export class HrPerformancePlanEntity extends AuditableEntity {
 @Column({name:"cycle_id",type:"uuid"}) cycleId!:string; @Column({name:"employee_id",type:"uuid"}) employeeId!:string; @Column({name:"manager_employee_id",type:"uuid",nullable:true}) managerEmployeeId!:string|null;
 @Column({length:32,default:"draft"}) status!:string; @Column({name:"self_score",type:"numeric",precision:7,scale:2,nullable:true}) selfScore!:string|null;
 @Column({name:"manager_score",type:"numeric",precision:7,scale:2,nullable:true}) managerScore!:string|null; @Column({name:"calibrated_score",type:"numeric",precision:7,scale:2,nullable:true}) calibratedScore!:string|null;
 @Column({name:"final_score",type:"numeric",precision:7,scale:2,nullable:true}) finalScore!:string|null; @Column({name:"self_summary",type:"varchar",length:4000,nullable:true}) selfSummary!:string|null;
 @Column({name:"manager_comment",type:"varchar",length:4000,nullable:true}) managerComment!:string|null; @Column({name:"calibration_comment",type:"varchar",length:4000,nullable:true}) calibrationComment!:string|null;
 @Column({name:"confirmed_at",type:"timestamptz",nullable:true}) confirmedAt!:Date|null;
}
@Entity("hr_performance_item")
export class HrPerformanceItemEntity extends AuditableEntity { @Column({name:"plan_id",type:"uuid"}) planId!:string;@Column({name:"goal_id",type:"uuid",nullable:true}) goalId!:string|null;@Column({name:"item_name",length:200}) itemName!:string;@Column({type:"numeric",precision:7,scale:4}) weight!:string;@Column({name:"target_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) targetSnapshot!:Record<string,unknown>;@Column({name:"self_score",type:"numeric",precision:7,scale:2,nullable:true}) selfScore!:string|null;@Column({name:"manager_score",type:"numeric",precision:7,scale:2,nullable:true}) managerScore!:string|null;@Column({name:"final_score",type:"numeric",precision:7,scale:2,nullable:true}) finalScore!:string|null;@Column({type:"varchar",length:2000,nullable:true}) comment!:string|null; }
@Entity("hr_feedback_cycle")
export class HrFeedbackCycleEntity extends AuditableEntity {
 @Column({name:"performance_cycle_id",type:"uuid"}) performanceCycleId!:string; @Column({name:"cycle_name",length:100}) cycleName!:string;
 @Column({default:true}) anonymous!:boolean; @Column({name:"minimum_anonymous_responses",type:"integer",default:3}) minimumAnonymousResponses!:number; @Column({length:32,default:"draft"}) status!:string;
}
@Entity("hr_feedback_assignment") @Index(["tenantId","parkId","feedbackCycleId","subjectEmployeeId","reviewerEmployeeId"],{unique:true,where:"is_deleted = false"})
export class HrFeedbackAssignmentEntity extends AuditableEntity {
 @Column({name:"feedback_cycle_id",type:"uuid"}) feedbackCycleId!:string; @Column({name:"subject_employee_id",type:"uuid"}) subjectEmployeeId!:string;
 @Column({name:"reviewer_employee_id",type:"uuid"}) reviewerEmployeeId!:string; @Column({name:"relation_type",length:32}) relationType!:string;
 @Column({type:"numeric",precision:7,scale:4}) weight!:string; @Column({length:32,default:"pending"}) status!:string; @Column({name:"submitted_at",type:"timestamptz",nullable:true}) submittedAt!:Date|null;
}
@Entity("hr_feedback_response") @Index(["tenantId","parkId","assignmentId"],{unique:true,where:"is_deleted = false"})
export class HrFeedbackResponseEntity extends AuditableEntity {
 @Column({name:"assignment_id",type:"uuid"}) assignmentId!:string; @Column({type:"numeric",precision:7,scale:2}) score!:string;
 @Column({type:"varchar",length:3000,nullable:true}) strengths!:string|null; @Column({type:"varchar",length:3000,nullable:true}) improvements!:string|null; @Column({name:"submitted_at",type:"timestamptz"}) submittedAt!:Date;
}
@Entity("hr_compensation_plan") @Index(["tenantId","parkId","planCode"],{unique:true,where:"is_deleted = false"})
export class HrCompensationPlanEntity extends AuditableEntity { @Column({name:"plan_code",length:64}) planCode!:string;@Column({name:"plan_name",length:100}) planName!:string;@Column({name:"effective_from",type:"date"}) effectiveFrom!:string;@Column({name:"effective_to",type:"date",nullable:true}) effectiveTo!:string|null;@Column({length:32,default:"draft"}) status!:string;@Column({length:8,default:"CNY"}) currency!:string; }
@Entity("hr_employee_compensation")
export class HrEmployeeCompensationEntity extends AuditableEntity { @Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"plan_id",type:"uuid"}) planId!:string;@Column({name:"effective_from",type:"date"}) effectiveFrom!:string;@Column({name:"effective_to",type:"date",nullable:true}) effectiveTo!:string|null;@Column({name:"base_salary",type:"numeric",precision:18,scale:2}) baseSalary!:string;@Column({name:"allowance_amount",type:"numeric",precision:18,scale:2,default:0}) allowanceAmount!:string;@Column({name:"variable_target",type:"numeric",precision:18,scale:2,default:0}) variableTarget!:string;@Column({length:32,default:"active"}) status!:string;@Column({name:"approved_by",type:"uuid",nullable:true}) approvedBy!:string|null; }
@Entity("hr_payroll_period") @Index(["tenantId","parkId","periodMonth"],{unique:true,where:"is_deleted = false"})
export class HrPayrollPeriodEntity extends AuditableEntity { @Column({name:"period_month",type:"date"}) periodMonth!:string;@Column({name:"start_date",type:"date"}) startDate!:string;@Column({name:"end_date",type:"date"}) endDate!:string;@Column({length:32,default:"open"}) status!:string; }
@Entity("hr_payroll_run") @Index(["tenantId","parkId","periodId","runNo"],{unique:true,where:"is_deleted = false"}) @Index(["tenantId","parkId","periodId"],{unique:true,where:"is_deleted = false AND correction_of_run_id IS NULL"})
export class HrPayrollRunEntity extends AuditableEntity { @Column({name:"period_id",type:"uuid"}) periodId!:string;@Column({name:"run_no",type:"integer"}) runNo!:number;@Column({name:"correction_of_run_id",type:"uuid",nullable:true}) correctionOfRunId!:string|null;@Column({length:32,default:"draft"}) status!:string;@Column({name:"employee_count",type:"integer",default:0}) employeeCount!:number;@Column({name:"gross_total",type:"numeric",precision:18,scale:2,default:0}) grossTotal!:string;@Column({name:"deduction_total",type:"numeric",precision:18,scale:2,default:0}) deductionTotal!:string;@Column({name:"net_total",type:"numeric",precision:18,scale:2,default:0}) netTotal!:string;@Column({name:"calculated_at",type:"timestamptz",nullable:true}) calculatedAt!:Date|null;@Column({name:"reviewed_at",type:"timestamptz",nullable:true}) reviewedAt!:Date|null;@Column({name:"confirmed_at",type:"timestamptz",nullable:true}) confirmedAt!:Date|null;@Column({name:"confirmed_by",type:"uuid",nullable:true}) confirmedBy!:string|null; }
@Entity("hr_payslip") @Index(["tenantId","parkId","runId","employeeId"],{unique:true,where:"is_deleted = false"})
export class HrPayslipEntity extends AuditableEntity { @Column({name:"run_id",type:"uuid"}) runId!:string;@Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"compensation_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) compensationSnapshot!:Record<string,unknown>;@Column({name:"gross_amount",type:"numeric",precision:18,scale:2}) grossAmount!:string;@Column({name:"deduction_amount",type:"numeric",precision:18,scale:2}) deductionAmount!:string;@Column({name:"personal_tax",type:"numeric",precision:18,scale:2,default:0}) personalTax!:string;@Column({name:"net_amount",type:"numeric",precision:18,scale:2}) netAmount!:string;@Column({length:32,default:"draft"}) status!:string; }

@Entity("hr_payroll_book")
export class HrPayrollBookEntity extends AuditableEntity { @Column({name:"source_system",length:64}) sourceSystem!:string;@Column({name:"legacy_scheme",type:"integer"}) legacyScheme!:number;@Column({name:"book_name",type:"varchar",length:200,nullable:true}) bookName!:string|null;@Column({name:"source_hash",length:64}) sourceHash!:string;@Column({length:32}) status!:string; }
@Entity("hr_payroll_item_definition")
export class HrPayrollItemDefinitionEntity extends AuditableEntity { @Column({name:"book_id",type:"uuid"}) bookId!:string;@Column({name:"legacy_item_name",length:64}) legacyItemName!:string;@Column({name:"item_code",length:96}) itemCode!:string; }
@Entity("hr_payroll_item_version")
export class HrPayrollItemVersionEntity extends AuditableEntity { @Column({name:"item_definition_id",type:"uuid"}) itemDefinitionId!:string;@Column({name:"version_no",type:"integer"}) versionNo!:number;@Column({name:"display_name",length:200}) displayName!:string;@Column({name:"value_type",length:16}) valueType!:string;@Column({name:"legacy_item_type",length:64}) legacyItemType!:string;@Column({name:"legacy_add_or_sub",length:32}) legacyAddOrSub!:string;@Column({name:"item_category",length:32}) itemCategory!:string;@Column({name:"decimal_scale",type:"integer",nullable:true}) decimalScale!:number|null;@Column({name:"sort_no",type:"integer"}) sortNo!:number;@Column({type:"boolean",nullable:true}) taxable!:boolean|null;@Column({name:"print_enabled",type:"boolean",nullable:true}) printEnabled!:boolean|null;@Column({type:"boolean"}) enabled!:boolean;@Column({name:"source_hash",length:64}) sourceHash!:string; }
@Entity("hr_payroll_formula_version")
export class HrPayrollFormulaVersionEntity extends AuditableEntity { @Column({name:"book_id",type:"uuid"}) bookId!:string;@Column({name:"item_version_id",type:"uuid",nullable:true}) itemVersionId!:string|null;@Column({name:"legacy_formula_id",type:"integer"}) legacyFormulaId!:number;@Column({name:"version_no",type:"integer"}) versionNo!:number;@Column({name:"raw_expression",type:"text"}) rawExpression!:string;@Column({name:"raw_condition",type:"text",nullable:true}) rawCondition!:string|null;@Column({name:"expression_hash",length:64}) expressionHash!:string;@Column({name:"parser_version",type:"varchar",length:32,nullable:true}) parserVersion!:string|null;@Column({name:"parse_status",length:32}) parseStatus!:string;@Column({name:"dsl_ast",type:"jsonb",nullable:true}) dslAst!:Record<string,unknown>|null;@Column({name:"dependency_codes",type:"jsonb"}) dependencyCodes!:string[];@Column({name:"calculation_order",type:"integer"}) calculationOrder!:number;@Column({name:"reviewed_by",type:"uuid",nullable:true}) reviewedBy!:string|null;@Column({name:"reviewed_at",type:"timestamptz",nullable:true}) reviewedAt!:Date|null;@Column({name:"review_reason",type:"varchar",length:1000,nullable:true}) reviewReason!:string|null; }
@Entity("hr_payroll_book_period")
export class HrPayrollBookPeriodEntity extends AuditableEntity { @Column({name:"book_id",type:"uuid"}) bookId!:string;@Column({name:"period_month",type:"date"}) periodMonth!:string;@Column({name:"legacy_close_state",type:"integer"}) legacyCloseState!:number;@Column({name:"source_hash",length:64}) sourceHash!:string; }
@Entity("hr_payroll_book_membership") export class HrPayrollBookMembershipEntity extends AuditableEntity { @Column({name:"book_id",type:"uuid"}) bookId!:string;@Column({name:"employee_id",type:"uuid",nullable:true}) employeeId!:string|null;@Column({name:"legacy_membership_id",type:"integer"}) legacyMembershipId!:number;@Column({name:"legacy_employee_hash",length:64}) legacyEmployeeHash!:string;@Column({name:"mapping_status",length:32}) mappingStatus!:string;@Column({name:"source_hash",length:64}) sourceHash!:string; }
@Entity("hr_payroll_tax_rule_version") export class HrPayrollTaxRuleVersionEntity extends AuditableEntity { @Column({name:"legacy_tax_id",type:"integer"}) legacyTaxId!:number;@Column({name:"version_no",type:"integer"}) versionNo!:number;@Column({name:"base_amount",type:"numeric",precision:20,scale:4,nullable:true}) baseAmount!:string|null;@Column({name:"lower_limit",type:"numeric",precision:20,scale:4,nullable:true}) lowerLimit!:string|null;@Column({name:"upper_limit",type:"numeric",precision:20,scale:4,nullable:true}) upperLimit!:string|null;@Column({name:"tax_percent",type:"numeric",precision:20,scale:4,nullable:true}) taxPercent!:string|null;@Column({name:"offset_amount",type:"numeric",precision:20,scale:4,nullable:true}) offsetAmount!:string|null;@Column({name:"source_hash",length:64}) sourceHash!:string; }
@Entity("hr_payroll_legacy_batch")
export class HrPayrollLegacyBatchEntity extends AuditableEntity { @Column({name:"batch_code",length:64}) batchCode!:string;@Column({name:"source_system",length:64}) sourceSystem!:string;@Column({name:"source_backup_hash",length:64}) sourceBackupHash!:string;@Column({name:"catalog_hash",length:64}) catalogHash!:string;@Column({name:"manifest_hash",length:64}) manifestHash!:string;@Column({name:"source_row_count",type:"bigint"}) sourceRowCount!:string;@Column({name:"loaded_row_count",type:"bigint"}) loadedRowCount!:string;@Column({name:"quarantined_row_count",type:"bigint"}) quarantinedRowCount!:string;@Column({name:"source_amount_total",type:"numeric",precision:20,scale:4,nullable:true}) sourceAmountTotal!:string|null;@Column({name:"loaded_amount_total",type:"numeric",precision:20,scale:4,nullable:true}) loadedAmountTotal!:string|null;@Column({length:32}) status!:string;@Column({name:"replaces_batch_id",type:"uuid",nullable:true}) replacesBatchId!:string|null;@Column({name:"published_at",type:"timestamptz",nullable:true}) publishedAt!:Date|null;@Column({name:"published_by",type:"uuid",nullable:true}) publishedBy!:string|null; }
@Entity("hr_payroll_legacy_snapshot")
export class HrPayrollLegacySnapshotEntity extends AuditableEntity { @Column({name:"batch_id",type:"uuid"}) batchId!:string;@Column({name:"book_period_id",type:"uuid"}) bookPeriodId!:string;@Column({name:"employee_id",type:"uuid",nullable:true}) employeeId!:string|null;@Column({name:"legacy_source_table",length:16}) legacySourceTable!:string;@Column({name:"legacy_employee_hash",length:64}) legacyEmployeeHash!:string;@Column({name:"legacy_department_hash",type:"varchar",length:64,nullable:true}) legacyDepartmentHash!:string|null;@Column({name:"source_content_group_hash",length:64}) sourceContentGroupHash!:string;@Column({name:"source_multiplicity",type:"integer"}) sourceMultiplicity!:number;@Column({name:"mapping_status",length:32}) mappingStatus!:string;@Column({name:"gross_amount",type:"numeric",precision:20,scale:4,nullable:true}) grossAmount!:string|null;@Column({name:"deduction_amount",type:"numeric",precision:20,scale:4,nullable:true}) deductionAmount!:string|null;@Column({name:"tax_amount",type:"numeric",precision:20,scale:4,nullable:true}) taxAmount!:string|null;@Column({name:"net_amount",type:"numeric",precision:20,scale:4,nullable:true}) netAmount!:string|null;@Column({name:"source_hash",length:64}) sourceHash!:string; }
@Entity("hr_payroll_legacy_snapshot_item")
export class HrPayrollLegacySnapshotItemEntity extends AuditableEntity { @Column({name:"snapshot_id",type:"uuid"}) snapshotId!:string;@Column({name:"item_version_id",type:"uuid",nullable:true}) itemVersionId!:string|null;@Column({name:"legacy_column_name",length:64}) legacyColumnName!:string;@Column({name:"value_type",length:16}) valueType!:string;@Column({name:"is_source_null",type:"boolean"}) isSourceNull!:boolean;@Column({name:"raw_value",type:"text",nullable:true}) rawValue!:string|null;@Column({name:"decimal_value",type:"numeric",precision:20,scale:4,nullable:true}) decimalValue!:string|null;@Column({name:"text_value",type:"text",nullable:true}) textValue!:string|null;@Column({name:"date_value",type:"date",nullable:true}) dateValue!:string|null;@Column({name:"sort_no",type:"integer"}) sortNo!:number;@Column({name:"source_hash",length:64}) sourceHash!:string; }
@Entity("hr_payroll_review_case")
export class HrPayrollReviewCaseEntity extends AuditableEntity { @Column({name:"batch_id",type:"uuid"}) batchId!:string;@Column({name:"snapshot_id",type:"uuid",nullable:true}) snapshotId!:string|null;@Column({name:"formula_version_id",type:"uuid",nullable:true}) formulaVersionId!:string|null;@Column({name:"case_type",length:32}) caseType!:string;@Column({name:"subject_hash",length:64}) subjectHash!:string;@Column({name:"evidence_summary",type:"jsonb"}) evidenceSummary!:Record<string,unknown>;@Column({length:16}) status!:string; }
@Entity("hr_payroll_review_action")
export class HrPayrollReviewActionEntity extends AuditableEntity { @Column({name:"review_case_id",type:"uuid"}) reviewCaseId!:string;@Column({name:"sequence_no",type:"integer"}) sequenceNo!:number;@Column({length:32}) action!:string;@Column({length:32}) decision!:string;@Column({length:1000}) comment!:string;@Column({name:"actor_id",type:"uuid"}) actorId!:string; }
@Entity("hr_payroll_reconciliation_run")
export class HrPayrollReconciliationRunEntity extends AuditableEntity {
  @Column({ name: "legacy_batch_id", type: "uuid" }) legacyBatchId!: string;
  @Column({ name: "attendance_input_batch_id", type: "uuid" })
  attendanceInputBatchId!: string;
  @Column({ name: "parser_version", length: 32 }) parserVersion!: string;
  @Column({ name: "engine_version", length: 32 }) engineVersion!: string;
  @Column({
    name: "tolerance_amount",
    type: "numeric",
    precision: 20,
    scale: 4,
  })
  toleranceAmount!: string;
  @Column({ length: 32, default: "calculating" }) status!: string;
  @Column({ name: "frozen_employee_version", type: "jsonb" })
  frozenEmployeeVersion!: Record<string, unknown>;
  @Column({ name: "frozen_compensation_version", type: "jsonb" })
  frozenCompensationVersion!: Record<string, unknown>;
  @Column({ name: "frozen_insurance_version", type: "jsonb" })
  frozenInsuranceVersion!: Record<string, unknown>;
  @Column({ name: "frozen_formula_version", type: "jsonb" })
  frozenFormulaVersion!: Record<string, unknown>;
  @Column({ name: "input_snapshot_hash", length: 64 })
  inputSnapshotHash!: string;
  @Column({ name: "supersedes_run_id", type: "uuid", nullable: true })
  supersedesRunId!: string | null;
  @Column({ name: "employee_count", type: "integer" }) employeeCount!: number;
  @Column({ name: "difference_count", type: "integer" })
  differenceCount!: number;
}
@Entity("hr_payroll_reconciliation_policy_version")
export class HrPayrollReconciliationPolicyVersionEntity extends AuditableEntity {
  @Column({ name: "book_id", type: "uuid" }) bookId!: string;
  @Column({ name: "net_item_version_id", type: "uuid" })
  netItemVersionId!: string;
  @Column({ name: "version_no", type: "integer" }) versionNo!: number;
  @Column({
    name: "tolerance_amount",
    type: "numeric",
    precision: 20,
    scale: 4,
  })
  toleranceAmount!: string;
  @Column({ length: 32, default: "approved" }) status!: string;
  @Column({ name: "reviewed_by", type: "uuid" }) reviewedBy!: string;
  @Column({ name: "reviewed_at", type: "timestamptz" }) reviewedAt!: Date;
  @Column({ name: "review_reason", length: 1000 }) reviewReason!: string;
}
@Entity("hr_payroll_reconciliation_result")
export class HrPayrollReconciliationResultEntity extends AuditableEntity {
  @Column({ name: "run_id", type: "uuid" }) runId!: string;
  @Column({ name: "employee_id", type: "uuid" }) employeeId!: string;
  @Column({ name: "legacy_snapshot_id", type: "uuid" })
  legacySnapshotId!: string;
  @Column({ name: "employee_version", type: "integer" })
  employeeVersion!: number;
  @Column({ name: "compensation_version_id", type: "uuid", nullable: true })
  compensationVersionId!: string | null;
  @Column({ name: "insurance_period_id", type: "uuid", nullable: true })
  insurancePeriodId!: string | null;
  @Column({ name: "attendance_input_item_id", type: "uuid" })
  attendanceInputItemId!: string;
  @Column({ name: "old_total", type: "numeric", precision: 20, scale: 4 })
  oldTotal!: string;
  @Column({ name: "new_total", type: "numeric", precision: 20, scale: 4 })
  newTotal!: string;
  @Column({ name: "delta_total", type: "numeric", precision: 20, scale: 4 })
  deltaTotal!: string;
  @Column({ name: "review_status", length: 32 }) reviewStatus!: string;
}
@Entity("hr_payroll_reconciliation_item_difference")
export class HrPayrollReconciliationItemDifferenceEntity extends AuditableEntity {
  @Column({ name: "result_id", type: "uuid" }) resultId!: string;
  @Column({ name: "item_version_id", type: "uuid" }) itemVersionId!: string;
  @Column({ name: "formula_version_id", type: "uuid" })
  formulaVersionId!: string;
  @Column({ name: "old_amount", type: "numeric", precision: 20, scale: 4 })
  oldAmount!: string;
  @Column({ name: "new_amount", type: "numeric", precision: 20, scale: 4 })
  newAmount!: string;
  @Column({ name: "delta_amount", type: "numeric", precision: 20, scale: 4 })
  deltaAmount!: string;
  @Column({
    name: "tolerance_amount",
    type: "numeric",
    precision: 20,
    scale: 4,
  })
  toleranceAmount!: string;
  @Column({ name: "review_status", length: 32 }) reviewStatus!: string;
  @Column({ name: "input_source_versions", type: "jsonb" })
  inputSourceVersions!: Record<string, unknown>;
  @Column({ name: "evaluation_hash", length: 64 }) evaluationHash!: string;
}
@Entity("hr_payroll_reconciliation_review_action")
export class HrPayrollReconciliationReviewActionEntity extends AuditableEntity {
  @Column({ name: "run_id", type: "uuid" }) runId!: string;
  @Column({ name: "result_id", type: "uuid", nullable: true }) resultId!:
    | string
    | null;
  @Column({ name: "item_difference_id", type: "uuid", nullable: true })
  itemDifferenceId!: string | null;
  @Column({ name: "sequence_no", type: "integer" }) sequenceNo!: number;
  @Column({ length: 32 }) decision!: string;
  @Column({ length: 1000 }) comment!: string;
  @Column({ name: "actor_id", type: "uuid" }) actorId!: string;
}
@Entity("hr_approval_request") @Index(["tenantId","parkId","requestNo"],{unique:true,where:"is_deleted = false"})
export class HrApprovalRequestEntity extends AuditableEntity { @Column({name:"request_no",length:64}) requestNo!:string;@Column({name:"request_type",length:32}) requestType!:string;@Column({name:"applicant_employee_id",type:"uuid"}) applicantEmployeeId!:string;@Column({name:"subject_employee_id",type:"uuid"}) subjectEmployeeId!:string;@Column({length:200}) title!:string;@Column({type:"jsonb",default:()=>"'{}'::jsonb"}) payload!:Record<string,unknown>;@Column({length:32,default:"draft"}) status!:string;@Column({name:"current_approver_id",type:"uuid",nullable:true}) currentApproverId!:string|null;@Column({name:"submitted_at",type:"timestamptz",nullable:true}) submittedAt!:Date|null;@Column({name:"completed_at",type:"timestamptz",nullable:true}) completedAt!:Date|null; }
@Entity("hr_approval_action")
export class HrApprovalActionEntity extends AuditableEntity { @Column({name:"request_id",type:"uuid"}) requestId!:string;@Column({length:32}) action!:string;@Column({name:"actor_user_id",type:"uuid"}) actorUserId!:string;@Column({type:"varchar",length:1000,nullable:true}) comment!:string|null;@Column({name:"before_status",length:32}) beforeStatus!:string;@Column({name:"after_status",length:32}) afterStatus!:string; }

@Entity("hr_contract_type") @Index(["tenantId","parkId","typeCode"],{unique:true,where:"is_deleted = false"})
export class HrContractTypeEntity extends AuditableEntity { @Column({name:"type_code",length:32}) typeCode!:string;@Column({name:"type_name",length:100}) typeName!:string;@Column({length:32,default:"enabled"}) status!:string;@Column({name:"is_historical_import",type:"boolean",default:false}) isHistoricalImport!:boolean; }
@Entity("hr_contract") @Index(["tenantId","parkId","contractNo"],{unique:true,where:"is_deleted = false"})
export class HrContractEntity extends AuditableEntity { @Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"contract_type_id",type:"uuid"}) contractTypeId!:string;@Column({name:"contract_no",length:64}) contractNo!:string;@Column({name:"start_date",type:"date",nullable:true}) startDate!:string|null;@Column({name:"end_date",type:"date",nullable:true}) endDate!:string|null;@Column({name:"probation_end_date",type:"date",nullable:true}) probationEndDate!:string|null;@Column({length:32}) status!:string;@Column({name:"is_historical_import",type:"boolean",default:false}) isHistoricalImport!:boolean;@Column({name:"source_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) sourceSnapshot!:Record<string,unknown>; }
@Entity("hr_contract_change") @Index(["tenantId","parkId","contractId","sequenceNo"],{unique:true,where:"is_deleted = false"})
export class HrContractChangeEntity extends AuditableEntity { @Column({name:"contract_id",type:"uuid"}) contractId!:string;@Column({name:"sequence_no",type:"integer"}) sequenceNo!:number;@Column({name:"change_type",length:32}) changeType!:string;@Column({name:"previous_start_date",type:"date",nullable:true}) previousStartDate!:string|null;@Column({name:"previous_end_date",type:"date",nullable:true}) previousEndDate!:string|null;@Column({name:"new_start_date",type:"date"}) newStartDate!:string;@Column({name:"new_end_date",type:"date",nullable:true}) newEndDate!:string|null;@Column({name:"signed_at",type:"timestamp",nullable:true}) signedAt!:Date|null;@Column({length:32,default:"effective"}) status!:string;@Column({name:"is_historical_import",type:"boolean",default:false}) isHistoricalImport!:boolean;@Column({name:"source_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) sourceSnapshot!:Record<string,unknown>; }
@Entity("hr_attendance_import_batch") export class HrAttendanceImportBatchEntity extends AuditableEntity { @Column({name:"batch_code",length:64}) batchCode!:string;@Column({name:"source_system",length:64}) sourceSystem!:string;@Column({name:"source_checksum",length:64}) sourceChecksum!:string;@Column({length:32,default:"imported"}) status!:string;@Column({name:"is_historical_import",default:true}) isHistoricalImport!:boolean; }
@Entity("hr_attendance_calendar_source") export class HrAttendanceCalendarSourceEntity extends AuditableEntity { @Column({name:"import_batch_id",type:"uuid"}) importBatchId!:string;@Column({name:"legacy_id",type:"integer"}) legacyId!:number;@Column({name:"calendar_name",type:"varchar",length:100,nullable:true}) calendarName!:string|null;@Column({name:"calendar_year",type:"integer"}) calendarYear!:number;@Column({name:"calendar_month",type:"integer"}) calendarMonth!:number;@Column({name:"source_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) sourceSnapshot!:Record<string,unknown>; }
@Entity("hr_attendance_day") export class HrAttendanceDayEntity extends AuditableEntity { @Column({name:"calendar_source_id",type:"uuid"}) calendarSourceId!:string;@Column({name:"attendance_date",type:"date"}) attendanceDate!:string;@Column({name:"legacy_symbol",type:"varchar",length:64,nullable:true}) legacySymbol!:string|null;@Column({name:"symbol_status",length:32}) symbolStatus!:string;@Column({name:"normalized_kind",type:"varchar",length:32,nullable:true}) normalizedKind!:string|null; }
@Entity("hr_attendance_symbol_rule") export class HrAttendanceSymbolRuleEntity extends AuditableEntity { @Column({name:"rule_version",length:32}) ruleVersion!:string;@Column({name:"legacy_symbol",length:64}) legacySymbol!:string;@Column({name:"normalized_kind",length:32}) normalizedKind!:string;@Column({name:"effective_from",type:"date",nullable:true}) effectiveFrom!:string|null;@Column({name:"effective_to",type:"date",nullable:true}) effectiveTo!:string|null;@Column({length:32,default:"enabled"}) status!:string;@Column({name:"is_historical_import",default:true}) isHistoricalImport!:boolean; }
@Entity("hr_insurance_policy") export class HrInsurancePolicyEntity extends AuditableEntity { @Column({name:"policy_code",length:64}) policyCode!:string;@Column({name:"policy_name",type:"varchar",length:200,nullable:true}) policyName!:string|null;@Column({name:"scope_description",type:"varchar",length:500,nullable:true}) scopeDescription!:string|null;@Column({length:32,default:"historical"}) status!:string; }
@Entity("hr_insurance_policy_item") export class HrInsurancePolicyItemEntity extends AuditableEntity { @Column({name:"policy_id",type:"uuid"}) policyId!:string;@Column({name:"insurance_kind",length:32}) insuranceKind!:string;@Column({name:"variant_no",type:"integer"}) variantNo!:number;@Column({name:"employer_rate",type:"numeric",precision:18,scale:6,nullable:true}) employerRate!:string|null;@Column({name:"employee_rate",type:"numeric",precision:18,scale:6,nullable:true}) employeeRate!:string|null; }
@Entity("hr_employee_insurance_period") export class HrEmployeeInsurancePeriodEntity extends AuditableEntity { @Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"period_year",type:"integer"}) periodYear!:number;@Column({name:"period_month",type:"integer"}) periodMonth!:number;@Column({name:"legacy_id",type:"integer"}) legacyId!:number;@Column({name:"needs_review",default:false}) needsReview!:boolean;@Column({name:"source_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) sourceSnapshot!:Record<string,unknown>; }
@Entity("hr_employee_insurance_item") export class HrEmployeeInsuranceItemEntity extends AuditableEntity { @Column({name:"period_id",type:"uuid"}) periodId!:string;@Column({name:"insurance_kind",length:32}) insuranceKind!:string;@Column({name:"contribution_base",type:"numeric",precision:18,scale:2,nullable:true}) contributionBase!:string|null;@Column({name:"total_amount",type:"numeric",precision:18,scale:2,nullable:true}) totalAmount!:string|null;@Column({name:"employer_amount",type:"numeric",precision:18,scale:2,nullable:true}) employerAmount!:string|null;@Column({name:"employee_amount",type:"numeric",precision:18,scale:2,nullable:true}) employeeAmount!:string|null;@Column({name:"supplement_amount",type:"numeric",precision:18,scale:2,nullable:true}) supplementAmount!:string|null;@Column({name:"legacy_base_negative",default:false}) legacyBaseNegative!:boolean; }
@Entity("hr_attendance_request") @Index(["tenantId","parkId","requestNo"],{unique:true,where:"is_deleted = false"})
export class HrAttendanceRequestEntity extends AuditableEntity { @Column({name:"request_no",length:64}) requestNo!:string;@Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"request_type",length:32}) requestType!:string;@Column({name:"start_at",type:"timestamptz",nullable:true}) startAt!:Date|null;@Column({name:"end_at",type:"timestamptz",nullable:true}) endAt!:Date|null;@Column({name:"attendance_date",type:"date",nullable:true}) attendanceDate!:string|null;@Column({name:"duration_minutes",type:"integer",default:0}) durationMinutes!:number;@Column({type:"varchar",length:2000}) reason!:string;@Column({length:32,default:"draft"}) status!:string;@Column({name:"approval_request_id",type:"uuid",nullable:true}) approvalRequestId!:string|null;@Column({name:"submitted_at",type:"timestamptz",nullable:true}) submittedAt!:Date|null;@Column({name:"reviewed_at",type:"timestamptz",nullable:true}) reviewedAt!:Date|null;@Column({name:"reviewed_by",type:"uuid",nullable:true}) reviewedBy!:string|null;@Column({name:"review_comment",type:"varchar",length:1000,nullable:true}) reviewComment!:string|null; }

@Entity("hr_attendance_shift")
export class HrAttendanceShiftEntity extends AuditableEntity { @Column({name:"shift_code",length:64}) shiftCode!:string;@Column({name:"shift_name",length:100}) shiftName!:string;@Column({length:64,default:"Asia/Shanghai"}) timezone!:string;@Column({name:"start_local",type:"time"}) startLocal!:string;@Column({name:"end_local",type:"time"}) endLocal!:string;@Column({name:"crosses_midnight",default:false}) crossesMidnight!:boolean;@Column({name:"late_grace_minutes",type:"integer",default:0}) lateGraceMinutes!:number;@Column({name:"early_grace_minutes",type:"integer",default:0}) earlyGraceMinutes!:number;@Column({name:"rule_version",length:32}) ruleVersion!:string;@Column({length:32,default:"enabled"}) status!:string; }
@Entity("hr_employee_schedule")
export class HrEmployeeScheduleEntity extends AuditableEntity { @Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"shift_id",type:"uuid"}) shiftId!:string;@Column({name:"work_date",type:"date"}) workDate!:string;@Column({length:32,default:"manual"}) source!:string; }
@Entity("hr_attendance_punch_event")
export class HrAttendancePunchEventEntity extends AuditableEntity { @Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"event_key",length:160}) eventKey!:string;@Column({name:"occurred_at",type:"timestamptz"}) occurredAt!:Date;@Column({name:"event_type",length:32}) eventType!:string;@Column({length:32}) source!:string;@Column({name:"device_code",type:"varchar",length:100,nullable:true}) deviceCode!:string|null;@Column({name:"received_at",type:"timestamptz"}) receivedAt!:Date;@Column({name:"payload_digest",type:"varchar",length:64,nullable:true}) payloadDigest!:string|null; }
@Entity("hr_attendance_calculation_version")
export class HrAttendanceCalculationVersionEntity extends AuditableEntity { @Column({name:"version_code",length:64}) versionCode!:string;@Column({name:"algorithm_version",length:32}) algorithmVersion!:string;@Column({name:"rule_version",length:32}) ruleVersion!:string;@Column({length:64,default:"Asia/Shanghai"}) timezone!:string;@Column({name:"triggered_by",type:"uuid",nullable:true}) triggeredBy!:string|null;@Column({name:"triggered_at",type:"timestamptz"}) triggeredAt!:Date; }
@Entity("hr_employee_attendance_daily_result")
export class HrEmployeeAttendanceDailyResultEntity extends AuditableEntity { @Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"work_date",type:"date"}) workDate!:string;@Column({name:"schedule_id",type:"uuid",nullable:true}) scheduleId!:string|null;@Column({name:"calculation_version_id",type:"uuid"}) calculationVersionId!:string;@Column({name:"first_in_at",type:"timestamptz",nullable:true}) firstInAt!:Date|null;@Column({name:"last_out_at",type:"timestamptz",nullable:true}) lastOutAt!:Date|null;@Column({name:"worked_minutes",type:"integer",default:0}) workedMinutes!:number;@Column({name:"late_minutes",type:"integer",default:0}) lateMinutes!:number;@Column({name:"early_minutes",type:"integer",default:0}) earlyMinutes!:number;@Column({name:"result_status",length:32}) resultStatus!:string;@Column({name:"anomaly_codes",type:"jsonb",default:()=>"'[]'::jsonb"}) anomalyCodes!:string[];@Column({name:"correction_request_id",type:"uuid",nullable:true}) correctionRequestId!:string|null;@Column({name:"source_trace",type:"jsonb",default:()=>"'{}'::jsonb"}) sourceTrace!:Record<string,unknown>; }
@Entity("hr_attendance_period")
export class HrAttendancePeriodEntity extends AuditableEntity { @Column({name:"period_month",type:"date"}) periodMonth!:string;@Column({length:32,default:"open"}) status!:string;@Column({name:"active_version",type:"integer",default:0}) activeVersion!:number;@Column({name:"calculation_started_at",type:"timestamptz",nullable:true}) calculationStartedAt!:Date|null;@Column({name:"calculation_completed_at",type:"timestamptz",nullable:true}) calculationCompletedAt!:Date|null;@Column({name:"failure_code",type:"varchar",length:64,nullable:true}) failureCode!:string|null;@Column({name:"closed_at",type:"timestamptz",nullable:true}) closedAt!:Date|null;@Column({name:"closed_by",type:"uuid",nullable:true}) closedBy!:string|null; }
@Entity("hr_attendance_month_summary")
export class HrAttendanceMonthSummaryEntity extends AuditableEntity { @Column({name:"period_id",type:"uuid"}) periodId!:string;@Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"summary_version",type:"integer"}) summaryVersion!:number;@Column({name:"scheduled_days",type:"integer"}) scheduledDays!:number;@Column({name:"normal_days",type:"integer"}) normalDays!:number;@Column({name:"worked_minutes",type:"integer"}) workedMinutes!:number;@Column({name:"late_minutes",type:"integer"}) lateMinutes!:number;@Column({name:"early_minutes",type:"integer"}) earlyMinutes!:number;@Column({name:"absence_days",type:"integer"}) absenceDays!:number;@Column({name:"missing_punch_days",type:"integer"}) missingPunchDays!:number;@Column({name:"source_daily_trace",type:"jsonb"}) sourceDailyTrace!:Array<Record<string,unknown>>;@Column({name:"calculated_at",type:"timestamptz"}) calculatedAt!:Date; }
@Entity("hr_attendance_payroll_input_batch")
export class HrAttendancePayrollInputBatchEntity extends AuditableEntity { @Column({name:"period_id",type:"uuid"}) periodId!:string;@Column({name:"batch_no",type:"integer"}) batchNo!:number;@Column({name:"batch_type",length:32}) batchType!:string;@Column({name:"correction_of_batch_id",type:"uuid",nullable:true}) correctionOfBatchId!:string|null;@Column({length:32,default:"effective"}) status!:string;@Column({type:"varchar",length:1000,nullable:true}) reason!:string|null;@Column({name:"created_from_summary_version",type:"integer"}) createdFromSummaryVersion!:number; }
@Entity("hr_attendance_payroll_input_item")
export class HrAttendancePayrollInputItemEntity extends AuditableEntity { @Column({name:"batch_id",type:"uuid"}) batchId!:string;@Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"source_summary_id",type:"uuid"}) sourceSummaryId!:string;@Column({name:"worked_minutes",type:"integer"}) workedMinutes!:number;@Column({name:"late_minutes",type:"integer"}) lateMinutes!:number;@Column({name:"early_minutes",type:"integer"}) earlyMinutes!:number;@Column({name:"absence_days",type:"integer"}) absenceDays!:number;@Column({name:"missing_punch_days",type:"integer"}) missingPunchDays!:number;@Column({name:"difference_trace",type:"jsonb"}) differenceTrace!:Record<string,unknown>; }

export const HR_ENTITIES=[HrPositionEntity,HrEmployeeEntity,HrEmployeeProfileEntity,HrEmploymentEventEntity,HrEmployeeDocumentEntity,HrGoalCycleEntity,HrGoalEntity,HrGoalCheckinEntity,HrWorkReportEntity,HrWorkReportGoalEntity,HrPerformanceCycleEntity,HrPerformancePlanEntity,HrPerformanceItemEntity,HrFeedbackCycleEntity,HrFeedbackAssignmentEntity,HrFeedbackResponseEntity,HrCompensationPlanEntity,HrEmployeeCompensationEntity,HrPayrollPeriodEntity,HrPayrollRunEntity,HrPayslipEntity,HrPayrollBookEntity,HrPayrollItemDefinitionEntity,HrPayrollItemVersionEntity,HrPayrollFormulaVersionEntity,HrPayrollBookPeriodEntity,HrPayrollBookMembershipEntity,HrPayrollTaxRuleVersionEntity,HrPayrollLegacyBatchEntity,HrPayrollLegacySnapshotEntity,HrPayrollLegacySnapshotItemEntity,HrPayrollReviewCaseEntity,HrPayrollReviewActionEntity,HrPayrollReconciliationPolicyVersionEntity,HrPayrollReconciliationRunEntity,HrPayrollReconciliationResultEntity,HrPayrollReconciliationItemDifferenceEntity,HrPayrollReconciliationReviewActionEntity,HrApprovalRequestEntity,HrApprovalActionEntity,HrContractTypeEntity,HrContractEntity,HrContractChangeEntity,HrAttendanceImportBatchEntity,HrAttendanceCalendarSourceEntity,HrAttendanceDayEntity,HrAttendanceSymbolRuleEntity,HrInsurancePolicyEntity,HrInsurancePolicyItemEntity,HrEmployeeInsurancePeriodEntity,HrEmployeeInsuranceItemEntity,HrAttendanceRequestEntity,HrAttendanceShiftEntity,HrEmployeeScheduleEntity,HrAttendancePunchEventEntity,HrAttendanceCalculationVersionEntity,HrEmployeeAttendanceDailyResultEntity,HrAttendancePeriodEntity,HrAttendanceMonthSummaryEntity,HrAttendancePayrollInputBatchEntity,HrAttendancePayrollInputItemEntity];
