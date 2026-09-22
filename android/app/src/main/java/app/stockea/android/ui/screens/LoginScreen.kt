package app.stockea.android.ui.screens

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
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.DarkMode
import androidx.compose.material.icons.outlined.LightMode
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp

@Composable
fun LoginScreen(
    busy: Boolean,
    error: String,
    info: String,
    darkTheme: Boolean,
    onToggleTheme: () -> Unit,
    onLogin: (email: String, password: String) -> Unit,
    onRegister: (firstName: String, lastName: String, email: String, password: String) -> Unit,
    onVerify: (email: String, code: String) -> Unit,
) {
    var mode by remember { mutableStateOf("login") }
    var firstName by remember { mutableStateOf("") }
    var lastName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf("") }
    var code by remember { mutableStateOf("") }
    var pendingEmail by remember { mutableStateOf("") }

    LaunchedEffect(info) {
        val match = Regex("""Tu código es (\d{6})""").find(info)
        if (match != null) code = match.groupValues[1]
    }

    val verifyEmail = when {
        error.startsWith("needs_verify:") -> error.removePrefix("needs_verify:")
        pendingEmail.isNotBlank() -> pendingEmail
        else -> email
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(20.dp)
            .verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.Center,
    ) {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
            IconButton(onClick = onToggleTheme) {
                Icon(
                    if (darkTheme) Icons.Outlined.LightMode else Icons.Outlined.DarkMode,
                    contentDescription = "Tema",
                )
            }
        }

        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(28.dp))
                .padding(22.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("Stockea", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(
                when (mode) {
                    "register" -> "Creá tu cuenta"
                    "verify" -> "Confirmá tu correo"
                    else -> "Entrá para guardar tu inventario"
                },
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (mode == "register") {
                OutlinedTextField(firstName, { firstName = it }, label = { Text("Nombre") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(lastName, { lastName = it }, label = { Text("Apellido") }, modifier = Modifier.fillMaxWidth())
            }

            if (mode != "verify") {
                OutlinedTextField(
                    email, { email = it },
                    label = { Text("Correo") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                )
                OutlinedTextField(
                    password, { password = it },
                    label = { Text("Contraseña") },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                )
            }

            if (mode == "register") {
                OutlinedTextField(
                    confirm, { confirm = it },
                    label = { Text("Repetir contraseña") },
                    modifier = Modifier.fillMaxWidth(),
                    visualTransformation = PasswordVisualTransformation(),
                )
            }

            if (mode == "verify") {
                Text(verifyEmail, color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(
                    code, { code = it },
                    label = { Text("Código") },
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                )
            }

            if (info.isNotBlank()) Text(info, color = MaterialTheme.colorScheme.secondary)
            if (error.isNotBlank() && !error.startsWith("needs_verify:")) {
                Text(error, color = MaterialTheme.colorScheme.error)
            }

            Button(
                onClick = {
                    when (mode) {
                        "login" -> onLogin(email.trim(), password)
                        "register" -> {
                            if (password != confirm) return@Button
                            onRegister(firstName.trim(), lastName.trim(), email.trim(), password)
                            pendingEmail = email.trim()
                            mode = "verify"
                        }
                        "verify" -> onVerify(verifyEmail, code.trim())
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(14.dp),
            ) {
                Text(
                    when (mode) {
                        "login" -> if (busy) "Entrando…" else "Entrar"
                        "register" -> if (busy) "Creando…" else "Registrarme"
                        else -> if (busy) "Confirmando…" else "Confirmar"
                    },
                    fontWeight = FontWeight.Bold,
                )
            }

            if (error.startsWith("needs_verify:") && mode != "verify") {
                mode = "verify"
                pendingEmail = error.removePrefix("needs_verify:")
            }

            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (mode == "login") "¿No tenés cuenta?" else "¿Ya tenés cuenta?",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                TextButton(onClick = { mode = if (mode == "login") "register" else "login" }) {
                    Text(if (mode == "login") "Registrate" else "Entrar")
                }
            }
        }
        Spacer(modifier = Modifier.height(40.dp))
    }
}
