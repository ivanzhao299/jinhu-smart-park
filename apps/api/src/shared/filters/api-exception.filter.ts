import type { ArgumentsHost, ExceptionFilter} from "@nestjs/common";
import { Catch, HttpException, HttpStatus } from "@nestjs/common";
import type { Response } from "express";
import { ClsService } from "nestjs-cls";
import type { ApiResponse } from "@jinhu/shared";

interface ErrorResponseBody {
  message?: string | string[];
  error?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly cls: ClsService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.resolveStatus(exception);
    const body = exception instanceof HttpException ? exception.getResponse() : undefined;
    const message = this.isDatabaseConflict(exception)
      ? "Resource conflicts with an existing active record"
      : this.resolveMessage(body, exception);
    const payload: ApiResponse<null> = {
      code: status,
      message,
      data: null,
      request_id: this.cls.getId() ?? "",
      server_time: Date.now()
    };
    response.status(status).json(payload);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) return exception.getStatus();
    return this.isDatabaseConflict(exception) ? HttpStatus.CONFLICT : HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private isDatabaseConflict(exception: unknown): boolean {
    if (!exception || typeof exception !== "object") return false;
    const value = exception as { code?: unknown; driverError?: { code?: unknown } };
    const code = value.code ?? value.driverError?.code;
    return code === "23P01";
  }

  private resolveMessage(body: string | object | undefined, exception: unknown): string {
    if (typeof body === "string") {
      return body;
    }
    if (this.isErrorBody(body)) {
      if (Array.isArray(body.message)) {
        return body.message.join("; ");
      }
      return body.message ?? body.error ?? "Request failed";
    }
    return exception instanceof Error ? exception.message : "Internal server error";
  }

  private isErrorBody(value: unknown): value is ErrorResponseBody {
    return typeof value === "object" && value !== null;
  }
}
