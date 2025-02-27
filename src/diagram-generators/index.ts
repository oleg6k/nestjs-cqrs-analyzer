import { DiagramGenerator } from './types';
import { MermaidGenerator } from './mermaid-generator';

/**
 * Factory function to create diagram generators
 * @param type - The type of diagram generator to create
 * @returns The diagram generator instance
 */
export function createDiagramGenerator(type: string): DiagramGenerator {
    switch (type.toLowerCase()) {
        case 'mermaid':
            return new MermaidGenerator();
        default:
            throw new Error(`Unsupported diagram generator type: ${type}`);
    }
}

export * from './types';
export * from './mermaid-generator';
