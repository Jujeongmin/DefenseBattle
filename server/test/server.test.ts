/**
 * GameServer test suite for RandomDefense
 */

describe('Server Rankings', () => {
  test('submitWave and getTopRankings work correctly', async (server) => {
    // 1. Submit a score for user A
    server.connect({ account: 'user-a' });
    const resA = await server.submitWave(15, 'Alice');
    expect(resA.updated).toBe(true);
    expect(resA.bestWave).toBe(15);

    // 2. Submit a lower score for user A - shouldn't update
    const resA2 = await server.submitWave(10, 'Alice');
    expect(resA2.updated).toBe(false);
    expect(resA2.bestWave).toBe(15);

    // 3. Submit a higher score for user A - should update
    const resA3 = await server.submitWave(20, 'Alice');
    expect(resA3.updated).toBe(true);
    expect(resA3.bestWave).toBe(20);

    // 4. Submit for user B
    server.connect({ account: 'user-b' });
    const resB = await server.submitWave(25, 'Bob');
    expect(resB.updated).toBe(true);

    // 5. Get top rankings - Bob (25) should be #1, Alice (20) should be #2
    const rankings = await server.getTopRankings();
    expect(rankings.length).toBe(2);
    expect(rankings[0].nickname).toBe('Bob');
    expect(rankings[0].wave).toBe(25);
    expect(rankings[1].nickname).toBe('Alice');
    expect(rankings[1].wave).toBe(20);

    // 6. Get Bob's rank
    const myBestBob = await server.getMyBestRank();
    expect(myBestBob.rank).toBe(1);
    expect(myBestBob.bestEntry.wave).toBe(25);

    // 7. Get Alice's rank
    server.connect({ account: 'user-a' });
    const myBestAlice = await server.getMyBestRank();
    expect(myBestAlice.rank).toBe(2);
    expect(myBestAlice.bestEntry.wave).toBe(20);
  });
});
