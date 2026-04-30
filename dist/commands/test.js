"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerTestCommand = registerTestCommand;
const test_runner_1 = require("../test-runner");
const path_1 = require("path");
const os_1 = require("os");
function registerTestCommand(program) {
    program
        .command('test')
        .description('Run agent tests (Level 1, 2, and optionally 3)')
        .option('-m, --model <model>', 'Model to use', 'gpt-4o')
        .option('-l, --level <level>', 'Test level (1, 2, or 3)', '2')
        .option('-s, --swe-bench <path>', 'Path to SWE-bench tasks JSONL file')
        .option('-w, --work-dir <dir>', 'Working directory for tests', (0, path_1.join)((0, os_1.tmpdir)(), 'nova-tests'))
        .action(async (options) => {
        const runner = new test_runner_1.TestRunner(options.workDir, options.model);
        console.log(`🧪 Running Level ${options.level} tests with ${options.model}\n`);
        try {
            if (options.level === '1') {
                const result = await runner.runLevel1Test();
                printResult(result);
            }
            else if (options.level === '2') {
                const level1 = await runner.runLevel1Test();
                printResult(level1);
                const level2 = await runner.runLevel2Tests();
                level2.forEach(printResult);
            }
            else if (options.level === '3') {
                if (!options.sweBench) {
                    console.error('❌ Error: --swe-bench path required for Level 3 tests');
                    process.exit(1);
                }
                await runner.runAll(options.sweBench);
            }
            else {
                console.error('❌ Error: Invalid level. Use 1, 2, or 3');
                process.exit(1);
            }
        }
        catch (error) {
            console.error(`❌ Test failed: ${error.message}`);
            process.exit(1);
        }
    });
}
function printResult(result) {
    const icon = result.passed ? '✅' : '❌';
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`${icon} ${result.name}`);
    console.log(`   Iterations: ${result.iterations}/${result.maxIterations}`);
    console.log(`   Duration: ${duration}s`);
    if (result.error) {
        console.log(`   Error: ${result.error}`);
    }
    console.log();
}
//# sourceMappingURL=test.js.map