import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { parseTemplate } from '@angular/compiler';

const root = path.resolve(import.meta.dirname, '../src/app');
const messages = JSON.parse(fs.readFileSync(path.join(root, 'core/translations.en.json'), 'utf8'));
const missing = new Set();
const parsed = new Set();
function inspect(template, file) {
  if (parsed.has(file)) return;
  parsed.add(file);
  const result = parseTemplate(template, file);
  if (result.errors?.length) throw new Error(result.errors.map(String).join('\n'));
  const seen = new Set();
  function literalKeys(expression) {
    if (!expression) return;
    if (
      expression.constructor.name === 'LiteralPrimitive' &&
      typeof expression.value === 'string' &&
      expression.value.trim()
    ) {
      if (!Object.hasOwn(messages, expression.value.replace(/\s+/g, ' ').trim()))
        missing.add(`${file}: ${expression.value}`);
    }
    if (expression.constructor.name === 'Conditional') {
      literalKeys(expression.trueExp);
      literalKeys(expression.falseExp);
    }
    if (expression.constructor.name === 'ParenthesizedExpression')
      literalKeys(expression.expression);
  }
  function walk(node) {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);
    if (node.constructor.name === 'BindingPipe' && node.name === 't') literalKeys(node.exp);
    for (const [key, value] of Object.entries(node)) {
      if (/span|location/i.test(key)) continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object') walk(value);
    }
  }
  result.nodes.forEach(walk);
}
for (const relative of fs
  .readdirSync(root, { recursive: true })
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))) {
  const file = path.join(root, relative);
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  function walk(node) {
    if (ts.isPropertyAssignment(node)) {
      if (
        node.name.getText(source) === 'template' &&
        ts.isNoSubstitutionTemplateLiteral(node.initializer)
      )
        inspect(node.initializer.text, relative);
      if (node.name.getText(source) === 'templateUrl' && ts.isStringLiteral(node.initializer)) {
        const target = path.resolve(path.dirname(file), node.initializer.text);
        inspect(fs.readFileSync(target, 'utf8'), path.relative(root, target));
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(source);
}
if (missing.size) {
  console.error([...missing].join('\n'));
  process.exitCode = 1;
} else
  console.log(`Translation catalogue covers all literal keys in ${parsed.size} Angular templates.`);
