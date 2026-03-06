// check_models.js
require('dotenv').config(); // Make sure you have dotenv installed
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Access your API key as an environment variable
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function listMyModels() {
  try {
    console.log("Checking available models...");
    // This is a special hidden request to fetch model list
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
    );
    const data = await response.json();

    if (data.models) {
      console.log("\n✅ AVAILABLE MODELS FOR YOU:");
      data.models.forEach(m => {
        // Only show models that support 'generateContent'
        if (m.supportedGenerationMethods.includes("generateContent")) {
          console.log(`- ${m.name.replace("models/", "")}`);
        }
      });
    } else {
      console.log("❌ No models found. Check your API Key permissions.");
      console.log(data);
    }
  } catch (error) {
    console.error("❌ Error listing models:", error.message);
  }
}

listMyModels();