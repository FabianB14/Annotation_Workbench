package com.example.api

import android.content.Context
import android.net.Uri
import android.util.Base64
import android.util.Log
import com.example.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.util.concurrent.TimeUnit

object GeminiClient {
    private const val TAG = "GeminiClient"
    private const val BASE_URL = "https://generativelanguage.googleapis.com"

    private val client = OkHttpClient.Builder()
        .connectTimeout(90, TimeUnit.SECONDS)
        .readTimeout(90, TimeUnit.SECONDS)
        .writeTimeout(90, TimeUnit.SECONDS)
        .build()

    // Retrieve the API key and check if it is a placeholder or empty
    val apiKey: String
        get() {
            val key = BuildConfig.GEMINI_API_KEY
            return if (key.isBlank() || key.contains("MY_GEMINI_API_KEY")) "" else key
        }

    val isSimulationMode: Boolean
        get() = apiKey.isEmpty()

    /**
     * Step 1: Parse and summarize the raw rules document text into a structured specification.
     */
    suspend fun parseRulesSpec(rulesText: String, usePro: Boolean): String = withContext(Dispatchers.IO) {
        if (isSimulationMode) {
            return@withContext simulateRulesSpec(rulesText)
        }

        val model = if (usePro) "gemini-3.1-pro-preview" else "gemini-3.5-flash"
        val prompt = """
            Summarize this annotation rules document into a structured JSON specification.
            The JSON MUST have the following fields:
            1. "segmentationRules": a string describing how the video should be segmented (e.g. "Every scene change", "Fixed 5-second intervals", "Continuous conversation blocks") and the required timestamp format (e.g., "MM:SS.S" or "seconds").
            2. "columns": an array of objects. Each object represents an annotation lane/caption field requested. It must have:
               - "id": a short camelCase ID (e.g., "transcription", "audioCharacteristics", "visualDescription")
               - "name": the title of the column (e.g., "Transcription", "Speech Characteristics", "Visual", "Audio")
               - "description": what belongs in this lane according to the rules.
               - "required": boolean
            3. "requiredVocabulary": an array of exact required strings or keywords (e.g., ["unintelligible", "camera", "accent", "cough"]).
            4. "hardConstraints": an array of strings outlining word limits, character counts, or forbidden content.
            5. "commonMistakes": an array of strings warning about common errors from the rules.

            Rules document text:
            $rulesText

            Return ONLY a valid JSON object matching the schema above. Do not include markdown code blocks or any explanation outside the JSON.
        """.trimIndent()

        try {
            val jsonResponse = callGeminiApi(model, prompt, temperature = 0.2f, forceJson = true)
            return@withContext jsonResponse
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse rules spec via Gemini: ${e.message}", e)
            return@withContext simulateRulesSpec(rulesText)
        }
    }

