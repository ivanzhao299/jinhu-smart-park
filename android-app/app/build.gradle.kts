import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val signingProperties = Properties().apply {
    val signingFile = rootProject.file("signing.properties")
    if (signingFile.exists()) signingFile.inputStream().use(::load)
}

android {
    namespace = "com.jinhu.smartpark"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.jinhu.smartpark"
        minSdk = 24
        targetSdk = 35
        versionCode = 2
        versionName = "1.1.0"
        buildConfigField("String", "API_BASE_URL", "\"https://park.cnjinhu.com/api/v1/\"")
        buildConfigField("String", "START_URL", "\"https://park.cnjinhu.com/login\"")
        buildConfigField("String", "UPDATE_MANIFEST_URL", "\"https://park.cnjinhu.com/downloads/android/latest.json\"")
    }

    signingConfigs {
        if (signingProperties.isNotEmpty()) {
            create("release") {
                storeFile = rootProject.file(signingProperties.getProperty("storeFile"))
                storeType = signingProperties.getProperty("storeType", "JKS")
                storePassword = signingProperties.getProperty("storePassword")
                keyAlias = signingProperties.getProperty("keyAlias")
                keyPassword = signingProperties.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.findByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
    buildFeatures {
        buildConfig = true
        viewBinding = true
        compose = true
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.12.01")
    implementation(composeBom)
    implementation("androidx.activity:activity-compose:1.10.0")
    implementation("androidx.activity:activity-ktx:1.10.0")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    debugImplementation("androidx.compose.ui:ui-tooling")
}
