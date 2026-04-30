/**
 * Standalone Agent Runner — Enhanced CLI agent with Electron-level capabilities
 * Tools: read_file, read_chunk, write_file, append_to_file, edit_file,
 *        multi_edit_file, delete_file, bash, get_file_tree, list_dir,
 *        find_by_name, grep_in_file, search_codebase, view_file_outline,
 *        get_diagnostics, run_tests
 */
import { AgentOptions, AgentResult } from './types';
export declare class StandaloneAgent {
    private loopDetector;
    private logger;
    private apiKey;
    private apiBase;
    private abortController;
    private conversationHistory;
    constructor(apiKey: string, apiBase?: string, logPath?: string);
    /** Clear conversation memory (called between REPL sessions if user wants fresh start) */
    clearMemory(): void;
    /** Cancel the current running task */
    cancel(): void;
    run(options: AgentOptions): Promise<AgentResult>;
    private callAI;
    private executeTool;
    private toolReadFile;
    private toolReadChunk;
    private toolWriteFile;
    private toolAppendFile;
    private toolEditFile;
    private toolMultiEdit;
    private toolDeleteFile;
    private toolMoveFile;
    private toolBash;
    private toolFileTree;
    private toolListDir;
    private toolFindByName;
    private toolGrepInFile;
    private toolSearchCodebase;
    private toolViewOutline;
    private toolGetDiagnostics;
    private toolRunTests;
    private toolSearchWeb;
    private asyncCommands;
    private toolRunAsyncCommand;
    private toolCheckCommandStatus;
    private getCheckpointPath;
    private saveCheckpoint;
    private loadCheckpoint;
    private clearCheckpoint;
    private parseAllToolCalls;
    private extractThought;
    private buildWorkspaceContext;
    private getSystemPrompt;
}
//# sourceMappingURL=standalone-agent.d.ts.map