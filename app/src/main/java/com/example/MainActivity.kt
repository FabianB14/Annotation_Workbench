package com.example

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import com.example.data.AnnotationDatabase
import com.example.data.AnnotationRepository
import com.example.ui.AnnotationViewModel
import com.example.ui.AnnotationWorkbenchApp
import com.example.ui.theme.MyApplicationTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        val database = AnnotationDatabase.getDatabase(this)
        val repository = AnnotationRepository(database)
        val viewModel: AnnotationViewModel by viewModels {
            AnnotationViewModel.Factory(repository)
        }

        setContent {
            MyApplicationTheme {
                AnnotationWorkbenchApp(viewModel)
            }
        }
    }
}
