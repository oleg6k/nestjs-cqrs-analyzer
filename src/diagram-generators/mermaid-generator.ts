import * as fs from 'fs-extra';
import * as path from 'path';
import { AnalysisResult } from '../types';
import { DiagramGenerator, DiagramGeneratorOptions } from './types';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

/**
 * Options specific to Mermaid diagrams
 */
export interface MermaidGeneratorOptions extends DiagramGeneratorOptions {
    /**
     * Whether to generate an HTML file with embedded diagram
     */
    generateHtml?: boolean;

    /**
     * Whether to try generating SVG with Mermaid CLI
     */
    generateSvg?: boolean;

    /**
     * Theme for the diagram
     */
    theme?: 'default' | 'forest' | 'dark' | 'neutral';
}

/**
 * Mermaid diagram generator implementation
 */
export class MermaidGenerator implements DiagramGenerator {
    /**
     * Generate a Mermaid diagram from analysis results
     * @param result - The analysis result to visualize
     * @param options - Options for diagram generation
     * @returns Path to the generated diagram file
     */
    async generateDiagram(result: AnalysisResult, options: MermaidGeneratorOptions): Promise<string> {
        const {
            outputPath,
            maxEdges = 0,
            includeLegend = true,
            title = 'CQRS Diagram',
            generateHtml = true,
            generateSvg = true,
            theme = 'default'
        } = options;

        // Process analysis result data
        let { busUsages, handlerDeclarations } = result;

        // Apply max edges limit if needed
        const totalEdges = busUsages.length + handlerDeclarations.length;
        if (maxEdges > 0 && totalEdges > maxEdges) {
            console.log(`Limiting diagram to ${maxEdges} edges as specified.`);

            // Limit bus usages and handler declarations proportionally
            if (busUsages.length > maxEdges / 2) {
                busUsages = busUsages.slice(0, Math.floor(maxEdges / 2));
            }

            const remainingEdges = maxEdges - busUsages.length;
            if (remainingEdges > 0 && handlerDeclarations.length > remainingEdges) {
                handlerDeclarations = handlerDeclarations.slice(0, remainingEdges);
            }
        }

        // Set up output paths
        const outputDir = path.dirname(outputPath);
        await fs.ensureDir(outputDir);

        const mermaidPath = outputPath;
        const htmlPath = path.join(outputDir, `${path.basename(outputPath, '.mmd')}.html`);
        const svgPath = path.join(outputDir, `${path.basename(outputPath, '.mmd')}.svg`);

        // Generate Mermaid content
        const mermaidContent = this.generateMermaidContent(busUsages, handlerDeclarations, {
            title,
            includeLegend
        });

        // Write Mermaid file
        await fs.writeFile(mermaidPath, mermaidContent);

        // Generate HTML file if requested
        if (generateHtml) {
            const htmlContent = this.generateHtmlContent(mermaidContent, title, theme);
            await fs.writeFile(htmlPath, htmlContent);
        }

        // Try to generate SVG if requested
        if (generateSvg) {
            const hasMermaidCli = await this.checkMermaidCli();
            if (hasMermaidCli) {
                console.log('Mermaid CLI detected, generating SVG directly...');
                const success = await this.generateSvgWithMermaidCli(mermaidPath, svgPath, theme);
                if (success) {
                    console.log(`SVG file written to ${svgPath}`);
                } else {
                    console.log('Could not generate SVG with Mermaid CLI. Please use the HTML file to generate SVG.');
                }
            } else {
                console.log('Mermaid CLI not detected. To automatically generate SVG:');
                console.log('1. Install Mermaid CLI: npm install -g @mermaid-js/mermaid-cli');
                console.log('2. Run: mmdc -i <input.mmd> -o <output.svg>');
                console.log('Or open the HTML file in a browser to view and export the diagram.');
            }
        }

        return mermaidPath;
    }

    /**
     * Get the supported file extensions
     */
    getSupportedExtensions(): string[] {
        return ['.mmd', '.html', '.svg'];
    }

    /**
     * Get the name of the generator
     */
    getName(): string {
        return 'Mermaid';
    }

    /**
     * Get a description of the generator
     */
    getDescription(): string {
        return 'Generates diagrams using Mermaid.js syntax';
    }

