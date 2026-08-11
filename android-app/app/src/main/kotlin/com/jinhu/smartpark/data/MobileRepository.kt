package com.jinhu.smartpark.data

import com.jinhu.smartpark.BuildConfig
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

class MobileRepository(private val sessionStore: SessionStore) {
    private val api: SmartParkApi = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL)
        .client(
            OkHttpClient.Builder()
                .addInterceptor { chain ->
                    val token = sessionStore.accessToken
                    val request = chain.request().newBuilder().apply {
                        header("Accept", "application/json")
                        if (!token.isNullOrBlank()) header("Authorization", "Bearer $token")
                    }.build()
                    chain.proceed(request)
                }
                .addInterceptor(HttpLoggingInterceptor().apply {
                    level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE
                })
                .build()
        )
        .addConverterFactory(GsonConverterFactory.create())
        .build()
        .create(SmartParkApi::class.java)

    suspend fun login(username: String, password: String): LoginResult =
        api.login(LoginRequest(username.trim(), password)).requireData()

    suspend fun selectContext(context: LoginContext, ticket: String): LoginResult =
        api.selectContext(SelectContextRequest(context.tenantId, context.parkId, context.userId, ticket)).requireData()

    suspend fun bootstrap(): MobileBootstrap = api.bootstrap().requireData()

    private fun <T> ApiEnvelope<T>.requireData(): T {
        if (code != 0 || data == null) throw ApiException(message ?: "请求失败（$code）", code)
        return data
    }
}

class ApiException(message: String, val code: Int) : RuntimeException(message)
