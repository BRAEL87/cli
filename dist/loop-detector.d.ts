/**
 * Loop Detection Service
 * Prevents agent from repeating the same actions
 */
import { IterationLog } from './types';
export declare class LoopDetector {
    private state;
    /**
     * Check if agent is looping
     */
    detectLoop(log: IterationLog): {
        isLooping: boolean;
        reason?: string;
    };
    /**
     * Detect exact same action repeated multiple times
     */
    private detectExactActionLoop;
    /**
     * Detect same tool being used repeatedly with minor variations
     * Read-only investigation tools (grep, search, read) are exempt — the agent
     * legitimately calls these many times while debugging.
     */
    private detectSemanticLoop;
    /**
     * Detect repeated similar thoughts (agent not making progress)
     */
    private detectThoughtLoop;
    /**
     * Simple string similarity (Jaccard index on words)
     */
    private stringSimilarity;
    /**
     * Get suggestions to break out of loop
     */
    getLoopBreakSuggestion(): string;
    /**
     * Reset state for new task
     */
    reset(): void;
    /**
     * Get loop statistics
     */
    getStats(): {
        totalActions: number;
        uniqueTools: number;
        toolDistribution: Record<string, number>;
        recentPattern: string;
    };
}
//# sourceMappingURL=loop-detector.d.ts.map