// ============================================================
//  설정 패널 - 게임 화면 상단바 ⚙️ 버튼
//  음소거 / BGM·효과음 볼륨 / 진행 데이터 초기화
// ============================================================
import { audio } from './audio';
import { resetProgress } from './meta';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

export function openSettingsPanel(): void {
  const panel = $('settings-panel');
  let confirmingReset = false;

  const render = () => {
    if (confirmingReset) {
      panel.innerHTML = `
        <div class="dialog">
          <h2>정말 초기화할까요?</h2>
          <div class="d" style="color:#bbb;text-align:center">
            보석·컬렉션·업적·최고 기록 등 모든 진행 데이터가<br>영구히 삭제되며 되돌릴 수 없습니다.
          </div>
          <div class="confirm-btns">
            <button class="cancel">취소</button>
            <button class="danger">초기화</button>
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
    panel.innerHTML = `
      <div class="dialog">
        <h2>설정</h2>
        <div class="row">
          <div class="info"><div class="t">전체 음소거</div></div>
          <button id="btn-mute-toggle">${muted ? '🔇 켜짐' : '🔊 꺼짐'}</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">🎵 배경음악</div>
          <input type="range" class="vol-slider" id="bgm-vol" min="0" max="100" value="${audio.getBgmVolume()}">
          <span class="vol-val" id="bgm-vol-val">${audio.getBgmVolume()}</span>
        </div>
        <div class="settings-row">
          <div class="settings-label">🔊 효과음</div>
          <input type="range" class="vol-slider" id="sfx-vol" min="0" max="100" value="${audio.getSfxVolume()}">
          <span class="vol-val" id="sfx-vol-val">${audio.getSfxVolume()}</span>
        </div>
        <div class="shop-section">데이터</div>
        <div class="row">
          <div class="info"><div class="t">진행 데이터 초기화</div><div class="d">보석·컬렉션·업적·기록 삭제</div></div>
          <button id="btn-reset">초기화</button>
        </div>
        <button class="close">닫기</button>
      </div>`;

    (panel.querySelector('#btn-mute-toggle') as HTMLElement).onclick = () => {
      audio.toggleMute();
      render();
    };
    const bgmSlider = panel.querySelector('#bgm-vol') as HTMLInputElement;
    const sfxSlider = panel.querySelector('#sfx-vol') as HTMLInputElement;
    const bgmVal = panel.querySelector('#bgm-vol-val') as HTMLElement;
    const sfxVal = panel.querySelector('#sfx-vol-val') as HTMLElement;
    bgmSlider.oninput = () => {
      const v = Number(bgmSlider.value);
      audio.setBgmVolume(v);
      bgmVal.textContent = String(v);
    };
    sfxSlider.oninput = () => {
      const v = Number(sfxSlider.value);
      audio.setSfxVolume(v);
      sfxVal.textContent = String(v);
    };
    sfxSlider.onchange = () => audio.button(); // 손을 뗐을 때 현재 볼륨으로 미리듣기
    (panel.querySelector('#btn-reset') as HTMLElement).onclick = () => {
      audio.button();
      confirmingReset = true;
      render();
    };
    (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
  };

  render();
  panel.classList.remove('hidden');
}
