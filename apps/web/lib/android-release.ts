export interface AndroidReleaseManifest {
  platform: "android";
  versionCode: number;
  versionName: string;
  fileName: string;
  downloadUrl: string;
  sha256: string;
  sizeBytes: number;
  builtAt: string;
  commit: string;
  releaseNotes: string;
}

export function parseAndroidReleaseManifest(value: unknown): AndroidReleaseManifest {
  if (!value || typeof value !== "object") throw new Error("客户端版本清单格式无效");
  const candidate = value as Record<string, unknown>;
  if (
    candidate.platform !== "android" ||
    !Number.isInteger(candidate.versionCode) ||
    typeof candidate.versionName !== "string" ||
    typeof candidate.fileName !== "string" ||
    typeof candidate.downloadUrl !== "string" ||
    typeof candidate.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(candidate.sha256) ||
    typeof candidate.sizeBytes !== "number" ||
    typeof candidate.builtAt !== "string" ||
    typeof candidate.commit !== "string" ||
    typeof candidate.releaseNotes !== "string"
  ) {
    throw new Error("客户端版本清单字段不完整");
  }
  if (!candidate.downloadUrl.startsWith("/downloads/android/") || !candidate.fileName.endsWith(".apk")) {
    throw new Error("客户端版本清单下载地址无效");
  }
  return candidate as unknown as AndroidReleaseManifest;
}

export function formatBinarySize(sizeBytes: number): string {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) return "—";
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / 1024 / 1024).toFixed(1)} MB`;
}
