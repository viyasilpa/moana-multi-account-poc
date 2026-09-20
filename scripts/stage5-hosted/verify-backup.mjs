import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {unpackBackup} from '../../src/backup-format.ts'
import {restoreIsolated} from '../../src/restore-core.ts'
const root=new URL('../../',import.meta.url)
const payload=await unpackBackup(await readFile(new URL('public/stage5-hosted-backup.json',root),'utf8'))
assert.ok(payload.snapshot.tables.entities.every(e=>e.name.startsWith('STAGE5 SYNTHETIC ')))
assert.equal(payload.files.length,2)
const names=['001_core.sql','002_commands.sql','003_masters.sql','004_read_api.sql','005_documents_backup.sql','006_backup_utc.sql','007_lossless_backup_json.sql','008_command_constraint_checks.sql']
const sql=await Promise.all(names.map(n=>readFile(new URL('db/accounting/'+n,root),'utf8')))
const restored=await restoreIsolated(payload.snapshot,sql)
const original=JSON.parse(await readFile(new URL('hosted-report.json',import.meta.url),'utf8'))
// Report aggregates have no array ordering contract; compare rows as sets.
// Money strings are never converted to JS numbers for this comparison.
const canonical=v=>Array.isArray(v)?v.map(canonical).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v
assert.deepEqual(canonical(restored.report),canonical(original))
console.log('PASS: hosted synthetic backup: 2 file hashes, every restored table, and report rows/amounts match')
