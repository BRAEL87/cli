/**
 * Type definitions for Nova CLI
 */

export interface AgentOptions {
    prompt: string
    maxIterations: number
    model?: string
    debug?: boolean
    log?: string
    cwd?: string
    timeout?: number
    // REPL streaming callbacks
    onIteration?: (iter: number, thought: string, tool?: string) => void
    onAction?: (tool: string, args: any) => void
    onObservation?: (obs: string, success: boolean) => void
    onThought?: (thought: string) => void
    onChunk?: (chunk: string) => void
    onCancel?: () => void
}

export interface IterationLog {
    iteration: number
    timestamp: number
    thought: string
    action: {
        tool: string
        args: any
    }
    observation: string
    success: boolean
    error?: string
}

export interface AgentResult {
    success: boolean
    iterations: number
    exitCode: 0 | 1
    finalMessage: string
    logs: IterationLog[]
    maxReached: boolean
    loopDetected: boolean
    error?: string
}

export interface SWEBenchTask {
    instance_id: string
    repo: string
    base_commit: string
    problem_statement: string
    hints_text?: string
    test_patch: string
    FAIL_TO_PASS: string[]
    PASS_TO_PASS: string[]
}

export interface SWEBenchPrediction {
    instance_id: string
    model_patch: string
    model_name_or_path: string
}

export interface LoopDetectionState {
    actionHistory: Array<{ tool: string; args: string }>
    thoughtHistory: string[]
    lastNActions: number
    repeatThreshold: number
}
