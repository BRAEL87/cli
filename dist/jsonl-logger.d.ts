/**
 * JSONL Logger for Agent Iterations
 * Outputs structured logs for benchmarking analysis
 */
import { IterationLog, AgentResult } from './types';
export declare class JSONLLogger {
    private logPath;
    private stream;
    constructor(logPath?: string);
    /**
     * Log a single iteration
     */
    logIteration(log: IterationLog): void;
    /**
     * Log agent start
     */
    logStart(prompt: string, model: string, maxIterations: number): void;
    /**
     * Log agent completion
     */
    logComplete(result: AgentResult): void;
    /**
     * Log loop detection
     */
    logLoopDetected(iteration: number, reason: string): void;
    /**
     * Log error
     */
    logError(error: string, iteration?: number): void;
    /**
     * Close log stream
     */
    close(): Promise<void>;
    /**
     * Read and parse JSONL log file
     */
    static readLog(logPath: string): any[];
    /**
     * Analyze log file for patterns
     */
    static analyzeLog(logPath: string): {
        totalIterations: number;
        successfulActions: number;
        failedActions: number;
        toolUsage: Record<string, number>;
        loopDetected: boolean;
        avgIterationTime: number;
    };
    /**
     * Generate summary report from log
     */
    static generateReport(logPath: string): string;
}
//# sourceMappingURL=jsonl-logger.d.ts.map