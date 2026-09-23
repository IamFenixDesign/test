package app.stockea.android.ui.screens

import android.app.Activity
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import app.stockea.android.auth.GoogleSignInResult
import app.stockea.android.auth.requestGoogleIdToken
import app.stockea.android.data.User
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@Composable
fun ProfileScreen(
    user: User,
    busy: Boolean,
    info: String,
    error: String,
    itemCount: Int,
    contentPadding: PaddingValues,
    onSave: (firstName: String, lastName: String, email: String) -> Unit,
    onExportJson: () -> String,
    onImportJson: (String) -> Unit,
    resolveGoogleClientId: suspend () -> String,
    onLinkGoogle: (idToken: String) -> Unit,
    onMergeLegacy: (email: String, password: String) -> Unit,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var firstName by remember(user.id) { mutableStateOf(user.firstName) }
    var lastName by remember(user.id) { mutableStateOf(user.lastName) }
    var email by remember(user.id) { mutableStateOf(user.email) }
    var pendingExport by remember { mutableStateOf<String?>(null) }
    var legacyEmail by remember { mutableStateOf("") }
    var legacyPassword by remember { mutableStateOf("") }
    var googleClientId by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf("") }

    LaunchedEffect(Unit) {
        googleClientId = withContext(Dispatchers.IO) { resolveGoogleClientId() }
    }

    val createDoc = rememberLauncherForActivityResult(
        ActivityResultContracts.CreateDocument("application/json"),
    ) { uri: Uri? ->
        val body = pendingExport
        pendingExport = null
        if (uri == null || body == null) return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.openOutputStream(uri)?.use { stream ->
                stream.write(body.toByteArray(Charsets.UTF_8))
            }
        }
    }

    val openDoc = rememberLauncherForActivityResult(
        ActivityResultContracts.OpenDocument(),
    ) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        runCatching {
            val text = context.contentResolver.openInputStream(uri)?.use { stream ->
                stream.bufferedReader(Charsets.UTF_8).readText()
            }.orEmpty()
            if (text.isNotBlank()) onImportJson(text)
        }
    }

    fun linkGoogle() {
        val activity = context as? Activity ?: return
        if (googleClientId.isBlank()) {
            localError = "Falta configurar GOOGLE_CLIENT_ID"
            return
        }
        scope.launch {
            localError = ""
            when (val result = requestGoogleIdToken(context, activity, googleClientId)) {
                is GoogleSignInResult.Success -> onLinkGoogle(result.idToken)
                GoogleSignInResult.Cancelled -> localError = ""
                is GoogleSignInResult.Error -> localError = result.message
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(
                start = 16.dp,
                end = 16.dp,
                top = contentPadding.calculateTopPadding() + 8.dp,
                bottom = contentPadding.calculateBottomPadding() + 16.dp,
            ),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Perfil", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)

        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    user.name.ifBlank { "${user.firstName} ${user.lastName}".trim() },
                    fontWeight = FontWeight.Bold,
                )
                Text(user.email, color = MaterialTheme.colorScheme.onSurfaceVariant)
                Text(
                    if (user.provider == "google") "Vinculada a Google" else "Cuenta con correo",
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.labelMedium,
                    fontWeight = FontWeight.Bold,
                )
            }
        }

        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Google y sincronización", fontWeight = FontWeight.Bold)
                if (user.provider == "google") {
                    Text(
                        "Si antes tenías Stockea con otro correo y contraseña, uní esa cuenta para traer el stock.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    OutlinedTextField(
                        legacyEmail,
                        { legacyEmail = it },
                        label = { Text("Correo anterior") },
                        modifier = Modifier.fillMaxWidth(),
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    )
                    OutlinedTextField(
                        legacyPassword,
                        { legacyPassword = it },
                        label = { Text("Contraseña anterior") },
                        modifier = Modifier.fillMaxWidth(),
                        visualTransformation = PasswordVisualTransformation(),
                    )
                    Button(
                        onClick = { onMergeLegacy(legacyEmail.trim(), legacyPassword) },
                        enabled = !busy && legacyEmail.isNotBlank() && legacyPassword.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(if (busy) "Uniendo…" else "Unir cuenta y traer stock", fontWeight = FontWeight.Bold)
                    }
                } else {
                    Text(
                        "Vinculá Google a esta cuenta. Se conserva el mismo inventario en la nube.",
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        style = MaterialTheme.typography.bodySmall,
                    )
                    Button(
                        onClick = { linkGoogle() },
                        enabled = !busy && googleClientId.isNotBlank(),
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(if (busy) "Vinculando…" else "Vincular con Google", fontWeight = FontWeight.Bold)
                    }
                }
                if (localError.isNotBlank()) {
                    Text(localError, color = MaterialTheme.colorScheme.error)
                }
            }
        }

        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                OutlinedTextField(
                    firstName,
                    { firstName = it },
                    label = { Text("Nombre") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    lastName,
                    { lastName = it },
                    label = { Text("Apellido") },
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    email,
                    { email = it },
                    label = { Text("Correo") },
                    modifier = Modifier.fillMaxWidth(),
                )
                if (info.isNotBlank()) Text(info, color = MaterialTheme.colorScheme.secondary)
                if (error.isNotBlank() && !error.startsWith("needs_verify:")) {
                    Text(error, color = MaterialTheme.colorScheme.error)
                }
                Button(
                    onClick = { onSave(firstName.trim(), lastName.trim(), email.trim()) },
                    enabled = !busy,
                    modifier = Modifier.fillMaxWidth().height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                ) {
                    Text(if (busy) "Guardando…" else "Guardar cambios", fontWeight = FontWeight.Bold)
                }
            }
        }

        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Text("Lista de stock", fontWeight = FontWeight.Bold)
                Text(
                    "Exportá un JSON de respaldo o importá una lista para sumar/actualizar productos.",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    style = MaterialTheme.typography.bodySmall,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(
                        onClick = {
                            val body = onExportJson()
                            pendingExport = body
                            createDoc.launch("stockea-stock-${LocalDate.now()}.json")
                        },
                        enabled = !busy && itemCount > 0,
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text("Exportar", fontWeight = FontWeight.Bold)
                    }
                    Button(
                        onClick = { openDoc.launch(arrayOf("application/json", "text/*")) },
                        enabled = !busy,
                        modifier = Modifier.weight(1f).height(50.dp),
                        shape = RoundedCornerShape(14.dp),
                    ) {
                        Text(
                            if (busy) "Importando…" else "Importar",
                            fontWeight = FontWeight.Bold,
                        )
                    }
                }
            }
        }

        OutlinedButton(
            onClick = onLogout,
            modifier = Modifier.fillMaxWidth().height(48.dp),
            shape = RoundedCornerShape(14.dp),
        ) {
            Text("Cerrar sesión", color = MaterialTheme.colorScheme.error)
        }
        Spacer(modifier = Modifier.height(12.dp))
    }
}
