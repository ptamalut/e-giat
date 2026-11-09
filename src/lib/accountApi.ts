import { isValidUsername, looksLikeEmail, normalizeUsername, USERNAME_HELP } from './account'
import { errMsg, supabase } from './supabase'

/** Email untuk login: bila isian sudah berupa email dipakai langsung; selain itu dicari dari nama pengguna (null bila tidak ada). */
export async function resolveLoginEmail(login: string): Promise<string | null> {
  const v = login.trim()
  if (looksLikeEmail(v)) return v
  const { data, error } = await supabase.rpc('login_email', { p_login: v })
  if (error) throw new Error(errMsg(error))
  return (data as string | null) ?? null
}

export async function usernameAvailable(username: string): Promise<boolean> {
  if (!isValidUsername(username)) throw new Error(USERNAME_HELP)
  const { data, error } = await supabase.rpc('username_available', { p_username: normalizeUsername(username) })
  if (error) throw new Error(errMsg(error))
  return !!data
}

export interface MyProfile { username: string; email: string | null }
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc('my_profile')
  if (error) throw new Error(errMsg(error))
  return (data as MyProfile | null) ?? null
}

export async function setMyUsername(username: string): Promise<void> {
  const { error } = await supabase.rpc('set_my_username', { p_username: normalizeUsername(username) })
  if (error) throw new Error(errMsg(error))
}
