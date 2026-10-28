// Two real Ledger instances (separate Corestores, separate Hyperswarm
// sockets) sync over the supervisor-hosted local DHT. Run with networking
// limited to the LAN to show no internet is involved.
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { Ledger, BOOTSTRAP_PORT, lanAddresses } from '../server/ledger.ts'
import type { Visit } from '../server/types.ts'

const dir = await mkdtemp(join(tmpdir(), 'ripoti-sync-'))
const supervisor = new Ledger(join(dir, 'sup'), 'supervisor', 'supervisor-laptop')
const promoter = new Ledger(join(dir, 'pro'), 'promoter', 'promoter-phone')
await Promise.all([supervisor.ready(), promoter.ready()])

const visit: Visit = {
  id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), device: 'promoter-phone', language: 'sw',
  transcript: 'Kaya namba 0142. Sync test record.',
  form: { householdId: '0142', members: [], pregnant: false, gestationMonths: null, vaccinesUpToDate: null, referralGiven: false, followUp: '', summary: 'Sync test record' },
  danger: [], urgent: false, readback: '', timings: [], models: {},
}
await promoter.saveVisit(visit)

const t0 = performance.now()
await supervisor.start('sync-test-team', null)
const host = lanAddresses()[0] ?? '127.0.0.1'
await promoter.start('sync-test-team', `${host}:${BOOTSTRAP_PORT}`)

let ok = false
for (let i = 0; i < 60 && !ok; i++) {
  await new Promise((r) => setTimeout(r, 500))
  ok = (await supervisor.listVisits()).some((v) => v.id === visit.id)
}
const ms = Math.round(performance.now() - t0)
console.log(JSON.stringify({ synced: ok, ms, supervisorAddress: `${host}:${BOOTSTRAP_PORT}`, supervisor: await supervisor.status() }, null, 2))
await promoter.close()
await supervisor.close()
await rm(dir, { recursive: true, force: true })
process.exit(ok ? 0 : 1)
