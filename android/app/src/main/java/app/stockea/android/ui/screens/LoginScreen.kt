package app.stockea.android.ui.screens

import android.app.Activity
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
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
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private val LoginBg = Color(0xFF0B0D0C)
private val LoginSurface = Color(0xFF171C19)
private val LoginAccent = Color(0xFFD4F562)
private val LoginAccentInk = Color(0xFF14190B)
private val LoginMuted = Color(0xFF8B9688)
private val LoginFaint = Color(0xFF6B7568)

/** Cubo isométrico, igual al mark de la PWA. */
@Composable
private fun StockeaMark(modifier: Modifier = Modifier, tint: Color) {
    Canvas(modifier = modifier) {
        val s = size.minDimension / 24f

        val top = Path().apply {
            moveTo(12f * s, 3.1f * s)
            lineTo(21.2f * s, 8f * s)
            lineTo(12f * s, 12.9f * s)
            lineTo(2.8f * s, 8f * s)
            close()
        }
        val left = Path().apply {
            moveTo(2.8f * s, 8f * s)
            lineTo(12f * s, 12.9f * s)
            lineTo(12f * s, 21f * s)
            lineTo(2.8f * s, 16.1f * s)
            close()
        }
        val right = Path().apply {
            moveTo(21.2f * s, 8f * s)
            lineTo(12f * s, 12.9f * s)
            lineTo(12f * s, 21f * s)
            lineTo(21.2f * s, 16.1f * s)
            close()
        }
        drawPath(top, tint, style = Fill)
        drawPath(left, tint.copy(alpha = 0.55f), style = Fill)
        drawPath(right, tint.copy(alpha = 0.38f), style = Fill)
    }
}

