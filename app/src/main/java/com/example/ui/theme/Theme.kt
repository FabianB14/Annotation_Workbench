package com.example.ui.theme

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

private val DarkColorScheme =
  darkColorScheme(
    primary = SkyPrimary,
    secondary = SlateSecondary,
    tertiary = SkyPrimaryHover,
    background = SlateBackground,
    surface = SlateSurface,
    surfaceVariant = SlateSurfaceVariant,
    onBackground = TextMain,
    onSurface = TextMain,
    onPrimary = Color(0xFF381E72),
    onSecondary = Color(0xFFE2E2E6),
    outline = SlateBorder
  )

private val LightColorScheme = DarkColorScheme // Always use dark scheme for this pro-editing app style

@Composable
fun MyApplicationTheme(
  darkTheme: Boolean = true, // Force dark theme by default for pro-editor workspace look
  dynamicColor: Boolean = false, // Disable dynamic colors to keep precise DaVinci theme
  content: @Composable () -> Unit,
) {
  val colorScheme = DarkColorScheme

  MaterialTheme(colorScheme = colorScheme, typography = Typography, content = content)
}
