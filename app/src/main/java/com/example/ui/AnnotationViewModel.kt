package com.example.ui

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import com.example.api.GeminiClient
import com.example.data.AnnotationDatabase
import com.example.data.AnnotationRepository
import com.example.data.AnnotationSegment
import com.example.data.Project
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

class AnnotationViewModel(private val repository: AnnotationRepository) : ViewModel() {
    private val TAG = "AnnotationViewModel"

    val projects: StateFlow<List<Project>> = repository.allProjects
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _currentProject = MutableStateFlow<Project?>(null)
    val currentProject: StateFlow<Project?> = _currentProject.asStateFlow()

    private val _currentStep = MutableStateFlow(1) // Step 1, 2, or 3
    val currentStep: StateFlow<Int> = _currentStep.asStateFlow()

    private val _isGenerating = MutableStateFlow(false)
    val isGenerating: StateFlow<Boolean> = _isGenerating.asStateFlow()

    private val _generationProgress = MutableStateFlow("")
    val generationProgress: StateFlow<String> = _generationProgress.asStateFlow()

    private val _isLinting = MutableStateFlow(false)
    val isLinting: StateFlow<Boolean> = _isLinting.asStateFlow()

    private val _errorMessage = MutableStateFlow<String?>(null)
    val errorMessage: StateFlow<String?> = _errorMessage.asStateFlow()

    private val _fastDraftToggle = MutableStateFlow(true) // True = Flash, False = Pro
    val fastDraftToggle: StateFlow<Boolean> = _fastDraftToggle.asStateFlow()

