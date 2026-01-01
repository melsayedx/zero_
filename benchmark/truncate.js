const { createClickHouseClient } = require('../src/infrastructure/database/clickhouse');

async function main() {
    const clickhouse = createClickHouseClient();
    try {
        await clickhouse.command({ query: 'TRUNCATE TABLE logs' });
        console.log('Truncated table logs');
    } catch (e) {
        console.error('Failed to truncate', e);
        process.exit(1);
    } finally {
        await clickhouse.close();
    }
}
main();
