/**
 * JSONL Logger for Agent Iterations
 * Outputs structured logs for benchmarking analysis
 */

import * as fs from 'fs'
import * as path from 'path'
import { IterationLog, AgentResult } from './types'

export class JSONLLogger {
    private logPath: string | null = null
    private stream: fs.WriteStream | null = null

    constructor(logPath?: string) {
        if (logPath) {
            this.logPath = path.resolve(logPath)
            this.stream = fs.createWriteStream(this.logPath, { flags: 'a' })
        }
    }

    /**
     * Log a single iteration
     */
    public logIteration(log: IterationLog): void {
        if (!this.stream) return

        const entry = {
            type: 'iteration',
            ...log,
            timestamp: new Date(log.timestamp).toISOString()
        }

        this.stream.write(JSON.stringify(entry) + '\n')
    }

    /**
     * Log agent start
     */
    public logStart(prompt: string, model: string, maxIterations: number): void {
        if (!this.stream) return

        const entry = {
            type: 'start',
            timestamp: new Date().toISOString(),
            prompt,
            model,
            maxIterations
        }

        this.stream.write(JSON.stringify(entry) + '\n')
    }

    /**
     * Log agent completion
     */
    public logComplete(result: AgentResult): void {
        if (!this.stream) return

        const entry = {
            type: 'complete',
            timestamp: new Date().toISOString(),
            ...result
        }

        this.stream.write(JSON.stringify(entry) + '\n')
    }

    /**
     * Log loop detection
     */
    public logLoopDetected(iteration: number, reason: string): void {
        if (!this.stream) return

        const entry = {
            type: 'loop_detected',
            timestamp: new Date().toISOString(),
            iteration,
            reason
        }

        this.stream.write(JSON.stringify(entry) + '\n')
    }

    /**
     * Log error
     */
    public logError(error: string, iteration?: number): void {
        if (!this.stream) return

        const entry = {
            type: 'error',
            timestamp: new Date().toISOString(),
            error,
            iteration
        }

        this.stream.write(JSON.stringify(entry) + '\n')
    }

    /**
     * Close log stream
     */
    public close(): Promise<void> {
        return new Promise((resolve) => {
            if (this.stream) {
                this.stream.end(() => resolve())
            } else {
                resolve()
            }
        })
    }

    /**
     * Read and parse JSONL log file
     */
    public static readLog(logPath: string): any[] {
        const content = fs.readFileSync(logPath, 'utf-8')
        return content
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
    }

    /**
     * Analyze log file for patterns
     */
    public static analyzeLog(logPath: string): {
        totalIterations: number
        successfulActions: number
        failedActions: number
        toolUsage: Record<string, number>
        loopDetected: boolean
        avgIterationTime: number
    } {
        const logs = this.readLog(logPath)
        const iterations = logs.filter(l => l.type === 'iteration')

        const toolUsage: Record<string, number> = {}
        let successfulActions = 0
        let failedActions = 0
        let loopDetected = false

        iterations.forEach((iter: any) => {
            const tool = iter.action?.tool
            if (tool) {
                toolUsage[tool] = (toolUsage[tool] || 0) + 1
            }
            if (iter.success) successfulActions++
            else failedActions++
        })

        if (logs.some(l => l.type === 'loop_detected')) {
            loopDetected = true
        }

        // Calculate avg iteration time
        let totalTime = 0
        for (let i = 1; i < iterations.length; i++) {
            const prev = new Date(iterations[i - 1].timestamp).getTime()
            const curr = new Date(iterations[i].timestamp).getTime()
            totalTime += curr - prev
        }
        const avgIterationTime = iterations.length > 1 ? totalTime / (iterations.length - 1) : 0

        return {
            totalIterations: iterations.length,
            successfulActions,
            failedActions,
            toolUsage,
            loopDetected,
            avgIterationTime: Math.round(avgIterationTime / 1000) // seconds
        }
    }

    /**
     * Generate summary report from log
     */
    public static generateReport(logPath: string): string {
        const analysis = this.analyzeLog(logPath)
        const logs = this.readLog(logPath)
        const startLog = logs.find(l => l.type === 'start')
        const completeLog = logs.find(l => l.type === 'complete')

        let report = '# Agent Execution Report\n\n'
        
        if (startLog) {
            report += `**Prompt:** ${startLog.prompt}\n`
            report += `**Model:** ${startLog.model}\n`
            report += `**Max Iterations:** ${startLog.maxIterations}\n\n`
        }

        report += '## Results\n\n'
        report += `- **Total Iterations:** ${analysis.totalIterations}\n`
        report += `- **Successful Actions:** ${analysis.successfulActions}\n`
        report += `- **Failed Actions:** ${analysis.failedActions}\n`
        report += `- **Loop Detected:** ${analysis.loopDetected ? '⚠️ YES' : '✅ NO'}\n`
        report += `- **Avg Iteration Time:** ${analysis.avgIterationTime}s\n\n`

        if (completeLog) {
            report += `- **Exit Code:** ${completeLog.exitCode}\n`
            report += `- **Max Reached:** ${completeLog.maxReached ? '⚠️ YES' : '✅ NO'}\n\n`
        }

        report += '## Tool Usage\n\n'
        Object.entries(analysis.toolUsage)
            .sort((a, b) => b[1] - a[1])
            .forEach(([tool, count]) => {
                report += `- **${tool}:** ${count} times\n`
            })

        return report
    }
}