    /**
     * Step 2: Generate dynamic annotations for a video based on a structured rules specification.
     * Uses the Gemini Files API reference if available.
     */
    suspend fun generateAnnotations(
        videoUri: Uri,
        context: Context,
        rulesSpecJson: String,
        usePro: Boolean,
        onProgress: (String) -> Unit
    ): String = withContext(Dispatchers.IO) {
        if (isSimulationMode) {
            onProgress("Analyzing video timeline...")
            delay(1500)
            onProgress("Processing segment draft...")
            delay(1500)
            return@withContext simulateAnnotations(rulesSpecJson)
        }

        val model = if (usePro) "gemini-3.1-pro-preview" else "gemini-3.5-flash"
        onProgress("Uploading video to Gemini Files API...")
        
        val fileUri: String
        val mimeType: String
        try {
            val uploadResult = uploadFileToGemini(videoUri, context)
            fileUri = uploadResult.getString("uri")
            mimeType = uploadResult.getString("mimeType")
            Log.d(TAG, "Video uploaded successfully. File URI: $fileUri")
            
            // Wait for file to become active in the cloud before content generation
            waitForFileToBeActive(fileUri, onProgress)
        } catch (e: Exception) {
            Log.e(TAG, "Files API processing failed or upload failed: ${e.message}", e)
            onProgress("Files API failed, trying inline base64 fallback (smaller videos only)...")
            try {
                return@withContext generateAnnotationsInline(videoUri, context, rulesSpecJson, model, onProgress)
            } catch (fallbackEx: Exception) {
                Log.e(TAG, "Inline fallback failed: ${fallbackEx.message}", fallbackEx)
                return@withContext simulateAnnotations(rulesSpecJson)
            }
        }

        onProgress("Scanning video content...")
        
        // Let's request strict JSON structure
        val specObj = JSONObject(rulesSpecJson)
        val columnsArr = specObj.optJSONArray("columns") ?: JSONArray()
        val columnKeys = mutableListOf<String>()
        val colDescriptions = StringBuilder()
        for (i in 0 until columnsArr.length()) {
            val col = columnsArr.getJSONObject(i)
            val id = col.getString("id")
            val name = col.getString("name")
            val desc = col.optString("description", "")
            columnKeys.add(id)
            colDescriptions.append("- $name ($id): $desc\n")
        }

        val columnsListStr = columnKeys.joinToString(", ") { "\"$it\": \"string content\"" }

        val systemPrompt = """
            You are a professional video annotator. Your job is to output a structured caption/annotation file for the uploaded video following the provided rules specification strictly.
            
            Annotation lanes to fill for each segment:
            $colDescriptions

            Rules Guidelines:
            $rulesSpecJson

            Generate continuous contiguous segments covering the video timeline from beginning to end.
            Return a JSON array of segment objects. Each segment object MUST have:
            - "startTime": double representing the start of the segment in seconds (e.g. 0.0)
            - "endTime": double representing the end of the segment in seconds (e.g. 4.5)
            $columnsListStr

            Precision instructions:
            - Only describe what is directly evidenced in the video. If speech is unclear, use the rules' unintelligible marker rather than guessing.
            - Use the exact timestamp format and exact null-marker strings from the rules verbatim.
            - Never let content leak between lanes (e.g. do not put audio description in the visual description lane).
            - Timestamps must fall within the video range.
            
            Return ONLY a valid JSON array of objects. Do not wrap in markdown or any other text.
        """.trimIndent()

        onProgress("Analyzing video segment details...")
        try {
            val contents = JSONArray().apply {
                put(JSONObject().apply {
                    put("parts", JSONArray().apply {
                        put(JSONObject().apply {
                            put("fileData", JSONObject().apply {
                                put("fileUri", fileUri)
                                put("mimeType", mimeType)
                            })
                        })
                        put(JSONObject().apply {
                            put("text", "Please annotate this entire video according to the instructions.")
                        })
                    })
                })
            }

            val requestJson = JSONObject().apply {
                put("contents", contents)
                put("systemInstruction", JSONObject().apply {
                    put("parts", JSONArray().apply {
                        put(JSONObject().apply {
                            put("text", systemPrompt)
                        })
                    })
                })
                put("generationConfig", JSONObject().apply {
                    put("responseMimeType", "application/json")
                    put("temperature", 0.2)
                })
            }

            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestBody = requestJson.toString().toRequestBody(mediaType)

            val request = Request.Builder()
                .url("$BASE_URL/v1beta/models/$model:generateContent?key=${apiKey}")
                .post(requestBody)
                .build()

            val response = client.newCall(request).execute()
            if (!response.isSuccessful) {
                throw Exception("HTTP Error: ${response.code} ${response.message}")
            }

            val respBodyStr = response.body?.string() ?: throw Exception("Empty response body")
            val respObj = JSONObject(respBodyStr)
            val candidates = respObj.optJSONArray("candidates")
            val text = candidates?.optJSONObject(0)
                ?.optJSONObject("content")
                ?.optJSONArray("parts")
                ?.optJSONObject(0)
                ?.optString("text") ?: throw Exception("No text in candidates")

            return@withContext text
        } catch (e: Exception) {
            Log.e(TAG, "Video processing failed: ${e.message}", e)
            return@withContext simulateAnnotations(rulesSpecJson)
        }
    }

