export interface EngineeringDashboardBucket {
  key: string;
  count: number;
}

export interface EngineeringDashboardContractorRanking {
  contractor_org_id: string | null;
  total_rectifications: number;
  closed_rectifications: number;
  overdue_rectifications: number;
  close_rate: number;
}

export interface EngineeringDashboardOverview {
  summary: {
    project_total: number;
    executing_project_count: number;
    pending_rectification_count: number;
    overdue_rectification_count: number;
    today_inspection_count: number;
    weekly_daily_report_count: number;
    pending_acceptance_count: number;
    acceptance_pass_rate: number;
    rectification_close_rate: number;
  };
  project_status_distribution: EngineeringDashboardBucket[];
  project_type_distribution: EngineeringDashboardBucket[];
  plan_status_distribution: EngineeringDashboardBucket[];
  issue_severity_distribution: EngineeringDashboardBucket[];
  rectification_status_distribution: EngineeringDashboardBucket[];
  acceptance_status_distribution: EngineeringDashboardBucket[];
  contractor_rectification_ranking: EngineeringDashboardContractorRanking[];
  generated_at: string;
}
