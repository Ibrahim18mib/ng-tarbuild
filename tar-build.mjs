#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import tar from 'tar';
import chalk from 'chalk';
import ora from 'ora';
import figlet from 'figlet';
import { program } from 'commander';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// const pkg = await import('./package.json', { assert: { type: 'json' } }).then(mod => mod.default);
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// ESM __dirname handling
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ASCII Banner
console.log(
    chalk.cyan(figlet.textSync('ng-tarbuild', { horizontalLayout: 'fitted' }))
);

// CLI config
program
    .name('ng-tarbuild')
    .description(
        chalk.whiteBright(
            '📦 Build Angular app and package it into a tar or tar.gz archive.'
        )
    )
    .usage('[options]')
    .requiredOption('--out <filename>', 'Output tar file name (default: <project>.tar)')
    .option('--skip-build', 'Skip Angular build step')
    .option('--rename <foldername>', 'Rename dist subfolder before archiving')
    .option('--no-compress', 'Skip tar compression')
    .option('--path <path>', 'Path to Angular project root', '.')
    .helpOption('-h, --help', 'Show this help message')
    .addHelpText(
        'after',
        `
Examples:
  $ ng-tarbuild --out=my-doctor-app
      Builds Angular project and creates dist_my-doctor-app.tar.gz

  $ ng-tarbuild --out=clinic --no-compress
      Skips compression;

   $ ng-tarbuild --out=clinic --skip-build
      Skips if already builded;   

  $ ng-tarbuild --out=clinic --rename=clinic-v2
      Renames folder inside archive to "clinic-v2"

  $ ng-tarbuild --out=health-app --path=../my-angular-app
      Runs the command from a custom Angular project path
    `
    )
    .version(pkg.version, '-v, --version', 'Show version number');

// Parse CLI
program.parse(process.argv);
if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}

const options = program.opts();
const appName = options.out;
const renameFolder = options.rename;
const projectPath = path.resolve(process.cwd(), options.path);
const distDir = path.join(projectPath, 'dist');
const distBase = path.join(distDir, appName);
const browserPath = path.join(distBase, 'browser');

// Compression logic
const args = process.argv;
const shouldCompress = !args.includes('--no-compress');
const ext = '.tar';
const tarballName = `dist_${appName}${ext}`;

console.log(`\n   ➤ Compression:       ${shouldCompress ? 'Enabled (.tar)' : 'Disabled'}`);
console.log(`   ➤ Archive Name:      ${tarballName}`);
console.log(`   ➤ Folder in archive: ${renameFolder || appName}\n`);

async function main() {
    if (!options.skipBuild) {

        // Step 1: Build Angular app
        const buildSpinner = ora('🏗️  Building the Angular application...').start();
        try {
            execSync(`ng build --configuration production --output-path=dist/${appName}`, {
                stdio: 'inherit',
                cwd: projectPath,
            });
            buildSpinner.succeed('✅ Angular build complete');
        } catch (err) {
            buildSpinner.fail('❌ Build failed');
            console.error(chalk.red(err.message));
            process.exit(1);
        }
    } else {
        console.log(chalk.yellow('⚠️  Skipping Angular build step (--skip-build passed)'));
    }

    // Step 2: Move browser contents to dist root
    const moveSpinner = ora('📂 Moving browser contents to dist root...').start();
    if (!fs.existsSync(browserPath)) {
        moveSpinner.fail(`❌ Build output not found at ${browserPath}`);
        process.exit(1);
    }

    try {
        fs.readdirSync(browserPath).forEach((file) => {
            const src = path.join(browserPath, file);
            const dest = path.join(distBase, file);
            fs.renameSync(src, dest);
        });
        fs.rmSync(browserPath, { recursive: true, force: true });
        moveSpinner.succeed('✅ Moved browser files to root and cleaned up');
    } catch (err) {
        moveSpinner.fail('❌ Failed to move files');
        console.error(chalk.red(err.message));
        process.exit(1);
    }

    // Step 3: Rename index.csr.html if exists
    const renameSpinner = ora('🔄 Checking for index.csr.html...').start();
    const csrPath = path.join(distBase, 'index.csr.html');
    const indexPath = path.join(distBase, 'index.html');
    if (fs.existsSync(csrPath)) {
        fs.renameSync(csrPath, indexPath);
        renameSpinner.succeed("✅ Renamed 'index.csr.html' to 'index.html'");
    } else {
        renameSpinner.info('ℹ️  index.csr.html not found – skipping rename');
    }


    // Step 4: Create archive
    const distFolderName = path.basename(distBase);
    const archiveFolderName = renameFolder || distFolderName;
    const tarballName = `dist_${appName}${ext}`;
    const tarballPath = path.join(projectPath, tarballName);

    console.log(`\n   ➤ Archive Name:      ${tarballName}`);
    console.log(`   ➤ Folder in archive: ${archiveFolderName}\n`);

    const tarSpinner = ora(`📦 Creating archive: ${tarballName}`).start();
    try {
        await tar.c(
            {
                gzip: false, //no compression
                file: tarballPath,
                cwd: projectPath,
                portable: true,
                noMtime: false,
                transform: (entry) => {
                    if (renameFolder) {
                        entry.path = entry.path.replace(
                            new RegExp(`^dist/${distFolderName}`),
                            `dist/${archiveFolderName}`
                        );
                    }
                    return entry;
                },
            },
            [path.join('dist', distFolderName)]
        );

        tarSpinner.succeed(`✅ Archive created at ${tarballPath}`);
    } catch (err) {
        tarSpinner.fail('❌ Failed to create archive');
        console.error(chalk.red(err.message));
        process.exit(1);
    }
}

main();
