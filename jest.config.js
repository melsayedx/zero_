module.exports = {
    testEnvironment: 'node',
    verbose: true,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    testMatch: ['**/tests/**/*.test.js', '**/*.test.js'],
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/app.js',
        '!src/infrastructure/config/**'
    ]
};
