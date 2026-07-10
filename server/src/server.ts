/**
 * Agent8 GameServer - RandomDefense Rankings
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
   * Submits a wave record, keeping only one highest score per account.
   */
  async submitWave(wave: number, nickname: string): Promise<{ updated: boolean; bestWave: number; message: string }> {
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

      return {
        updated: true,
        bestWave: wave,
        message: currentBest
          ? `새로운 최고 기록 달성! (이전 기록: ${currentBest.wave}웨이브)`
          : `첫 기록 등록 완료! (${wave}웨이브)`
      };
    } else {
      return {
        updated: false,
        bestWave: currentBest.wave,
        message: `이미 더 높은 최고 기록이 있습니다. (${currentBest.wave}웨이브)`
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
}
