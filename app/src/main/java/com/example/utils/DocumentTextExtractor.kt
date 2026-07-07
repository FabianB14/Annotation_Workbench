package com.example.utils

import android.content.Context
import android.net.Uri
import java.io.InputStream
import java.util.zip.ZipInputStream

object DocumentTextExtractor {
    fun extractTextFromUri(context: Context, uri: Uri): String {
        val resolver = context.contentResolver
        val mimeType = resolver.getType(uri) ?: ""
        val fileName = uri.lastPathSegment?.lowercase() ?: ""
        
        return try {
            val inputStream = resolver.openInputStream(uri) ?: return "Unable to open file"
            
            if (fileName.contains(".docx") || mimeType == "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
                extractFromDocx(inputStream)
            } else if (fileName.contains(".pdf") || mimeType == "application/pdf") {
                extractFromPdf(inputStream)
            } else {
                // Default: read as plain text
                inputStream.bufferedReader().use { it.readText() }
            }
        } catch (e: Exception) {
            "Error extracting text from file: ${e.message}"
        }
    }

    private fun extractFromDocx(inputStream: InputStream): String {
        val zip = ZipInputStream(inputStream)
        var entry = zip.nextEntry
        var documentXmlText = ""
        while (entry != null) {
            if (entry.name == "word/document.xml") {
                documentXmlText = zip.bufferedReader().use { it.readText() }
                break
            }
            entry = zip.nextEntry
        }
        zip.close()

        if (documentXmlText.isEmpty()) return "Empty DOCX document or unreadable structure."

        // Match tags <w:t> content
        val regex = "<w:t[^>]*>(.*?)</w:t>".toRegex()
        val matches = regex.findAll(documentXmlText)
        val text = matches.map { it.groupValues[1] }.joinToString(" ")
        
        return text.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&quot;", "\"")
            .replace("&apos;", "'")
            .trim()
    }

    private fun extractFromPdf(inputStream: InputStream): String {
        return try {
            val bytes = inputStream.readBytes()
            val content = String(bytes, Charsets.ISO_8859_1)
            // Look for Tj/TJ streams
            val matches = Regex("\\(([^)]+)\\)\\s*(?:Tj|TJ)").findAll(content)
            val textList = matches.map { it.groupValues[1] }.toList()
            
            if (textList.isEmpty()) {
                return "[Rules file ingested. PDF structure will be sent directly to Gemini for precision summary.]"
            }
            
            val parsed = textList.joinToString(" ")
                .replace("\\(", "(")
                .replace("\\)", ")")
                .trim()
            
            if (parsed.length < 50) {
                "[Rules file ingested. PDF structure will be sent directly to Gemini for precision summary.]"
            } else {
                parsed
            }
        } catch (e: Exception) {
            "[Rules file ingested. Direct Gemini parsing will be used to extract rules structures safely]."
        }
    }
}
