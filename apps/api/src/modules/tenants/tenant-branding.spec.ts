import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TENANT_BRANDING,
  normalizeBrandingHost,
  normalizeTenantBranding,
  tenantMatchesBrandingHost
} from "./tenant-branding";

describe("tenant branding", () => {
  it("normalizes incomplete configuration with production defaults", () => {
    assert.deepEqual(normalizeTenantBranding({ systemName: "  新平台  " }), {
      ...DEFAULT_TENANT_BRANDING,
      systemName: "新平台"
    });
  });

  it("marks a complete stored branding configuration as configured", () => {
    assert.equal(
      normalizeTenantBranding({
        systemName: "新平台",
        shortName: "新园区",
        logoAlt: "新园区标识"
      }).configured,
      true
    );
  });

  it("exposes only a normalized public URL for a configured logo reference", () => {
    const branding = normalizeTenantBranding({
      systemName: "新平台",
      shortName: "新园区",
      logoAlt: "新园区标识",
      logoFileId: "550e8400-e29b-41d4-a716-446655440000"
    });
    assert.equal(branding.logoFileId, "550e8400-e29b-41d4-a716-446655440000");
    assert.equal(branding.logoUrl, "/api/v1/files/public/brand-logos/550e8400-e29b-41d4-a716-446655440000");
  });

  it("drops invalid logo references instead of exposing arbitrary paths", () => {
    const branding = normalizeTenantBranding({
      systemName: "新平台",
      shortName: "新园区",
      logoAlt: "新园区标识",
      logoFileId: "../../private/file"
    });
    assert.equal(branding.logoFileId, null);
    assert.equal(branding.logoUrl, null);
  });

  it("normalizes host names from host headers and URLs", () => {
    assert.equal(normalizeBrandingHost("Park.CnJinhu.com:443"), "park.cnjinhu.com");
    assert.equal(normalizeBrandingHost("https://park.cnjinhu.com/login"), "park.cnjinhu.com");
  });

  it("matches tenant domains and websites without exposing feature configuration", () => {
    assert.equal(
      tenantMatchesBrandingHost(
        "park.cnjinhu.com:443",
        ["park.cnjinhu.com"],
        ["https://www.cnjinhu.com"]
      ),
      true
    );
    assert.equal(tenantMatchesBrandingHost("other.example.com", ["park.cnjinhu.com"]), false);
  });
});