    /**
     * Generate the Mermaid content
     * @param busUsages - Bus usages from analysis
     * @param handlerDeclarations - Handler declarations from analysis
     * @param options - Generation options
     * @returns Mermaid diagram content
     */
    private generateMermaidContent(
        busUsages: AnalysisResult['busUsages'],
        handlerDeclarations: AnalysisResult['handlerDeclarations'],
        options: { title: string; includeLegend: boolean }
    ): string {
        // Start building the Mermaid file
        let mermaidContent = 'flowchart LR\n';
        mermaidContent += `  %% ${options.title}\n\n`;

        // Track classes that use buses
        const busUsers = new Set<string>();
        busUsages.forEach(usage => {
            busUsers.add(usage.className);
        });

        // Track handler classes
        const handlerClasses = new Set<string>();
        handlerDeclarations.forEach(handler => {
            handlerClasses.add(handler.className);
        });

        // Collect all event types
        const eventTypes = new Set<string>();
        busUsages.forEach(usage => eventTypes.add(usage.eventType));
        handlerDeclarations.forEach(handler => eventTypes.add(handler.eventType));

        // Add classes as nodes with properly escaped names
        mermaidContent += '  %% Classes\n';

        const allClasses = new Set([...busUsers, ...handlerClasses]);
        const classNodes = new Map<string, string>();

        // Generate node IDs for classes
        let counter = 1;
        allClasses.forEach(className => {
            const nodeId = `class_${counter}`;
            classNodes.set(className, nodeId);
            counter++;

            // Determine class type for later styling
            const isBusUser = busUsers.has(className);
            const isHandler = handlerClasses.has(className);

            let styleClass = '';
            if (isBusUser && isHandler) {
                styleClass = 'both';
            } else if (isBusUser) {
                styleClass = 'producer';
            } else if (isHandler) {
                styleClass = 'consumer';
            }

            // Escape special characters in class names
            const escapedClassName = className.replace(/['"]/g, '');

            mermaidContent += `  ${nodeId}["${escapedClassName}"]\n`;

            // Store style info for later using class command
            if (styleClass) {
                mermaidContent += `  class ${nodeId} ${styleClass}\n`;
            }
        });

        // Add events as nodes
        mermaidContent += '\n  %% Events/Commands/Queries\n';

        const eventNodes = new Map<string, string>();

        // Generate node IDs for events
        counter = 1;
        eventTypes.forEach(eventType => {
            const nodeId = `event_${counter}`;
            eventNodes.set(eventType, nodeId);
            counter++;

            // Escape special characters in event type names
            const escapedEventType = eventType.replace(/['"]/g, '');

            mermaidContent += `  ${nodeId}["${escapedEventType}"]\n`;
            mermaidContent += `  class ${nodeId} event\n`;
        });

        // Add relationships
        mermaidContent += '\n  %% Relationships\n';

        // Add edges from bus users to events
        busUsages.forEach(usage => {
            const classNodeId = classNodes.get(usage.className);
            const eventNodeId = eventNodes.get(usage.eventType);

            if (classNodeId && eventNodeId) {
                mermaidContent += `  ${classNodeId} -->|${usage.busType}| ${eventNodeId}\n`;
            }
        });

        // Add edges from events to handlers
        handlerDeclarations.forEach(handler => {
            const classNodeId = classNodes.get(handler.className);
            const eventNodeId = eventNodes.get(handler.eventType);

            if (classNodeId && eventNodeId) {
                mermaidContent += `  ${eventNodeId} -->|${handler.handlerType}| ${classNodeId}\n`;
            }
        });

        // Add legend if requested
        if (options.includeLegend) {
            mermaidContent += '\n  %% Legend\n';
            mermaidContent += '  subgraph Legend\n';
            mermaidContent += '    leg_producer["Producer"]\n';
            mermaidContent += '    leg_consumer["Consumer"]\n';
            mermaidContent += '    leg_both["Both"]\n';
            mermaidContent += '    leg_event["Event/Command/Query"]\n';
            mermaidContent += '  end\n';
            mermaidContent += '  class leg_producer producer\n';
            mermaidContent += '  class leg_consumer consumer\n';
            mermaidContent += '  class leg_both both\n';
            mermaidContent += '  class leg_event event\n';
        }

        // Define styles using classDef
        mermaidContent += '\n  %% Style definitions\n';
        mermaidContent += '  classDef producer fill:#d4e6f1,stroke:#2874a6,stroke-width:1px\n';
        mermaidContent += '  classDef consumer fill:#d5f5e3,stroke:#1e8449,stroke-width:1px\n';
        mermaidContent += '  classDef both fill:#e8daef,stroke:#8e44ad,stroke-width:1px\n';
        mermaidContent += '  classDef event fill:#fcf3cf,stroke:#d4ac0d,stroke-width:1px,style:rounded\n';

        return mermaidContent;
    }

    /**
     * Generate HTML content with embedded Mermaid diagram
     * @param mermaidContent - The Mermaid diagram content
     * @param title - Title for the HTML page
     * @param theme - Theme for the diagram
     * @returns HTML content as string
     */
    private generateHtmlContent(mermaidContent: string, title: string, theme: string): string {
        return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10.3.0/dist/mermaid.min.js"></script>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 0;
      padding: 20px;
    }
    #diagram {
      width: 100%;
      overflow: auto;
    }
    .mermaid {
      display: flex;
      justify-content: center;
    }
    .buttons {
      margin: 20px 0;
      text-align: center;
    }
    button {
      background-color: #4CAF50;
      border: none;
      color: white;
      padding: 10px 20px;
      text-align: center;
      text-decoration: none;
      display: inline-block;
      font-size: 16px;
      margin: 4px 2px;
      cursor: pointer;
      border-radius: 5px;
    }
    .error {
      color: red;
      text-align: center;
      padding: 20px;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <div class="buttons">
    <button id="download-svg">Download SVG</button>
    <button id="download-png">Download PNG</button>
  </div>
  <div id="diagram">
    <pre class="mermaid">
${mermaidContent}
    </pre>
  </div>
  <div id="error" class="error" style="display: none;"></div>

  <script>
    mermaid.initialize({
      startOnLoad: true,
      theme: '${theme}',
      flowchart: {
        useMaxWidth: false,
        htmlLabels: true,
        curve: 'linear'
      },
      maxTextSize: 500000,
      maxEdges: 5000
    });

    // Error handling
    mermaid.parseError = function(err, hash) {
      document.getElementById('error').style.display = 'block';
      document.getElementById('error').textContent = 'Error rendering diagram: ' + err;
      console.error('Mermaid error:', err);
    };

    // Wait for Mermaid to render the diagram
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(function() {
        const svgElement = document.querySelector('#diagram svg');
        
        if (!svgElement) {
          document.getElementById('error').style.display = 'block';
          document.getElementById('error').textContent = 'Failed to render diagram. Check browser console for more information.';
          return;
        }
        
        // Download SVG
        document.getElementById('download-svg').addEventListener('click', function() {
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const blob = new Blob([svgData], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          
          const link = document.createElement('a');
          link.href = url;
          link.download = '${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.svg';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        });
        
        // Download PNG
        document.getElementById('download-png').addEventListener('click', function() {
          const canvas = document.createElement('canvas');
          const svgRect = svgElement.getBoundingClientRect();
          canvas.width = svgRect.width;
          canvas.height = svgRect.height;
          
          const ctx = canvas.getContext('2d');
          const image = new Image();
          const svgData = new XMLSerializer().serializeToString(svgElement);
          const blob = new Blob([svgData], { type: 'image/svg+xml' });
          const url = URL.createObjectURL(blob);
          
          image.onload = function() {
            ctx.drawImage(image, 0, 0);
            const pngUrl = canvas.toDataURL('image/png');
            
            const link = document.createElement('a');
            link.href = pngUrl;
            link.download = '${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          };
          
          image.src = url;
        });
      }, 1000); // Wait for Mermaid to render
    });
  </script>
</body>
</html>
`;
    }

    /**
     * Check if Mermaid CLI is installed
     * @returns Boolean indicating if Mermaid CLI is available
     */
    private async checkMermaidCli(): Promise<boolean> {
        try {
            await execFileAsync('mmdc', ['--version']);
            return true;
        } catch (error) {
            return false;
        }
    }

    /**
     * Generate SVG directly using Mermaid CLI
     * @param mermaidPath - Path to the Mermaid file
     * @param svgPath - Path for the output SVG file
     * @param theme - Theme to use for the diagram
     * @returns Boolean indicating success
     */
    private async generateSvgWithMermaidCli(
        mermaidPath: string,
        svgPath: string,
        theme: string
    ): Promise<boolean> {
        try {
            // Create a temporary configuration file for Mermaid CLI
            const configPath = path.join(path.dirname(mermaidPath), 'mermaid-config.json');
            const configContent = JSON.stringify({
                theme,
                maxTextSize: 500000,
                maxEdges: 5000,
                flowchart: {
                    useMaxWidth: false,
                    htmlLabels: true,
                    curve: 'linear'
                }
            });

            await fs.writeFile(configPath, configContent);

            try {
                await execFileAsync('mmdc', [
                    '-i', mermaidPath,
                    '-o', svgPath,
                    '-t', theme,
                    '-b', 'transparent',
                    '-c', configPath
                ]);

                return true;
            } finally {
                // Always clean up the temporary config file
                await fs.remove(configPath);
            }
        } catch (error) {
            console.error('Error generating SVG with Mermaid CLI:', error);
            return false;
        }
    }
}
