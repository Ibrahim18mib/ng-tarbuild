#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import fse from 'fs-extra';
import path from 'path';
import tar from 'tar';
import chalk from 'chalk';
import ora from 'ora';
import figlet from 'figlet';
import { program } from 'commander';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI Banner
console.log(
    chalk.cyan(figlet.textSync('ng-tarbuild', { horizontalLayout: 'fitted' }))
);

// CLI Options
program
    .name('ng-tarbuild')
    .description(chalk.whiteBright('📦 Build Angular app and package it into a tar archive.'))
    .usage('[options]')
    .requiredOption('--out <filename>', 'Output tar file name (default: <project>.tar)')
    .option('--skip-build', 'Skip Angular build step')
    .option('--rename <foldername>', 'Rename dist subfolder inside archive')
    .option('--no-compress', 'Skip tar compression')
    .option('--path <path>', 'Path to Angular project root', '.')
    .helpOption('-h, --help', 'Show this help message')
    .addHelpText('after', `
Examples:
  $ ng-tarbuild --out=my-app
  $ ng-tarbuild --out=my-app --rename=app-v1
  $ ng-tarbuild --out=app --skip-build
  $ ng-tarbuild --out=ui --no-compress
  $ ng-tarbuild --out=ui --path=../client
`)
    .version(pkg.version, '-v, --version', 'Show version number');

// Parse
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

const shouldCompress = !options.noCompress;
const ext = '.tar';
const tarballName = `dist_${appName}${ext}`;
const tarballPath = path.join(projectPath, tarballName);

// Summary log
console.log(`\n🛠️  Options Summary`);
console.log(`   ➤ Compression:       ${shouldCompress ? 'Enabled (.tar)' : 'Disabled'}`);
console.log(`   ➤ Output Archive:    ${tarballName}`);
console.log(`   ➤ Folder in archive: ${renameFolder || appName}`);
console.log(`   ➤ Project Path:      ${projectPath}\n`);

async function main() {
    // Step 1: Build Angular
    if (!options.skipBuild) {
        const buildSpinner = ora('🏗️  Building Angular app...').start();
        try {
            execSync(`ng build --configuration production --output-path=dist/${appName}`, {
                stdio: 'inherit',
                cwd: projectPath,
            });
            buildSpinner.succeed('✅ Angular build complete');
        } catch (err) {
            buildSpinner.fail('❌ Angular build failed');
            console.error(chalk.red(err.message));
            process.exit(1);
        }
    } else {
        console.log(chalk.yellow('⚠️  Skipping Angular build (--skip-build)'));
    }

    // Step 2: Copy browser/* → distBase
    const moveSpinner = ora('📂 Moving files from /browser to dist root...').start();
    if (!fs.existsSync(browserPath)) {
        moveSpinner.fail(`❌ browser output folder not found: ${browserPath}`);
        process.exit(1);
    }

    try {
        await fse.copy(browserPath, distBase, { overwrite: true });
        await fse.remove(browserPath);
        moveSpinner.succeed('✅ Moved all files from /browser and cleaned up');
    } catch (err) {
        moveSpinner.fail('❌ Failed to move /browser contents');
        console.error(chalk.red(err.message));
        process.exit(1);
    }

    // Step 3: Handle index.html or index.csr.html
    const indexHtmlPath = path.join(distBase, 'index.html');
    const indexCsrPath = path.join(distBase, 'index.csr.html');
    const renameSpinner = ora('🔍 Handling index.html...').start();

    if (fs.existsSync(indexHtmlPath)) {
        renameSpinner.succeed('✅ index.html found and kept as-is');
    } else if (fs.existsSync(indexCsrPath)) {
        try {
            const csrContent = fs.readFileSync(indexCsrPath, 'utf-8');
            const baseHref = csrContent.match(/<base href="([^"]*)"/)?.[1] || '/';
            const updatedHtml = csrContent.replace(/<base href="[^"]*"/, `<base href="${baseHref}"`);
            fs.writeFileSync(indexHtmlPath, updatedHtml, 'utf-8');
            fs.unlinkSync(indexCsrPath);
            renameSpinner.succeed(`✅ index.html created from CSR with base href: "${baseHref}"`);
        } catch (err) {
            renameSpinner.fail('❌ Failed to convert index.csr.html');
            console.error(chalk.red(err.message));
            process.exit(1);
        }
    } else {
        renameSpinner.warn('⚠️  No index.html or index.csr.html found');
    }

    // Step 4: Show final dist content
    console.log('📁 Final dist folder content:');
    console.log(fs.readdirSync(distBase));

    // Step 5: Create archive
    const distFolderName = path.basename(distBase);
    const archiveFolderName = renameFolder || distFolderName;

    const tarSpinner = ora(`📦 Creating archive: ${tarballName}`).start();
    try {
        await tar.c(
            {
                gzip: false,
                file: tarballPath,
                cwd: projectPath,
                portable: true,
                noMtime: true,
                transform: (entry) => {
                    if (renameFolder) {
                        entry.path = entry.path.replace(
                            new RegExp(`^dist/${distFolderName}`),
                            `dist/${renameFolder}`
                        );
                    }
                    return entry;
                },
            },
            [path.join('dist', distFolderName)]
        );

        tarSpinner.succeed(`✅ Archive created successfully: ${tarballPath}`);
    } catch (err) {
        tarSpinner.fail('❌ Failed to create archive');
        console.error(chalk.red(err.message));
        process.exit(1);
    }

    console.log('\n🎉 Done. Your Angular app is ready for deployment.\n');
}

main();
