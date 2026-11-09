import assert from 'node:assert/strict';
import { tsImport } from 'tsx/esm/api';
const auto = await tsImport('../lib/automation.ts', import.meta.url);
const presentation = await tsImport('../lib/presentation.ts', import.meta.url);
const checks = [];
function check(name, action) { action(); checks.push(name); console.log(`PASS automation ${name}`); }

check('Bangla digits and both grouping conventions retain exact poisha', () => {
  assert.equal(auto.normalizeBanglaDigits('০১২৩৪৫৬৭৮৯'), '0123456789');
  for (const [amount, expected] of [['১,২৩৪.৫০',123450],['1,23,456.78',12345678],['123,456.78',12345678],['90071992547409.91',Number.MAX_SAFE_INTEGER]]) {
    const result = auto.parseBangladeshAlert(`Account debited BDT ${amount} on 2026-11-08. Ref ABC123`);
    assert.equal(result.draft.poisha,expected); assert.equal(result.draft.date,'2026-11-08'); assert.equal(result.draft.type,'expense');
  }
  for (const amount of ['0.00','1.001','1,00.00','90071992547409.92']) assert.equal(auto.parseBangladeshAlert(`debited BDT ${amount} on 2026-11-08`).draft.poisha,null);
});
check('transaction amount is distinguished from balances and ambiguous fees', () => {
  const parsed = auto.parseBangladeshAlert('Account debited BDT 1,234.56 on 08/11/2026. Available balance BDT 9,000.00. Ref ABC123');
  assert.equal(parsed.draft.poisha,123456); assert.equal(parsed.draft.date,'2026-11-08'); assert.equal(parsed.reference,'ABC123');
  assert.equal(auto.parseBangladeshAlert('Account was debited on 2026-11-08. Available balance BDT 5000.00').draft.poisha,null);
  assert.equal(auto.parseBangladeshAlert('Credit limit BDT 5000 on 2026-11-08').draft.poisha,null);
  assert.equal(auto.parseBangladeshAlert('Purchase on 2026-11-08, BDT 100.00 and Tk 20.00').draft.poisha,null);
});
check('missing conflicting and impossible dates or directions remain reviewable', () => {
  for (const text of ['debited BDT 100','debited BDT 100 on 31/02/2026','debited BDT 100 on 08/11/26','debited BDT 100 on 2026-11-08 and 2026-11-09']) assert.equal(auto.parseBangladeshAlert(text).draft.date,null);
  assert.equal(auto.parseBangladeshAlert('BDT 100 was debited and credited on 2026-11-08').draft.type,null);
  assert.equal(auto.parseBangladeshAlert('Amount BDT 100 on 2026-11-08').draft.type,null);
  const result=auto.parseBangladeshAlert('credited Tk. ১২৫.৫০ on ০৮/১১/২০২৬');
  assert.equal(result.draft.type,'income'); assert.equal(result.draft.poisha,12550); assert.equal(result.draft.date,'2026-11-08');
});
check('security alerts and untrusted owner or malformed structured fields are rejected', () => {
  for (const text of ['Your OTP is 123456','One-time password: 123456','PIN: 1234','আপনার ওটিপি ১২৩৪৫৬']) assert.throws(()=>auto.parseBangladeshAlert(text));
  assert.equal(auto.ingestSchema.safeParse({sourceId:'sms',externalId:'one',draft:{userId:'foreign'}}).success,false);
  assert.equal(auto.ingestSchema.safeParse({sourceId:'sms',externalId:'one',draft:{poisha:1.5}}).success,false);
  assert.equal(auto.ingestSchema.safeParse({sourceId:'sms',externalId:'one',rawText:'a'.repeat(16001)}).success,false);
  assert.equal(auto.preferencesSchema.safeParse({...auto.defaultPreferences(),timezone:'UTC'}).success,false);
});
check('number formatting and week/fiscal boundaries honor saved Bangladesh preferences', () => {
  assert.ok(presentation.formatMoney(Number.MAX_SAFE_INTEGER,'en-BD').includes('91'));
  assert.ok(presentation.formatMoney(123456,'bn-BD').includes('১,২৩৪.৫৬'));
  assert.ok(presentation.formatMoney(-1,'bn-BD').includes('০.০১'));
  assert.ok(presentation.formatMoney(900719925474099103n,'en-BD').endsWith('.03'));
  assert.ok(presentation.formatMoney(-900719925474099103n,'bn-BD').includes('০৩'));
  assert.equal(presentation.weekStartDate('2026-11-08','sat'),'2026-11-07');
  assert.equal(presentation.weekStartDate('2026-11-08','mon'),'2026-11-02');
  assert.equal(presentation.fiscalStartDate('2026-06-30',7),'2025-07-01');
  assert.equal(presentation.fiscalStartDate('2026-07-01',7),'2026-07-01');
});
console.log(JSON.stringify({scope:'Actual-source Bangladesh extraction and presentation; no real-bank template certification',groupsPassed:checks.length,checks},null,2));
