import * as fs from 'fs-extra';
import * as path from 'path';
import * as ts from 'typescript';
import { AnalysisResult, BusType, HandlerType } from '../types';

/**
 * Find all TypeScript files in a directory recursively
 * @param dir - The directory to search
 * @returns An array of file paths
 */
export async function findTsFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    const processEntries = entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        const nestedFiles = await findTsFiles(fullPath);
        files.push(...nestedFiles);
      } else if (isTypeScriptFile(entry.name)) {
        files.push(fullPath);
      }
    });
    
    await Promise.all(processEntries);
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return files;
}

/**
 * Check if a file is a TypeScript source file
 * @param fileName - The file name to check
 * @returns Boolean indicating if it's a TypeScript source file
 */
export function isTypeScriptFile(fileName: string): boolean {
  // Include only .ts files
  if (!fileName.endsWith('.ts')) {
    return false;
  }
  
  // Exclude files of certain types
  const excludePatterns = [
    '.d.ts',        // Type definitions
    '.spec.ts',     // Tests
    '.test.ts',     // Tests
    '.mock.ts',     // Mocks
    '.fixture.ts',  // Test fixtures
    '.e2e-spec.ts'  // E2E tests
  ];
  
  return !excludePatterns.some(pattern => fileName.endsWith(pattern));
}

/**
 * Extract class name from node or its parents
 * @param node - The TypeScript AST node
 * @returns The class name or null if not found
 */
export function findParentClass(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;
  
  while (current) {
    if (ts.isClassDeclaration(current) && current.name) {
      return current.name.text;
    }
    current = current.parent;
  }
  
  return null;
}

/**
 * Find the method name containing a node
 * @param node - The TypeScript AST node
 * @returns The method name or null if not found
 */
export function findMethodName(node: ts.Node): string | null {
  let current: ts.Node | undefined = node;
  
  while (current) {
    if (ts.isMethodDeclaration(current) && current.name) {
      return ts.isIdentifier(current.name) ? current.name.text : null;
    }
    current = current.parent;
  }
  
  return null;
}

/**
 * Extract type argument from a call expression
 * @param node - The call expression node
 * @param sourceFile - The source file
 * @returns The extracted type as string
 */
export function extractTypeArgument(node: ts.CallExpression, sourceFile: ts.SourceFile): string {
  // Check for explicit type arguments
  if (node.typeArguments && node.typeArguments.length > 0) {
    const typeArg = node.typeArguments[0];
    return typeArg.getText(sourceFile);
  }
  
  // Try to infer from arguments if it's a call expression
  if (node.arguments.length > 0) {
    const firstArg = node.arguments[0];
    
    // Check if argument is a new expression (new SomeClass())
    if (ts.isNewExpression(firstArg) && ts.isIdentifier(firstArg.expression)) {
      return firstArg.expression.text;
    }
    
    // Check if argument is a class reference
    if (ts.isIdentifier(firstArg)) {
      return firstArg.text;
    }
    
    // Check if it's a property access like SomeModule.SomeClass
    if (ts.isPropertyAccessExpression(firstArg) && ts.isIdentifier(firstArg.name)) {
      return firstArg.name.text;
    }
  }
  
  return 'Unknown';
}

/**
 * Determine bus type from an object name
 * @param objectName - The object name to check
 * @returns The bus type or null if not a bus
 */
export function determineBusType(objectName: string): BusType | null {
  const lowerName = objectName.toLowerCase();
  
  if (lowerName.includes('event') && lowerName.includes('bus')) return 'EventBus';
  if (lowerName.includes('query') && lowerName.includes('bus')) return 'QueryBus';
  if (lowerName.includes('command') && lowerName.includes('bus')) return 'CommandBus';
  
  return null;
}

/**
 * Get object name from property access expression
 * @param expr - The expression to extract from
 * @returns The object name
 */
export function getObjectName(expr: ts.Expression): string {
  if (ts.isIdentifier(expr)) {
    return expr.text;
  }
  
  if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) {
    return expr.name.text;
  }
  
  return '';
}

/**
 * Get line and character position from a node
 * @param node - The node to get position for
 * @param sourceFile - The source file
 * @returns Line and character position
 */
export function getLineAndCharacter(node: ts.Node, sourceFile: ts.SourceFile): ts.LineAndCharacter {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart());
}

/**
 * Process a potential bus usage node
 * @param node - The node to process
 * @param sourceFile - The source file
 * @param filePath - Path to the file
 * @param result - Analysis result to update
 */
