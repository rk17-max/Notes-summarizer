const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const os = require("os"); // <--- IMPORT THIS
const Groq = require("groq-sdk");
const pdfParse = require("pdf-parse");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);


 //const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

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

    } catch (geminiError) {
        console.warn("⚠️ Gemini failed or is overloaded! Switching to Groq Backup...");
        
        try {
            const dataBuffer = fs.readFileSync(tempFilePath);
           const pdfData = await pdfParse(dataBuffer);
            let extractedText = pdfData.text;

            // 🛡️ THE SAFETY CHOPPER: Prevent Groq from crashing on massive PDFs
            const MAX_CHARS = 25000; 
            if (extractedText.length > MAX_CHARS) {
                console.log("PDF is too large for Groq. Truncating text...");
                extractedText = extractedText.substring(0, MAX_CHARS) + "\n\n[TEXT TRUNCATED]";
            }

            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { 
                        role: "system", 
                        content: "You are a helpful study assistant. Generate a 3-question multiple-choice quiz based on the text. Return ONLY a valid JSON array matching this format: [{\"question\": \"...\", \"options\": [\"A\", \"B\", \"C\", \"D\"], \"correctIndex\": 0}]. Do not use markdown blocks." 
                    },
                    { 
                        role: "user", 
                        content: `Here are the notes: \n\n${extractedText}` 
                    }
                ],
            model: "llama-3.1-8b-instant",
            });

            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);

            // 🧩 FIX: Parse Groq's response exactly like Gemini's so the frontend doesn't break
            const rawGroqText = chatCompletion.choices[0]?.message?.content || "";
            const cleanGroqJsonText = rawGroqText.replace(/```json/g, '').replace(/```/g, '').trim();
            const groqQuizData = JSON.parse(cleanGroqJsonText);
            
            // Send exactly what the frontend expects!
            return res.json({ success: true, quiz: groqQuizData });

        } catch (groqError) {
            console.error("🚨 Groq Backup ALSO failed!", groqError);
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            
            return res.status(503).json({ 
                error: "All AI systems are currently taking a breather due to high traffic! Please wait 10 seconds and try again." 
            });
        }
    }
    return res.status(500).json({ 
        success: false, 
        error: "Oops! Something went wrong while crafting your quiz. Please try again." 
    });
}


exports.summarizeUploadedFile = async (req, res) => {
    let tempFilePath = null;
    try {
        if (!req.file || !req.file.path) return res.status(400).json({ error: "No file uploaded" });

        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `upload_${Date.now()}.pdf`);

        const writer = fs.createWriteStream(tempFilePath);
        const response = await axios({ url: req.file.path, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: "application/pdf",
            displayName: "Student Note",
        });

        console.log(`3. Generating Summary for application/pdf...`);

        const superPrompt = `Analyze these notes and create a structured Markdown study guide. Use headers, bold terms, and bullet points.`;

        const result = await model.generateContent([
            { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
            { text: superPrompt }
        ]);

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        res.json({ success: true, summary: result.response.text() });

    } catch (geminiError) {
        console.warn("⚠️ Gemini failed! Switching to Groq for Summary Backup...");
        try {
            const dataBuffer = fs.readFileSync(tempFilePath);
            const pdfData = await pdfParse(dataBuffer);
            let extractedText = pdfData.text;
            const MAX_CHARS = 25000;
            if (extractedText.length > MAX_CHARS) extractedText = extractedText.substring(0, MAX_CHARS) + "\n\n[TRUNCATED]";

            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    { role: "system", content: "Provide a structured Markdown summary of the following text." },
                    { role: "user", content: extractedText }
                ],
                   model: "llama-3.1-8b-instant",
            });

            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return res.json({ success: true, summary: chatCompletion.choices[0]?.message?.content });
        } catch (groqError) {
            if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            return res.status(503).json({ error: "AI systems are busy. Try again in 30 seconds." });
        }
    }
};

exports.summarizeFromUrl = async (req, res) => {
    let tempFilePath = null;
    try {
        const { fileUrl } = req.body;
        if (!fileUrl) return res.status(400).json({ error: "No file URL provided" });

        const tempDir = os.tmpdir();
        tempFilePath = path.join(tempDir, `summary_${Date.now()}.pdf`);

        const writer = fs.createWriteStream(tempFilePath);
        const response = await axios({ url: fileUrl, method: 'GET', responseType: 'stream' });
        response.data.pipe(writer);
        await new Promise((resolve, reject) => { writer.on('finish', resolve); writer.on('error', reject); });

        let detectedMimeType = "application/pdf";
        const lowerUrl = fileUrl.toLowerCase();
        if (lowerUrl.endsWith(".jpg") || lowerUrl.endsWith(".jpeg")) detectedMimeType = "image/jpeg";
        else if (lowerUrl.endsWith(".png")) detectedMimeType = "image/png";

        const uploadResponse = await fileManager.uploadFile(tempFilePath, {
            mimeType: detectedMimeType,
            displayName: "Remote Note",
        });

        const result = await model.generateContent([
            { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
            { text: "Provide a structured Markdown summary of these notes." }
        ]);

        if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        res.json({ success: true, summary: result.response.text() });

    } catch (error) {
        if (tempFilePath && fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
        if (error.status === 503 || error.message?.includes('503')) {
            return res.status(503).json({ error: "AI servers busy. Try again in 30 seconds." });
        }
        res.status(500).json({ error: "Failed to generate summary" });
    }
};