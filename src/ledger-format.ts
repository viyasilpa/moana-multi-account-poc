export function cents(value:string):bigint {
 if(!/^-?\d+(\.\d{1,2})?$/.test(value))throw new Error('จำนวนเงินต้องเป็นตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง และไม่ใส่ comma')
 const neg=value.startsWith('-'),[whole,decimal='']=value.replace('-','').split('.')
 return (BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0')))*(neg?-1n:1n)
}
export function decimal(n:bigint) {
 const a=n<0n?-n:n
 return `${n<0n?'-':''}${a/100n}.${(a%100n).toString().padStart(2,'0')}`
}
export function money(value:string) {
 const [whole,fraction]=decimal(cents(value)).split('.')
 return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,',')}.${fraction}`
}
export function csvText(rows:string[][]) {
 const cell=(s:string)=>`"${(/^[\s]*[=+@-]/.test(s)&&! /^-?\d+(\.\d+)?$/.test(s)?"'":'')+s.replaceAll('"','""')}"`
 return '\uFEFF'+rows.map(r=>r.map(cell).join(',')).join('\r\n')
}
