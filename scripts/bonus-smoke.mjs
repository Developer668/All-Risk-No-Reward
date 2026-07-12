import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const fixedNow = new Date('2026-07-12T20:00:00-07:00')
const browser = await chromium.launch({ headless: true })
const errors = []
await mkdir('output/playwright', { recursive: true })

async function pageForTest() {
  const context = await browser.newContext({ viewport: { width: 1180, height: 900 }, timezoneId: 'America/Los_Angeles' })
  const page = await context.newPage()
  await page.clock.setFixedTime(fixedNow)
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  return { context, page }
}

async function startDemo(page) {
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Preview sample data' }).click()
  await page.getByRole('heading', { name: /Good evening, Alex\./ }).waitFor()
}

async function recordFullProof(page) {
  await page.getByRole('button', { name: /Add privacy-safe proof/ }).click()
  await page.locator('input[type="file"]').setInputFiles('public/og.png')
  await page.getByLabel('Optional context').fill('I asked a thoughtful question, listened to the answer, and shared one honest detail. I felt nervous, then they responded kindly.')
  await page.getByRole('button', { name: /Preview proof result/ }).click()
  await page.locator('.assessment').waitFor()
  await page.getByRole('button', { name: /View today’s log/ }).click()
}

try {
  const win = await pageForTest()
  await startDemo(win.page)
  await recordFullProof(win.page)
  const winDialog = win.page.getByRole('dialog', { name: 'One more for future you?' })
  await winDialog.waitFor()
  await win.page.waitForTimeout(400)
  await win.page.screenshot({ path: 'output/playwright/bonus-challenge.png' })
  await win.page.setViewportSize({ width: 390, height: 844 })
  await win.page.waitForTimeout(200)
  await win.page.screenshot({ path: 'output/playwright/bonus-challenge-mobile.png' })
  assert.equal(await win.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), 0, 'Mobile bonus flow overflows horizontally.')
  await win.page.setViewportSize({ width: 1180, height: 900 })
  await winDialog.getByRole('button', { name: /save my ticket/i }).click()
  const winResult = win.page.getByRole('dialog', { name: 'Ticket saved.' })
  await winResult.waitFor()
  assert.match(await winResult.innerText(), /1 Progress Ticket/i)
  await win.page.waitForTimeout(400)
  await win.page.screenshot({ path: 'output/playwright/bonus-progress-ticket.png' })
  await winResult.getByRole('button', { name: /Keep going/ }).click()
  await win.page.reload({ waitUntil: 'networkidle' })
  assert.match(await win.page.locator('.progress-ticket-balance').innerText(), /1 banked/)
  await win.context.close()

  const redeem = await pageForTest()
  await startDemo(redeem.page)
  await redeem.page.evaluate(() => {
    const database = JSON.parse(localStorage.getItem('all-risk-no-reward.local.v1'))
    const userId = database.session.userId
    localStorage.setItem(`all-risk-no-reward.bonus.v1:${encodeURIComponent(userId)}`, JSON.stringify({ version: 2, progressTickets: 1, records: {} }))
  })
  await redeem.page.reload({ waitUntil: 'networkidle' })
  await redeem.page.getByRole('button', { name: /Add privacy-safe proof/ }).click()
  await redeem.page.locator('input[type="file"]').setInputFiles('public/og.png')
  await redeem.page.getByLabel('Optional context').fill('I spoke briefly today.')
  await redeem.page.getByRole('button', { name: /Preview proof result/ }).click()
  await redeem.page.locator('.assessment').waitFor()
  await redeem.page.getByRole('button', { name: /View today’s log/ }).click()
  await redeem.page.locator('.progress-protected-card').waitFor()
  assert.equal(await redeem.page.locator('.recovery-card').count(), 0)
  assert.equal(await redeem.page.locator('.progress-ticket-balance').count(), 0)
  await redeem.context.close()

  assert.deepEqual(errors, [], `Browser errors occurred: ${errors.join('; ')}`)
  console.log(JSON.stringify({ guaranteedDailyOffer: true, progressTicketReward: true, automaticProtection: true, errors }, null, 2))
} finally {
  await browser.close()
}
