package app.stockea.android.ui.screens

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import android.view.ViewGroup
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.core.TorchState
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.FlashlightOff
import androidx.compose.material.icons.outlined.FlashlightOn
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import app.stockea.android.data.extractEan13
import app.stockea.android.ui.theme.Accent
import app.stockea.android.ui.theme.AccentInk
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@Composable
fun BarcodeScannerScreen(
    onDetect: (String) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    var detectedEan by remember { mutableStateOf("") }
    var torchOn by remember { mutableStateOf(false) }
    var torchControl by remember { mutableStateOf<((Boolean) -> Unit)?>(null) }
    val locked = remember { AtomicBoolean(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission(),
    ) { granted ->
        hasPermission = granted
        if (!granted) onCancel()
    }

    DisposableEffect(Unit) {
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
        onDispose { }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
    ) {
        if (hasPermission) {
            CameraBarcodePreview(
                modifier = Modifier.fillMaxSize(),
                onTorchControl = { torchControl = it },
                onRawCode = { raw ->
                    if (locked.get()) return@CameraBarcodePreview
                    val ean = extractEan13(raw)
                    if (ean.length == 13 && locked.compareAndSet(false, true)) {
                        detectedEan = ean
                        onDetect(ean)
                    }
                },
            )
        }

        // Overlay marco de escaneo
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(bottom = 120.dp),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .fillMaxWidth(0.86f)
                    .height(168.dp)
                    .border(
                        width = 2.dp,
                        color = if (detectedEan.isNotBlank()) Accent else Accent.copy(alpha = 0.7f),
                        shape = RoundedCornerShape(22.dp),
                    ),
            )
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .statusBarsPadding()
                .padding(horizontal = 12.dp, vertical = 8.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                IconButton(
                    onClick = {
                        val next = !torchOn
                        torchOn = next
                        torchControl?.invoke(next)
                    },
                    modifier = Modifier
                        .size(44.dp)
                        .background(Color.White.copy(alpha = 0.14f), CircleShape),
                ) {
                    Icon(
                        if (torchOn) Icons.Outlined.FlashlightOn else Icons.Outlined.FlashlightOff,
                        contentDescription = "Linterna",
                        tint = if (torchOn) AccentInk else Color.White,
                        modifier = if (torchOn) {
                            Modifier
                                .background(Accent, CircleShape)
                                .padding(6.dp)
                        } else {
                            Modifier
                        },
                    )
                }
                Text(
                    if (detectedEan.isNotBlank()) "EAN detectado" else "Escanear código",
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                )
                IconButton(
                    onClick = onCancel,
                    modifier = Modifier
                        .size(44.dp)
                        .background(Color.White.copy(alpha = 0.14f), CircleShape),
                ) {
                    Icon(Icons.Outlined.Close, contentDescription = "Cerrar", tint = Color.White)
                }
            }
        }

        Column(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .navigationBarsPadding()
                .padding(20.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (detectedEan.isNotBlank()) {
                Text(
                    "EAN $detectedEan",
                    color = Accent,
                    fontWeight = FontWeight.Bold,
                )
            } else {
                Text(
                    "Alejá o acercá el código: lo leemos de lejos",
                    color = Color.White.copy(alpha = 0.82f),
                    textAlign = TextAlign.Center,
                )
            }
            Button(
                onClick = onCancel,
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = Color.Black,
                ),
                shape = RoundedCornerShape(999.dp),
                modifier = Modifier
                    .fillMaxWidth(0.55f)
                    .height(46.dp),
            ) {
                Text("Cancelar", fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun CameraBarcodePreview(
    modifier: Modifier,
    onTorchControl: ((Boolean) -> Unit) -> Unit,
    onRawCode: (String) -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val analysisExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                    Barcode.FORMAT_EAN_13,
                    Barcode.FORMAT_EAN_8,
                    Barcode.FORMAT_UPC_A,
                    Barcode.FORMAT_UPC_E,
                    Barcode.FORMAT_CODE_128,
                )
                .build(),
        )
    }

    DisposableEffect(Unit) {
        onDispose {
            analysisExecutor.shutdown()
            scanner.close()
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { ctx ->
            PreviewView(ctx).apply {
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT,
                )
                scaleType = PreviewView.ScaleType.FILL_CENTER
                implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            }
        },
        update = { previewView ->
            val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
            cameraProviderFuture.addListener(
                {
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.surfaceProvider = previewView.surfaceProvider
                    }
                    val analysis = ImageAnalysis.Builder()
                        .setTargetResolution(Size(1280, 720))
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                        .also { imageAnalysis ->
                            imageAnalysis.setAnalyzer(analysisExecutor) { imageProxy ->
                                val mediaImage = imageProxy.image
                                if (mediaImage == null) {
                                    imageProxy.close()
                                    return@setAnalyzer
                                }
                                val image = InputImage.fromMediaImage(
                                    mediaImage,
                                    imageProxy.imageInfo.rotationDegrees,
                                )
                                scanner.process(image)
                                    .addOnSuccessListener { barcodes ->
                                        val value = barcodes
                                            .asSequence()
                                            .mapNotNull { it.rawValue }
                                            .firstOrNull()
                                        if (!value.isNullOrBlank()) onRawCode(value)
                                    }
                                    .addOnCompleteListener { imageProxy.close() }
                            }
                        }

                    try {
                        cameraProvider.unbindAll()
                        val camera = cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            analysis,
                        )
                        onTorchControl { enabled ->
                            if (camera.cameraInfo.hasFlashUnit()) {
                                camera.cameraControl.enableTorch(enabled)
                            }
                        }
                        // Sync initial torch state if needed
                        val torchState = camera.cameraInfo.torchState.value
                        if (torchState == TorchState.ON) {
                            // no-op
                        }
                    } catch (_: Exception) {
                        // Camera bind can race on recompose; ignore and retry next frame
                    }
                },
                ContextCompat.getMainExecutor(context),
            )
        },
    )
}
