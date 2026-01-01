const fs = require('fs');
const path = require('path');

function parseStats(filePath) {
    if (!fs.existsSync(filePath)) return { avgCpu: 'N/A', maxCpu: 'N/A', avgMem: 'N/A', maxMem: 'N/A' };

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n');
    lines.shift(); // Header

    let totalCpu = 0, maxCpu = 0;
    let totalMem = 0, maxMem = 0;
    let count = 0;

    for (const line of lines) {
        if (!line) continue;
        const [ts, cpuStr, memStr] = line.split(',');
        const cpu = parseFloat(cpuStr);
        const mem = parseInt(memStr, 10) / 1024; // MB

        totalCpu += cpu;
        maxCpu = Math.max(maxCpu, cpu);
        totalMem += mem;
        maxMem = Math.max(maxMem, mem);
        count++;
    }

    return {
        avgCpu: (count ? totalCpu / count : 0).toFixed(2),
        maxCpu: maxCpu.toFixed(2),
        avgMem: (count ? totalMem / count : 0).toFixed(2),
        maxMem: maxMem.toFixed(2)
    };
}

const nodeStats = parseStats('benchmark_results/node_stats.csv');
const cppStats = parseStats('benchmark_results/cpp_stats.csv');

console.log('| Metric | Node.js (4 Workers) | C++ (Native) |');
console.log('| :--- | :--- | :--- |');
console.log(`| **Avg CPU** | ${nodeStats.avgCpu}% | ${cppStats.avgCpu}% |`);
console.log(`| **Peak CPU** | ${nodeStats.maxCpu}% | ${cppStats.maxCpu}% |`);
console.log(`| **Avg Memory** | ${nodeStats.avgMem} MB | ${cppStats.avgMem} MB |`);
console.log(`| **Peak Memory** | ${nodeStats.maxMem} MB | ${cppStats.maxMem} MB |`);
