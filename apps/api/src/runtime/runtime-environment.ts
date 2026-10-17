import {parsePartyDataKeyring} from "../shared/security/party-data-keyring";
import {parseApplicationRuntimeMode} from "./runtime-mode";
import {isAbsolute} from "node:path";
function getEnvString(config: Record<string, unknown>, key: string, fallback = ""): string {
  const value = config[key];
  if (typeof value === "string") {
    return value;
  }
  return fallback;
}

export function validateProductionAuthEnvironment(config: Record<string, unknown>): Record<string, unknown> {
  const nodeEnv = getEnvString(config, "NODE_ENV", process.env.NODE_ENV ?? "development");
  parsePartyDataKeyring((key) => config[key]);
  if (nodeEnv !== "production") {
    return config;
  }

  const fixedCode = getEnvString(config, "AUTH_SMS_FIXED_CODE", "");
  if (fixedCode.trim().length > 0) {
    throw new Error("AUTH_SMS_FIXED_CODE must be empty in production");
  }

  const showMockCode = getEnvString(config, "AUTH_SMS_CODE_VISIBLE", "false");
  if (showMockCode === "true") {
    throw new Error("AUTH_SMS_CODE_VISIBLE must be false in production");
  }

  const wechatMockEnabled = getEnvString(config, "AUTH_WECHAT_MOCK_ENABLED", "false");
  if (wechatMockEnabled === "true") {
    throw new Error("AUTH_WECHAT_MOCK_ENABLED must be false in production");
  }

  return config;
}

export function validateRuntimeEnvironment(config:Record<string,unknown>){validateProductionAuthEnvironment(config);const mode=parseApplicationRuntimeMode(config.APP_RUNTIME_MODE);if(mode==='hr_enterprise'){
 if(typeof config.POSTGRES_DB!=='string'||!config.POSTGRES_DB.trim()||config.POSTGRES_DB==='jinhu_smart_park')throw new Error('Independent HR requires its dedicated POSTGRES_DB');
 if(typeof config.FILE_STORAGE_LOCAL_ROOT!=='string'||!isAbsolute(config.FILE_STORAGE_LOCAL_ROOT))throw new Error('Independent HR requires an explicit absolute FILE_STORAGE_LOCAL_ROOT');
 if(config.AUTH_SMS_ENABLED==='true'||config.AUTH_WECHAT_ENABLED==='true')throw new Error('Independent HR supports password authentication only');
 }return config;}
