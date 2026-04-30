"use strict";
/**
 * Loop Detection Service
 * Prevents agent from repeating the same actions
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopDetector = void 0;
class LoopDetector {
    constructor() {
        this.state = {
            actionHistory: [],
            thoughtHistory: [],
            lastNActions: 5,
            repeatThreshold: 3
        };
    }
    /**
     * Check if agent is looping
     */
    detectLoop(log) {
        // Add to history
        const actionKey = `${log.action.tool}:${JSON.stringify(log.action.args)}`;
        this.state.actionHistory.push({ tool: log.action.tool, args: actionKey });
        this.state.thoughtHistory.push(log.thought);
        // Keep only last N actions
        if (this.state.actionHistory.length > this.state.lastNActions * 2) {
            this.state.actionHistory = this.state.actionHistory.slice(-this.state.lastNActions * 2);
            this.state.thoughtHistory = this.state.thoughtHistory.slice(-this.state.lastNActions * 2);
        }
        // Check for exact action repetition
        const exactLoop = this.detectExactActionLoop();
        if (exactLoop)
            return { isLooping: true, reason: exactLoop };
        // Check for semantic repetition (same tool, similar args)
        const semanticLoop = this.detectSemanticLoop();
        if (semanticLoop)
            return { isLooping: true, reason: semanticLoop };
        // Check for thought repetition
        const thoughtLoop = this.detectThoughtLoop();
        if (thoughtLoop)
            return { isLooping: true, reason: thoughtLoop };
        return { isLooping: false };
    }
    /**
     * Detect exact same action repeated multiple times
     */
    detectExactActionLoop() {
        if (this.state.actionHistory.length < this.state.repeatThreshold)
            return null;
        const recent = this.state.actionHistory.slice(-this.state.repeatThreshold);
        const firstAction = recent[0].args;
        // Check if all recent actions are identical
        const allSame = recent.every(a => a.args === firstAction);
        if (allSame) {
            return `Repeated exact action ${this.state.repeatThreshold} times: ${recent[0].tool}`;
        }
        return null;
    }
    /**
     * Detect same tool being used repeatedly with minor variations
     * Read-only investigation tools (grep, search, read) are exempt — the agent
     * legitimately calls these many times while debugging.
     */
    detectSemanticLoop() {
        if (this.state.actionHistory.length < this.state.lastNActions)
            return null;
        // These tools are expected to be called repeatedly during investigation — don't flag them
        const INVESTIGATION_TOOLS = new Set([
            'grep_in_file', 'search_codebase', 'read_file', 'read_chunk',
            'get_file_tree', 'list_dir', 'find_by_name', 'view_file_outline',
        ]);
        const recent = this.state.actionHistory.slice(-this.state.lastNActions);
        const toolCounts = {};
        recent.forEach(a => {
            toolCounts[a.tool] = (toolCounts[a.tool] || 0) + 1;
        });
        // If same WRITE/EXEC tool used >60% of last N actions, it's looping
        for (const [tool, count] of Object.entries(toolCounts)) {
            if (INVESTIGATION_TOOLS.has(tool))
                continue;
            if (count / this.state.lastNActions > 0.6) {
                return `Tool '${tool}' used ${count}/${this.state.lastNActions} times - likely stuck`;
            }
        }
        return null;
    }
    /**
     * Detect repeated similar thoughts (agent not making progress)
     */
    detectThoughtLoop() {
        if (this.state.thoughtHistory.length < 4)
            return null;
        const recent = this.state.thoughtHistory.slice(-4);
        // Check for very similar thoughts (simple string similarity)
        const similarities = [];
        for (let i = 0; i < recent.length - 1; i++) {
            const sim = this.stringSimilarity(recent[i], recent[i + 1]);
            similarities.push(sim);
        }
        const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;
        // If thoughts are >70% similar across 4 iterations, agent is stuck
        if (avgSimilarity > 0.7) {
            return `Thoughts are ${Math.round(avgSimilarity * 100)}% similar - not making progress`;
        }
        return null;
    }
    /**
     * Simple string similarity (Jaccard index on words)
     */
    stringSimilarity(s1, s2) {
        const words1 = new Set(s1.toLowerCase().split(/\s+/));
        const words2 = new Set(s2.toLowerCase().split(/\s+/));
        const intersection = new Set([...words1].filter(w => words2.has(w)));
        const union = new Set([...words1, ...words2]);
        return intersection.size / union.size;
    }
    /**
     * Get suggestions to break out of loop
     */
    getLoopBreakSuggestion() {
        const recentTools = this.state.actionHistory.slice(-3).map(a => a.tool);
        if (recentTools.every(t => t === 'search_codebase' || t === 'search_code')) {
            return 'Stop searching. Read a specific file instead or try a different approach.';
        }
        if (recentTools.every(t => t === 'read_file')) {
            return 'Stop reading files. Make an edit or run a test to verify your hypothesis.';
        }
        if (recentTools.every(t => t === 'edit_file')) {
            return 'Stop editing. Run tests to see if your changes work.';
        }
        return 'Try a completely different approach. Summarize what you learned and pivot.';
    }
    /**
     * Reset state for new task
     */
    reset() {
        this.state = {
            actionHistory: [],
            thoughtHistory: [],
            lastNActions: 5,
            repeatThreshold: 3
        };
    }
    /**
     * Get loop statistics
     */
    getStats() {
        const toolCounts = {};
        this.state.actionHistory.forEach(a => {
            toolCounts[a.tool] = (toolCounts[a.tool] || 0) + 1;
        });
        return {
            totalActions: this.state.actionHistory.length,
            uniqueTools: Object.keys(toolCounts).length,
            toolDistribution: toolCounts,
            recentPattern: this.state.actionHistory.slice(-5).map(a => a.tool).join(' → ')
        };
    }
}
exports.LoopDetector = LoopDetector;
//# sourceMappingURL=loop-detector.js.map