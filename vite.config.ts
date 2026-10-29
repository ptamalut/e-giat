import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // pustaka dokumen dimuat dinamis; didaftarkan agar tidak memicu pembundelan ulang di tengah sesi dev
  optimizeDeps: { include: ['docx', 'jspdf', 'jspdf-autotable'] },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
