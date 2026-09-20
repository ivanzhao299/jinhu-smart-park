import type { EntityManager } from "typeorm";
import type { AuthRefreshTokenEntity } from "./entities/auth-refresh-token.entity";

export const AUTH_REFRESH_SCOPE_WRITER = Symbol("AUTH_REFRESH_SCOPE_WRITER");

export interface AuthRefreshScopeWriter {
  persist(manager: EntityManager, token: AuthRefreshTokenEntity): Promise<void>;
}