export function processPotentialBusUsage(
  node: ts.CallExpression, 
  sourceFile: ts.SourceFile, 
  filePath: string,
  result: AnalysisResult
): void {
  if (!ts.isPropertyAccessExpression(node.expression)) return;
  
  const propAccess = node.expression;
  if (!ts.isIdentifier(propAccess.name)) return;
  
  const methodName = propAccess.name.text;
  
  // Methods like publish, execute that indicate bus usage
  if (!['publish', 'execute', 'dispatch'].includes(methodName)) return;
  
  const objectName = getObjectName(propAccess.expression);
  const busType = determineBusType(objectName);
  
  if (!busType) return;
  
  const className = findParentClass(node) || 'Unknown';
  const enclosingMethod = findMethodName(node);
  const eventType = extractTypeArgument(node, sourceFile);
  
  result.busUsages.push({
    sourceFile: filePath,
    className,
    methodName: enclosingMethod,
    busType,
    eventType,
    position: getLineAndCharacter(node, sourceFile)
  });
}

/**
 * Process a class declaration for handler decorators
 * @param node - The class to process
 * @param sourceFile - The source file
 * @param filePath - Path to the file
 * @param result - Analysis result to update
 */
export function processHandlerDeclaration(
  node: ts.ClassDeclaration, 
  sourceFile: ts.SourceFile, 
  filePath: string,
  result: AnalysisResult
): void {
  // Skip if no name
  if (!node.name) return;
  
  const className = node.name.text;
  
  // Parse decorators manually since TypeScript's decorator API can be inconsistent
  // First, check if there are any decorator syntax in the class declaration
  const nodeText = node.getText(sourceFile);
  const decoratorMatches = Array.from(nodeText.matchAll(/@(QueryHandler|CommandHandler|EventsHandler)\s*\(([^)]*)\)/g));
  
  for (const match of decoratorMatches) {
    const handlerType = match[1] as HandlerType;
    const argsText = match[2].trim();
    
    // Try to extract event type from decorator args
    let eventType = 'Unknown';
    
    // Match for class names as arguments
    const classNameMatch = argsText.match(/([A-Za-z0-9_]+)/);
    if (classNameMatch) {
      eventType = classNameMatch[1];
    }
    
    result.handlerDeclarations.push({
      sourceFile: filePath,
      className,
      handlerType,
      eventType,
      position: getLineAndCharacter(node, sourceFile)
    });
  }
  
  // Also try the TypeScript API approach for completeness
  try {
    if (typeof ts.canHaveDecorators === 'function' && typeof ts.getDecorators === 'function') {
      if (ts.canHaveDecorators(node)) {
        const decorators = ts.getDecorators(node as ts.HasDecorators);
        
        if (decorators) {
          for (const decorator of decorators) {
            if (!ts.isDecorator(decorator)) continue;
            
            const expression = decorator.expression;
            if (!ts.isCallExpression(expression)) continue;
            
            if (!ts.isIdentifier(expression.expression)) continue;
            
            const decoratorName = expression.expression.text;
            
            if (decoratorName !== 'QueryHandler' && 
                decoratorName !== 'CommandHandler' && 
                decoratorName !== 'EventsHandler') continue;
            
            const handlerType = decoratorName as HandlerType;
            const eventType = extractTypeArgument(expression, sourceFile);
            
            // Check if we already found this handler via regex
            const exists = result.handlerDeclarations.some(
              h => h.className === className && h.handlerType === handlerType
            );
            
            if (!exists) {
              result.handlerDeclarations.push({
                sourceFile: filePath,
                className,
                handlerType,
                eventType,
                position: getLineAndCharacter(node, sourceFile)
              });
            }
          }
        }
      }
    }
  } catch (e) {
    // Fallback to just using the regex results if TS API fails
    console.log(`Note: Using regex-based decorator detection for ${className}`);
  }
}

/**
 * Visitor function to analyze the AST
 * @param node - The node to visit
 * @param sourceFile - The source file
 * @param filePath - Path to the file
 * @param result - Analysis result to update
 */
export function visitNode(node: ts.Node, sourceFile: ts.SourceFile, filePath: string, result: AnalysisResult): void {
  // Check for bus usages
  if (ts.isCallExpression(node)) {
    processPotentialBusUsage(node, sourceFile, filePath, result);
  }
  
  // Check for handler declarations
  if (ts.isClassDeclaration(node)) {
    processHandlerDeclaration(node, sourceFile, filePath, result);
  }
  
  // Visit children recursively
  ts.forEachChild(node, child => visitNode(child, sourceFile, filePath, result));
}

/**
 * Analyze a TypeScript file for CQRS patterns
 * @param filePath - Path to the TypeScript file
 * @param result - The analysis result to populate
 */
export async function analyzeFile(filePath: string, result: AnalysisResult): Promise<void> {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const sourceFile = ts.createSourceFile(
      filePath,
      fileContent,
      ts.ScriptTarget.Latest,
      true
    );
    
    const compilerOptions = ts.getDefaultCompilerOptions();
    compilerOptions.experimentalDecorators = true;
    
    // Start the analysis from the root node
    visitNode(sourceFile, sourceFile, filePath, result);
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error);
  }
}
