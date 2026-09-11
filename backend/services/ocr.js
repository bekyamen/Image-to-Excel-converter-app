const path = require('path');
const fs = require('fs');
const { GoogleGenAI } = require('@google/genai');







async function runOCR(imagePath) {
  // Read the uploaded image as base64
  const imageBase64 = fs.readFileSync(imagePath, { encoding: 'base64' });
  
  // Use the provided Gemini API Key
  const apiKey = process.env.GEMINI_API_KEY ;
  

  // Initialize standard client, we pass API key per standard GenAI usage
  const client = new GoogleGenAI({ apiKey });


  const prompt = `
Extract the tabular data from this image and return ONLY valid JSON,
with no markdown formatting and no explanation.
The JSON must have the following structure:
{
  "headerRowCount": 1,
  "headers": ["Col 1", "Col 2"],
  "rows": [
    [
      { 
        "value": "Val 1", 
        "confident": true,
        "isHandwritten": false,
        "rowspan": 1,
        "colspan": 1,
        "boundingBox": { "ymin": 100, "xmin": 50, "ymax": 150, "xmax": 200 }
      },
      { "value": "Val 2", "confident": false }
    ]
  ]
}

If a cell's text is blurry, occluded, or difficult to read, set "confident" to false.
If a cell contains handwritten text, set "isHandwritten" to true and "confident" to false.
For merged cells, specify "rowspan" and "colspan" appropriately for the top-left cell of the merge.
The boundingBox should use coordinates on a 0-1000 scale representing the cell's location in the image.
If no text is detected, return an empty array for headers and rows.
`;


  try {
    const response = await client.models.generateContent({
        model: "gemini-3.6-flash",
        contents: [
            { role: "user", parts: [
                { text: prompt },
                { inlineData: { data: imageBase64, mimeType: "image/jpeg" } }
            ]}
        ]
    });
    
    let rawText = response.text;
    if (!rawText) {
      return { headers: [], rows: [], warning: 'No output returned from Gemini.' };
    }

    let cleaned = rawText.replace(/(?:```json|```)/g, "").trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON object found in response");

    const table = JSON.parse(match[0]);
   
    return {
      headerRowCount: table.headerRowCount || 1,
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


