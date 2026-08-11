package com.jinhu.smartpark

import android.app.DownloadManager
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Environment
import androidx.appcompat.app.AlertDialog
import androidx.core.content.FileProvider
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

class UpdateManager(
    private val activity: Activity,
    private val showMessage: (String) -> Unit
) {
    private val executor = Executors.newSingleThreadExecutor()
    private var activeDownloadId: Long? = null
    private var expectedRelease: AppRelease? = null

    private val downloadReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val completedId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1L)
            if (completedId == activeDownloadId) installCompletedDownload(completedId)
        }
    }

    fun register() {
        val filter = IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(downloadReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            activity.registerReceiver(downloadReceiver, filter)
        }
    }

    fun unregister() {
        runCatching { activity.unregisterReceiver(downloadReceiver) }
        executor.shutdownNow()
    }

    fun checkForUpdates(showNoUpdate: Boolean = false) {
        executor.execute {
            val release = runCatching { loadRelease() }.getOrNull()
            activity.runOnUiThread {
                if (release != null && release.versionCode > BuildConfig.VERSION_CODE) {
                    showUpdateDialog(release)
                } else if (showNoUpdate) {
                    showMessage("当前已是最新版本")
                }
            }
        }
    }

    private fun loadRelease(): AppRelease {
        val connection = URL(BuildConfig.UPDATE_MANIFEST_URL).openConnection() as HttpURLConnection
        connection.connectTimeout = 8_000
        connection.readTimeout = 8_000
        connection.setRequestProperty("Accept", "application/json")
        connection.instanceFollowRedirects = true
        return try {
            require(connection.responseCode in 200..299) { "Update manifest HTTP ${connection.responseCode}" }
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            AppRelease.fromJson(JSONObject(body))
        } finally {
            connection.disconnect()
        }
    }

    private fun showUpdateDialog(release: AppRelease) {
        AlertDialog.Builder(activity)
            .setTitle(activity.getString(R.string.update_title, release.versionName))
            .setMessage(activity.getString(R.string.update_message, release.releaseNotes))
            .setNegativeButton("稍后") { dialog, _ -> dialog.dismiss() }
            .setPositiveButton("立即更新") { _, _ -> download(release) }
            .show()
    }

    private fun download(release: AppRelease) {
        val resolvedDownloadUrl = URL(URL(BuildConfig.UPDATE_MANIFEST_URL), release.downloadUrl).toString()
        val request = DownloadManager.Request(Uri.parse(resolvedDownloadUrl))
            .setTitle("金湖智慧园区 ${release.versionName}")
            .setDescription("正在下载客户端更新")
            .setMimeType(APK_MIME_TYPE)
            .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
            .setAllowedOverMetered(true)
            .setAllowedOverRoaming(false)
            .setDestinationInExternalFilesDir(activity, Environment.DIRECTORY_DOWNLOADS, "smart-park-${release.versionName}.apk")
        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        expectedRelease = release
        activeDownloadId = manager.enqueue(request)
        showMessage("已开始下载，完成后将打开安装界面")
    }

    private fun installCompletedDownload(downloadId: Long) {
        val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
        manager.query(DownloadManager.Query().setFilterById(downloadId)).use { cursor ->
            if (!cursor.moveToFirst()) return
            val status = cursor.getInt(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
            if (status != DownloadManager.STATUS_SUCCESSFUL) {
                showMessage("更新下载失败，请稍后重试")
                return
            }
            val localUri = cursor.getString(cursor.getColumnIndexOrThrow(DownloadManager.COLUMN_LOCAL_URI)) ?: return
            val file = java.io.File(Uri.parse(localUri).path ?: return)
            val expectedHash = expectedRelease?.sha256.orEmpty()
            if (expectedHash.isNotBlank() && !file.sha256().equals(expectedHash, ignoreCase = true)) {
                file.delete()
                showMessage("安装包校验失败，请重新下载")
                return
            }
            val contentUri = FileProvider.getUriForFile(activity, "${BuildConfig.APPLICATION_ID}.fileprovider", file)
            val installIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(contentUri, APK_MIME_TYPE)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            activity.startActivity(installIntent)
        }
    }

    private fun java.io.File.sha256(): String {
        val digest = MessageDigest.getInstance("SHA-256")
        inputStream().use { stream ->
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            while (true) {
                val read = stream.read(buffer)
                if (read <= 0) break
                digest.update(buffer, 0, read)
            }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
    }

    companion object {
        private const val APK_MIME_TYPE = "application/vnd.android.package-archive"
    }
}
