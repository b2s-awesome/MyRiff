import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import * as ts from 'typescript'

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'myriff-lrc-test-'))
const sourcePath = path.join(process.cwd(), 'src/shared/lrc.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
}).outputText
const compiledPath = path.join(tempDir, 'lrc-parser.mjs')
await fs.writeFile(compiledPath, compiled, 'utf8')
const { parseLrc } = await import(pathToFileURL(compiledPath).href)

test('standard LRC preserves line timestamps and ignores metadata headers', () => {
  assert.deepEqual(parseLrc('[ar:Example Artist]\n[ti:Example Song]\n[00:01.25]First line\n[00:03.5]Second line'), [
    { time: 1.25, text: 'First line' },
    { time: 3.5, text: 'Second line' }
  ])
})

test('Enhanced LRC captures authored timestamps for individual words', () => {
  const [line] = parseLrc('[00:01.00]<00:01.00>Hello <00:01.50>world<00:02.00>!')
  assert.deepEqual(line, {
    time: 1,
    text: 'Hello world!',
    words: [
      { time: 1, text: 'Hello ' },
      { time: 1.5, text: 'world' },
      { time: 2, text: '!' }
    ]
  })
})

test('Enhanced LRC without a line timestamp uses its first word timestamp', () => {
  assert.deepEqual(parseLrc('<00:02.25>One <00:02.75>two'), [{
    time: 2.25,
    text: 'One two',
    words: [{ time: 2.25, text: 'One ' }, { time: 2.75, text: 'two' }]
  }])
})

after(async () => { await fs.rm(tempDir, { recursive: true, force: true }) })
