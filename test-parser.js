const Parser = require('rss-parser');
try {
  const parser = new Parser();
  console.log("Success");
} catch(e) {
  console.error("Error:", e.message);
}
