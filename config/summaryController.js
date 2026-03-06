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
    const result = await model.generateContent([
      {
        fileData: {
          mimeType: uploadResponse.file.mimeType,
          fileUri: uploadResponse.file.uri
        }
      },
      { text: "Detailed summary please." }
    ]);

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
    const uploadResponse = await fileManager.uploadFile(tempFilePath, {
      mimeType: "application/pdf",
      displayName: "Remote Note",
    });

    console.log("3. Generating Summary...");
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