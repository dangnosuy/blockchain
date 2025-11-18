/* Simple WebSocket Relay Server for Holder <-> Guardians message exchange.
   NOT production. No auth, no persistence. Intended for local demo.

   Protocol (JSON messages):
   - registerHolder: { type: 'registerHolder', holder: '0xAddress' }
   - registerGuardian: { type: 'registerGuardian', holder: '0xAddress', guardian: '0xAddress' }
   - bundle: { type: 'bundle', holder: '0xAddress', bundle: { ...preKeyBundlePublic } }
   - initEnvelope: { type: 'initEnvelope', holder: '0xAddress', guardian: '0xAddress', envelope: {...} }
   - replyEnvelope: { type: 'replyEnvelope', holder: '0xAddress', guardian: '0xAddress', envelope: {...} }

   Server routing rules:
   - bundle/initEnvelope/replyEnvelope broadcast ONLY to connections with matching holder address
   - Guardian registration links its connection to a holder; Holder registration marks connection as the holder
*/
import express from 'express'
// eslint-disable-next-line @typescript-eslint/no-var-requires
import { WebSocketServer, WebSocket } from 'ws'
import http from 'http'

interface ClientMeta {
  socket: WebSocket
  role: 'holder' | 'guardian'
  holder: string
  guardian?: string
}

const app = express()
app.get('/health', (_req, res) => res.json({ ok: true }))

const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const clients: ClientMeta[] = []

function normalize(addr: string | undefined): string {
  return (addr || '').toLowerCase()
}

function broadcastToHolder(holder: string, msg: any) {
  const holderNorm = normalize(holder)
  const data = JSON.stringify(msg)
  clients.forEach(c => {
    if (normalize(c.holder) === holderNorm) {
      c.socket.send(data)
    }
  })
}

wss.on('connection', (ws: WebSocket) => {
  const meta: ClientMeta = { socket: ws, role: 'guardian', holder: '' }
  clients.push(meta)

  ws.on('message', (raw: WebSocket.RawData) => {
    let payload: any
    try { payload = JSON.parse(raw.toString()) } catch { return }
    if (!payload || typeof payload !== 'object') return

    switch (payload.type) {
      case 'registerHolder': {
        meta.role = 'holder'
        meta.holder = normalize(payload.holder)
        ws.send(JSON.stringify({ type: 'ack', role: 'holder', holder: meta.holder }))
        break
      }
      case 'registerGuardian': {
        meta.role = 'guardian'
        meta.holder = normalize(payload.holder)
        meta.guardian = normalize(payload.guardian)
        ws.send(JSON.stringify({ type: 'ack', role: 'guardian', holder: meta.holder, guardian: meta.guardian }))
        break
      }
      case 'bundle': {
        if (!payload.holder || !payload.bundle) return
        broadcastToHolder(payload.holder, { type: 'bundle', guardian: meta.guardian, bundle: payload.bundle })
        break
      }
      case 'initEnvelope': {
        if (!payload.holder || !payload.envelope) return
        broadcastToHolder(payload.holder, { type: 'initEnvelope', guardian: meta.guardian, envelope: payload.envelope })
        break
      }
      case 'replyEnvelope': {
        if (!payload.holder || !payload.envelope) return
        broadcastToHolder(payload.holder, { type: 'replyEnvelope', guardian: meta.guardian, envelope: payload.envelope })
        break
      }
      default:
        ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }))
    }
  })

  ws.on('close', () => {
    const idx = clients.indexOf(meta)
    if (idx >= 0) clients.splice(idx, 1)
  })
})

const PORT = Number(process.env.RELAY_PORT || 8099)
server.listen(PORT, () => {
  console.log('Relay server listening on', PORT)
})
