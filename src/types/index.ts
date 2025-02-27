import * as ts from 'typescript';

/**
 * Types of message buses in CQRS
 */
export type BusType = 'EventBus' | 'QueryBus' | 'CommandBus';

/**
 * Types of message handlers in CQRS
 */
export type HandlerType = 'QueryHandler' | 'CommandHandler' | 'EventsHandler';

/**
 * Represents a bus usage (sending an event/command/query)
 */
export interface BusUsage {
  sourceFile: string;
  className: string;
  methodName: string | null;
  busType: BusType;
  eventType: string;
  position: ts.LineAndCharacter;
}

/**
 * Represents a handler declaration
 */
export interface HandlerDeclaration {
  sourceFile: string;
  className: string;
  handlerType: HandlerType;
  eventType: string;
  position: ts.LineAndCharacter;
}

/**
 * Result of CQRS analysis
 */
export interface AnalysisResult {
  busUsages: BusUsage[];
  handlerDeclarations: HandlerDeclaration[];
}

/**
 * Configuration options for the analyzer
 */
export interface AnalyzerOptions {
  /**
   * Maximum number of edges to include in the diagram. 0 means no limit.
   */
  maxEdges: number;
  
  /**
   * Source directory to analyze
   */
  srcDir?: string;
  
  /**
   * Output directory for generated files
   */
  outDir?: string;
  
  /**
   * Whether to generate an analysis report
   */
  generateReport?: boolean;
  
  /**
   * Diagram output format(s)
   */
  diagramFormat?: ('mermaid' | 'svg' | 'html')[];
}

/**
 * Issue severity levels
 */
export enum IssueSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error'
}

/**
 * Represents an architecture issue found in analysis
 */
export interface ArchitectureIssue {
  /**
   * Type of issue
   */
  type: string;
  
  /**
   * Severity level of the issue
   */
  severity: IssueSeverity;
  
  /**
   * Description of the issue
   */
  description: string;
  
  /**
   * Elements affected by the issue
   */
  elements: string[];
  
  /**
   * Additional context or details
   */
  context?: any;
}

/**
 * Result of architecture analysis
 */
export interface ArchitectureAnalysisResult {
  /**
   * List of issues found
   */
  issues: ArchitectureIssue[];
  
  /**
   * General metrics about the architecture
   */
  metrics: {
    totalClasses: number;
    totalEvents: number;
    eventProducers: number;
    eventConsumers: number;
    dualRoleClasses: number;
    orphanEvents: number;
    orphanHandlers: number;
    averageConnections: number;
  };
}
