package com.jinhu.smartpark

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.jinhu.smartpark.data.ApiException
import com.jinhu.smartpark.data.LoginContext
import com.jinhu.smartpark.data.LoginResult
import com.jinhu.smartpark.data.MobileBootstrap
import com.jinhu.smartpark.data.MobilePortal
import com.jinhu.smartpark.data.MobileRepository
import com.jinhu.smartpark.data.SessionStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import retrofit2.HttpException
import java.io.IOException

sealed interface AppUiState {
    data object Restoring : AppUiState
    data object LoggedOut : AppUiState
    data class Working(val message: String) : AppUiState
    data class SelectingContext(val ticket: String, val contexts: List<LoginContext>) : AppUiState
    data class SelectingPortal(val bootstrap: MobileBootstrap, val portals: List<MobilePortal>) : AppUiState
    data class Ready(val bootstrap: MobileBootstrap, val portal: MobilePortal) : AppUiState
    data class Error(val message: String, val sessionExists: Boolean) : AppUiState
}

class AppViewModel(application: Application) : AndroidViewModel(application) {
    private val sessionStore = SessionStore(application)
    private val repository = MobileRepository(sessionStore)
    private val mutableState = MutableStateFlow<AppUiState>(AppUiState.Restoring)
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()

    init {
        if (sessionStore.accessToken.isNullOrBlank()) mutableState.value = AppUiState.LoggedOut else loadBootstrap()
    }

    fun login(username: String, password: String) {
        if (username.isBlank() || password.length < 6) {
            mutableState.value = AppUiState.Error("请输入账号和至少 6 位密码", false)
            return
        }
        mutableState.value = AppUiState.Working("正在登录…")
        viewModelScope.launch { runRequest { handleLoginResult(repository.login(username, password)) } }
    }

    fun selectContext(context: LoginContext, ticket: String) {
        mutableState.value = AppUiState.Working("正在进入 ${context.realName} 的园区…")
        viewModelScope.launch { runRequest { handleLoginResult(repository.selectContext(context, ticket)) } }
    }

    fun selectPortal(portal: MobilePortal) {
        val current = mutableState.value
        val bootstrap = when (current) {
            is AppUiState.SelectingPortal -> current.bootstrap
            is AppUiState.Ready -> current.bootstrap
            else -> return
        }
        if (portal !in allowedPortals(bootstrap)) return
        sessionStore.selectedPortal = portal
        mutableState.value = AppUiState.Ready(bootstrap, portal)
    }

    fun retry() {
        if (sessionStore.accessToken.isNullOrBlank()) mutableState.value = AppUiState.LoggedOut else loadBootstrap()
    }

    fun logout() {
        sessionStore.clear()
        mutableState.value = AppUiState.LoggedOut
    }

    private suspend fun handleLoginResult(result: LoginResult) {
        if (result.requiresContextSelection) {
            val ticket = result.loginTicket
            if (ticket.isNullOrBlank() || result.contexts.isEmpty()) throw ApiException("登录上下文不完整，请联系管理员", -1)
            mutableState.value = AppUiState.SelectingContext(ticket, result.contexts)
            return
        }
        val token = result.accessToken ?: throw ApiException("登录成功但未返回访问凭证", -1)
        sessionStore.accessToken = token
        fetchBootstrap()
    }

    private fun loadBootstrap() {
        mutableState.value = AppUiState.Working("正在加载工作台…")
        viewModelScope.launch { runRequest { fetchBootstrap() } }
    }

    private suspend fun fetchBootstrap() {
        val bootstrap = repository.bootstrap()
        val portals = allowedPortals(bootstrap)
        when {
            portals.isEmpty() -> mutableState.value = AppUiState.Error("当前账号尚未开通移动端权限", true)
            portals.size == 1 -> selectResolvedPortal(bootstrap, portals.first())
            sessionStore.selectedPortal in portals -> selectResolvedPortal(bootstrap, requireNotNull(sessionStore.selectedPortal))
            else -> mutableState.value = AppUiState.SelectingPortal(bootstrap, portals)
        }
    }

    private fun selectResolvedPortal(bootstrap: MobileBootstrap, portal: MobilePortal) {
        sessionStore.selectedPortal = portal
        mutableState.value = AppUiState.Ready(bootstrap, portal)
    }

    private fun allowedPortals(bootstrap: MobileBootstrap): List<MobilePortal> =
        bootstrap.portals.mapNotNull { MobilePortal.fromWireName(it) }.distinct()

    private suspend fun runRequest(block: suspend () -> Unit) {
        try {
            block()
        } catch (error: Throwable) {
            val unauthorized = error is HttpException && error.code() == 401
            if (unauthorized) sessionStore.clear()
            mutableState.value = AppUiState.Error(error.userMessage(), sessionStore.accessToken != null)
        }
    }

    private fun Throwable.userMessage(): String = when (this) {
        is ApiException -> message ?: "请求失败"
        is HttpException -> if (code() == 401) "登录已失效，请重新登录" else "服务暂时不可用（${code()}）"
        is IOException -> "网络连接失败，请检查网络后重试"
        else -> "操作失败，请稍后重试"
    }
}
