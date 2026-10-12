/**
 * GameServer 테스트 (gameserver-node test runner)
 * 실행: cd server && npm run build && npm test
 */

describe('클라우드 저장', () => {
  test('saveProfile/loadProfile 왕복, pvp 필드는 서버 값 우선', async (server) => {
    server.connect({ account: 'alice' });
    await server.saveProfile({ crystals: 123, pvp: { trophies: 9999 } });
    const res = await server.loadProfile();
    expect(res.account).toBe('alice');
    expect(res.meta.crystals).toBe(123);
    expect(res.meta.pvp.trophies).toBe(0);
  });
});

describe('VX Shop 지급 (서버가 바로 지급)', () => {
  test('구매 훅에서 보석이 들어가고, 같은 purchaseId 는 한 번만, 알림은 한 번만 받는다', async (server) => {
    await server.$onItemPurchased({ account: 'bob', purchaseId: 7, productId: 'crystal_550', quantity: 1 });
    await server.$onItemPurchased({ account: 'bob', purchaseId: 7, productId: 'crystal_550', quantity: 1 });
    server.connect({ account: 'bob' });
    const first = await server.claimPurchases();
    expect(first.list.length).toBe(1);
    expect(first.list[0].productId).toBe('crystal_550');
    expect(first.econ.crystals).toBe(550);
    const second = await server.claimPurchases();
    expect(second.list.length).toBe(0);
    expect(second.econ.crystals).toBe(550);
  });

  test('상자 상품은 사자마자 열려서 카드가 들어간다', async (server) => {
    await server.$onItemPurchased({ account: 'cara', purchaseId: 'c1', productId: 'chest_legend', quantity: 1 });
    server.connect({ account: 'cara' });
    const got = await server.claimPurchases();
    expect(got.list[0].reveals.length).toBe(1);
    const drops = got.list[0].reveals[0].drops;
    expect(drops.some((d: { n: number }) => d.n > 0)).toBe(true);
    expect(got.econ.crystals > 0).toBe(true);
  });
});

describe('경제는 서버 권위', () => {
  test('저장본에 보석을 써서 올려도 반영되지 않는다', async (server) => {
    server.connect({ account: 'eve' });
    await server.loadProfile(); // 경제 생성
    await server.saveProfile({ crystals: 999999, units: { dragoon: 10 }, cards: { archer: 9999 }, deck: ['archer'] });
    const sync = await server.econSync();
    expect(sync.econ.crystals).toBe(0);
    expect(sync.econ.units.dragoon).toBe(undefined);
    const prof = await server.loadProfile();
    expect(prof.meta.crystals).toBe(0);
    expect(prof.meta.deck[0]).toBe('archer'); // 경제가 아닌 필드는 저장
  });

  test('보석이 모자라면 뽑기·강화가 안 되고, 있으면 서버가 차감한다', async (server) => {
    server.connect({ account: 'gil' });
    const poor = await server.econ({ action: 'gacha', args: { n: 1 } });
    expect(poor.result).toBe(null);
    await server.$onItemPurchased({ account: 'gil', purchaseId: 'g1', productId: 'crystal_100', quantity: 1 });
    server.connect({ account: 'gil' });
    const rich = await server.econ({ action: 'gacha', args: { n: 1 } });
    expect(rich.result.drops.length > 0).toBe(true);
    expect(rich.econ.crystals).toBe(0);
  });

  test('없는 동작·서버 전용 동작은 거부', async (server) => {
    server.connect({ account: 'hal' });
    let err = '';
    try { await server.econ({ action: 'grantProduct', args: { productId: 'crystal_15000' } }); } catch (e) { err = String(e); }
    expect(err.includes('unknown action')).toBe(true);
  });

  test('스테이지 결과: 기록 없거나 너무 빠른 클리어는 보상 없음', async (server) => {
    server.connect({ account: 'ivy' });
    const none = await server.runEnd({ id: 'nope', cleared: true, stars: 3, wave: 10 });
    expect(none).toBe(null);
    const { id } = await server.runStart({ kind: 'stage', id: '1-1' });
    const fast = await server.runEnd({ id, cleared: true, stars: 3, wave: 10 });
    expect(fast).toBe(null);
    // 같은 기록은 한 번만
    const again = await server.runEnd({ id, cleared: false, wave: 3 });
    expect(again).toBe(null);
    // 실패 보상도 지난 시간만큼의 웨이브까지만
    const r2 = await server.runStart({ kind: 'stage', id: '1-1' });
    const fail = await server.runEnd({ id: r2.id, cleared: false, wave: 99 });
    expect(fail.result.crystals).toBe(0);
  });

  test('예전 저장본은 한 번만, 상한으로 잘라서 옮긴다', async (server) => {
    server.connect({ account: 'old' });
    await server.saveProfile({ crystals: 5000000, units: { archer: 7, ranger: 3 }, items: { summonTicket: 9999 } });
    const sync = await server.econSync();
    expect(sync.econ.crystals).toBe(20000);
    expect(sync.econ.units.archer).toBe(7);
    expect(sync.econ.items.summonTicket).toBe(100);
    await server.saveProfile({ crystals: 7777 }); // 옮긴 뒤로는 무시
    const s2 = await server.econSync();
    expect(s2.econ.crystals).toBe(20000);
  });
});

