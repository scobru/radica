// Radica for Android: Radica web in a WebView, over the Freenet node that Freenet Android Node runs on the phone.
plugins {
    id("com.android.application") version "8.7.3"
}

android {
    namespace = "org.freenet.radica"
    compileSdk = 35
    defaultConfig {
        applicationId = "org.freenet.radica"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }
}
