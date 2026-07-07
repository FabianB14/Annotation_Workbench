package com.example.ui

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.api.GeminiClient
import com.example.data.AnnotationSegment
import com.example.data.Project
import com.example.ui.components.VideoPlayerView
import com.example.ui.theme.*
import com.example.utils.DocumentTextExtractor
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AnnotationWorkbenchApp(viewModel: AnnotationViewModel) {
    val context = LocalContext.current
    val currentStep by viewModel.currentStep.collectAsStateWithLifecycle()
    val currentProject by viewModel.currentProject.collectAsStateWithLifecycle()
    val isGenerating by viewModel.isGenerating.collectAsStateWithLifecycle()
    val errorMessage by viewModel.errorMessage.collectAsStateWithLifecycle()
    val allProjects by viewModel.projects.collectAsStateWithLifecycle()

    var showProjectSelectorDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(32.dp)
                                .clip(RoundedCornerShape(8.dp))
                                .background(SkyPrimary),
                            contentAlignment = Alignment.Center
                        ) {
                            Icon(
                                imageVector = Icons.Default.PrecisionManufacturing,
                                contentDescription = "Workbench Logo",
                                tint = Color(0xFF381E72),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                        Column(modifier = Modifier.padding(start = 10.dp)) {
                            Text(
                                text = "Workbench",
                                style = MaterialTheme.typography.titleMedium.copy(
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    fontSize = 14.sp
                                )
                            )
                            Text(
                                text = "PROJ_DELTA_V04",
                                style = MaterialTheme.typography.bodySmall.copy(
                                    fontWeight = FontWeight.Normal,
                                    fontFamily = FontFamily.Monospace,
                                    color = TextMuted,
                                    fontSize = 10.sp,
                                    letterSpacing = 1.sp
                                )
                            )
                        }
                    }
                },
                actions = {
                    if (allProjects.isNotEmpty()) {
                        IconButton(onClick = { showProjectSelectorDialog = true }) {
                            Icon(
                                imageVector = Icons.Default.FolderOpen,
                                contentDescription = "Load Project",
                                tint = SkyPrimary
                            )
                        }
                    }
                    if (currentStep == 3 && currentProject != null) {
                        Button(
                            onClick = { viewModel.setStep(1) },
                            colors = ButtonDefaults.buttonColors(
                                containerColor = SlateSurfaceVariant,
                                contentColor = SkyPrimary
                            ),
                            shape = RoundedCornerShape(8.dp),
                            modifier = Modifier.padding(end = 8.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "New Project", modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("New Video", fontSize = 12.sp)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = SlateBackground,
                    titleContentColor = Color.White
                )
            )
        },
        containerColor = SlateBackground
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
        ) {
            // Error banner
            if (errorMessage != null) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFF450A0A)),
                    border = BorderStroke(1.dp, AccentRed)
                ) {
                    Row(
                        modifier = Modifier.padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(Icons.Default.ErrorOutline, contentDescription = "Error", tint = AccentRed)
                        Spacer(modifier = Modifier.width(8.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Execution Error", color = AccentRed, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                            Text(errorMessage!!, color = Color.White, fontSize = 12.sp)
                        }
                        IconButton(onClick = { viewModel.clearError() }) {
                            Icon(Icons.Default.Close, contentDescription = "Dismiss", tint = Color.LightGray)
                        }
                    }
                }
            }

            // Stepper
            StepIndicator(currentStep = currentStep)

            // Step contents
            Box(modifier = Modifier.weight(1f)) {
                when (currentStep) {
                    1 -> Step1RulesIngestion(viewModel)
                    2 -> Step2VideoProcessing(viewModel)
                    3 -> Step3ReviewWorkspace(viewModel)
                }
            }
        }
    }

    if (showProjectSelectorDialog) {
        ProjectSelectorDialog(
            projects = allProjects,
            activeProject = currentProject,
            onSelect = {
                viewModel.selectProject(it)
                showProjectSelectorDialog = false
            },
            onDelete = {
                viewModel.deleteProjectById(it.id)
            },
            onDismiss = { showProjectSelectorDialog = false }
        )
    }
}

