package com.example.ui.components

import android.net.Uri
import android.widget.VideoView
import android.media.MediaPlayer
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView

@Composable
fun VideoPlayerView(
    videoUriStr: String,
    isPlaying: Boolean,
    playbackSpeed: Float,
    seekToMs: Long?,
    onPositionChanged: (Long) -> Unit,
    onVideoPrepared: (Long) -> Unit,
    onSeekProcessed: () -> Unit,
    modifier: Modifier = Modifier
) {
    var videoViewRef by remember { mutableStateOf<VideoView?>(null) }
    var mediaPlayerRef by remember { mutableStateOf<MediaPlayer?>(null) }

    // Sync Play/Pause
    LaunchedEffect(isPlaying) {
        val view = videoViewRef ?: return@LaunchedEffect
        if (isPlaying) {
            view.start()
        } else {
            view.pause()
        }
    }

    // Sync Playback Speed
    LaunchedEffect(playbackSpeed, mediaPlayerRef) {
        val mp = mediaPlayerRef ?: return@LaunchedEffect
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                mp.playbackParams = mp.playbackParams.setSpeed(playbackSpeed)
            }
        } catch (e: Exception) {
            // Soft fallback if device profile doesn't support pitch-adjusted variable speed
        }
    }

    // Sync Seek/Scrub
    LaunchedEffect(seekToMs) {
        val ms = seekToMs ?: return@LaunchedEffect
        val view = videoViewRef ?: return@LaunchedEffect
        view.seekTo(ms.toInt())
        onSeekProcessed()
    }

    // Active position polling (100ms interval while playing)
    LaunchedEffect(isPlaying) {
        if (isPlaying) {
            while (true) {
                val view = videoViewRef
                if (view != null && view.isPlaying) {
                    onPositionChanged(view.currentPosition.toLong())
                }
                kotlinx.coroutines.delay(100)
            }
        }
    }

    AndroidView(
        factory = { context ->
            VideoView(context).apply {
                setOnPreparedListener { mp ->
                    mediaPlayerRef = mp
                    onVideoPrepared(mp.duration.toLong())
                    if (isPlaying) {
                        start()
                    } else {
                        pause()
                    }
                    try {
                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
                            mp.playbackParams = mp.playbackParams.setSpeed(playbackSpeed)
                        }
                    } catch (e: Exception) {}
                }
                setOnCompletionListener {
                    // Reset or trigger completion handler if needed
                }
                setVideoURI(Uri.parse(videoUriStr))
                videoViewRef = this
            }
        },
        update = { view ->
            // If the video source changes, reinitialize the video
            val currentUri = Uri.parse(videoUriStr)
            // Simply let it load
        },
        modifier = modifier
    )
}
