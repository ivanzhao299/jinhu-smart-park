# Implementation Plan

1. 配置 Compose、网络、生命周期和加密存储依赖。
2. 建立 API DTO、统一响应解析、认证拦截与会话存储。
3. 实现登录、多上下文选择、bootstrap 和会话恢复 ViewModel。
4. 实现原生登录页、端口选择页、员工/业主首页骨架及退出/切换。
5. 将现有 WebView 主 Activity 调整为受控兜底 Activity，并保留 APK 更新检查。
6. 执行可用静态检查与构建；本机缺少 Android SDK/JDK 时交由 CI 构建并跟踪结果。