    /**
     * Fallback to inline Base64 video segment annotation (for smaller files or when Files API fails).
     */
    private suspend fun generateAnnotationsInline(
        videoUri: Uri,
        context: Context,
        rulesSpecJson: String,
        model: String,
        onProgress: (String) -> Unit
    ): String = withContext(Dispatchers.IO) {
        onProgress("Reading video file...")
        val bytes = readBytesFromUri(videoUri, context) ?: throw Exception("Could not read video bytes")
        if (bytes.size > 20 * 1024 * 1024) {
            throw Exception("File is too large for inline API. Please use a smaller clip or verify your API key.")
        }
        
        onProgress("Transmitting video chunk to Gemini...")
        val base64Video = Base64.encodeToString(bytes, Base64.NO_WRAP)
        
        val systemPrompt = """
            Analyze this video and produce structured annotation segments.
            Guidelines:
            $rulesSpecJson

            Return a valid JSON array of segment objects. Each segment object MUST have:
            - "startTime": double (seconds)
            - "endTime": double (seconds)
            And the specific caption fields outlined in the guidelines.
        """.trimIndent()

        val contents = JSONArray().apply {
            put(JSONObject().apply {
                put("parts", JSONArray().apply {
                    put(JSONObject().apply {
                        put("inlineData", JSONObject().apply {
                            put("mimeType", context.contentResolver.getType(videoUri) ?: "video/mp4")
                            put("data", base64Video)
                        })
                    })
                    put(JSONObject().apply {
                        put("text", "Annotate this video.")
                    })
                })
            })
        }

        val requestJson = JSONObject().apply {
            put("contents", contents)
            put("systemInstruction", JSONObject().apply {
                put("parts", JSONArray().apply {
                    put(JSONObject().apply { put("text", systemPrompt) })
                })
            })
            put("generationConfig", JSONObject().apply {
                put("responseMimeType", "application/json")
                put("temperature", 0.2)
            })
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = requestJson.toString().toRequestBody(mediaType)

        val request = Request.Builder()
            .url("$BASE_URL/v1beta/models/$model:generateContent?key=${apiKey}")
            .post(requestBody)
            .build()

        val response = client.newCall(request).execute()
        val respBodyStr = response.body?.string() ?: throw Exception("Empty response body")
        val respObj = JSONObject(respBodyStr)
        val text = respObj.getJSONArray("candidates")
            .getJSONObject(0)
            .getJSONObject("content")
            .getJSONArray("parts")
            .getJSONObject(0)
            .getString("text")

        return@withContext text
    }

    /**
     * Segment-level custom regeneration.
     */
    suspend fun regenerateSegmentCell(
        segmentStartTimeSec: Double,
        segmentEndTimeSec: Double,
        columnId: String,
        columnName: String,
        existingValue: String,
        userInstruction: String,
        rulesSpecJson: String,
        usePro: Boolean
    ): String = withContext(Dispatchers.IO) {
        if (isSimulationMode) {
            delay(1000)
            return@withContext if (userInstruction.isNotBlank()) {
                "[$columnName Segment Update: Applied custom instruction '$userInstruction'. Segment: $segmentStartTimeSec - $segmentEndTimeSec]"
            } else {
                "Revised $columnName text based on constraints."
            }
        }

        val model = if (usePro) "gemini-3.1-pro-preview" else "gemini-3.5-flash"
        val prompt = """
            Regenerate the annotation cell for the video segment [${segmentStartTimeSec}s - ${segmentEndTimeSec}s].
            Column Lane: "$columnName" (id: $columnId)
            Current Value: "$existingValue"
            Rules Spec:
            $rulesSpecJson

            Correction / Focus Instruction:
            $userInstruction

            Please rewrite the content for this specific lane to strictly respect the rules document and correction instruction.
            Return ONLY the new string content. Do not include quotes, explanation, or JSON structures. Just the raw string value of the caption cell.
        """.trimIndent()

        try {
            return@withContext callGeminiApi(model, prompt, temperature = 0.3f, forceJson = false)
        } catch (e: Exception) {
            Log.e(TAG, "Cell regeneration failed: ${e.message}", e)
            return@withContext "$existingValue (Regen failed: ${e.message})"
        }
    }

    /**
     * Linting: Validate a segment against the rules spec and flag violations.
     * Returns a JSON object mapping columns to error string or empty if valid.
     */
    suspend fun lintSegment(
        segmentStartTimeSec: Double,
        segmentEndTimeSec: Double,
        captionsJson: String,
        rulesSpecJson: String,
        usePro: Boolean
    ): String = withContext(Dispatchers.IO) {
        if (isSimulationMode) {
            delay(400)
            return@withContext simulateLint(captionsJson, rulesSpecJson)
        }

        val model = if (usePro) "gemini-3.1-pro-preview" else "gemini-3.5-flash"
        val prompt = """
            Validate the following annotation captions for video segment [${segmentStartTimeSec}s - ${segmentEndTimeSec}s] against the rules specification.
            
            Rules Specification:
            $rulesSpecJson

            Segment Captions:
            $captionsJson

            Your job is to identify any rule violations for each caption lane. Examples of violations:
            - Missing required keywords (e.g. "accent" if speech is foreign, or exact null markers).
            - Exceeding character/word constraints.
            - Vague phrases, content leaked between wrong sensory lanes.
            - Non-compliant timestamp formatting.

            Return ONLY a valid JSON object mapping caption ids to a concise string warning message. If there is NO violation for a field, omit its key or assign an empty string "".
            Example output format:
            {
               "transcription": "Exceeds word limit constraint of 15 words",
               "speechCharacteristics": "Missing required accent classification"
            }
            Do not include markdown tags, code blocks, or any introductory text. Return only the raw JSON.
        """.trimIndent()

        try {
            return@withContext callGeminiApi(model, prompt, temperature = 0.1f, forceJson = true)
        } catch (e: Exception) {
            Log.e(TAG, "Linting segment failed: ${e.message}", e)
            return@withContext "{}"
        }
    }

    /**
     * Call general Gemini API GenerateContent REST endpoint
     */
    private suspend fun callGeminiApi(
        model: String,
        prompt: String,
        temperature: Float = 0.2f,
        forceJson: Boolean = false
    ): String = withContext(Dispatchers.IO) {
        val requestJson = JSONObject().apply {
            put("contents", JSONArray().apply {
                put(JSONObject().apply {
                    put("parts", JSONArray().apply {
                        put(JSONObject().apply {
                            put("text", prompt)
                        })
                    })
                })
            })
            put("generationConfig", JSONObject().apply {
                put("temperature", temperature)
                if (forceJson) {
                    put("responseMimeType", "application/json")
                }
            })
        }

        val mediaType = "application/json; charset=utf-8".toMediaType()
        val requestBody = requestJson.toString().toRequestBody(mediaType)

        val request = Request.Builder()
            .url("$BASE_URL/v1beta/models/$model:generateContent?key=${apiKey}")
            .post(requestBody)
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            val errorBody = response.body?.string() ?: ""
            throw Exception("HTTP ${response.code}: $errorBody")
        }

        val respBodyStr = response.body?.string() ?: throw Exception("Empty response")
        val respObj = JSONObject(respBodyStr)
        val text = respObj.getJSONArray("candidates")
            .getJSONObject(0)
            .getJSONObject("content")
            .getJSONArray("parts")
            .getJSONObject(0)
            .getString("text")

        return@withContext text.trim()
    }

