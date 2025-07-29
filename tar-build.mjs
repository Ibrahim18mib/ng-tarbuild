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
const pkg = await import('./package.json', { assert: { type: 'json' } }).then(mod => mod.default);


// ESM __dirname handling
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ASCII Banner
console.log(
    chalk.cyan(
        figlet.textSync('ng-tarbuild', { horizontalLayout: 'fitted' })
    )
);

// CLI config
program
    .name('ng-tarbuild')
    .description(chalk.whiteBright('📦 Build Angular app and package it into a tar or tar.gz archive.'))
    .usage('[options]')
    .requiredOption('--out <filename>', 'Output tar file name (default: <project>.tar)')
    .option('--rename <foldername>', 'Rename dist subfolder before archiving')
    .option('--no-compress', 'Skip tar compression (outputs .tar instead of .tar.gz)')
    .option('--path <path>', 'Path to Angular project root', '.')
    .helpOption('-h, --help', 'Show this help message')
    .addHelpText('after', `
Examples:
  $ ng-tarbuild --out=my-doctor-app
      Builds Angular project and creates dist_my-doctor-app.tar.gz

  $ ng-tarbuild --out=clinic --no-compress
      Skips compression; outputs dist_clinic.tar

  $ ng-tarbuild --out=clinic --rename=clinic-v2
      Renames folder inside archive to "clinic-v2"

  $ ng-tarbuild --out=health-app --path=../my-angular-app
      Runs the command from a custom Angular project path
    `)
    .version(pkg.version, '-v, --version', 'Show version number')
// Now parse
program.parse(process.argv);

// Show help if no args
if (process.argv.length <= 2) {
    program.outputHelp();
    process.exit(0);
}

// Then this block comes **after** addHelpText
if (process.argv.includes('--examples')) {
    program.outputHelp();
    process.exit(0);
}

const options = program.opts();
const appName = options.out;
const renameFolder = options.rename;
const compress = options.compress; // true by default; false if --no-compress
const projectPath = path.resolve(process.cwd(), options.path);
const distDir = path.join(projectPath, 'dist');
const distBase = path.join(distDir, appName);
const browserPath = path.join(distBase, 'browser');

async function main() {
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

    // Step 4: Create .tar or .tar.gz archive
    const ext = compress ? '.tar.gz' : '.tar';
    const tarballName = `dist_${appName}${ext}`;
    const tarballPath = path.join(projectPath, tarballName);

    // Prepare folder to archive inside dist: either original appName or renameFolder if provided
    const folderToArchive = renameFolder || appName;

    // If renameFolder is set, copy the folder to a temp folder with the renameFolder name
    // to preserve the folder name inside the tarball without messing with original dist content.
    let archiveSource = distBase; // default

    if (renameFolder) {
        const tmpPath = path.join(distDir, renameFolder);
        // Clean up if exists
        if (fs.existsSync(tmpPath)) {
            fs.rmSync(tmpPath, { recursive: true, force: true });
        }
        // Copy folder recursively
        copyFolderRecursiveSync(distBase, tmpPath);
        archiveSource = tmpPath;
    }

    const tarSpinner = ora(`📦 Creating tarball: ${tarballName}`).start();
    try {
        await tar.c(
            {
                gzip: compress,
                file: tarballPath,
                cwd: distDir,
            },
            [renameFolder || appName]
        );
        tarSpinner.succeed(`✅ Tarball created at ${tarballPath}`);
    } catch (err) {
        tarSpinner.fail('❌ Failed to create tarball');
        console.error(chalk.red(err.message));
        process.exit(1);
    }

    // Clean up temp folder if used
    if (renameFolder) {
        fs.rmSync(path.join(distDir, renameFolder), { recursive: true, force: true });
    }
}

// Recursive copy helper
function copyFolderRecursiveSync(source, target) {
    const exists = fs.existsSync(source);
    const stats = exists && fs.statSync(source);
    const isDirectory = exists && stats.isDirectory();

    if (!exists || !isDirectory) {
        throw new Error(`Source folder ${source} does not exist or is not a directory`);
    }

    if (!fs.existsSync(target)) {
        fs.mkdirSync(target);
    }

    fs.readdirSync(source).forEach((item) => {
        const srcItem = path.join(source, item);
        const destItem = path.join(target, item);

        if (fs.statSync(srcItem).isDirectory()) {
            copyFolderRecursiveSync(srcItem, destItem);
        } else {
            fs.copyFileSync(srcItem, destItem);
        }
    });
}

main();