describe('PvP 매칭', () => {
  test('두 명이 큐에 들어오면 같은 룸/시드로 매칭', async (server) => {
    server.connect({ account: 'p1' });
    const a = await server.pvpQueue({ nick: '하나' });
    expect(a.status).toBe('waiting');
    server.connect({ account: 'p2' });
    const b = await server.pvpQueue({ nick: '둘' });
    expect(b.status).toBe('matched');
    expect(b.match.opponent.account).toBe('p1');
    server.connect({ account: 'p1' });
    const polled = await server.pvpPoll();
    expect(polled.status).toBe('matched');
    expect(polled.match.roomId).toBe(b.match.roomId);
    expect(polled.match.seed).toBe(b.match.seed);
    expect(polled.match.opponent.nick).toBe('둘');
  });

  test('취소하면 대기열에서 빠진다', async (server) => {
    server.connect({ account: 'p1' });
    await server.pvpQueue({});
    await server.pvpCancel();
    const polled = await server.pvpPoll();
    expect(polled.status).toBe('idle');
    server.connect({ account: 'p2' });
    const b = await server.pvpQueue({});
    expect(b.status).toBe('waiting');
  });
});

describe('PvP 룸', () => {
  test('둘 다 준비 → playing, 패배 보고 → 승자 트로피 증가', async (server) => {
    await server.simulateJoin('r1', 'p1');
    await server.simulateJoin('r1', 'p2');
    server.connect({ account: 'p1', roomId: 'r1' });
    const s1 = await server.pvpReady({ nick: 'A', seed: 42 });
    expect(s1.status).toBe('waiting');
    server.connect({ account: 'p2', roomId: 'r1' });
    const s2 = await server.pvpReady({ nick: 'B', seed: 42 });
    expect(s2.status).toBe('playing');
    expect(s2.seed).toBe(42);
    const res = await server.pvpDefeat();
    expect(res.winner).toBe('p1');
    expect(res.delta.p1).toBe(30);
    // 보상도 서버가: 승자 보석 40 + 승리 상자, 패자 보석 10
    expect(res.rewards.p1.crystals).toBe(40);
    expect(res.rewards.p1.chest).toBe('wood');
    expect(res.rewards.p2.crystals).toBe(10);
    expect(res.trophies.p2).toBe(0);
    // 중복 보고는 같은 결과
    server.connect({ account: 'p1', roomId: 'r1' });
    const again = await server.pvpDefeat();
    expect(again.winner).toBe('p1');
    const lb = await server.pvpLeaderboard();
    expect(lb.me.trophies).toBe(30);
    expect(lb.me.wins).toBe(1);
  });

  test('몹 던지기: 경기 전엔 거부, 경기 중엔 몹 카드 10종·범위 밖 값도 받아서 중계', async (server) => {
    await server.simulateJoin('r3', 'p5');
    await server.simulateJoin('r3', 'p6');
    server.connect({ account: 'p5', roomId: 'r3' });
    await server.pvpReady({});
    expect(await server.pvpAttack({ tier: 0, wave: 1, pos: 0.5 })).toBe(false);
    server.connect({ account: 'p6', roomId: 'r3' });
    await server.pvpReady({});
    expect(await server.pvpAttack({ tier: 3, wave: 5, pos: 0.25 })).toBe(true);
    expect(await server.pvpAttack({ tier: 9, wave: -1, pos: 7 })).toBe(true);
    expect(await server.pvpAttack({ tier: 1, wave: 2 })).toBe(true); // 예전 클라이언트
    expect(await server.pvpAttack({ card: 9, wave: 4, pos: 0.5 })).toBe(true);
    expect(await server.pvpAttack({ card: 42, wave: 4 })).toBe(true);
  });

  test('봇전 결과: 잘못된 id·너무 짧은 경기는 트로피 반영 안 함', async (server) => {
    server.connect({ account: 'b1' });
    const { id } = await server.pvpBotStart();
    expect(await server.pvpBotResult({ id: 'wrong', won: true })).toBe(null);
    expect(await server.pvpBotResult({ id, won: true })).toBe(null); // 시작 직후 (최소 경기 시간 전)
    const lb = await server.pvpLeaderboard();
    expect(lb.me.trophies).toBe(0);
  });

  test('경기 중 이탈하면 상대 승리', async (server) => {
    await server.simulateJoin('r2', 'p3');
    await server.simulateJoin('r2', 'p4');
    server.connect({ account: 'p3', roomId: 'r2' });
    await server.pvpReady({});
    server.connect({ account: 'p4', roomId: 'r2' });
    await server.pvpReady({});
    await server.simulateLeave('r2', 'p4');
    server.connect({ account: 'p3', roomId: 'r2' });
    const lb = await server.pvpLeaderboard();
    expect(lb.me.wins).toBe(1);
  });
});
