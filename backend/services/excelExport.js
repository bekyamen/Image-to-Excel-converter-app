const XLSX = require('xlsx');

/**
 * Converts { headers: [...], rows: [[...]] } into an .xlsx buffer.
 */
function generateExcelBuffer({ headers, rows }) {
  const aoa = [headers, ...rows];
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Extracted Data');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generateExcelBuffer };
