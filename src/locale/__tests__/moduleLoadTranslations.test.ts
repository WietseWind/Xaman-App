/**
 * Guardrail: a translation made while a module loads can run before Localize.setLocale and stays
 * "[missing … translation]" for the whole session. Since expo/metro-config (inlineRequires off) modules
 * imported by app.tsx load at startup; the payload errors did (e2e on build 474). Translate when used.
 * The one reviewed exception is listed below with why it is safe.
 */
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const SRC = path.resolve(__dirname, '../..');

const REVIEWED: { [file: string]: string } = {
    // the strength meter labels: PasswordInput first loads when a screen using it is registered and
    // rendered, after setLocale (seen translated in e2e). Move them into render if that ever changes.
    'components/General/PasswordInput/PasswordInput.tsx': 'strength meter labels',
};

const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return ['__tests__', '__mocks__', 'locale'].includes(entry.name) ? [] : sourceFiles(full);
        }
        return /\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [full] : [];
    });

// code inside these runs later (when called or instantiated), not while the module loads
const DEFERRED = new Set([
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.Constructor,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
]);

const isTranslateCall = (node: ts.Node) =>
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === 't' &&
    ts.isIdentifier(node.expression.expression) &&
    ['Localize', 'Locale'].includes(node.expression.expression.text);

const translatesAtModuleLoad = (file: string): boolean => {
    const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
    let found = false;

    const visit = (node: ts.Node, deferred: boolean) => {
        if (!deferred && isTranslateCall(node)) {
            found = true;
        }
        // instance properties run per instance; static ones run while the class is defined
        const isInstanceProperty =
            ts.isPropertyDeclaration(node) &&
            !(ts.getCombinedModifierFlags(node) & ts.ModifierFlags.Static);
        ts.forEachChild(node, (child) => visit(child, deferred || DEFERRED.has(node.kind) || isInstanceProperty));
    };
    visit(source, false);

    return found;
};

describe('translations', () => {
    it('are not made while a module loads (only reviewed exceptions)', () => {
        const files = sourceFiles(SRC)
            .filter(translatesAtModuleLoad)
            .map((file) => path.relative(SRC, file).split(path.sep).join('/'))
            .sort();

        expect(files).toEqual(Object.keys(REVIEWED).sort());
    });
});