/** G oficial de Google (paths del botón web). */
@Composable
private fun GoogleMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val s = size.minDimension / 48f
        fun p(block: Path.() -> Unit) = Path().apply(block)

        val red = p {
            moveTo(24f * s, 9.5f * s)
            cubicTo(27.54f * s, 9.5f * s, 30.71f * s, 10.72f * s, 33.21f * s, 13.1f * s)
            lineTo(40.06f * s, 6.25f * s)
            cubicTo(35.9f * s, 2.38f * s, 30.47f * s, 0f, 24f * s, 0f)
            cubicTo(14.62f * s, 0f, 6.51f * s, 5.38f * s, 2.56f * s, 13.22f * s)
            lineTo(10.54f * s, 19.41f * s)
            cubicTo(12.43f * s, 13.72f * s, 17.74f * s, 9.5f * s, 24f * s, 9.5f * s)
            close()
        }
        val blue = p {
            moveTo(46.98f * s, 24.55f * s)
            cubicTo(46.98f * s, 22.98f * s, 46.83f * s, 21.46f * s, 46.6f * s, 20f * s)
            lineTo(24f * s, 20f * s)
            lineTo(24f * s, 29.02f * s)
            lineTo(36.94f * s, 29.02f * s)
            cubicTo(36.36f * s, 31.98f * s, 34.68f * s, 34.5f * s, 32.16f * s, 36.2f * s)
            lineTo(39.89f * s, 42.2f * s)
            cubicTo(44.4f * s, 38.02f * s, 46.98f * s, 31.84f * s, 46.98f * s, 24.55f * s)
            close()
        }
        val yellow = p {
            moveTo(10.53f * s, 28.59f * s)
            cubicTo(10.05f * s, 27.14f * s, 9.77f * s, 25.6f * s, 9.77f * s, 24f * s)
            cubicTo(9.77f * s, 22.4f * s, 10.04f * s, 20.86f * s, 10.53f * s, 19.41f * s)
            lineTo(2.55f * s, 13.22f * s)
            cubicTo(0.92f * s, 16.46f * s, 0f, 20.12f * s, 0f, 24f * s)
            cubicTo(0f, 27.88f * s, 0.92f * s, 31.54f * s, 2.56f * s, 34.78f * s)
            lineTo(10.53f * s, 28.59f * s)
            close()
        }
        val green = p {
            moveTo(24f * s, 48f * s)
            cubicTo(30.48f * s, 48f * s, 35.93f * s, 45.87f * s, 39.89f * s, 42.19f * s)
            lineTo(32.16f * s, 36.19f * s)
            cubicTo(30.01f * s, 37.64f * s, 27.24f * s, 38.49f * s, 24f * s, 38.49f * s)
            cubicTo(17.74f * s, 38.49f * s, 12.43f * s, 34.27f * s, 10.53f * s, 28.58f * s)
            lineTo(2.55f * s, 34.77f * s)
            cubicTo(6.51f * s, 42.62f * s, 14.62f * s, 48f * s, 24f * s, 48f * s)
            close()
        }
        drawPath(red, Color(0xFFEA4335))
        drawPath(blue, Color(0xFF4285F4))
        drawPath(yellow, Color(0xFFFBBC05))
        drawPath(green, Color(0xFF34A853))
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
        val activity = context as? Activity
        if (activity == null) {
            localError = "No se pudo abrir Google Sign-In"
            return
        }
        if (clientId.isBlank()) {
            localError = "Falta configurar GOOGLE_CLIENT_ID en el servidor"
            return
        }
        scope.launch {
            localError = ""
            try {
                val googleIdOption = GetGoogleIdOption.Builder()
                    .setFilterByAuthorizedAccounts(false)
                    .setServerClientId(clientId)
                    .setAutoSelectEnabled(false)
                    .build()
                val request = GetCredentialRequest.Builder()
                    .addCredentialOption(googleIdOption)
                    .build()
                val credentialManager = CredentialManager.create(context)
                val result = credentialManager.getCredential(activity, request)
                val credential = result.credential
                if (credential is CustomCredential &&
                    credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
                ) {
                    val google = GoogleIdTokenCredential.createFrom(credential.data)
                    onGoogleCredential(google.idToken)
                } else {
                    localError = "Google no devolvió un token válido"
                }
            } catch (_: GetCredentialCancellationException) {
                localError = ""
            } catch (_: GoogleIdTokenParsingException) {
                localError = "No se pudo leer el token de Google"
            } catch (e: GetCredentialException) {
                localError = e.message ?: "No se pudo iniciar sesión con Google"
            } catch (e: Exception) {
                localError = e.message ?: "No se pudo iniciar sesión con Google"
            }
        }
    }

    val canSignIn = !busy && !loadingClient && clientId.isNotBlank()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        LoginBg,
                        LoginSurface.copy(alpha = 0.85f),
                        LoginBg,
                    ),
                ),
            ),
    ) {
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(top = 48.dp)
                .size(220.dp)
                .background(
                    Brush.radialGradient(listOf(LoginAccent.copy(alpha = 0.28f), Color.Transparent)),
                    RoundedCornerShape(999.dp),
                ),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 80.dp)
                .size(200.dp)
                .background(
                    Brush.radialGradient(listOf(Color(0xFF7EE2B8).copy(alpha = 0.22f), Color.Transparent)),
                    RoundedCornerShape(999.dp),
                ),
        )

        IconButton(
            onClick = onToggleTheme,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .padding(top = 20.dp, end = 12.dp),
        ) {
            Icon(
                if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                contentDescription = "Cambiar tema",
                tint = Color.White,
            )
        }

        Column(
            modifier = Modifier
                .align(Alignment.Center)
                .fillMaxWidth()
                .padding(horizontal = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(88.dp)
                    .shadow(18.dp, RoundedCornerShape(28.dp), clip = false)
                    .clip(RoundedCornerShape(28.dp))
                    .background(
                        Brush.linearGradient(
                            listOf(LoginAccent, Color(0xFFB8E04A)),
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                StockeaMark(
                    modifier = Modifier.size(44.dp),
                    tint = LoginAccentInk,
                )
            }
            Text(
                "Stockea",
                color = Color.White,
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-1.5).sp,
            )
            Text(
                "Tu stock, al día",
                color = LoginMuted,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Precios de súper y alertas en un solo lugar.",
                color = LoginFaint,
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyMedium,
            )

            if (info.isNotBlank()) {
                Text(info, color = Color(0xFF7EE2B8), textAlign = TextAlign.Center)
            }
            val shownError = localError.ifBlank { error }
            if (shownError.isNotBlank()) {
                Text(shownError, color = Color(0xFFFF7A6E), textAlign = TextAlign.Center)
            }

            Box(
                modifier = Modifier
                    .padding(top = 16.dp)
                    .size(64.dp)
                    .shadow(10.dp, CircleShape, clip = false)
                    .clip(CircleShape)
                    .background(Color.White)
                    .semantics {
                        role = Role.Button
                        contentDescription = "Iniciar sesión con Google"
                    }
                    .clickable(enabled = canSignIn, onClick = { signIn() }),
                contentAlignment = Alignment.Center,
            ) {
                if (busy || loadingClient) {
                    Text(
                        "…",
                        color = Color(0xFF4285F4),
                        fontWeight = FontWeight.Bold,
                        fontSize = 22.sp,
                    )
                } else {
                    GoogleMark(modifier = Modifier.size(28.dp))
                }
            }
        }
    }
}
