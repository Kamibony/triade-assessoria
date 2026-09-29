const { PDFParse } = require('pdf-parse');

async function runTest() {
  console.log("PDFParse is:", typeof PDFParse);
  const parser = new PDFParse(new Uint8Array(10), {max: 5});
  console.log("parser is:", typeof parser);
  console.log("keys:", Object.keys(parser));
}

runTest().catch(console.error);
