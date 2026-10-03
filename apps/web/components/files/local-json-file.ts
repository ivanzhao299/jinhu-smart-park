export interface LocalJsonFilePolicy {
  maxBytes: number;
}

export function validateLocalJsonFile(file: Pick<File, "name" | "type" | "size">, policy: LocalJsonFilePolicy): void {
  if (!/\.json$/i.test(file.name) || !["", "application/json", "text/json"].includes(file.type)) {
    throw new Error("请选择 JSON 文件。");
  }
  if (file.size <= 0 || file.size > policy.maxBytes) {
    throw new Error(`文件不能为空，且不能超过 ${policy.maxBytes / 1024 / 1024} MiB。`);
  }
}

export function parseLocalJson(text: string, policy: LocalJsonFilePolicy): unknown {
  if (new TextEncoder().encode(text).byteLength > policy.maxBytes) {
    throw new Error(`文件不能超过 ${policy.maxBytes / 1024 / 1024} MiB。`);
  }
  try {
    return JSON.parse(text);
  } catch {
    // Native parser messages may contain private source values.
    throw new Error("JSON 格式无效，请检查源数据包后重新选择。");
  }
}
