package app.stockea.android.data

import android.content.Context
import android.content.SharedPreferences
import okhttp3.Cookie
import okhttp3.CookieJar
import okhttp3.HttpUrl
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class StockeaApi(context: Context) {
    private val base = app.stockea.android.BuildConfig.API_BASE.trimEnd('/')
    private val prefs: SharedPreferences =
        context.getSharedPreferences("stockea_cookies", Context.MODE_PRIVATE)

    @Volatile
    private var memorySession: Cookie? = null

    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            val session = cookies.firstOrNull { it.name == "stockly_session" } ?: return
            memorySession = session
            prefs.edit()
                .putString("stockly_session", session.value)
                .putLong("stockly_session_expires", session.expiresAt)
                .putString("stockly_session_domain", session.domain)
                .putBoolean("stockly_session_secure", session.secure)
                .putBoolean("stockly_session_host_only", session.hostOnly)
                .putString("stockly_session_path", session.path)
                .commit()
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            memorySession?.let { cached ->
                if (cached.matches(url) && cached.expiresAt > System.currentTimeMillis()) {
                    return listOf(cached)
                }
            }
            val value = prefs.getString("stockly_session", null) ?: return emptyList()
            val expires = prefs.getLong("stockly_session_expires", 0L)
            if (expires in 1 until System.currentTimeMillis()) return emptyList()
            val domain = prefs.getString("stockly_session_domain", null) ?: url.host
            val path = prefs.getString("stockly_session_path", "/") ?: "/"
            val secure = prefs.getBoolean("stockly_session_secure", true)
            val hostOnly = prefs.getBoolean("stockly_session_host_only", true)
            val keptExpires = if (expires > System.currentTimeMillis()) {
                expires
            } else {
                System.currentTimeMillis() + 30L * 24 * 60 * 60 * 1000
            }
            val builder = Cookie.Builder()
                .name("stockly_session")
                .value(value)
                .path(path.ifBlank { "/" })
                .expiresAt(keptExpires)
            if (hostOnly) builder.hostOnlyDomain(domain.removePrefix("."))
            else builder.domain(domain.removePrefix("."))
            if (secure) builder.secure()
            val cookie = builder.build()
            memorySession = cookie
            return if (cookie.matches(url)) listOf(cookie) else emptyList()
        }
    }

    private val client = OkHttpClient.Builder()
        .cookieJar(cookieJar)
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
        client.newCall(builder.build()).execute().use { response ->
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
        prefs.edit()
            .remove("stockly_session")
            .remove("stockly_session_expires")
            .remove("stockly_session_domain")
            .remove("stockly_session_secure")
            .remove("stockly_session_path")
            .remove("stockly_session_host_only")
            .commit()
        memorySession = null
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
