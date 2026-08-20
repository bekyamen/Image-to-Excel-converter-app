const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');


async function runOCR(imagePath) {
  // Read the uploaded image as base64
  const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  
  // Use the provided Gemini API Key
  const apiKey = process.env.GEMINI_API_KEY || 'AQ.Ab8RN6J5pOzS5gbYZYvbkzVhvmD9GVpzBGSgLGUhoccGTclEjA';
  
  // Initialize standard client, we pass API key per standard GenAI usage
  const client = new GoogleGenAI({ apiKey });

  const prompt = `
Extract the tabular data from this image and return ONLY valid JSON,
with no markdown formatting and no explanation.
The JSON must have the following structure:
{
  "headers": ["Col 1", "Col 2"],
  "rows": [
    ["Val 1", "Val 2"]
  ]
}
If no text is detected, return an empty array for headers and rows.
`;

  try {
    const interaction = await client.interactions.create({
        model: "gemini-3.7-flash",
        input: [
            { type: "text", text: prompt },
            {
                type: "image",
                data: imageBase64,
                mime_type: "image/jpeg"
            }
        ]
    });
    
    let rawText = interaction.output_text;
    if (!rawText) {
      return { headers: [], rows: [], warning: 'No output returned from Gemini.' };
    }

    let cleaned = rawText.replace(/(?:```json|```)/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in response");

    const table = JSON.parse(match[0]);

    return {
      headers: table.headers || [],
      rows: table.rows || [],
    };

  } catch (err) {
    console.error('Gemini OCR API Error:', err);
    throw new Error('Gemini OCR failed: ' + err.message);
  }
}

// Stub function for backwards compatibility with test scripts
function extractTable(words) {
  return { headers: [], rows: [] };
}

module.exports = { runOCR, extractTable };


