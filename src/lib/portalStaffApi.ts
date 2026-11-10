import { DOC_BUCKET } from './docs'
import type { MaterialWriter } from '../components/MaterialForms'
import { checkMaterialFile, MATERIAL_BUCKET, mimeOf } from './materials'
import type { MaterialMeta } from './materialsApi'
import type { LinkInput, PhotoMeta } from '../components/DocForms'
import type { NoteApi } from '../components/NoteEditor'
import { errMsg, rpc, supabase } from './supabase'

/** Penyimpanan notula untuk petugas/panitia lewat link pribadi (fungsi server berbasis token). */
export const portalNoteApi = (token: string, sessions: { id: string; title: string }[]): NoteApi => ({
  save: (payload, id) => rpc<string>('portal_note_save', { p_token: token, p_id: id ?? null, p: payload }),
  remove: async (id) => { await rpc('portal_note_delete', { p_token: token, p_id: id }) },
  sessions: async () => sessions,
  people: (sessionId) => rpc('portal_note_people', { p_token: token, p_session: sessionId }),
  letters: () => rpc('portal_note_letters', { p_token: token }),
  recordingPath: async (ext) => (await rpc<{ path: string }>('portal_rec_slot', { p_token: token, p_ext: ext })).path,
})

/** Unggah foto ke path yang dicadangkan server lalu catat; tautan dicatat langsung. */
export const portalDocWriter = (token: string) => ({
  async upload(blob: Blob, meta: PhotoMeta): Promise<void> {
    const slot = await rpc<{ path: string }>('portal_doc_slot', { p_token: token })
    const up = await supabase.storage.from(DOC_BUCKET).upload(slot.path, blob, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new Error(errMsg(up.error))
    await rpc('portal_doc_add', { p_token: token, p_path: slot.path, p_file_name: meta.fileName, p_size: blob.size, p_album: meta.album, p_taken_on: meta.takenOn, p_caption: null })
  },
  async addLink(v: LinkInput): Promise<void> {
    await rpc('portal_doc_add_link', { p_token: token, p_url: v.url, p_title: v.title, p_caption: v.caption, p_album: v.album, p_taken_on: v.takenOn })
  },
})

const metaPayload = (m: MaterialMeta) => ({ title: m.title.trim(), speaker: m.speaker.trim() || null, description: m.description.trim() || null, published: m.published })

/** Materi oleh petugas/panitia lewat link pribadi: berkas diunggah ke path yang dicadangkan server, lalu dicatat; ubah/hapus hanya milik sendiri. */
export const portalMaterialWriter = (token: string): MaterialWriter => ({
  replaceFile: false,
  async upload(file, meta, onProgress) {
    const bad = checkMaterialFile(file)
    if (bad) throw new Error(bad)
    const mime = mimeOf(file)!
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
    const slot = await rpc<{ path: string }>('portal_material_slot', { p_token: token, p_ext: ext })
    const up = await supabase.storage.from(MATERIAL_BUCKET).upload(slot.path, file, { contentType: mime, upsert: false, cacheControl: '3600' })
    if (up.error) throw new Error(errMsg(up.error))
    await rpc('portal_material_add', { p_token: token, p: { ...metaPayload(meta), kind: 'berkas', path: slot.path, file_name: file.name.slice(0, 255), mime_type: mime, size_bytes: file.size } })
    onProgress?.()
  },
  async addLink(url, meta) {
    await rpc('portal_material_add', { p_token: token, p: { ...metaPayload(meta), kind: 'tautan', url } })
  },
  async update(m, meta, opts) {
    await rpc('portal_material_update', { p_token: token, p_id: m.id, p: { ...metaPayload(meta), url: opts.url ?? null } })
  },
})

export const portalMaterialDelete = async (token: string, id: string): Promise<void> => { await rpc('portal_material_delete', { p_token: token, p_id: id }) }
