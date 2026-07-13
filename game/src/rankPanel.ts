import { GameServer } from '@agent8/gameserver';
import { meta } from './meta';
import { audio } from './audio';
import { t } from './i18n';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

const NICKNAME_KEY = 'randomdefense.nickname';

export function getLocalNickname(): string {
  return localStorage.getItem(NICKNAME_KEY) || `Player_${Math.floor(1000 + Math.random() * 9000)}`;
}

export function setLocalNickname(nick: string): void {
  localStorage.setItem(NICKNAME_KEY, nick.trim());
}

export function openRankPanel(): void {
  const panel = $('rank-panel');
  const server = GameServer.getInstance();

  const renderLoading = () => {
    panel.innerHTML = `
      <div class="dialog">
        <h2>${t('rank.title')}</h2>
        <div style="text-align:center; padding: 30px 0; color: #8892b0;">
          <span style="display:inline-block; animation: spin 1s linear infinite; margin-right: 8px;">⏳</span>
          ${t('rank.loading')}
        </div>
        <button class="close">${t('common.close')}</button>
      </div>`;
    (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
    panel.classList.remove('hidden');
  };

  const renderError = (errMsg: string) => {
    panel.innerHTML = `
      <div class="dialog">
        <h2>${t('rank.title')}</h2>
        <div style="text-align:center; padding: 20px 0; color: #ff5252;">
          ${t('rank.connectError')}<br/>
          <span style="font-size:12px; color:#888;">${errMsg}</span>
        </div>
        <button class="close">${t('common.close')}</button>
      </div>`;
    (panel.querySelector('.close') as HTMLElement).onclick = () => panel.classList.add('hidden');
    panel.classList.remove('hidden');
  };

  const renderRankings = (rankings: any[], myRankInfo: { bestEntry: any | null; rank: number }) => {
    const currentNick = getLocalNickname();

    const rankingRows = rankings.map((r, index) => {
      const isMe = r.account === server.account;
      return `
        <div class="row" style="display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; border-radius: 6px; background: ${isMe ? 'rgba(255, 207, 63, 0.15)' : 'rgba(255, 255, 255, 0.02)'}; margin-bottom: 4px; border: 1px solid ${isMe ? 'rgba(255, 207, 63, 0.4)' : 'transparent'};">
          <div style="display:flex; align-items:center; gap: 8px;">
            <span style="font-weight:800; font-size:14px; width:24px; color:${index < 3 ? '#ffcf3f' : '#8892b0'};">
              #${index + 1}
            </span>
            <span style="font-weight:700; font-size:14px; color:${isMe ? '#ffcf3f' : '#fff'};">
              ${r.nickname}
            </span>
          </div>
          <span style="font-weight:800; font-size:14px; color:#64ffda;">
            ${t('rank.waveSuf', { n: r.wave })}
          </span>
        </div>`;
    }).join('');

    const noRecordsHtml = rankingRows.length === 0
      ? `<div style="text-align:center; padding: 20px 0; color: #8892b0; font-size:13px;">${t('rank.noRecords')}</div>`
      : '';

    let myBestHtml = '';
    if (myRankInfo.bestEntry) {
      const isTop20 = rankings.some(r => r.account === server.account);
      if (!isTop20) {
        myBestHtml = `
          <div style="margin-top: 10px; border-top: 2px dashed rgba(255, 255, 255, 0.1); padding-top: 10px;">
            <div style="font-weight:700; font-size:12px; color:#8892b0; margin-bottom: 4px;">${t('rank.myBest')}</div>
            <div class="row" style="display:flex; justify-content:space-between; align-items:center; padding: 8px 12px; border-radius: 6px; background: rgba(255, 207, 63, 0.15); border: 1px solid rgba(255, 207, 63, 0.4);">
              <div style="display:flex; align-items:center; gap: 8px;">
                <span style="font-weight:800; font-size:14px; width:24px; color:#ffcf3f;">#${myRankInfo.rank}</span>
                <span style="font-weight:700; font-size:14px; color:#ffcf3f;">${myRankInfo.bestEntry.nickname}</span>
              </div>
              <span style="font-weight:800; font-size:14px; color:#64ffda;">${t('rank.waveSuf', { n: myRankInfo.bestEntry.wave })}</span>
            </div>
          </div>`;
      }
    } else if (meta.bestWave > 0) {
      myBestHtml = `
        <div style="margin-top: 10px; text-align:center; background: rgba(255, 255, 255, 0.03); padding: 10px; border-radius: 6px; font-size: 12px; color: #aaa;">
          ${t('rank.notRegistered', { n: meta.bestWave })}
        </div>`;
    }

    panel.innerHTML = `
      <div class="dialog" style="max-height:85vh; display:flex; flex-direction:column; overflow:hidden;">
        <h2>${t('rank.title')}</h2>

        <div style="flex:1; overflow-y:auto; margin-bottom:12px; max-height:40vh; padding-right:4px;">
          ${rankingRows}
          ${noRecordsHtml}
          ${myBestHtml}
        </div>

        <div style="border-top:1px solid rgba(255,255,255,0.1); padding-top:12px;">
          <div style="font-weight:700; font-size:13px; margin-bottom: 6px; display:flex; justify-content:space-between; align-items:center;">
            <span>${t('rank.nicknameManage')}</span>
            <span style="font-size:11px; color:#888;">${t('rank.maxChars')}</span>
          </div>
          <div style="display:flex; gap: 8px; align-items:stretch; height: 38px;">
            <input type="text" id="rank-panel-nickname" value="${currentNick}" style="flex:1; padding: 6px 12px; border: 1px solid #444; background: #222; color: #fff; border-radius: 8px; font-size: 13px;" maxLength="15" />
            <button id="btn-save-nickname" class="wood-btn" style="padding: 0 16px; font-size: 13px; font-weight:800; border-radius:0;">${t('rank.changeNickname')}</button>
          </div>
          <div id="nickname-save-status" style="font-size:11px; color:#8892b0; margin-top:5px; min-height:16px;"></div>
        </div>

        <button class="close" style="margin-top:12px;">${t('common.close')}</button>
      </div>`;

    const saveBtn = panel.querySelector('#btn-save-nickname') as HTMLButtonElement;
    const nickInput = panel.querySelector('#rank-panel-nickname') as HTMLInputElement;
    const statusDiv = panel.querySelector('#nickname-save-status') as HTMLDivElement;

    saveBtn.onclick = async () => {
      audio.button();
      const newNick = nickInput.value.trim();
      if (newNick.length < 1) {
        statusDiv.textContent = t('rank.nicknameEmpty');
        statusDiv.style.color = '#ff5252';
        return;
      }
      if (newNick.length > 15) {
        statusDiv.textContent = t('rank.nicknameTooLong');
        statusDiv.style.color = '#ff5252';
        return;
      }

      setLocalNickname(newNick);
      saveBtn.disabled = true;
      nickInput.disabled = true;
      statusDiv.textContent = t('rank.saving');
      statusDiv.style.color = '#ffd54f';

      try {
        if (meta.bestWave > 0) {
          const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error(t('rank.serverTimeout'))), ms));
          if (!server.connected) {
            await Promise.race([server.connect(), timeout(5000)]);
          }
          if (server.connected) {
            await Promise.race([
              server.remoteFunction('submitWave', [meta.bestWave, newNick]),
              timeout(5000)
            ]);
            statusDiv.textContent = t('rank.nicknameChangedRegistered', { n: meta.bestWave });
            statusDiv.style.color = '#4caf50';
          } else {
            throw new Error(t('rank.serverUnavailable'));
          }
        } else {
          statusDiv.textContent = t('rank.deviceNicknameSet');
          statusDiv.style.color = '#4caf50';
        }

        // Refresh rankings after 1.5 seconds
        setTimeout(fetchAndRender, 1500);
      } catch (e: any) {
        statusDiv.textContent = t('rank.registerFailed', { msg: e.message || t('rank.unknownError') });
        statusDiv.style.color = '#ff5252';
      } finally {
        saveBtn.disabled = false;
        nickInput.disabled = false;
      }
    };

    (panel.querySelector('.close') as HTMLElement).onclick = () => {
      audio.button();
      panel.classList.add('hidden');
    };
  };

  const fetchAndRender = async () => {
    const timeout = (ms: number) => new Promise((_, reject) => setTimeout(() => reject(new Error(t('rank.serverTimeout'))), ms));

    try {
      if (!server.connected) {
        await Promise.race([
          server.connect(),
          timeout(4000)
        ]);
      }
      const [rankings, myRankInfo] = await Promise.race([
        Promise.all([
          server.remoteFunction('getTopRankings'),
          server.remoteFunction('getMyBestRank'),
        ]),
        timeout(4000)
      ]) as [any[], any];

      renderRankings(rankings, myRankInfo);
    } catch (err: any) {
      console.error(err);
      renderError(err.message || t('rank.checkNetwork'));
    }
  };

  renderLoading();
  fetchAndRender();
}
