const { basename } = require("path");

function sanitizeName(name) {
  return basename(name);
}

console.log(sanitizeName("../foo"));
console.log(sanitizeName("bar"));
console.log(sanitizeName("dir/baz"));
