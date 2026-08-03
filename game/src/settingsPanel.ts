// ============================================================
//  설정 패널 - 게임 화면 상단바 ⚙️ 버튼
//  음소거 / BGM·효과음 볼륨
//  (언어 설정, 데이터 초기화는 메인화면으로 분리)
// ============================================================
import { audio } from './audio';
import { resetTutorial, meta } from './meta';
import { t } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export function openSettingsPanel(): void {
  const panel = $('settings-panel');

  const render = () => {
    const muted = audio.isMuted();
    panel.innerHTML = `
      <div class="dialog">
        <h2>${t('set.title')}</h2>
        <div class="row">
          <div class="info"><div class="t">${t('set.muteAll')}</div></div>
          <button id="btn-mute-toggle">${muted ? t('set.muteOn') : t('set.muteOff')}</button>
        </div>
        <div class="settings-row">
          <div class="settings-label"><span class="ui-icon icon-music"></span> ${t('set.bgm')}</div>
          <input type="range" class="vol-slider" id="bgm-vol" min="0" max="100" value="${audio.getBgmVolume()}">
          <span class="vol-val" id="bgm-vol-val">${audio.getBgmVolume()}</span>
        </div>
        <div class="settings-row">
          <div class="settings-label">${t('set.sfx')}</div>
          <input type="range" class="vol-slider" id="sfx-vol" min="0" max="100" value="${audio.getSfxVolume()}">
          <span class="vol-val" id="sfx-vol-val">${audio.getSfxVolume()}</span>
        </div>
        <div class="row">
          <div class="info"><div class="t">${t('set.tutorial')}</div><div class="d">${t('set.tutorialDesc')}</div></div>
          <button id="btn-tutorial" ${meta.tutorialDone ? '' : 'disabled'}>${meta.tutorialDone ? t('set.tutorialBtn') : t('set.tutorialDone')}</button>
        </div>
        <button class="close">${t('common.close')}</button>
      </div>`;

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
    sfxSlider.onchange = () => audio.button();
    (panel.querySelector('#btn-tutorial') as HTMLElement).onclick = () => {
      audio.button();
      resetTutorial();
      render();
    };
    (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
  };

  render();
  panel.classList.remove('hidden');
}