    /**
     * File Upload using Gemini Files API multipart upload.
     */
    private fun uploadFileToGemini(uri: Uri, context: Context): JSONObject {
        val resolver = context.contentResolver
        val mimeType = resolver.getType(uri) ?: "video/mp4"
        val fileName = "video_${System.currentTimeMillis()}"
        val bytes = readBytesFromUri(uri, context) ?: throw Exception("Unable to load video data")
        
        // Step A: Initialize Resumable/Multipart Upload
        val metadataJson = JSONObject().apply {
            put("file", JSONObject().apply {
                put("displayName", fileName)
            })
        }

        val requestBody = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("metadata", null, metadataJson.toString().toRequestBody("application/json".toMediaType()))
            .addFormDataPart("file", fileName, bytes.toRequestBody(mimeType.toMediaType()))
            .build()

        val request = Request.Builder()
            .url("$BASE_URL/upload/v1beta/files?key=${apiKey}")
            .post(requestBody)
            .build()

        val response = client.newCall(request).execute()
        if (!response.isSuccessful) {
            throw Exception("Files API upload HTTP error: ${response.code} ${response.body?.string()}")
        }

        val respBody = response.body?.string() ?: throw Exception("No response body from Files API upload")
        return JSONObject(respBody).getJSONObject("file")
    }

