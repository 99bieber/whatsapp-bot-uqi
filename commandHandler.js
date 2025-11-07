// commandHandler.js
import fs from 'fs'
import { 
  ADMIN_FILE, 
  RESET_STATE_FILE, 
  ACTIVE_PARTIES_FILE, 
  DATA_DIR,
  SPREADSHEET_ID 
} from './config.js' // <-- PATH DIUBAH
import { 
  updateAttendance, 
  sendAttendance, 
  runDailyAbsenCheck 
} from './features/attendance.js' // <-- PATH DIUBAH
import { updateGoogleSheet } from './features/googleSheet.js' // <-- PATH DIUBAH

export async function handleCommands(sock, msg, text, chatId, sender) {
  // Muat file JSON yang relevan
  const resetState = JSON.parse(fs.readFileSync(RESET_STATE_FILE, 'utf8'))
  let admins = JSON.parse(fs.readFileSync(ADMIN_FILE, 'utf8'))
  let activeParties = JSON.parse(fs.readFileSync(ACTIVE_PARTIES_FILE, 'utf8'))
  const isAdmin = Object.keys(admins).includes(sender)

  // 🔐 Penjaga Admin
  if (text.startsWith('/') && !isAdmin) {
    console.log(`🚫 Akses ditolak untuk ${sender}. Bukan admin.`)
    await sock.sendMessage(chatId, { text: '⚠️ Kamu tidak memiliki izin untuk menjalankan perintah ini.' })
    return
  }

  // (kode /addAdmin)
  if (text.startsWith('/addAdmin')) {
    if (!chatId.endsWith('@g.us')) {
      await sock.sendMessage(chatId, { text: '⚠️ Perintah ini hanya bisa digunakan di dalam grup.' })
      return
    }
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
    if (!mentionedJid || mentionedJid.length === 0) {
      await sock.sendMessage(chatId, { text: '⚠️ Perintah salah. Tag (mention) satu orang.\nContoh: `/addAdmin @Syauqi`' })
      return
    }
    const newAdminJid = mentionedJid[0]
    const newAdminId = newAdminJid.split('@')[0]
    let targetName = newAdminId
    try {
      const metadata = await sock.groupMetadata(chatId)
      const target = metadata.participants.find(p => p.id === newAdminJid)
      if (target) {
          targetName = target.pushName || target.name || newAdminId
      }
    } catch (e) {
      console.log('Gagal ambil metadata grup untuk nama admin, pakai ID', e)
    }
    if (!admins[newAdminId]) { 
      admins[newAdminId] = targetName 
      fs.writeFileSync(ADMIN_FILE, JSON.stringify(admins, null, 2))
      await sock.sendMessage(chatId, { 
        text: `✅ Berhasil! *${targetName}* (@${newAdminId}) sekarang adalah admin.`,
        mentions: [newAdminJid] 
      })
    } else {
      await sock.sendMessage(chatId, { 
        text: `⚠️ *${admins[newAdminId]}* (@${newAdminId}) sudah terdaftar sebagai admin.`,
        mentions: [newAdminJid] 
      })
    }
    return
  }
  
  // (kode /removeAdmin)
  if (text.startsWith('/removeAdmin')) {
    const mentionedJid = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid
    if (!mentionedJid || mentionedJid.length === 0) {
      await sock.sendMessage(chatId, { text: '⚠️ Perintah salah. Tag (mention) satu orang.\nContoh: `/removeAdmin @Syauqi`' })
      return
    }
    const removeAdminJid = mentionedJid[0]
    const removeAdminId = removeAdminJid.split('@')[0]
    if (admins[removeAdminId]) { 
      const removedName = admins[removeAdminId] 
      delete admins[removeAdminId] 
      fs.writeFileSync(ADMIN_FILE, JSON.stringify(admins, null, 2))
      await sock.sendMessage(chatId, { 
        text: `🗑️ *${removedName}* (@${removeAdminId}) telah dihapus dari daftar admin.`,
        mentions: [removeAdminJid]
      })
    } else {
      await sock.sendMessage(chatId, { 
        text: `⚠️ @${removeAdminId} tidak ditemukan di daftar admin.`,
        mentions: [removeAdminJid]
      })
    }
    return
  }
  
  // (kode /listAdmin)
  if (text.match(/^\/listAdmin$/i)) {
    if (Object.keys(admins).length === 0) {
      await sock.sendMessage(chatId, { text: '👑 *Daftar Admin:*\n- Kosong -' })
      return
    }
    const mentionJids = Object.keys(admins).map(id => `${id}@s.whatsapp.net`)
    const adminListText = Object.keys(admins) 
      .map((id, i) => `${i + 1}. @${id}`)
      .join('\n')
    await sock.sendMessage(chatId, {
      text: `👑 *Daftar Admin:*\n${adminListText}`,
      mentions: mentionJids 
    })
    return
  }

  // (kode /viewAbsen)
  if (text.match(/^\/viewAbsen$/i)) {
    await sock.sendMessage(chatId, {
      text: `📊 Absensi dapat dilihat di Google Sheet:\n\nhttps://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`
    });
    updateGoogleSheet().catch(e => console.error("[GSheet] Gagal update paksa:", e.message));
    return;
  }

  // (kode /startDailyChecking)
  if (text.match(/^\/startDailyChecking$/i)) {
    console.log(`[MANUAL TRIGGER] Admin ${sender} memicu pengecekan absen harian...`);
    await sock.sendMessage(chatId, { text: '⚙️ Memulai pengecekan absen harian (17:07) secara manual...' });
    await runDailyAbsenCheck(sock); 
    await sock.sendMessage(chatId, { text: '✅ Pengecekan absen harian selesai.' });
    return;
  }

  // (kode /resetParty)
  if (text.match(/^\/resetParty$/i)) {
    let filesReset = 0;
    let currentResetState = JSON.parse(fs.readFileSync(RESET_STATE_FILE, 'utf8'));
    const allFiles = fs.readdirSync(DATA_DIR);
    const partyFiles = allFiles.filter(f => f.startsWith('party') && f.endsWith('.json'));

    for (const fileName of partyFiles) {
      const filePath = `${DATA_DIR}/${fileName}`;
      const partyKey = fileName.split('.')[0];
      try {
        let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const key in data) {
          data[key].status = '';
          data[key].alasan = '';
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        currentResetState[partyKey] = true;
        filesReset++;
      } catch (e) {
        console.warn(`Gagal reset ${fileName}:`, e.message);
      }
    }
    fs.writeFileSync(RESET_STATE_FILE, JSON.stringify(currentResetState, null, 2));
    await sock.sendMessage(chatId, { text: `✅ Berhasil me-reset status & alasan untuk *${filesReset}* party.` });
    updateGoogleSheet().catch(e => console.error("[GSheet] Gagal update:", e.message));
    return;
  }

  // (kode /absenAllParty)
  if (text.match(/^\/absenAllParty$/i)) {
    console.log(`[Admin] ${sender} memicu RESET & BROADCAST absen...`);
    let filesReset = 0;
    let currentResetState = JSON.parse(fs.readFileSync(RESET_STATE_FILE, 'utf8'));
    const allFiles = fs.readdirSync(DATA_DIR);
    const partyFiles = allFiles.filter(f => f.startsWith('party') && f.endsWith('.json'));

    for (const fileName of partyFiles) {
      const filePath = `${DATA_DIR}/${fileName}`;
      try {
        let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const key in data) {
          data[key].status = '';
          data[key].alasan = '';
        }
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        filesReset++;
      } catch (e) {
        console.warn(`Gagal reset ${fileName}:`, e.message);
      }
    }
    console.log(`[Admin] ${filesReset} file party telah di-reset.`);
    let groupsNotified = 0;
    const activePartyEntries = Object.entries(activeParties);

    if (activePartyEntries.length === 0) {
      await sock.sendMessage(chatId, { text: `ℹ️ ${filesReset} party telah di-reset, tapi tidak ada grup yang aktif untuk dikirimi absen.` });
      return;
    }

    for (const [targetChatId, partyName] of activePartyEntries) {
      try {
        await sendAttendance(sock, targetChatId, partyName);
        currentResetState[partyName] = false; 
        groupsNotified++;
      } catch (e) {
        console.error(`Gagal kirim absen ke ${targetChatId}:`, e.message);
      }
    }
    fs.writeFileSync(RESET_STATE_FILE, JSON.stringify(currentResetState, null, 2));
    await sock.sendMessage(chatId, { text: `✅ Berhasil me-reset *${filesReset}* party & mengirimkan absensi ke *${groupsNotified}* grup.` });
    updateGoogleSheet().catch(e => console.error("[GSheet] Gagal update:", e.message));
    return;
  }

  // (kode /tagabsen)
  if (text.match(/^\/tagabsen$/i)) {
    const currentParty = activeParties[chatId]
    if (!currentParty) {
      await sock.sendMessage(chatId, { text: '⚠️ Belum ada party yang aktif di grup ini. Jalankan `/absen party 1` dulu.' })
      return
    }
    if (resetState[currentParty]) {
      await sock.sendMessage(chatId, { text: `⚠️ Party *${currentParty}* baru saja direset, jalankan /absen ${currentParty} dulu sebelum tag.` })
      return
    }
    const filePath = `${DATA_DIR}/${currentParty}.json`
    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(chatId, { text: `⚠️ Data untuk *${currentParty}* tidak ditemukan.` })
      return
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    const mentions = []
    Object.entries(data).forEach(([_, info]) => {
      if ((!info.status || info.status === '') && info.phoneNumber) {
        mentions.push(`${info.phoneNumber}@s.whatsapp.net`)
      }
    })
    if (mentions.length === 0) {
      await sock.sendMessage(chatId, { text: `✅ Semua anggota di *${currentParty}* sudah absen.` })
      return
    }
    const message = `📣 TAG ABSEN (${currentParty.toUpperCase()})`
    await sock.sendMessage(chatId, { text: message, mentions })
    console.log(`🏷️ TagAbsen dikirim untuk ${currentParty}`)
    return;
  }
  
  // (kode /tagall)
  if (text.match(/^\/tagall$/i)) {
    if (!msg.key.remoteJid.endsWith('@g.us')) {
      await sock.sendMessage(chatId, { text: '⚠️ Command ini hanya bisa digunakan di grup.' })
      return
    }
    const metadata = await sock.groupMetadata(chatId)
    const participants = metadata.participants || []
    const mentions = participants.map(p => p.id)
    const message = '📣 TAG ALL'
    await sock.sendMessage(chatId, { text: message, mentions })
    console.log(`🏷️ TagAll dikirim di grup ${metadata.subject}`)
    return
  }
  
  // (kode /absen party X)
  const absenMatch = text.match(/^\/absen party (\d)$/i)
  if (absenMatch) {
    const partyNum = absenMatch[1]
    const partyKey = `party${partyNum}`
    activeParties[chatId] = partyKey
    fs.writeFileSync(ACTIVE_PARTIES_FILE, JSON.stringify(activeParties, null, 2))
    resetState[partyKey] = false
    fs.writeFileSync(RESET_STATE_FILE, JSON.stringify(resetState, null, 2))
    await sendAttendance(sock, chatId, partyKey)
    console.log(`✅ Party aktif untuk grup ${chatId} di-set ke ${partyKey}`)
    return
  }
  
  // (kode /reset party X)
  const resetMatch = text.match(/^\/reset party (\d)$/i)
  if (resetMatch) {
    const partyNum = resetMatch[1]
    const filePath = `${DATA_DIR}/party${partyNum}.json`
    const partyKey = `party${partyNum}`
    if (!fs.existsSync(filePath)) {
      await sock.sendMessage(chatId, { text: `⚠️ Data untuk *${partyKey}* tidak ditemukan.` })
      return
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    for (const key in data) {
      data[key].status = ''
      data[key].alasan = ''
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    resetState[partyKey] = true
    fs.writeFileSync(RESET_STATE_FILE, JSON.stringify(resetState, null, 2))
    await sock.sendMessage(chatId, { text: `🔁 *${partyKey}* telah direset (status & alasan dihapus).` })
    await sendAttendance(sock, chatId, partyKey)
    updateGoogleSheet().catch(e => console.error("[GSheet] Gagal update:", e.message));
    return;
  }

  // (kode /sendNotifPlayer)
  const notifMatch = text.match(/^\/sendNotifPlayer\s+(.+)/i)
  if (notifMatch) {
    const customMessage = notifMatch[1]
    const adminChatId = chatId 
    const activePartyEntries = Object.entries(activeParties)
    if (activePartyEntries.length === 0) {
      await sock.sendMessage(adminChatId, { text: 'ℹ️ Tidak ada party yang sedang aktif di grup manapun.' })
      return
    }
    console.log(`[Notif Massal] Memicu notifikasi untuk ${activePartyEntries.length} grup aktif...`)
    let groupsNotified = 0
    for (const [targetChatId, partyName] of activePartyEntries) {
      const filePath = `${DATA_DIR}/${partyName}.json`
      if (!fs.existsSync(filePath)) {
        console.warn(`[Notif Massal] Skipping ${targetChatId}: File ${filePath} tidak ditemukan.`)
        continue
      }
      let data
      try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch (e) {
        console.warn(`[Notif Massal] Skipping ${targetChatId}: Gagal membaca ${filePath}.`, e)
        continue
      }
      const mentionJids = []
      Object.entries(data).forEach(([_, info]) => {
        if (info.status === '✅' && info.phoneNumber) {
          mentions.push(`${info.phoneNumber}@s.whatsapp.net`)
        }
      })
      if (mentionJids.length > 0) {
        try {
          console.log(`[Notif Massal] Mengirim ke ${targetChatId} (${partyName}) untuk ${mentionJids.length} pemain.`)
          await sock.sendMessage(targetChatId, {
            text: customMessage,
            mentions: mentionJids
          })
          groupsNotified++
        } catch (e) {
          console.error(`[Notif Massal] Gagal mengirim ke ${targetChatId}:`, e)
        }
      } else {
        console.log(`[Notif Massal] Skipping ${targetChatId} (${partyName}): Tidak ada pemain '✅'.`)
      }
    } 
    await sock.sendMessage(adminChatId, {
      text: `✅ Notifikasi telah dikirim ke *${groupsNotified}* grup yang aktif.`
    })
    return;
  }

  // Update Absen (Nickname ✅/❌) - INI NON-ADMIN
  const match = text.trim().match(/^(\S+)\s+(✅|❌)(?:\s*[-|]\s*(.*))?$/)
  if (match) {
    const currentParty = activeParties[chatId]
    const [, name, status, alasan] = match
    
    if (!currentParty) {
      await sock.sendMessage(chatId, { text: '⚠️ Jalankan `/absen party 1` terlebih dahulu untuk mulai absensi.' })
      return
    }

    const isSuccess = updateAttendance(currentParty, name, status, alasan || '')

    if (isSuccess) {
      await sendAttendance(sock, chatId, currentParty)
      updateGoogleSheet().catch(e => console.error("[GSheet] Gagal update:", e.message));
    } else {
      await sock.sendMessage(chatId, { text: '⚠️ Data yang anda kirim tidak sesuai. Pastikan Nickname Anda benar.' })
    }
    return
  }
}