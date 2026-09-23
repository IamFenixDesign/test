package app.stockea.android.ui.screens

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.stockea.android.auth.GoogleSignInResult
import app.stockea.android.auth.findActivity
import app.stockea.android.auth.requestGoogleIdToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Cubo Stockea a color (mismo que favicon / app icon). */
@Composable
private fun StockeaLogoMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val s = size.minDimension / 32f
        val top = Path().apply {
            moveTo(16f * s, 6.1f * s)
            lineTo(25.4f * s, 11.1f * s)
            lineTo(16f * s, 16.1f * s)
            lineTo(6.6f * s, 11.1f * s)
            close()
        }
        val left = Path().apply {
            moveTo(6.6f * s, 11.1f * s)
            lineTo(16f * s, 16.1f * s)
            lineTo(16f * s, 25.9f * s)
            lineTo(6.6f * s, 20.9f * s)
            close()
        }
        val right = Path().apply {
            moveTo(25.4f * s, 11.1f * s)
            lineTo(16f * s, 16.1f * s)
            lineTo(16f * s, 25.9f * s)
            lineTo(25.4f * s, 20.9f * s)
            close()
        }
        drawPath(top, Color(0xFFD4F562), style = Fill)
        drawPath(left, Color(0xFF7A9C24), style = Fill)
        drawPath(right, Color(0xFF7EE2B8), style = Fill)
    }
}

/** G oficial de Google. */
@Composable
private fun GoogleMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val s = size.minDimension / 48f
        fun p(block: Path.() -> Unit) = Path().apply(block)

        drawPath(
            p {
                moveTo(24f * s, 9.5f * s)
                cubicTo(27.54f * s, 9.5f * s, 30.71f * s, 10.72f * s, 33.21f * s, 13.1f * s)
                lineTo(40.06f * s, 6.25f * s)
                cubicTo(35.9f * s, 2.38f * s, 30.47f * s, 0f, 24f * s, 0f)
                cubicTo(14.62f * s, 0f, 6.51f * s, 5.38f * s, 2.56f * s, 13.22f * s)
                lineTo(10.54f * s, 19.41f * s)
                cubicTo(12.43f * s, 13.72f * s, 17.74f * s, 9.5f * s, 24f * s, 9.5f * s)
                close()
            },
            Color(0xFFEA4335),
        )
        drawPath(
            p {
                moveTo(46.98f * s, 24.55f * s)
                cubicTo(46.98f * s, 22.98f * s, 46.83f * s, 21.46f * s, 46.6f * s, 20f * s)
                lineTo(24f * s, 20f * s)
                lineTo(24f * s, 29.02f * s)
                lineTo(36.94f * s, 29.02f * s)
                cubicTo(36.36f * s, 31.98f * s, 34.68f * s, 34.5f * s, 32.16f * s, 36.2f * s)
                lineTo(39.89f * s, 42.2f * s)
                cubicTo(44.4f * s, 38.02f * s, 46.98f * s, 31.84f * s, 46.98f * s, 24.55f * s)
                close()
            },
            Color(0xFF4285F4),
        )
        drawPath(
            p {
                moveTo(10.53f * s, 28.59f * s)
                cubicTo(10.05f * s, 27.14f * s, 9.77f * s, 25.6f * s, 9.77f * s, 24f * s)
                cubicTo(9.77f * s, 22.4f * s, 10.04f * s, 20.86f * s, 10.53f * s, 19.41f * s)
                lineTo(2.55f * s, 13.22f * s)
                cubicTo(0.92f * s, 16.46f * s, 0f, 20.12f * s, 0f, 24f * s)
                cubicTo(0f, 27.88f * s, 0.92f * s, 31.54f * s, 2.56f * s, 34.78f * s)
                lineTo(10.53f * s, 28.59f * s)
                close()
            },
            Color(0xFFFBBC05),
        )
        drawPath(
            p {
                moveTo(24f * s, 48f * s)
                cubicTo(30.48f * s, 48f * s, 35.93f * s, 45.87f * s, 39.89f * s, 42.19f * s)
                lineTo(32.16f * s, 36.19f * s)
                cubicTo(30.01f * s, 37.64f * s, 27.24f * s, 38.49f * s, 24f * s, 38.49f * s)
                cubicTo(17.74f * s, 38.49f * s, 12.43f * s, 34.27f * s, 10.53f * s, 28.58f * s)
                lineTo(2.55f * s, 34.77f * s)
                cubicTo(6.51f * s, 42.62f * s, 14.62f * s, 48f * s, 24f * s, 48f * s)
                close()
            },
            Color(0xFF34A853),
        )
    }
}

