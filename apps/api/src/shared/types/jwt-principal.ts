export interface JwtPrincipal {
  sub: string;
  username: string;
  realName?: string;
  tenantId: string;
  parkId: string;
  roles: string[];
  permissions: string[];
  dataScope?: string;
  isSuper?: boolean;
}

export interface JwtSessionClaims {
  sub: string;
  username: string;
  tenantId: string;
  parkId: string;
}
