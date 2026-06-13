const { join, resolve, basename } = require('path');

const name = "../../../etc/passwd";
const targetDir = "/home/user/.pi/agents";

const safeName = basename(name);
const targetPath = join(targetDir, `${safeName}.md`);
console.log(targetPath);
