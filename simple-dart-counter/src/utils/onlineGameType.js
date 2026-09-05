/** Cricket online nemá live sync / ACK; lobby i join proto pouští jen X01. */
export const ONLINE_CRICKET_UNSUPPORTED = 'cricket_unsupported';

export function assertOnlineX01Only(gameType) {
  if (gameType === 'cricket') {
    throw new Error(ONLINE_CRICKET_UNSUPPORTED);
  }
}
