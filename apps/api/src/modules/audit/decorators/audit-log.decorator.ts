import { SetMetadata } from "@nestjs/common";

export const AUDIT_LOG_KEY = "auditLog";

export interface AuditLogOptions {
  module: string;
  resource?: string;
  action: string;
  bizType?: string;
  bizIdParam?: string;
  captureBody?: boolean;
}

export const AuditLog = (options: AuditLogOptions) => SetMetadata(AUDIT_LOG_KEY, options);
