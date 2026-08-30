import { emptyProfile, type Profile } from '../sim/meta/unlocks'

/** Profile persistence: unlocks are global to this installation (shared couch). */
const PROFILE_KEY = 'profile'

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return emptyProfile()
    const parsed = JSON.parse(raw) as Partial<Profile>
    return { ...emptyProfile(), ...parsed }
  } catch {
    return emptyProfile()
  }
}

export function storeProfile(profile: Profile): void {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
}
