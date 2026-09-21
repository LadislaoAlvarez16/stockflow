import * as fs from 'fs';
import * as path from 'path';

function walk(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach(function (file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.ts')) {
      results.push(file);
    }
  });
  return results;
}

describe('Guard Test - N-05 Template Literals', () => {
  it('should not contain escaped template literals', () => {
    const files = walk(path.join(process.cwd(), 'src'));
    const invalidFiles: string[] = [];

    files.forEach((file) => {
      // Ignore spec files
      if (file.includes('.spec.ts')) return;

      const content = fs.readFileSync(file, 'utf8');
      
      // We look for \${ or \`
      const hasEscapedLiteral = /\\\$\{/.test(content);
      const hasEscapedBacktick = /\\`/.test(content);

      if (hasEscapedLiteral || hasEscapedBacktick) {
        invalidFiles.push(file);
      }
    });

    expect(invalidFiles).toEqual([]);
  });
});