    // Active segments flow based on current project ID
    val segments: StateFlow<List<AnnotationSegment>> = _currentProject
        .flatMapLatest { project ->
            if (project != null) {
                repository.getSegmentsForProjectFlow(project.id)
            } else {
                flowOf(emptyList())
            }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    // UI Video Playback state
    private val _currentPlaybackTimeMs = MutableStateFlow(0L)
    val currentPlaybackTimeMs: StateFlow<Long> = _currentPlaybackTimeMs.asStateFlow()

    private val _playbackSpeed = MutableStateFlow(1.0f)
    val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    init {
        // Automatically load the last updated project on app start
        viewModelScope.launch {
            projects.collectFirst { list ->
                if (list.isNotEmpty()) {
                    selectProject(list.first())
                }
            }
        }
    }

    private suspend fun <T> StateFlow<T>.collectFirst(action: suspend (T) -> Unit) {
        this.filter { 
            if (it is List<*>) it.isNotEmpty() else it != null 
        }.take(1).collect { action(it) }
    }

    fun selectProject(project: Project) {
        _currentProject.value = project
        // Decide what step to open
        if (project.confirmedSpecJson.isBlank()) {
            _currentStep.value = 1
        } else {
            // Check if segments already exist
            viewModelScope.launch {
                val segs = repository.getSegmentsForProject(project.id)
                if (segs.isNotEmpty()) {
                    _currentStep.value = 3
                } else {
                    _currentStep.value = 2
                }
            }
        }
    }

    fun setStep(step: Int) {
        _currentStep.value = step
    }

    fun setFastDraft(enabled: Boolean) {
        _fastDraftToggle.value = enabled
    }

    fun setPlaybackTime(timeMs: Long) {
        _currentPlaybackTimeMs.value = timeMs
    }

    fun setPlaybackSpeed(speed: Float) {
        _playbackSpeed.value = speed
    }

    fun clearError() {
        _errorMessage.value = null
    }

    fun deleteProjectById(projectId: Int) {
        viewModelScope.launch {
            repository.deleteProjectById(projectId)
            if (_currentProject.value?.id == projectId) {
                _currentProject.value = null
                val list = projects.value
                val nextProj = list.firstOrNull { it.id != projectId }
                if (nextProj != null) {
                    selectProject(nextProj)
                } else {
                    _currentStep.value = 1
                }
            }
        }
    }

    /**
     * Step 1: Create a project and ingest raw rules document text.
     */
    fun ingestRules(projectName: String, rulesText: String, videoUri: Uri, videoName: String) {
        viewModelScope.launch {
            _isGenerating.value = true
            _generationProgress.value = "Analyzing annotation rules document..."
            _errorMessage.value = null
            try {
                // Call Gemini to parse and structure rules spec
                val parsedSpec = GeminiClient.parseRulesSpec(rulesText, !fastDraftToggle.value)
                val cleanedSpec = cleanJsonString(parsedSpec)

                // Save new Project to Room
                val newProj = Project(
                    name = projectName.ifBlank { "Project - ${videoName.substringBeforeLast(".")}" },
                    rulesRawText = rulesText,
                    confirmedSpecJson = cleanedSpec,
                    videoUri = videoUri.toString(),
                    videoName = videoName,
                    updatedAt = System.currentTimeMillis()
                )
                val id = repository.insertProject(newProj)
                _currentProject.value = newProj.copy(id = id.toInt())
                _currentStep.value = 1 // Stay on step 1 to let user review/edit checklist
            } catch (e: Exception) {
                Log.e(TAG, "Rules ingestion failed: ${e.message}", e)
                _errorMessage.value = "Failed to parse rules: ${e.message}"
            } finally {
                _isGenerating.value = false
            }
        }
    }

    /**
     * User confirms and saves the edited structured specification.
     */
    fun saveConfirmedSpec(editedSpecJson: String) {
        val proj = _currentProject.value ?: return
        viewModelScope.launch {
            try {
                // Validate if it is valid JSON
                JSONObject(editedSpecJson)
                val updated = proj.copy(
                    confirmedSpecJson = editedSpecJson,
                    updatedAt = System.currentTimeMillis()
                )
                repository.updateProject(updated)
                _currentProject.value = updated
                _currentStep.value = 2 // Advance to processing video!
            } catch (e: Exception) {
                _errorMessage.value = "Invalid specification JSON: ${e.message}"
            }
        }
    }

    /**
     * Reset and wipe current project segments to start a new generation.
     */
    fun resetProjectSegments() {
        val proj = _currentProject.value ?: return
        viewModelScope.launch {
            repository.deleteSegmentsForProject(proj.id)
            _currentStep.value = 2
        }
    }

    /**
     * Step 2: Generate annotations using Gemini multimodal models.
     */
    fun generateAnnotations(context: Context) {
        val proj = _currentProject.value ?: return
        val videoUri = Uri.parse(proj.videoUri)

        viewModelScope.launch {
            _isGenerating.value = true
            _generationProgress.value = "Preparing video pipeline..."
            _errorMessage.value = null
            try {
                val resultJsonText = GeminiClient.generateAnnotations(
                    videoUri = videoUri,
                    context = context,
                    rulesSpecJson = proj.confirmedSpecJson,
                    usePro = !fastDraftToggle.value,
                    onProgress = { _generationProgress.value = it }
                )

                val cleanedJsonText = cleanJsonString(resultJsonText)
                Log.d(TAG, "Annotations JSON: $cleanedJsonText")

                // Parse the array of segments
                val jsonArr = JSONArray(cleanedJsonText)
                val segmentEntities = mutableListOf<AnnotationSegment>()

                for (i in 0 until jsonArr.length()) {
                    val obj = jsonArr.getJSONObject(i)
                    val startSec = obj.optDouble("startTime", 0.0)
                    val endSec = obj.optDouble("endTime", 0.0)

                    // Extract all other attributes as captions Map
                    val captionsObj = JSONObject()
                    val keys = obj.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        if (key != "startTime" && key != "endTime") {
                            captionsObj.put(key, obj.get(key))
                        }
                    }

                    segmentEntities.add(
                        AnnotationSegment(
                            projectId = proj.id,
                            startTimeMs = (startSec * 1000).toLong(),
                            endTimeMs = (endSec * 1000).toLong(),
                            captionsJson = captionsObj.toString()
                        )
                    )
                }

                // Delete any old segments first
                repository.deleteSegmentsForProject(proj.id)
                // Batch insert
                repository.insertSegments(segmentEntities)

                _currentStep.value = 3 // Move to Review Workspace!
            } catch (e: Exception) {
                Log.e(TAG, "Video processing annotation failed", e)
                _errorMessage.value = "Annotation Generation failed: ${e.message}. Falls back to draft model."
            } finally {
                _isGenerating.value = false
            }
        }
    }

