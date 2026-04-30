export interface TestResult {
    name: string;
    passed: boolean;
    iterations: number;
    maxIterations: number;
    error?: string;
    duration: number;
}
export declare class TestRunner {
    private workDir;
    private model;
    constructor(workDir: string, model: string);
    /**
     * Level 1: Basic loop test
     */
    runLevel1Test(): Promise<TestResult>;
    /**
     * Level 2: Integration tests on real tasks
     */
    runLevel2Tests(): Promise<TestResult[]>;
    /**
     * Level 3: SWE-bench Lite test
     */
    runLevel3Test(tasksPath: string, maxTasks?: number): Promise<TestResult>;
    /**
     * Run all tests
     */
    runAll(sweBenchTasksPath?: string): Promise<void>;
    /**
     * Print test result
     */
    private printResult;
    /**
     * Find files matching pattern
     */
    private findFiles;
}
//# sourceMappingURL=test-runner.d.ts.map