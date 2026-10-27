# Context — RandomDefense

## Project overview
- Browser-based tower-defense game with economy, progression, ads, VX Shop purchases, and PvP.
- Client game code is TypeScript; server logic runs on Agent8 GameServer SDK 2.x.

## Critical implementation notes
- Product definitions and grant amounts are shared in `game/src/config.ts` and applied by `game/src/econ/rules.ts`.
- Online purchase fulfillment runs in the server-side `$onItemPurchased` hook and uses the event's `account` and `purchaseId`.
- Economy state is server-authoritative; client purchase claims display results and synchronize state rather than applying online grants.
- Preserve registered product IDs, configured prices, grant quantities, and platform purchase limits when changing fulfillment logic.
