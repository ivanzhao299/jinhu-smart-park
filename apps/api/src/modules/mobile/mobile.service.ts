import { Injectable } from "@nestjs/common";
import {
  MOBILE_BOOTSTRAP_CONTRACT_VERSION,
  projectMobileCapabilities,
  type MobileBootstrapResponse,
  type TenantParkScope
} from "@jinhu/shared";
import { UsersService } from "../users/users.service";

@Injectable()
export class MobileService {
  constructor(private readonly usersService: UsersService) {}

  async bootstrap(scope: TenantParkScope, userId: string): Promise<MobileBootstrapResponse> {
    const context = await this.usersService.getCurrentUserContext(scope, userId);
    const projection = projectMobileCapabilities(context);

    return {
      contract_version: MOBILE_BOOTSTRAP_CONTRACT_VERSION,
      user: {
        id: context.id,
        username: context.username,
        real_name: context.real_name,
        avatar_url: context.avatar_url,
        org_id: context.org_id,
        org_name: context.org_name,
        roles: context.roles
      },
      current_park: context.current_park ?? null,
      accessible_parks: context.accessible_parks ?? [],
      portals: projection.portals,
      capabilities: projection.capabilities,
      home: {
        cards: [],
        unread_count: 0
      },
      client_policy: {
        minimum_version_code: 1,
        force_upgrade: false,
        native_features: {},
        web_fallback_allowlist: []
      }
    };
  }
}
