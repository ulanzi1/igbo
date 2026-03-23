# Cloudflare Production Setup Guide

This guide covers the full Cloudflare configuration for the OBIGBO platform: DNS, SSL/TLS,
caching, WAF, and DDoS protection.

For detailed WAF rate-limiting rules, see [docs/cloudflare-rules.md](./cloudflare-rules.md).

---

## 1. DNS Setup

1. Log in to [dash.cloudflare.com](https://dash.cloudflare.com) and add your domain.
2. Set your domain's nameservers to Cloudflare's assigned nameservers (shown during onboarding).
3. Add DNS records:

| Type  | Name | Content               | Proxy status           |
| ----- | ---- | --------------------- | ---------------------- |
| A     | @    | `<Hetzner server IP>` | Proxied (orange cloud) |
| A     | www  | `<Hetzner server IP>` | Proxied (orange cloud) |
| CNAME | api  | `@`                   | Proxied                |

> **Important:** Only proxied records benefit from Cloudflare CDN, WAF, and DDoS protection.

---

## 2. SSL/TLS Configuration

1. Go to **SSL/TLS → Overview** and set mode to **Full (Strict)**.
   - This requires a valid origin certificate on the Hetzner server (e.g., Let's Encrypt).
   - "Full" without Strict allows MITM; always use Strict for production.
2. Enable **Always Use HTTPS**: SSL/TLS → Edge Certificates → Always Use HTTPS → On.
3. Enable **HSTS**: SSL/TLS → Edge Certificates → HTTP Strict Transport Security (HSTS):
   - Max Age Header: **12 months (recommended)**
   - Include subdomains: enabled
   - Preload: enabled (after verifying HSTS Preload List requirements)
4. Disable **Auto Minification** (SSL/TLS → Speed → Optimization → Auto Minify):
   - Next.js standalone output already minifies JS/CSS — double minification can corrupt assets.

---

## 3. Cache Rules

Next.js standalone output automatically sets `Cache-Control: public, max-age=31536000, immutable`
for all `/_next/static/*` assets (content-hashed filenames). No additional `next.config.ts`
configuration is required — the standalone server handles this correctly.

Configure Cloudflare Page Rules / Cache Rules as follows:

### 3.1 Static Assets — Immutable (1 year)

| Setting     | Value             |
| ----------- | ----------------- |
| URL pattern | `/_next/static/*` |
| Cache level | Cache Everything  |
| Browser TTL | 1 year            |
| Edge TTL    | 1 year            |

These files are content-hashed (`/_next/static/chunks/abc123.js`) — safe to cache forever.

### 3.2 Public assets (1 week)

| Setting     | Value            |
| ----------- | ---------------- |
| URL pattern | `/public/*`      |
| Cache level | Cache Everything |
| Browser TTL | 1 week           |
| Edge TTL    | 1 week           |

### 3.3 HTML pages — ISR-compatible (60 seconds)

| Setting     | Value                                        |
| ----------- | -------------------------------------------- |
| URL pattern | `*.obigbo.app/*` (excluding API and static)  |
| Cache level | Cache Everything                             |
| Edge TTL    | 60 seconds                                   |
| Browser TTL | By Cloudflare (respect origin Cache-Control) |

This matches the Next.js ISR `revalidate = 60` setting — stale HTML is served from edge
for up to 60 seconds, then revalidated from origin.

### 3.4 API routes — No cache

| Setting     | Value        |
| ----------- | ------------ |
| URL pattern | `/api/*`     |
| Cache level | Bypass Cache |

API responses must never be cached at the CDN layer (auth-sensitive, real-time data).

### Target: 90%+ cache hit ratio

Monitor the CDN cache hit ratio via **Cloudflare Analytics → Caching**:

- Target: ≥90% for static assets (`/_next/static/*`)
- Investigate misses if ratio drops: check Cache-Control headers, ensure `/_next/static/*` rule
  is prioritised above the HTML catch-all rule

---

## 4. WAF Rules

Cloudflare provides two layers of WAF protection:

### 4.1 Managed Rulesets (included in all plans)

Enable in **Security → WAF → Managed Rules**:

- **Cloudflare Managed Ruleset** — OWASP Core Rule Set equivalent, blocks common attack patterns
- **Cloudflare OWASP Core Ruleset** — additional OWASP rules (available on Pro+)

### 4.2 Custom Rate Limiting Rules

See [docs/cloudflare-rules.md](./cloudflare-rules.md) for full rate limiting rules:

- Login brute-force: 10 req/min per IP
- Application rate limit: 5 req/10min per IP
- API catch-all: 500 req/min per IP
- Login failure challenge: 3 failures/5min triggers managed challenge

### 4.3 Country-Based Challenge (optional)

If experiencing spam or abuse from specific regions:

1. Security → WAF → Custom Rules → Create Rule
2. Expression: `(ip.geoip.country in {"XX" "YY"})` (replace with target country codes)
3. Action: Managed Challenge (preferred over Block to avoid false positives)

---

## 5. DDoS Protection

| Tier | L3/L4 DDoS  | L7 WAF      |
| ---- | ----------- | ----------- |
| Free | ✅ Included | Limited     |
| Pro  | ✅ Included | ✅ Full WAF |

**Recommendation for launch:** **Pro tier** is required for full L7 WAF rules (OWASP managed
ruleset, advanced rate limiting). Free tier provides network-level DDoS protection only.

Additional settings:

1. **Bot Fight Mode**: Security → Bots → Bot Fight Mode → On
   - Automatically challenges bots with malicious signatures
2. **Under Attack Mode**: Security → Settings → Security Level → "I'm Under Attack"
   - Enables JavaScript challenge for all visitors (temporary measure for active attacks)
3. **Security Level** (normal operation): Security → Settings → Security Level → Medium

---

## 6. CDN Cache Hit Ratio Monitoring

1. Navigate to **Analytics → Caching** in the Cloudflare dashboard.
2. Filter by zone and time range (last 24h for daily monitoring, 7d for weekly review).
3. Check the **Cache Hit Ratio** chart — target ≥90% for static assets.
4. Use **Cache Performance** to identify top uncached URL patterns.

### Troubleshooting Low Hit Ratio

| Symptom                            | Investigation                                                              |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `/_next/static/*` not cached       | Verify Cache Rule priority (static rule must be above HTML rule)           |
| API routes cached unexpectedly     | Add explicit Bypass Cache rule for `/api/*`                                |
| HTML served from origin every time | Check `Cache-Control: no-store` header from Next.js                        |
| Hit ratio drops after deploy       | Expected — content-hashed filenames change; CDN repopulates within minutes |

---

## 7. Origin IP Protection

Once Cloudflare is active, protect the Hetzner server from direct access:

1. Use Cloudflare's IP ranges to allowlist inbound connections in the Hetzner firewall:
   - IPv4: [https://www.cloudflare.com/ips-v4](https://www.cloudflare.com/ips-v4)
   - IPv6: [https://www.cloudflare.com/ips-v6](https://www.cloudflare.com/ips-v6)
2. Block all other inbound traffic on ports 80/443 from non-Cloudflare IPs.
3. This prevents WAF bypass via direct IP access.

---

## Related Documentation

- [docs/cloudflare-rules.md](./cloudflare-rules.md) — Detailed WAF rate limiting rules
- [docs/hetzner-storage-setup.md](./hetzner-storage-setup.md) — Object Storage + SSE
- [docs/secrets-management.md](./secrets-management.md) — Production secrets management
