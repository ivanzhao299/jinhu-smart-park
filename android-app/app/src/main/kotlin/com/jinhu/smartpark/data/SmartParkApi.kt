package com.jinhu.smartpark.data

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

interface SmartParkApi {
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): ApiEnvelope<LoginResult>

    @POST("auth/select-context")
    suspend fun selectContext(@Body request: SelectContextRequest): ApiEnvelope<LoginResult>

    @GET("mobile/v1/bootstrap")
    suspend fun bootstrap(): ApiEnvelope<MobileBootstrap>
}
