package expo.modules.modeldownload

import android.app.DownloadManager
import android.content.Context
import android.net.Uri
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException

/**
 * Downloads the on-device model with Android's DownloadManager, so the transfer
 * keeps going when the app is in the background (or killed) and the system shows
 * a progress notification.
 *
 * DownloadManager cannot write into internal app storage, so the file lands in the
 * app-specific external folder (`Android/data/<package>/files/model-downloads`,
 * no storage permission needed, removed on uninstall). `install` then moves it
 * into the models folder, where JS checks size and MD5 before it is used.
 *
 * Privacy: only the model URL is requested. No document content is involved and
 * nothing here is logged.
 */
class ModelDownloadModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw CodedException("ERR_NO_CONTEXT", "React context is not available", null)

  private val manager: DownloadManager
    get() = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager

  private fun downloadDir(): File {
    val base = context.getExternalFilesDir(null)
      ?: throw CodedException("ERR_STORAGE", "App storage for downloads is not available", null)
    return File(base, DIR_NAME)
  }

  private fun partFile(fileName: String): File {
    // fileName comes from the pinned model list; refuse anything that could escape the folder.
    if (fileName.isEmpty() || fileName.contains('/') || fileName.contains('\\') || fileName.startsWith(".")) {
      throw CodedException("ERR_FILE_NAME", "Invalid file name", null)
    }
    return File(downloadDir(), "$fileName.part")
  }

  private fun statusWord(status: Int): String = when (status) {
    DownloadManager.STATUS_PENDING -> "pending"
    DownloadManager.STATUS_RUNNING -> "running"
    DownloadManager.STATUS_PAUSED -> "paused"
    DownloadManager.STATUS_SUCCESSFUL -> "successful"
    DownloadManager.STATUS_FAILED -> "failed"
    else -> "pending"
  }

  private fun queryOne(id: Long): Map<String, Any?> {
    val missing: Map<String, Any?> = mapOf("status" to "missing")
    val cursor = manager.query(DownloadManager.Query().setFilterById(id)) ?: return missing
    cursor.use {
      if (!it.moveToFirst()) return missing
      val status = it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS))
      return mapOf(
        "status" to statusWord(status),
        "bytes" to it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)).toDouble(),
        "total" to it.getLong(it.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)).toDouble(),
        "reason" to it.getInt(it.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)),
      )
    }
  }

  private fun findByUrl(url: String): String? {
    val cursor = manager.query(DownloadManager.Query()) ?: return null
    var found = -1L
    cursor.use {
      val idCol = it.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)
      val uriCol = it.getColumnIndexOrThrow(DownloadManager.COLUMN_URI)
      val statusCol = it.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)
      while (it.moveToNext()) {
        if (it.getString(uriCol) != url) continue
        if (it.getInt(statusCol) == DownloadManager.STATUS_FAILED) continue
        found = maxOf(found, it.getLong(idCol))
      }
    }
    return if (found >= 0) found.toString() else null
  }

  override fun definition() = ModuleDefinition {
    Name("ModelDownload")

    /** Enqueues the download and returns its id. Any earlier partial file is removed first. */
    AsyncFunction("start") { url: String, fileName: String, title: String, description: String ->
      if (!url.startsWith("https://")) {
        throw CodedException("ERR_URL", "Only https downloads are allowed", null)
      }
      val dir = downloadDir()
      if (!dir.exists() && !dir.mkdirs()) {
        throw CodedException("ERR_STORAGE", "Could not create the download folder", null)
      }
      partFile(fileName).delete()
      val request = DownloadManager.Request(Uri.parse(url))
        .setTitle(title)
        .setDescription(description)
        .setMimeType("application/octet-stream")
        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
        .setDestinationInExternalFilesDir(context, DIR_NAME, "$fileName.part")
        .setAllowedOverMetered(true)
        .setAllowedOverRoaming(false)
      manager.enqueue(request).toString()
    }

    /** Status of one download: pending | running | paused | successful | failed | missing. */
    AsyncFunction("query") { id: String -> queryOne(id.toLong()) }

    /**
     * Finds this app's newest download of `url` that has not failed, so the app can
     * re-attach to it after a restart. Returns its id, or null.
     */
    AsyncFunction("findByUrl") { url: String -> findByUrl(url) }

    /** Stops the download and deletes its partial file. Safe to call for an unknown id. */
    AsyncFunction("cancel") { id: String ->
      manager.remove(id.toLong())
      Unit
    }

    /**
     * Moves a finished download to `destUri` (a file:// path in internal app storage)
     * and forgets the DownloadManager entry. JS verifies size and MD5 afterwards.
     */
    AsyncFunction("install") { id: String, fileName: String, destUri: String ->
      val source = partFile(fileName)
      if (!source.exists()) {
        throw CodedException("ERR_MISSING", "The downloaded file is missing", null)
      }
      val path = Uri.parse(destUri).path ?: throw CodedException("ERR_DEST", "Invalid destination", null)
      val dest = File(path)
      try {
        dest.parentFile?.mkdirs()
        dest.delete()
        // External and internal app storage are different mounts, so rename usually fails; copy then.
        if (!source.renameTo(dest)) {
          source.copyTo(dest, overwrite = true)
          source.delete()
        }
      } catch (e: IOException) {
        dest.delete()
        throw CodedException("ERR_MOVE", "Could not move the downloaded file", e)
      }
      // The file has moved, so this only removes the finished entry from DownloadManager.
      manager.remove(id.toLong())
      Unit
    }
  }

  companion object {
    private const val DIR_NAME = "model-downloads"
  }
}
