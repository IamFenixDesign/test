package app.stockea.android.auth

import android.app.Activity
import android.content.Context
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

sealed class GoogleSignInResult {
    data class Success(val idToken: String) : GoogleSignInResult()
    data object Cancelled : GoogleSignInResult()
    data class Error(val message: String) : GoogleSignInResult()
}

/**
 * Google Sign-In via Credential Manager.
 * 1) GetGoogleIdOption (cuentas ya autorizadas / One Tap)
 * 2) Si no hay credencial → GetSignInWithGoogleOption (picker completo)
 */
suspend fun requestGoogleIdToken(
    context: Context,
    activity: Activity,
    serverClientId: String,
): GoogleSignInResult {
    val credentialManager = CredentialManager.create(context)

    suspend fun parse(credential: androidx.credentials.Credential): GoogleSignInResult {
        return if (
            credential is CustomCredential &&
            credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL
        ) {
            try {
                val google = GoogleIdTokenCredential.createFrom(credential.data)
                GoogleSignInResult.Success(google.idToken)
            } catch (_: GoogleIdTokenParsingException) {
                GoogleSignInResult.Error("No se pudo leer el token de Google")
            }
        } else {
            GoogleSignInResult.Error("Google no devolvió un token válido")
        }
    }

    try {
        val googleIdOption = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(serverClientId)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(googleIdOption)
            .build()
        val result = credentialManager.getCredential(activity, request)
        return parse(result.credential)
    } catch (_: GetCredentialCancellationException) {
        return GoogleSignInResult.Cancelled
    } catch (_: NoCredentialException) {
        // Continuar con el botón Sign in with Google
    } catch (e: GetCredentialException) {
        val msg = e.message.orEmpty()
        if (!msg.contains("No credentials", ignoreCase = true) &&
            !msg.contains("cannot find a matching credential", ignoreCase = true) &&
            !msg.contains("no credential available", ignoreCase = true)
        ) {
            return GoogleSignInResult.Error(msg.ifBlank { "No se pudo iniciar sesión con Google" })
        }
    } catch (e: Exception) {
        return GoogleSignInResult.Error(e.message ?: "No se pudo iniciar sesión con Google")
    }

    return try {
        val signInOption = GetSignInWithGoogleOption.Builder(serverClientId).build()
        val request = GetCredentialRequest.Builder()
            .addCredentialOption(signInOption)
            .build()
        val result = credentialManager.getCredential(activity, request)
        parse(result.credential)
    } catch (_: GetCredentialCancellationException) {
        GoogleSignInResult.Cancelled
    } catch (_: NoCredentialException) {
        GoogleSignInResult.Error(
            "No hay cuentas de Google en este dispositivo. Agregá una en Ajustes → Google.",
        )
    } catch (e: GetCredentialException) {
        GoogleSignInResult.Error(e.message ?: "No se pudo iniciar sesión con Google")
    } catch (e: Exception) {
        GoogleSignInResult.Error(e.message ?: "No se pudo iniciar sesión con Google")
    }
}
