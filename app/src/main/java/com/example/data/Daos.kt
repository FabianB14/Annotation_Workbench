package com.example.data

import androidx.room.*
import kotlinx.coroutines.flow.Flow

@Dao
interface ProjectDao {
    @Query("SELECT * FROM projects ORDER BY updatedAt DESC")
    fun getAllProjectsFlow(): Flow<List<Project>>

    @Query("SELECT * FROM projects WHERE id = :id")
    suspend fun getProjectById(id: Int): Project?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProject(project: Project): Long

    @Update
    suspend fun updateProject(project: Project)

    @Delete
    suspend fun deleteProject(project: Project)

    @Query("DELETE FROM projects WHERE id = :id")
    suspend fun deleteProjectById(id: Int)
}

@Dao
interface AnnotationSegmentDao {
    @Query("SELECT * FROM annotation_segments WHERE projectId = :projectId ORDER BY startTimeMs ASC")
    fun getSegmentsForProjectFlow(projectId: Int): Flow<List<AnnotationSegment>>

    @Query("SELECT * FROM annotation_segments WHERE projectId = :projectId ORDER BY startTimeMs ASC")
    suspend fun getSegmentsForProject(projectId: Int): List<AnnotationSegment>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSegment(segment: AnnotationSegment): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSegments(segments: List<AnnotationSegment>)

    @Update
    suspend fun updateSegment(segment: AnnotationSegment)

    @Delete
    suspend fun deleteSegment(segment: AnnotationSegment)

    @Query("DELETE FROM annotation_segments WHERE projectId = :projectId")
    suspend fun deleteSegmentsForProject(projectId: Int)

    @Query("DELETE FROM annotation_segments WHERE id = :segmentId")
    suspend fun deleteSegmentById(segmentId: Int)
}
