/**
 * GameServer test suite for RandomDefense (Rankings & Progress Syncing)
 */

describe('Server Rankings & Cloud Save', () => {
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

  test('$onItemPurchased grants crystals and ad-removal correctly', async (server) => {
    server.connect({ account: 'user-d' });

    // 1. 100 크리스탈 패키지 1개 구매
    const res1 = await server.$onItemPurchased({
      account: 'user-d', purchaseId: 'p1', productId: 'gems-100', quantity: 1
    });
    expect(res1.success).toBe(true);
    let state = await server.loadPlayerData();
    expect(state.crystals).toBe(100);

    // 2. 550 크리스탈 패키지 2개 구매 -> 누적 지급(기존 100 + 1100 = 1200)
    await server.$onItemPurchased({
      account: 'user-d', purchaseId: 'p2', productId: 'gems-550', quantity: 2
    });
    state = await server.loadPlayerData();
    expect(state.crystals).toBe(1200);

    // 3. 광고제거 구매 -> adRemoved 플래그
    await server.$onItemPurchased({
      account: 'user-d', purchaseId: 'p3', productId: 'ad-removal', quantity: 1
    });
    state = await server.loadPlayerData();
    expect(state.adRemoved).toBe(true);
    expect(state.crystals).toBe(1200); // 다른 필드는 그대로 유지

    // 4. QA 검증용 0 VX 상품 -> 크리스탈 1개만 지급
    await server.$onItemPurchased({
      account: 'user-d', purchaseId: 'p4', productId: 'test-free', quantity: 1
    });
    state = await server.loadPlayerData();
    expect(state.crystals).toBe(1201);

    // 5. 미등록 productId -> 성공 응답은 하되 크리스탈/adRemoved 변경 없음(안전한 no-op)
    await server.$onItemPurchased({
      account: 'user-d', purchaseId: 'p5', productId: 'unknown-item', quantity: 1
    });
    state = await server.loadPlayerData();
    expect(state.crystals).toBe(1201);
  });

  test('savePlayerData and loadPlayerData work correctly', async (server) => {
    server.connect({ account: 'user-c' });

    // 1. Save dummy progress
    const dummyProgress = {
      crystals: 450,
      bestWave: 34,
      research: { atk: 5, startGold: 2 }
    };
    
    const saveRes = await server.savePlayerData(dummyProgress, 'Charlie');
    expect(saveRes).toBe(true);

    // 2. Load progress
    const loadedData = await server.loadPlayerData();
    expect(loadedData).toBeTruthy();
    expect(loadedData.crystals).toBe(450);
    expect(loadedData.bestWave).toBe(34);
    expect(loadedData.research.atk).toBe(5);

    // 3. Leaderboard should be automatically synced on savePlayerData
    const rankings = await server.getTopRankings();
    const charlieEntry = rankings.find(r => r.account === 'user-c');
    expect(charlieEntry).toBeTruthy();
    expect(charlieEntry.nickname).toBe('Charlie');
    expect(charlieEntry.wave).toBe(34);
  });
});
