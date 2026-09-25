package app.stockea.android.auth

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.credentials.Credential
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.android.libraries.identity.googleid.GoogleIdTokenParsingException
import java.security.MessageDigest

private const val TAG = "StockeaGoogleSignIn"

/** Play Services cierra el sheet al toque cuando el SHA-1 no está en el cliente Android. */
private const val FAST_CANCEL_MS = 1200L

sealed class GoogleSignInResult {
    data class Success(val idToken: String) : GoogleSignInResult()
    data object Cancelled : GoogleSignInResult()
    data class Error(val message: String) : GoogleSignInResult()
}

tailrec fun Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

private fun parseGoogleCredential(credential: Credential): GoogleSignInResult {
    return if (
        credential is CustomCredential &&
        credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
    ) {
        try {
            val google = GoogleIdTokenCredential.createFrom(credential.data)
            val token = google.idToken
            if (token.isNullOrBlank()) {
                GoogleSignInResult.Error("Google no devolvió un token")
            } else {
                GoogleSignInResult.Success(token)
            }
        } catch (_: GoogleIdTokenParsingException) {
            GoogleSignInResult.Error("No se pudo leer el token de Google")
        }
    } else {
        Log.w(TAG, "Unexpected credential type=${credential::class.java.name}")
        GoogleSignInResult.Error("Google no devolvió un token válido")
    }
}

private fun isNoCredentialMessage(msg: String): Boolean {
    val m = msg.lowercase()
    return m.contains("no credential") ||
        m.contains("no credentials") ||
        m.contains("cannot find a matching credential") ||
        m.contains("no matching credential") ||
        m.contains("16:") // common Play Services status for no credentials
}

private fun isConfigCancellation(e: GetCredentialCancellationException): Boolean {
    val msg = (e.errorMessage?.toString() ?: e.message).orEmpty().lowercase()
    return msg.contains("developer") ||
        msg.contains("28444") ||
        msg.contains("not set up") ||
        msg.contains("[10]") ||
        msg.contains("10:")
}

private fun signingSha1(context: Context): String {
    return try {
        val pm = context.packageManager
        val signatures = if (Build.VERSION.SDK_INT >= 28) {
            val info = pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            info.signingInfo?.apkContentsSigners
        } else {
            @Suppress("DEPRECATION")
            pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES).signatures
        }
        val cert = signatures?.firstOrNull()?.toByteArray() ?: return "desconocido"
        MessageDigest.getInstance("SHA-1").digest(cert).joinToString("") { "%02x".format(it) }
    } catch (e: Exception) {
        Log.w(TAG, "No se pudo leer el SHA-1", e)
        "desconocido"
    }
}

private fun certificateRejectedMessage(context: Context): String {
    val sha1 = signingSha1(context)
    return "Google cerró el acceso porque no reconoce el certificado de la app. " +
        "En Google Cloud, cliente Android, paquete ${context.packageName}, agregá el SHA-1 $sha1."
}

/**
 * Flujo para el botón de login (toque explícito):
 * 1) Sign in with Google (picker completo) — el correcto para un botón
 * 2) Fallback GetGoogleIdOption si el dispositivo no soporta SIWG
 */
suspend fun requestGoogleIdToken(
    context: Context,
    activity: Activity,
    serverClientId: String,
): GoogleSignInResult {
    if (serverClientId.isBlank()) {
        return GoogleSignInResult.Error("Falta configurar GOOGLE_CLIENT_ID")
    }

    val credentialManager = CredentialManager.create(activity)

    // 1) Sign in with Google (botón)
    val buttonStarted = SystemClock.elapsedRealtime()
    try {
        val signInOption = GetSignInWithGoogleOption.Builder(serverClientId).build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(signInOption)
            .build()
        val result = credentialManager.getCredential(activity, request)
        return parseGoogleCredential(result.credential)
    } catch (e: GetCredentialCancellationException) {
        val elapsed = SystemClock.elapsedRealtime() - buttonStarted
        val fast = elapsed < FAST_CANCEL_MS
        Log.i(TAG, "SIWG cancelled elapsed=${elapsed}ms type=${e.type} msg=${e.errorMessage}")
        // Un toque real tarda; un cierre inmediato es el certificado (SHA-1) o un fallo de SIWG.
        if (!fast && !isConfigCancellation(e)) {
            return GoogleSignInResult.Cancelled
        }
    } catch (e: NoCredentialException) {
        Log.i(TAG, "SIWG NoCredentialException, trying GoogleIdOption", e)
    } catch (e: GetCredentialException) {
        val msg = e.message.orEmpty()
        Log.w(TAG, "SIWG GetCredentialException: $msg", e)
        if (!isNoCredentialMessage(msg)) {
            return GoogleSignInResult.Error(
                msg.ifBlank { "No se pudo iniciar sesión con Google" },
            )
        }
    } catch (e: Exception) {
        Log.e(TAG, "SIWG unexpected error", e)
        return GoogleSignInResult.Error(e.message ?: "No se pudo iniciar sesión con Google")
    }

    // 2) Fallback One Tap / Google ID
    val fallbackStarted = SystemClock.elapsedRealtime()
    return try {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()
        val result = credentialManager.getCredential(activity, request)
        parseGoogleCredential(result.credential)
    } catch (e: GetCredentialCancellationException) {
        val elapsed = SystemClock.elapsedRealtime() - fallbackStarted
        Log.i(TAG, "GoogleId cancelled elapsed=${elapsed}ms type=${e.type} msg=${e.errorMessage}")
        if (elapsed < FAST_CANCEL_MS || isConfigCancellation(e)) {
            GoogleSignInResult.Error(certificateRejectedMessage(activity))
        } else {
            GoogleSignInResult.Cancelled
        }
    } catch (_: NoCredentialException) {
        GoogleSignInResult.Error(
            "No hay cuentas de Google disponibles. Agregá una en Ajustes → Google e intentá de nuevo.",
        )
    } catch (e: GetCredentialException) {
        GoogleSignInResult.Error(e.message ?: "No se pudo iniciar sesión con Google")
    } catch (e: Exception) {
        GoogleSignInResult.Error(e.message ?: "No se pudo iniciar sesión con Google")
    }
}
