package com.example.data

import kotlinx.coroutines.flow.Flow

class AnnotationRepository(private val database: AnnotationDatabase) {
    val allProjects: Flow<List<Project>> = database.projectDao().getAllProjectsFlow()

    fun getSegmentsForProjectFlow(projectId: Int): Flow<List<AnnotationSegment>> =
        database.segmentDao().getSegmentsForProjectFlow(projectId)

    suspend fun getProjectById(projectId: Int): Project? =
        database.projectDao().getProjectById(projectId)

    suspend fun insertProject(project: Project): Long =
        database.projectDao().insertProject(project)

    suspend fun updateProject(project: Project) =
        database.projectDao().updateProject(project)

    suspend fun deleteProjectById(projectId: Int) {
        database.segmentDao().deleteSegmentsForProject(projectId)
        database.projectDao().deleteProjectById(projectId)
    }

    suspend fun insertSegment(segment: AnnotationSegment): Long =
        database.segmentDao().insertSegment(segment)

    suspend fun insertSegments(segments: List<AnnotationSegment>) =
        database.segmentDao().insertSegments(segments)

    suspend fun updateSegment(segment: AnnotationSegment) =
        database.segmentDao().updateSegment(segment)

    suspend fun deleteSegmentById(segmentId: Int) =
        database.segmentDao().deleteSegmentById(segmentId)

    suspend fun getSegmentsForProject(projectId: Int): List<AnnotationSegment> =
        database.segmentDao().getSegmentsForProject(projectId)

    suspend fun deleteSegmentsForProject(projectId: Int) =
        database.segmentDao().deleteSegmentsForProject(projectId)
}
