const { basename } = require("node:path");

console.log(basename("../../../foo"));
console.log(basename("foo"));
