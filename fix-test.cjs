const fs = require('fs');
const content = fs.readFileSync('src/ui/agent-actions.ts', 'utf8');
const updated = content.replace(
  /const targetPath = join\(targetDir, `\$\{name\}\.md`\);/g,
  `const targetPath = join(targetDir, \`\${basename(name)}.md\`);`
);
const withImport = updated.replace(
  /import { join } from "node:path";/g,
  `import { basename, join } from "node:path";`
);
fs.writeFileSync('src/ui/agent-actions.ts', withImport);
console.log("Updated src/ui/agent-actions.ts");
