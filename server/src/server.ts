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

    // 1. Save metadata to player's persistent account state
    await $global.updateMyState(meta);

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
    return await $global.getMyState();
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
   * VX Shop purchase webhook. Verse8 calls this after a payment is confirmed,
   * so all crediting must happen here (never trust the client). productId
   * must exactly match what's registered in the VX Shop dashboard tab AND
   * game/src/config.ts (CRYSTAL_PACKAGES[].id / AD_REMOVAL_PRODUCT_ID).
   *
   * Security guarantees:
   *  - purchaseId deduplication: same purchaseId replayed → no-op (idempotent)
   *  - Quantity validation: must be a positive integer ≤ 99
   *  - speed-3x-unlock: only grants once per account (already-owned check)
   *  - Unknown productId: no credits granted, but purchaseId still recorded
   *    to prevent future replay if the productId later becomes known
   *  - All crediting is server-side only; the client cannot trigger grants
   */
  async $onItemPurchased({ account, purchaseId, productId, quantity }: {
    account: string;
    purchaseId: string;
    productId: string;
    quantity: number;
    metadata?: any;
  }): Promise<{ success: boolean }> {
    const MAX_QUANTITY = 99;

    const CRYSTAL_GRANTS: Record<string, number> = {
      'gems-100': 100,
      'gems-550': 550,
      'gems-1200': 1200,
    };
    const ALLOWED_IDS = new Set([...Object.keys(CRYSTAL_GRANTS), 'speed-3x-unlock']);

    if (!account || typeof account !== 'string') return { success: false };
    if (!purchaseId || typeof purchaseId !== 'string') return { success: false };
    if (!productId || typeof productId !== 'string') return { success: false };

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty < 1 || qty > MAX_QUANTITY) {
      return { success: false };
    }

    const state = await $global.getUserState(account);
    const processedIds: Record<string, true> = state?.purchaseIds || {};

    if (processedIds[purchaseId]) {
      return { success: true };
    }

    const updates: Record<string, any> = {
      purchaseIds: { ...processedIds, [purchaseId]: true },
    };

    if (!ALLOWED_IDS.has(productId)) {
      await $global.updateUserState(account, updates);
      return { success: true };
    }

    if (CRYSTAL_GRANTS[productId] !== undefined) {
      const current = Number(state?.crystals || 0);
      updates.crystals = current + CRYSTAL_GRANTS[productId] * qty;
    } else if (productId === 'speed-3x-unlock') {
      if (!state?.adRemoved) {
        updates.adRemoved = true;
      }
    }

    await $global.updateUserState(account, updates);
    return { success: true };
  }
}
