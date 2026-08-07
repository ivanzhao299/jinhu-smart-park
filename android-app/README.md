# 金湖智慧园区 Android 客户端

这是承载现有智慧园区移动 Web 业务的原生 Android 薄壳，默认连接 `https://park.cnjinhu.com`。

本地调试需要 JDK 17、Android SDK 35 和 Gradle 8.9：

```bash
cd android-app
gradle :app:assembleDebug
```

Release 构建必须先根据 `signing.properties.example` 创建未纳入版本控制的 `signing.properties` 和 keystore，再执行：

```bash
gradle :app:assembleRelease
```

正式发布由仓库根目录的 Android CI 工作流完成，签名材料仅通过 GitHub Environment secrets 注入。
