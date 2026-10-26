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

  test('처음 온 계정도 빈 값 대신 자기 계정 데이터를 받는다', async (server) => {
    server.connect({ account: 'newbie' });
    const res = await server.loadProfile();
    expect(res.account).toBe('newbie');
    expect(res.meta === null).toBe(false);
    expect(typeof res.meta.crystals).toBe('number');
    expect(res.meta.pvp.trophies).toBe(0);
  });

  test('계정끼리 저장본·결제가 섞이지 않는다', async (server) => {
    await server.$onItemPurchased({ account: 'acc1', purchaseId: 'x1', productId: 'crystal_550', quantity: 1 });
    server.connect({ account: 'acc1' });
    await server.saveProfile({ nick: '첫계정', tutorial: 9 });
    const one = await server.loadProfile();
    server.connect({ account: 'acc2' });
    const two = await server.loadProfile();
    expect(one.meta.nick).toBe('첫계정');
    expect(two.meta.nick === '첫계정').toBe(false);
    expect(two.meta.tutorial === 9).toBe(false);
    expect(one.meta.crystals - two.meta.crystals).toBe(550);
    const claim2 = await server.claimPurchases();
    expect(claim2.list.length).toBe(0);
  });
});

describe('VX Shop 지급 (서버가 바로 지급)', () => {
  test('미등록 상품은 성공 응답 없이 거부한다', async (server) => {
    let failed = false;
    try {
      await server.$onItemPurchased({ account: 'unknownbuyer', purchaseId: 'unknown-1', productId: 'not_a_product', quantity: 1 });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  test('구매 훅에서 보석이 들어가고, 같은 purchaseId 는 한 번만, 알림은 한 번만 받는다', async (server) => {
    const ack = await server.$onItemPurchased({ account: 'bob', purchaseId: 7, productId: 'crystal_550', quantity: 1 });
    expect(ack.success).toBe(true);
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

  test('광고 제거 패키지는 권한·보석·구매 기록을 저장하고 재시도해도 중복 지급하지 않는다', async (server) => {
    const ack = await server.$onItemPurchased({ account: 'adbuyer', purchaseId: 'ad-1', productId: 'ad_remove', quantity: 1 });
    expect(ack.success).toBe(true);
    await server.$onItemPurchased({ account: 'adbuyer', purchaseId: 'ad-1', productId: 'ad_remove', quantity: 1 });

    server.connect({ account: 'adbuyer' });
    const profile = await server.loadProfile();
    expect(profile.meta.adRemoved).toBe(true);
    expect(profile.meta.crystals).toBe(500);
    const claim = await server.claimPurchases();
    expect(claim.list.length).toBe(1);
    expect(claim.econ.adRemoved).toBe(true);
    expect(claim.econ.crystals).toBe(500);
  });

  test('상자 상품은 사자마자 열려서 카드가 들어간다', async (server) => {
    const ack = await server.$onItemPurchased({ account: 'cara', purchaseId: 'c1', productId: 'chest_legend', quantity: 1 });
    expect(ack.success).toBe(true);
    await server.$onItemPurchased({ account: 'cara', purchaseId: 'c1', productId: 'chest_legend', quantity: 1 });
    server.connect({ account: 'cara' });
    const got = await server.claimPurchases();
    expect(got.list.length).toBe(1);
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

  test('뽑기권: 광고로 1장 받고, 뽑기권으로 뽑으면 보석 대신 뽑기권이 줄어든다', async (server) => {
    server.connect({ account: 'tix' });
    const none = await server.econ({ action: 'gacha', args: { n: 1, ticket: true } });
    expect(none.result).toBe(null);
    const ad = await server.econ({ action: 'adReward', args: { kind: 'tickets' } });
    expect(ad.result).toBe(1);
    expect(ad.econ.items.gachaTicket).toBe(1);
    const ten = await server.econ({ action: 'gacha', args: { n: 10, ticket: true } });
    expect(ten.result).toBe(null); // 10회는 10장 필요
    const one = await server.econ({ action: 'gacha', args: { n: 1, ticket: true } });
    expect(one.result.drops.length > 0).toBe(true);
    expect(one.econ.items.gachaTicket).toBe(0);
    expect(one.econ.crystals).toBe(0);
    await server.$onItemPurchased({ account: 'tix', purchaseId: 't1', productId: 'summon_ticket_pack', quantity: 1 });
    server.connect({ account: 'tix' });
    const got = await server.claimPurchases();
    expect(got.econ.items.gachaTicket).toBe(3);
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
    await server.saveProfile({ crystals: 5000000, units: { archer: 7, ranger: 3 }, items: { summonTicket: 9999, mythicTicket: 2 } });
    const sync = await server.econSync();
    expect(sync.econ.crystals).toBe(20000);
    expect(sync.econ.units.archer).toBe(7);
    // 예전 소환권(상한 100 → 10장당 1)·신화 확정권(1장당 6)은 뽑기권으로
    expect(sync.econ.items.gachaTicket).toBe(10 + 12);
    expect(sync.econ.items.summonTicket).toBeUndefined();
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

  test('봇전 결과: 잘못된 id 는 무시, 맞는 id 는 경기 시간과 상관없이 한 번만 반영', async (server) => {
    server.connect({ account: 'b1' });
    const { id } = await server.pvpBotStart();
    expect(await server.pvpBotResult({ id: 'wrong', won: true })).toBe(null);
    const won = await server.pvpBotResult({ id, won: true }); // 시작 직후여도 반영
    expect(won.delta > 0).toBe(true);
    expect(await server.pvpBotResult({ id, won: true })).toBe(null); // 같은 판 두 번은 안 됨
    const lost = await server.pvpBotResult({ id: (await server.pvpBotStart()).id, won: false }); // 일찍 나가도 패배 반영
    expect(lost.delta <= 0).toBe(true);
    const lb = await server.pvpLeaderboard();
    expect(lb.me.wins).toBe(1);
    expect(lb.me.losses).toBe(1);
  });

  test('연결 끊김: 바로 지지 않고, 그동안 받은 몹 공격을 다시 들어오면 돌려준다', async (server) => {
    await server.simulateJoin('r4', 'p7');
    await server.simulateJoin('r4', 'p8');
    server.connect({ account: 'p7', roomId: 'r4' });
    await server.pvpReady({});
    server.connect({ account: 'p8', roomId: 'r4' });
    await server.pvpReady({});
    await server.simulateDisconnect('r4', 'p8');
    server.connect({ account: 'p7', roomId: 'r4' });
    expect(await server.pvpAttack({ card: 2, wave: 3, pos: 0.4 })).toBe(true);
    expect(await server.pvpAttack({ card: 5, wave: 3, pos: 0.6 })).toBe(true);
    // 유예 시간 전에는 승리 요청이 거절된다
    expect(await server.pvpClaimAway()).toBe(null);
    server.connect({ account: 'p8', roomId: 'r4' });
    const back = await server.pvpResume();
    expect(back.status).toBe('playing');
    expect(back.pending.length).toBe(2);
    expect(back.pending[1].card).toBe(5);
    // 돌려준 뒤에는 비워진다
    expect((await server.pvpResume()).pending.length).toBe(0);
    // 다시 들어온 뒤에는 승리 요청 불가
    server.connect({ account: 'p7', roomId: 'r4' });
    expect(await server.pvpClaimAway()).toBe(null);
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

describe('닉네임', () => {
  test('닉네임을 바꾸면 랭킹에 바로 반영된다', async (server) => {
    server.connect({ account: 'nicky' });
    const t = (await server.pvpBotStart()).id;
    await server.pvpBotResult({ id: t, won: true });
    await server.setNick({ nick: '새이름' });
    const lb = await server.pvpLeaderboard();
    const row = lb.top.find((r: any) => r.account === 'nicky');
    expect(!!row).toBe(true);
    expect(row.nick).toBe('새이름');
    const st = await server.setNick({ nick: '   ' });
    expect(st.nick).toBe('용사');
  });

  test('비속어 닉네임은 기본 이름으로 바뀐다 (랭킹·대전 상대 화면 포함)', async (server) => {
    server.connect({ account: 'bad1' });
    expect((await server.setNick({ nick: '씨 1 발' })).nick).toBe('용사');
    expect((await server.setNick({ nick: 'F.U.C.K' })).nick).toBe('용사');
    expect((await server.setNick({ nick: '하늘보리' })).nick).toBe('하늘보리');
    const t = (await server.pvpBotStart()).id;
    await server.pvpBotResult({ id: t, won: true });
    await server.setNick({ nick: 'ㅅㅂ' });
    const row = (await server.pvpLeaderboard()).top.find((r: any) => r.account === 'bad1');
    expect(row.nick).toBe('용사');
  });
});
