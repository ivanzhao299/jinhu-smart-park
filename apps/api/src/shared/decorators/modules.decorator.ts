import { applyDecorators, SetMetadata } from "@nestjs/common";

export const MODULES_KEY = "required_modules";
export const ANY_MODULES_KEY = "required_any_modules";

export const RequireModule = (...moduleCodes: string[]) => applyDecorators(
  SetMetadata(MODULES_KEY, moduleCodes),
  SetMetadata(ANY_MODULES_KEY, [])
);

export const RequireAnyModule = (...moduleCodes: string[]) => applyDecorators(
  SetMetadata(MODULES_KEY, []),
  SetMetadata(ANY_MODULES_KEY, moduleCodes)
);