@Composable
fun LoginScreen(
    busy: Boolean,
    error: String,
    info: String,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    resolveGoogleClientId: suspend () -> String,
    onGoogleCredential: (idToken: String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var clientId by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf("") }
    var loadingClient by remember { mutableStateOf(true) }
    var signingIn by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        loadingClient = true
        localError = ""
        clientId = withContext(Dispatchers.IO) { resolveGoogleClientId() }
        if (clientId.isBlank()) {
            localError = "Falta configurar GOOGLE_CLIENT_ID en el servidor"
        }
        loadingClient = false
    }

    fun signIn() {
        if (signingIn || busy) return
        val activity = context.findActivity()
        if (activity == null) {
            localError = "No se pudo abrir Google Sign-In"
            return
        }
        if (clientId.isBlank()) {
            localError = "Falta configurar GOOGLE_CLIENT_ID en el servidor"
            return
        }
        scope.launch {
            signingIn = true
            localError = ""
            try {
                when (val result = requestGoogleIdToken(context, activity, clientId)) {
                    is GoogleSignInResult.Success -> onGoogleCredential(result.idToken)
                    GoogleSignInResult.Cancelled -> localError = "Inicio de sesión cancelado"
                    is GoogleSignInResult.Error -> localError = result.message
                }
            } finally {
                signingIn = false
            }
        }
    }

    val scheme = MaterialTheme.colorScheme
    val brandColor = if (darkTheme) Color.White else scheme.onBackground
    val waiting = busy || signingIn || loadingClient
    val canSignIn = !waiting && clientId.isNotBlank()
    val accent = scheme.primary
    val mint = scheme.secondary

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        if (darkTheme) Color(0xFF0B0D0C) else Color(0xFFF2F5EE),
                        if (darkTheme) Color(0xFF121714) else Color(0xFFE8EFE0),
                        if (darkTheme) Color(0xFF0B0D0C) else Color(0xFFF2F5EE),
                    ),
                ),
            ),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 24.dp)
                .size(280.dp)
                .background(
                    Brush.radialGradient(
                        listOf(accent.copy(alpha = if (darkTheme) 0.32f else 0.38f), Color.Transparent),
                    ),
                    RoundedCornerShape(999.dp),
                ),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 48.dp)
                .size(240.dp)
                .background(
                    Brush.radialGradient(
                        listOf(mint.copy(alpha = if (darkTheme) 0.26f else 0.22f), Color.Transparent),
                    ),
                    RoundedCornerShape(999.dp),
                ),
        )

        IconButton(
            onClick = onToggleTheme,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .statusBarsPadding()
                .padding(top = 4.dp, end = 8.dp),
        ) {
            Icon(
                if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                contentDescription = if (darkTheme) "Cambiar a tema claro" else "Cambiar a tema oscuro",
                tint = brandColor,
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .widthIn(max = 420.dp)
                .padding(horizontal = 28.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(0.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(92.dp)
                    .shadow(22.dp, RoundedCornerShape(23.dp), clip = false)
                    .clip(RoundedCornerShape(23.dp))
                    .background(Color(0xFF0B0D0C)),
                contentAlignment = Alignment.Center,
            ) {
                StockeaLogoMark(modifier = Modifier.size(72.dp))
            }

            Text(
                "Stockea",
                modifier = Modifier.padding(top = 18.dp),
                color = brandColor,
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-1.8).sp,
                textAlign = TextAlign.Center,
            )
            Text(
                "Tu stock, al día",
                modifier = Modifier.padding(top = 8.dp),
                color = scheme.onSurfaceVariant,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
                textAlign = TextAlign.Center,
            )
            Text(
                "Precios de súper y alertas en un solo lugar.",
                modifier = Modifier.padding(top = 6.dp),
                color = scheme.onSurfaceVariant.copy(alpha = 0.82f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyMedium,
            )

            if (info.isNotBlank()) {
                Text(
                    info,
                    modifier = Modifier.padding(top = 14.dp),
                    color = mint,
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
            val shownError = localError.ifBlank { error }
            if (shownError.isNotBlank()) {
                Text(
                    shownError,
                    modifier = Modifier.padding(top = 14.dp),
                    color = scheme.error,
                    textAlign = TextAlign.Center,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Box(
                modifier = Modifier
                    .padding(top = 36.dp)
                    .size(68.dp)
                    .shadow(12.dp, CircleShape, clip = false)
                    .clip(CircleShape)
                    .background(Color.White)
                    .semantics {
                        role = Role.Button
                        contentDescription = "Iniciar sesión con Google"
                    }
                    .clickable(enabled = canSignIn, onClick = { signIn() }),
                contentAlignment = Alignment.Center,
            ) {
                if (waiting) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(26.dp),
                        strokeWidth = 2.5.dp,
                        color = Color(0xFF4285F4),
                    )
                } else {
                    GoogleMark(modifier = Modifier.size(30.dp))
                }
            }

            if (busy || signingIn) {
                Text(
                    "Entrando…",
                    modifier = Modifier.padding(top = 12.dp),
                    color = scheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
            }

            Box(modifier = Modifier.height(24.dp))
        }
    }
}
