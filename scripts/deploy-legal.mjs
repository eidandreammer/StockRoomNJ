import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(fileURLToPath(import.meta.url), '..', '..')

// 1. Get project ID from .firebaserc
let projectId = 'stockroomnj-10e7d'
try {
  const rcPath = join(rootDir, '.firebaserc')
  const rc = JSON.parse(readFileSync(rcPath, 'utf8'))
  if (rc?.projects?.default) {
    projectId = rc.projects.default
  }
} catch (e) {
  // Use fallback if reading fails
}

// 2. Prevent accidental emulator deploy if FIRESTORE_EMULATOR_HOST is set in environment
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn(`WARNING: FIRESTORE_EMULATOR_HOST is set to "${process.env.FIRESTORE_EMULATOR_HOST}".`)
  console.warn('Temporarily disabling emulator host for production deployment...')
  delete process.env.FIRESTORE_EMULATOR_HOST
}

console.log(`Deploying legal documents to production project: ${projectId}...`)

const env = {
  ...process.env,
  FIREBASE_PROJECT_ID: projectId,
}

// Run the migration command with appropriate environment
const result = spawnSync('npm', ['--prefix', 'functions', 'run', 'migrate:legal'], {
  cwd: rootDir,
  env,
  stdio: 'inherit',
})

if (result.status === 0) {
  console.log('Legal documents deployed successfully to production!')
} else {
  console.error('Failed to deploy legal documents to production.')
  process.exit(result.status || 1)
}
