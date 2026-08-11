package com.jinhu.smartpark

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.os.SystemClock
import android.provider.MediaStore
import android.view.View
import android.webkit.CookieManager
import android.webkit.GeolocationPermissions
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.net.toUri
import com.jinhu.smartpark.databinding.ActivityMainBinding
import java.io.File

class LegacyWebActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private lateinit var updateManager: UpdateManager
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var cameraOutputUri: Uri? = null
    private var pendingLocationCallback: GeolocationPermissions.Callback? = null
    private var pendingLocationOrigin: String? = null
    private var pendingFileChooserParams: WebChromeClient.FileChooserParams? = null
    private var lastBackPress = 0L

    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val selected = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        val cameraResult = cameraOutputUri?.takeIf { result.resultCode == Activity.RESULT_OK && selected.isNullOrEmpty() }
        fileCallback?.onReceiveValue(selected ?: cameraResult?.let { arrayOf(it) })
        fileCallback = null
        cameraOutputUri = null
    }

    private val locationPermission = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val allowed = grants[Manifest.permission.ACCESS_FINE_LOCATION] == true || grants[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        pendingLocationCallback?.invoke(pendingLocationOrigin, allowed, false)
        pendingLocationCallback = null
        pendingLocationOrigin = null
    }

    private val cameraPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { allowed ->
        pendingFileChooserParams?.let { launchFileChooser(it, includeCamera = allowed) }
        pendingFileChooserParams = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        updateManager = UpdateManager(this, ::showMessage)
        updateManager.register()
        configureWebView()
        configureBackNavigation()
        binding.swipeRefresh.setOnRefreshListener { binding.webView.reload() }
        if (savedInstanceState == null) binding.webView.loadUrl(resolveStartUrl()) else binding.webView.restoreState(savedInstanceState)
        updateManager.checkForUpdates()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() = with(binding.webView) {
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.mediaPlaybackRequiresUserGesture = true
        settings.allowFileAccess = false
        settings.allowContentAccess = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        settings.userAgentString = "${settings.userAgentString} JinhuSmartParkAndroid/${BuildConfig.VERSION_NAME}"
        CookieManager.getInstance().apply {
            setAcceptCookie(true)
            setAcceptThirdPartyCookies(this@with, true)
        }
        webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == START_HOST) return false
                return openExternal(uri)
            }

            override fun onPageFinished(view: WebView, url: String) {
                binding.swipeRefresh.isRefreshing = false
                binding.swipeRefresh.isEnabled = view.scrollY == 0
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (request.isForMainFrame) {
                    binding.swipeRefresh.isRefreshing = false
                    showMessage(getString(R.string.network_error))
                }
            }
        }
        webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(webView: WebView, callback: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                if (ContextCompat.checkSelfPermission(this@LegacyWebActivity, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    launchFileChooser(params, includeCamera = true)
                } else {
                    pendingFileChooserParams = params
                    cameraPermission.launch(Manifest.permission.CAMERA)
                }
                return true
            }

            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                val fine = ContextCompat.checkSelfPermission(this@LegacyWebActivity, Manifest.permission.ACCESS_FINE_LOCATION)
                val coarse = ContextCompat.checkSelfPermission(this@LegacyWebActivity, Manifest.permission.ACCESS_COARSE_LOCATION)
                if (fine == PackageManager.PERMISSION_GRANTED || coarse == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingLocationOrigin = origin
                    pendingLocationCallback = callback
                    locationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
                }
            }
        }
        setDownloadListener { url, _, _, mimeType, _ ->
            if (mimeType == APK_MIME_TYPE || url.endsWith(".apk", ignoreCase = true)) openExternal(url.toUri())
            else openExternal(url.toUri())
        }
        setOnScrollChangeListener { _: View, _, scrollY, _, _ -> binding.swipeRefresh.isEnabled = scrollY == 0 }
    }

    private fun launchFileChooser(params: WebChromeClient.FileChooserParams, includeCamera: Boolean) {
        val contentIntent = params.createIntent().apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
        val cameraIntent = if (includeCamera) {
            val cameraDir = File(cacheDir, "camera").apply { mkdirs() }
            val cameraFile = File.createTempFile("inspection-", ".jpg", cameraDir)
            cameraOutputUri = FileProvider.getUriForFile(this, "${BuildConfig.APPLICATION_ID}.fileprovider", cameraFile)
            Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, cameraOutputUri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            }.takeIf { it.resolveActivity(packageManager) != null }
        } else null
        val chooser = Intent.createChooser(contentIntent, "选择照片或文件").apply {
            if (cameraIntent != null) putExtra(Intent.EXTRA_INITIAL_INTENTS, arrayOf(cameraIntent))
        }
        try {
            filePicker.launch(chooser)
        } catch (_: ActivityNotFoundException) {
            fileCallback?.onReceiveValue(null)
            fileCallback = null
        }
    }

    private fun configureBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (binding.webView.canGoBack()) {
                    binding.webView.goBack()
                    return
                }
                val now = SystemClock.elapsedRealtime()
                if (now - lastBackPress < 2_000) finish() else {
                    lastBackPress = now
                    showMessage(getString(R.string.exit_confirm))
                }
            }
        })
    }

    private fun resolveStartUrl(): String {
        val requested = intent.getStringExtra(EXTRA_URL)?.toUri() ?: return BuildConfig.START_URL
        return if (requested.scheme == "https" && requested.host == START_HOST) requested.toString() else BuildConfig.START_URL
    }

    private fun openExternal(uri: Uri): Boolean {
        return try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
            true
        } catch (_: ActivityNotFoundException) {
            showMessage("没有可打开此链接的应用")
            true
        }
    }

    fun showMessage(message: String) = Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    override fun onSaveInstanceState(outState: Bundle) {
        binding.webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        updateManager.unregister()
        binding.webView.apply {
            stopLoading()
            webChromeClient = null
            destroy()
        }
        super.onDestroy()
    }

    companion object {
        private val START_HOST = Uri.parse(BuildConfig.START_URL).host
        const val EXTRA_URL = "web_fallback_url"
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }
}
