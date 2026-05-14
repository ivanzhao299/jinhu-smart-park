export interface JwtPrincipal {
  sub: string;
  username: string;
  realName?: string;
  tenantId: string;
  parkId: string;
  roles: string[];
  permissions: string[];
}
