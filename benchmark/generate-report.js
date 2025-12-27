const fs = require('fs');
const path = require('path');

const RESULTS_DIR = path.join(__dirname, 'results');
const OUTPUT_FILE = path.join(RESULTS_DIR, 'comparison.md');

function formatNumber(num) {
    return num ? num.toLocaleString('en-US', { maximumFractionDigits: 2 }) : 'N/A';
}

function generateReport() {
    console.log('Generating report from:', RESULTS_DIR);

    if (!fs.existsSync(RESULTS_DIR)) {
        console.error('Results directory not found.');
        return;
    }

    const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json'));
    const results = [];

    for (const file of files) {
        try {
            const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, file), 'utf8'));
            results.push(data);
        } catch (e) {
            console.error(`Error reading ${file}:`, e.message);
        }
    }

    if (results.length === 0) {
        console.log('No results found.');
        return;
    }

    // Sort by stage name order usually (or by file name if they have 01, 02 prefixes)
    results.sort((a, b) => a.stage.localeCompare(b.stage));

    console.log(`Found ${results.length} result files.`);

    let md = '# Performance Benchmark Results\n\n';
    md += `**Date:** ${new Date().toISOString()}\n\n`;

    md += '## Throughput & Latency Comparison\n\n';
    md += '| Stage | Throughput (req/s) | Avg Latency (ms) | P99 Latency (ms) | Improvement (Throughput) |\n';
    md += '|-------|-------------------:|-----------------:|-----------------:|-------------------------:|\n';

    const baseline = results.find(r => r.stage.includes('baseline')) || results[0];
    const baselineThroughput = baseline.throughput.requestsPerSec;

    for (const r of results) {
        const tput = r.throughput.requestsPerSec;
        const avg = r.latency.avg;
        const p99 = r.latency.p99;

        // Calculate improvement factor vs baseline
        let improvement = '1.0x (Baseline)';
        if (r !== baseline) {
            const factor = tput / baselineThroughput;
            improvement = `**${factor.toFixed(1)}x**`;
            if (factor > 1) improvement += ' 🚀';
        } else {
            improvement = '1.0x (Baseline)';
        }

        md += `| **${r.stage}** | ${formatNumber(tput)} | ${formatNumber(avg)} | ${formatNumber(p99)} | ${improvement} |\n`;
    }

    md += '\n## System Resources\n\n';
    md += '| Stage | Heap Usage (MB) | Event Loop Lag (ms) |\n';
    md += '|-------|----------------:|--------------------:|\n';

    for (const r of results) {
        md += `| ${r.stage} | ${formatNumber(r.system.avgMemoryHeapMB)} | ${formatNumber(r.system.avgEventLoopLagMs)} |\n`;
    }

    md += '\n## Detailed metrics\n\n';
    md += '```json\n';
    // Add a condensed summary of the best stage
    const bestStage = results.reduce((prev, current) => (prev.throughput.requestsPerSec > current.throughput.requestsPerSec) ? prev : current);
    md += JSON.stringify({
        bestPerformingStage: bestStage.stage,
        maxThroughput: bestStage.throughput.requestsPerSec,
        lowestLatencyP99: bestStage.latency.p99
    }, null, 2);
    md += '\n```\n';

    fs.writeFileSync(OUTPUT_FILE, md);
    console.log(`Report saved to: ${OUTPUT_FILE}`);
}

generateReport();
