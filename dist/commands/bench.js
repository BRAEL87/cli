"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerBenchCommand = registerBenchCommand;
const swe_bench_adapter_1 = require("../swe-bench-adapter");
const path_1 = require("path");
const os_1 = require("os");
function registerBenchCommand(program) {
    program
        .command('bench')
        .description('Run SWE-bench evaluation')
        .requiredOption('-t, --tasks <path>', 'Path to SWE-bench tasks JSONL file')
        .requiredOption('-o, --output <path>', 'Output path for predictions JSONL')
        .option('-m, --model <model>', 'Model to use', 'gpt-4o')
        .option('-i, --max-iterations <number>', 'Max iterations per task', '40')
        .option('-w, --max-workers <number>', 'Max parallel workers', '1')
        .option('-l, --limit <number>', 'Limit number of tasks (for testing)')
        .option('--work-dir <dir>', 'Working directory', (0, path_1.join)((0, os_1.tmpdir)(), 'nova-swe-bench'))
        .option('--log <path>', 'Log file path', 'swe-bench.jsonl')
        .action(async (options) => {
        console.log('🏆 Running SWE-bench Evaluation\n');
        console.log(`Model: ${options.model}`);
        console.log(`Max iterations: ${options.maxIterations}`);
        console.log(`Max workers: ${options.maxWorkers}`);
        console.log(`Tasks file: ${options.tasks}`);
        console.log(`Output file: ${options.output}\n`);
        try {
            // Load tasks
            const allTasks = await swe_bench_adapter_1.SWEBenchAdapter.loadTasks(options.tasks);
            const tasks = options.limit
                ? allTasks.slice(0, parseInt(options.limit))
                : allTasks;
            console.log(`Loaded ${tasks.length} tasks\n`);
            // Create adapter
            const adapter = new swe_bench_adapter_1.SWEBenchAdapter(options.workDir, options.log);
            // Run evaluation
            const startTime = Date.now();
            const predictions = await adapter.runBatch(tasks, options.model, parseInt(options.maxIterations), parseInt(options.maxWorkers));
            // Save predictions
            await adapter.savePredictions(predictions, options.output);
            // Calculate stats
            const duration = (Date.now() - startTime) / 1000;
            const successful = predictions.filter(p => p.success).length;
            const successRate = (successful / predictions.length) * 100;
            const avgIterations = predictions.reduce((sum, p) => sum + p.iterations, 0) / predictions.length;
            console.log('\n' + '='.repeat(60));
            console.log('📊 Results');
            console.log('='.repeat(60));
            console.log(`Total tasks: ${predictions.length}`);
            console.log(`Successful: ${successful} (${successRate.toFixed(1)}%)`);
            console.log(`Failed: ${predictions.length - successful}`);
            console.log(`Avg iterations: ${avgIterations.toFixed(1)}`);
            console.log(`Duration: ${duration.toFixed(1)}s`);
            console.log(`Predictions saved to: ${options.output}`);
            console.log('='.repeat(60));
            // Interpretation
            if (successRate >= 35) {
                console.log('\n🎉 SOTA tier! Beats Cursor agent.');
            }
            else if (successRate >= 25) {
                console.log('\n✅ Cursor tier! Production ready.');
            }
            else if (successRate >= 15) {
                console.log('\n⚠️  Weak agent. Consider improvements.');
            }
            else {
                console.log('\n❌ Agent needs significant work.');
            }
        }
        catch (error) {
            console.error(`❌ Benchmark failed: ${error.message}`);
            process.exit(1);
        }
    });
}
//# sourceMappingURL=bench.js.map