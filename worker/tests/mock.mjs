/** Подставной Telegram Bot API: пишет все исходящие вызовы в файл, чтобы тесты могли их проверить. */

import fs from 'node:fs'
import http from 'node:http'

const LOG = process.env.TG_LOG || '/tmp/tgcalls.jsonl'
fs.writeFileSync(LOG, '')
let messageId = 100

http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    const method = req.url.split('/').pop().split('?')[0]
    let payload = {}
    try { payload = JSON.parse(body) } catch { payload = { raw: body.slice(0, 200) } }
    fs.appendFileSync(LOG, JSON.stringify({ method, payload }) + '\n')

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      ok: true,
      result: {
        chat: { id: payload.chat_id },
        message_id: payload.message_id || ++messageId,
        photo: [{ file_id: 'FAKE_FILE_ID' }],
      },
    }))
  })
}).listen(Number(process.env.PORT) || 9099, () => console.log('mock Telegram API готов'))
