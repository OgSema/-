/** Подставной Telegram Bot API: пишет все исходящие вызовы в файл, чтобы тесты могли их проверить. */

import fs from 'node:fs'
import http from 'node:http'

const LOG = process.env.TG_LOG || '/tmp/tgcalls.jsonl'
fs.writeFileSync(LOG, '')
let messageId = 100

// Покупателю, который ни разу не писал боту, Telegram писать не даёт. Этот id
// изображает такого молчуна: сообщения ему отбиваются, пока он не «напишет»
// (tests/bot.mjs шлёт от него апдейт, после чего блокировка снимается).
const MUTED = Number(process.env.TG_MUTED || 909090)
let muted = true

http.createServer((req, res) => {
  // Управляющая ручка для тестов: вернуть молчуну молчание перед новым прогоном.
  if (req.url.startsWith('/mute')) {
    muted = true
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end('{"ok":true}')
  }

  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const method = req.url.split('/').pop().split('?')[0]
    let payload = {}
    try { payload = JSON.parse(body) } catch { payload = { raw: body.slice(0, 200) } }
    fs.appendFileSync(LOG, JSON.stringify({ method, payload }) + '\n')

    if (muted && method === 'sendMessage' && Number(payload.chat_id) === MUTED) {
      res.writeHead(403, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({
        ok: false,
        error_code: 403,
        description: "Forbidden: bot can't initiate conversation with a user",
      }))
    }
    // Ответ бота молчуну означает, что тот написал первым: право появилось.
    if (method === 'setChatMenuButton' && Number(payload.chat_id) === MUTED) muted = false

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      result: {
        chat: { id: payload.chat_id },
        message_id: payload.message_id || ++messageId,
        photo: [{ file_id: 'FAKE_FILE_ID' }],
        // PNG с прозрачностью уходит документом — у ответа другое поле.
        document: { file_id: 'FAKE_DOC_ID' },
      },
    }))
  })
}).listen(Number(process.env.PORT) || 9099, () => console.log('mock Telegram API готов'))
