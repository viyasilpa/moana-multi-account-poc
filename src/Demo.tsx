import { useEffect, useState } from 'react'
import { PGlite } from '@electric-sql/pglite'
import core from '../db/accounting/001_core.sql?raw'
import commands from '../db/accounting/002_commands.sql?raw'
import masters from '../db/accounting/003_masters.sql?raw'
import reads from '../db/accounting/004_read_api.sql?raw'
import documents from '../db/accounting/005_documents_backup.sql?raw'
import utc from '../db/accounting/006_backup_utc.sql?raw'
import lossless from '../db/accounting/007_lossless_backup_json.sql?raw'
import {storageStub} from './restore-core'
import { AccountingApp } from './AccountingApp'
import type { Api } from './accounting'
import { errorText } from './accounting'

// Isolated, memory-only database: never shares authentication, data or requests with live Supabase.
async function createDemo():Promise<Api> {
 const db=new PGlite()
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as 'select nullif(current_setting(''request.jwt.claim.sub'',true),'''')::uuid';
 create table public.app_owner(user_id uuid not null references auth.users(id));
 insert into auth.users values ('00000000-0000-4000-8000-000000000001');
 insert into public.app_owner select id from auth.users;
 grant usage on schema auth to authenticated; grant select on public.app_owner to authenticated;
 select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);`)
 await db.exec(storageStub)
 for(const sql of [core,commands,masters,reads,documents,utc,lossless])await db.exec(sql)
 const manifest={entities:Array.from({length:6},(_,i)=>({code:`D${i+1}`,name:`กิจการสาธิต ${i+1}`,accounts:[{code:'bank',name:'ธนาคารสาธิต',kind:'bank'},{code:'cash',name:'เงินสดสาธิต',kind:'cash'},{code:'income',name:'รายรับสาธิต',kind:'income'},{code:'expense',name:'ค่าใช้จ่ายสาธิต',kind:'expense'}]}))}
 await db.query('select accounting.configure($1::jsonb)',[JSON.stringify(manifest)])
 await db.exec('set role authenticated')
 const routes:Record<string,{sql:string;keys:string[]}>={
  accounting_catalog:{sql:'select public.accounting_catalog() result',keys:[]},
  accounting_backup:{sql:'select public.accounting_backup() result',keys:[]},
  accounting_attachment_list:{sql:'select public.accounting_attachment_list($1::uuid) result',keys:['p_id']},
  accounting_post:{sql:'select public.accounting_post($1::jsonb) result',keys:['p_request']},
  accounting_master:{sql:'select public.accounting_master($1::jsonb) result',keys:['p_request']},
  accounting_report:{sql:'select public.accounting_report($1::date,$2::date) result',keys:['p_from','p_to']},
  accounting_gl:{sql:'select public.accounting_gl($1::uuid,$2::date,$3::date) result',keys:['p_account','p_from','p_to']},
  accounting_activity:{sql:'select public.accounting_activity($1::date,$2::date,$3::uuid,$4::integer) result',keys:['p_from','p_to','p_entity','p_offset']},
  accounting_detail:{sql:'select public.accounting_detail($1::uuid) result',keys:['p_id']},
 }
 return async<T,>(name:string,args:Record<string,unknown>={})=>{
  const route=routes[name];if(!route)throw new Error('Unknown demo operation')
  const r=await db.query<{result:T}>(route.sql,route.keys.map(k=>k==='p_request'?JSON.stringify(args[k]):args[k]))
  return r.rows[0].result
 }
}
let instance:Promise<Api>|undefined
export default function Demo() {
 const [api,setApi]=useState<Api|null>(null),[error,setError]=useState('')
 useEffect(()=>{let active=true;instance??=createDemo();instance.then(a=>{if(active)setApi(()=>a)}).catch(e=>{if(active)setError(errorText(e))});return()=>{active=false}},[])
 return <main><header><p className="eyebrow">Moana · สาธิตเท่านั้น</p><h1>ลองบัญชีหลายกิจการ</h1><a href="/">กลับแอปหลัก</a></header>{api?<AccountingApp userId="demo" demo api={api}/>:<p role="status">{error||'กำลังเตรียมฐานข้อมูลสาธิต… อาจใช้เวลาสักครู่'}</p>}</main>
}
