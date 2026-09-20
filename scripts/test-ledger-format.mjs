import assert from 'node:assert/strict'
import {cents,money,decimal,csvText} from '../src/ledger-format.ts'
assert.equal(cents('9999999999999999.99'),999999999999999999n)
assert.equal(money('9999999999999999.99'),'9,999,999,999,999,999.99')
assert.equal(money('19999999999999999.98'),'19,999,999,999,999,999.98')
assert.equal(decimal(cents('0.10')+cents('0.20')),'0.30')
assert.equal(decimal(cents('-0.01')),'-0.01')
for(const invalid of ['1.001','NaN','1,000','1e5',''])assert.throws(()=>cents(invalid))
assert.equal(csvText([['=CMD()', '@SUM(A1)', '-formula', '  +formula','-1200.50','quoted"text']]),'\uFEFF"\'=CMD()","\'@SUM(A1)","\'-formula","\'  +formula","-1200.50","quoted""text"')
console.log('PASS: exact decimal arithmetic, aggregate formatting, validation and CSV escaping')
