/**
 * nova init — scaffold .nova/ config in current project
 */
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import chalk from 'chalk'

export async function runInit(): Promise<void> {
    const cwd = process.cwd()
    const novaDir = path.join(cwd, '.nova')
    const configFile = path.join(novaDir, 'config.json')
    const gitignoreFile = path.join(cwd, '.gitignore')

    console.log()
    console.log(chalk.cyan('  Initializing Nova in current project...'))
    console.log(`  ${chalk.gray(cwd)}`)
    console.log()

    // Create .nova/ directory
    if (!fs.existsSync(novaDir)) {
        fs.mkdirSync(novaDir, { recursive: true })
        console.log(`  ${chalk.green('✓')} Created ${chalk.yellow('.nova/')}`)
    } else {
        console.log(`  ${chalk.gray('·')} ${chalk.yellow('.nova/')} already exists`)
    }

    // Create .nova/config.json if not exists
    if (!fs.existsSync(configFile)) {
        const config = {
            model: 'tencent/hy3-preview:free',
            maxIterations: 40,
            workspace: '.',
            instructions: 'You are working in this project. Follow existing code style and conventions.',
        }
        fs.writeFileSync(configFile, JSON.stringify(config, null, 2))
        console.log(`  ${chalk.green('✓')} Created ${chalk.yellow('.nova/config.json')}`)
    } else {
        console.log(`  ${chalk.gray('·')} ${chalk.yellow('.nova/config.json')} already exists`)
    }

    // Add .nova/ to .gitignore if not already there
    if (fs.existsSync(gitignoreFile)) {
        const gitignore = fs.readFileSync(gitignoreFile, 'utf-8')
        if (!gitignore.includes('.nova/')) {
            fs.appendFileSync(gitignoreFile, '\n# Nova AI agent\n.nova/\n')
            console.log(`  ${chalk.green('✓')} Added ${chalk.yellow('.nova/')} to .gitignore`)
        } else {
            console.log(`  ${chalk.gray('·')} .gitignore already has .nova/`)
        }
    } else {
        fs.writeFileSync(gitignoreFile, '# Nova AI agent\n.nova/\n')
        console.log(`  ${chalk.green('✓')} Created .gitignore with .nova/`)
    }

    console.log()
    console.log(chalk.bold('  Nova is ready!'))
    console.log()
    console.log(`  Run ${chalk.cyan('nova')} to start an interactive session`)
    console.log(`  Run ${chalk.cyan('nova agent -p "your task"')} for a single task`)
    console.log()
    console.log(`  Edit ${chalk.yellow('.nova/config.json')} to customize model and settings`)
    console.log()
}
