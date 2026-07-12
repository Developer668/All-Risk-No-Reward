import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { writeFile } from 'node:fs/promises'

const baseUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:4173'
const fixedNow = new Date('2026-07-12T20:00:00-07:00')
const browser = await chromium.launch({ headless: true })
const results = { viewports: {}, accessibility: {}, flows: {}, errors: [] }

async function testPage(viewport = { width: 1440, height: 1000 }) {
  const context = await browser.newContext({ viewport, timezoneId: 'America/Los_Angeles', permissions: ['notifications'] })
  const page = await context.newPage()
  await page.clock.setFixedTime(fixedNow)
  page.on('console', (message) => message.type() === 'error' && results.errors.push(message.text()))
  page.on('pageerror', (error) => results.errors.push(error.message))
  return { context, page }
}

try {
  const { context, page } = await testPage({ width: 390, height: 844 })

  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(baseUrl, { waitUntil: 'networkidle' })
    results.viewports[width] = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    assert.equal(results.viewports[width].overflow, 0, `${width}px landing page overflows horizontally.`)
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(baseUrl, { waitUntil: 'networkidle' })
  const landingInteractiveAudit = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll('button, a, input, textarea, select')]
    return {
      unnamed: interactive.filter((element) => !((element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || '').trim())).length,
      undersized: interactive.filter((element) => {
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (rect.width < 44 || rect.height < 44)
      }).map((element) => ({ text: (element.textContent || element.getAttribute('aria-label') || '').trim(), width: rectRound(element.getBoundingClientRect().width), height: rectRound(element.getBoundingClientRect().height) })),
    }
    function rectRound(value) { return Math.round(value) }
  })
  results.accessibility.landing = landingInteractiveAudit
  assert.equal(landingInteractiveAudit.unnamed, 0, 'Landing page has unnamed interactive controls.')
  assert.deepEqual(landingInteractiveAudit.undersized, [], 'Landing page has undersized touch targets.')

  const signInButton = page.getByRole('button', { name: 'Sign in' })
  await signInButton.click()
  const dialog = page.getByRole('dialog', { name: 'Welcome back.' })
  await dialog.waitFor()
  results.accessibility.authFocusOnOpen = await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]')))
  assert.equal(results.accessibility.authFocusOnOpen, true, 'Opening auth did not move focus into the modal.')
  await page.keyboard.press('Escape')
  await assert.doesNotReject(() => dialog.waitFor({ state: 'hidden' }))
  results.accessibility.escapeClosesAuth = true

  await page.getByRole('button', { name: 'Try the working demo' }).click()
  await page.getByRole('heading', { name: /Good evening, Alex\./ }).waitFor()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const sidebar = page.locator('.sidebar')
  assert.equal(await sidebar.getAttribute('aria-hidden'), null, 'Open mobile navigation remained hidden from assistive technology.')
  await page.keyboard.press('Escape')
  assert.equal(await sidebar.getAttribute('aria-hidden'), 'true', 'Escape did not close mobile navigation.')
  assert.equal(await page.getByRole('button', { name: 'Open navigation' }).evaluate((element) => element === document.activeElement), true, 'Mobile navigation did not restore focus to its opener.')

  const dashboardAudit = await page.evaluate(() => {
    const interactive = [...document.querySelectorAll('button, a, input, textarea, select')]
    return {
      unnamed: interactive.filter((element) => {
        const style = getComputedStyle(element)
        if (style.display === 'none' || element.closest('[inert]')) return false
        return !((element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || '').trim())
      }).map((element) => element.outerHTML.slice(0, 240)),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  results.accessibility.dashboard = dashboardAudit
  assert.deepEqual(dashboardAudit.unnamed, [], 'Dashboard has unnamed interactive controls.')
  assert.equal(dashboardAudit.overflow, 0, 'Mobile dashboard overflows horizontally.')
  await context.close()

  // Full completion, history, settings persistence, inbox, and reload restore.
  const full = await testPage()
  await full.page.goto(baseUrl, { waitUntil: 'networkidle' })
  await full.page.getByRole('button', { name: 'Try the working demo' }).click()
  const originalTitle = await full.page.locator('.active-challenge h2').innerText()
  await full.page.getByRole('button', { name: /Add privacy-safe proof/ }).click()
  await full.page.getByLabel('What did you do?').fill('I asked a thoughtful follow-up question and listened to the complete answer. I felt nervous, then learned that the response was kind.')
  await full.page.getByRole('button', { name: /Check and record my proof/ }).click()
  const assessment = await full.page.locator('.assessment').innerText()
  assert.match(assessment, /CHALLENGE COMPLETE/)
  assert.match(assessment, /\+120 courage points/)
  await full.page.getByRole('button', { name: /View today’s log/ }).click()
  await full.page.locator('.complete-card').waitFor()
  assert.match(await full.page.locator('.complete-card').innerText(), /\+120/)
  await full.page.getByRole('button', { name: 'Share this win' }).click()
  const shareDialog = full.page.getByRole('dialog', { name: 'Make the brave rep visible.' })
  await shareDialog.waitFor()
  const privateCaption = await shareDialog.getByLabel('Privacy-safe sharing caption').inputValue()
  assert.doesNotMatch(privateCaption, new RegExp(originalTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'Share caption exposed the challenge title without opt-in.')
  await shareDialog.locator('.share-preview img').waitFor()
  assert.deepEqual(await shareDialog.locator('.share-preview img').evaluate((image) => ({ width: image.naturalWidth, height: image.naturalHeight })), { width: 1200, height: 630 })
  await shareDialog.getByLabel(/Include the challenge title/).check()
  assert.match(await shareDialog.getByLabel('Privacy-safe sharing caption').inputValue(), new RegExp(originalTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await shareDialog.getByRole('button', { name: /Copy caption/ }).click()
  await shareDialog.getByText('Privacy-safe caption copied.').waitFor()
  const downloadPromise = full.page.waitForEvent('download')
  await shareDialog.getByRole('button', { name: /Download PNG/ }).click()
  assert.match((await downloadPromise).suggestedFilename(), /^all-risk-no-reward-complete\.png$/)
  await shareDialog.getByRole('button', { name: 'Close dialog' }).click()

  await full.page.reload({ waitUntil: 'networkidle' })
  assert.equal(await full.page.locator('.complete-card').count(), 1, 'Completion did not restore after reload.')
  await full.page.locator('.sidebar nav button').filter({ hasText: 'My journey' }).click()
  assert.match(await full.page.locator('.history-list').innerText(), new RegExp(originalTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  await full.page.locator('.sidebar nav button').filter({ hasText: 'Settings' }).click()
  await full.page.getByLabel('Direct messages').check()
  await full.page.getByRole('button', { name: 'Save settings' }).click()
  await full.page.getByText(/Settings saved\./).waitFor()
  await full.page.reload({ waitUntil: 'networkidle' })
  await full.page.locator('.sidebar nav button').filter({ hasText: 'Settings' }).click()
  assert.equal(await full.page.getByLabel('Direct messages').isChecked(), true, 'Boundary setting did not persist after reload.')
  await full.page.getByRole('button', { name: /Open notifications/ }).click()
  await full.page.getByRole('heading', { name: 'Notifications.' }).waitFor()
  await full.page.getByRole('button', { name: 'Mark all as read' }).click()
  results.flows.fullCompletionSharingAndPersistence = true
  await full.context.close()

  // Partial proof creates a private recovery immediately. Its dice can replace
  // the punishment twice without repeats, and the spent rolls survive reloads.
  const partial = await testPage()
  await partial.page.goto(baseUrl, { waitUntil: 'networkidle' })
  await partial.page.getByRole('button', { name: 'Try the working demo' }).click()
  await partial.page.getByRole('button', { name: /Add privacy-safe proof/ }).click()
  await partial.page.getByLabel('What did you do?').fill('I spoke briefly today.')
  await partial.page.getByRole('button', { name: /Check and record my proof/ }).click()
  assert.match(await partial.page.locator('.assessment').innerText(), /PROGRESS RECORDED/)
  await partial.page.getByRole('button', { name: /View today’s log/ }).click()
  await partial.page.locator('.recovery-card').waitFor()
  const firstPunishment = await partial.page.locator('.recovery-card h2').innerText()
  await partial.page.getByRole('button', { name: /Roll the punishment dice, 2 rolls remaining/ }).click()
  await partial.page.getByText('The dice picked a new punishment. This roll cannot be undone.').waitFor()
  const secondPunishment = await partial.page.locator('.recovery-card h2').innerText()
  assert.notEqual(secondPunishment, firstPunishment, 'The first dice roll repeated a punishment.')
  await partial.page.reload({ waitUntil: 'networkidle' })
  assert.equal(await partial.page.locator('.recovery-card h2').innerText(), secondPunishment, 'The first dice result did not persist after reload.')
  await partial.page.getByRole('button', { name: /Roll the punishment dice, 1 roll remaining/ }).click()
  const thirdPunishment = await partial.page.locator('.recovery-card h2').innerText()
  assert.notEqual(thirdPunishment, firstPunishment, 'The second dice roll reused the initial punishment.')
  assert.notEqual(thirdPunishment, secondPunishment, 'The second dice roll reused the first dice result.')
  const lockedDice = partial.page.getByRole('button', { name: 'Punishment dice locked' })
  assert.equal(await lockedDice.isDisabled(), true, 'The dice did not lock after two rolls.')
  assert.match(await lockedDice.innerText(), /Result locked/)
  await partial.page.getByLabel(/Private reflection/).fill('I completed the private reset and chose one smaller next step.')
  await partial.page.getByRole('button', { name: /I completed this recovery/ }).click()
  await partial.page.locator('.recovery-card').waitFor({ state: 'hidden' })
  results.flows.partialRecoveryAndDice = true
  await partial.context.close()

  // Safety reporting replaces the card without exposing or messaging anyone.
  const report = await testPage()
  await report.page.goto(baseUrl, { waitUntil: 'networkidle' })
  await report.page.getByRole('button', { name: 'Try the working demo' }).click()
  const beforeReport = await report.page.locator('.active-challenge h2').innerText()
  await report.page.getByRole('button', { name: /Flag or replace/ }).click()
  await report.page.getByLabel('What is the problem?').selectOption('crosses-boundary')
  await report.page.getByLabel('Optional details').fill('This format is outside my boundaries today.')
  await report.page.getByRole('button', { name: /Save safety report/ }).click()
  const afterReport = await report.page.locator('.active-challenge h2').innerText()
  assert.notEqual(afterReport, beforeReport, 'Safety report did not replace the challenge.')
  results.flows.reportReplacement = true
  await report.context.close()

  // Local account creation, sign-out, and sign-in work without external services.
  const auth = await testPage()
  await auth.page.goto(baseUrl, { waitUntil: 'networkidle' })
  await auth.page.getByRole('button', { name: 'Sign in' }).click()
  await auth.page.getByRole('button', { name: /New here/ }).click()
  await auth.page.getByLabel('Your name').fill('Taylor')
  await auth.page.getByLabel('Email address').fill('taylor@example.com')
  await auth.page.getByLabel('Password').fill('courage123')
  await auth.page.getByLabel(/at least 18/).check()
  await auth.page.getByLabel(/I accept/).check()
  await auth.page.getByRole('button', { name: /Create my private account/ }).click()
  await auth.page.getByRole('heading', { name: /Good evening, Taylor\./ }).waitFor()
  await auth.page.locator('.sidebar nav button').filter({ hasText: 'Settings' }).click()
  await auth.page.getByRole('button', { name: 'Sign out' }).click()
  await auth.page.getByRole('button', { name: 'Sign in' }).click()
  await auth.page.getByLabel('Email address').fill('taylor@example.com')
  await auth.page.getByLabel('Password').fill('courage123')
  await auth.page.getByRole('dialog', { name: 'Welcome back.' }).getByRole('button', { name: 'Sign in', exact: true }).click()
  await auth.page.getByRole('heading', { name: /Good evening, Taylor\./ }).waitFor()
  results.flows.localAuth = true
  await auth.context.close()

  assert.deepEqual(results.errors, [], `Browser errors occurred: ${results.errors.join('; ')}`)
  await writeFile('/tmp/arnr-runtime-audit.json', JSON.stringify(results, null, 2))
  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}