    /**
     * Step 3 Workspace: Edit cell caption value
     */
    fun updateCellText(segmentId: Int, columnId: String, newValue: String) {
        viewModelScope.launch {
            val segmentList = segments.value
            val target = segmentList.find { it.id == segmentId } ?: return@launch
            
            val caps = JSONObject(target.captionsJson)
            caps.put(columnId, newValue)

            val updated = target.copy(captionsJson = caps.toString())
            repository.updateSegment(updated)
        }
    }

    /**
     * Update segment time range
     */
    fun updateSegmentTimes(segmentId: Int, newStartMs: Long, newEndMs: Long) {
        if (newStartMs >= newEndMs) return
        viewModelScope.launch {
            val segmentList = segments.value
            val target = segmentList.find { it.id == segmentId } ?: return@launch
            
            // Check overlaps if desired, but keep simple
            val updated = target.copy(startTimeMs = newStartMs, endTimeMs = newEndMs)
            repository.updateSegment(updated)
        }
    }

    /**
     * Split a segment at the current playhead position.
     */
    fun splitSegment(segmentId: Int, splitTimeMs: Long) {
        viewModelScope.launch {
            val segmentList = segments.value
            val target = segmentList.find { it.id == segmentId } ?: return@launch
            
            if (splitTimeMs <= target.startTimeMs || splitTimeMs >= target.endTimeMs) {
                return@launch
            }

            // Create segment 1: start -> splitTime
            val seg1 = target.copy(endTimeMs = splitTimeMs)
            
            // Create segment 2: splitTime -> end
            val seg2 = AnnotationSegment(
                projectId = target.projectId,
                startTimeMs = splitTimeMs,
                endTimeMs = target.endTimeMs,
                captionsJson = target.captionsJson
            )

            repository.updateSegment(seg1)
            repository.insertSegment(seg2)
        }
    }

