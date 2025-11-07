// features/attendance.js
import fs from 'fs'
import { DATA_DIR, ACTIVE_PARTIES_FILE, RESET_STATE_FILE } from '../config.js' // <-- PATH DIUBAH
import { updateGoogleSheet } from './googleSheet.js' // <-- Path ini tetap

export function updateAttendance(party, name, status, alasan) {
  const filePath = `${DATA_DIR}/${party}.json`
  let data = {}
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    data = raw ? JSON.parse(raw) : {}
  } catch {
    console.log(`⚠️ File ${party}.json belum ada.`)
    return false
  }
  const dataKeys = Object.keys(data)
  const foundKey = dataKeys.find(key => key.toLowerCase() === name.toLowerCase())
  if (!foundKey) {
    console.log(`⚠️ Gagal update: Nama "${name}" tidak ditemukan di ${party}.json`)
    return false
  }
  data[foundKey].status = status
  data[foundKey].alasan = alasan
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
  console.log(`✅ ${foundKey} (${party}) → ${status} ${alasan || ''}`)
  return true
}

export async function sendAttendance(sock, chatId, party) {
  const { message, mentions } = generateAttendanceMessage(party)
  try {
    await sock.sendMessage(chatId, { text: message, mentions })
    console.log(`📨 Pesan absensi (${party}) terkirim ke ${chatId}`)
  } catch (err) {
    console.error(`❌ Gagal kirim pesan ke ${chatId}:`, err.message)
  }
}

export function generateAttendanceMessage(party) {
  const filePath = `${DATA_DIR}/${party}.json`
  let data = {}
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    data = raw ? JSON.parse(raw) : {}
  } catch {
    console.log(`⚠️ File ${party}.json belum ada.`)
  }
  let iBisa = 1, iTidak = 1, iSubs = 1, iExsubs = 1
  let bisaMain = '', tidakBisaMain = '', subs = '', exSubs = ''
  const mentions = []
  Object.entries(data).forEach(([name, info]) => {
    const { status = '', alasan = '', tipe = 'main', phoneNumber } = info
    const alasanText = alasan ? `(${alasan})` : ''
    const statusText = status ? ` ${status}` : ''
    const fullText = `${name}${statusText} ${alasanText}`.trim()
    if ((!status || status === '') && phoneNumber) mentions.push(`${phoneNumber}@s.whatsapp.net`)
    if (tipe === 'subs') subs += `${iSubs++}. ${fullText}\n`
    else if (tipe === 'exsubs') exSubs += `${iExsubs++}. ${fullText}\n`
    else if (status === '❌') tidakBisaMain += `${iTidak++}. ${fullText}\n`
    else bisaMain += `${iBisa++}. ${fullText}\n`
  })
  const message = `📝 *ABSENSI ${party.toUpperCase()}*

CARA ABSENSI:
  
Jika Bisa
Nickname ✅
  
Jika Tidak
Nickname ❌ - Alasan

Jangan Copy Paste Text ini, cukup kirimkan chat seperti diatas

YANG BISA MAIN ✅
${bisaMain || '-'}

YANG TIDAK BISA MAIN ❌
${tidakBisaMain || '-'}

SUBS :
${subs || '-'}

EX SUBS :
${exSubs || '-'}

⏰ MAX 16.00 SUDAH TERISI JANGAN MALAS`
  return { message, mentions }
}

export async function runDailyAbsenCheck(sock) {
  console.log('⏰ [CRON 17:07] Mulai pengecekan absen harian...')
  
  if (!fs.existsSync(ACTIVE_PARTIES_FILE)) {
    console.log('[CRON 17:07] Gagal: File activeParties.json tidak ditemukan.')
    return
  }

  let activeParties
  let resetState
  try {
     activeParties = JSON.parse(fs.readFileSync(ACTIVE_PARTIES_FILE, 'utf8'))
     resetState = JSON.parse(fs.readFileSync(RESET_STATE_FILE, 'utf8'))
  } catch(e) {
    console.log('[CRON 17:07] Gagal membaca file JSON (activeParties/resetState).', e)
    return
  }

  for (const [chatId, partyName] of Object.entries(activeParties)) {
    if (resetState[partyName]) {
      console.log(`[CRON 17:07] Party ${partyName} di-skip karena baru direset.`)
      continue
    }
    const filePath = `${DATA_DIR}/${partyName}.json`
    if (!fs.existsSync(filePath)) {
      console.log(`[CRON 17:07] Gagal: File ${filePath} tidak ditemukan.`)
      continue
    }
    let data
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    } catch (e) {
      console.log(`[CRON 17:07] Gagal baca JSON: ${filePath}`, e)
      continue
    }
    let isUpdated = false
    for (const [playerName, info] of Object.entries(data)) {
      if (!info.status || info.status === '') {
        info.status = '❌'
        info.alasan = 'Tidak Ada Kabar'
        isUpdated = true
        console.log(`[CRON 17:07] ${playerName} di ${partyName} ditandai ❌ (Tidak Ada Kabar).`)
      }
    }
    if (isUpdated) {
      console.log(`[CRON 17:07] Menyimpan update untuk ${partyName}...`)
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    } else {
      console.log(`[CRON 17:07] Tidak ada update untuk ${partyName}, semua sudah absen.`)
    }
    console.log(`[CRON 17:07] Mengirim laporan absen final ${partyName} ke grup ${chatId}...`)
    try {
        await sendAttendance(sock, chatId, partyName)
    } catch (e) {
        console.error(`[CRON 17:07] GAGAL kirim pesan ke ${chatId}:`, e.message)
    }
  }
  console.log('⏰ [CRON 17:07] Pengecekan absen harian selesai.')
  
  updateGoogleSheet().catch(e => console.error("[GSheet] Gagal update:", e.message));
}