@Composable
fun StepIndicator(currentStep: Int) {
    val steps = listOf("Rules Spec", "Ingest Video", "Review Studio")
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SlateSurface)
            .padding(vertical = 12.dp, horizontal = 16.dp)
            .border(1.dp, SlateBorder, RoundedCornerShape(8.dp))
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceAround,
        verticalAlignment = Alignment.CenterVertically
    ) {
        steps.forEachIndexed { index, title ->
            val stepNum = index + 1
            val isActive = currentStep == stepNum
            val isCompleted = currentStep > stepNum

            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(24.dp)
                        .clip(RoundedCornerShape(12.dp))
                        .background(
                            when {
                                isActive -> SkyPrimary
                                isCompleted -> AccentGreen
                                else -> SlateSurfaceVariant
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    if (isCompleted) {
                        Icon(
                            imageVector = Icons.Default.Check,
                            contentDescription = "Completed",
                            tint = Color(0xFF0B0C0E),
                            modifier = Modifier.size(14.dp)
                        )
                    } else {
                        Text(
                            text = stepNum.toString(),
                            color = if (isActive) Color(0xFF381E72) else TextMuted,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = title,
                    color = if (isActive) SkyPrimary else if (isCompleted) TextMain else TextMuted,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Medium,
                    fontSize = 13.sp
                )

                if (index < steps.size - 1) {
                    Spacer(modifier = Modifier.width(16.dp))
                    Icon(
                        imageVector = Icons.Default.ChevronRight,
                        contentDescription = "Separator",
                        tint = SlateBorder,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun Step1RulesIngestion(viewModel: AnnotationViewModel) {
    val context = LocalContext.current
    val isGenerating by viewModel.isGenerating.collectAsStateWithLifecycle()
    val generationProgress by viewModel.generationProgress.collectAsStateWithLifecycle()
    val fastDraft by viewModel.fastDraftToggle.collectAsStateWithLifecycle()
    val currentProject by viewModel.currentProject.collectAsStateWithLifecycle()

    var projectName by remember { mutableStateOf("") }
    var rulesText by remember { mutableStateOf("") }
    var videoUri by remember { mutableStateOf<Uri?>(null) }
    var videoName by remember { mutableStateOf("") }

    // Stepper sub-state: whether rules parsing spec is loaded for validation
    var parsedSpecJsonStr by remember { mutableStateOf("") }

    // Update state when project changes (in case we reload a project)
    LaunchedEffect(currentProject) {
        if (currentProject != null) {
            projectName = currentProject!!.name
            rulesText = currentProject!!.rulesRawText
            videoUri = Uri.parse(currentProject!!.videoUri)
            videoName = currentProject!!.videoName
            parsedSpecJsonStr = currentProject!!.confirmedSpecJson
        }
    }

    val rulesFilePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            val fileName = getFileNameFromUri(context, uri)
            val text = DocumentTextExtractor.extractTextFromUri(context, uri)
            rulesText = text
            if (projectName.isBlank()) {
                projectName = "Project - ${fileName.substringBeforeLast(".")}"
            }
            Toast.makeText(context, "Loaded rules from: $fileName", Toast.LENGTH_SHORT).show()
        }
    }

    val videoFilePicker = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            videoUri = uri
            videoName = getFileNameFromUri(context, uri)
            if (projectName.isBlank()) {
                projectName = "Project - ${videoName.substringBeforeLast(".")}"
            }
        }
    }

    val loadSampleRules = {
        rulesText = """
            # Annotation Guidelines for Scenic Video Projects
            
            1. Segmentation Rules
            The video must be segmented continuously in blocks of 2 to 7 seconds. Ensure transitions and camera motion bounds act as boundaries. Timestamps are formatted as standard decimal seconds.
            
            2. Sensory Capture Columns
            - Transcription: Verbatim dialog. If speaker is unclear use default tag '[unintelligible]'. If speech overlaps, separate via vertical pipeline '|'.
            - Visual: Describe the frame scene, camera movement, actions. Put text overlay elements in single quotes, e.g. 'Annotation Studio'.
            - Audio: Describe background sounds and sound effects. Surround SFX in square brackets e.g. [laughter], [ambient synthesizer].
            
            3. Guidelines and Word Boundaries
            - Max 20 words per Transcription lane box.
            - Never let visual activities leak into Audio column.
            - Common mistakes to avoid: ignoring background hums, forgetting text overlays on screen.
        """.trimIndent()
        Toast.makeText(context, "Sample Pro Guidelines loaded!", Toast.LENGTH_SHORT).show()
    }

    LazyColumn(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (isGenerating) {
            item {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(200.dp)
                        .background(SlateSurface, RoundedCornerShape(8.dp))
                        .border(1.dp, SlateBorder, RoundedCornerShape(8.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = SkyPrimary)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(generationProgress, color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.Medium)
                        Spacer(modifier = Modifier.height(4.dp))
                        Text("Powered by Google Gemini Models", color = Color.Gray, fontSize = 11.sp)
                    }
                }
            }
        } else if (parsedSpecJsonStr.isNotBlank()) {
            // Spec validation view
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Dynamic Rules Spec Confirmed", color = SkyPrimary, fontSize = 18.sp, fontWeight = FontWeight.Bold)
                            Text("Gemini synthesized the uploaded rules. Edit the checklist spec if needed.", color = Color.Gray, fontSize = 12.sp)
                        }
                        IconButton(onClick = { parsedSpecJsonStr = "" }) {
                            Icon(Icons.Default.EditNote, contentDescription = "Reset Ingestion", tint = SkyPrimary)
                        }
                    }

                    // Checklist tree summary
                    val specObj = remember(parsedSpecJsonStr) {
                        try { JSONObject(parsedSpecJsonStr) } catch(e: Exception) { JSONObject() }
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SlateSurface),
                        border = BorderStroke(1.dp, SlateBorder)
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            // Section: Rules
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Rule, contentDescription = "Rules", tint = SkyPrimary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Segmentation Rules:", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                            Text(
                                specObj.optString("segmentationRules", "Continuous segment flow."),
                                color = Color.LightGray,
                                fontSize = 12.sp
                            )

                            Divider(color = SlateBorder)

                            // Section: Columns
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.ViewWeek, contentDescription = "Columns", tint = SkyPrimary, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Sensory Caption Lanes:", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                            val cols = specObj.optJSONArray("columns") ?: JSONArray()
                            for (i in 0 until cols.length()) {
                                val col = cols.getJSONObject(i)
                                Row(
                                    modifier = Modifier.padding(start = 8.dp),
                                    verticalAlignment = Alignment.Top
                                ) {
                                    Icon(Icons.Default.ArrowRight, contentDescription = "bullet", tint = SkyPrimary, modifier = Modifier.size(14.dp))
                                    Column {
                                        Text(
                                            "${col.getString("name")} [id: ${col.getString("id")}]",
                                            color = Color.White,
                                            fontWeight = FontWeight.SemiBold,
                                            fontSize = 12.sp
                                        )
                                        Text(
                                            col.optString("description", ""),
                                            color = Color.Gray,
                                            fontSize = 11.sp
                                        )
                                    }
                                }
                            }

                            Divider(color = SlateBorder)

                            // Hard constraints
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.ReportProblem, contentDescription = "Constraints", tint = AccentAmber, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Quality Constraints:", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            }
                            val constraints = specObj.optJSONArray("hardConstraints") ?: JSONArray()
                            for (i in 0 until constraints.length()) {
                                Text("- ${constraints.getString(i)}", color = Color.LightGray, fontSize = 11.sp, modifier = Modifier.padding(start = 8.dp))
                            }
                        }
                    }

                    // Raw spec code block (editable)
                    Text("Structured Spec JSON Schema:", color = Color.LightGray, fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = parsedSpecJsonStr,
                        onValueChange = { parsedSpecJsonStr = it },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(180.dp)
                            .testTag("spec_json_input"),
                        textStyle = LocalTextStyle.current.copy(fontFamily = FontFamily.Monospace, fontSize = 11.sp),
                        colors = OutlinedTextFieldDefaults.colors(
                            unfocusedContainerColor = SlateSurface,
                            focusedContainerColor = SlateSurface,
                            unfocusedBorderColor = SlateBorder
                        )
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        OutlinedButton(
                            onClick = { parsedSpecJsonStr = "" },
                            border = BorderStroke(1.dp, SlateBorder),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.LightGray)
                        ) {
                            Text("Re-Ingest")
                        }

                        Button(
                            onClick = { viewModel.saveConfirmedSpec(parsedSpecJsonStr) },
                            colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary, contentColor = SlateBackground),
                            modifier = Modifier.testTag("confirm_spec_button")
                        ) {
                            Text("Confirm Spec & Ingest Video", fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.width(4.dp))
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = "Next")
                        }
                    }
                }
            }
        } else {
            // Document uploads inputs
            item {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        text = "Step 1: Project Setup & Ingestion",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 18.sp
                    )
                    Text(
                        text = "Define your annotation constraints. Upload any custom instructions, rules, or guidelines, plus your MP4 video file.",
                        color = Color.Gray,
                        fontSize = 12.sp
                    )

                    // Project name input
                    OutlinedTextField(
                        value = projectName,
                        onValueChange = { projectName = it },
                        label = { Text("Project Name") },
                        modifier = Modifier.fillMaxWidth(),
                        singleLine = true,
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            unfocusedContainerColor = Color(0xFF1C1B1F),
                            focusedContainerColor = Color(0xFF1C1B1F),
                            unfocusedBorderColor = SlateBorder,
                            focusedBorderColor = SkyPrimary
                        )
                    )

                    // Rules Guidelines Document upload card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SlateSurface),
                        border = BorderStroke(1.dp, SlateBorder)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Description, contentDescription = "Rules", tint = SkyPrimary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Annotation Rules (.md, .pdf, .docx)", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                }
                                Row {
                                    TextButton(onClick = loadSampleRules) {
                                        Text("Load Sample", color = SkyPrimary, fontSize = 12.sp)
                                    }
                                    IconButton(onClick = { rulesFilePicker.launch("*/*") }) {
                                        Icon(Icons.Default.CloudUpload, contentDescription = "Upload", tint = SkyPrimary)
                                    }
                                }
                            }

                            Spacer(modifier = Modifier.height(8.dp))

                            OutlinedTextField(
                                value = rulesText,
                                onValueChange = { rulesText = it },
                                placeholder = { Text("Paste guidelines or upload rules file above...") },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(180.dp)
                                    .testTag("rules_raw_input"),
                                shape = RoundedCornerShape(12.dp),
                                colors = OutlinedTextFieldDefaults.colors(
                                    unfocusedBorderColor = SlateBorder,
                                    focusedBorderColor = SkyPrimary,
                                    unfocusedContainerColor = Color(0xFF1C1B1F),
                                    focusedContainerColor = Color(0xFF1C1B1F)
                                ),
                                textStyle = LocalTextStyle.current.copy(fontSize = 12.sp)
                            )
                        }
                    }

                    // Video file upload card
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SlateSurface),
                        border = BorderStroke(1.dp, SlateBorder)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.VideoFile, contentDescription = "Video", tint = SkyPrimary)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Video File Input", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                }
                                Spacer(modifier = Modifier.height(4.dp))
                                Text(
                                    text = if (videoName.isNotBlank()) videoName else "No video selected",
                                    color = if (videoName.isNotBlank()) SkyPrimary else Color.Gray,
                                    fontSize = 12.sp,
                                    fontWeight = if (videoName.isNotBlank()) FontWeight.SemiBold else FontWeight.Normal
                                )
                            }

                            Button(
                                onClick = { videoFilePicker.launch("video/*") },
                                colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary, contentColor = SlateBackground)
                            ) {
                                Icon(Icons.Default.UploadFile, contentDescription = "Select", modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Select Video", fontSize = 12.sp)
                            }
                        }
                    }

                    // Model and performance parameters
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = SlateSurface),
                        border = BorderStroke(1.dp, SlateBorder)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Annotation Generation Engine", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(
                                    text = if (fastDraft) "Fast Draft (Gemini 3.5 Flash) - Quick & optimized" else "High Accuracy (Gemini 3.1 Pro) - Full sensory logic",
                                    color = Color.LightGray,
                                    fontSize = 11.sp
                                )
                            }
                            Switch(
                                checked = fastDraft,
                                onCheckedChange = { viewModel.setFastDraft(it) },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = SlateBackground,
                                    checkedTrackColor = SkyPrimary,
                                    uncheckedThumbColor = Color.LightGray,
                                    uncheckedTrackColor = SlateSurfaceVariant
                                )
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    // Ingest rules action button
                    Button(
                        onClick = { viewModel.ingestRules(projectName, rulesText, videoUri ?: Uri.EMPTY, videoName) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(50.dp)
                            .testTag("ingest_rules_button"),
                        enabled = rulesText.isNotBlank() && videoName.isNotBlank(),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = SkyPrimary,
                            contentColor = SlateBackground,
                            disabledContainerColor = SlateSurfaceVariant,
                            disabledContentColor = Color.DarkGray
                        )
                    ) {
                        Icon(Icons.Default.Psychology, contentDescription = "Ingest")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Ingest & Process Annotation Spec", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    
                    if (GeminiClient.isSimulationMode) {
                        Text(
                            "Demo Mode Active: Ingesting rules will produce high-fidelity simulation specs instantly for offline testing.",
                            color = AccentAmber,
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium,
                            modifier = Modifier.fillMaxWidth()
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun Step2VideoProcessing(viewModel: AnnotationViewModel) {
    val context = LocalContext.current
    val currentProject by viewModel.currentProject.collectAsStateWithLifecycle()
    val isGenerating by viewModel.isGenerating.collectAsStateWithLifecycle()
    val generationProgress by viewModel.generationProgress.collectAsStateWithLifecycle()

    if (currentProject == null) return

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        if (isGenerating) {
            CircularProgressIndicator(color = SkyPrimary, modifier = Modifier.size(56.dp))
            Spacer(modifier = Modifier.height(24.dp))
            Text(
                "Multimodal Processing In Progress",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                generationProgress,
                color = SkyPrimary,
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "Gemini is uploading the video once, segmenting timeline, transcribing dialogue verbatim, describing visual layout and sound effects.",
                color = Color.Gray,
                fontSize = 12.sp,
                modifier = Modifier.padding(horizontal = 24.dp),
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )
        } else {
            Icon(
                imageVector = Icons.Default.PrecisionManufacturing,
                contentDescription = "Ready",
                tint = SkyPrimary,
                modifier = Modifier.size(72.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                "Ready for Dynamic Multimodal Annotation",
                color = Color.White,
                fontSize = 18.sp,
                fontWeight = FontWeight.Bold
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                "Rules specification successfully parsed. We are ready to draft segments based on your guidelines for video: ${currentProject!!.videoName}",
                color = Color.Gray,
                fontSize = 12.sp,
                textAlign = androidx.compose.ui.text.style.TextAlign.Center
            )

            Spacer(modifier = Modifier.height(32.dp))

            Button(
                onClick = { viewModel.generateAnnotations(context) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(50.dp)
                    .testTag("generate_annotations_button"),
                colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary, contentColor = SlateBackground)
            ) {
                Icon(Icons.Default.AutoAwesome, contentDescription = "Generate")
                Spacer(modifier = Modifier.width(8.dp))
                Text("Generate AI Draft Annotations", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }

            Spacer(modifier = Modifier.height(12.dp))

            OutlinedButton(
                onClick = { viewModel.setStep(3) }, // Skip directly to empty workspace
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(1.dp, SlateBorder),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.LightGray)
            ) {
                Text("Skip to Manual Review Workspace")
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Step3ReviewWorkspace(viewModel: AnnotationViewModel) {
    val context = LocalContext.current
    val currentProject by viewModel.currentProject.collectAsStateWithLifecycle()
    val segments by viewModel.segments.collectAsStateWithLifecycle()
    val isLinting by viewModel.isLinting.collectAsStateWithLifecycle()
    val currentPlaybackTimeMs by viewModel.currentPlaybackTimeMs.collectAsStateWithLifecycle()
    val playbackSpeed by viewModel.playbackSpeed.collectAsStateWithLifecycle()

    if (currentProject == null) return

    val lazyListState = rememberLazyListState()
    val coroutineScope = rememberCoroutineScope()

    // Stepper config / dynamic columns parsed
    val configObj = remember(currentProject!!.confirmedSpecJson) {
        try { JSONObject(currentProject!!.confirmedSpecJson) } catch (e: Exception) { JSONObject() }
    }
    val columnsArr = configObj.optJSONArray("columns") ?: JSONArray()
    val colsList = remember(columnsArr) {
        val list = mutableListOf<Pair<String, String>>()
        for (i in 0 until columnsArr.length()) {
            val item = columnsArr.getJSONObject(i)
            list.add(item.getString("id") to item.getString("name"))
        }
        if (list.isEmpty()) {
            list.add("transcription" to "Transcription")
        }
        list
    }

    // Interactive Media Position changes
    var isVideoPlaying by remember { mutableStateOf(false) }
    var seekTriggerMs by remember { mutableStateOf<Long?>(null) }
    var videoDurationMs by remember { mutableStateOf(0L) }

    // Highlight and Auto-scroll active row logic
    val activeSegmentIndex = remember(segments, currentPlaybackTimeMs) {
        segments.indexOfFirst { seg ->
            currentPlaybackTimeMs >= seg.startTimeMs && currentPlaybackTimeMs <= seg.endTimeMs
        }
    }

    LaunchedEffect(activeSegmentIndex) {
        if (activeSegmentIndex != -1 && isVideoPlaying) {
            lazyListState.animateScrollToItem(activeSegmentIndex)
        }
    }

    // Cell regeneration guideline input dialog holder
    var showRegenDialogForCell by remember { mutableStateOf<Triple<Int, String, String>?>(null) } // SegmentId, ColumnId, ColumnName
    var regenGuidelineInstruction by remember { mutableStateOf("") }

    val copyAllAnnotationsToClipboard = {
        val textBuilder = StringBuilder()
        textBuilder.append("=== ANNOTATION WORKBENCH EXPORT ===\n")
        textBuilder.append("Project: ${currentProject!!.name}\n")
        textBuilder.append("Rules Config: ${currentProject!!.confirmedSpecJson}\n\n")

        for (seg in segments) {
            val startStr = formatTimeMs(seg.startTimeMs)
            val endStr = formatTimeMs(seg.endTimeMs)
            textBuilder.append("[$startStr - $endStr]\n")
            val caps = try { JSONObject(seg.captionsJson) } catch(e: Exception) { JSONObject() }
            for ((id, name) in colsList) {
                textBuilder.append("- $name: ${caps.optString(id, "")}\n")
            }
            textBuilder.append("\n")
        }
        copyToClipboard(context, textBuilder.toString())
    }

    val shareAsJson = {
        val rootObj = JSONObject()
        rootObj.put("project", currentProject!!.name)
        val segsArr = JSONArray()
        for (seg in segments) {
            val item = JSONObject()
            item.put("startTime", seg.startTimeMs / 1000.0)
            item.put("endTime", seg.endTimeMs / 1000.0)
            val caps = JSONObject(seg.captionsJson)
            val keys = caps.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                item.put(key, caps.get(key))
            }
            segsArr.put(item)
        }
        rootObj.put("segments", segsArr)
        shareText(context, "${currentProject!!.name} - Export.json", rootObj.toString(2))
    }

    val shareAsCsv = {
        val csvBuilder = StringBuilder()
        val headers = mutableListOf("Start Time", "End Time")
        headers.addAll(colsList.map { it.second })
        csvBuilder.append(headers.joinToString(",") { "\"$it\"" }).append("\n")

        for (seg in segments) {
            val row = mutableListOf<String>()
            row.add((seg.startTimeMs / 1000.0).toString())
            row.add((seg.endTimeMs / 1000.0).toString())
            val caps = JSONObject(seg.captionsJson)
            for ((id, _) in colsList) {
                row.add(caps.optString(id, ""))
            }
            csvBuilder.append(row.joinToString(",") { "\"${it.replace("\"", "\"\"")}\"" }).append("\n")
        }
        shareText(context, "${currentProject!!.name} - Export.csv", csvBuilder.toString())
    }

    // Adaptive Panel Layout
    val configuration = LocalConfiguration.current
    val isExpanded = configuration.screenWidthDp > 600

    @Composable
    fun VideoPanel(modifier: Modifier) {
        Column(
            modifier = modifier
                .background(SlateSurface)
                .border(1.dp, SlateBorder)
                .padding(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            // Player viewport
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(16f / 9f)
                    .background(Color.Black),
                contentAlignment = Alignment.Center
            ) {
                VideoPlayerView(
                    videoUriStr = currentProject!!.videoUri,
                    isPlaying = isVideoPlaying,
                    playbackSpeed = playbackSpeed,
                    seekToMs = seekTriggerMs,
                    onPositionChanged = { viewModel.setPlaybackTime(it) },
                    onVideoPrepared = { videoDurationMs = it },
                    onSeekProcessed = { seekTriggerMs = null },
                    modifier = Modifier.fillMaxSize()
                )

                // Hover / status overlay when seeking
                if (seekTriggerMs != null) {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(DarkOverlay),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator(color = SkyPrimary)
                    }
                }
            }

            // Player HUD
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "${formatTimeMs(currentPlaybackTimeMs)} / ${formatTimeMs(videoDurationMs)}",
                    fontFamily = FontFamily.Monospace,
                    color = SkyPrimary,
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Bold
                )

                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    IconButton(onClick = {
                        val current = currentPlaybackTimeMs - 500
                        viewModel.setPlaybackTime(current.coerceAtLeast(0L))
                        seekTriggerMs = current.coerceAtLeast(0L)
                    }) {
                        Icon(Icons.Default.Replay5, contentDescription = "Back 0.5s", tint = Color.White)
                    }

                    IconButton(onClick = { isVideoPlaying = !isVideoPlaying }) {
                        Icon(
                            imageVector = if (isVideoPlaying) Icons.Default.PauseCircle else Icons.Default.PlayCircle,
                            contentDescription = "PlayPause",
                            tint = SkyPrimary,
                            modifier = Modifier.size(36.dp)
                        )
                    }

                    IconButton(onClick = {
                        val current = currentPlaybackTimeMs + 500
                        viewModel.setPlaybackTime(current.coerceAtMost(videoDurationMs))
                        seekTriggerMs = current.coerceAtMost(videoDurationMs)
                    }) {
                        Icon(Icons.Default.Forward5, contentDescription = "Forward 0.5s", tint = Color.White)
                    }
                }

                // Speed Selector Menu
                var speedMenuExpanded by remember { mutableStateOf(false) }
                Box {
                    Text(
                        text = "${playbackSpeed}x",
                        modifier = Modifier
                            .clickable { speedMenuExpanded = true }
                            .background(SlateSurfaceVariant, RoundedCornerShape(4.dp))
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                        color = Color.White,
                        fontSize = 12.sp,
                        fontFamily = FontFamily.Monospace
                    )
                    DropdownMenu(
                        expanded = speedMenuExpanded,
                        onDismissRequest = { speedMenuExpanded = false }
                    ) {
                        listOf(0.25f, 0.5f, 0.75f, 1.0f).forEach { speed ->
                            DropdownMenuItem(
                                text = { Text("${speed}x", fontFamily = FontFamily.Monospace) },
                                onClick = {
                                    viewModel.setPlaybackSpeed(speed)
                                    speedMenuExpanded = false
                                }
                            )
                        }
                    }
                }
            }

            // Timeline slider
            Slider(
                value = if (videoDurationMs > 0) currentPlaybackTimeMs.toFloat() / videoDurationMs.toFloat() else 0f,
                onValueChange = { percent ->
                    val ms = (percent * videoDurationMs).toLong()
                    viewModel.setPlaybackTime(ms)
                    seekTriggerMs = ms
                },
                colors = SliderDefaults.colors(
                    thumbColor = SkyPrimary,
                    activeTrackColor = SkyPrimary,
                    inactiveTrackColor = SlateSurfaceVariant
                )
            )
        }
    }

    if (isExpanded) {
        // Wide screen split panel layout
        Row(modifier = Modifier.fillMaxSize()) {
            VideoPanel(
                modifier = Modifier
                    .weight(0.42f)
                    .fillMaxHeight()
            )

            // Right column annotations workbench editor
            Column(
                modifier = Modifier
                    .weight(0.58f)
                    .fillMaxHeight()
                    .padding(8.dp)
            ) {
                EditorToolbar(
                    isLinting = isLinting,
                    onLint = { viewModel.lintAllSegments() },
                    onClearLint = { viewModel.clearLintWarnings() },
                    onAddSegment = { viewModel.addSegment() },
                    onCopyAll = copyAllAnnotationsToClipboard,
                    onShareJson = shareAsJson,
                    onShareCsv = shareAsCsv
                )

                Spacer(modifier = Modifier.height(8.dp))

                AnnotationList(
                    segments = segments,
                    colsList = colsList,
                    activeSegmentIndex = activeSegmentIndex,
                    lazyListState = lazyListState,
                    currentPlaybackTimeMs = currentPlaybackTimeMs,
                    onSeek = { seekTriggerMs = it },
                    onUpdateText = { segId, colId, text -> viewModel.updateCellText(segId, colId, text) },
                    onUpdateTimes = { segId, s, e -> viewModel.updateSegmentTimes(segId, s, e) },
                    onSplit = { segId, split -> viewModel.splitSegment(segId, split) },
                    onMerge = { viewModel.mergeSegmentWithNext(it) },
                    onDelete = { viewModel.deleteSegment(it) },
                    onRegenClick = { segId, colId, colName ->
                        showRegenDialogForCell = Triple(segId, colId, colName)
                        regenGuidelineInstruction = ""
                    }
                )
            }
        }
    } else {
        // Phone stacked vertical view
        Column(modifier = Modifier.fillMaxSize()) {
            VideoPanel(modifier = Modifier.fillMaxWidth())

            Spacer(modifier = Modifier.height(4.dp))

            EditorToolbar(
                isLinting = isLinting,
                onLint = { viewModel.lintAllSegments() },
                onClearLint = { viewModel.clearLintWarnings() },
                onAddSegment = { viewModel.addSegment() },
                onCopyAll = copyAllAnnotationsToClipboard,
                onShareJson = shareAsJson,
                onShareCsv = shareAsCsv
            )

            Spacer(modifier = Modifier.height(4.dp))

            AnnotationList(
                segments = segments,
                colsList = colsList,
                activeSegmentIndex = activeSegmentIndex,
                lazyListState = lazyListState,
                currentPlaybackTimeMs = currentPlaybackTimeMs,
                onSeek = { seekTriggerMs = it },
                onUpdateText = { segId, colId, text -> viewModel.updateCellText(segId, colId, text) },
                onUpdateTimes = { segId, s, e -> viewModel.updateSegmentTimes(segId, s, e) },
                onSplit = { segId, split -> viewModel.splitSegment(segId, split) },
                onMerge = { viewModel.mergeSegmentWithNext(it) },
                onDelete = { viewModel.deleteSegment(it) },
                onRegenClick = { segId, colId, colName ->
                    showRegenDialogForCell = Triple(segId, colId, colName)
                    regenGuidelineInstruction = ""
                }
            )
        }
    }

    // Cell Regeneration Guidelines Dialog
    if (showRegenDialogForCell != null) {
        val (segId, colId, colName) = showRegenDialogForCell!!
        val segment = segments.find { it.id == segId }
        val currentText = segment?.let {
            try { JSONObject(it.captionsJson).optString(colId, "") } catch (e: Exception) { "" }
        } ?: ""

        Dialog(onDismissRequest = { showRegenDialogForCell = null }) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp),
                colors = CardDefaults.cardColors(containerColor = SlateSurface),
                border = BorderStroke(1.dp, SlateBorder)
            ) {
                Column(
                    modifier = Modifier.padding(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    Text(
                        "Regenerate Cell ($colName)",
                        color = SkyPrimary,
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    Text(
                        "Prompt Gemini to rewrite this cell. Provide specific instructions or click Regenerate to enforce baseline spec.",
                        color = Color.LightGray,
                        fontSize = 11.sp
                    )

                    OutlinedTextField(
                        value = regenGuidelineInstruction,
                        onValueChange = { regenGuidelineInstruction = it },
                        placeholder = { Text("e.g. 'Shorten to under 5 words', 'Transcribe verbatim stutter', 'Incorporate on-screen texts'") },
                        modifier = Modifier.fillMaxWidth(),
                        colors = OutlinedTextFieldDefaults.colors(
                            unfocusedContainerColor = SlateBackground,
                            focusedContainerColor = SlateBackground
                        )
                    )

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.End,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        TextButton(onClick = { showRegenDialogForCell = null }) {
                            Text("Cancel", color = Color.Gray)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                viewModel.regenerateCell(segId, colId, colName, currentText, regenGuidelineInstruction)
                                showRegenDialogForCell = null
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary, contentColor = SlateBackground)
                        ) {
                            Text("Regenerate")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun EditorToolbar(
    isLinting: Boolean,
    onLint: () -> Unit,
    onClearLint: () -> Unit,
    onAddSegment: () -> Unit,
    onCopyAll: () -> Unit,
    onShareJson: () -> Unit,
    onShareCsv: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(SlateSurface)
            .border(1.dp, SlateBorder)
            .padding(8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Button(
                onClick = onLint,
                colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary, contentColor = SlateBackground),
                enabled = !isLinting,
                modifier = Modifier.testTag("lint_button")
            ) {
                if (isLinting) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), color = SlateBackground, strokeWidth = 2.dp)
                } else {
                    Icon(Icons.Default.FactCheck, contentDescription = "Lint rules", modifier = Modifier.size(16.dp))
                }
                Spacer(modifier = Modifier.width(4.dp))
                Text("Lint Rules", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }

            OutlinedButton(
                onClick = onClearLint,
                colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.LightGray),
                border = BorderStroke(1.dp, SlateBorder)
            ) {
                Icon(Icons.Default.ClearAll, contentDescription = "Clear", modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text("Clear Warnings", fontSize = 12.sp)
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            IconButton(onClick = onAddSegment) {
                Icon(Icons.Default.AddCircle, contentDescription = "Add Row", tint = SkyPrimary)
            }

            // Export Actions Trigger Menu
            var exportMenuExpanded by remember { mutableStateOf(false) }
            Box {
                Button(
                    onClick = { exportMenuExpanded = true },
                    colors = ButtonDefaults.buttonColors(containerColor = SlateSurfaceVariant, contentColor = Color.White)
                ) {
                    Icon(Icons.Default.IosShare, contentDescription = "Export", modifier = Modifier.size(16.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Export", fontSize = 12.sp)
                }

                DropdownMenu(
                    expanded = exportMenuExpanded,
                    onDismissRequest = { exportMenuExpanded = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Copy Format text") },
                        leadingIcon = { Icon(Icons.Default.ContentCopy, contentDescription = "copy") },
                        onClick = {
                            onCopyAll()
                            exportMenuExpanded = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Share JSON Payload") },
                        leadingIcon = { Icon(Icons.Default.Code, contentDescription = "json") },
                        onClick = {
                            onShareJson()
                            exportMenuExpanded = false
                        }
                    )
                    DropdownMenuItem(
                        text = { Text("Share CSV Spreadsheet") },
                        leadingIcon = { Icon(Icons.Default.GridOn, contentDescription = "csv") },
                        onClick = {
                            onShareCsv()
                            exportMenuExpanded = false
                        }
                    )
                }
            }
        }
    }
}

@Composable
fun AnnotationList(
    segments: List<AnnotationSegment>,
    colsList: List<Pair<String, String>>,
    activeSegmentIndex: Int,
    lazyListState: androidx.compose.foundation.lazy.LazyListState,
    currentPlaybackTimeMs: Long,
    onSeek: (Long) -> Unit,
    onUpdateText: (Int, String, String) -> Unit,
    onUpdateTimes: (Int, Long, Long) -> Unit,
    onSplit: (Int, Long) -> Unit,
    onMerge: (Int) -> Unit,
    onDelete: (Int) -> Unit,
    onRegenClick: (Int, String, String) -> Unit
) {
    if (segments.isEmpty()) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(SlateSurface)
                .border(1.dp, SlateBorder)
                .padding(32.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Icon(Icons.Default.SubtitlesOff, contentDescription = "None", tint = Color.Gray, modifier = Modifier.size(48.dp))
                Spacer(modifier = Modifier.height(16.dp))
                Text("No Annotation Segments Available", color = Color.White, fontWeight = FontWeight.Bold)
                Spacer(modifier = Modifier.height(4.dp))
                Text("Click generate draft annotations above or click '+' to append standard row.", color = Color.Gray, fontSize = 12.sp)
            }
        }
        return
    }

    LazyColumn(
        state = lazyListState,
        modifier = Modifier
            .fillMaxSize()
            .background(SlateSurface)
            .border(1.dp, SlateBorder)
            .padding(4.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        itemsIndexed(segments) { index, segment ->
            val isActive = index == activeSegmentIndex
            SegmentRowCard(
                segment = segment,
                isFirst = index == 0,
                isLast = index == segments.size - 1,
                colsList = colsList,
                isActive = isActive,
                currentPlaybackTimeMs = currentPlaybackTimeMs,
                onSeek = onSeek,
                onUpdateText = onUpdateText,
                onUpdateTimes = onUpdateTimes,
                onSplit = onSplit,
                onMerge = onMerge,
                onDelete = onDelete,
                onRegenClick = onRegenClick
            )
        }
    }
}

@Composable
fun SegmentRowCard(
    segment: AnnotationSegment,
    isFirst: Boolean,
    isLast: Boolean,
    colsList: List<Pair<String, String>>,
    isActive: Boolean,
    currentPlaybackTimeMs: Long,
    onSeek: (Long) -> Unit,
    onUpdateText: (Int, String, String) -> Unit,
    onUpdateTimes: (Int, Long, Long) -> Unit,
    onSplit: (Int, Long) -> Unit,
    onMerge: (Int) -> Unit,
    onDelete: (Int) -> Unit,
    onRegenClick: (Int, String, String) -> Unit
) {
    val context = LocalContext.current
    val captions = remember(segment.captionsJson) {
        try { JSONObject(segment.captionsJson) } catch (e: Exception) { JSONObject() }
    }

    val violations = remember(segment.violationsJson) {
        if (segment.violationsJson == null) null else {
            try { JSONObject(segment.violationsJson!!) } catch (e: Exception) { null }
        }
    }

    // Editable text buffers
    var showTimeEditDialog by remember { mutableStateOf(false) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .border(
                border = BorderStroke(
                    width = if (isActive) 1.5.dp else 1.dp,
                    color = if (isActive) SkyPrimary else SlateBorder
                ),
                shape = RoundedCornerShape(12.dp)
            ),
        colors = CardDefaults.cardColors(
            containerColor = if (isActive) Color(0xFF141218) else SlateBackground
        )
    ) {
        Column(modifier = Modifier.padding(10.dp)) {
            // Header: Timestamps + Action row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Clicking timestamp range jumps playhead
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .clickable { onSeek(segment.startTimeMs) }
                        .padding(vertical = 4.dp, horizontal = 6.dp)
                        .background(SlateSurfaceVariant, RoundedCornerShape(4.dp))
                ) {
                    Icon(
                        imageVector = if (isActive) Icons.Default.VolumeUp else Icons.Default.PlayArrow,
                        contentDescription = "Seek",
                        tint = if (isActive) SkyPrimary else Color.Gray,
                        modifier = Modifier.size(14.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "${formatTimeMs(segment.startTimeMs)} - ${formatTimeMs(segment.endTimeMs)}",
                        fontFamily = FontFamily.Monospace,
                        color = if (isActive) SkyPrimary else Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp
                    )
                }

                Row(
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    // Quick Action: Time adjustment trigger
                    IconButton(
                        onClick = { showTimeEditDialog = true },
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(Icons.Default.AccessTime, contentDescription = "Edit Times", tint = Color.LightGray, modifier = Modifier.size(16.dp))
                    }

                    // Split segment trigger (only if playhead falls within this boundary)
                    val canSplit = currentPlaybackTimeMs > segment.startTimeMs && currentPlaybackTimeMs < segment.endTimeMs
                    IconButton(
                        onClick = { onSplit(segment.id, currentPlaybackTimeMs) },
                        enabled = canSplit,
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.CallSplit,
                            contentDescription = "Split segment at playhead",
                            tint = if (canSplit) SkyPrimary else Color.DarkGray,
                            modifier = Modifier.size(16.dp)
                        )
                    }

                    // Merge trigger
                    if (!isLast) {
                        IconButton(
                            onClick = { onMerge(segment.id) },
                            modifier = Modifier.size(28.dp)
                        ) {
                            Icon(Icons.Default.Merge, contentDescription = "Merge with next", tint = Color.LightGray, modifier = Modifier.size(16.dp))
                        }
                    }

                    // Delete trigger
                    IconButton(
                        onClick = { onDelete(segment.id) },
                        modifier = Modifier.size(28.dp)
                    ) {
                        Icon(Icons.Default.Delete, contentDescription = "Delete row", tint = AccentRed, modifier = Modifier.size(16.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            // Sensory lanes inputs (Grid/Row layout depending on spec)
            colsList.forEach { (colId, colName) ->
                val cellText = captions.optString(colId, "")
                val warning = violations?.optString(colId, "")

                Column(modifier = Modifier.padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = colName.uppercase(),
                                color = TextMuted,
                                fontSize = 10.sp,
                                fontWeight = FontWeight.Bold,
                                letterSpacing = 1.sp,
                                fontFamily = FontFamily.SansSerif
                            )
                            if (!warning.isNullOrBlank()) {
                                Spacer(modifier = Modifier.width(6.dp))
                                Box(
                                    modifier = Modifier
                                        .background(AccentRed.copy(alpha = 0.2f), RoundedCornerShape(4.dp))
                                        .border(1.dp, AccentRed, RoundedCornerShape(4.dp))
                                        .padding(horizontal = 6.dp, vertical = 2.dp)
                                ) {
                                    Text(warning, color = AccentRed, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                                }
                            }
                        }

                        // Cell-level regenerate button
                        IconButton(
                            onClick = { onRegenClick(segment.id, colId, colName) },
                            modifier = Modifier.size(24.dp)
                        ) {
                            Icon(Icons.Default.Sync, contentDescription = "Regen cell", tint = SkyPrimary, modifier = Modifier.size(14.dp))
                        }
                    }

                    OutlinedTextField(
                        value = cellText,
                        onValueChange = { onUpdateText(segment.id, colId, it) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 2.dp),
                        textStyle = LocalTextStyle.current.copy(fontSize = 12.sp, fontFamily = FontFamily.Monospace),
                        shape = RoundedCornerShape(12.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            unfocusedContainerColor = Color(0xFF1C1B1F),
                            focusedContainerColor = Color(0xFF1C1B1F),
                            unfocusedBorderColor = if (!warning.isNullOrBlank()) AccentRed else Color(0xFF49454F),
                            focusedBorderColor = if (!warning.isNullOrBlank()) AccentRed else SkyPrimary
                        )
                    )
                }
            }
        }
    }

    // Modal dialogue to manually modify timestamps safely
    if (showTimeEditDialog) {
        var startInput by remember { mutableStateOf((segment.startTimeMs / 1000.0).toString()) }
        var endInput by remember { mutableStateOf((segment.endTimeMs / 1000.0).toString()) }

        Dialog(onDismissRequest = { showTimeEditDialog = false }) {
            Card(
                colors = CardDefaults.cardColors(containerColor = SlateSurface),
                border = BorderStroke(1.dp, SlateBorder),
                modifier = Modifier.padding(16.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Edit Segment Range", color = SkyPrimary, fontWeight = FontWeight.Bold, fontSize = 15.sp)
                    Text("Set start and end bounds in decimal seconds.", color = Color.Gray, fontSize = 11.sp)

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedTextField(
                            value = startInput,
                            onValueChange = { startInput = it },
                            label = { Text("Start (s)") },
                            modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                        )
                        OutlinedTextField(
                            value = endInput,
                            onValueChange = { endInput = it },
                            label = { Text("End (s)") },
                            modifier = Modifier.weight(1f),
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                        )
                    }

                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                        TextButton(onClick = { showTimeEditDialog = false }) {
                            Text("Cancel", color = Color.Gray)
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                        Button(
                            onClick = {
                                val s = startInput.toDoubleOrNull()
                                val e = endInput.toDoubleOrNull()
                                if (s != null && e != null && s < e) {
                                    onUpdateTimes(segment.id, (s * 1000).toLong(), (e * 1000).toLong())
                                    showTimeEditDialog = false
                                } else {
                                    Toast.makeText(context, "Please enter logical values.", Toast.LENGTH_SHORT).show()
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = SkyPrimary, contentColor = SlateBackground)
                        ) {
                            Text("Save")
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ProjectSelectorDialog(
    projects: List<Project>,
    activeProject: Project?,
    onSelect: (Project) -> Unit,
    onDelete: (Project) -> Unit,
    onDismiss: () -> Unit
) {
    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            colors = CardDefaults.cardColors(containerColor = SlateSurface),
            border = BorderStroke(1.dp, SlateBorder)
        ) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Select Workspace Project", color = SkyPrimary, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                
                LazyColumn(
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.height(240.dp)
                ) {
                    itemsIndexed(projects) { _, proj ->
                        val isCurrent = proj.id == activeProject?.id
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .background(
                                    if (isCurrent) SkyPrimary.copy(alpha = 0.15f) else SlateBackground,
                                    RoundedCornerShape(4.dp)
                                )
                                .clickable { onSelect(proj) }
                                .padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(proj.name, color = Color.White, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                Text(proj.videoName, color = Color.Gray, fontSize = 11.sp)
                            }

                            Row {
                                if (isCurrent) {
                                    Icon(Icons.Default.Check, contentDescription = "active", tint = SkyPrimary, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(12.dp))
                                }
                                IconButton(onClick = { onDelete(proj) }, modifier = Modifier.size(24.dp)) {
                                    Icon(Icons.Default.Delete, contentDescription = "delete", tint = AccentRed, modifier = Modifier.size(16.dp))
                                }
                            }
                        }
                    }
                }

                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                    TextButton(onClick = onDismiss) {
                        Text("Close", color = Color.Gray)
                    }
                }
            }
        }
    }
}

// Format MS to visual presentation format (e.g. MM:SS.S)
fun formatTimeMs(ms: Long): String {
    val totalSeconds = ms / 1000.0
    val minutes = (ms / 60000).toInt()
    val seconds = totalSeconds % 60.0
    return String.format("%02d:%04.1f", minutes, seconds)
}

fun getFileNameFromUri(context: Context, uri: Uri): String {
    var result: String? = null
    if (uri.scheme == "content") {
        val cursor = context.contentResolver.query(uri, null, null, null, null)
        try {
            if (cursor != null && cursor.moveToFirst()) {
                val index = cursor.getColumnIndex(android.provider.OpenableColumns.DISPLAY_NAME)
                if (index != -1) {
                    result = cursor.getString(index)
                }
            }
        } finally {
            cursor?.close()
        }
    }
    if (result == null) {
        result = uri.path
        val cut = result?.lastIndexOf('/')
        if (cut != null && cut != -1) {
            result = result.substring(cut + 1)
        }
    }
    return result ?: "unnamed_video.mp4"
}

fun copyToClipboard(context: Context, text: String) {
    val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager
    val clip = android.content.ClipData.newPlainText("Annotation Workbench Export", text)
    clipboard.setPrimaryClip(clip)
    Toast.makeText(context, "Export copied to clipboard", Toast.LENGTH_SHORT).show()
}

fun shareText(context: Context, title: String, text: String) {
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(Intent.EXTRA_SUBJECT, title)
        putExtra(Intent.EXTRA_TEXT, text)
    }
    context.startActivity(Intent.createChooser(intent, "Share Annotation Export"))
}
