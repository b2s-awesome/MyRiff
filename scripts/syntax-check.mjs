import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const root = process.cwd()
const files = []
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(full) && !full.endsWith('.d.ts')) files.push(full)
  }
}
walk(path.join(root, 'src'))
files.push(path.join(root, 'electron.vite.config.ts'))
let errors = 0
for (const file of files) {
  const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file,
    reportDiagnostics: true,
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX }
  })
  for (const diagnostic of result.diagnostics ?? []) {
    if (diagnostic.category !== ts.DiagnosticCategory.Error) continue
    errors++
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
    console.error(`${path.relative(root, file)}: ${message}`)
  }
}
if (errors) {
  console.error(`Syntax check failed: ${errors} error(s) in ${files.length} files.`)
  process.exitCode = 1
} else {
  console.log(`Syntax check passed: ${files.length} TypeScript/TSX files transpile cleanly.`)
}
