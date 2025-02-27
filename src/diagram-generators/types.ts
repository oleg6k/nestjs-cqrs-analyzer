import { AnalysisResult } from '../types';

/**
 * Interface for diagram generator options
 */
export interface DiagramGeneratorOptions {
    /**
     * Output file path
     */
    outputPath: string;

    /**
     * Maximum number of edges to include in the diagram (0 = no limit)
     */
    maxEdges?: number;

    /**
     * Whether to include a legend
     */
    includeLegend?: boolean;

    /**
     * Custom title for the diagram
     */
    title?: string;

    /**
     * Additional format-specific options
     */
    [key: string]: any;
}

/**
 * Interface for diagram generators
 */
export interface DiagramGenerator {
    /**
     * Generate a diagram from analysis results
     * @param result - The analysis result to visualize
     * @param options - Options for diagram generation
     * @returns Path to the generated diagram file
     */
    generateDiagram(result: AnalysisResult, options: DiagramGeneratorOptions): Promise<string>;

    /**
     * Get the supported file extensions
     */
    getSupportedExtensions(): string[];

    /**
     * Get the name of the generator
     */
    getName(): string;

    /**
     * Get a description of the generator
     */
    getDescription(): string;
}
