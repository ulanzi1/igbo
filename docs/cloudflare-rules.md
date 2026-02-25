# Cloudflare WAF & Rate Limiting Rules

This document describes the Cloudflare rules that must be configured for the OBIGBO platform.
These rules provide edge-level protection before requests reach the application server (AC: 1 of Story 1.12).

## Prerequisites

- Cloudflare **Pro** plan or higher (required for rate limiting rules)
- Domain added to Cloudflare with proxied DNS records (orange cloud)

## DDoS Protection

- **Managed Rules:** Enable Cloudflare DDoS managed ruleset (WAF → DDoS)
- **Sensitivity:** Medium (adjust based on traffic patterns)
- **Under Attack Mode:** Enable via Security → Settings if under active attack
- **Bot Fight Mode:** Enable via Security → Bots → Bot Fight Mode

## Rate Limiting Rules

Configure in **Security → WAF → Rate Limiting Rules**.

### 1. Login brute-force protection

| Setting         | Value                                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Rule name       | `Login rate limit`                                                                                      |
| Expression      | `(http.request.uri.path matches "/(en\|ig)/login$") or (http.request.uri.path eq "/api/v1/auth/login")` |
| Characteristics | IP address                                                                                              |
| Requests        | 10                                                                                                      |
| Period          | 1 minute                                                                                                |
| Action          | Block                                                                                                   |
| Duration        | 1 minute                                                                                                |

### 2. Membership application protection

| Setting         | Value                                              |
| --------------- | -------------------------------------------------- |
| Rule name       | `Application rate limit`                           |
| Expression      | `http.request.uri.path matches "/(en\|ig)/apply$"` |
| Characteristics | IP address                                         |
| Requests        | 5                                                  |
| Period          | 10 minutes                                         |
| Action          | Block                                              |
| Duration        | 10 minutes                                         |

### 3. API catch-all rate limit

| Setting         | Value                                    |
| --------------- | ---------------------------------------- |
| Rule name       | `API catch-all rate limit`               |
| Expression      | `http.request.uri.path matches "^/api/"` |
| Characteristics | IP address                               |
| Requests        | 500                                      |
| Period          | 1 minute                                 |
| Action          | Block                                    |
| Duration        | 1 minute                                 |

### 4. Brute-force challenge (login failures)

| Setting         | Value                                                                                |
| --------------- | ------------------------------------------------------------------------------------ |
| Rule name       | `Login failure challenge`                                                            |
| Expression      | `(http.request.uri.path matches "/(en\|ig)/login$") and (http.response.code eq 401)` |
| Characteristics | IP address                                                                           |
| Requests        | 3 failures                                                                           |
| Period          | 5 minutes                                                                            |
| Action          | Managed Challenge (JS challenge)                                                     |
| Duration        | 5 minutes                                                                            |

## IP Header

Cloudflare sets the `CF-Connecting-IP` header with the real client IP on all proxied requests.
The Next.js middleware reads this header and forwards it as `X-Client-IP` to API route handlers
for per-IP rate limiting at the application level.

```
CF-Connecting-IP  →  Next.js middleware  →  X-Client-IP  →  API route key resolver
```

## Notes

- Cloudflare rate limiting acts BEFORE the application — requests blocked at the edge never reach Next.js.
- Application-level Redis rate limiting (per-user, per-endpoint) complements edge protection.
- Monitor Cloudflare analytics (Security → Overview) to tune thresholds after go-live.
- Firewall rules should be tested in "Log" mode before switching to "Block".
