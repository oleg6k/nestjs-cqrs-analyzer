# CQRS Analyzer

A tool for analyzing and visualizing Command Query Responsibility Segregation (CQRS) architectures in TypeScript/NestJS applications.

## Features

- **Architecture Analysis**: Scans your TypeScript codebase to identify CQRS patterns
- **Visualization**: Generates interactive diagrams showing relationships between components
- **Issue Detection**: Identifies potential issues in your CQRS architecture
- **Comprehensive Reports**: Provides detailed reports with metrics and recommendations

## Installation

```bash
# Global installation
npm install -g nestjs-cqrs-analyzer

# Or as a development dependency
npm install --save-dev nestjs-cqrs-analyzer
```

## Usage

### Command Line

```bash
# Basic usage
nestjs-cqrs-analyzer

# Specify source and output directories
nestjs-cqrs-analyzer --src src/modules --out ./cqrs-report

# Limit the number of edges in diagrams
nestjs-cqrs-analyzer --max-edges 200

# Specify diagram formats
nestjs-cqrs-analyzer --formats mermaid,html
```

### Options

- `--src, -s`: Source directory to analyze (default: "src")
- `--out, -o`: Output directory for results (default: "cqrs-analysis")
- `--max-edges, -m`: Maximum number of edges to include in diagrams (default: 0 = no limit)
- `--formats, -f`: Diagram formats to generate (comma-separated, default: "mermaid,html")
- `--no-report, -r`: Skip generating analysis report

### Programmatic API

```typescript
import { CQRSAnalyzer } from 'nestjs-cqrs-analyzer';

async function analyzeApp() {
  const analyzer = new CQRSAnalyzer({
    srcDir: 'src',
    outDir: 'cqrs-analysis',
    maxEdges: 300,
    generateReport: true,
    diagramFormat: ['mermaid', 'html']
  });
  
  const results = await analyzer.analyze();
  
  console.log(`Found ${results.architectureAnalysis.issues.length} potential issues`);
}

analyzeApp().catch(console.error);
```

## Generated Outputs

The analyzer generates the following outputs in the specified output directory:

1. **Analysis Report (MD)**: Detailed report with metrics and identified issues
2. **Mermaid Diagram (MMD)**: Mermaid.js diagram source
3. **HTML Visualization**: Interactive diagram with export capabilities
4. **SVG Diagram**: Static diagram (when Mermaid CLI is available)

## CQRS Architecture Detection

The analyzer detects the following CQRS components:

- **Command Buses**: Classes that dispatch commands
- **Query Buses**: Classes that execute queries
- **Event Buses**: Classes that publish events
- **Command Handlers**: Classes with @CommandHandler decorators
- **Query Handlers**: Classes with @QueryHandler decorators
- **Event Handlers**: Classes with @EventsHandler decorators

## Issue Detection

The analyzer identifies potential issues in your CQRS architecture:

- **Single Responsibility Violations**: Classes that both emit and handle events
- **High Coupling**: Classes with too many connections
- **Unhandled Events**: Events that are produced but not handled
- **Orphaned Handlers**: Handlers for events that are not produced

## Requirements

- Node.js 14+
- TypeScript codebase using CQRS patterns (works best with NestJS)
- Optional: Mermaid CLI for SVG generation (`npm install -g @mermaid-js/mermaid-cli`)

## License

MIT
