const XLSX = require('xlsx');
const PDFDocument = require('pdfkit-table');

function extractValues(rows) {
  return rows.map(row => 
    row.map(cell => (typeof cell === 'object' && cell !== null ? cell.value : cell))
  );
}

/**
 * Converts { headers: [...], rows: [[...]] } into an .xlsx buffer.
 */
function generateExcelBuffer({ headers, rows }) {
  const cleanRows = extractValues(rows);
  const aoa = [headers, ...cleanRows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  // Process merges for Excel
  const merges = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const cell = rows[r][c];
      if (typeof cell === 'object' && cell !== null) {
        const rs = Math.max(1, cell.rowspan || 1);
        const cs = Math.max(1, cell.colspan || 1);
        if (rs > 1 || cs > 1) {
          merges.push({
            s: { r: r + 1, c: c }, // r + 1 because headers occupy row 0
            e: { r: r + rs, c: c + cs - 1 }
          });
        }
      }
    }
  }

  if (merges.length > 0) {
    worksheet['!merges'] = merges;
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

function generateCSVBuffer({ headers, rows }) {
  const cleanRows = extractValues(rows);
  const aoa = [headers, ...cleanRows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const csvStr = XLSX.utils.sheet_to_csv(worksheet);
  return Buffer.from(csvStr, 'utf8');
}

async function generatePDFBuffer({ headers, rows }) {
  return new Promise((resolve, reject) => {
    try {
      const cleanRows = extractValues(rows);
      const doc = new PDFDocument({ margin: 30, size: 'A4' });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', reject);

      const table = {
        headers: headers.map(String),
        rows: cleanRows.map(row => row.map(String))
      };

      doc.table(table, {
        prepareHeader: () => doc.font("Helvetica-Bold").fontSize(10),
        prepareRow: () => doc.font("Helvetica").fontSize(10)
      }).then(() => {
        doc.end();
      }).catch(err => {
        reject(err);
      });
      
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { generateExcelBuffer, generateCSVBuffer, generatePDFBuffer };
