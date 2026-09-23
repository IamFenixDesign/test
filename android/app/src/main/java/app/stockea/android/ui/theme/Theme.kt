package app.stockea.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat
import app.stockea.android.auth.findActivity

val Accent = Color(0xFFD4F562)
val AccentInk = Color(0xFF14190B)
val Danger = Color(0xFFFF7A6E)

private val DarkColors = darkColorScheme(
    primary = Accent,
    onPrimary = AccentInk,
    secondary = Color(0xFF7EE2B8),
    background = Color(0xFF0B0D0C),
    surface = Color(0xFF171C19),
    surfaceVariant = Color(0xFF1D2420),
    onBackground = Color(0xFFEEF4EA),
    onSurface = Color(0xFFEEF4EA),
    onSurfaceVariant = Color(0xFF8B9688),
    error = Danger,
    outline = Color(0x28E8F0E4),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFFC8EA4A),
    onPrimary = AccentInk,
    secondary = Color(0xFF1B8F62),
    background = Color(0xFFF2F5EE),
    surface = Color(0xFFFFFFFF),
    surfaceVariant = Color(0xFFEEF3E8),
    onBackground = Color(0xFF141C16),
    onSurface = Color(0xFF141C16),
    onSurfaceVariant = Color(0xFF5C6A5F),
    error = Color(0xFFD94B42),
    outline = Color(0x1418241A),
)

@Composable
fun StockeaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) DarkColors else LightColors
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val activity = view.context.findActivity() ?: return@SideEffect
            val window = activity.window
            window.statusBarColor = Color.Transparent.toArgb()
            window.navigationBarColor = Color.Transparent.toArgb()
            val insets = WindowCompat.getInsetsController(window, view)
            insets.isAppearanceLightStatusBars = !darkTheme
            insets.isAppearanceLightNavigationBars = !darkTheme
        }
    }
    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
