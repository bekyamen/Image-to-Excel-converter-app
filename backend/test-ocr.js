const { runOCR } = require('./services/ocr');
const path = require('path');

async function test() {
  try {
    const table = await runOCR(path.join(__dirname, 'uploads/bc747ec5d979ef17c716355e97c2a1d8'));
    console.log('Headers:', table.headers);
    console.log('Num rows:', table.rows.length);
    console.log('Sample row (1st):', table.rows[0]);
  } catch(e) {
    console.error(e);
  }
}
test();
