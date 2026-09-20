// Disposable sandbox only. Replace auth placeholders at deployment; never commit secrets.
import {createClient} from 'npm:@supabase/supabase-js@2.116.0'
const target='bpedekosireooxrsaerp'
const secret='__RUNNER_SECRET__',expires='__RUNNER_EXPIRES__'
const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!
const options={auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.timeout(20000)})}}
const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,options)
const owner='00000000-0000-4000-8000-000000000051',other='00000000-0000-4000-8000-000000000052'
const state=async(id:string)=>{const {data,error}=await admin.from('stage5_runner_state').select('data').eq('id',id).single();if(error)throw error;return data.data}
const save=async(id:string,data:unknown)=>{const r=await admin.from('stage5_runner_state').upsert({id,data});if(r.error)throw r.error}
const value=(r:any)=>{if(r.error)throw r.error;return r.data}
const sha=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('')
const check=(x:unknown,label:string)=>{if(!x)throw Error(label)}
const logins:any[]=[]
async function login(email:string,password:string){const c=createClient(url,key,options);value(await c.auth.signInWithPassword({email,password}));logins.push(c);return c}
async function run(){
 const auth=await state('auth'),a=await login(auth.email,auth.password),b=await login(auth.email,auth.password),n=await login(auth.otherEmail,auth.otherPassword)
 const anon=createClient(url,key,options),checks:string[]=[]
 const rpc=async(c:any,name:string,p:any)=>value(await c.rpc(name,p))
 const catalog=await rpc(a,'accounting_catalog',{})
 check(catalog.entities.length===6&&catalog.entities.every((e:any)=>e.name.startsWith('STAGE5 SYNTHETIC ')),'synthetic catalog required')
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Bangkok',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
 if(!catalog.settings.start_date)await rpc(a,'accounting_post',{p_request:{key:crypto.randomUUID(),action:'create',entry:{kind:'opening',date:today,balances:[]}}})
 checks.push('synthetic-only zero opening through normal RPC')
 const entity=catalog.entities[0],account=(kind:string)=>catalog.accounts.find((x:any)=>x.entity_id===entity.id&&x.kind===kind&&x.active).id
 const entry={kind:'expense',date:today,amount:'1.25',description:'STAGE5 SYNTHETIC HTTP',funding:'money',money_account_id:account('bank'),for_entity_id:entity.id,category_account_id:account('expense')}
 const request={key:crypto.randomUUID(),action:'create',entry}
 const receipts=await Promise.all([rpc(a,'accounting_post',{p_request:request}),rpc(b,'accounting_post',{p_request:request})])
 check(JSON.stringify(receipts[0])===JSON.stringify(receipts[1]),'duplicate receipt mismatch')
 const tx=receipts[0].transaction_id;checks.push('overlapping HTTP same-key requests return same receipt')
 const collision=await b.rpc('accounting_post',{p_request:{...request,entry:{...entry,amount:'9.25'}}})
 check(collision.error?.message==='idempotency_conflict','same-key conflict missing');checks.push('different payload same key rejected')
 const bytes=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGOUy3JgoCVgoqnpoxaMWjBqwagFoxaMWjBqwagFoxaMWjBqARUBAAgTAQiyAjIcAAAAAElFTkSuQmCC'),c=>c.charCodeAt(0))
 const digest=await sha(bytes),reservation=await rpc(a,'accounting_attachment',{p_request:{key:crypto.randomUUID(),action:'reserve',transaction_id:tx,expected_revision:1,filename:'stage5-synthetic.png',mime:'image/png',size:bytes.length,sha256:digest}})
 const bucket=a.storage.from('accounting-attachments')
 value(await bucket.upload(reservation.path,bytes,{contentType:'image/png',upsert:false}))
 const ready=await rpc(a,'accounting_attachment',{p_request:{key:crypto.randomUUID(),action:'finish',id:reservation.id}})
 check(ready.state==='ready','finalize failed');checks.push('hosted Storage HTTP upload and RPC finalize')
 const downloaded=value(await bucket.download(reservation.path))
 check(await sha(new Uint8Array(await downloaded.arrayBuffer()))===digest,'download hash mismatch');checks.push('authenticated download exact SHA256')
 check(!!(await bucket.upload(reservation.path,bytes,{contentType:'image/png',upsert:true})).error,'overwrite allowed');checks.push('overwrite rejected')
 for(const [label,c] of [['anonymous',anon],['nonowner',n]] as const){check(!!(await c.storage.from('accounting-attachments').download(reservation.path)).error,label+' can read');checks.push(label+' Storage read denied');check(!!(await c.rpc('accounting_backup')).error,label+' backup allowed')}
 const signed=value(await bucket.createSignedUrl(reservation.path,60)),before=await fetch(signed.signedUrl,{cache:'no-store'})
 check(before.ok&&await sha(new Uint8Array(await before.arrayBuffer()))===digest,'signed URL initial read failed');checks.push('signed URL readable before expiry')
 await save('expiry',{url:signed.signedUrl,path:reservation.path,digest,notBefore:Date.now()+70000})
 await save('context',{checks,tx,entry,reservation});await save('run-result',{status:'passed',checks,at:new Date().toISOString()});
 return {status:'passed',checks}
}
async function finish(){
 const auth=await state('auth'),a=await login(auth.email,auth.password),b=await login(auth.email,auth.password)
 const {checks,tx,entry,reservation}=await state('context'),bucket=a.storage.from('accounting-attachments')
 const rpc=async(c:any,name:string,p:any)=>value(await c.rpc(name,p))
 const raceTx=await rpc(a,'accounting_post',{p_request:{key:crypto.randomUUID(),action:'create',entry}})
 const edits=await Promise.all([a,b].map((c,i)=>c.rpc('accounting_post',{p_request:{key:crypto.randomUUID(),action:'edit',transaction_id:raceTx.transaction_id,expected_revision:1,reason:'STAGE5 SYNTHETIC race',entry:{...entry,amount:i?'3.25':'2.25'}}})))
 await save('race-detail',edits.map(x=>({data:x.data,error:x.error?{code:x.error.code,message:x.error.message}:null})))
 check(edits.filter(x=>!x.error).length===1&&edits.filter(x=>x.error?.message==='stale_revision').length===1,'stale race not rejected');checks.push('overlapping HTTP edits: one success, one stale_revision')
 const current=(await rpc(a,'accounting_backup',{})).tables.transactions.find((x:any)=>x.id===tx)
 if(current.current_revision===1)await rpc(a,'accounting_post',{p_request:{key:crypto.randomUUID(),action:'edit',transaction_id:tx,expected_revision:1,reason:'STAGE5 SYNTHETIC attachment retention',entry:{...entry,amount:'2.25'}}})
 let files=await rpc(a,'accounting_attachment_list',{p_id:tx});check(files.length===1&&files[0].revision===1,'original attachment lost on edit')
 if(current.status!=='void')await rpc(a,'accounting_post',{p_request:{key:crypto.randomUUID(),action:'void',transaction_id:tx,expected_revision:2,reason:'STAGE5 SYNTHETIC retention'}})
 files=await rpc(a,'accounting_attachment_list',{p_id:tx});check(files.length===1&&files[0].path===reservation.path,'attachment lost on void');checks.push('edit and void retain original revision attachment')
 const archived=await rpc(a,'accounting_attachment',{p_request:{key:crypto.randomUUID(),action:'archive',id:reservation.id,reason:'STAGE5 SYNTHETIC archive'}})
 check(archived.state==='archived','archive failed')
 const snapshot=await rpc(a,'accounting_backup',{})
 const copies=[]
 for(const file of snapshot.tables.attachments.filter((x:any)=>x.state!=='pending')){
  const data=new Uint8Array(await value(await bucket.download(file.path)).arrayBuffer());check(await sha(data)===file.sha256,'backup digest mismatch')
  copies.push({path:file.path,mime:file.mime,size:data.length,sha256:file.sha256,base64:btoa(String.fromCharCode(...data))})
 }
 check(snapshot.tables.transactions.filter((x:any)=>x.id===tx).length===1,'duplicate tx rows')
 check(snapshot.tables.transactions.find((x:any)=>x.id===tx)?.current_revision===3,'wrong final revision')
 const totals=new Map<string,[number,number]>()
 for(const line of snapshot.tables.lines){const t=totals.get(line.batch_id)||[0,0];t[0]+=Math.round(Number(line.debit)*100);t[1]+=Math.round(Number(line.credit)*100);totals.set(line.batch_id,t)}
 check([...totals.values()].every(t=>t[0]===t[1]),'unbalanced batch');checks.push('one transaction, revision 3 and balanced batches')
 checks.push('complete hosted backup includes archived file bytes and hashes')
 await save('backup',{snapshot,files:copies})
 await save('finish-result',{checks,transaction:tx,at:new Date().toISOString(),status:'passed',expiry:'pending'})
 return {checks,status:'passed',expiry:'pending'}
}
async function expiry(){
 const e=await state('expiry');check(Date.now()>=e.notBefore,'expiry wait incomplete')
 const old=await fetch(e.url,{cache:'no-store'}),body=await old.text()
 check([400,401,403].includes(old.status)&&/expir|exp.*timestamp check failed/i.test(body),'expired URL did not return an expiry error')
 const auth=await state('auth'),c=await login(auth.email,auth.password)
 const fresh=value(await c.storage.from('accounting-attachments').createSignedUrl(e.path,60)),r=await fetch(fresh.signedUrl,{cache:'no-store'})
 check(r.ok&&await sha(new Uint8Array(await r.arrayBuffer()))===e.digest,'fresh link not healthy after expiry')
 const result={status:'passed',expiredStatus:old.status,freshStatus:r.status,at:new Date().toISOString()}
 await save('expiry-result',result);return result
}
Deno.serve(async req=>{
 if(req.method!=='POST'||req.headers.get('x-stage5-secret')!==secret||Date.now()>Date.parse(expires)||url!==`https://${target}.supabase.co`)return new Response('Unauthorized',{status:401})
 let phase='unknown'
 try {
  phase=(await req.json()).phase
  if(phase==='bootstrap'){
   const lock=await admin.from('stage5_runner_state').insert({id:'bootstrap-lock',data:{started:true}});if(lock.error)throw Error('Bootstrap already attempted');
   const auth={email:'stage5-owner@example.invalid',password:crypto.randomUUID()+crypto.randomUUID(),otherEmail:'stage5-nonowner@example.invalid',otherPassword:crypto.randomUUID()+crypto.randomUUID()}
   value(await admin.auth.admin.createUser({id:owner,email:auth.email,password:auth.password,email_confirm:true}))
   value(await admin.auth.admin.createUser({id:other,email:auth.otherEmail,password:auth.otherPassword,email_confirm:true}))
   await save('auth',auth);await save('bootstrap-result',{owner,other,status:'passed'});return Response.json({status:'passed'})
  }
  if(phase==='run')return Response.json(await run())
  if(phase==='finish')return Response.json(await finish())
  if(phase==='expiry')return Response.json(await expiry())
  return new Response('Unknown phase',{status:400})
 }catch(e){const result={status:'failed',phase,message:String((e as any).message||e)};await save(phase+'-result',result);return Response.json(result,{status:500})}
 finally{await Promise.all(logins.splice(0).map(c=>c.auth.signOut({scope:'local'})))}
})
