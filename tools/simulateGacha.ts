// ============================================================
//  가챠 확률/천장 헤드리스 검증
//  실행: npx tsx tools/simulateGacha.ts
// ============================================================
import { meta, saveMeta } from '../game/src/meta';
import {
  GACHA, GRADES, GRADE_INDEX, GACHA_GRADE_RATES, rollGachaGrade, rollGachaMythicPlus, rollGachaLegendaryPlus,
  gachaGradeProbabilities, gradeProbabilities,
} from '../game/src/config';
import type { GradeKey } from '../game/src/types';

function pullOne(): GradeKey {
  meta.gachaPity = (meta.gachaPity || 0) + 1;
  let grade: GradeKey;
  if (meta.gachaPity >= GACHA.mythicPityCount) {
    grade = rollGachaMythicPlus();
    meta.gachaPity = 0;
  } else {
    grade = rollGachaGrade();
    if (GRADE_INDEX[grade] >= GRADE_INDEX['mythic']) meta.gachaPity = 0;
  }
  return grade;
}

function pullTen(): GradeKey[] {
  const results: GradeKey[] = [];
  for (let i = 0; i < 10; i++) results.push(pullOne());
  if (!results.some((g) => GRADE_INDEX[g] >= GRADE_INDEX['legendary'])) {
    const idx = results.length - 1;
    results[idx] = rollGachaLegendaryPlus();
    if (GRADE_INDEX[results[idx]] >= GRADE_INDEX['mythic']) meta.gachaPity = 0;
  }
  return results;
}

// ---- 1) 확률 분포 검증 (대량 시행, 천장 비활성 상태로) ----
function checkDistribution(n = 200000) {
  const counts: Record<string, number> = {};
  for (const g of GRADES) counts[g.key] = 0;
  for (let i = 0; i < n; i++) {
    // 천장 영향 없이 순수 확률만 보기 위해 rollGachaGrade 직접 사용
    counts[rollGachaGrade()]++;
  }
  console.log(`\n=== 가챠 확률 분포 (rollGachaGrade, ${n}회 시행) ===`);
  console.log('등급'.padEnd(8), '기대%', '실측%');
  const expected = gachaGradeProbabilities();
  for (const e of expected) {
    const actual = (counts[e.key] / n) * 100;
    console.log(e.key.padEnd(8), e.pct.toFixed(2).padStart(6), actual.toFixed(2).padStart(6));
  }
}

// ---- 2) 신화+ 천장(50회) 검증: 자연 확률을 0으로 눌러 강제 발동 로직만 분리 검증 ----
function checkMythicPity() {
  const savedMythic = GACHA_GRADE_RATES.mythic;
  const savedEternal = GACHA_GRADE_RATES.eternal;
  // 신화/태초 자연 확률 제거 (가중치를 common 으로 이전) -> 자연 히트 불가능하게
  GACHA_GRADE_RATES.common += savedMythic + savedEternal;
  GACHA_GRADE_RATES.mythic = 0;
  GACHA_GRADE_RATES.eternal = 0;

  meta.gachaPity = 0;
  const gradesAt: GradeKey[] = [];
  for (let i = 1; i <= GACHA.mythicPityCount; i++) gradesAt.push(pullOne());
  const preThreshold = gradesAt.slice(0, GACHA.mythicPityCount - 1);
  const atThreshold = gradesAt[GACHA.mythicPityCount - 1];

  console.log('\n=== 신화+ 천장 검증 (자연 확률 0으로 고정, 강제 로직만 분리) ===');
  console.log({
    noneMythicPlusBeforeThreshold: preThreshold.every((g) => GRADE_INDEX[g] < GRADE_INDEX['mythic']),
    forcedMythicPlusAtThreshold: GRADE_INDEX[atThreshold] >= GRADE_INDEX['mythic'],
    pityResetAfter: meta.gachaPity === 0,
    gradeAtThreshold: atThreshold,
  });

  // 원복
  GACHA_GRADE_RATES.common = savedMythic + savedEternal >= 0 ? GACHA_GRADE_RATES.common - savedMythic - savedEternal : GACHA_GRADE_RATES.common;
  GACHA_GRADE_RATES.mythic = savedMythic;
  GACHA_GRADE_RATES.eternal = savedEternal;
  meta.gachaPity = 0;
}

// ---- 3) 10연 보장(전설+) 검증: 매 10연마다 최소 1개 이상인지 ----
function checkTenPullGuarantee(trials = 2000) {
  let violations = 0;
  for (let t = 0; t < trials; t++) {
    meta.gachaPity = 0; // 천장과 무관하게 10연 보장만 독립적으로 확인
    const results = pullTen();
    const hasLegendaryPlus = results.some((g) => GRADE_INDEX[g] >= GRADE_INDEX['legendary']);
    if (!hasLegendaryPlus) violations++;
  }
  console.log(`\n=== 10연 전설+ 보장 검증 (${trials}회 10연) ===`);
  console.log({ violations, expected: 0 });
}

// ---- 4) 게임 내 20골드 소환 확률표가 그대로인지 (가챠와 분리 확인) ----
function checkSummonUnaffected() {
  const summon = gradeProbabilities(0);
  console.log('\n=== 게임 내 20골드 소환 확률 (가챠와 분리 확인용, 변경 없어야 함) ===');
  summon.forEach((s) => console.log(s.key.padEnd(8), s.pct.toFixed(2) + '%'));
}

checkDistribution();
checkMythicPity();
checkTenPullGuarantee();
checkSummonUnaffected();
saveMeta();
