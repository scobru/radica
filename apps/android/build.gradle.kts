// Radica for Android: Radica web in a WebView, over the Freenet node that Freenet Android Node runs on the phone.
plugins {
    id("com.android.application") version "8.7.3"
}

// Radica's version, from the repository's package.json, so every app carries the same one
val radicaVersion = Regex(""""version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"""")
    .find(rootDir.resolve("../../package.json").readText())!!
    .groupValues.drop(1).map { it.toInt() }

android {
    namespace = "org.freenet.radica"
    compileSdk = 35
    defaultConfig {
        applicationId = "org.freenet.radica"
        minSdk = 28
        targetSdk = 35
        versionCode = radicaVersion[0] * 10000 + radicaVersion[1] * 100 + radicaVersion[2]
        versionName = radicaVersion.joinToString(".")
    }

    flavorDimensions += "mode"
    productFlavors {
        create("full") {
            dimension = "mode"
            resValue("string", "app_name", "Radica")
            resValue("string", "app_mode", "full")
        }
        create("messenger") {
            dimension = "mode"
            applicationIdSuffix = ".messenger"
            resValue("string", "app_name", "Radica Messenger")
            resValue("string", "app_mode", "messenger")
        }
    }
}
