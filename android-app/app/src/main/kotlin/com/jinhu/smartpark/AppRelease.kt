package com.jinhu.smartpark

import org.json.JSONObject

data class AppRelease(
    val versionCode: Int,
    val versionName: String,
    val downloadUrl: String,
    val sha256: String,
    val sizeBytes: Long,
    val releaseNotes: String,
) {
    companion object {
        fun fromJson(json: JSONObject): AppRelease {
            require(json.optString("platform") == "android") { "Unsupported release platform" }
            return AppRelease(
                versionCode = json.getInt("versionCode"),
                versionName = json.getString("versionName"),
                downloadUrl = json.getString("downloadUrl"),
                sha256 = json.getString("sha256"),
                sizeBytes = json.getLong("sizeBytes"),
                releaseNotes = json.optString("releaseNotes", "稳定性与体验优化"),
            )
        }
    }
}
