export const tableNames=['settings','entities','parties','accounts','transactions','revisions','batches','lines','audit_events','requests','attachments'] as const
export type Snapshot={format:'moana-ledger';version:1;exported_at:string;tables:Record<typeof tableNames[number],Record<string,unknown>[]>;counts:Record<string,number>}
export type FileCopy={path:string;mime:string;size:number;sha256:string;base64:string}
export type BackupPayload={snapshot:Snapshot;files:FileCopy[]}
export const backupLimit=50*1024*1024
export async function digest(bytes:Uint8Array):Promise<string> {
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new Uint8Array(bytes)))).map(b=>b.toString(16).padStart(2,'0')).join('')
}
export function encode(bytes:Uint8Array):string {
 let s='';for(let i=0;i<bytes.length;i+=8192)s+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(s)
}
export function decode(s:string):Uint8Array {return Uint8Array.from(atob(s),c=>c.charCodeAt(0))}
export async function packBackup(payload:BackupPayload):Promise<string> {
 const data=JSON.stringify(payload)
 if(new TextEncoder().encode(data).length>backupLimit)throw new Error('ชุดสำรองเกิน 50 MB หยุดไว้โดยไม่สร้างสำเนาที่ไม่ครบ กรุณาติดต่อผู้ดูแล')
 return JSON.stringify({format:'moana-backup',version:1,sha256:await digest(new TextEncoder().encode(data)),data})
}
export async function unpackBackup(text:string):Promise<BackupPayload> {
 if(new TextEncoder().encode(text).length>backupLimit*1.1)throw new Error('backup_too_large')
 const e=JSON.parse(text)
 if(e?.format!=='moana-backup'||e.version!==1||typeof e.data!=='string'||await digest(new TextEncoder().encode(e.data))!==e.sha256)throw new Error('backup_integrity_failed')
 const p=JSON.parse(e.data) as BackupPayload,s=p.snapshot
 if(s?.format!=='moana-ledger'||s.version!==1||!s.tables||!s.counts||!Array.isArray(p.files))throw new Error('unsupported_backup')
 if(Object.keys(s.tables).length!==tableNames.length)throw new Error('backup_table_mismatch')
 for(const t of tableNames)if(!Array.isArray(s.tables[t])||s.tables[t].length!==s.counts[t])throw new Error('backup_count_mismatch: '+t)
 if(s.tables.settings.length!==1||s.tables.entities.length!==6)throw new Error('backup_setup_invalid')
 const expected=s.tables.attachments.filter(a=>a.state!=='pending')
 if(expected.length!==p.files.length||new Set(p.files.map(f=>f.path)).size!==p.files.length)throw new Error('backup_files_incomplete')
 for(const f of p.files) {
  const a=expected.find(a=>a.path===f.path),bytes=decode(f.base64)
  if(!a||bytes.length!==a.size||f.size!==a.size||f.mime!==a.mime||f.sha256!==a.sha256||await digest(bytes)!==a.sha256)throw new Error('backup_file_integrity_failed')
 }
 return p
}
