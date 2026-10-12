import assert from 'node:assert/strict';
import { unverifiedNumbers } from '../src/lib/answer';

const evidence = 'Out-Patient Program | 3 Weeks | $18,995\nIn-Patient Program | 3 Weeks | $30,000\nLAK: $2,600 USD';

assert.deepEqual(unverifiedNumbers('The out-patient program costs $18,995 USD for 3 weeks.', evidence, ''), []);
assert.deepEqual(unverifiedNumbers('It costs 18995 USD.', evidence, ''), []);
assert.deepEqual(unverifiedNumbers('It costs $19,500.', evidence, ''), ['19500']);
assert.deepEqual(unverifiedNumbers('برنامج المرضى الداخليين: 30,000 دولار أمريكي', evidence, ''), []);
assert.deepEqual(unverifiedNumbers('التكلفة ٢٥٬٠٠٠ دولار', evidence, ''), ['25000']);
assert.deepEqual(unverifiedNumbers('That does not match: $50 is not listed; it is $18,995.', evidence, 'It costs $50, confirm?'), []);
assert.deepEqual(unverifiedNumbers('See https://www.placidway.com/package/7903/x for $2,600.', evidence, ''), []);
assert.deepEqual(unverifiedNumbers('The program lasts 3 weeks, available 24/7.', '', ''), []);

console.log('guard tests passed');
