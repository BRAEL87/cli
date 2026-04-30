/**
 * Test command - Run agent tests
 */
import { Command } from 'commander'
import { TestRunner } from '../test-runner'
import { join } from 'path'
import { tmpdir } from 'os'

export function registerTestCommand(program: Command): void {
    program
        .command('test')
        .description('Run agent tests (Level 1, 2, and optionally 3)')
        .option('-m, --model <model>', 'Model to use', 'gpt-4o')
        .option('-l, --level <level>', 'Test level (1, 2, or 3)', '2')
        .option('-s, --swe-bench <path>', 'Path to SWE-bench tasks JSONL file')
        .option('-w, --work-dir <dir>', 'Working directory for tests', join(tmpdir(), 'nova-tests'))
        .action(async (options) => {
            const runner = new TestRunner(options.workDir, options.model)

            console.log(`🧪 Running Level ${options.level} tests with ${options.model}\n`)

            try {
                if (options.level === '1') {
                    const result = await runner.runLevel1Test()
                    printResult(result)
                } else if (options.level === '2') {
                    const level1 = await runner.runLevel1Test()
                    printResult(level1)
                    
                    const level2 = await runner.runLevel2Tests()
                    level2.forEach(printResult)
                } else if (options.level === '3') {
                    if (!options.sweBench) {
                        console.error('❌ Error: --swe-bench path required for Level 3 tests')
                        process.exit(1)
                    }
                    await runner.runAll(options.sweBench)
                } else {
                    console.error('❌ Error: Invalid level. Use 1, 2, or 3')
                    process.exit(1)
                }
            } catch (error: any) {
                console.error(`❌ Test failed: ${error.message}`)
                process.exit(1)
            }
        })
}

function printResult(result: any): void {
    const icon = result.passed ? '✅' : '❌'
    const duration = (result.duration / 1000).toFixed(1)
    console.log(`${icon} ${result.name}`)
    console.log(`   Iterations: ${result.iterations}/${result.maxIterations}`)
    console.log(`   Duration: ${duration}s`)
    if (result.error) {
        console.log(`   Error: ${result.error}`)
    }
    console.log()
}
