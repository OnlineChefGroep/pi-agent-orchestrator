const fs = require('fs');
let content = fs.readFileSync('test/custom-agents.test.ts', 'utf-8');

const search = `expect(unknownToolsEvents).toEqual([{ name: "custom-tools", tools: ["my_custom_tool"] }]);`;
const replace = `expect(unknownToolsEvents).toEqual([{ name: "custom-tools", tools: ["my_custom_tool"] }]);`;
// Wait, looking at the error:
// Expected: [ { name: 'custom-tools', tools: ['my_custom_tool'] } ]
// Received: [ { name: 'custom-tools', tools: ['[REDACTED_TOOL_NAME]'] } ]
// Oh, that means I patched src/custom-agents.ts and it's returning '[REDACTED_TOOL_NAME]' somewhere? Wait, I applied patch_v3!
