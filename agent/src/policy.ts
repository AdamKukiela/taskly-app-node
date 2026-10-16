import ts from 'typescript';
import { AgentError, type Analysis, type Candidate } from './contracts.ts';

export function safePath(path: string): boolean {
  return /^[a-zA-Z0-9_@./-]+$/.test(path) && !path.startsWith('/') &&
    !path.split('/').some(part => part === '..' || part === '.' || part === '');
}
export function testPath(path: string): boolean {
  return safePath(path) && (/^backend\/tests\/.+\.test\.ts$/.test(path) ||
    /^frontend\/src\/.+\.test\.tsx?$/.test(path));
}
export function sourcePath(path: string): boolean {
  return safePath(path) && /^(backend|frontend)\/src\/.+\.tsx?$/.test(path) &&
    !/\.(test|stories|d)\.tsx?$/.test(path) && !path.includes('/generated/');
}
export function requiresReview(paths: string[]): boolean {
  return paths.some(path => !safePath(path) ||
    /^(agent\/|\.github\/|\.agents\/|\.claude\/|\.brain\/)/.test(path) ||
    /(^|\/)(AGENTS\.md|CLAUDE\.md|package(-lock)?\.json|.*lock.*|.*config\.[^/]+|Dockerfile|\.npmrc|\.yarnrc.*|\.gitattributes|\.node-version|\.nvmrc)$/.test(path) ||
    path === 'frontend/src/test/setup.ts' ||
    /^backend\/prisma\//.test(path));
}
export function validateAnalysis(analysis: Analysis, sources: string[]): Set<string> {
  const permitted = new Set<string>();
  if (analysis.decision === 'skip' && sources.length && !analysis.evidence.length) {
    throw new AgentError('NEEDS_REVIEW', 'Skipping changed behavior requires evidence from existing tests.');
  }
  if (['generate', 'update'].includes(analysis.decision) && !analysis.targets.length) {
    throw new AgentError('NEEDS_REVIEW', 'Analysis proposed no concrete test targets.');
  }
  for (const target of analysis.targets) {
    if (!sources.includes(target.source) || !testPath(target.test) || target.source.split('/')[0] !== target.test.split('/')[0]) {
      throw new AgentError('NEEDS_REVIEW', `Analysis selected an unsupported source or test: ${target.source} → ${target.test}`);
    }
    permitted.add(target.test);
  }
  return permitted;
}
export function validateTest(path: string, content: string): void {
  const syntax = ts.createSourceFile(path, content, ts.ScriptTarget.Latest, true,
    path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = new Set(['it', 'test', 'describe']);
  const expectations = new Set(['expect']);
  for (const statement of syntax.statements) {
    if (ts.isImportDeclaration(statement) && statement.moduleSpecifier.getText(syntax).includes('vitest')) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const binding of bindings.elements) {
          if (['it', 'test', 'describe'].includes(binding.propertyName?.text ?? binding.name.text)) names.add(binding.name.text);
          if ((binding.propertyName?.text ?? binding.name.text) === 'expect') expectations.add(binding.name.text);
        }
      }
    }
  }
  let assertions = 0;
  function visit(node: ts.Node): void {
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const property = ts.isPropertyAccessExpression(node) ? node.name.text :
        node.argumentExpression && ts.isStringLiteral(node.argumentExpression) ? node.argumentExpression.text : '';
      const expression = node.expression.getText(syntax);
      if (['skip', 'only', 'todo', 'skipIf', 'runIf'].includes(property) &&
          [...names].some(name => new RegExp(`\\b${name}\\b`).test(expression))) {
        throw new AgentError('NEEDS_REVIEW', `Disabled or focused test in ${path}`);
      }
    }
    if (ts.isCallExpression(node) && (ts.isPropertyAccessExpression(node.expression) || ts.isElementAccessExpression(node.expression))) {
      let subject = node.expression.expression;
      while (ts.isPropertyAccessExpression(subject) || ts.isElementAccessExpression(subject)) subject = subject.expression;
      if (ts.isCallExpression(subject)) {
        const callee = subject.expression;
        if (ts.isIdentifier(callee) && expectations.has(callee.text) ||
            ts.isPropertyAccessExpression(callee) && ['soft', 'poll'].includes(callee.name.text) &&
            ts.isIdentifier(callee.expression) && expectations.has(callee.expression.text)) assertions++;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(syntax);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, content);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if ([ts.SyntaxKind.SingleLineCommentTrivia, ts.SyntaxKind.MultiLineCommentTrivia].includes(token) &&
        /@ts-(ignore|nocheck)|eslint-disable|(?:v8|istanbul|c8)\s+ignore/i.test(scanner.getTokenText())) {
      throw new AgentError('NEEDS_REVIEW', `Suppressed validation in ${path}`);
    }
  }
  if (!assertions) throw new AgentError('NEEDS_REVIEW', `No assertions in ${path}`);
}
export function validateCandidate(candidate: Candidate, permitted: Set<string>): void {
  if (candidate.decision !== 'propose' || !candidate.files.length) throw new AgentError('NEEDS_REVIEW', candidate.reason);
  const seen = new Set<string>();
  for (const file of candidate.files) {
    if (!testPath(file.path) || !permitted.has(file.path) || seen.has(file.path)) {
      throw new AgentError('NEEDS_REVIEW', `Unexpected test path: ${file.path}`);
    }
    seen.add(file.path);
    validateTest(file.path, file.content);
  }
}
