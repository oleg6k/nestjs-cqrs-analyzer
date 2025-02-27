#!/usr/bin/env node

import { Command } from 'commander';
import { CQRSAnalyzer } from '../analyzer';
import * as path from 'path';
import * as fs from 'fs-extra';

// Get package version
let version = '1.0.0';
try {
    const packageJson = fs.readJsonSync(path.join(__dirname, '../../package.json'));
    version = packageJson.version;
} catch (error) {
    console.warn('Could not read package.json for version information');
}

const program = new Command();

program
    .name('cqrs-analyzer')
    .description('Analyze CQRS architecture in TypeScript/NestJS applications')
    .version(version);

program
    .option('-s, --src <directory>', 'Source directory to analyze', 'src')
    .option('-o, --out <directory>', 'Output directory for results', 'cqrs-analysis')
    .option('-m, --max-edges <number>', 'Maximum number of edges to include in diagrams (0 = no limit)', '0')
    .option('-f, --formats <formats>', 'Diagram formats to generate (comma-separated)', 'mermaid,html')
    .option('-r, --no-report', 'Skip generating analysis report')
    .action(async (options) => {
        try {
            const analyzer = new CQRSAnalyzer({
                srcDir: options.src,
                outDir: options.out,
                maxEdges: parseInt(options.maxEdges, 10),
                generateReport: options.report !== false,
                diagramFormat: options.formats.split(',').map((f: string) => f.trim())
            });

            const results = await analyzer.analyze();

            // Print summary
            console.log('\nAnalysis Summary:');
            console.log('----------------');
            console.log(`Classes:              ${results.architectureAnalysis.metrics.totalClasses}`);
            console.log(`Events:               ${results.architectureAnalysis.metrics.totalEvents}`);
            console.log(`Issues found:         ${results.architectureAnalysis.issues.length}`);
            console.log(`Files generated:      ${results.outputFiles.length}`);
            console.log('');

            if (results.architectureAnalysis.issues.length > 0) {
                console.log('Issues by severity:');
                const errorCount = results.architectureAnalysis.issues.filter(i => i.severity === 'error').length;
                const warningCount = results.architectureAnalysis.issues.filter(i => i.severity === 'warning').length;
                const infoCount = results.architectureAnalysis.issues.filter(i => i.severity === 'info').length;

                console.log(`  Errors:   ${errorCount}`);
                console.log(`  Warnings: ${warningCount}`);
                console.log(`  Info:     ${infoCount}`);
                console.log('');
            }

            console.log(`See detailed results in: ${path.resolve(options.out)}`);
        } catch (error) {
            console.error('Error running analysis:', error);
            process.exit(1);
        }
    });

program.parse();
