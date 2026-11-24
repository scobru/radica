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

    buildFeatures {
        buildConfig = true
    }

    signingConfigs {
        create("release") {
            val keystoreFile = file("release.keystore")
            val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            val resolvedFile = if (keystorePath != null && file(keystorePath).exists()) file(keystorePath) else keystoreFile
            if (resolvedFile.exists()) {
                storeFile = resolvedFile
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: "radica-release"
                keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "radica"
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: "radica-release"
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("release")
        }
    }

    flavorDimensions += "mode"
    productFlavors {
        create("full") {
            dimension = "mode"
            resValue("string", "app_name", "Radica")
            resValue("string", "app_mode", "full")
            buildConfigField("boolean", "IS_MESSENGER", "false")
        }
        create("messenger") {
            dimension = "mode"
            applicationIdSuffix = ".messenger"
            resValue("string", "app_name", "Radica Messenger")
            resValue("string", "app_mode", "messenger")
            buildConfigField("boolean", "IS_MESSENGER", "true")
        }
    }
}

// Radica web inside the APK (MainActivity's BUNDLED): opened when no Freenet node answers, so chat over the local network
// still works. Only the app itself: the image filter, translation engine and GIFs (~58 MB) stay in their Freenet
// containers. Build the UI first (npm --prefix ui run build); without ui/dist the APK simply has no offline mode.
val bundledUi = layout.buildDirectory.dir("generated/radica-ui-assets")
val copyRadicaUi by tasks.registering(Sync::class) {
    from(rootDir.resolve("../../ui/dist")) { exclude("moderation/**", "gifs/**", "translate/**") }
    into(bundledUi.map { it.dir("radica-ui") })
}
android.sourceSets["main"].assets.srcDir(bundledUi)
tasks.named("preBuild") { dependsOn(copyRadicaUi) }
