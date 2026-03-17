require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  StreamType,
  entersState,
  getVoiceConnection,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const path = require('path');
const YouTube = require('youtube-sr').default;

const TOKEN = process.env.DISCORD_TOKEN;
const YTDLP = path.join(__dirname, 'yt-dlp.exe');
const FFMPEG = require('ffmpeg-static');

const queues = new Map();
const connecting = new Set();

function getAudioStream(url) {
  const ytdlp = spawn(YTDLP, [
    url,
    '-f', 'bestaudio',
    '--no-playlist',
    '-o', '-',
  ]);

  const ffmpeg = spawn(FFMPEG, [
    '-fflags', 'nobuffer+discardcorrupt',
    '-flags', 'low_delay',
    '-probesize', '1000000',
    '-analyzeduration', '1000000',
    '-i', 'pipe:0',
    '-af', 'volume=2.0,equalizer=f=80:t=q:w=1:g=3,equalizer=f=3000:t=q:w=1:g=2',
    '-c:a', 'libopus',
    '-b:a', '256k',
    '-vbr', 'on',
    '-compression_level', '10',
    '-frame_duration', '20',
    '-application', 'audio',
    '-f', 'ogg',
    'pipe:1',
  ]);

  ytdlp.stdout.pipe(ffmpeg.stdin);
  ytdlp.stderr.on('data', (d) => console.error('[yt-dlp]', d.toString().trim()));
  ytdlp.on('error', (e) => console.error('[yt-dlp error]', e.message));
  ffmpeg.on('error', (e) => console.error('[ffmpeg error]', e.message));
  ffmpeg.stdin.on('error', () => {});

  return ffmpeg.stdout;
}

async function resolveURL(query) {
  const ytUrlMatch = query.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytUrlMatch) {
    return { url: query, title: query };
  }
  const results = await YouTube.search(query, { limit: 1, type: 'video' });
  if (!results.length) return null;
  return {
    url: `https://www.youtube.com/watch?v=${results[0].id}`,
    title: results[0].title,
    duration: results[0].durationFormatted,
  };
}

function cleanup(guildId) {
  queues.delete(guildId);
  connecting.delete(guildId);
  const conn = getVoiceConnection(guildId);
  if (conn) conn.destroy();
}

async function playNext(guildId) {
  const queue = queues.get(guildId);
  if (!queue || queue.songs.length === 0) {
    cleanup(guildId);
    return;
  }

  const song = queue.songs[0];
  try {
    const stream = getAudioStream(song.url);
    const resource = createAudioResource(stream, { inputType: StreamType.OggOpus });
    queue.player.play(resource);
    queue.textChannel.send(`▶️ Tocando: **${song.title}**${song.duration ? ` (${song.duration})` : ''}`);
  } catch (e) {
    console.error('[playNext]', e.message);
    queue.songs.shift();
    playNext(guildId);
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

client.once('ready', () => {
  console.log(`Bot online! Logado como ${client.user.tag}`);
});

client.on('voiceStateUpdate', (oldState) => {
  const guildId = oldState.guild.id;
  const queue = queues.get(guildId);
  if (!queue) return;

  const conn = getVoiceConnection(guildId);
  if (!conn) return;

  const channel = oldState.guild.channels.cache.get(conn.joinConfig.channelId);
  if (!channel) return;

  const humans = channel.members.filter(m => !m.user.bot);
  if (humans.size === 0) {
    queue.textChannel.send('Saindo pois não há ninguém no canal.');
    cleanup(guildId);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim();

  const playPrefix = ['!play', '!p', '!msn'].find(p => content.startsWith(p));
  if (playPrefix) {
    const query = content.slice(playPrefix.length).trim();
    if (!query) return message.reply('Usa assim: `!play <nome da música ou link>`');

    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) return message.reply('Entre em um canal de voz primeiro!');

    const guildId = message.guild.id;

    if (connecting.has(guildId)) return message.reply('Aguarda, estou conectando...');

    try {
      const song = await resolveURL(query);
      if (!song) return message.reply('Nenhuma música encontrada.');

      let queue = queues.get(guildId);

      if (!queue) {
        connecting.add(guildId);

        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId,
          adapterCreator: message.guild.voiceAdapterCreator,
        });

        connection.on(VoiceConnectionStatus.Disconnected, async () => {
          try {
            await Promise.race([
              entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
              entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
            ]);
          } catch {
            cleanup(guildId);
          }
        });

        try {
          await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        } catch {
          cleanup(guildId);
          return message.reply('Não consegui conectar ao canal de voz.');
        }

        const player = createAudioPlayer();
        connection.subscribe(player);

        queue = { songs: [], player, textChannel: message.channel };
        queues.set(guildId, queue);
        connecting.delete(guildId);

        player.on(AudioPlayerStatus.Idle, () => {
          queue.songs.shift();
          playNext(guildId);
        });

        player.on('error', (error) => {
          console.error('[player error]', error.message);
          queue.songs.shift();
          playNext(guildId);
        });
      }

      queue.songs.push(song);

      if (queue.songs.length === 1) {
        playNext(guildId);
      } else {
        message.channel.send(`📋 Adicionado na fila: **${song.title}** (posição ${queue.songs.length})`);
      }
    } catch (e) {
      connecting.delete(message.guild.id);
      console.error('[!play]', e.message);
      message.reply('Ocorreu um erro. Tente novamente.').catch(() => {});
    }
    return;
  }

  if (content === '!skip') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('Não está tocando nada.');
    queue.player.stop();
    message.react('⏭️');
    return;
  }

  if (content === '!pause') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('Não está tocando nada.');
    queue.player.pause();
    message.react('⏸️');
    return;
  }

  if (content === '!resume') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('Não está tocando nada.');
    queue.player.unpause();
    message.react('▶️');
    return;
  }

  if (content === '!stop') {
    const queue = queues.get(message.guild.id);
    if (!queue) return message.reply('Não está tocando nada.');
    queue.songs = [];
    queue.player.stop();
    cleanup(message.guild.id);
    message.react('⏹️');
    return;
  }

  if (content === '!fila') {
    const queue = queues.get(message.guild.id);
    if (!queue || !queue.songs.length) return message.reply('A fila está vazia.');
    const list = queue.songs
      .map((s, i) => `${i === 0 ? '▶️' : `\`${i}.\``} **${s.title}**${s.duration ? ` • ${s.duration}` : ''}`)
      .join('\n');
    message.channel.send(`**Fila de músicas:**\n${list}`);
    return;
  }

  if (content === '!ajuda' || content === '!help') {
    message.channel.send([
      '**🎵 Comandos disponíveis:**',
      '`!play <música ou link>` — toca uma música (também: `!p`, `!msn`)',
      '`!skip` — pula a música atual',
      '`!pause` — pausa a música',
      '`!resume` — continua a música',
      '`!stop` — para tudo e sai do canal',
      '`!fila` — mostra a fila de músicas',
      '',
      '**Desenvolvido por Francisco Mason — dúvidas: franciscomaisun@gmail.com**',
    ].join('\n'));
    return;
  }
});

client.login(TOKEN);
