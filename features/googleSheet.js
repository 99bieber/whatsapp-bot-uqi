// features/googleSheet.js
import { google } from 'googleapis'
import fs from 'fs'
import { SPREADSHEET_ID, KEY_FILE, DATA_DIR } from '../config.js' // <-- PATH DIUBAH

// Setup autentikasi sekali saja
const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const sheets = google.sheets({ version: 'v4', auth });

export async function updateGoogleSheet() {
  console.log('[GSheet] Memulai update ke Google Sheets...');
  try {
    const allFiles = fs.readdirSync(DATA_DIR);
    const partyFiles = allFiles.filter(f => f.startsWith('party') && f.endsWith('.json'));

    const sheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const existingSheets = sheetMetadata.data.sheets.map(s => s.properties);
    
    let createRequests = []; 

    for (const fileName of partyFiles) {
      const partyName = fileName.split('.')[0];
      const sheetTitle = `Party ${partyName.replace('party', '')}`;

      if (!existingSheets.find(s => s.title === sheetTitle)) {
        console.log(`[GSheet] Tab "${sheetTitle}" tidak ditemukan, akan dibuat...`);
        createRequests.push({
          addSheet: {
            properties: { title: sheetTitle }
          }
        });
      }
    }

    if (createRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: createRequests }
      });
      console.log(`[GSheet] ${createRequests.length} tab baru telah dibuat. Menjalankan ulang untuk mengisi data...`);
      return updateGoogleSheet(); 
    }
    
    let updateRequests = []; 
    
    const newSheetMetadata = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
    });
    const allSheetProps = newSheetMetadata.data.sheets.map(s => s.properties);

    for (const fileName of partyFiles) {
      const partyName = fileName.split('.')[0];
      const sheetTitle = `Party ${partyName.replace('party', '')}`;
      
      const sheetProps = allSheetProps.find(s => s.title === sheetTitle);
      if (!sheetProps) {
          console.warn(`[GSheet] Aneh, tab ${sheetTitle} masih tidak ditemukan. Skipping.`);
          continue;
      }
      const sheetId = sheetProps.sheetId;

      let data = {};
      try {
        data = JSON.parse(fs.readFileSync(`${DATA_DIR}/${fileName}`, 'utf8'));
      } catch (e) {
        console.warn(`[GSheet] Gagal baca ${fileName}, skipping.`, e);
        continue;
      }

      const rows = []; 
      
      const mainPlayers = Object.entries(data).filter(([_, info]) => info.tipe === 'main');
      const subsPlayers = Object.entries(data).filter(([_, info]) => info.tipe === 'subs');
      const exSubsPlayers = Object.entries(data).filter(([_, info]) => info.tipe === 'exsubs');
      const otherPlayers = Object.entries(data).filter(([_, info]) => !['main', 'subs', 'exsubs'].includes(info.tipe));

      const createRowData = (name, info) => ({
        values: [
          { userEnteredValue: { stringValue: info.tipe || 'main' } },
          { userEnteredValue: { stringValue: name } },
          { userEnteredValue: { stringValue: info.status || '' } },
          { userEnteredValue: { stringValue: (info.status === '❌') ? (info.alasan || '') : '' } },
        ]
      });

      mainPlayers.forEach(([name, info]) => rows.push(createRowData(name, info)));
      subsPlayers.forEach(([name, info]) => rows.push(createRowData(name, info)));
      exSubsPlayers.forEach(([name, info]) => rows.push(createRowData(name, info)));
      otherPlayers.forEach(([name, info]) => rows.push(createRowData(name, info)));
      
      updateRequests.push({
        updateCells: {
          range: { sheetId: sheetId, startRowIndex: 1 }, 
          fields: "userEnteredValue,userEnteredFormat"
        }
      });
      
      updateRequests.push({
        updateCells: {
          rows: rows,
          range: {
            sheetId: sheetId,
            startRowIndex: 1, 
            startColumnIndex: 0
          },
          fields: "userEnteredValue,userEnteredFormat"
        }
      });
      
      updateRequests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 }],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: '✅' }]
              },
              format: {
                backgroundColor: { red: 0.85, green: 0.96, blue: 0.86 } 
              }
            }
          },
          index: 0
        }
      });
      updateRequests.push({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId: sheetId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 3 }],
            booleanRule: {
              condition: {
                type: 'TEXT_EQ',
                values: [{ userEnteredValue: '❌' }]
              },
              format: {
                backgroundColor: { red: 0.96, green: 0.85, blue: 0.85 } 
              }
            }
          },
          index: 1
        }
      });
    } // Akhir loop For

    if (updateRequests.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: {
          requests: updateRequests
        }
      });
      console.log(`[GSheet] SUKSES: Google Sheet telah di-update.`);
    } else {
      console.log('[GSheet] Tidak ada file party ditemukan. Update dibatalkan.');
    }

  } catch (err) {
    console.error('[GSheet] GAGAL TOTAL update Google Sheet:', err.message);
    if (err.message && err.message.includes('permission')) {
        const email = auth.credentials.client_email || "EMAIL_BOT_ANDA";
        console.error(`[GSheet] PASTIKAN Anda sudah membagikan (Share) Sheet Anda ke email: ${email}`);
    }
  }
}