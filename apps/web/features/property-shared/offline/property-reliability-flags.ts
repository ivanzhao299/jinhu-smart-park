export const PROPERTY_OFFLINE_DRAFTS_PUBLIC_ENV = "NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1";
export const PROPERTY_UPLOAD_QUEUE_PUBLIC_ENV = "NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1";

export function propertyReliabilityFlagEnabled(value: unknown): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

export function propertyReliabilityPublicEnv(
  environment: Record<string, string | undefined>
): Record<string, "true" | "false"> {
  return {
    [PROPERTY_OFFLINE_DRAFTS_PUBLIC_ENV]: propertyReliabilityFlagEnabled(
      environment.PROPERTY_OFFLINE_DRAFTS_V1
    ) ? "true" : "false",
    [PROPERTY_UPLOAD_QUEUE_PUBLIC_ENV]: propertyReliabilityFlagEnabled(
      environment.PROPERTY_UPLOAD_QUEUE_V1
    ) ? "true" : "false"
  };
}

export function propertyOfflineDraftsV1Enabled(): boolean {
  return propertyReliabilityFlagEnabled(process.env.NEXT_PUBLIC_PROPERTY_OFFLINE_DRAFTS_V1);
}

export function propertyUploadQueueV1Enabled(): boolean {
  return propertyReliabilityFlagEnabled(process.env.NEXT_PUBLIC_PROPERTY_UPLOAD_QUEUE_V1);
}
