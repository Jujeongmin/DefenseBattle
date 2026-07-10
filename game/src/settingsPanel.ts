// ============================================================
//  설정 패널 - 게임 화면 상단바 ⚙️ 버튼
//  언어 / 음소거 / BGM·효과음 볼륨 / 진행 데이터 초기화
// ============================================================
import { audio } from './audio';
import { resetProgress } from './meta';
import { t, getLang, setLang, type Lang } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export function openSettingsPanel(): void {
  const panel = $('settings-panel');
  let confirmingReset = false;

  const render = () => {
    if (confirmingReset) {
      panel.innerHTML = `
        <div class="dialog">
          <h2>${t('set.resetTitle')}</h2>
          <div class="d" style="color:#bbb;text-align:center">${t('set.resetBody')}</div>
          <div class="confirm-btns">
            <button class="cancel">${t('common.cancel')}</button>
            <button class="danger">${t('set.resetBtn')}</button>
          </div>
        </div>`;
      (panel.querySelector('.cancel') as HTMLElement).onclick = () => { audio.button(); confirmingReset = false; render(); };
      (panel.querySelector('.danger') as HTMLElement).onclick = () => {
        resetProgress();
        confirmingReset = false;
        render();
      };
      return;
    }

    const muted = audio.isMuted();
    const lang = getLang();
    panel.innerHTML = `
      <div class="dialog">
        <h2>${t('set.title')}</h2>
        <div class="settings-row">
          <div class="settings-label">🌐 ${t('set.language')}</div>
          <div class="lang-btns">
            <button data-lang="en" class="${lang === 'en' ? 'active' : ''}">English</button>
            <button data-lang="ko" class="${lang === 'ko' ? 'active' : ''}">한국어</button>
          </div>
        </div>
        <div class="row">
          <div class="info"><div class="t">${t('set.muteAll')}</div></div>
          <button id="btn-mute-toggle">${muted ? t('set.muteOn') : t('set.muteOff')}</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">${t('set.bgm')}</div>
          <input type="range" class="vol-slider" id="bgm-vol" min="0" max="100" value="${audio.getBgmVolume()}">
          <span class="vol-val" id="bgm-vol-val">${audio.getBgmVolume()}</span>
        </div>
        <div class="settings-row">
          <div class="settings-label">${t('set.sfx')}</div>
          <input type="range" class="vol-slider" id="sfx-vol" min="0" max="100" value="${audio.getSfxVolume()}">
          <span class="vol-val" id="sfx-vol-val">${audio.getSfxVolume()}</span>
        </div>
        <div class="shop-section">${t('set.dataSection')}</div>
        <div class="row">
          <div class="info"><div class="t">${t('set.reset')}</div><div class="d">${t('set.resetDesc')}</div></div>
          <button id="btn-reset">${t('set.resetBtn')}</button>
        </div>
        <button class="close">${t('common.close')}</button>
      </div>`;

    panel.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach((b) => {
      b.onclick = () => {
        const next = b.dataset.lang as Lang;
        if (next === getLang()) return;
        setLang(next);
        // 정적 HTML/열려있는 패널 전체를 새 언어로 다시 그리기 위해 리로드
        location.reload();
      };
    });
    (panel.querySelector('#btn-mute-toggle') as HTMLElement).onclick = () => {
      audio.toggleMute();
      render();
    };
    const bgmSlider = panel.querySelector('#bgm-vol') as HTMLInputElement;
    const sfxSlider = panel.querySelector('#sfx-vol') as HTMLInputElement;
    const bgmVal = panel.querySelector('#bgm-vol-val') as HTMLElement;
    const sfxVal = panel.querySelector('#sfx-vol-val') as HTMLElement;
    bgmSlider.oninput = () => { const v = Number(bgmSlider.value); audio.setBgmVolume(v); bgmVal.textContent = String(v); };
    sfxSlider.oninput = () => { const v = Number(sfxSlider.value); audio.setSfxVolume(v); sfxVal.textContent = String(v); };
    sfxSlider.onchange = () => audio.button(); // 손 뗐을 때 현재 볼륨으로 미리듣기
    (panel.querySelector('#btn-reset') as HTMLElement).onclick = () => { audio.button(); confirmingReset = true; render(); };
    (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
  };

  render();
  panel.classList.remove('hidden');
}
