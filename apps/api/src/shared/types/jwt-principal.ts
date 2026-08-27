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
  authVersion?: number;
}

export interface JwtSessionClaims {
  sub: string;
  username: string;
  tenantId: string;
  parkId: string;
  authVersion?: number;
}
