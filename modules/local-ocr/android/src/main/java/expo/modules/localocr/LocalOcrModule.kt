package expo.modules.localocr

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.pdf.PdfRenderer
import android.media.ExifInterface
import android.net.Uri
import android.os.ParcelFileDescriptor
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.IOException
import java.util.concurrent.ExecutionException
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Bundled ML Kit Text Recognition v2 (Latin script: English and Filipino).
 * The model ships inside the APK, so recognition works offline from the first run.
 *
 * Privacy: recognized text is only returned to JS. Never log it or put it in an
 * exception message. Rendered PDF pages stay in memory and are never written to disk.
 */
class LocalOcrModule : Module() {
  private var recognizer: TextRecognizer? = null

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "React context is not available" }

  @Synchronized
  private fun client(): TextRecognizer =
    recognizer ?: TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS).also { recognizer = it }

  override fun definition() = ModuleDefinition {
    Name("LocalOcr")

    OnDestroy {
      recognizer?.close()
      recognizer = null
    }

    // Readiness: draws a known string and reads it back. Proves the bundled model runs on this phone.
    AsyncFunction<Boolean>("selfTest") {
      val bitmap = Bitmap.createBitmap(720, 200, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE)
      val paint = Paint().apply {
        color = Color.BLACK
        textSize = 64f
        isAntiAlias = true
      }
      Canvas(bitmap).drawText("Offline check 2468", 24f, 124f, paint)
      process(bitmap).text.contains("2468")
    }

    AsyncFunction("recognizeImage") { uri: String, rotation: Int ->
      toResult(loadUpright(Uri.parse(uri), rotation))
    }

    AsyncFunction("pdfPageCount") { uri: String ->
      withPdf(uri) { it.pageCount }
    }

    AsyncFunction("recognizePdfPage") { uri: String, page: Int ->
      toResult(renderPdfPage(uri, page))
    }
  }

  private fun process(bitmap: Bitmap): Text {
    try {
      return Tasks.await(client().process(InputImage.fromBitmap(bitmap, 0)))
    } catch (e: ExecutionException) {
      throw CodedException("ERR_OCR_FAILED", "Text recognition failed", e.cause)
    } catch (e: InterruptedException) {
      throw CodedException("ERR_OCR_FAILED", "Text recognition was interrupted", e)
    } finally {
      bitmap.recycle()
    }
  }

  /** Frames are pixels of the upright image that was recognized (`width` × `height`). */
  private fun toResult(bitmap: Bitmap): Map<String, Any> {
    val width = bitmap.width
    val height = bitmap.height
    val text = process(bitmap)
    return mapOf(
      "width" to width,
      "height" to height,
      "blocks" to text.textBlocks.map { block ->
        mapOf(
          "frame" to frame(block.boundingBox),
          "lines" to block.lines.map { line ->
            mapOf(
              "text" to line.text,
              "confidence" to line.confidence.toDouble(),
              "frame" to frame(line.boundingBox),
            )
          },
        )
      },
    )
  }

  private fun frame(r: Rect?): Map<String, Int> =
    mapOf("left" to (r?.left ?: 0), "top" to (r?.top ?: 0), "right" to (r?.right ?: 0), "bottom" to (r?.bottom ?: 0))

  /** Decodes a photo at a size ML Kit reads well, then applies EXIF orientation plus the user's rotation. */
  private fun loadUpright(uri: Uri, userRotation: Int): Bitmap {
    if (userRotation !in setOf(0, 90, 180, 270)) {
      throw CodedException("ERR_ROTATION", "Rotation must be 0, 90, 180 or 270", null)
    }
    val resolver = context.contentResolver
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    openImage(uri).use { BitmapFactory.decodeStream(it, null, bounds) }
    val longSide = max(bounds.outWidth, bounds.outHeight)
    if (longSide <= 0) throw imageUnreadable(null)

    // Long side ends up between MIN_LONG_SIDE and 2× it: enough for small print, without a 48 MP bitmap.
    var sample = 1
    while (longSide / (sample * 2) >= MIN_LONG_SIDE) sample *= 2
    val decoded = openImage(uri).use { BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample }) }
      ?: throw imageUnreadable(null)

    val exifRotation = try {
      resolver.openInputStream(uri)?.use { exifDegrees(ExifInterface(it)) } ?: 0
    } catch (e: IOException) {
      0
    }
    val degrees = (exifRotation + userRotation) % 360
    if (degrees == 0) return decoded
    val rotated = Bitmap.createBitmap(decoded, 0, 0, decoded.width, decoded.height, Matrix().apply { postRotate(degrees.toFloat()) }, true)
    if (rotated !== decoded) decoded.recycle()
    return rotated
  }

  private fun openImage(uri: Uri) =
    try {
      context.contentResolver.openInputStream(uri) ?: throw imageUnreadable(null)
    } catch (e: IOException) {
      throw imageUnreadable(e)
    } catch (e: SecurityException) {
      throw imageUnreadable(e)
    }

  private fun imageUnreadable(cause: Throwable?) = CodedException("ERR_IMAGE_UNREADABLE", "The image could not be opened", cause)

  private fun exifDegrees(exif: ExifInterface): Int =
    when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
      ExifInterface.ORIENTATION_ROTATE_90, ExifInterface.ORIENTATION_TRANSPOSE -> 90
      ExifInterface.ORIENTATION_ROTATE_180, ExifInterface.ORIENTATION_FLIP_VERTICAL -> 180
      ExifInterface.ORIENTATION_ROTATE_270, ExifInterface.ORIENTATION_TRANSVERSE -> 270
      else -> 0
    }

  private fun <T> withPdf(uri: String, use: (PdfRenderer) -> T): T {
    val fd: ParcelFileDescriptor = try {
      context.contentResolver.openFileDescriptor(Uri.parse(uri), "r")
    } catch (e: Exception) {
      null
    } ?: throw CodedException("ERR_PDF_UNREADABLE", "The PDF could not be opened", null)

    val renderer = try {
      PdfRenderer(fd) // takes ownership of fd and closes it on close()
    } catch (e: SecurityException) {
      fd.close()
      throw CodedException("ERR_PDF_PASSWORD", "The PDF is password-protected", e)
    } catch (e: IOException) {
      fd.close()
      throw CodedException("ERR_PDF_UNREADABLE", "The PDF could not be opened", e)
    }
    try {
      return use(renderer)
    } finally {
      renderer.close()
    }
  }

  /** Renders one page (1-based) on white, long side RENDER_LONG_SIDE px (about 200 dpi for A4). */
  private fun renderPdfPage(uri: String, pageNumber: Int): Bitmap =
    withPdf(uri) { pdf ->
      if (pageNumber < 1 || pageNumber > pdf.pageCount) {
        throw CodedException("ERR_PAGE_RANGE", "The PDF has no page $pageNumber", null)
      }
      val page = pdf.openPage(pageNumber - 1)
      try {
        val scale = RENDER_LONG_SIDE.toFloat() / max(page.width, page.height)
        val bitmap = Bitmap.createBitmap(
          max(1, (page.width * scale).roundToInt()),
          max(1, (page.height * scale).roundToInt()),
          Bitmap.Config.ARGB_8888,
        )
        bitmap.eraseColor(Color.WHITE) // pages render onto transparency; ML Kit needs a background
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        bitmap
      } finally {
        page.close()
      }
    }

  companion object {
    private const val MIN_LONG_SIDE = 1600
    private const val RENDER_LONG_SIDE = 2400
  }
}
