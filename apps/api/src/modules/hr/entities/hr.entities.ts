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
@Entity("hr_payroll_run") @Index(["tenantId","parkId","periodId","runNo"],{unique:true,where:"is_deleted = false"})
export class HrPayrollRunEntity extends AuditableEntity { @Column({name:"period_id",type:"uuid"}) periodId!:string;@Column({name:"run_no",type:"integer"}) runNo!:number;@Column({name:"correction_of_run_id",type:"uuid",nullable:true}) correctionOfRunId!:string|null;@Column({length:32,default:"draft"}) status!:string;@Column({name:"employee_count",type:"integer",default:0}) employeeCount!:number;@Column({name:"gross_total",type:"numeric",precision:18,scale:2,default:0}) grossTotal!:string;@Column({name:"deduction_total",type:"numeric",precision:18,scale:2,default:0}) deductionTotal!:string;@Column({name:"net_total",type:"numeric",precision:18,scale:2,default:0}) netTotal!:string;@Column({name:"calculated_at",type:"timestamptz",nullable:true}) calculatedAt!:Date|null;@Column({name:"reviewed_at",type:"timestamptz",nullable:true}) reviewedAt!:Date|null;@Column({name:"confirmed_at",type:"timestamptz",nullable:true}) confirmedAt!:Date|null;@Column({name:"confirmed_by",type:"uuid",nullable:true}) confirmedBy!:string|null; }
@Entity("hr_payslip") @Index(["tenantId","parkId","runId","employeeId"],{unique:true,where:"is_deleted = false"})
export class HrPayslipEntity extends AuditableEntity { @Column({name:"run_id",type:"uuid"}) runId!:string;@Column({name:"employee_id",type:"uuid"}) employeeId!:string;@Column({name:"compensation_snapshot",type:"jsonb",default:()=>"'{}'::jsonb"}) compensationSnapshot!:Record<string,unknown>;@Column({name:"gross_amount",type:"numeric",precision:18,scale:2}) grossAmount!:string;@Column({name:"deduction_amount",type:"numeric",precision:18,scale:2}) deductionAmount!:string;@Column({name:"personal_tax",type:"numeric",precision:18,scale:2,default:0}) personalTax!:string;@Column({name:"net_amount",type:"numeric",precision:18,scale:2}) netAmount!:string;@Column({length:32,default:"draft"}) status!:string; }
@Entity("hr_approval_request") @Index(["tenantId","parkId","requestNo"],{unique:true,where:"is_deleted = false"})
export class HrApprovalRequestEntity extends AuditableEntity { @Column({name:"request_no",length:64}) requestNo!:string;@Column({name:"request_type",length:32}) requestType!:string;@Column({name:"applicant_employee_id",type:"uuid"}) applicantEmployeeId!:string;@Column({name:"subject_employee_id",type:"uuid"}) subjectEmployeeId!:string;@Column({length:200}) title!:string;@Column({type:"jsonb",default:()=>"'{}'::jsonb"}) payload!:Record<string,unknown>;@Column({length:32,default:"draft"}) status!:string;@Column({name:"current_approver_id",type:"uuid",nullable:true}) currentApproverId!:string|null;@Column({name:"submitted_at",type:"timestamptz",nullable:true}) submittedAt!:Date|null;@Column({name:"completed_at",type:"timestamptz",nullable:true}) completedAt!:Date|null; }
@Entity("hr_approval_action")
export class HrApprovalActionEntity extends AuditableEntity { @Column({name:"request_id",type:"uuid"}) requestId!:string;@Column({length:32}) action!:string;@Column({name:"actor_user_id",type:"uuid"}) actorUserId!:string;@Column({type:"varchar",length:1000,nullable:true}) comment!:string|null;@Column({name:"before_status",length:32}) beforeStatus!:string;@Column({name:"after_status",length:32}) afterStatus!:string; }

export const HR_ENTITIES=[HrPositionEntity,HrEmployeeEntity,HrEmployeeProfileEntity,HrEmploymentEventEntity,HrEmployeeDocumentEntity,HrGoalCycleEntity,HrGoalEntity,HrGoalCheckinEntity,HrWorkReportEntity,HrWorkReportGoalEntity,HrPerformanceCycleEntity,HrPerformancePlanEntity,HrPerformanceItemEntity,HrFeedbackCycleEntity,HrFeedbackAssignmentEntity,HrFeedbackResponseEntity,HrCompensationPlanEntity,HrEmployeeCompensationEntity,HrPayrollPeriodEntity,HrPayrollRunEntity,HrPayslipEntity,HrApprovalRequestEntity,HrApprovalActionEntity];