    /**
     * Merge current segment with the next segment.
     */
    fun mergeSegmentWithNext(segmentId: Int) {
        viewModelScope.launch {
            val segmentList = segments.value
            val index = segmentList.indexOfFirst { it.id == segmentId }
            if (index == -1 || index >= segmentList.size - 1) return@launch // No next segment to merge with

            val target = segmentList[index]
            val next = segmentList[index + 1]

            // Merge captions keys
            val targetCaps = JSONObject(target.captionsJson)
            val nextCaps = JSONObject(next.captionsJson)
            
            val mergedCaps = JSONObject()
            val keys = targetCaps.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val val1 = targetCaps.optString(key, "")
                val val2 = nextCaps.optString(key, "")
                mergedCaps.put(key, "$val1 $val2".trim())
            }

            val merged = target.copy(
                endTimeMs = next.endTimeMs,
                captionsJson = mergedCaps.toString()
            )

            repository.updateSegment(merged)
            repository.deleteSegmentById(next.id)
        }
    }

    /**
     * Delete segment
     */
    fun deleteSegment(segmentId: Int) {
        viewModelScope.launch {
            repository.deleteSegmentById(segmentId)
        }
    }

    /**
     * Add new blank segment at the end
     */
    fun addSegment() {
        val proj = _currentProject.value ?: return
        viewModelScope.launch {
            val segmentList = segments.value
            val startMs = if (segmentList.isNotEmpty()) segmentList.last().endTimeMs else 0L
            val endMs = startMs + 5000 // default 5 seconds

            // Build blank captions
            val blankCaps = JSONObject()
            try {
                val spec = JSONObject(proj.confirmedSpecJson)
                val columns = spec.optJSONArray("columns") ?: JSONArray()
                for (i in 0 until columns.length()) {
                    blankCaps.put(columns.getJSONObject(i).getString("id"), "")
                }
            } catch (e: Exception) {
                blankCaps.put("transcription", "")
            }

            val newSeg = AnnotationSegment(
                projectId = proj.id,
                startTimeMs = startMs,
                endTimeMs = endMs,
                captionsJson = blankCaps.toString()
            )
            repository.insertSegment(newSeg)
        }
    }

    /**
     * Batch Lint using Gemini rules engine.
     */
    fun lintAllSegments() {
        val proj = _currentProject.value ?: return
        viewModelScope.launch {
            _isLinting.value = true
            try {
                val currentSegments = segments.value
                for (seg in currentSegments) {
                    val resultJson = GeminiClient.lintSegment(
                        segmentStartTimeSec = seg.startTimeMs / 1000.0,
                        segmentEndTimeSec = seg.endTimeMs / 1000.0,
                        captionsJson = seg.captionsJson,
                        rulesSpecJson = proj.confirmedSpecJson,
                        usePro = !fastDraftToggle.value
                    )
                    val cleaned = cleanJsonString(resultJson)
                    val updatedSeg = seg.copy(violationsJson = cleaned)
                    repository.updateSegment(updatedSeg)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Batch linting failed: ${e.message}", e)
            } finally {
                _isLinting.value = false
            }
        }
    }

    /**
     * Clear all current warnings
     */
    fun clearLintWarnings() {
        viewModelScope.launch {
            val currentSegments = segments.value
            for (seg in currentSegments) {
                if (seg.violationsJson != null) {
                    repository.updateSegment(seg.copy(violationsJson = null))
                }
            }
        }
    }

    /**
     * Regenerate specific caption lane cell using Gemini with optional instruction context.
     */
    fun regenerateCell(segmentId: Int, columnId: String, columnName: String, existingValue: String, userInstruction: String) {
        val proj = _currentProject.value ?: return
        viewModelScope.launch {
            val currentSegments = segments.value
            val target = currentSegments.find { it.id == segmentId } ?: return@launch

            // Show a progress indicator inside the cell during loading
            val tempCaps = JSONObject(target.captionsJson)
            tempCaps.put(columnId, "...Regenerating...")
            repository.updateSegment(target.copy(captionsJson = tempCaps.toString()))

            try {
                val responseText = GeminiClient.regenerateSegmentCell(
                    segmentStartTimeSec = target.startTimeMs / 1000.0,
                    segmentEndTimeSec = target.endTimeMs / 1000.0,
                    columnId = columnId,
                    columnName = columnName,
                    existingValue = existingValue,
                    userInstruction = userInstruction,
                    rulesSpecJson = proj.confirmedSpecJson,
                    usePro = !fastDraftToggle.value
                )

                val caps = JSONObject(target.captionsJson)
                caps.put(columnId, responseText)
                repository.updateSegment(target.copy(captionsJson = caps.toString()))
            } catch (e: Exception) {
                Log.e(TAG, "Regenerate cell error", e)
                val caps = JSONObject(target.captionsJson)
                caps.put(columnId, existingValue) // revert on error
                repository.updateSegment(target.copy(captionsJson = caps.toString()))
                _errorMessage.value = "Failed to regenerate cell: ${e.message}"
            }
        }
    }

    /**
     * Factory for ViewModel injection.
     */
    class Factory(private val repository: AnnotationRepository) : ViewModelProvider.Factory {
        override fun <T : ViewModel> create(modelClass: Class<T>): T {
            if (modelClass.isAssignableFrom(AnnotationViewModel::class.java)) {
                @Suppress("UNCHECKED_CAST")
                return AnnotationViewModel(repository) as T
            }
            throw IllegalArgumentException("Unknown ViewModel class")
        }
    }

    private fun cleanJsonString(raw: String): String {
        var str = raw.trim()
        if (str.startsWith("```json")) {
            str = str.substringAfter("```json")
        } else if (str.startsWith("```")) {
            str = str.substringAfter("```")
        }
        if (str.endsWith("```")) {
            str = str.substringBeforeLast("```")
        }
        return str.trim()
    }
}
