import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDirectory = join(root, 'data', 'challenges')
const outputPath = join(root, 'insforge', 'challenge-catalog.seed.sql')
const manifest = JSON.parse(readFileSync(join(dataDirectory, 'manifest.json'), 'utf8'))

const difficultyByLevel = {
  easy: 1,
  medium: 2,
  hard: 3,
  extreme: 4,
  nightmare: 5,
}

const whyByCategory = {
  coding: 'Building something concrete turns a large technical idea into a finishable, visible result.',
  comedy: 'Playful discomfort makes it easier to practice being seen without needing to be perfect.',
  cooking: 'A practical creation gives effort, planning, and experimentation a tangible finish line.',
  creative: 'Making and sharing a finished artifact builds confidence through visible follow-through.',
  fitness: 'A scalable physical task builds momentum by pairing a clear target with safe movement.',
  kindness: 'A specific helpful action strengthens connection while keeping the focus on another person’s needs.',
  outdoors: 'A planned change of setting creates a concrete adventure while preserving safety and choice.',
  productivity: 'Closing one bounded loop builds trust in your ability to start, focus, and finish.',
  skill: 'Deliberate practice makes progress observable and turns unfamiliar work into a repeatable skill.',
  social: 'A consent-respecting social action creates a real opportunity to practice initiative and connection.',
  wellness: 'A bounded reset supports attention and self-awareness without demanding perfection.',
}

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function sqlArray(values) {
  return values.length
    ? `ARRAY[${values.map(sqlString).join(', ')}]::TEXT[]`
    : 'ARRAY[]::TEXT[]'
}

function boundaryTags(challenge) {
  const tags = new Set()
  const prompt = challenge.prompt.toLowerCase()
  if (challenge.requiresConsent) tags.add('requires-consent')
  if (challenge.mode === 'group') tags.add('group-activity')
  if (challenge.platforms?.length) tags.add('social-platform')
  if (challenge.category === 'fitness' || challenge.category === 'outdoors') tags.add('physical-activity')
  if (/\bvoice (?:note|message)|audio message\b/.test(prompt)) tags.add('voice-message')
  if (/\b(?:dm|direct message|message|text|instagram)\b/.test(prompt)) tags.add('direct-message')
  if (/\b(?:invite|invitation|ask (?:someone|them) out)\b/.test(prompt)) tags.add('invitation')
  if (/\b(?:vulnerable|personal story|meaningful|appreciation)\b/.test(prompt)) tags.add('vulnerability')
  return [...tags]
}

function loadCatalog() {
  const catalog = []
  for (const entry of manifest.levels) {
    const source = JSON.parse(readFileSync(join(dataDirectory, entry.file), 'utf8'))
    if (source.level !== entry.level || source.challengeCount !== entry.count || source.challenges.length !== entry.count) {
      throw new Error(`Manifest mismatch for ${entry.file}`)
    }
    for (const challenge of source.challenges) {
      if (!whyByCategory[challenge.category]) throw new Error(`Unknown category ${challenge.category}`)
      if (!challenge.verification?.gradeableByVision) throw new Error(`${challenge.id} is not vision-gradeable`)
      if (!challenge.verification.acceptedEvidence.every((item) => item === 'image' || item === 'video')) {
        throw new Error(`${challenge.id} contains unsupported evidence types`)
      }
      catalog.push({ ...challenge, difficulty: difficultyByLevel[source.level] })
    }
  }
  if (catalog.length !== manifest.totalChallenges) throw new Error('Catalog total does not match manifest')
  if (new Set(catalog.map(({ id }) => id)).size !== catalog.length) throw new Error('Challenge IDs must be unique')
  return catalog
}

function renderUpsert(catalog) {
  const rows = catalog.map((challenge) => `  (
    ${sqlString(challenge.id)},
    ${sqlString(challenge.title)},
    ${sqlString(challenge.prompt)},
    ${sqlString(whyByCategory[challenge.category])},
    ${sqlString(challenge.category)},
    ${challenge.difficulty},
    ${challenge.estimatedMinutes},
    ${sqlString(challenge.verification.captureInstructions)},
    NULL,
    true,
    now(),
    ${sqlString(challenge.verification.privacyNotes)},
    ${sqlArray(boundaryTags(challenge))},
    ${sqlString(JSON.stringify(challenge))}::jsonb,
    ${sqlString(manifest.datasetVersion)}
  )`).join(',\n')

  return `INSERT INTO challenge_catalog (
  id, title, prompt, why, category, difficulty, estimated_minutes, proof_hint,
  suggested_script, is_active, safety_reviewed_at, safety_notes, boundary_tags,
  source_data, dataset_version
)
VALUES
${rows}
ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  prompt = EXCLUDED.prompt,
  why = EXCLUDED.why,
  category = EXCLUDED.category,
  difficulty = EXCLUDED.difficulty,
  estimated_minutes = EXCLUDED.estimated_minutes,
  proof_hint = EXCLUDED.proof_hint,
  suggested_script = EXCLUDED.suggested_script,
  is_active = EXCLUDED.is_active,
  safety_reviewed_at = EXCLUDED.safety_reviewed_at,
  safety_notes = EXCLUDED.safety_notes,
  boundary_tags = EXCLUDED.boundary_tags,
  source_data = EXCLUDED.source_data,
  dataset_version = EXCLUDED.dataset_version;`
}

function renderSeed(catalog) {
  return `-- Generated by scripts/generate-challenge-catalog.mjs. Do not edit by hand.
-- Source: data/challenges/*.json (dataset ${manifest.datasetVersion})

BEGIN;

${renderUpsert(catalog)}

COMMIT;
`
}

function applyCatalog(catalog) {
  const batchSize = 40
  const totalBatches = Math.ceil(catalog.length / batchSize)
  for (let offset = 0; offset < catalog.length; offset += batchSize) {
    const batch = catalog.slice(offset, offset + batchSize)
    const batchNumber = Math.floor(offset / batchSize) + 1
    const result = spawnSync(
      'npx',
      ['@insforge/cli', 'db', 'query', '--', renderUpsert(batch)],
      { stdio: 'inherit' },
    )
    if (result.error || result.status !== 0) {
      throw result.error ?? new Error(`InsForge catalog batch ${batchNumber} failed`)
    }
    console.log(`Applied challenge batch ${batchNumber}/${totalBatches}.`)
  }
}

const catalog = loadCatalog()
const rendered = renderSeed(catalog)
if (process.argv.includes('--apply')) {
  applyCatalog(catalog)
} else if (process.argv.includes('--check')) {
  const existing = readFileSync(outputPath, 'utf8')
  if (existing !== rendered) {
    console.error('Challenge seed is out of date. Run npm run catalog:generate.')
    process.exit(1)
  }
  console.log(`Challenge seed matches ${manifest.totalChallenges} source records.`)
} else {
  writeFileSync(outputPath, rendered)
  console.log(`Wrote ${manifest.totalChallenges} challenges to ${outputPath}`)
}