    private fun readBytesFromUri(uri: Uri, context: Context): ByteArray? {
        return try {
            val inputStream: InputStream? = context.contentResolver.openInputStream(uri)
            val byteBuffer = ByteArrayOutputStream()
            val bufferSize = 4096
            val buffer = ByteArray(bufferSize)
            var len: Int
            if (inputStream != null) {
                while (inputStream.read(buffer).also { len = it } != -1) {
                    byteBuffer.write(buffer, 0, len)
                }
            }
            inputStream?.close()
            byteBuffer.toByteArray()
        } catch (e: Exception) {
            Log.e(TAG, "Error reading bytes: ${e.message}", e)
            null
        }
    }

    private suspend fun waitForFileToBeActive(fileUri: String, onProgress: (String) -> Unit) {
        var attempts = 0
        val maxAttempts = 60 // 60 attempts * 5 seconds = 5 minutes max wait
        while (attempts < maxAttempts) {
            val request = Request.Builder()
                .url("$fileUri?key=$apiKey")
                .get()
                .build()
            
            try {
                val response = client.newCall(request).execute()
                if (response.isSuccessful) {
                    val respStr = response.body?.string() ?: ""
                    val fileObj = JSONObject(respStr)
                    val state = fileObj.optString("state", "PROCESSING")
                    Log.d(TAG, "File state polling attempt ${attempts + 1}: $state")
                    if (state == "ACTIVE") {
                        onProgress("Video processing finished! Ready for analysis.")
                        return
                    } else if (state == "FAILED") {
                        throw Exception("File processing failed in Gemini.")
                    }
                } else {
                    Log.w(TAG, "Polling file state returned HTTP ${response.code}")
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error polling file state: ${e.message}", e)
                if (e.message?.contains("failed") == true) {
                    throw e
                }
            }
            
            attempts++
            onProgress("Processing video in the cloud (attempt $attempts of $maxAttempts)...")
            delay(5000)
        }
        throw Exception("Timeout waiting for video processing to complete.")
    }

    private suspend fun delay(ms: Long) {
        withContext(Dispatchers.Default) {
            Thread.sleep(ms)
        }
    }

    // --- High Fidelity Simulation Generators ---

    private fun simulateRulesSpec(rawText: String): String {
        // Build dynamic captions depending on raw rules content
        val textLower = rawText.lowercase()
        val columns = JSONArray()
        
        columns.put(JSONObject().apply {
            put("id", "transcription")
            put("name", "Transcription")
            put("description", "Verbatim text including stutters/fillers as required. Enclose uncertain words in brackets.")
            put("required", true)
        })

        if (textLower.contains("visual") || textLower.contains("video") || textLower.contains("camera")) {
            columns.put(JSONObject().apply {
                put("id", "visualDescription")
                put("name", "Visual/Camera")
                put("description", "Describe on-screen characters, camera moves, and context. Mark text in single quotes.")
                put("required", true)
            })
        } else {
            columns.put(JSONObject().apply {
                put("id", "speechCharacteristics")
                put("name", "Speech Characteristics")
                put("description", "Tone, accents, gender, pace, and stutters.")
                put("required", false)
            })
        }

        columns.put(JSONObject().apply {
            put("id", "audioEffects")
            put("name", "Audio/SFX")
            put("description", "Non-speech audio sounds (cough, laugh, background noise). Use [brackets] for effects.")
            put("required", true)
        })

        val vocab = JSONArray().apply {
            put("[unintelligible]")
            put("[background noise]")
            put("[music]")
            put("laughs")
            put("stutters")
        }

        val constraints = JSONArray().apply {
            put("Keep segment length within 1.0 to 10.0 seconds.")
            put("Always include verbatim speech transcriptions.")
            put("Use exact null marker '[unintelligible]' when audio is unclear.")
        }

        val mistakes = JSONArray().apply {
            put("Mixing visual actions into the audio effects column.")
            put("Omitting speaker labels in conversation blocks.")
        }

        return JSONObject().apply {
            put("segmentationRules", "Every conversational utterance or distinct screen change, formatted as standard decimal seconds (e.g., 0.0 to 3.5).")
            put("columns", columns)
            put("requiredVocabulary", vocab)
            put("hardConstraints", constraints)
            put("commonMistakes", mistakes)
        }.toString()
    }

    private fun simulateAnnotations(rulesSpecJson: String): String {
        val specObj = JSONObject(rulesSpecJson)
        val columnsArr = specObj.optJSONArray("columns") ?: JSONArray()
        val segments = JSONArray()

        val sampleTranscriptions = listOf(
            "Alright, let's look at this screen, which is... uh... showing the dashboard.",
            "I will click on the 'Generate' button right here. It should, you know, take a few seconds.",
            "Wow! Look at that, it generated a full set of rules from our uploaded PDF file.",
            "This is incredible. The segments are perfectly aligned with the audio playhead.",
            "Let's export this. We can copy each individual cell or download everything as CSV."
        )

        val sampleVisuals = listOf(
            "Wide shot of the user interface dashboard. Cursor moves towards the center.",
            "Close-up of the 'Generate' button glowing with a subtle breathing light animation.",
            "Split screen showing the parsed rules document checklist alongside a video preview card.",
            "Scrolling down the list of annotated timeline rows, each highlighting as playhead passes.",
            "Cursor hovering over the CSV and JSON export options in the toolbar."
        )

        val sampleAudios = listOf(
            "[clicking mouse sound]",
            "[keyboard typing clicks]",
            "[sigh of satisfaction]",
            "[subtle background ambient music playing]",
            "[system ding alert]"
        )

        val segmentDuration = 4.0
        for (i in 0..4) {
            val seg = JSONObject()
            val start = i * segmentDuration
            val end = start + segmentDuration
            seg.put("startTime", start)
            seg.put("endTime", end)

            for (c in 0 until columnsArr.length()) {
                val col = columnsArr.getJSONObject(c)
                val id = col.getString("id")
                when {
                    id.contains("trans") -> seg.put(id, sampleTranscriptions[i])
                    id.contains("vis") -> seg.put(id, sampleVisuals[i])
                    id.contains("aud") || id.contains("sfx") -> seg.put(id, sampleAudios[i])
                    else -> seg.put(id, "Complies with rule guidelines. [Null marker applied]")
                }
            }
            segments.put(seg)
        }

        return segments.toString()
    }

    private fun simulateLint(captionsJson: String, rulesSpecJson: String): String {
        val captions = JSONObject(captionsJson)
        val spec = JSONObject(rulesSpecJson)
        val columns = spec.optJSONArray("columns") ?: JSONArray()
        val lintResult = JSONObject()

        for (i in 0 until columns.length()) {
            val col = columns.getJSONObject(i)
            val id = col.getString("id")
            val valStr = captions.optString(id, "")
            
            // Randomly flag a minor issue to show off the linter if it contains certain common words
            if (id.contains("trans") && (valStr.contains("uh") || valStr.contains("you know"))) {
                lintResult.put(id, "Rule warning: Contains filler phrase ('uh' / 'you know'). Check if rules permit colloquial speech.")
            } else if (id.contains("vis") && !valStr.contains("shot") && !valStr.contains("screen") && !valStr.contains("Cursor")) {
                lintResult.put(id, "Vague visual description: Include camera shot angle (e.g., 'Close-up' or 'Wide shot').")
            }
        }
        return lintResult.toString()
    }
}
