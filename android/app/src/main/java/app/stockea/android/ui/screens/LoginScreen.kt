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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
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

@Composable
private fun GoogleMark(modifier: Modifier = Modifier) {
    Canvas(modifier = modifier) {
        val w = size.minDimension
        val blue = Color(0xFF4285F4)
        val red = Color(0xFFEA4335)
        val yellow = Color(0xFFFBBC05)
        val green = Color(0xFF34A853)
        val box = Size(w * 0.84f, w * 0.84f)
        val origin = Offset(w * 0.08f, w * 0.08f)

        drawArc(color = blue, startAngle = -35f, sweepAngle = 80f, useCenter = true, topLeft = origin, size = box)
        drawArc(color = green, startAngle = 45f, sweepAngle = 80f, useCenter = true, topLeft = origin, size = box)
        drawArc(color = yellow, startAngle = 125f, sweepAngle = 70f, useCenter = true, topLeft = origin, size = box)
        drawArc(color = red, startAngle = 195f, sweepAngle = 100f, useCenter = true, topLeft = origin, size = box)
        drawCircle(color = Color.White, radius = w * 0.26f, center = Offset(w / 2f, w / 2f))
        drawRect(
            color = blue,
            topLeft = Offset(w * 0.48f, w * 0.42f),
            size = Size(w * 0.42f, w * 0.16f),
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

    val scheme = MaterialTheme.colorScheme
    val brandColor = if (darkTheme) Color.White else scheme.onBackground
    val canSignIn = !busy && !loadingClient && clientId.isNotBlank()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    listOf(
                        scheme.background,
                        scheme.surface.copy(alpha = 0.55f),
                        scheme.background,
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
                    Brush.radialGradient(listOf(scheme.primary.copy(alpha = 0.28f), Color.Transparent)),
                    RoundedCornerShape(999.dp),
                ),
        )
        Box(
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(bottom = 80.dp)
                .size(200.dp)
                .background(
                    Brush.radialGradient(listOf(scheme.secondary.copy(alpha = 0.22f), Color.Transparent)),
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
                tint = brandColor,
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
                    .clip(RoundedCornerShape(28.dp))
                    .background(scheme.primary),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "S",
                    color = scheme.onPrimary,
                    fontWeight = FontWeight.Black,
                    fontSize = 40.sp,
                )
            }
            Text(
                "Stockea",
                color = brandColor,
                style = MaterialTheme.typography.displaySmall,
                fontWeight = FontWeight.ExtraBold,
                letterSpacing = (-1.5).sp,
            )
            Text(
                "Tu stock, al día",
                color = scheme.onSurfaceVariant,
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
            Text(
                "Precios de súper y alertas en un solo lugar.",
                color = scheme.onSurfaceVariant.copy(alpha = 0.8f),
                textAlign = TextAlign.Center,
                style = MaterialTheme.typography.bodyMedium,
            )

            if (info.isNotBlank()) {
                Text(info, color = scheme.secondary, textAlign = TextAlign.Center)
            }
            val shownError = localError.ifBlank { error }
            if (shownError.isNotBlank()) {
                Text(shownError, color = scheme.error, textAlign = TextAlign.Center)
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
