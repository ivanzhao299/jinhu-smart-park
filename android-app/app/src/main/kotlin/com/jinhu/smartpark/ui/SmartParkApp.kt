package com.jinhu.smartpark.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.weight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.jinhu.smartpark.AppUiState
import com.jinhu.smartpark.AppViewModel
import com.jinhu.smartpark.data.LoginContext
import com.jinhu.smartpark.data.MobileBootstrap
import com.jinhu.smartpark.data.MobilePortal

private val ParkGreen = Color(0xFF0D6B57)
private val PageBackground = Color(0xFFF3F6F4)

@Composable
fun SmartParkApp(viewModel: AppViewModel) {
    val state by viewModel.state.collectAsState()
    MaterialTheme(colorScheme = MaterialTheme.colorScheme.copy(primary = ParkGreen)) {
        Surface(modifier = Modifier.fillMaxSize(), color = PageBackground) {
            when (val current = state) {
                AppUiState.Restoring -> LoadingPage("正在恢复登录状态…")
                AppUiState.LoggedOut -> LoginPage(viewModel::login)
                is AppUiState.Working -> LoadingPage(current.message)
                is AppUiState.SelectingContext -> ContextPage(current, viewModel::selectContext)
                is AppUiState.SelectingPortal -> PortalPage(current.bootstrap, current.portals, viewModel::selectPortal)
                is AppUiState.Ready -> HomePage(current.bootstrap, current.portal, viewModel::selectPortal, viewModel::logout)
                is AppUiState.Error -> ErrorPage(current, viewModel::retry, viewModel::logout)
            }
        }
    }
}

@Composable
private fun LoginPage(onLogin: (String, String) -> Unit) {
    var username by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.Center
    ) {
        Text("金湖智慧园区", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold, color = ParkGreen)
        Text("员工与业主统一客户端", modifier = Modifier.padding(top = 8.dp), color = Color(0xFF61706B))
        Spacer(Modifier.height(32.dp))
        OutlinedTextField(
            value = username,
            onValueChange = { username = it },
            label = { Text("账号") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
            modifier = Modifier.fillMaxWidth()
        )
        Spacer(Modifier.height(14.dp))
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("密码") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth()
        )
        Button(onClick = { onLogin(username, password) }, modifier = Modifier.fillMaxWidth().padding(top = 22.dp)) {
            Text("登录")
        }
    }
}

@Composable
private fun LoadingPage(message: String) {
    Box(Modifier.fillMaxSize().safeDrawingPadding(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = ParkGreen)
            Text(message, modifier = Modifier.padding(top = 16.dp), color = Color(0xFF53625D))
        }
    }
}

@Composable
private fun ContextPage(state: AppUiState.SelectingContext, onSelect: (LoginContext, String) -> Unit) {
    PageColumn("选择工作园区", "该账号关联多个园区，请选择本次登录身份") {
        state.contexts.forEach { context ->
            SelectionCard(
                title = context.realName,
                subtitle = "${context.username} · 园区 ${context.parkId}",
                action = "进入"
            ) { onSelect(context, state.ticket) }
        }
    }
}

@Composable
private fun PortalPage(bootstrap: MobileBootstrap, portals: List<MobilePortal>, onSelect: (MobilePortal) -> Unit) {
    PageColumn("选择使用端", "${bootstrap.user.realName}，请选择本次要进入的工作台") {
        portals.forEach { portal ->
            val description = if (portal == MobilePortal.EMPLOYEE) "巡检、工单与现场工作" else "报事报修与服务进度"
            SelectionCard(portal.title, description, "进入${portal.title}") { onSelect(portal) }
        }
    }
}

@Composable
private fun HomePage(
    bootstrap: MobileBootstrap,
    portal: MobilePortal,
    onSwitch: (MobilePortal) -> Unit,
    onLogout: () -> Unit
) {
    val available = bootstrap.portals.mapNotNull { MobilePortal.fromWireName(it) }
    Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState())) {
        Column(Modifier.fillMaxWidth().background(ParkGreen).padding(22.dp)) {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Column(Modifier.weight(1f)) {
                    Text(portal.title, color = Color.White, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("${bootstrap.user.realName} · ${bootstrap.currentPark?.parkName ?: "金湖智慧园区"}", color = Color(0xFFD7EEE8))
                }
                TextButton(onClick = onLogout) { Text("退出", color = Color.White) }
            }
            if (available.size > 1) {
                Row(Modifier.padding(top = 12.dp)) {
                    available.filter { it != portal }.forEach { other ->
                        OutlinedButton(onClick = { onSwitch(other) }) { Text("切换到${other.title}") }
                    }
                }
            }
        }
        Column(Modifier.padding(18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
            Text("今日工作", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            homeCards(portal, bootstrap.capabilities).forEach { (title, subtitle) ->
                Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.fillMaxWidth().padding(18.dp)) {
                        Text(title, fontWeight = FontWeight.Bold, style = MaterialTheme.typography.titleMedium)
                        Text(subtitle, modifier = Modifier.padding(top = 6.dp), color = Color(0xFF687670))
                    }
                }
            }
        }
    }
}

private fun homeCards(portal: MobilePortal, capabilities: List<String>): List<Pair<String, String>> = when (portal) {
    MobilePortal.EMPLOYEE -> buildList {
        if (capabilities.any { it.startsWith("employee.inspection.") }) add("每日巡检" to "查看任务、现场打卡与拍照留痕")
        if (capabilities.any { it.startsWith("employee.workorder.") }) add("我的工单" to "接单、开始处理与完工提交")
        if (capabilities.contains("employee.hazard.create")) add("隐患上报" to "拍照并快速上报现场问题")
        if (isEmpty()) add("员工工作台" to "当前暂无已开放的移动业务")
    }
    MobilePortal.OWNER -> buildList {
        if (capabilities.contains("owner.service.create")) add("报事报修" to "选择事项、拍照并提交服务需求")
        if (capabilities.contains("owner.service.view")) add("服务进度" to "查看处理状态与最新反馈")
        if (capabilities.contains("owner.service.evaluate")) add("服务评价" to "确认完成并评价本次服务")
        if (isEmpty()) add("业主服务台" to "当前暂无已开放的移动服务")
    }
}

@Composable
private fun ErrorPage(state: AppUiState.Error, onRetry: () -> Unit, onLogout: () -> Unit) {
    Box(Modifier.fillMaxSize().safeDrawingPadding().padding(28.dp), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text("暂时无法进入", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
            Text(state.message, modifier = Modifier.padding(vertical = 16.dp), color = Color(0xFF687670))
            Button(onClick = onRetry) { Text("重试") }
            if (state.sessionExists) TextButton(onClick = onLogout) { Text("退出当前账号") }
        }
    }
}

@Composable
private fun PageColumn(title: String, subtitle: String, content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().safeDrawingPadding().verticalScroll(rememberScrollState()).padding(20.dp)) {
        Text(title, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
        Text(subtitle, modifier = Modifier.padding(top = 6.dp, bottom = 20.dp), color = Color(0xFF687670))
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { content() }
    }
}

@Composable
private fun SelectionCard(title: String, subtitle: String, action: String, onClick: () -> Unit) {
    Card(colors = CardDefaults.cardColors(containerColor = Color.White), shape = RoundedCornerShape(16.dp)) {
        Column(Modifier.fillMaxWidth().padding(18.dp)) {
            Text(title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Text(subtitle, modifier = Modifier.padding(top = 6.dp), color = Color(0xFF687670))
            Button(onClick = onClick, modifier = Modifier.fillMaxWidth().padding(top = 14.dp)) { Text(action) }
        }
    }
}
