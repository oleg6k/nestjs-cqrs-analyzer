import * as path from 'path';
import * as fs from 'fs-extra';
import { AnalyzerOptions, AnalysisResult } from './types';
import { findTsFiles, analyzeFile } from './file-analyzer';
import { analyzeArchitecture, generateMarkdownReport } from './architecture-analyzer';
import { createDiagramGenerator, DiagramGeneratorOptions } from './diagram-generators';

/**
 * Main analyzer class for CQRS architecture
 */
export class CQRSAnalyzer {
    private options: AnalyzerOptions;

    /**
     * Create a new CQRSAnalyzer instance
     * @param options - Analyzer options
     */
    constructor(options: Partial<AnalyzerOptions> = {}) {
        this.options = {
            maxEdges: 0,
            srcDir: 'src',
            outDir: 'cqrs-analysis',
            generateReport: true,
            diagramFormat: ['mermaid', 'html'],
            ...options
        };
    }

    /**
     * Run the CQRS analysis
     * @returns Analysis result
     */
    async analyze(): Promise<{
        result: AnalysisResult;
        architectureAnalysis: ReturnType<typeof analyzeArchitecture>;
        outputFiles: string[];
    }> {
        console.log('Starting CQRS analysis...');

        // Ensure source directory exists
        const srcDir = path.resolve(process.cwd(), this.options.srcDir || 'src');
        if (!await fs.pathExists(srcDir)) {
            throw new Error(`Source directory not found: ${srcDir}`);
        }

        // Ensure output directory exists
        const outDir = path.resolve(process.cwd(), this.options.outDir || 'cqrs-analysis');
        await fs.ensureDir(outDir);

        // Find TypeScript files
        const tsFiles = await findTsFiles(srcDir);
        console.log(`Found ${tsFiles.length} TypeScript files to analyze.`);

        // Analyze files
        const analysisResult: AnalysisResult = {
            busUsages: [],
            handlerDeclarations: []
        };

        await Promise.all(tsFiles.map(file => analyzeFile(file, analysisResult)));

        const totalEdges = analysisResult.busUsages.length + analysisResult.handlerDeclarations.length;
        console.log(`Found ${analysisResult.busUsages.length} bus usages and ${analysisResult.handlerDeclarations.length} handler declarations.`);
        console.log(`Total number of edges in the diagram: ${totalEdges}`);

        // Apply max edges limit if needed
        if (this.options.maxEdges && this.options.maxEdges > 0 && totalEdges > this.options.maxEdges) {
            console.log(`Limiting diagram to ${this.options.maxEdges} edges as specified.`);

            // Limit bus usages and handler declarations proportionally
            if (analysisResult.busUsages.length > this.options.maxEdges / 2) {
                analysisResult.busUsages = analysisResult.busUsages.slice(0, Math.floor(this.options.maxEdges / 2));
            }

            const remainingEdges = this.options.maxEdges - analysisResult.busUsages.length;
            if (remainingEdges > 0 && analysisResult.handlerDeclarations.length > remainingEdges) {
                analysisResult.handlerDeclarations = analysisResult.handlerDeclarations.slice(0, remainingEdges);
            }
        }

        // Analyze architecture
        const architectureAnalysis = analyzeArchitecture(analysisResult);

        // Generate files
        const outputFiles: string[] = [];

        // Generate report if requested
        if (this.options.generateReport) {
            const reportPath = path.join(outDir, 'cqrs-analysis-report.md');
            const reportContent = generateMarkdownReport(architectureAnalysis);
            await fs.writeFile(reportPath, reportContent);
            outputFiles.push(reportPath);
            console.log(`Analysis report written to ${reportPath}`);
        }

        // Generate diagrams
        if (this.options.diagramFormat && this.options.diagramFormat.length > 0) {
            for (const format of this.options.diagramFormat) {
                try {
                    const generator = createDiagramGenerator(format);

                    const diagramOptions: DiagramGeneratorOptions = {
                        outputPath: path.join(outDir, `cqrs-diagram.${generator.getSupportedExtensions()[0].replace('.', '')}`),
                        maxEdges: this.options.maxEdges,
                        includeLegend: true,
                        title: 'CQRS Architecture Diagram'
                    };

                    const outputPath = await generator.generateDiagram(analysisResult, diagramOptions);
                    outputFiles.push(outputPath);
                    console.log(`${generator.getName()} diagram generated at ${outputPath}`);
                } catch (error) {
                    console.error(`Error generating ${format} diagram:`, error);
                }
            }
        }

        console.log('CQRS analysis completed.');

        return {
            result: analysisResult,
            architectureAnalysis,
            outputFiles
        };
    }
}
