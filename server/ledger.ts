import Corestore from 'corestore'
import Hyperbee from 'hyperbee'
import Hyperswarm from 'hyperswarm'
import Protomux from 'protomux'
import c from 'compact-encoding'
import b4a from 'b4a'
import { createHash } from 'node:crypto'
import { networkInterfaces } from 'node:os'
import createTestnet from 'hyperdht/testnet.js'
import type { Visit } from './types.ts'

export const BOOTSTRAP_PORT = 49737

export interface PeerInfo {
  key: string
  device: string
  role: Role
  connected: boolean
  visits: number
  lastSeen: string | null
}

export type Role = 'promoter' | 'supervisor'

export interface SyncStatus {
  role: Role
  device: string
  team: string | null
  running: boolean
  supervisorAddress: string | null
  localAddresses: string[]
  ownKey: string
  peers: PeerInfo[]
  error: string | null
}

function topicFor(team: string) {
  return createHash('sha256').update('ripoti/v1/' + team.trim().toLowerCase()).digest()
}

export function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address)
}

// Each device appends its own visits to a Hyperbee it alone can write.
// Peers on the same team swap bee keys over a Protomux channel and
// replicate each other's bees, so the supervisor ends up with every
// promoter's records. Peer discovery runs on a HyperDHT the supervisor
// hosts on the local network, so no internet is needed.
export class Ledger {
  store: Corestore
  bee!: Hyperbee
  role: Role
  device: string
  team: string | null = null
  supervisorAddress: string | null = null
  private swarm: Hyperswarm | null = null
  private testnet: { destroy(): Promise<void> } | null = null
  private remotes = new Map<string, { bee: Hyperbee; device: string; role: Role; connected: number; lastSeen: string | null }>()
  private error: string | null = null

  constructor(dir: string, role: Role, device: string) {
    this.store = new Corestore(dir)
    this.role = role
    this.device = device
  }

  async ready() {
    await this.store.ready()
    const core = this.store.get({ name: 'visits' })
    this.bee = new Hyperbee(core, { keyEncoding: 'utf-8', valueEncoding: 'json' })
    await this.bee.ready()
    const meta = new Hyperbee(this.store.get({ name: 'peers' }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    await meta.ready()
    this.meta = meta
    for await (const { key, value } of meta.createReadStream()) {
      await this.track(key, value.device, value.role, value.lastSeen ?? null)
    }
  }

  private meta!: Hyperbee

  get ownKey() {
    return b4a.toString(this.bee.core.key!, 'hex')
  }

  async saveVisit(v: Visit) {
    await this.bee.put(v.id, v)
  }

  async getVisit(id: string): Promise<Visit | null> {
    const own = await this.bee.get(id)
    if (own) return own.value as Visit
    for (const r of this.remotes.values()) {
      const node = await r.bee.get(id, { wait: false }).catch(() => null)
      if (node) return node.value as Visit
    }
    return null
  }

  async listVisits(): Promise<(Visit & { source: string })[]> {
    const out: (Visit & { source: string })[] = []
    for await (const { value } of this.bee.createReadStream()) out.push({ ...(value as Visit), source: 'this device' })
    for (const r of this.remotes.values()) {
      for await (const { value } of r.bee.createReadStream({}, { wait: false })) out.push({ ...(value as Visit), source: r.device })
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  private async track(key: string, device: string, role: Role, lastSeen: string | null) {
    if (key === this.ownKey || this.remotes.has(key)) {
      const r = this.remotes.get(key)
      if (r) Object.assign(r, { device, role })
      return
    }
    const bee = new Hyperbee(this.store.get({ key: b4a.from(key, 'hex') }), { keyEncoding: 'utf-8', valueEncoding: 'json' })
    await bee.ready()
    this.remotes.set(key, { bee, device, role, connected: 0, lastSeen })
  }

  async start(team: string, supervisorAddress: string | null) {
    await this.stop()
    this.error = null
    this.team = team
    let bootstrap: { host: string; port: number }[]
    if (this.role === 'supervisor') {
      const host = lanAddresses()[0] ?? '127.0.0.1'
      this.testnet = await createTestnet(3, { host, port: BOOTSTRAP_PORT })
      bootstrap = [{ host, port: BOOTSTRAP_PORT }]
      this.supervisorAddress = `${host}:${BOOTSTRAP_PORT}`
    } else {
      if (!supervisorAddress) throw new Error('Enter the supervisor address shown on the supervisor laptop')
      const [host, port] = supervisorAddress.split(':')
      bootstrap = [{ host, port: Number(port) || BOOTSTRAP_PORT }]
      this.supervisorAddress = `${host}:${Number(port) || BOOTSTRAP_PORT}`
    }
    const swarm = new Hyperswarm({ bootstrap })
    this.swarm = swarm
    swarm.on('connection', (conn: any) => this.onConnection(conn))
    const discovery = swarm.join(topicFor(team), { server: true, client: true })
    await discovery.flushed().catch((e: Error) => (this.error = e.message))
  }

  private onConnection(conn: any) {
    this.store.replicate(conn)
    const mux = Protomux.from(conn)
    const channel = mux.createChannel({ protocol: 'ripoti/keys/v1' })
    let remoteKey: string | null = null
    const msg = channel.addMessage({
      encoding: c.json,
      onmessage: async (m: { key: string; device: string; role: Role; known: { key: string; device: string; role: Role }[] }) => {
        remoteKey = m.key
        const lastSeen = new Date().toISOString()
        await this.track(m.key, m.device, m.role, lastSeen)
        await this.meta.put(m.key, { device: m.device, role: m.role, lastSeen })
        const r = this.remotes.get(m.key)!
        r.connected++
        r.lastSeen = lastSeen
        // Supervisors relay every promoter they know so all records converge.
        for (const k of m.known) {
          if (k.key === this.ownKey) continue
          await this.track(k.key, k.device, k.role, null)
          await this.meta.put(k.key, { device: k.device, role: k.role, lastSeen: null })
        }
        await r.bee.core.update().catch(() => {})
        r.bee.core.download({ start: 0, end: -1 })
        for (const other of this.remotes.values()) other.bee.core.download({ start: 0, end: -1 })
      },
    })
    channel.open()
    const known = [...this.remotes.entries()].map(([key, r]) => ({ key, device: r.device, role: r.role }))
    msg.send({ key: this.ownKey, device: this.device, role: this.role, known })
    conn.on('close', () => {
      if (remoteKey) {
        const r = this.remotes.get(remoteKey)
        if (r) r.connected = Math.max(0, r.connected - 1)
      }
    })
    conn.on('error', () => {})
  }

  async stop() {
    if (this.swarm) await this.swarm.destroy()
    if (this.testnet) await this.testnet.destroy()
    this.swarm = null
    this.testnet = null
    for (const r of this.remotes.values()) r.connected = 0
  }

  async status(): Promise<SyncStatus> {
    const peers: PeerInfo[] = []
    for (const [key, r] of this.remotes) {
      let visits = 0
      for await (const _ of r.bee.createReadStream({}, { wait: false })) visits++
      peers.push({ key, device: r.device, role: r.role, connected: r.connected > 0, visits, lastSeen: r.lastSeen })
    }
    return {
      role: this.role,
      device: this.device,
      team: this.team,
      running: !!this.swarm,
      supervisorAddress: this.supervisorAddress,
      localAddresses: lanAddresses(),
      ownKey: this.ownKey,
      peers,
      error: this.error,
    }
  }

  async close() {
    await this.stop()
    await this.store.close()
  }
}
