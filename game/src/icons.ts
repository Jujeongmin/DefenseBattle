// ============================================================
//  픽셀 아이콘 - 이모지 대신 쓰는 이미지 아이콘 (public/ui/icons, tools/build_ui_assets.py)
//  이모지는 OS 마다 모양이 달라 픽셀 아트 화면과 섞이면 어색하다.
// ============================================================
export type IconName =
  | 'gem' | 'coin' | 'chest' | 'trophy' | 'crown' | 'skull' | 'scroll' | 'lock' | 'flask'
  | 'helmet' | 'sword' | 'sound' | 'mute' | 'warning' | 'hammer' | 'bag' | 'medal'
  | 'medal_silver' | 'medal_bronze' | 'flag' | 'heart' | 'star' | 'star_off' | 'tv' | 'ticket'
  | 'bolt' | 'calendar' | 'infinity' | 'check' | 'map' | 'robot' | 'plus' | 'close'
  | 'shop' | 'home' | 'pause' | 'play' | 'timer' | 'gift' | 'party' | 'summon' | 'settings'
  | 'rank' | 'target' | 'music' | 'trash' | 'up' | 'down' | 'pointer';

/** 인라인 아이콘 HTML. 크기는 글자 크기(em)를 따른다. */
export function icon(name: IconName, cls = ''): string {
  return `<i class="pi pi-${name}${cls ? ' ' + cls : ''}" aria-hidden="true"></i>`;
}

/** 별 n개 / 3개 */
export function stars(n: number, total = 3): string {
  return Array.from({ length: total }, (_, i) => icon(i < n ? 'star' : 'star_off')).join('');
}

/** 상자 그림 (등급마다 다름: 나무·은·금·마법·전설 - tools/build_chest_icons.py) */
export function chestArt(kind: string, cls = ''): string {
  return `<i class="chest-art k-${kind}${cls ? ' ' + cls : ''}" style="background-image:url('/ui/chests/${kind}.png')" aria-hidden="true"></i>`;
}
