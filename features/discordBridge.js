// features/discordBridge.js
import { Client, GatewayIntentBits, Partials } from 'discord.js' 
import { DISCORD_TOKEN, DISCORD_CHANNEL_ID, WA_GROUP_ID } from '../config.js' // <-- PATH DIUBAH

export async function startDiscordBot(waSocket) {
  // Verifikasi config
  if (!DISCORD_TOKEN || !DISCORD_CHANNEL_ID || !WA_GROUP_ID.includes('@g.us')) {
    console.error('❌ [Discord] Gagal memulai: DISCORD_TOKEN, DISCORD_CHANNEL_ID, atau WA_GROUP_ID belum diisi dengan benar di config.js.');
    return;
  }

  const discordClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, 
    ],
    partials: [Partials.Channel],
  });

  discordClient.on('ready', () => {
    console.log(`✅ [Discord] Bot Discord terhubung sebagai ${discordClient.user.tag}!`);
    console.log(`👂 [Discord] Mengawasi channel ID: ${DISCORD_CHANNEL_ID}`);
  });

  discordClient.on('messageCreate', async (message) => {
    if (message.channel.id !== DISCORD_CHANNEL_ID) return;
    if (!message.author.bot) return;
    
    console.log(`[Discord] Mendeteksi pesan bot di #${message.channel.name}. Memproses...`);

    if (message.embeds.length === 0) {
        console.warn('[Discord] Pesan bot terdeteksi tapi tidak ada embed. Mengirim teks biasa.');
        if (message.content) {
            await waSocket.sendMessage(WA_GROUP_ID, { text: `[Notif Pancingan 🎣]\n\n${message.content}` });
        }
        return;
    }

    const embed = message.embeds[0];
    let waCaption = `[Notif Pancingan 🎣]\n\n`; 
    const cleanText = (text) => text.replace(/<:[^:]+:\d+>/g, '').trim();

    if (embed.title) waCaption += `*${cleanText(embed.title)}*\n`;
    if (embed.description) waCaption += `${cleanText(embed.description)}\n\n`;

    if (embed.fields.length > 0) {
        embed.fields.forEach(field => {
            waCaption += `*${cleanText(field.name)}*: ${cleanText(field.value)}\n`;
        });
    }

    const imageUrl = embed.image?.url || embed.thumbnail?.url;

    try {
      if (imageUrl) {
        await waSocket.sendMessage(WA_GROUP_ID, { 
            image: { url: imageUrl },
            caption: waCaption.trim()
        });
        console.log(`[Discord->WA] Sukses mengirim notifikasi ikan DENGAN GAMBAR ke grup WA!`);
      } else {
        await waSocket.sendMessage(WA_GROUP_ID, { text: waCaption.trim() });
        console.log(`[Discord->WA] Sukses mengirim notifikasi ikan (tanpa gambar) ke grup WA!`);
      }
    } catch (e) {
      console.error(`[Discord->WA] GAGAL mengirim ke WA:`, e.message);
    }
  });

  try {
    await discordClient.login(DISCORD_TOKEN);
  } catch (e) {
    console.error('❌ [Discord] GAGAL LOGIN. Apakah Token Anda sudah benar?', e.message);
  }
}