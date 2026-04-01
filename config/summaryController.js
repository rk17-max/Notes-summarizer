const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const os = require("os"); // <--- IMPORT THIS

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

// ✅ USE THIS: It points to the stable, free-tier ready version
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Add this at the bottom of summaryController.js

exports.generateQuizFromUrl = async (req, res) => {
    let tempFilePath = null;
    try {
        const { fileUrl } = req.body;
        if (!fileUrl) return res.status(400).json({ error: "No file URL provided" });

        // 1. Detect File Type
        let detectedMimeType = "application/pdf";
        const lowerUrl = fileUrl.toLowerCase();
        if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) detectedMimeType = "image/jpeg";
        else if (lowerUrl.endsWith(".png")) detectedMimeType = "image/png";
        else if (lowerUrl.endsWith(".webp")) detectedMimeType = "image/webp";

        // 2. Download File to Temp Folder
        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `quiz_${Date.now()}.pdf`);
        const writer = fs.createWriteStream(tempFilePath);
        const response = await axios({ url: fileUrl, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        // 3. Upload to Gemini
        console.log(`Uploading to Gemini for Quiz (${detectedMimeType})...`);
        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: detectedMimeType,
            displayName: "Quiz Source",
        });

        // 4. The Magic Prompt (Strict JSON formatting)
        const prompt = `
            Analyze this document and create a 3-question multiple-choice quiz testing the most important concepts.
            Return ONLY a valid JSON array. Do not use markdown blocks like \`\`\`json. Just output the raw array.
            Format exactly like this:
            [
              {
                "question": "The question text here?",
                "options": ["Choice A", "Choice B", "Choice C", "Choice D"],
                "correctIndex": 2
              }
            ]
        `;

        const result = await model.generateContent([
            { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
            { text: prompt }
        ]);

        // Cleanup temp file
        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

        // 5. Clean and Parse the JSON
        const rawText = result.response.text();
        // Just in case Gemini adds markdown anyway, strip it out:
        const cleanJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        const quizData = JSON.parse(cleanJsonText);

        res.json({ success: true, quiz: quizData });

    } catch (err) {
        console.error("Quiz Generation Error:", err);
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        res.status(500).json({ error: "Failed to generate quiz" });
    }
};


exports.summarizeUploadedFile = async (req, res) => {
  let tempFilePath = null;

  try {
    if (!req.file || !req.file.path) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // ✅ FIX: Use os.tmpdir() for cross-platform compatibility (Windows & Vercel)
    // On Vercel, this automatically points to the writable '/tmp' folder
    const tempDir = os.tmpdir(); 
    tempFilePath = path.join(tempDir, `upload_${Date.now()}.pdf`);

    // Download from Cloudinary to the temp folder
    const writer = fs.createWriteStream(tempFilePath);
    const response = await axios({
      url: req.file.path,
      method: 'GET',
      responseType: 'stream'
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Upload to Google AI
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: "application/pdf",
      displayName: "Student Note",
    });

    // Generate Summary
    console.log(`3. Generating Summary for ${detectedMimeType}...`);

    // 👇 YOUR NEW CODE STARTS HERE 👇
    const superPrompt = `
      You are an expert academic tutor and professor. Your task is to analyze the provided student notes (which may be images of handwritten notes, diagrams, or PDFs) and create a highly structured, comprehensive, and easy-to-read study guide summary.

      Please extract the information and format it EXACTLY using the following Markdown structure:

      ## 🎯 Core Topic
      [Provide a clear, 1-line title for what these notes are about]

      ## 📝 Executive Summary
      [Provide a 2-3 sentence overview of the main theme and why it is important]

      ## 🔑 Key Concepts & Definitions
      [Extract the most important terms. Use bullet points. Bold the term, followed by a clear definition]

      ## ⚙️ Important Processes / Formulas / Facts
      [If there are mathematical formulas, algorithms, or step-by-step processes, list them clearly here. If it's a history/literature note, list the crucial historical events. Use bullet points or numbered lists.]

      ## 💡 Crucial Takeaways for Exams
      [Provide 3 to 5 high-yield bullet points summarizing the most testable or essential information that a student MUST remember from this document.]

      Strict Guidelines:
      1. Use clean Markdown formatting (bolding, headers, bullet points).
      2. If the document is an image of messy handwritten notes, transcribe and interpret it to the best of your ability.
      3. DO NOT hallucinate or make up information that is not present in the document. If a section from the template above doesn't apply (e.g., no formulas), simply omit that section.
    `;

    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: superPrompt } 
    ]);
    // 👆 YOUR NEW CODE ENDS HERE 👆

    // Cleanup
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    // Cleanup
    if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
    }

    res.json({ success: true, summary: result.response.text() });

  } catch (error) {
    console.error("AI Error:", error);
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath); // Ensure cleanup on error
    }
    res.status(500).json({ error: "Failed to process" });
  }
};
// ... existing imports and setup ...

// 👇 ADD THIS NEW FUNCTION
exports.summarizeFromUrl = async (req, res) => {
  let tempFilePath = null;

  try {
    const { fileUrl } = req.body; // Get URL from frontend
    
    if (!fileUrl) {
      return res.status(400).json({ error: "No file URL provided" });
    }

    console.log("1. Fetching from URL:", fileUrl);

    // Create temp path
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `summary_${Date.now()}.pdf`);

    // Download PDF from Cloudinary to Temp
    const writer = fs.createWriteStream(tempFilePath);
    const response = await axios({
      url: fileUrl,
      method: 'GET',
      responseType: 'stream'
    });

    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

   console.log("2. Uploading to Gemini...");

    // 👇 NEW LOGIC: Detect the file type from the URL
    let detectedMimeType = "application/pdf"; // Default
    const lowerUrl = fileUrl.toLowerCase();
    
    if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) {
        detectedMimeType = "image/jpeg";
    } else if (lowerUrl.endsWith(".png")) {
        detectedMimeType = "image/png";
    } else if (lowerUrl.endsWith(".webp")) {
        detectedMimeType = "image/webp";
    }

    // 👇 UPDATED: Pass the dynamic mimeType
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: detectedMimeType, 
      displayName: "Remote Note",
    });

    console.log(`3. Generating Summary for ${detectedMimeType}...`);

   
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: "Provide a structured, easy-to-read summary of these notes. Use bullet points." }
    ]);

    // Cleanup
    if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

    res.json({ success: true, summary: result.response.text() });

  } catch (error) {
    console.error("Summary Error:", error);
    if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    res.status(500).json({ error: "Failed to generate summary" });
  }
};