const fs = require('fs');
const path = require('path');

const [file] = process.argv.slice(2);

if (!file || !fs.existsSync(file)) {
    console.log('No file');
    process.exit(0);
}

const content = fs.readFileSync(file, 'utf8');
const lines = content.trim().split('\n');
// Header: Timestamp,CPU_Percent,Memory_KB
const header = lines.shift();

let totalCpu = 0;
let maxCpu = 0;
let totalMem = 0;
let maxMem = 0;
let count = 0;

for (const line of lines) {
    if (!line) continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;

    const cpu = parseFloat(parts[1]);
    const mem = parseInt(parts[2], 10) / 1024; // Convert KB to MB

    totalCpu += cpu;
    maxCpu = Math.max(maxCpu, cpu);

    totalMem += mem;
    maxMem = Math.max(maxMem, mem);

    count++;
}

console.log(JSON.stringify({
    avgCpu: (totalCpu / count).toFixed(2),
    maxCpu: maxCpu.toFixed(2),
    avgMem: (totalMem / count).toFixed(2),
    maxMem: maxMem.toFixed(2)
}));
