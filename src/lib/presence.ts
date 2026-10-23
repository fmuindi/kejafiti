import { formatDate, timeAgo } from "./dates";

// Online, typing and last-active wording for conversations. "Online" means the other side has
// this conversation open right now, or used the app within the last two minutes.

/** The app checks in about once a minute while open, so two minutes covers one missed check-in. */
export const ONLINE_WINDOW_MS = 2 * 60_000;

export type PeerState = { typing: boolean; here: boolean; lastActive: string | null };
export type PeerLabel = { tone: "typing" | "online" | "away"; text: string };

export function isRecentlyActive(lastActive: string | null, now: number): boolean {
  return !!lastActive && now - new Date(lastActive).getTime() < ONLINE_WINDOW_MS;
}

/** "Active 5 min ago", "Active yesterday", "Active on 12 Oct". */
export function lastActiveText(lastActive: string, now: number): string {
  const days = (now - new Date(lastActive).getTime()) / 86_400_000;
  if (days >= 7) return `Active on ${formatDate(lastActive, { year: false })}`;
  return `Active ${timeAgo(lastActive, new Date(now))}`;
}

/** What to show next to the other side's name. Null when nothing is known yet. */
export function peerLabel(peer: PeerState, now: number): PeerLabel | null {
  if (peer.typing) return { tone: "typing", text: "Typing…" };
  if (peer.here || isRecentlyActive(peer.lastActive, now)) return { tone: "online", text: "Online" };
  if (peer.lastActive) return { tone: "away", text: lastActiveText(peer.lastActive, now) };
  return null;
}
