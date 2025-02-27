import {
    AnalysisResult,
    ArchitectureAnalysisResult,
    ArchitectureIssue,
    IssueSeverity
} from '../types';

/**
 * Analyze CQRS architecture for potential issues
 * @param result - Analysis result from file analysis
 * @returns Architecture analysis result with issues and metrics
 */
export function analyzeArchitecture(result: AnalysisResult): ArchitectureAnalysisResult {
    const issues: ArchitectureIssue[] = [];

    // Collect classes that use buses (event producers)
    const busUsers = new Set<string>();
    result.busUsages.forEach(usage => {
        busUsers.add(usage.className);
    });

    // Collect handler classes (event consumers)
    const handlerClasses = new Set<string>();
    result.handlerDeclarations.forEach(handler => {
        handlerClasses.add(handler.className);
    });

    // Find classes that both produce and consume events
    const dualRoleClasses = new Set<string>();
    busUsers.forEach(className => {
        if (handlerClasses.has(className)) {
            dualRoleClasses.add(className);
        }
    });

    // Analyze coupling (number of connections per class)
    const classCouplingCount = new Map<string, number>();
    result.busUsages.forEach(usage => {
        const count = classCouplingCount.get(usage.className) || 0;
        classCouplingCount.set(usage.className, count + 1);
    });

    result.handlerDeclarations.forEach(handler => {
        const count = classCouplingCount.get(handler.className) || 0;
        classCouplingCount.set(handler.className, count + 1);
    });

    // Find classes with high coupling (more than 5 connections)
    const highCouplingClasses: Array<{className: string; connections: number}> = [];
    classCouplingCount.forEach((count, className) => {
        if (count > 5) {
            highCouplingClasses.push({
                className,
                connections: count
            });
        }
    });

    // Map events to their producers and consumers
    const eventEmitters = new Map<string, string[]>();
    result.busUsages.forEach(usage => {
        if (!eventEmitters.has(usage.eventType)) {
            eventEmitters.set(usage.eventType, []);
        }
        eventEmitters.get(usage.eventType)?.push(usage.className);
    });

    const eventHandlers = new Map<string, string[]>();
    result.handlerDeclarations.forEach(handler => {
        if (!eventHandlers.has(handler.eventType)) {
            eventHandlers.set(handler.eventType, []);
        }
        eventHandlers.get(handler.eventType)?.push(handler.className);
    });

    // Find events without handlers
    const unhandledEvents: string[] = [];
    eventEmitters.forEach((emitters, eventType) => {
        if (!eventHandlers.has(eventType) || eventHandlers.get(eventType)?.length === 0) {
            unhandledEvents.push(eventType);
        }
    });

    // Find handlers for events that aren't produced
    const orphanHandlers: string[] = [];
    eventHandlers.forEach((handlers, eventType) => {
        if (!eventEmitters.has(eventType) || eventEmitters.get(eventType)?.length === 0) {
            orphanHandlers.push(eventType);
        }
    });

    // Calculate average number of connections per class
    let totalConnections = 0;
    let classCount = 0;
    classCouplingCount.forEach((count) => {
        totalConnections += count;
        classCount++;
    });
    const averageConnections = classCount > 0 ? totalConnections / classCount : 0;

    // Add issue: Classes with dual roles (SRP violation)
    if (dualRoleClasses.size > 0) {
        issues.push({
            type: 'SingleResponsibilityViolation',
            severity: IssueSeverity.WARNING,
            description: 'Classes that both produce and consume events may violate the Single Responsibility Principle',
            elements: Array.from(dualRoleClasses)
        });
    }

    // Add issue: High coupling
    if (highCouplingClasses.length > 0) {
        issues.push({
            type: 'HighCoupling',
            severity: IssueSeverity.WARNING,
            description: 'Classes with too many connections may be difficult to maintain and test',
            elements: highCouplingClasses.map(c => c.className),
            context: highCouplingClasses
        });
    }

    // Add issue: Unhandled events
    if (unhandledEvents.length > 0) {
        issues.push({
            type: 'UnhandledEvents',
            severity: IssueSeverity.ERROR,
            description: 'Events that are produced but not handled may indicate incomplete implementation',
            elements: unhandledEvents,
            context: unhandledEvents.map(e => ({
                eventType: e,
                producers: eventEmitters.get(e) || []
            }))
        });
    }

    // Add issue: Orphan handlers
    if (orphanHandlers.length > 0) {
        issues.push({
            type: 'OrphanHandlers',
            severity: IssueSeverity.WARNING,
            description: 'Handlers for events that are not produced may be dead code',
            elements: orphanHandlers,
            context: orphanHandlers.map(e => ({
                eventType: e,
                handlers: eventHandlers.get(e) || []
            }))
        });
    }

    // Collect all unique event types
    const allEventTypes = new Set<string>();
    result.busUsages.forEach(usage => allEventTypes.add(usage.eventType));
    result.handlerDeclarations.forEach(handler => allEventTypes.add(handler.eventType));

    // Return analysis result
    return {
        issues,
        metrics: {
            totalClasses: classCouplingCount.size,
            totalEvents: allEventTypes.size,
            eventProducers: busUsers.size,
            eventConsumers: handlerClasses.size,
            dualRoleClasses: dualRoleClasses.size,
            orphanEvents: unhandledEvents.length,
            orphanHandlers: orphanHandlers.length,
            averageConnections
        }
    };
}

