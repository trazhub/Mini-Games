# DNS and networking

## What is known and what is not

| Fact | Status |
| --- | --- |
| VM LAN IP `10.10.42.88`, Tailscale `100.79.46.21`, gateway `10.10.1.1` | Given by you |
| Outbound IPv4 `110.225.229.41` | Observed as the VM's **outbound** address only |
| An existing Nginx server is the public reverse proxy for `backend.opop.eu.org` | Given by you |
| `backend.opop.eu.org` resolves to that Nginx server and port 80/443 are reachable from the internet | **Not verified** |
| Nginx can reach `10.10.42.88:2567` | **Not verified** |
| Browser WebSockets through the proxy work | **Not verified** |

Do not point DNS at `110.225.229.41` or assume inbound access from the outbound IP. The game VM
itself needs **no public inbound ports** in this design: only the Nginx host must be reachable, and
only the Nginx host must reach the VM on 2567.

## Request path

```
browser --HTTPS/WSS 443--> Nginx (backend.opop.eu.org) --HTTP/WS--> 10.10.42.88:2567 (Docker: server)
                                                                        └─ postgres (private compose network)
```

## Verification sequence (do these in order, stop at the first failure)

Run from your Windows PC unless stated. None of these change anything.

1. **DNS** - does the name resolve, and to what?
   ```powershell
   Resolve-DnsName backend.opop.eu.org
   ```
   Confirm the answer is the IP of your Nginx server. If the name is not yet created, **ask the
   domain owner before changing DNS** - this project never edits DNS automatically.
2. **Backend reachable from the Nginx host** (on the Nginx host):
   ```bash
   curl -s http://10.10.42.88:2567/health     # {"ok":true,"db":"up"}
   ```
3. **Local network config on the VM** (read-only):
   ```bash
   ip -br addr; ip route; ss -tlnp | grep -E ':(22|80|443|2567)\b'
   ```
4. **HTTP** from outside your LAN (phone on mobile data, or any external host):
   ```powershell
   curl.exe -I http://backend.opop.eu.org/health      # expect 301 to https
   ```
5. **HTTPS**:
   ```powershell
   curl.exe -s https://backend.opop.eu.org/health      # {"ok":true,"db":"up"}
   curl.exe -s -X POST https://backend.opop.eu.org/api/guest -H "content-type: application/json" -d "{}"
   ```
   CORS check (the Pages origin must be echoed, others must not):
   ```powershell
   curl.exe -s -i -X OPTIONS https://backend.opop.eu.org/matchmake/create/party -H "Origin: https://trazhub.github.io" | findstr /i access-control
   ```
6. **Real WebSocket** - the only proof WSS works through the proxy. With Node 22:
   ```powershell
   $env:API="https://backend.opop.eu.org"
   node -e "
   (async()=>{const {Client}=require('@colyseus/sdk');
   const g=await (await fetch(process.env.API+'/api/guest',{method:'POST',headers:{'content-type':'application/json'},body:'{}'})).json();
   const r=await new Client(process.env.API).create('party',{token:g.token,nickname:'WsTest',avatar:'comet'});
   console.log('WSS connected, room', r.roomId); await r.leave(true); process.exit(0)})().catch(e=>{console.error('FAILED',e.message);process.exit(1)})"
   ```
   Run it from the repo root so `@colyseus/sdk` resolves. (Bots send no `Origin`, which the server allows.)
   Then open <https://trazhub.github.io/Mini-Games/> and create a room: the badge should say "Connected".

## Nginx requirements (already in `infra/nginx/`)

- `Upgrade`/`Connection` headers for WebSocket and `proxy_http_version 1.1`
- long `proxy_read_timeout` (the server pings every 5 s)
- `X-Forwarded-For $remote_addr` **overwritten**, because the app uses it for per-IP rate limits
- `/metrics` blocked publicly

## Firewall

Public: TCP 80/443 on the Nginx host only. Internal-only: `2567` (reachable only from the Nginx
host) and PostgreSQL (not published). SSH 22: Tailscale/trusted sources.

Before changing any firewall rule: inspect the current rules (`sudo ufw status verbose`,
`sudo iptables -S`), explain the change, keep your current SSH session open, make sure
you have a second way in (Tailscale SSH or console), apply, and test a **new** SSH login before
closing the old one. Docker-published ports bypass UFW - use the `DOCKER-USER` chain
(see [VM_DEPLOYMENT.md](VM_DEPLOYMENT.md)).

If Nginx cannot reach the VM or the domain cannot point to Nginx, use the
[Cloudflare Tunnel fallback](CLOUDFLARE_TUNNEL.md).
