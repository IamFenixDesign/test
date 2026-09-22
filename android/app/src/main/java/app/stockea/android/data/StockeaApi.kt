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

    private val cookieJar = object : CookieJar {
        override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
            val editor = prefs.edit()
            cookies.forEach { cookie ->
                if (cookie.name == "stockly_session") {
                    editor.putString("stockly_session", cookie.value)
                    editor.putLong("stockly_session_expires", cookie.expiresAt)
                }
            }
            editor.apply()
        }

        override fun loadForRequest(url: HttpUrl): List<Cookie> {
            val value = prefs.getString("stockly_session", null) ?: return emptyList()
            val expires = prefs.getLong("stockly_session_expires", Long.MAX_VALUE / 2)
            if (expires < System.currentTimeMillis()) return emptyList()
            val cookie = Cookie.Builder()
                .name("stockly_session")
                .value(value)
                .domain(url.host)
                .path("/")
                .expiresAt(expires)
                .build()
            return listOf(cookie)
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
        prefs.edit().remove("stockly_session").remove("stockly_session_expires").apply()
    }

    fun me(): User? {
        val data = request("GET", "/api/auth")
        val user = data.optJSONObject("user") ?: return null
        return user.toUser()
    }

    fun login(email: String, password: String): AuthResult {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "email")
                .put("email", email)
                .put("password", password),
        )
        if (data.optBoolean("needsVerification")) {
            return AuthResult.NeedsVerification(data.optString("email", email))
        }
        val user = data.optJSONObject("user")?.toUser()
            ?: throw ApiException("No se pudo iniciar sesión")
        return AuthResult.Ok(user)
    }

    fun register(firstName: String, lastName: String, email: String, password: String): String {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "register")
                .put("firstName", firstName)
                .put("lastName", lastName)
                .put("email", email)
                .put("password", password),
        )
        return data.optString("email", email)
    }

    fun verify(email: String, code: String): User {
        val data = request(
            "POST",
            "/api/auth",
            JSONObject()
                .put("provider", "verify")
                .put("email", email)
                .put("code", code),
        )
        return data.getJSONObject("user").toUser()
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

    fun searchSupers(query: String, limit: Int = 24): List<CompareRow> {
        val q = java.net.URLEncoder.encode(query, "UTF-8")
        val data = request("GET", "/api/supers?q=$q&limit=$limit")
        // supers returns a raw array; request() wraps arrays under _array
        val arr = when {
            data.has("_array") -> data.getJSONArray("_array")
            data.has("results") -> data.getJSONArray("results")
            else -> JSONArray()
        }
        return arr.toCompareRows()
    }
}

sealed class AuthResult {
    data class Ok(val user: User) : AuthResult()
    data class NeedsVerification(val email: String) : AuthResult()
}

class ApiException(message: String) : Exception(message)
