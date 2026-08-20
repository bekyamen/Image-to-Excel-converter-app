const { extractTable } = require('./services/ocr.js');

const mockWords = [
  // Header Row (slightly misaligned y-coordinates)
  { text: "Name", bbox: { x0: 10, y0: 10, x1: 50, y1: 30 } },
  { text: "Age", bbox: { x0: 100, y0: 12, x1: 130, y1: 32 } }, // skewed +2px
  { text: "Role", bbox: { x0: 200, y0: 8, x1: 240, y1: 28 } }, // skewed -2px

  { text: "Jane", bbox: { x0: 10, y0: 50, x1: 50, y1: 65 } }, // h: 15
  { text: "Smith", bbox: { x0: 12, y0: 70, x1: 55, y1: 85 } }, // h: 15
  
  // TALL word that overlaps both Jane and Smith
  { text: "25", bbox: { x0: 100, y0: 52, x1: 130, y1: 82 } }, // h: 30
  
  // Role has a TALL word that spans the entire row height
  { text: "Lead", bbox: { x0: 200, y0: 52, x1: 240, y1: 68 } },
  { text: "Dev", bbox: { x0: 200, y0: 70, x1: 240, y1: 86 } },
];

console.log("Extracting table from mock words...");
const result = extractTable(mockWords);

console.log("\nHeaders:", result.headers);
console.log("Rows:");
result.rows.forEach((r, i) => console.log(`Row ${i + 1}:`, r));
