"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestRunner = void 0;
/**
 * Test Runner - Runs Level 1, 2, and 3 tests for Nova agent
 */
const standalone_agent_1 = require("./standalone-agent");
const swe_bench_adapter_1 = require("./swe-bench-adapter");
const fs_1 = require("fs");
const path_1 = require("path");
class TestRunner {
    constructor(workDir, model) {
        this.workDir = workDir;
        this.model = model;
    }
    /**
     * Level 1: Basic loop test
     */
    async runLevel1Test() {
        const testName = 'Level 1: Basic Loop';
        const startTime = Date.now();
        const maxIterations = 5;
        try {
            const testDir = (0, path_1.join)(this.workDir, 'level1-test');
            await fs_1.promises.mkdir(testDir, { recursive: true });
            const apiKey = process.env['NOVA_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
            const apiBase = process.env['NOVA_API_BASE'] || 'http://localhost:5000/api';
            const agent = new standalone_agent_1.StandaloneAgent(apiKey, apiBase, (0, path_1.join)(this.workDir, 'level1.jsonl'));
            const prompt = `Create a folder named 'test', add a file 'a.txt' with content 'hello', and commit it to git.

Steps:
1. Create folder 'test'
2. Create file 'test/a.txt' with 'hello'
3. Initialize git if needed
4. Add and commit the file

Use bash commands to accomplish this.`;
            const result = await agent.run({
                prompt,
                model: this.model,
                maxIterations,
                cwd: testDir,
            });
            // Verify results
            const fileExists = await fs_1.promises.access((0, path_1.join)(testDir, 'test', 'a.txt')).then(() => true).catch(() => false);
            const content = fileExists ? await fs_1.promises.readFile((0, path_1.join)(testDir, 'test', 'a.txt'), 'utf-8') : '';
            const passed = result.success &&
                fileExists &&
                content.includes('hello') &&
                result.iterations <= maxIterations;
            return {
                name: testName,
                passed,
                iterations: result.iterations,
                maxIterations,
                duration: Date.now() - startTime,
                error: passed ? undefined : 'Failed to create file or commit'
            };
        }
        catch (error) {
            return {
                name: testName,
                passed: false,
                iterations: 0,
                maxIterations,
                duration: Date.now() - startTime,
                error: error.message
            };
        }
    }
    /**
     * Level 2: Integration tests on real tasks
     */
    async runLevel2Tests() {
        const tests = [
            {
                name: 'Easy: Add /health endpoint',
                prompt: 'Add a /health endpoint to this Express server that returns {status: "ok"}. Create the file if it doesn\'t exist.',
                maxIterations: 10,
                verify: async (dir) => {
                    // Check if health endpoint was added
                    const files = await this.findFiles(dir, /\.(js|ts)$/);
                    for (const file of files) {
                        const content = await fs_1.promises.readFile(file, 'utf-8');
                        if (content.includes('/health') && content.includes('status')) {
                            return true;
                        }
                    }
                    return false;
                }
            },
            {
                name: 'Medium: Convert JS to TS',
                prompt: 'Convert the main JavaScript file to TypeScript. Add proper type annotations and fix any type errors.',
                maxIterations: 15,
                verify: async (dir) => {
                    const tsFiles = await this.findFiles(dir, /\.ts$/);
                    return tsFiles.length > 0;
                }
            },
            {
                name: 'Hard: Add Jest tests',
                prompt: 'Add Jest tests for all utility functions. Aim for 80% code coverage. Create test files and configure Jest if needed.',
                maxIterations: 35,
                verify: async (dir) => {
                    const testFiles = await this.findFiles(dir, /\.(test|spec)\.(js|ts)$/);
                    return testFiles.length > 0;
                }
            }
        ];
        const results = [];
        for (let i = 0; i < tests.length; i++) {
            const test = tests[i];
            const startTime = Date.now();
            const testDir = (0, path_1.join)(this.workDir, `level2-${test.name.replace(/[^a-z0-9]/gi, '-')}`);
            try {
                await fs_1.promises.mkdir(testDir, { recursive: true });
                const apiKey = process.env['NOVA_API_KEY'] || process.env['OPENAI_API_KEY'] || '';
                const apiBase = process.env['NOVA_API_BASE'] || 'http://localhost:5000/api';
                const agent = new standalone_agent_1.StandaloneAgent(apiKey, apiBase, (0, path_1.join)(this.workDir, `level2-${i}.jsonl`));
                const result = await agent.run({
                    prompt: test.prompt,
                    model: this.model,
                    maxIterations: test.maxIterations,
                    cwd: testDir,
                });
                const verified = await test.verify(testDir);
                results.push({
                    name: test.name,
                    passed: result.success && verified && result.iterations < test.maxIterations,
                    iterations: result.iterations,
                    maxIterations: test.maxIterations,
                    duration: Date.now() - startTime,
                    error: verified ? undefined : 'Verification failed'
                });
            }
            catch (error) {
                results.push({
                    name: test.name,
                    passed: false,
                    iterations: 0,
                    maxIterations: test.maxIterations,
                    duration: Date.now() - startTime,
                    error: error.message
                });
            }
        }
        return results;
    }
    /**
     * Level 3: SWE-bench Lite test
     */
    async runLevel3Test(tasksPath, maxTasks = 10) {
        const testName = 'Level 3: SWE-bench Lite';
        const startTime = Date.now();
        try {
            // Load tasks
            const allTasks = await swe_bench_adapter_1.SWEBenchAdapter.loadTasks(tasksPath);
            const tasks = allTasks.slice(0, maxTasks);
            // Run tasks
            const adapter = new swe_bench_adapter_1.SWEBenchAdapter((0, path_1.join)(this.workDir, 'swe-bench'), (0, path_1.join)(this.workDir, 'swe-bench-log.jsonl'));
            const predictions = await adapter.runBatch(tasks, this.model, 40, 1);
            // Calculate success rate
            const passed = predictions.filter(p => p.success).length;
            const total = predictions.length;
            const successRate = (passed / total) * 100;
            // Save predictions
            await adapter.savePredictions(predictions, (0, path_1.join)(this.workDir, 'swe-bench-predictions.jsonl'));
            return {
                name: `${testName} (${passed}/${total} = ${successRate.toFixed(1)}%)`,
                passed: successRate >= 20, // 20% is minimum acceptable
                iterations: Math.round(predictions.reduce((sum, p) => sum + p.iterations, 0) / total),
                maxIterations: 40,
                duration: Date.now() - startTime,
                error: successRate < 20 ? `Success rate ${successRate.toFixed(1)}% below 20% threshold` : undefined
            };
        }
        catch (error) {
            return {
                name: testName,
                passed: false,
                iterations: 0,
                maxIterations: 40,
                duration: Date.now() - startTime,
                error: error.message
            };
        }
    }
    /**
     * Run all tests
     */
    async runAll(sweBenchTasksPath) {
        console.log('🚀 Nova Agent Test Suite\n');
        // Level 1
        console.log('Running Level 1: Basic Loop Test...');
        const level1 = await this.runLevel1Test();
        this.printResult(level1);
        // Level 2
        console.log('\nRunning Level 2: Integration Tests...');
        const level2 = await this.runLevel2Tests();
        level2.forEach(r => this.printResult(r));
        // Level 3 (optional)
        if (sweBenchTasksPath) {
            console.log('\nRunning Level 3: SWE-bench Lite...');
            const level3 = await this.runLevel3Test(sweBenchTasksPath, 10);
            this.printResult(level3);
        }
        // Summary
        const allResults = [level1, ...level2];
        const passed = allResults.filter(r => r.passed).length;
        const total = allResults.length;
        console.log('\n' + '='.repeat(60));
        console.log(`📊 Summary: ${passed}/${total} tests passed`);
        console.log('='.repeat(60));
        if (passed === total) {
            console.log('✅ All tests passed! Agent is ready for SWE-bench.');
        }
        else if (passed >= total * 0.8) {
            console.log('⚠️  Most tests passed. Fix failing tests before SWE-bench.');
        }
        else {
            console.log('❌ Many tests failed. Agent needs improvement.');
        }
    }
    /**
     * Print test result
     */
    printResult(result) {
        const icon = result.passed ? '✅' : '❌';
        const duration = (result.duration / 1000).toFixed(1);
        console.log(`${icon} ${result.name}`);
        console.log(`   Iterations: ${result.iterations}/${result.maxIterations}`);
        console.log(`   Duration: ${duration}s`);
        if (result.error) {
            console.log(`   Error: ${result.error}`);
        }
    }
    /**
     * Find files matching pattern
     */
    async findFiles(dir, pattern) {
        const results = [];
        try {
            const entries = await fs_1.promises.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = (0, path_1.join)(dir, entry.name);
                if (entry.isDirectory() && !entry.name.startsWith('.')) {
                    results.push(...await this.findFiles(fullPath, pattern));
                }
                else if (entry.isFile() && pattern.test(entry.name)) {
                    results.push(fullPath);
                }
            }
        }
        catch {
            // Ignore errors
        }
        return results;
    }
}
exports.TestRunner = TestRunner;
//# sourceMappingURL=test-runner.js.map