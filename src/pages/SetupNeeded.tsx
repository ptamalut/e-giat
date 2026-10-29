export default function SetupNeeded() {
  return (
    <div className="auth-wrap">
      <div className="card" style={{ maxWidth: 560 }}>
        <h2>⚙️ Supabase belum dikonfigurasi</h2>
        <p>Aplikasi membutuhkan dua variabel lingkungan. Langkah singkat:</p>
        <ol>
          <li>Buat project di <a href="https://supabase.com" target="_blank" rel="noreferrer">supabase.com</a>.</li>
          <li>Buka <b>SQL Editor</b>, jalankan isi file <code>supabase/schema.sql</code>.</li>
          <li>Salin <code>.env.example</code> menjadi <code>.env</code>, isi <code>VITE_SUPABASE_URL</code> dan <code>VITE_SUPABASE_ANON_KEY</code> (Project Settings → API).</li>
          <li>Jalankan ulang <code>npm run dev</code>.</li>
        </ol>
        <p className="muted small">Panduan lengkap ada di README.md.</p>
      </div>
    </div>
  )
}
