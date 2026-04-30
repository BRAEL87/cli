"use strict";
/**
 * JSONL Logger for Agent Iterations
 * Outputs structured logs for benchmarking analysis
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.JSONLLogger = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class JSONLLogger {
    constructor(logPath) {
        this.logPath = null;
        this.stream = null;
        if (logPath) {
            this.logPath = path.resolve(logPath);
            this.stream = fs.createWriteStream(this.logPath, { flags: 'a' });
        }
    }
    /**
     * Log a single iteration
     */
    logIteration(log) {
        if (!this.stream)
            return;
        const entry = {
            type: 'iteration',
            ...log,
            timestamp: new Date(log.timestamp).toISOString()
        };
        this.stream.write(JSON.stringify(entry) + '\n');
    }
    /**
     * Log agent start
     */
    logStart(prompt, model, maxIterations) {
        if (!this.stream)
            return;
        const entry = {
            type: 'start',
            timestamp: new Date().toISOString(),
            prompt,
            model,
            maxIterations
        };
        this.stream.write(JSON.stringify(entry) + '\n');
    }
    /**
     * Log agent completion
     */
    logComplete(result) {
        if (!this.stream)
            return;
        const entry = {
            type: 'complete',
            timestamp: new Date().toISOString(),
            ...result
        };
        this.stream.write(JSON.stringify(entry) + '\n');
    }
    /**
     * Log loop detection
     */
    logLoopDetected(iteration, reason) {
        if (!this.stream)
            return;
        const entry = {
            type: 'loop_detected',
            timestamp: new Date().toISOString(),
            iteration,
            reason
        };
        this.stream.write(JSON.stringify(entry) + '\n');
    }
    /**
     * Log error
     */
    logError(error, iteration) {
        if (!this.stream)
            return;
        const entry = {
            type: 'error',
            timestamp: new Date().toISOString(),
            error,
            iteration
        };
        this.stream.write(JSON.stringify(entry) + '\n');
    }
    /**
     * Close log stream
     */
    close() {
        return new Promise((resolve) => {
            if (this.stream) {
                this.stream.end(() => resolve());
            }
            else {
                resolve();
            }
        });
    }
    /**
     * Read and parse JSONL log file
     */
    static readLog(logPath) {
        const content = fs.readFileSync(logPath, 'utf-8');
        return content
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line));
    }
    /**
     * Analyze log file for patterns
     */
    static analyzeLog(logPath) {
        const logs = this.readLog(logPath);
        const iterations = logs.filter(l => l.type === 'iteration');
        const toolUsage = {};
        let successfulActions = 0;
        let failedActions = 0;
        let loopDetected = false;
        iterations.forEach((iter) => {
            const tool = iter.action?.tool;
            if (tool) {
                toolUsage[tool] = (toolUsage[tool] || 0) + 1;
            }
            if (iter.success)
                successfulActions++;
            else
                failedActions++;
        });
        if (logs.some(l => l.type === 'loop_detected')) {
            loopDetected = true;
        }
        // Calculate avg iteration time
        let totalTime = 0;
        for (let i = 1; i < iterations.length; i++) {
            const prev = new Date(iterations[i - 1].timestamp).getTime();
            const curr = new Date(iterations[i].timestamp).getTime();
            totalTime += curr - prev;
        }
        const avgIterationTime = iterations.length > 1 ? totalTime / (iterations.length - 1) : 0;
        return {
            totalIterations: iterations.length,
            successfulActions,
            failedActions,
            toolUsage,
            loopDetected,
            avgIterationTime: Math.round(avgIterationTime / 1000) // seconds
        };
    }
    /**
     * Generate summary report from log
     */
    static generateReport(logPath) {
        const analysis = this.analyzeLog(logPath);
        const logs = this.readLog(logPath);
        const startLog = logs.find(l => l.type === 'start');
        const completeLog = logs.find(l => l.type === 'complete');
        let report = '# Agent Execution Report\n\n';
        if (startLog) {
            report += `**Prompt:** ${startLog.prompt}\n`;
            report += `**Model:** ${startLog.model}\n`;
            report += `**Max Iterations:** ${startLog.maxIterations}\n\n`;
        }
        report += '## Results\n\n';
        report += `- **Total Iterations:** ${analysis.totalIterations}\n`;
        report += `- **Successful Actions:** ${analysis.successfulActions}\n`;
        report += `- **Failed Actions:** ${analysis.failedActions}\n`;
        report += `- **Loop Detected:** ${analysis.loopDetected ? '⚠️ YES' : '✅ NO'}\n`;
        report += `- **Avg Iteration Time:** ${analysis.avgIterationTime}s\n\n`;
        if (completeLog) {
            report += `- **Exit Code:** ${completeLog.exitCode}\n`;
            report += `- **Max Reached:** ${completeLog.maxReached ? '⚠️ YES' : '✅ NO'}\n\n`;
        }
        report += '## Tool Usage\n\n';
        Object.entries(analysis.toolUsage)
            .sort((a, b) => b[1] - a[1])
            .forEach(([tool, count]) => {
            report += `- **${tool}:** ${count} times\n`;
        });
        return report;
    }
}
exports.JSONLLogger = JSONLLogger;
//# sourceMappingURL=jsonl-logger.js.map