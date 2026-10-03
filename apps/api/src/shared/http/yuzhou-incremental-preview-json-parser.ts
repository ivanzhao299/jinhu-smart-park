import { HttpException } from "@nestjs/common";
import { ExpressAdapter } from "@nestjs/platform-express";
import { YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES } from "@jinhu/shared";
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
  const path = `${prefix ? `/${prefix}` : ""}/hr/imports/yuzhou/incremental/preview`;
  const adapter = new JsonParserCaptureAdapter();
  adapter.useBodyParser("json", false, { limit: YUZHOU_INCREMENTAL_MAX_PACKAGE_BYTES });
  const parser = adapter.parser;
  if (!parser) throw new Error("Nest JSON parser was not registered");

  // Do not register the underlying function named jsonParser: Nest checks that
  // name during initialization and would omit the ordinary 100kb JSON parser.
  return function yuzhouIncrementalPreviewJsonParser(request, response, next) {
    if (request.method !== "POST" || request.path !== path) {
      next();
      return;
    }
    parser(request, response, (error?: unknown) => {
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
        ? "Incremental import request body exceeds the package byte limit"
        : safeStatus === 415
        ? "Unsupported incremental import request body encoding"
        : "Invalid incremental import JSON body";
      next(new HttpException(message, safeStatus));
    });
  };
}