/**
 * Generate a markdown report from architecture analysis
 * @param analysis - The architecture analysis result
 * @returns Markdown string with the report
 */
export function generateMarkdownReport(analysis: ArchitectureAnalysisResult): string {
    const { issues, metrics } = analysis;

    const lines: string[] = [];

    // Add title
    lines.push('# CQRS Architecture Analysis Report');
    lines.push('');

    // Add metrics
    lines.push('## Architecture Metrics');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('| ------ | ----- |');
    lines.push(`| Total Classes | ${metrics.totalClasses} |`);
    lines.push(`| Total Events/Commands/Queries | ${metrics.totalEvents} |`);
    lines.push(`| Event Producers | ${metrics.eventProducers} |`);
    lines.push(`| Event Consumers | ${metrics.eventConsumers} |`);
    lines.push(`| Classes with Dual Roles | ${metrics.dualRoleClasses} |`);
    lines.push(`| Unhandled Events | ${metrics.orphanEvents} |`);
    lines.push(`| Orphan Handlers | ${metrics.orphanHandlers} |`);
    lines.push(`| Average Connections per Class | ${metrics.averageConnections.toFixed(2)} |`);
    lines.push('');

    // Add issues
    if (issues.length === 0) {
        lines.push('## Issues');
        lines.push('');
        lines.push('No issues detected in the architecture.');
        lines.push('');
    } else {
        lines.push('## Issues');
        lines.push('');

        // Group issues by severity
        const errorIssues = issues.filter(i => i.severity === IssueSeverity.ERROR);
        const warningIssues = issues.filter(i => i.severity === IssueSeverity.WARNING);
        const infoIssues = issues.filter(i => i.severity === IssueSeverity.INFO);

        if (errorIssues.length > 0) {
            lines.push('### Errors');
            lines.push('');
            errorIssues.forEach(issue => {
                lines.push(`#### ${issue.type}`);
                lines.push('');
                lines.push(issue.description);
                lines.push('');
                lines.push('**Affected Elements:**');
                lines.push('');
                issue.elements.forEach(element => {
                    lines.push(`- ${element}`);
                });
                lines.push('');
            });
        }

        if (warningIssues.length > 0) {
            lines.push('### Warnings');
            lines.push('');
            warningIssues.forEach(issue => {
                lines.push(`#### ${issue.type}`);
                lines.push('');
                lines.push(issue.description);
                lines.push('');
                lines.push('**Affected Elements:**');
                lines.push('');
                issue.elements.forEach(element => {
                    lines.push(`- ${element}`);
                });
                lines.push('');
            });
        }

        if (infoIssues.length > 0) {
            lines.push('### Information');
            lines.push('');
            infoIssues.forEach(issue => {
                lines.push(`#### ${issue.type}`);
                lines.push('');
                lines.push(issue.description);
                lines.push('');
                lines.push('**Affected Elements:**');
                lines.push('');
                issue.elements.forEach(element => {
                    lines.push(`- ${element}`);
                });
                lines.push('');
            });
        }
    }

    // Add recommendations
    lines.push('## Recommendations');
    lines.push('');
    lines.push('1. **Single Responsibility Principle**: Classes should either produce events or handle them, not both.');
    lines.push('2. **Reduce Coupling**: Classes with many connections should be refactored into smaller, more focused components.');
    lines.push('3. **Complete Implementation**: Ensure all events have appropriate handlers.');
    lines.push('4. **Remove Dead Code**: Remove handlers for events that are not produced.');
    lines.push('5. **Consistent Naming**: Use consistent naming conventions for events, commands, and queries.');
    lines.push('');

    return lines.join('\n');
}
