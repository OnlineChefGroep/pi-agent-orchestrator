/** @deprecated Use scripts/generate-showcase-media.mjs (real dist renderers). */
const fs = require('fs');

const header = {
  version: 2,
  width: 120,
  height: 36,
  timestamp: Math.floor(Date.now() / 1000),
  env: { TERM: "xterm-256color", SHELL: "/bin/bash" }
};

const CSI = "\x1b[";
const clear = `${CSI}2J${CSI}H`;
const bgHeader = `${CSI}48;5;236m`;
const fgAccent = `${CSI}38;5;208m`;
const reset = `${CSI}0m`;
const bold = `${CSI}1m`;
const dim = `${CSI}2m`;

const line1 = `${clear}${bgHeader} ${bold}PI AGENT ORCHESTRATOR${reset} ${dim}v0.11.0${reset} | ${fgAccent}Swarm Active${reset} | ${dim}CPU: 12% RAM: 450MB${reset}\r\n`;
const line2 = `${dim}─`.repeat(120) + `${reset}\r\n`;
const line3 = `  ${bold}AGENT ID${reset}         ${bold}TYPE${reset}             ${bold}STATUS${reset}      ${bold}TURNS${reset}    ${bold}TOKENS${reset}     ${bold}DURATION${reset}\r\n`;
const line4 = `  ${fgAccent}agent-a1b2${reset}       Explore          ${CSI}32mRunning${reset}     4/10     1.2k       0m 12s\r\n`;
const line5 = `  ${fgAccent}agent-c3d4${reset}       Plan             ${CSI}32mRunning${reset}     2/10     0.5k       0m 05s\r\n`;
const line6 = `  ${fgAccent}agent-e5f6${reset}       Analysis         ${dim}Idle${reset}        0/10     0.0k       0m 00s\r\n`;
const line7 = `  ${dim}agent-g7h8       Explore          Completed   10/10    4.5k       1m 20s${reset}\r\n`;
const footer = `\r\n\r\n${bgHeader} [j/k] Scroll  [t] Sort by Tokens  [w] Swarm  [K] Kill  [q] Quit ${reset}\r\n`;

const frames = [
  [0.1, "o", line1],
  [0.2, "o", line2],
  [0.3, "o", line3],
  [0.4, "o", line4],
  [0.5, "o", line5],
  [0.6, "o", line6],
  [0.7, "o", line7],
  [0.8, "o", footer],
  [1.0, "o", `${CSI}2;3H`],
  [2.0, "o", `${CSI}3;3H`],
  [3.0, "o", `${CSI}4;3H`]
];

const lines = [JSON.stringify(header)];
for (const f of frames) {
  lines.push(JSON.stringify(f));
}

fs.writeFileSync('/tmp/showcase.cast', lines.join('\n') + '\n');
console.log('Created /tmp/showcase.cast');
