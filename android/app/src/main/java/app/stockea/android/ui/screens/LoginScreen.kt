package app.stockea.android.ui.screens

import android.app.Activity
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material3.Button
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
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

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .verticalScroll(rememberScrollState())
            .padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = onToggleTheme) {
                Icon(
                    if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                    contentDescription = "Cambiar tema",
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(28.dp))
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text("Stockea", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                "Entrá con Google para guardar tu inventario",
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (info.isNotBlank()) Text(info, color = MaterialTheme.colorScheme.secondary)
            val shownError = localError.ifBlank { error }
            if (shownError.isNotBlank()) {
                Text(shownError, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = { signIn() },
                enabled = !busy && !loadingClient && clientId.isNotBlank(),
                modifier = Modifier.fillMaxWidth().height(52.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(
                    when {
                        busy -> "Entrando…"
                        loadingClient -> "Cargando…"
                        else -> "Continuar con Google"
                    },
                    fontWeight = FontWeight.Bold,
                )
            }
        }
        Spacer(modifier = Modifier.height(24.dp))
    }
}
