package com.example.data

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "projects")
data class Project(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val name: String,
    val rulesRawText: String,
    val confirmedSpecJson: String, // stringified JSON holding columns and parsed guidelines
    val videoUri: String,
    val videoName: String,
    val videoDuration: Long = 0L,
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis()
)

@Entity(tableName = "annotation_segments")
data class AnnotationSegment(
    @PrimaryKey(autoGenerate = true) val id: Int = 0,
    val projectId: Int,
    val startTimeMs: Long,
    val endTimeMs: Long,
    val captionsJson: String, // map of string column -> string value (JSON)
    val violationsJson: String? = null, // JSON object map of column -> violation reason or list
    val isLocked: Boolean = false
)
