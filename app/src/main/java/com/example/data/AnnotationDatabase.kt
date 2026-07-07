package com.example.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(entities = [Project::class, AnnotationSegment::class], version = 1, exportSchema = false)
abstract class AnnotationDatabase : RoomDatabase() {
    abstract fun projectDao(): ProjectDao
    abstract fun segmentDao(): AnnotationSegmentDao

    companion object {
        @Volatile
        private var INSTANCE: AnnotationDatabase? = null

        fun getDatabase(context: Context): AnnotationDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AnnotationDatabase::class.java,
                    "annotation_workbench_database"
                )
                .fallbackToDestructiveMigration()
                .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
