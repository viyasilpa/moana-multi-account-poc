import core from '../db/accounting/001_core.sql?raw'
import commands from '../db/accounting/002_commands.sql?raw'
import masters from '../db/accounting/003_masters.sql?raw'
import reads from '../db/accounting/004_read_api.sql?raw'
import documents from '../db/accounting/005_documents_backup.sql?raw'
import utc from '../db/accounting/006_backup_utc.sql?raw'
import lossless from '../db/accounting/007_lossless_backup_json.sql?raw'
import {restoreIsolated} from './restore-core'
import {unpackBackup} from './backup-format'
export async function checkBackup(text:string) {
 const data=await unpackBackup(text)
 const result=await restoreIsolated(data.snapshot,[core,commands,masters,reads,documents,utc,lossless])
 return {...result,files:data.files.length}
}
