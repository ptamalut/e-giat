/** Nama pengguna untuk login: huruf kecil, angka, titik, garis bawah, strip; 3-30 karakter. */
export const USERNAME_RE = /^[a-z0-9._-]{3,30}$/
export const USERNAME_HELP = 'Nama pengguna 3-30 karakter: huruf kecil, angka, titik, garis bawah, atau strip.'

/** Rapikan isian: spasi di ujung dibuang dan huruf menjadi kecil. */
export const normalizeUsername = (v: string) => v.trim().toLowerCase()
export const isValidUsername = (v: string) => USERNAME_RE.test(normalizeUsername(v))

/** Isian login berisi email (mengandung "@") atau nama pengguna. */
export const looksLikeEmail = (v: string) => v.includes('@')
