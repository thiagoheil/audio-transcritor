import express from 'express';
import multer from 'multer';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { pipeline } from '@huggingface/transformers';

// Modelos: Xenova/whisper-tiny | base | small | medium (maior = mais preciso e mais lento)
const MODELO = process.env.MODELO || 'Xenova/whisper-small';
const IDIOMA = process.env.IDIOMA || 'portuguese';
const PORTA = process.env.PORT || 3000;

console.log(`Carregando modelo ${MODELO} (na 1ª vez baixa ~250MB)...`);
const transcriber = await pipeline('automatic-speech-recognition', MODELO);
console.log('Modelo pronto.');

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 2 * 1024 ** 3 } });
const app = express();

// Usa o ffmpeg pra converter qualquer vídeo/áudio em PCM float 16kHz mono
function decodificar(caminho) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', [
      '-i', caminho, '-vn', '-f', 'f32le', '-ac', '1', '-ar', '16000',
      '-loglevel', 'error', 'pipe:1',
    ]);
    const partes = [];
    ff.stdout.on('data', (c) => partes.push(c));
    ff.on('error', () => reject(new Error('ffmpeg não encontrado. Instale o ffmpeg.')));
    ff.on('close', (code) => {
      if (code !== 0) return reject(new Error('ffmpeg falhou ao ler o arquivo.'));
      const buf = Buffer.concat(partes);
      resolve(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
    });
  });
}

function tempoSrt(s) {
  const ms = Math.round((s ?? 0) * 1000);
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`;
}

function gerarSrt(chunks) {
  return chunks
    .map((c, i) => {
      const [ini, fim] = c.timestamp;
      return `${i + 1}\n${tempoSrt(ini)} --> ${tempoSrt(fim ?? ini + 2)}\n${c.text.trim()}\n`;
    })
    .join('\n');
}

app.post('/transcrever', upload.single('arquivo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo.' });
  try {
    const audio = await decodificar(req.file.path);
    const r = await transcriber(audio, {
      language: IDIOMA,
      task: 'transcribe',
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: true,
    });
    res.json({ texto: r.text.trim(), srt: gerarSrt(r.chunks || []) });
  } catch (e) {
    res.status(500).json({ erro: e.message });
  } finally {
    unlink(req.file.path).catch(() => {});
  }
});

app.get('/', (_req, res) => res.type('html').send(PAGINA));

app.listen(PORTA, () => console.log(`Abra http://localhost:${PORTA}`));

const PAGINA = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Transcritor</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:720px;margin:40px auto;padding:0 16px;background:#161616;color:#eee}
  .drop{border:2px dashed #666;border-radius:12px;padding:40px;text-align:center;cursor:pointer}
  .drop.over{border-color:#8b7cf6;background:#1f1d2e}
  button{background:#8b7cf6;color:#fff;border:0;border-radius:8px;padding:10px 16px;cursor:pointer;margin:8px 8px 0 0}
  textarea{width:100%;height:320px;margin-top:16px;background:#222;color:#eee;border:1px solid #444;border-radius:8px;padding:12px;box-sizing:border-box}
  #status{margin-top:16px;color:#aaa}
</style></head><body>
<h1>Transcritor de vídeo/áudio</h1>
<div class="drop" id="drop">Arraste um vídeo ou áudio aqui<br>ou clique para escolher</div>
<input type="file" id="file" accept="audio/*,video/*" hidden>
<div id="status"></div>
<textarea id="texto" placeholder="A transcrição aparece aqui" hidden></textarea>
<div id="acoes" hidden>
  <button id="copiar">Copiar texto</button>
  <button id="baixaTxt">Baixar .txt</button>
  <button id="baixaSrt">Baixar .srt (legenda)</button>
</div>
<script>
const $ = (id) => document.getElementById(id);
let srt = '';
const drop = $('drop'), file = $('file');
drop.onclick = () => file.click();
drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
drop.ondragleave = () => drop.classList.remove('over');
drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); enviar(e.dataTransfer.files[0]); };
file.onchange = () => enviar(file.files[0]);

async function enviar(f) {
  if (!f) return;
  $('status').textContent = 'Transcrevendo "' + f.name + '"... pode demorar, não feche a página.';
  $('texto').hidden = true; $('acoes').hidden = true;
  const fd = new FormData(); fd.append('arquivo', f);
  try {
    const r = await fetch('/transcrever', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.erro);
    $('texto').value = j.texto; srt = j.srt;
    $('texto').hidden = false; $('acoes').hidden = false;
    $('status').textContent = 'Pronto!';
  } catch (e) { $('status').textContent = 'Erro: ' + e.message; }
}
function baixar(nome, conteudo) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([conteudo], { type: 'text/plain' }));
  a.download = nome; a.click();
}
$('copiar').onclick = () => navigator.clipboard.writeText($('texto').value);
$('baixaTxt').onclick = () => baixar('transcricao.txt', $('texto').value);
$('baixaSrt').onclick = () => baixar('legenda.srt', srt);
</script></body></html>`;
