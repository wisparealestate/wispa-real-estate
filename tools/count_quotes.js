const fs = require('fs');
const s = fs.readFileSync('src/script.js','utf8');
const backticks = (s.match(/`/g)||[]).length;
const singles = (s.match(/'/g)||[]).length;
const doubles = (s.match(/"/g)||[]).length;
console.log('backticks', backticks, 'singleQuotes', singles, 'doubleQuotes', doubles);
