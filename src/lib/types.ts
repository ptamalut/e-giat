export type ActivityStatus = 'draft' | 'aktif' | 'selesai'
export type AttendanceStatus = 'hadir' | 'terlambat' | 'izin' | 'sakit' | 'alpa'
export type QuizType = 'pre' | 'post' | 'lainnya'
/** peserta: mengerjakan kuis & masuk peringkat. narasumber dan panitia: hanya absen. */
export type PersonRole = 'peserta' | 'narasumber' | 'panitia'

export interface Activity {
  id: string
  owner_id: string
  name: string
  description: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
  status: ActivityStatus
  weight_attendance: number
  show_leaderboard: boolean
  /** urutan tampil satuan kerja (kunci huruf kecil); null = abjad */
  satker_order: string[] | null
  /** peserta/narasumber/panitia bisa mengunduh sertifikat bila true */
  certificates_open: boolean
  /** menu yang diaktifkan untuk kegiatan ini (nonaktif = tidak tampil dan ditolak di server) */
  enable_attendance: boolean
  enable_notes: boolean
  enable_quiz: boolean
  enable_certificate: boolean
  enable_documentation: boolean
  /** tampil di halaman depan (kegiatan berjalan) dan peserta bisa masuk dengan NIP */
  public_access: boolean
  created_at: string
}

/** Data pegawai: induk data orang; peserta kegiatan dipilih dari sini. */
export interface Employee {
  id: string
  owner_id: string
  name: string
  identifier: string | null
  grade: string | null
  job_title: string | null
  institution: string | null
  phone: string | null
  /** urutan di dalam satuan kerja; null = setelah yang berurutan */
  sort_order: number | null
  created_at: string
}

export interface MeetingNote {
  id: string
  activity_id: string
  title: string
  held_at: string | null
  location: string | null
  leader: string | null
  notetaker: string | null
  attendees: string | null
  agenda: string | null
  discussion: string | null
  decisions: string | null
  follow_ups: FollowUp[]
  status: 'draft' | 'final'
  created_at: string
  updated_at: string
}

export interface FollowUp { id: string; task: string; pic: string; due: string; done: boolean }

export interface DocItem {
  id: string
  activity_id: string
  kind: 'foto' | 'tautan'
  storage_path: string | null
  file_name: string | null
  mime_type: string | null
  size_bytes: number | null
  url: string | null
  title: string | null
  caption: string | null
  album: string | null
  taken_on: string | null
  uploaded_at: string
}

export interface Certificate {
  id: string
  activity_id: string
  participant_id: string
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_at: string
}

export interface Participant {
  id: string
  activity_id: string
  name: string
  identifier: string | null
  grade: string | null
  job_title: string | null
  institution: string | null
  email: string | null
  phone: string | null
  role: PersonRole
  /** pegawai asal data ini (null bila pegawainya sudah dihapus) */
  employee_id: string | null
  /** hak akses menu per orang (berlaku bila menunya aktif di kegiatan) */
  access_attendance: boolean
  access_quiz: boolean
  access_certificate: boolean
  access_notes: boolean
  access_documentation: boolean
  /** urutan di dalam satuan kerja; null = setelah yang berurutan */
  sort_order: number | null
  token: string
  created_at: string
}

export interface AttendanceSession {
  id: string
  activity_id: string
  title: string
  start_at: string
  end_at: string
  late_minutes: number
  /** wajib foto selfie / lokasi saat absen mandiri */
  require_selfie: boolean
  require_location: boolean
}

export interface Attendance {
  id: string
  activity_id: string
  session_id: string
  participant_id: string
  status: AttendanceStatus
  checked_in_at: string
  note: string | null
  manual: boolean
  /** path foto di bucket privat "selfies" */
  selfie_path: string | null
  lat: number | null
  lng: number | null
  accuracy_m: number | null
}

export interface Quiz {
  id: string
  activity_id: string
  title: string
  type: QuizType
  description: string | null
  duration_minutes: number | null
  open_at: string | null
  close_at: string | null
  passing_score: number | null
  max_attempts: number
  shuffle_questions: boolean
  shuffle_options: boolean
  show_result: boolean
  show_answers: boolean
  require_checkin: boolean
  counts_toward_final: boolean
  is_published: boolean
  created_at: string
}

export interface Question {
  id: string
  activity_id: string
  quiz_id: string
  position: number
  text: string
  options: string[]
  correct_index: number
  points: number
  explanation: string | null
}

