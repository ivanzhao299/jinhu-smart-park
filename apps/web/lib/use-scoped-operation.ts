"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, createIdempotencyKey } from "./api-client";
import { getToken } from "./auth";

interface Operation {
  path: string;
  method: "POST" | "PATCH";
  body?: object;
  key: string;
  token: string;
  validate: (value: unknown) => boolean;
  committed: () => void;
}

/** Retain an ambiguous write exactly; scope changes invalidate late responses. */
export function useScopedOperation(scope: string) {
  const epoch = useRef(0);
  const lock = useRef(false);
  const unresolved = useRef<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    epoch.current++;
    lock.current = false;
    unresolved.current = null;
    setPending(false); setWriting(false); setError(""); setSuccess("");
    return () => { epoch.current++; unresolved.current = null; };
  }, [scope]);

  const execute = useCallback(async (operation: Operation) => {
    if (lock.current) return;
    lock.current = true; setWriting(true); setError(""); setSuccess("");
    const generation = epoch.current;
    try {
      const response = await apiRequest<unknown>(operation.path, {
        method: operation.method, body: operation.body, token: operation.token, idempotencyKey: operation.key
      });
      if (generation !== epoch.current) return;
      if (!operation.validate(response.data)) throw new Error("保存回执尚未确认");
      unresolved.current = null; setPending(false);
      setSuccess("操作已保存。读取失败时可单独刷新，无需重复保存。");
      operation.committed();
    } catch (cause) {
      if (generation !== epoch.current) return;
      const definite = cause instanceof ApiError && cause.status >= 400 && cause.status < 500
        && ![408, 425, 429].includes(cause.status)
        && !(cause.status === 409 && /processing|处理中/i.test(cause.message));
      unresolved.current = definite ? null : operation;
      setPending(!definite);
      setError(definite ? cause.message : "结果尚未确认，已保留原请求。请重试原请求。");
    } finally {
      if (generation === epoch.current) { lock.current = false; setWriting(false); }
    }
  }, []);

  const write = (path: string, method: Operation["method"], body: object | undefined,
    validate: Operation["validate"], committed: Operation["committed"]) => {
    if (lock.current || unresolved.current) return;
    void execute({ path, method, body, validate, committed, token: getToken(), key: createIdempotencyKey("enterprise-operation") });
  };
  return { write, retry: () => { if (unresolved.current) void execute(unresolved.current); },
    pending, writing, locked: pending || writing, error, success };
}
