package app.stockea.android.data

import android.content.Context
import android.content.SharedPreferences
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class StockeaApi(context: Context) {
    private val base = app.stockea.android.BuildConfig.API_BASE.trimEnd('/')
    private val prefs: SharedPreferences =
        context.getSharedPreferences("stockea_cookies", Context.MODE_PRIVATE)

    @Volatile
    private var memorySession: String? = prefs.getString("stockly_session_raw", null)

    private fun sessionValue(): String? {
        val value = memorySession ?: prefs.getString("stockly_session_raw", null)
        return value?.takeIf { it.isNotBlank() }
    }

    private fun rememberSession(response: Response) {
        val headers = response.headers("Set-Cookie")
        for (header in headers) {
            val pair = header.substringBefore(';').trim()
            val eq = pair.indexOf('=')
            if (eq <= 0) continue
            if (pair.substring(0, eq).trim() != "stockly_session") continue
            val value = pair.substring(eq + 1).trim()
            if (value.isEmpty()) {
                memorySession = null
                prefs.edit().remove("stockly_session_raw").commit()
                return
            }
            memorySession = value
            prefs.edit().putString("stockly_session_raw", value).commit()
            return
        }
    }

    private fun applySession(builder: Request.Builder) {
        val value = sessionValue() ?: return
        builder.header("Cookie", "stockly_session=$value")
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .build()

    private val jsonMedia = "application/json; charset=utf-8".toMediaType()

    private fun request(
        method: String,
        path: String,
        body: JSONObject? = null,
    ): JSONObject {
        val builder = Request.Builder().url("$base$path")
        applySession(builder)
        if (method == "GET" && path.contains("/api/supers")) {
            builder.header("Cache-Control", "no-cache")
            builder.header("Pragma", "no-cache")
        }
        when (method) {
            "GET" -> builder.get()
            "DELETE" -> {
                val payload = (body ?: JSONObject()).toString().toRequestBody(jsonMedia)
                builder.delete(payload)
            }
            else -> {
                val payload = (body ?: JSONObject()).toString().toRequestBody(jsonMedia)
                builder.method(method, payload)
            }
        }
        client.newCall(builder.build()).execute().use { response ->
            rememberSession(response)
            val raw = response.body?.string().orEmpty()
            val parsed = runCatching { JSONObject(raw) }.getOrElse {
                if (raw.trimStart().startsWith("[")) {
                    return JSONObject().put("_array", JSONArray(raw))
                }
                JSONObject()
            }
            if (parsed.has("needsVerification")) return parsed
            if (!response.isSuccessful) {
                throw ApiException(parsed.optString("error", "Error ${response.code}"))
            }
            return parsed
        }
    }

    private fun requestArray(path: String): JSONArray {
        val builder = Request.Builder().url("$base$path").get()
        applySession(builder)
        client.newCall(builder.build()).execute().use { response ->
            rememberSession(response)
            val raw = response.body?.string().orEmpty()
            if (response.code == 401) return JSONArray()
            if (!response.isSuccessful) {
                val err = runCatching { JSONObject(raw).optString("error") }.getOrNull()
                throw ApiException(err ?: "Error ${response.code}")
            }
            return JSONArray(raw)
        }
    }

    fun clearSession() {
        memorySession = null
        prefs.edit().remove("stockly_session_raw").commit()
    }

    fun me(): User? {
        val data = request("GET", "/api/auth")
        val user = data.optJSONObject("user") ?: return null
        return user.toUser()
    }

    fun googleClientId(): String {
        val configured = app.stockea.android.BuildConfig.GOOGLE_WEB_CLIENT_ID.trim()
        if (configured.isNotEmpty()) return configured
        val data = request("GET", "/api/auth")
        return data.optString("googleClientId", "").trim()
    }

    fun loginWithGoogle(idToken: String): LoginResult {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "google")
                .put("credential", idToken),
        )
        if (sessionValue().isNullOrBlank()) {
            throw ApiException("Google entró, pero el servidor no devolvió la sesión")
        }
        val user = data.optJSONObject("user")?.toUser()
            ?: throw ApiException("No se pudo iniciar sesión con Google")
        return LoginResult(
            user = user,
            linked = data.optBoolean("linked"),
            created = data.optBoolean("created"),
            itemCount = data.optInt("itemCount", 0),
            moved = data.optInt("moved", 0),
        )
    }

    fun linkGoogle(idToken: String): LoginResult {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "link-google")
                .put("credential", idToken),
        )
        val user = data.optJSONObject("user")?.toUser()
            ?: throw ApiException("No se pudo vincular Google")
        return LoginResult(
            user = user,
            linked = true,
            created = false,
            itemCount = data.optInt("itemCount", 0),
            moved = data.optInt("moved", 0),
        )
    }

    fun mergeLegacy(email: String, password: String): LoginResult {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "merge-legacy")
                .put("email", email)
                .put("password", password),
        )
        val user = data.optJSONObject("user")?.toUser()
            ?: throw ApiException("No se pudo unir la cuenta")
        return LoginResult(
            user = user,
            linked = false,
            created = false,
            itemCount = data.optInt("itemCount", 0),
            moved = data.optInt("moved", 0),
            merged = data.optBoolean("merged"),
        )
    }

    fun logout() {
        runCatching {
            request("POST", "/api/auth", JSONObject().put("provider", "logout"))
        }
        clearSession()
    }

    fun updateProfile(firstName: String, lastName: String, email: String): User {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "profile")
                .put("firstName", firstName)
                .put("lastName", lastName)
                .put("email", email),
        )
        return data.getJSONObject("user").toUser()
    }

    fun fetchItems(): List<StockItem> = requestArray("/api/items").toStockItems()

    fun upsertItem(item: StockItem) {
        request("POST", "/api/items", item.toJson())
    }

    fun deleteItem(id: String) {
        request("DELETE", "/api/items?id=${java.net.URLEncoder.encode(id, "UTF-8")}", JSONObject().put("id", id))
    }

    fun searchSupersRaw(query: String, limit: Int = 24): StoreSearchResults {
        val q = java.net.URLEncoder.encode(query, "UTF-8")
        // _ts evita respuestas cacheadas: Comparar debe verse al momento
        val data = request("GET", "/api/supers?q=$q&limit=$limit&_ts=${System.currentTimeMillis()}")
        val errorsObj = data.optJSONObject("errors")
        val errors = buildMap {
            if (errorsObj != null) {
                val keys = errorsObj.keys()
                while (keys.hasNext()) {
                    val key = keys.next()
                    val msg = errorsObj.optString(key).trim()
                    if (msg.isNotBlank()) put(key, msg)
                }
            }
        }
        return StoreSearchResults(
            coto = data.optJSONArray("coto")?.toStoreProducts().orEmpty(),
            carrefour = data.optJSONArray("carrefour")?.toStoreProducts().orEmpty(),
            dia = data.optJSONArray("dia")?.toStoreProducts().orEmpty(),
            errors = errors,
        )
    }

    fun searchSupers(query: String, limit: Int = 48): List<CompareRow> {
        val raw = searchSupersRaw(query, limit)
        return buildWebCompareRows(raw.coto, raw.carrefour, raw.dia)
    }
}

data class LoginResult(
    val user: User,
    val linked: Boolean = false,
    val created: Boolean = false,
    val itemCount: Int = 0,
    val moved: Int = 0,
    val merged: Boolean = false,
)

class ApiException(message: String) : Exception(message)
