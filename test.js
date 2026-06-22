console.log("Step 1: Script started");
const http = require('http');
console.log("Step 2: http module loaded");

http.createServer((req, res) => {
  res.end('Hello World');
}).listen(3000, () => {
  console.log("Step 3: Test server running at http://localhost:3000");
});