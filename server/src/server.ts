/**
 * Agent8 GameServer - RandomDefense Rankings & Progress Syncing
 * 
 * Types are automatically available: $global, $sender, $room, $asset
 */

export class Server {
  async ping(): Promise<string> {
    return 'pong';
  }

  async getMyAccount(): Promise<string> {
    return $sender.account;
  }

  /**
   * Saves the player's full metadata on the server.
   * Also ensures the leaderboard wave is kept in sync with the saved meta.bestWave.
   */
  async savePlayerData(meta: any, nickname: string): Promise<boolean> {
    if (!meta) return false;

    // Cat Trio와 동일하게 게임 저장 데이터를 별도 필드에 통째로 보관한다.
    await $global.updateMyState({ gameSave: meta });

    // 2. Synchronize best wave to leaderboard if available
    const wave = Number(meta.bestWave || 0);
    if (wave > 0) {
      const cleanNick = (nickname || '').trim() || `Player_${$sender.account.slice(2, 6)}`;

      // Check current ranking entries
      const myRankings = await $global.getCollectionItems('rankings', {
        filters: [{ field: 'account', operator: '==', value: $sender.account }]
      });

      const sorted = [...myRankings].sort((a, b) => b.wave - a.wave);
      const currentBest = sorted.length > 0 ? sorted[0] : null;

      if (!currentBest || wave > currentBest.wave) {
        // Delete old records to enforce exactly 1 record per account
        for (const entry of myRankings) {
          if (entry.__id) {
            await $global.deleteCollectionItem('rankings', entry.__id);
          }
        }

        // Insert new best record
        const entry = {
          account: $sender.account,
          wave,
          nickname: cleanNick,
          createdAt: Date.now()
        };
        await $global.addCollectionItem('rankings', entry);
      }
    }

    return true;
  }

  /**
   * Loads the player's metadata from the server.
   */
  async loadPlayerData(): Promise<any> {
    const state = await $global.getMyState();
    // 기존 최상위 저장 형식도 한 번 읽어 마이그레이션 전 진행도를 보존한다.
    return state?.gameSave || state || null;
  }

  /**
   * Submits a wave record, keeping only one highest score per account.
   * Returns structured data only (no localized text) so the client can
   * compose the message in the player's chosen language.
   */
  async submitWave(wave: number, nickname: string): Promise<{ updated: boolean; bestWave: number; isFirst: boolean; previousWave: number }> {
    if (typeof wave !== 'number' || wave < 0) {
      throw new Error('Invalid wave.');
    }
    const cleanNick = (nickname || '').trim();
    if (cleanNick.length < 1 || cleanNick.length > 15) {
      throw new Error('Nickname must be between 1 and 15 characters.');
    }

    // Get all rankings for this user
    const myRankings = await $global.getCollectionItems('rankings', {
      filters: [{ field: 'account', operator: '==', value: $sender.account }]
    });

    const sorted = [...myRankings].sort((a, b) => b.wave - a.wave);
    const currentBest = sorted.length > 0 ? sorted[0] : null;

    if (!currentBest || wave > currentBest.wave) {
      // Delete existing records to keep exactly 1 entry per account
      for (const entry of myRankings) {
        if (entry.__id) {
          await $global.deleteCollectionItem('rankings', entry.__id);
        }
      }

      // Save new best record
      const entry = {
        account: $sender.account,
        wave,
        nickname: cleanNick,
        createdAt: Date.now()
      };

      await $global.addCollectionItem('rankings', entry);

      // Also update player state in parallel to keep them in sync
      const playerState = await $global.getMyState();
      const stateBestWave = Number(playerState?.bestWave || 0);
      if (wave > stateBestWave) {
        await $global.updateMyState({ bestWave: wave });
      }

      return {
        updated: true,
        bestWave: wave,
        isFirst: !currentBest,
        previousWave: currentBest ? currentBest.wave : 0
      };
    } else {
      return {
        updated: false,
        bestWave: currentBest.wave,
        isFirst: false,
        previousWave: currentBest.wave
      };
    }
  }

  /**
   * Gets top 20 rankings sorted by wave (descending)
   */
  async getTopRankings(): Promise<any[]> {
    return await $global.getCollectionItems('rankings', {
      orderBy: [{ field: 'wave', direction: 'desc' }],
      limit: 20
    });
  }

  /**
   * Gets the current user's best rank and score entry
   */
  async getMyBestRank(): Promise<{ bestEntry: any | null; rank: number }> {
    const myRankings = await $global.getCollectionItems('rankings', {
      filters: [{ field: 'account', operator: '==', value: $sender.account }]
    });

    const sorted = [...myRankings].sort((a, b) => b.wave - a.wave);
    if (sorted.length === 0) {
      return { bestEntry: null, rank: -1 };
    }

    const bestEntry = sorted[0];
    const higherCount = await $global.countCollectionItems('rankings', {
      filters: [{ field: 'wave', operator: '>', value: bestEntry.wave }]
    });

    return {
      bestEntry,
      rank: higherCount + 1
    };
  }

  /**
   * VX Shop 결제 감사 콜백. Cat Trio의 검증된 구현과 동일하게 지급은
   * 클라이언트 onClose(purchased)에서 처리하고 서버에는 구매 기록만 남긴다.
   */
  async $onItemPurchased({ account, purchaseId, productId, quantity, metadata }: {
    account: string;
    purchaseId: string;
    productId: string;
    quantity?: number;
    metadata?: any;
  }): Promise<void> {
    if (!account || !productId) return;
    const qty = Number.isFinite(Number(quantity)) && Number(quantity) > 0 ? Number(quantity) : 1;
    try {
      await $global.addCollectionItem('vx_purchases', {
        account,
        purchaseId: purchaseId || null,
        productId,
        quantity: qty,
        metadata: metadata ?? null,
        createdAt: Date.now(),
      });
    } catch {
      // 감사 로그 실패가 결제 완료 흐름을 막지 않게 한다.
    }
  }
}
