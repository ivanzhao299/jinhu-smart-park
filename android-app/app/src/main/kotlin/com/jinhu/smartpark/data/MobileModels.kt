package com.jinhu.smartpark.data

import com.google.gson.annotations.SerializedName

data class ApiEnvelope<T>(
    val code: Int,
    val data: T?,
    val message: String? = null
)

data class LoginRequest(
    val username: String,
    val password: String
)

data class SelectContextRequest(
    val tenantId: String,
    val parkId: String,
    val userId: String,
    val ticket: String
)

data class LoginContext(
    val userId: String,
    val username: String,
    val realName: String,
    val tenantId: String,
    val parkId: String
)

data class LoginResult(
    val accessToken: String? = null,
    val requiresContextSelection: Boolean = false,
    val loginTicket: String? = null,
    val contexts: List<LoginContext> = emptyList()
)

data class MobileBootstrap(
    @SerializedName("contract_version") val contractVersion: String,
    val user: MobileUser,
    @SerializedName("current_park") val currentPark: ParkContext?,
    @SerializedName("accessible_parks") val accessibleParks: List<ParkContext>,
    val portals: List<String>,
    val capabilities: List<String>,
    @SerializedName("client_policy") val clientPolicy: ClientPolicy
)

data class MobileUser(
    val id: String,
    val username: String,
    @SerializedName("real_name") val realName: String,
    @SerializedName("avatar_url") val avatarUrl: String? = null,
    @SerializedName("org_name") val orgName: String? = null
)

data class ParkContext(
    @SerializedName("park_id") val parkId: String,
    @SerializedName("park_name") val parkName: String
)

data class ClientPolicy(
    @SerializedName("minimum_version_code") val minimumVersionCode: Int,
    @SerializedName("force_upgrade") val forceUpgrade: Boolean,
    @SerializedName("native_features") val nativeFeatures: Map<String, Boolean>,
    @SerializedName("web_fallback_allowlist") val webFallbackAllowlist: List<String>
)

enum class MobilePortal(val wireName: String, val title: String) {
    EMPLOYEE("employee", "员工端"),
    OWNER("owner", "业主端");

    companion object {
        fun fromWireName(value: String): MobilePortal? = entries.firstOrNull { it.wireName == value }
    }
}
