package com.jinhu.smartpark.data

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class SessionStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()
    private val preferences = EncryptedSharedPreferences.create(
        context,
        "smart_park_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var accessToken: String?
        get() = preferences.getString(KEY_ACCESS_TOKEN, null)
        set(value) = preferences.edit().apply {
            if (value == null) remove(KEY_ACCESS_TOKEN) else putString(KEY_ACCESS_TOKEN, value)
        }.apply()

    var selectedPortal: MobilePortal?
        get() = preferences.getString(KEY_PORTAL, null)?.let(MobilePortal::fromWireName)
        set(value) = preferences.edit().apply {
            if (value == null) remove(KEY_PORTAL) else putString(KEY_PORTAL, value.wireName)
        }.apply()

    fun clear() = preferences.edit().clear().apply()

    private companion object {
        const val KEY_ACCESS_TOKEN = "access_token"
        const val KEY_PORTAL = "selected_portal"
    }
}
