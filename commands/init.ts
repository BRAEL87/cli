/**
 * qovyn init — scaffold .qovyn/ config in current project
 */
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import chalk from 'chalk'

export async function runInit(): Promise<void> {
    const cwd = process.cwd()
    const novaDir = path.join(cwd, '.qovyn')
    const configFile = path.join(novaDir, 'config.json')
    const gitignoreFile = path.join(cwd, '.gitignore')

    console.log()
    console.log(chalk.cyan('  Initializing Qovyn in current project...'))
    console.log(`  ${chalk.gray(cwd)}`)
    console.log()

    // Create .qovyn/ directory
    if (!fs.existsSync(novaDir)) {
        fs.mkdirSync(novaDir, { recursive: true })
        console.log(`  ${chalk.green('✓')} Created ${chalk.yellow('.qovyn/')}`)
    } else {
        console.log(`  ${chalk.gray('·')} ${chalk.yellow('.qovyn/')} already exists`)
    }

    // Create .qovyn/config.json if not exists
    if (!fs.existsSync(configFile)) {
        const config = {
            model: 'tencent/hy3-preview:free',
            maxIterations: 40,
            workspace: '.',
            instructions: 'You are working in this project. Follow existing code style and conventions.',
        }
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
        console.log(`  ${chalk.green('✓')} Created ${chalk.yellow('.qovyn/config.json')}`)
    } else {
        console.log(`  ${chalk.gray('·')} ${chalk.yellow('.qovyn/config.json')} already exists`)
    }

    // Add .qovyn/ to .gitignore if not already there
    if (fs.existsSync(gitignoreFile)) {
        const gitignore = fs.readFileSync(gitignoreFile, 'utf-8')
        if (!gitignore.includes('.qovyn/')) {
            fs.appendFileSync(gitignoreFile, '\n# Qovyn AI agent\n.qovyn/\n')
            console.log(`  ${chalk.green('✓')} Added ${chalk.yellow('.qovyn/')} to .gitignore`)
        } else {
            console.log(`  ${chalk.gray('·')} .gitignore already has .qovyn/`)
        }
    } else {
        fs.writeFileSync(gitignoreFile, '# Qovyn AI agent\n.qovyn/\n')
        console.log(`  ${chalk.green('✓')} Created .gitignore with .qovyn/`)
    }

    console.log()
    console.log(chalk.bold('  Qovyn is ready!'))
    console.log()
    console.log(`  Run ${chalk.cyan('qovyn')} to start an interactive session`)
    console.log(`  Run ${chalk.cyan('qovyn agent -p "your task"')} for a single task`)
    console.log()
    console.log(`  Edit ${chalk.yellow('.qovyn/config.json')} to customize model and settings`)
    console.log()
}
