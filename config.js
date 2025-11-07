// config.js
// Ini adalah pusat konfigurasi dan kunci rahasia Anda.

// === KONFIGURASI GOOGLE ===
export const SPREADSHEET_ID = '1kg9_Gi6lkhCz_54NetYBU1yzePMP6J8iKygsJ6vsFUI'
export const KEY_FILE = './credentials.json'

// === KONFIGURASI DISCORD ===
// Token ini sekarang diambil dari file .env (brankas rahasia)
// Bukan ditulis di sini lagi, agar aman.
export const DISCORD_TOKEN = process.env.DISCORD_TOKEN
export const DISCORD_CHANNEL_ID = "1433004809639956510"
export const WA_GROUP_ID = "120363403322406038@g.us" // ID Grup WA untuk notif ikan

// === KONFIGURASI FILE DATA ===
export const DATA_DIR = './data'
export const RESET_STATE_FILE = './data/resetState.json'
export const ADMIN_FILE = './data/admins.json'
export const ACTIVE_PARTIES_FILE = './data/activeParties.json'

// === KONFIGURASI CRON JOB ===
// '7 17 * * *' = Jam 17:07 WIB
export const CRON_SCHEDULE_ABSEN = '7 17 * * *'
    // '*/15 * * * *' = Setiap 15 menit
export const CRON_SCHEDULE_PING = '*/15 * * * *'
export const TIMEZONE = "Asia/Jakarta"