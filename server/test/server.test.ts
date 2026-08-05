/** GameServer test suite for RandomDefense. */

describe('Server Rankings, Cloud Save & VX Audit', () => {
  test('submitWave and getTopRankings work correctly', async (server) => {
    server.connect({ account: 'user-a' });
    expect((await server.submitWave(15, 'Alice')).updated).toBe(true);
    expect((await server.submitWave(10, 'Alice')).updated).toBe(false);
    expect((await server.submitWave(20, 'Alice')).bestWave).toBe(20);

    server.connect({ account: 'user-b' });
    expect((await server.submitWave(25, 'Bob')).updated).toBe(true);

    const rankings = await server.getTopRankings();
    expect(rankings.length).toBe(2);
    expect(rankings[0].nickname).toBe('Bob');
    expect(rankings[1].nickname).toBe('Alice');
  });

  test('$onItemPurchased audits purchases without changing game currency', async (server) => {
    server.connect({ account: 'user-vx' });
    await server.savePlayerData({ crystals: 40, adRemoved: false }, 'Buyer');

    const result = await server.$onItemPurchased({
      account: 'user-vx',
      purchaseId: 'purchase-1',
      productId: 'gems-550',
      quantity: 1,
      metadata: null,
    });

    expect(result).toBeUndefined();
    const state = await server.loadPlayerData();
    expect(state.crystals).toBe(40);
    expect(state.adRemoved).toBe(false);
  });

  test('savePlayerData and loadPlayerData work correctly', async (server) => {
    server.connect({ account: 'user-c' });
    const dummyProgress = {
      crystals: 450,
      bestWave: 34,
      research: { atk: 5, startGold: 2 },
    };

    expect(await server.savePlayerData(dummyProgress, 'Charlie')).toBe(true);
    const loadedData = await server.loadPlayerData();
    expect(loadedData.crystals).toBe(450);
    expect(loadedData.bestWave).toBe(34);
    expect(loadedData.research.atk).toBe(5);

    const rankings = await server.getTopRankings();
    const charlieEntry = rankings.find((r) => r.account === 'user-c');
    expect(charlieEntry.nickname).toBe('Charlie');
    expect(charlieEntry.wave).toBe(34);
  });
});
