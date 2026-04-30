"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
/**
 * nova init — scaffold .nova/ config in current project
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const chalk_1 = __importDefault(require("chalk"));
async function runInit() {
    const cwd = process.cwd();
    const novaDir = path.join(cwd, '.nova');
    const configFile = path.join(novaDir, 'config.json');
    const gitignoreFile = path.join(cwd, '.gitignore');
    console.log();
    console.log(chalk_1.default.cyan('  Initializing Nova in current project...'));
    console.log(`  ${chalk_1.default.gray(cwd)}`);
    console.log();
    // Create .nova/ directory
    if (!fs.existsSync(novaDir)) {
        fs.mkdirSync(novaDir, { recursive: true });
        console.log(`  ${chalk_1.default.green('✓')} Created ${chalk_1.default.yellow('.nova/')}`);
    }
    else {
        console.log(`  ${chalk_1.default.gray('·')} ${chalk_1.default.yellow('.nova/')} already exists`);
    }
    // Create .nova/config.json if not exists
    if (!fs.existsSync(configFile)) {
        const config = {
            model: 'tencent/hy3-preview:free',
            maxIterations: 40,
            workspace: '.',
            instructions: 'You are working in this project. Follow existing code style and conventions.',
        };
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2));
        console.log(`  ${chalk_1.default.green('✓')} Created ${chalk_1.default.yellow('.nova/config.json')}`);
    }
    else {
        console.log(`  ${chalk_1.default.gray('·')} ${chalk_1.default.yellow('.nova/config.json')} already exists`);
    }
    // Add .nova/ to .gitignore if not already there
    if (fs.existsSync(gitignoreFile)) {
        const gitignore = fs.readFileSync(gitignoreFile, 'utf-8');
        if (!gitignore.includes('.nova/')) {
            fs.appendFileSync(gitignoreFile, '\n# Nova AI agent\n.nova/\n');
            console.log(`  ${chalk_1.default.green('✓')} Added ${chalk_1.default.yellow('.nova/')} to .gitignore`);
        }
        else {
            console.log(`  ${chalk_1.default.gray('·')} .gitignore already has .nova/`);
        }
    }
    else {
        fs.writeFileSync(gitignoreFile, '# Nova AI agent\n.nova/\n');
        console.log(`  ${chalk_1.default.green('✓')} Created .gitignore with .nova/`);
    }
    console.log();
    console.log(chalk_1.default.bold('  Nova is ready!'));
    console.log();
    console.log(`  Run ${chalk_1.default.cyan('nova')} to start an interactive session`);
    console.log(`  Run ${chalk_1.default.cyan('nova agent -p "your task"')} for a single task`);
    console.log();
    console.log(`  Edit ${chalk_1.default.yellow('.nova/config.json')} to customize model and settings`);
    console.log();
}
//# sourceMappingURL=init.js.map