export interface QuizAttempt {
  id: string
  activity_id: string
  quiz_id: string
  participant_id: string
  attempt_no: number
  started_at: string
  deadline_at: string | null
  submitted_at: string | null
  answers: Record<string, number>
  score: number | null
  correct_count: number | null
  total_questions: number | null
  auto_submitted: boolean
}

export interface RankingRow {
  participant_id: string
  name: string
  institution: string | null
  sessions_attended: number
  sessions_total: number
  attendance_pct: number | null
  quiz_avg: number | null
  final_score: number
  rank: number
}

/* ---------- payload RPC peserta ---------- */

export type TimeState = 'upcoming' | 'open' | 'closed'

export interface PortalSession {
  id: string
  title: string
  start_at: string
  end_at: string
  late_minutes: number
  require_selfie: boolean
  require_location: boolean
  state: TimeState
  attendance: { status: AttendanceStatus; checked_in_at: string; has_selfie?: boolean; has_location?: boolean } | null
}

export interface PortalAttempt {
  id: string
  attempt_no: number
  started_at: string
  deadline_at: string | null
  submitted_at: string | null
  score: number | null
  correct_count: number | null
  total_questions: number | null
  passed: boolean | null
}

export interface PortalQuiz {
  id: string
  title: string
  type: QuizType
  description: string | null
  duration_minutes: number | null
  open_at: string | null
  close_at: string | null
  max_attempts: number
  passing_score: number | null
  show_result: boolean
  show_answers: boolean
  require_checkin: boolean
  question_count: number
  state: TimeState
  attempts: PortalAttempt[]
}

export interface PortalData {
  now: string
  participant: {
    id: string
    name: string
    identifier: string | null
    grade: string | null
    job_title: string | null
    institution: string | null
    role: PersonRole
  }
  activity: {
    id: string
    name: string
    description: string | null
    location: string | null
    start_date: string | null
    end_date: string | null
    status: ActivityStatus
    show_leaderboard: boolean
  }
  /** menu yang boleh dipakai orang ini = menu aktif di kegiatan dan hak akses orang ini */
  features: { attendance: boolean; quiz: boolean; certificate: boolean; notes: boolean; documentation: boolean }
  /** null bila unduhan ditutup dan orang ini belum punya sertifikat */
  certificate: { open: boolean; available: boolean; file_name: string | null; mime_type: string | null } | null
  sessions: PortalSession[]
  quizzes: PortalQuiz[]
}

export interface RunQuestion {
  id: string
  text: string
  points: number
  options: { i: number; t: string }[]
}

export interface StartAttemptData {
  now: string
  attempt: {
    id: string
    attempt_no: number
    started_at: string
    deadline_at: string | null
    answers: Record<string, number>
  }
  quiz: {
    id: string
    title: string
    type: QuizType
    description: string | null
    duration_minutes: number | null
    shuffle_options: boolean
  }
  questions: RunQuestion[]
}

export interface AttemptResult {
  attempt_id: string
  quiz_id: string
  quiz_title: string
  quiz_type: QuizType
  attempt_no: number
  submitted_at: string
  auto_submitted: boolean
  show_result: boolean
  show_answers: boolean
  total_questions: number
  score: number | null
  correct_count: number | null
  passing_score: number | null
  passed: boolean | null
  review?: {
    id: string
    text: string
    options: string[]
    selected: number | null
    correct_index: number
    explanation: string | null
    is_correct: boolean
  }[]
}

export interface Leaderboard {
  enabled: boolean
  total?: number
  rows: {
    rank: number
    name: string
    institution: string | null
    attendance_pct: number | null
    quiz_avg: number | null
    final_score: number
    is_me: boolean
  }[]
}

/** Notula Final yang dilihat peserta berhak (tanpa data internal). */
export interface PortalNote {
  id: string
  title: string
  held_at: string | null
  location: string | null
  leader: string | null
  notetaker: string | null
  attendees: string | null
  agenda: string | null
  discussion: string | null
  decisions: string | null
  follow_ups: FollowUp[]
}

export interface PortalDoc {
  id: string
  kind: 'foto' | 'tautan'
  path: string | null
  url: string | null
  title: string | null
  caption: string | null
  album: string | null
  taken_on: string | null
}

/** Kegiatan berjalan yang ditampilkan di halaman depan. */
export interface PublicActivity {
  id: string
  name: string
  description: string | null
  location: string | null
  start_date: string | null
  end_date: string | null
}
