// index.js
import 'dotenv/config'
import makeWASocket, { useMultiFileAuthState } from '@whiskeysockets/baileys'
import fs from 'fs'
import cron from 'node-cron'
import qrcode from 'qrcode-terminal'
import {
  DATA_DIR,
  RESET_STATE_FILE,
  ADMIN_FILE,
  ACTIVE_PARTIES_FILE,
  CRON_SCHEDULE_ABSEN,
  CRON_SCHEDULE_PING,
  TIMEZONE,
} from "./config.js";
import { handleCommands } from "./commandHandler.js";
import { runDailyAbsenCheck } from "./features/attendance.js";
import { startDiscordBot } from "./features/discordBridge.js";

// Variabel penanda
let isSchedulerRunning = false;
let isDiscordBotRunning = false;

// Inisialisasi folder & file
function initializeFiles() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
    console.log("📁 Folder ./data/ berhasil dibuat.");
  }
  if (!fs.existsSync(RESET_STATE_FILE))
    fs.writeFileSync(RESET_STATE_FILE, JSON.stringify({}));
  if (!fs.existsSync(ADMIN_FILE))
    fs.writeFileSync(ADMIN_FILE, JSON.stringify({ 6281945920003: "Owner" }));
  if (!fs.existsSync(ACTIVE_PARTIES_FILE))
    fs.writeFileSync(ACTIVE_PARTIES_FILE, JSON.stringify({}));
}

// Fungsi utama
async function connectToWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState("./auth");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    browser: ["MacOS", "Safari", "14.0.0"],
  });

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      console.log("🔹 Scan QR berikut untuk login WhatsApp:");
      qrcode.generate(qr, { small: true });
    }

    if (connection === "open") {
      console.log("✅ Terhubung ke WhatsApp!");

      // 1. Jalankan semua CRON JOB
      if (!isSchedulerRunning) {
        // ALARM 1: Absen Otomatis (DINONAKTIFKAN SESUAI PERMINTAAN)
        console.log(
          `ℹ️ Scheduler absen otomatis (Alarm ${CRON_SCHEDULE_ABSEN}) non-aktif. Hanya bisa via /startDailyChecking.`
        );
        // cron.schedule(CRON_SCHEDULE_ABSEN, () => {
        //   console.log(`⏰ ALARM ${CRON_SCHEDULE_ABSEN}! Menjalankan pengecekan absen otomatis...`);
        //   runDailyAbsenCheck(sock)
        // }, { timezone: TIMEZONE })

        // ALARM 2: "PING" KEEP-ALIVE (TETAP AKTIF)
        console.log(
          `🔥 Menjalankan Ping Keep-Alive (${CRON_SCHEDULE_PING})...`
        );
        cron.schedule(
          CRON_SCHEDULE_PING,
          async () => {
            try {
              await sock.sendPresenceUpdate("available");
              console.log("PING ...> (Keep-Alive sukses)");
            } catch (e) {
              console.warn("Gagal mengirim Ping keep-alive:", e);
            }
          },
          { timezone: TIMEZONE }
        );

        isSchedulerRunning = true;
      }

      // 2. Jalankan Jembatan DISCORD
      if (!isDiscordBotRunning) {
        console.log("🤖 Menghidupkan jembatan Bot Discord...");
        startDiscordBot(sock);
        isDiscordBotRunning = true;
      }
    } else if (connection === "close") {
      const code = lastDisconnect?.error?.output?.statusCode;
      const shouldReconnect = code !== 401;
      console.log(
        `❌ Koneksi terputus. ${
          shouldReconnect ? "Menyambung ulang..." : "Scan ulang QR diperlukan."
        }`
      );
      if (shouldReconnect) connectToWhatsApp();
    }
  }); // <-- Kurung penutup untuk 'connection.update'

  // 3. Panggil COMMAND HANDLER untuk setiap pesan
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const chatId = msg.key.remoteJid;

    // Definisikan 'text' dan 'sender' di sini
    const text = (
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      ""
    ).trim();

    let senderJid;
    if (msg.key.remoteJid.endsWith("@g.us")) {
      senderJid = msg.key.participant;
    } else {
      senderJid = msg.key.remoteJid;
    }
    if (!senderJid) return;
    const sender = senderJid.split("@")[0];

    console.log(`📩 Pesan dari: ${sender} di chat: ${chatId}`);

    try {
      // Kirim semua info ke handler
      await handleCommands(sock, msg, text, chatId, sender);
    } catch (e) {
      console.error(`❌❌❌ ERROR FATAL DI COMMAND HANDLER:`, e);
      try {
        await sock.sendMessage(chatId, {
          text: `⚠️ Bot mengalami error: ${e.message}`,
        });
      } catch (err) {
        console.error("Gagal mengirim pesan error ke user:", err);
      }
    }
  }); // <-- Kurung penutup untuk 'messages.upsert'
}

// Mulai semuanya
initializeFiles();
connectToWhatsApp();
