// Throwaway Edge profiles for the capture and test tools. Leftover profiles in %TEMP% slowed John's
// sign-in (Windows walks that folder at every logon, 2026-11-08), so they live in the git-ignored
// .tmp folder here. Each script still deletes its own profile on exit and Ctrl+C; a hard kill skips
// that, so a new run first removes folders with its own prefix that are over a day old.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TMP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '.tmp')
const STALE_MS = 24 * 60 * 60 * 1000

function removeStale(prefix) {
  for (const root of [TMP_ROOT, os.tmpdir()]) {
    for (const name of fs.readdirSync(root)) {
      if (!name.startsWith(prefix)) continue
      const full = path.join(root, name)
      try {
        const stat = fs.statSync(full)
        if (stat.isDirectory() && Date.now() - stat.mtimeMs > STALE_MS) fs.rmSync(full, { recursive: true, force: true })
      } catch (e) {
        console.error(`WARNING: could not delete stale temp folder ${full}: ${e.code || e.message}`)
      }
    }
  }
}

export function makeProfile(prefix) {
  fs.mkdirSync(TMP_ROOT, { recursive: true })
  removeStale(prefix)
  const profile = fs.mkdtempSync(path.join(TMP_ROOT, prefix))
  fs.mkdirSync(path.join(profile, '_temp'))
  // The scripts handle SIGINT themselves; these are the other ways a console run can end.
  for (const signal of ['SIGTERM', 'SIGHUP', 'SIGBREAK']) process.on(signal, () => process.exit(130))
  return profile
}

// Edge writes msedge_url_fetcher*, msedge_chrome_Unpacker_* and the like to its own %TEMP%, outside
// --user-data-dir. Pointing that inside the profile means they go when the profile goes.
export function edgeEnv(profile) {
  const temp = path.join(profile, '_temp')
  return { ...process.env, TEMP: temp, TMP: temp }
}
