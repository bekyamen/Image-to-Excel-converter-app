require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');

async function test() {
  const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  console.log("Client initialized.", Object.keys(client));
}
test();
