# Transcritor Whisper

Transcreve vídeos e áudios para texto e legenda `.srt`, rodando 100% local com o modelo [Whisper](https://github.com/openai/whisper) via [Transformers.js](https://huggingface.co/docs/transformers.js). Nenhum arquivo sai da sua máquina e não precisa de chave de API.

Abra a página no navegador, arraste o arquivo e receba a transcrição para copiar ou baixar em `.txt` ou `.srt`.

## Requisitos

- [Node.js](https://nodejs.org/) 18 ou superior
- [ffmpeg](https://ffmpeg.org/) instalado e disponível no `PATH`

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt install ffmpeg

# Windows
winget install ffmpeg
```

## Como rodar

```bash
npm install
npm start
```

Depois abra http://localhost:3000.

Na primeira execução o modelo é baixado do Hugging Face (cerca de 250 MB para o `whisper-small`) e fica em cache dentro de `node_modules`. Das próximas vezes o servidor sobe sem baixar nada.

## Configuração

Tudo é configurado por variáveis de ambiente:

| Variável | Padrão                 | Descrição                                   |
| -------- | ---------------------- | ------------------------------------------- |
| `MODELO` | `Xenova/whisper-small` | Modelo Whisper usado na transcrição         |
| `IDIOMA` | `portuguese`           | Idioma do áudio (`english`, `spanish`, ...) |
| `PORT`   | `3000`                 | Porta do servidor                           |

Exemplo:

```bash
MODELO=Xenova/whisper-base IDIOMA=english PORT=8080 npm start
```

### Escolhendo o modelo

| Modelo                  | Velocidade    | Precisão     |
| ----------------------- | ------------- | ------------ |
| `Xenova/whisper-tiny`   | muito rápido  | baixa        |
| `Xenova/whisper-base`   | rápido        | razoável     |
| `Xenova/whisper-small`  | médio         | boa (padrão) |
| `Xenova/whisper-medium` | lento         | alta         |

Modelos maiores ocupam mais disco e memória e demoram mais para transcrever.

## API

Além da interface web, dá para chamar o endpoint direto.

`POST /transcrever` com `multipart/form-data`, campo `arquivo`:

```bash
curl -F "arquivo=@video.mp4" http://localhost:3000/transcrever
```

Resposta:

```json
{
  "texto": "Transcrição completa do arquivo...",
  "srt": "1\n00:00:00,000 --> 00:00:04,200\nTranscrição completa...\n"
}
```

Em caso de erro, a resposta vem com status `400` ou `500` e o corpo `{ "erro": "mensagem" }`.

## Limitações

- Arquivos de até 2 GB.
- O áudio inteiro é decodificado em memória antes da transcrição; arquivos muito longos consomem bastante RAM.
- A transcrição roda na CPU e um arquivo por vez. Um vídeo de 1 hora pode levar vários minutos, dependendo do modelo e da máquina.

## Licença

[MIT](LICENSE)
