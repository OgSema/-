/**
 * Бот теперь только приглашает в Mini App: апдейт шлём в вебхук,
 * исходящие вызовы Telegram ловит мок (tests/mock.mjs).
 */

import fs from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:8787'
const SECRET = process.env.WEBHOOK_SECRET || 'testsecret'
const LOG = process.env.TG_LOG || '/tmp/tgcalls.jsonl'
const APP = process.env.MINI_APP_URL || 'https://trydokli.ru'
const CUSTOMER = { id: 777, first_name: 'Иван', username: 'ivan' }

let seen = 0
const calls = () => {
  const all = fs.readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
  const fresh = all.slice(seen)
  seen = all.length
  return fresh
}

let id = 0
const message = async (from, text) => {
  await fetch(BASE + '/tg', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': SECRET },
    body: JSON.stringify({
      update_id: ++id,
      message: { message_id: ++id, chat: { id: from.id }, from, text },
    }),
  })
  await new Promise((r) => setTimeout(r, 350))
  return calls()
}

let failed = false
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`)
  if (!ok) failed = true
}

const sent = await message(CUSTOMER, '/start')

const menu = sent.find((c) => c.method === 'setChatMenuButton')
check('на /start ставится кнопка меню', !!menu)
check('кнопка меню ведёт в Mini App', menu?.payload?.menu_button?.web_app?.url === APP, menu?.payload?.menu_button?.web_app?.url)

const hello = sent.find((c) => c.method === 'sendMessage')
check('приходит приветствие', !!hello)

const webAppBtn = (hello?.payload?.reply_markup?.inline_keyboard || []).flat().find((b) => b.web_app)
check('в приветствии есть кнопка запуска приложения', !!webAppBtn, webAppBtn?.text)
check('кнопка ведёт на тот же адрес', webAppBtn?.web_app?.url === APP, webAppBtn?.web_app?.url)

check('витрины в чате больше нет', !(hello?.payload?.reply_markup?.inline_keyboard || []).flat().some((b) => b.callback_data))

console.log(failed ? '\nЕСТЬ ПАДЕНИЯ' : '\nвсе проверки прошли')
process.exit(failed ? 1 : 0)
