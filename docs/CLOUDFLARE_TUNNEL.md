# Cloudflare Tunnel (fallback)

**Primary plan:** your existing Nginx forwards `backend.opop.eu.org` to `10.10.15.254:2567`
([DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md)). Use this tunnel only if public inbound access to
that Nginx is not possible. The tunnel makes only **outbound** connections from the VM, so no
inbound ports or port-forwards are needed, and the origin (`server:2567`) stays private.

> Not configured or started by default. Requires the domain (or a subdomain) to be managed by
> Cloudflare DNS. **Do not switch DNS nameservers or records without your explicit approval.**
> `opop.eu.org` is a delegated free domain; check that you control a zone Cloudflare can manage
> before relying on this option.

## Setup (dashboard flow, needs your Cloudflare account)

1. Cloudflare Zero Trust -> Networks -> Tunnels -> Create a tunnel (type: Cloudflared).
2. Copy the tunnel **token** (a secret: treat like a password; never commit it).
3. Add a public hostname: `backend.opop.eu.org` -> service `http://server:2567`
   (the compose service name; WebSockets are proxied automatically).
4. On the VM, set `CLOUDFLARE_TUNNEL_TOKEN` in `.env` (mode 600), then:
   ```bash
   docker compose --env-file .env -f infra/docker/compose.prod.yml --profile tunnel up -d
   docker compose --env-file .env -f infra/docker/compose.prod.yml logs -f cloudflared
   ```
5. Cloudflare creates the DNS record (CNAME to the tunnel) when you add the hostname - this is the
   DNS change that needs your approval.

## Differences to account for

- The tunnel adds `CF-Connecting-IP` / `X-Forwarded-For`. The server runs with `TRUST_PROXY=true`
  and reads the client IP from proxy headers, so per-IP limits keep working. Because the origin is
  reachable only through the tunnel (loopback/LAN binding), clients cannot spoof it.
- With the tunnel you can set `SERVER_BIND=127.0.0.1` so port 2567 is not published on the LAN at all.
- Keep Nginx's role in mind: with the tunnel, Cloudflare terminates TLS; the Nginx files are not used.
- Verify exactly as in [DNS_AND_NETWORKING.md](DNS_AND_NETWORKING.md) steps 4-6 (HTTP, HTTPS, real WSS).
- Cloudflare's free plan supports WebSockets; very long idle connections are handled by the
  server's 5 s ping.

## Rollback

`docker compose ... --profile tunnel stop cloudflared` and remove the public hostname / DNS record
in Cloudflare.
