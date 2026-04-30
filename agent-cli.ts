/**
 * AgentCLI - CLI wrapper for the Nova standalone agent
 */
import { StandaloneAgent } from './standalone-agent'
import { JSONLLogger } from './jsonl-logger'
import { LoopDetector } from './loop-detector'

export interface AgentCLIOptions {
    prompt: string
    model?: string
    maxIterations?: number
    debug?: boolean
    logFile?: string
    workspace?: string
    apiKey?: string
    apiBase?: string
}

export class AgentCLI {
    async run(options: AgentCLIOptions): Promise<void> {
        const {
            prompt,
            model = 'tencent/hy3-preview:free',
            maxIterations = 40,
            debug = false,
            logFile,
            workspace = process.cwd(),
            apiKey = process.env['NOVA_API_KEY'] || process.env['OPENAI_API_KEY'] || '',
            apiBase = process.env['NOVA_API_BASE'] || 'https://openrouter.ai/api/v1',
        } = options

        const isPuter = apiBase.includes('puter.com')
        if (!apiKey && !isPuter) {
            console.error('❌ No API key found. Set NOVA_API_KEY or OPENAI_API_KEY environment variable.')
            // Only exit if running as CLI, not when imported as a module
            if (require.main === module) process.exit(1)
            return
        }

        const agent = new StandaloneAgent(apiKey, apiBase, logFile)

        console.log(`🚀 Nova Agent starting...`)
        console.log(`📁 Workspace: ${workspace}`)
        console.log(`🤖 Model: ${model}`)
        console.log(`🔄 Max iterations: ${maxIterations}`)
        if (logFile) console.log(`📝 Log: ${logFile}`)
        console.log()

        const result = await agent.run({
            prompt,
            model,
            maxIterations,
            cwd: workspace,
            debug,
        })

        console.log()
        console.log('='.repeat(60))
        if (result.success) {
            console.log(`✅ Task completed in ${result.iterations} iterations`)
        } else {
            console.log(`❌ Task failed after ${result.iterations} iterations`)
            if (result.maxReached) console.log('⚠️  Max iterations reached')
            if (result.loopDetected) console.log('⚠️  Loop detected')
            if (result.error) console.log(`Error: ${result.error}`)
        }
        console.log('='.repeat(60))

        if (logFile) {
            console.log(`\n📊 Analyzing log...`)
            try {
                const analysis = JSONLLogger.analyzeLog(logFile)
                console.log(`Total iterations: ${analysis.totalIterations}`)
                console.log(`Successful actions: ${analysis.successfulActions}`)
                console.log(`Failed actions: ${analysis.failedActions}`)
                console.log(`Loop detected: ${analysis.loopDetected ? '⚠️ YES' : '✅ NO'}`)
                console.log(`Avg iteration time: ${analysis.avgIterationTime}s`)
                console.log(`Tool usage: ${JSON.stringify(analysis.toolUsage)}`)
            } catch {
                // Log analysis is optional
            }
        }

        process.exit(result.exitCode)
    }
}
