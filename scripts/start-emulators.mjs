import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(rootDir, 'emulator-data')

const requiredPorts = [
  { name: 'Emulator UI', port: 4001 },
  { name: 'Auth', port: 9099 },
  { name: 'Firestore', port: 8080 },
  { name: 'Storage', port: 9199 },
  { name: 'Functions', port: 5001 },
  { name: 'Hub', port: 4400 },
  { name: 'Logging', port: 4500 },
  { name: 'Firestore websocket', port: 9150 },
  { name: 'Eventarc', port: 9299 },
  { name: 'Cloud Tasks', port: 9499 },
]

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    ...options,
  })
}

function commandOutput(command, args) {
  const result = run(command, args)
  if (result.status !== 0 && !result.stdout && !result.stderr) return ''
  return `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
}

function pidsListeningOn(port) {
  const output = commandOutput('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'])
  return output
    .split(/\s+/)
    .filter(Boolean)
    .map((pid) => Number(pid))
    .filter(Number.isInteger)
}

function processInfo(pid) {
  const command = commandOutput('ps', ['-p', String(pid), '-o', 'command='])
  const cwdOutput = commandOutput('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
  const cwd = cwdOutput
    .split('\n')
    .find((line) => line.startsWith('n'))
    ?.slice(1)

  return { pid, command, cwd }
}

function isProjectFirebaseEmulator({ command, cwd }) {
  if (cwd !== rootDir) return false

  return (
    command.includes('firebase emulators:start') ||
    command.includes('cloud-firestore-emulator') ||
    (command.includes('firebase-tools') && command.includes('emulator'))
  )
}

function isAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function terminate(pid) {
  if (!isAlive(pid)) return

  try {
    process.kill(pid, 'SIGTERM')
  } catch {
    return
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (!isAlive(pid)) return
    sleep(100)
  }

  if (isAlive(pid)) {
    process.kill(pid, 'SIGKILL')
  }
}

function clearStaleEmulators() {
  const occupied = requiredPorts.flatMap(({ name, port }) =>
    pidsListeningOn(port).map((pid) => ({ name, port, ...processInfo(pid) })),
  )

  if (occupied.length === 0) return

  const unknown = occupied.filter((entry) => !isProjectFirebaseEmulator(entry))
  if (unknown.length > 0) {
    console.error('Cannot start Firebase emulators because these required ports are busy:')
    for (const entry of unknown) {
      console.error(
        `- ${entry.name} port ${entry.port}: PID ${entry.pid} (${entry.command || 'unknown command'})`,
      )
    }
    console.error(
      'Stop the listed process or update firebase.json, src/firebase.js, and vite.config.js together.',
    )
    process.exit(1)
  }

  const stalePids = [...new Set(occupied.map(({ pid }) => pid))]
  console.log(`Stopping stale Firebase emulator process${stalePids.length === 1 ? '' : 'es'}: ${stalePids.join(', ')}`)
  for (const pid of stalePids) {
    terminate(pid)
  }

  for (const { port } of requiredPorts) {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (pidsListeningOn(port).length === 0) break
      sleep(100)
    }
  }
}

function javaMajorVersion(javaBin) {
  const result = run(javaBin, ['-version'])
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  const version = output.match(/version "(\d+)(?:\.|\b)/)?.[1]
  return version ? Number(version) : null
}

function findJava() {
  const candidates = [
    process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : null,
    '/opt/homebrew/opt/openjdk@21/bin/java',
    'java',
  ].filter(Boolean)

  for (const candidate of candidates) {
    const version = javaMajorVersion(candidate)
    if (version >= 21) {
      return {
        bin: candidate,
        dir: candidate.includes('/') ? dirname(candidate) : null,
        version,
      }
    }
  }

  console.error('Firebase emulators require Java 21 or newer, but this script could not find it.')
  console.error('Install it with `brew install openjdk@21`, or set JAVA_HOME to a JDK 21+ install.')
  process.exit(1)
}

clearStaleEmulators()
mkdirSync(dataDir, { recursive: true })

const java = findJava()
const firebaseBin = existsSync(join(rootDir, 'node_modules', '.bin', 'firebase'))
  ? join(rootDir, 'node_modules', '.bin', 'firebase')
  : 'firebase'
const env = {
  ...process.env,
  PATH: java.dir ? `${java.dir}:${process.env.PATH ?? ''}` : process.env.PATH,
}

console.log(`Using Java ${java.version} for Firebase emulators.`)

const child = spawn(
  firebaseBin,
  [
    'emulators:start',
    '--only',
    'auth,firestore,storage,functions',
    '--import=./emulator-data',
    '--export-on-exit=./emulator-data',
  ],
  {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  },
)

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    child.kill(signal)
  })
}

child.on('exit', (code, signal) => {
  if (signal) {
    const signalExitCodes = {
      SIGINT: 130,
      SIGTERM: 143,
    }
    process.exit(signalExitCodes[signal] ?? 1)
  }
  process.exit(code ?? 0)
})
