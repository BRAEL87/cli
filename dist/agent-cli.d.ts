export interface AgentCLIOptions {
    prompt: string;
    model?: string;
    maxIterations?: number;
    debug?: boolean;
    logFile?: string;
    workspace?: string;
    apiKey?: string;
    apiBase?: string;
}
export declare class AgentCLI {
    run(options: AgentCLIOptions): Promise<void>;
}
//# sourceMappingURL=agent-cli.d.ts.map