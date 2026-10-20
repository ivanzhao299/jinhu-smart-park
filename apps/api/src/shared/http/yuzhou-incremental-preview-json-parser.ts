import { HttpException } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, YUZHOU_PAYROLL_SOURCE_MAX_BYTES } from "@jinhu/shared";
import type { RequestHandler } from "express";

// Obtain Nest's own JSON parser through its public API without importing a
// transitive body-parser dependency. This adapter only captures the middleware;
// its Express instance is never mounted or used to handle a request.
class JsonParserCaptureAdapter extends ExpressAdapter {
  parser?: RequestHandler;

  override use(parser: RequestHandler): this {
    this.parser = parser;
    return this;
  }
}

export function createYuzhouIncrementalPreviewJsonParser(apiPrefix: string): RequestHandler {
  const prefix = apiPrefix.replace(/^\/+|\/+$/g, "");
  const root = `${prefix ? `/${prefix}` : ""}/hr/imports/yuzhou`;
  const routes = [
    { path: `${root}/incremental/preview`, limit: YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES, label: "incremental import" },
    // The payroll endpoint wraps its bounded package in {"package":...}.
    { path: `${root}/payroll/preview`, limit: YUZHOU_PAYROLL_SOURCE_MAX_BYTES + 12, label: "payroll source import" },
  ].map(route => {
    const adapter = new JsonParserCaptureAdapter();
    adapter.useBodyParser("json", false, { limit: route.limit });
    if (!adapter.parser) throw new Error("Nest JSON parser was not registered");
    return { ...route, parser: adapter.parser };
  });

  // Do not register the underlying function named jsonParser: Nest checks that
  // name during initialization and would omit the ordinary 100kb JSON parser.
  return function yuzhouIncrementalPreviewJsonParser(request, response, next) {
    const route = routes.find(candidate => candidate.path === request.path);
    if (request.method !== "POST" || !route) {
      next();
      return;
    }
    route.parser(request, response, (error?: unknown) => {
      if (!error) {
        next();
        return;
      }
      const status = typeof error === "object" && error !== null && "status" in error
        ? error.status
        : undefined;
      // Raw syntax errors may contain input excerpts. Keep private import rows
      // out of responses and preserve HTTP status through ApiExceptionFilter.
      const safeStatus = status === 413 || status === 415 ? status : 400;
      const message = safeStatus === 413
        ? `${route.label === "incremental import" ? "Incremental import" : "Payroll source import"} request body exceeds the package byte limit`
        : safeStatus === 415
        ? `Unsupported ${route.label} request body encoding`
        : `Invalid ${route.label} JSON body`;
      next(new HttpException(message, safeStatus));
    });
  };
}
