process.env.NODE_ENV = 'test';

const test = require('node:test');
const assert = require('node:assert/strict');

const tiktokAdapter = require('../src/modules/reporting/providers/tiktokAds.adapter');
const linkedinAdapter = require('../src/modules/reporting/providers/linkedinAds.adapter');

test('tiktok adapter lists advertiser account from settings', async () => {
  const items = await tiktokAdapter.listSelectableAccounts({
    settings: { advertiserId: '12345' },
  });

  assert.deepEqual(items, [
    {
      id: '12345',
      displayName: 'Advertiser 12345',
      meta: { advertiserId: '12345' },
    },
  ]);
});

test('linkedin adapter lists account from settings', async () => {
  const items = await linkedinAdapter.listSelectableAccounts({
    settings: { accountId: '67890' },
  });

  assert.deepEqual(items, [
    {
      id: '67890',
      displayName: 'Account 67890',
      meta: { accountId: '67890' },
    },
  ]);
});
