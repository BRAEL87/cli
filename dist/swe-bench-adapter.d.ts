export interface SWEBenchTask {
    instance_id: string;
    repo: string;
    base_commit: string;
    problem_statement: string;
    hints_text?: string;
    test_patch: string;
    FAIL_TO_PASS: string[];
    PASS_TO_PASS: string[];
}
export interface SWEBenchPrediction {
    instance_id: string;
    model_patch: string;
    model_name_or_path: string;
    iterations: number;
    success: boolean;
    error?: string;
}
export declare class SWEBenchAdapter {
    private workDir;
    private logger;
    constructor(workDir: string, logFile: string);
    /**
     * Run a single SWE-bench task
     */
    runTask(task: SWEBenchTask, model: string, maxIterations?: number): Promise<SWEBenchPrediction>;
    /**
     * Run multiple SWE-bench tasks
     */
    runBatch(tasks: SWEBenchTask[], model: string, maxIterations?: number, maxWorkers?: number): Promise<SWEBenchPrediction[]>;
    /**
     * Setup repository for testing
     */
    private setupRepo;
    /**
     * Build enhanced prompt with SWE-bench context
     */
    private buildPrompt;
    /**
     * Extract git diff as patch
     */
    private extractPatch;
    /**
     * Execute shell command
     */
    private execCommand;
    /**
     * Cleanup task directory
     */
    private cleanup;
    /**
     * Save predictions to JSONL file
     */
    savePredictions(predictions: SWEBenchPrediction[], outputPath: string): Promise<void>;
    /**
     * Load SWE-bench tasks from JSONL file
     */
    static loadTasks(tasksPath: string): Promise<SWEBenchTask[]>;
}
//# sourceMappingURL=swe-bench-adapter.d.ts.map