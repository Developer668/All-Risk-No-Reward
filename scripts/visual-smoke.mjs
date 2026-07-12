import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'

await mkdir('output/playwright', { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  timezoneId: 'America/Los_Angeles',
})
const page = await context.newPage()
await page.clock.setFixedTime(new Date('2026-07-12T20:00:00-07:00'))
const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const errors = []
page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(baseUrl, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'output/playwright/landing-desktop.png', fullPage: true })
const landingOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

await page.getByRole('button', { name: 'Try the working demo' }).click()
await page.getByRole('heading', { name: /Good evening, Alex\./ }).waitFor()
await page.screenshot({ path: 'output/playwright/dashboard-desktop.png', fullPage: true })
const dashboardOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)

await page.getByRole('button', { name: /Add privacy-safe proof/ }).click()
await page.getByRole('heading', { name: 'Show what happened.' }).waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: 'output/playwright/proof-dialog.png' })
await page.getByLabel('What did you do?').fill('I gave a specific compliment about how thoughtfully a classmate explained an idea. I felt nervous, then they smiled and thanked me.')
await page.getByRole('button', { name: /Check and record my proof/ }).click()
await page.locator('.assessment').waitFor()
await page.waitForTimeout(400)
await page.screenshot({ path: 'output/playwright/proof-complete.png' })
await page.getByRole('button', { name: /View today’s log/ }).click()
await page.locator('.complete-card').waitFor()
await page.getByRole('button', { name: /Share this/ }).click()
await page.getByRole('heading', { name: 'Make the brave rep visible.' }).waitFor()
await page.locator('.share-preview img').waitFor()
await page.waitForTimeout(250)
await page.screenshot({ path: 'output/playwright/share-dialog.png' })
await page.getByRole('dialog', { name: 'Make the brave rep visible.' }).getByRole('button', { name: 'Close dialog' }).click()

await page.setViewportSize({ width: 390, height: 844 })
await page.waitForTimeout(400)
await page.screenshot({ path: 'output/playwright/dashboard-mobile.png', fullPage: true })
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
const mobileSidebar = await page.locator('.sidebar').evaluate((element) => {
  const rect = element.getBoundingClientRect()
  return { className: element.className, left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), transform: getComputedStyle(element).transform }
})

assert.deepEqual({ landingOverflow, dashboardOverflow, mobileOverflow }, { landingOverflow: 0, dashboardOverflow: 0, mobileOverflow: 0 })
assert.ok(mobileSidebar.right <= 0, `Closed mobile sidebar remains visible: ${JSON.stringify(mobileSidebar)}`)
assert.deepEqual(errors, [], `Browser errors occurred: ${errors.join('; ')}`)

const recoveryContext = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
  timezoneId: 'America/Los_Angeles',
})
const recoveryPage = await recoveryContext.newPage()
const recoveryErrors = []
await recoveryPage.clock.setFixedTime(new Date('2026-07-12T20:00:00-07:00'))
recoveryPage.on('console', (message) => message.type() === 'error' && recoveryErrors.push(message.text()))
recoveryPage.on('pageerror', (error) => recoveryErrors.push(error.message))
await recoveryPage.goto(baseUrl, { waitUntil: 'networkidle' })
await recoveryPage.getByRole('button', { name: 'Try the working demo' }).click()
await recoveryPage.getByRole('button', { name: /Add privacy-safe proof/ }).click()
await recoveryPage.getByLabel('What did you do?').fill('I spoke briefly today.')
await recoveryPage.getByRole('button', { name: /Check and record my proof/ }).click()
await recoveryPage.getByRole('button', { name: /View today’s log/ }).click()
await recoveryPage.locator('.recovery-dice').waitFor()
await recoveryPage.screenshot({ path: 'output/playwright/recovery-dice-desktop.png', fullPage: true })
await recoveryPage.setViewportSize({ width: 390, height: 844 })
await recoveryPage.waitForTimeout(250)
await recoveryPage.screenshot({ path: 'output/playwright/recovery-dice-mobile.png', fullPage: true })
const recoveryMobileOverflow = await recoveryPage.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
assert.equal(recoveryMobileOverflow, 0, 'The punishment dice card overflows on mobile.')
assert.deepEqual(recoveryErrors, [], `Recovery browser errors occurred: ${recoveryErrors.join('; ')}`)

console.log(JSON.stringify({ landingOverflow, dashboardOverflow, mobileOverflow, recoveryMobileOverflow, mobileSidebar, errors, recoveryErrors }, null, 2))
await recoveryContext.close()
await browser.close()
