export interface PlayerProfile {
  name: string;
  nickname: string;
  avatar: string; // path to image
}

// Map of known players (name match is case-insensitive)
export const KNOWN_PLAYERS: PlayerProfile[] = [
  { name: 'Coulston', nickname: 'C', avatar: '/avatars/coulston-c.jpg' },
  { name: 'Danny', nickname: 'Danny', avatar: '/avatars/danny.jpg' },
  { name: 'Eli', nickname: 'Spevack', avatar: '/avatars/eli-spevack.png' },
  { name: 'Grant', nickname: 'Grant', avatar: '/avatars/grant.jpg' },
  { name: 'Isaiah', nickname: 'Isaiah', avatar: '/avatars/isaiah.png' },
  { name: 'James', nickname: 'Kozi', avatar: '/avatars/james-kozi.png' },
  { name: 'Jared', nickname: 'Jared', avatar: '/avatars/jared.png' },
  { name: 'Jay', nickname: 'Articuno', avatar: '/avatars/jay-articuno.png' },
  { name: 'John', nickname: 'Johnnyrocks', avatar: '/avatars/john-johnnyrocks.png' },
  { name: 'Justin', nickname: 'Justin', avatar: '/avatars/justin.jpg' },
  { name: 'Maanav', nickname: 'Maanav', avatar: '/avatars/maanav.png' },
  { name: 'Simon', nickname: 'Simon', avatar: '/avatars/simon.png' },
  { name: 'TJ', nickname: 'TJB', avatar: '/avatars/tj.jpg' },
  { name: 'Tom', nickname: 'Toe-mas', avatar: '/avatars/tom-toe-mas.jpg' },
  { name: 'Tyler', nickname: 'Ty$', avatar: '/avatars/tyler-ty.png' },
  { name: 'Zach', nickname: 'Zach', avatar: '/avatars/zach.png' },
];

export function findProfile(name: string): PlayerProfile | null {
  const lower = name.toLowerCase();
  return KNOWN_PLAYERS.find((p) =>
    p.name.toLowerCase() === lower ||
    p.nickname.toLowerCase() === lower
  ) || null;
}

export function getAvatar(name: string): string | null {
  return findProfile(name)?.avatar || null;
}

export function getDisplayName(name: string, useNickname: boolean): string {
  const profile = findProfile(name);
  if (!profile) return name;
  return useNickname ? profile.nickname : profile.name;
}
