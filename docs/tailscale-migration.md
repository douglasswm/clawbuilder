# Tailscale Migration Strategy & Implementation Plan

## Platform: FullRestore / OpenClaw One-Click Deployment SaaS
## Architecture: User-Managed → Platform-Managed Tailscale

---

## 1. Current State vs Target State

### Current State (Option 2)
- User creates their own Tailscale account and generates an auth key (`tskey-auth-...`) from the admin console
- Operator deploys via `clawmacdo deploy --tailscale --tailscale-auth-key <key>`, which handles Tailscale installation, `tailscale up`, and UFW rules automatically
- User is still responsible for their own Tailscale account, Funnel enablement on their tailnet, and HTTPS cert management
- Funnel setup post-deploy is handled via `clawmacdo tailscale-funnel` (see Section 4.5)
- **Result:** Medium friction — clawmacdo automates provisioning, but user still owns their Tailscale account and configuration

### Target State (Option 1)
- Platform owns a single Tailscale organisation account (Business tier)
- Platform programmatically generates tagged, single-use pre-auth keys via Tailscale API
- Deployed OpenClaw instances auto-join the platform tailnet on provisioning
- HTTPS certs are auto-provisioned
- Funnel is auto-enabled per instance with device pairing disabled (`dangerouslyDisableDeviceAuth: true`)
- ACLs enforce strict tenant isolation
- Operational tooling: `clawmacdo deploy` handles provisioning, `clawmacdo tailscale-funnel` handles Funnel setup, `clawmacdo serve` provides a web UI for managing Funnel across instances (see Sections 4.5–4.6)
- **Result:** User clicks "Deploy" and receives a live HTTPS URL. Zero Tailscale awareness required.

---

## 2. Tailscale Admin Panel Setup (One-Time, Manual)

These are the steps you (the platform operator) must perform in the Tailscale admin console **before** writing any code.

### 2.1 Create the Platform Tailscale Account

1. Go to https://login.tailscale.com/start
2. Sign up with a dedicated platform email (e.g. `infra@yourplatform.com`)
3. This creates your **tailnet** — the private network all deployed instances will join
4. Your tailnet name will be something like `yourplatform.tail1a2b3.ts.net`

### 2.2 Choose the Appropriate Plan

| Plan | Device Limit | Key Feature You Need | Monthly Cost (approx) |
|------|-------------|----------------------|----------------------|
| Free/Personal | 100 devices | API access, ACLs, Funnel | $0 |
| Starter | 5 users, unlimited devices | Multiple admin users, more ACL control | ~$5/user/mo |
| Business | Unlimited | SCIM, custom OIDC, full API | Custom pricing |

**Recommendation:** The **Free plan** is sufficient to start — it includes API access, ACLs, and Funnel. The critical factor is the **100 device limit** (each OpenClaw instance = 1 device). Upgrade to Starter only if you need multiple admin users or expect >100 tenants.

### 2.3 Generate an API Access Token (for your backend)

Your platform backend will use this token to programmatically create auth keys, manage ACLs, and control Funnel.

1. Go to **Settings → Keys** (or visit https://login.tailscale.com/admin/settings/keys)
2. Click **"Generate API access token..."**
3. Set the following:
   - **Description:** `platform-backend-production`
   - **Expiry:** 90 days (set a calendar reminder to rotate)
   - **Scopes:** Select ALL of these:
     - `devices:read` — query node status
     - `devices:write` — manage/remove nodes
     - `keys:read` — list auth keys
     - `keys:write` — create auth keys (CRITICAL)
     - `acl:read` — read ACL policy
     - `acl:write` — update ACL policy (CRITICAL)
     - `dns:read` — read DNS config
     - `dns:write` — manage DNS (for MagicDNS/certs)
4. Copy the token. Store it in your platform's secret manager (e.g. DigitalOcean Secrets, AWS Secrets Manager, Vault). **Never commit this to source control.**

> **Auth Key vs API Access Token — Critical Distinction**
>
> | Type | Prefix | Purpose | Used By |
> |------|--------|---------|---------|
> | API access token | `tskey-api-*` | Tailscale REST API calls (create keys, manage devices, ACLs) | Platform backend (Section 4.2) |
> | Auth key | `tskey-auth-*` | Authenticate a device to join a tailnet | `clawmacdo deploy --tailscale-auth-key`, `clawmacdo tailscale-funnel --auth-key` |
>
> Do **not** use an API access token (`tskey-api-*`) where an auth key is expected — API tokens cannot authenticate devices. clawmacdo will reject them.

### 2.4 Enable MagicDNS

MagicDNS gives each node a stable DNS name like `openclaw-abc123.yourplatform.tail1a2b3.ts.net`. This is required for HTTPS cert provisioning.

1. Go to **DNS** tab (https://login.tailscale.com/admin/dns)
2. Ensure **MagicDNS** is toggled **ON**
3. Optionally enable **HTTPS Certificates** toggle — this allows nodes to call `tailscale cert` to get Let's Encrypt certs for their `*.ts.net` subdomain

### 2.5 Enable Funnel at the Policy Level

Funnel must be explicitly allowed in your ACL policy. By default it is off.

1. Go to **Access Controls** tab (https://login.tailscale.com/admin/acls)
2. In the `nodeAttrs` section of the ACL JSON, add the Funnel grant. (Full ACL provided in Section 3.)

### 2.6 Define Tags in ACL Policy

Tags are how you isolate tenants. Each deployed instance will be tagged `tag:tenant-<uuid>`. Your management/monitoring infra will be tagged `tag:platform-mgmt`.

Tags must be declared in the ACL policy under `tagOwners` — you cannot use undeclared tags.

> **Action:** Go to **Access Controls**, edit the policy JSON. Full policy below.

### 2.7 Create a Tag Owner for Automation

In Tailscale, tags are "owned" by users or groups who can assign them. Since your backend is generating tagged auth keys, you need:

1. The API token owner (the account you created in 2.1) must be listed as an owner of all `tag:tenant-*` and `tag:platform-mgmt` tags
2. This is configured in the ACL policy `tagOwners` block

---

## 3. ACL Policy (Full JSON)

Replace the **entire** contents of your ACL policy at **Access Controls → Edit** with this:

```jsonc
{
  // === TAG OWNERSHIP ===
  // The platform admin account owns all tags.
  // This allows the API token (owned by this account) to generate
  // pre-auth keys with these tags.
  "tagOwners": {
    "tag:platform-mgmt":   ["autogroup:admin"],
    "tag:tenant":          ["autogroup:admin"]
  },

  // === ACCESS CONTROL RULES ===
  // Deny-by-default. Only explicit rules below grant access.
  "acls": [
    // Rule 1: Platform management nodes can reach ANY tenant node
    // on management ports only (SSH + health check endpoint)
    {
      "action": "accept",
      "src":    ["tag:platform-mgmt"],
      "dst":    ["tag:tenant:22,8080,443"]
    },

    // Rule 2: Tenant nodes have NO outbound access to other nodes.
    // Deny-by-default handles this — no rule needed.
    // Funnel handles inbound public traffic independently of ACLs.
    // If a tenant node later needs to reach itself (e.g., localhost
    // services via Tailscale IP), add a per-device rule at that time.

    // Rule 3: Platform management nodes can talk to each other
    {
      "action": "accept",
      "src":    ["tag:platform-mgmt"],
      "dst":    ["tag:platform-mgmt:*"]
    }
  ],

  // === FUNNEL POLICY ===
  // Allow tenant-tagged nodes to use Tailscale Funnel
  // (expose HTTPS to the public internet)
  "nodeAttrs": [
    {
      "target": ["tag:tenant"],
      "attr":   ["funnel"]
    }
  ],

  // === SSH POLICY (optional but recommended) ===
  // Allows platform-mgmt nodes to SSH into tenant nodes for
  // emergency debugging. Remove if you don't want this.
  "ssh": [
    {
      "action": "accept",
      "src":    ["tag:platform-mgmt"],
      "dst":    ["tag:tenant"],
      "users":  ["root", "openclaw"]
    }
  ]
}
```

### Critical Note on Tenant Isolation

The above policy uses **deny-by-default** — tenant nodes have no ACL rule granting them access to anything, so they are fully isolated from each other. Funnel handles inbound public traffic independently of ACLs. This is the simplest model.

**If you later need per-tenant granularity** (e.g., one customer has 3 instances that must talk to each other), you would switch to unique tags like `tag:tenant-abc123` per tenant. This requires dynamically updating the ACL policy via the API each time a tenant is provisioned — more complex, but more flexible. Start with the shared-tag model. Migrate when you have the use case.

---

## 4. Implementation: Backend Integration

### 4.1 API Endpoints You'll Call

Base URL: `https://api.tailscale.com/api/v2`

| Operation | Method | Endpoint | When |
|-----------|--------|----------|------|
| Create auth key | POST | `/tailnet/{tailnet}/keys` | On "Deploy" click |
| List devices | GET | `/tailnet/{tailnet}/devices` | Health dashboard |
| Delete device | DELETE | `/device/{deviceID}` | On instance teardown |
| Get device status | GET | `/device/{deviceID}` | Health checks |

### 4.2 Auth Key Generation (on Deploy)

When a user clicks "Deploy OpenClaw", your backend should:

```python
import requests
import os

# NOTE: This is the API access token (tskey-api-*), NOT an auth key (tskey-auth-*).
# Renamed from TAILSCALE_API_KEY to avoid confusion with device auth keys.
TAILSCALE_API_TOKEN = os.environ["TAILSCALE_API_TOKEN"]
TAILNET = os.environ["TAILSCALE_TAILNET"]  # e.g. "yourplatform.tail1a2b3.ts.net"

def create_tenant_auth_key(tenant_id: str) -> str:
    """Generate a single-use, ephemeral, tagged auth key for a tenant."""
    response = requests.post(
        f"https://api.tailscale.com/api/v2/tailnet/{TAILNET}/keys",
        headers={"Authorization": f"Bearer {TAILSCALE_API_TOKEN}"},
        json={
            "capabilities": {
                "devices": {
                    "create": {
                        "reusable": False,       # Single use — key dies after one join
                        "ephemeral": False,       # Node persists after disconnect
                        "preauthorized": True,    # Skip manual admin approval
                        "tags": ["tag:tenant"]    # Isolation tag
                    }
                }
            },
            "expirySeconds": 600  # Key expires in 10 minutes if unused
        }
    )
    response.raise_for_status()
    return response.json()["key"]
```

**Key design decisions:**
- `reusable: False` — The key can only be used once. If someone exfiltrates it after use, it's worthless.
- `ephemeral: False` — The node stays on your tailnet even if it disconnects (you want this for a server).
- `preauthorized: True` — The node joins immediately without manual approval in the admin panel.
- `expirySeconds: 600` — If the deployment fails and the key isn't consumed, it self-destructs in 10 minutes.

> **clawmacdo integration:** The generated `tskey-auth-*` key is passed to clawmacdo via `--tailscale-auth-key` or the `TAILSCALE_AUTH_KEY` environment variable. clawmacdo handles the rest of the provisioning flow — Tailscale installation, `tailscale up`, and UFW rules. See Appendix: clawmacdo Command Reference.

### 4.3 Deployment Pipeline (Revised)

> **clawmacdo handles this pipeline.** The deploy command abstracts the full flow below across all 5 supported cloud providers (DigitalOcean, AWS Lightsail, Tencent Cloud, Azure, BytePlus). Tailscale integration is provider-agnostic. See Appendix: clawmacdo Command Reference.

```
User clicks "Deploy"
       │
       ▼
┌─────────────────────────────────────┐
│  1. Backend: Generate auth key      │
│     POST /tailnet/{tn}/keys         │
│     → returns TSKEY-xxxxxx          │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  2. Backend: Create cloud instance   │
│     (automated by clawmacdo deploy) │
│     that includes:                  │
│     - Install tailscale             │
│     - tailscale up --auth-key=KEY    │
│       --hostname=openclaw-{uuid}    │
│     - tailscale cert                │
│       openclaw-{uuid}.{tailnet}     │
│     - tailscale funnel 443          │
│     - Start OpenClaw on :443        │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  3. Backend: Poll device status     │
│     GET /device/{id} until online   │
│     (timeout after 5 min)           │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  4. Backend: Store mapping          │
│     tenant_id → device_id,          │
│     funnel_url (the public URL)     │
│     in your database                │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│  5. Frontend: Show user their URL   │
│     https://openclaw-{uuid}         │
│       .{tailnet}.ts.net             │
└─────────────────────────────────────┘
```

### 4.4 Cloud-Init Script (Conceptual Reference)

> **Note:** This script is a conceptual reference showing the underlying provisioning steps. In practice, `clawmacdo deploy --tailscale --tailscale-auth-key` generates and injects the appropriate provisioning commands automatically across all supported cloud providers. You do not need to write or maintain this script unless building a custom deployment pipeline outside of clawmacdo.

This is the script that would be injected into the instance at creation time:

```bash
#!/bin/bash
set -euo pipefail

# --- Variables injected by your backend ---
TAILSCALE_AUTH_KEY="__TSKEY_PLACEHOLDER__"
HOSTNAME="__HOSTNAME_PLACEHOLDER__"          # e.g. openclaw-a1b2c3d4
TAILNET_DOMAIN="__TAILNET_PLACEHOLDER__"     # e.g. yourplatform.tail1a2b3.ts.net
FQDN="${HOSTNAME}.${TAILNET_DOMAIN}"

# --- 1. Install Tailscale ---
curl -fsSL https://tailscale.com/install.sh | sh

# --- 2. Join the tailnet ---
tailscale up \
  --auth-key="${TAILSCALE_AUTH_KEY}" \
  --hostname="${HOSTNAME}" \
  --advertise-tags=tag:tenant \
  --accept-routes=false \
  --accept-dns=true

# --- 3. Wait for Tailscale to be fully online ---
sleep 5
tailscale status --json | jq -e '.Self.Online == true'

# --- 4. Provision HTTPS certificate ---
# This gets a Let's Encrypt cert for ${FQDN}
# Certs land in /var/lib/tailscale/certs/
mkdir -p /var/lib/tailscale/certs
tailscale cert "${FQDN}"

# --- 5. Enable Funnel ---
# Funnel exposes port 443 to the public internet via Tailscale's edge
tailscale funnel --bg 443

# --- 6. Install and start OpenClaw ---
# (Replace with your actual OpenClaw deployment steps)
apt-get update && apt-get install -y docker.io docker-compose

# Pull and run OpenClaw with the provisioned TLS certs
cat > /opt/openclaw/docker-compose.yml << 'EOF'
version: '3.8'
services:
  openclaw:
    image: ghcr.io/yourorg/openclaw:latest
    ports:
      - "443:443"
    volumes:
      - /var/lib/tailscale/certs:/etc/openclaw/certs:ro
    environment:
      - TLS_CERT=/etc/openclaw/certs/${FQDN}.crt
      - TLS_KEY=/etc/openclaw/certs/${FQDN}.key
    restart: unless-stopped
EOF

cd /opt/openclaw && docker-compose up -d

# --- 7. Signal readiness ---
# Write a health file your backend can check
echo "ready" > /opt/openclaw/.health
```

### 4.5 Tailscale Funnel Setup via clawmacdo

After deployment, Funnel must be configured to expose the OpenClaw instance to the public internet. `clawmacdo tailscale-funnel` handles this as a 6-step automated flow:

1. **Install Tailscale** on the instance (if not already installed during deploy)
2. **Connect with auth key** — joins the instance to the tailnet via `tailscale up --auth-key`
3. **Enable Funnel** — runs `tailscale funnel --bg <port>` to expose the service
4. **Retrieve public URL** — captures the `https://<hostname>.<tailnet>.ts.net` URL
5. **Configure `openclaw.json`** — sets `controlUi.allowedOrigins` to the Funnel URL, `trustedProxies` to loopback, and `controlUi.dangerouslyDisableDeviceAuth: true`
6. **Auto-approve pending devices** — clears any queued device pairing requests

```bash
clawmacdo tailscale-funnel \
  --instance <deploy-id-or-hostname-or-ip> \
  --auth-key "tskey-auth-..."

# Or via environment variable:
export TAILSCALE_AUTH_KEY="tskey-auth-..."
clawmacdo tailscale-funnel --instance <query>
```

> **`dangerouslyDisableDeviceAuth` (v0.19.0+):** clawmacdo automatically sets `controlUi.dangerouslyDisableDeviceAuth: true` in `openclaw.json` during Funnel setup. This means browser connections via the Funnel URL skip the mandatory device pairing screen — critical for achieving the "zero Tailscale awareness" target state. Combined with the web UI's one-click "Open" button (Section 4.6), users access the webchat without any manual token paste or pairing approval.

**Toggle Funnel on/off** after initial setup (Tailscale must already be installed and connected):

```bash
clawmacdo funnel-on --instance <query> [--port <PORT>]
clawmacdo funnel-off --instance <query>
```

### 4.6 Web UI Funnel Management

`clawmacdo serve` provides a web UI for managing Funnel across all deployed instances:

- **Deployments tab** — lists all instances with a Funnel status column showing enabled/disabled state
- **Funnel toggle** — each deployment row has an On/Off button to enable or disable Tailscale Funnel. Requires a Tailscale auth key (`tskey-auth-...`) saved in the user's Settings page
- **One-click "Open" button** — when Funnel is enabled, opens the Funnel URL with the gateway token pre-injected via `auth.html` (no manual token paste or device pairing needed)
- **API endpoint** — `POST /api/deployments/{id}/funnel` with `{"action": "on"}` or `{"action": "off"}`

```bash
clawmacdo serve --port 3456
```

This is the recommended operational interface for managing Funnel across multiple deployed instances, especially at scale.

---

## 5. Migration Strategy (Phased)

### Phase 0: Preparation (Week 1)

| # | Task | Owner | Notes |
|---|------|-------|-------|
| 0.1 | Create platform Tailscale account | You | Dedicated email, not personal |
| 0.2 | Upgrade Tailscale plan | You | Based on projected device count |
| 0.3 | Generate API access token | You | Store in secrets manager |
| 0.4 | Enable MagicDNS + HTTPS certs | You | Admin panel toggle |
| 0.5 | Deploy ACL policy (Section 3) | You | Copy-paste into admin panel |
| 0.6 | Test ACL policy with 2 dummy nodes | You | Verify isolation works |

### Phase 1: New Deployments Use Platform Tailscale (Weeks 2–3)

| # | Task | Notes |
|---|------|-------|
| 1.1 | Integrate platform API token to auto-generate `tskey-auth-*` keys | Section 4.2 — pass generated key to `clawmacdo deploy --tailscale-auth-key` |
| 1.2 | Verify `clawmacdo deploy --tailscale` handles provisioning correctly | Section 4.4 — clawmacdo manages cloud-init internally |
| 1.3 | Configure Funnel on deployed instances via `clawmacdo tailscale-funnel` | Section 4.5 — includes `dangerouslyDisableDeviceAuth` for zero-friction access |
| 1.4 | Remove "Paste your Tailscale auth key" field from UI | Replace with nothing — users don't see Tailscale anymore |
| 1.5 | Add device status polling | For deploy progress indicator |
| 1.6 | Store tenant→device mapping in DB | For lifecycle management |
| 1.7 | Implement instance teardown (delete device from tailnet) | Clean up on "Destroy" |
| 1.8 | QA: Deploy 5 test instances, verify isolation | Use `tailscale ping` between instances — should fail |

**Feature flag this.** New users get Option 1. Existing users stay on Option 2 temporarily.

### Phase 2: Migrate Existing Users (Weeks 4–5)

This is the most delicate phase. Existing users have OpenClaw instances on **their own** tailnets. You need to move them to **your** tailnet with minimal downtime.

**Primary approach: `clawmacdo migrate`**

clawmacdo's `migrate` command handles cloud-to-cloud migration with backup + redeploy, including Tailscale support:

```bash
clawmacdo migrate \
  --source-ip <existing-instance-ip> \
  --provider <new-provider> \
  --tailscale \
  --tailscale-auth-key "$TAILSCALE_AUTH_KEY" \
  --customer-email "user@example.com"
```

This backs up the source instance, deploys a new instance on the platform tailnet, and restores data — handling the Tailscale transition automatically.

**Manual fallback** (for operators who need granular control):

```
1. Notify user: "We're upgrading your instance.
   You'll get a new, permanent URL.
   No action needed from you."

2. On the existing instance:
   a. tailscale logout            # Leave user's tailnet
   b. tailscale up --auth-key=... # Join platform tailnet with new key
      --hostname=openclaw-{uuid}
      --advertise-tags=tag:tenant
   c. tailscale cert {new-fqdn}   # New HTTPS cert
   d. tailscale funnel --bg 443   # Re-enable funnel
   e. Restart OpenClaw with new cert paths

3. Update DB: old_url → new_url

4. Show user their new URL in dashboard
   Old: https://{something}.{users-tailnet}.ts.net
   New: https://openclaw-{uuid}.{your-tailnet}.ts.net

5. If user had custom domain pointing at old URL,
   provide them the new CNAME target
```

**Risk mitigation:**
- There WILL be ~30 seconds of downtime during `tailscale logout` → `tailscale up`. This is unavoidable.
- Schedule migrations during each user's lowest-traffic window if you have analytics.
- Have a rollback script ready: re-join user's old tailnet using their stored auth key (if you retained it).

**After migration:**
- Remove the user's Tailscale auth key from your database permanently.
- Notify user: "Migration complete. You can now close/delete your personal Tailscale account if it was only used for this."

### Phase 3: Cleanup & Hardening (Week 6)

| # | Task |
|---|------|
| 3.1 | Remove all legacy "paste auth key" code paths |
| 3.2 | Delete stored user auth keys from DB (if not already) |
| 3.3 | Implement API token rotation automation (90-day cycle) |
| 3.4 | Set up monitoring: alert if device count approaches plan limit |
| 3.5 | Set up monitoring: alert if any device goes offline >5 min |
| 3.6 | Document incident runbook for Tailscale outages |
| 3.7 | Load test: deploy 50 instances simultaneously, verify ACL holds |

---

## 6. Monitoring & Observability

### What to Monitor

| Signal | Method | Alert Threshold |
|--------|--------|----------------|
| Device online status | `GET /device/{id}` poll every 60s | Offline > 5 min |
| Total device count | `GET /tailnet/{tn}/devices` | > 80% of plan limit |
| Funnel reachability | External HTTP probe to funnel URL | 3 consecutive failures |
| Cert expiry | Parse cert on device, or track 90-day LE cycle | < 14 days to expiry |
| Auth key generation failures | Backend logs | Any failure |
| ACL policy drift | `GET /tailnet/{tn}/acl` hash check | Hash mismatch from expected |

### Cert Auto-Renewal

Let's Encrypt certs (which `tailscale cert` provisions) expire every 90 days. You need a cron job on each instance:

```bash
# /etc/cron.d/tailscale-cert-renewal
0 3 1 * * root tailscale cert "${FQDN}" && systemctl restart openclaw
```

This runs on the 1st of every month at 3am, re-provisions the cert, and restarts OpenClaw to pick it up.

---

## 7. Cost Model

| Component | Cost | Scale Factor |
|-----------|------|-------------|
| Tailscale Free plan | $0 | Up to 100 devices; upgrade to Starter (~$5/user/mo) if >100 tenants |
| DigitalOcean Droplet | $6–12/mo per instance | Per tenant |
| Tailscale API calls | Free (included) | — |
| Funnel bandwidth | Free (included, best-effort) | See note below |

**Funnel bandwidth note:** Tailscale Funnel routes traffic through Tailscale's DERP relay servers. OpenClaw's primary traffic patterns (chat messages, API calls, control UI) are low-bandwidth and well within Funnel's capabilities. This concern is relevant only for file-heavy workloads, which is not the typical OpenClaw use case. At 50+ tenants, evaluate Cloudflare Tunnel as an alternative if latency or throughput becomes a factor (see Section 10).

---

## 8. Rollback Plan

If the platform-managed model fails catastrophically:

1. **Immediate (per-instance):** SSH into the droplet, `tailscale logout`, `tailscale up --auth-key=<users-old-key>` (requires you retained user keys during migration window)
2. **Systematic:** Re-enable the "Paste auth key" UI behind a feature flag, revert new deployments to user-managed model
3. **Communication:** Status page update explaining temporary revert

**Retention policy:** Keep user auth keys encrypted in a separate cold-storage table for 30 days post-migration. Delete after 30 days with no issues.

---

## 9. Security Checklist

- [ ] Platform Tailscale API token stored in secrets manager, never in code
- [ ] API token rotated every 90 days (automated)
- [ ] ACL policy version-controlled in Git (source of truth)
- [ ] ACL policy changes deployed via CI/CD, never manual edits in admin panel after initial setup
- [ ] Pre-auth keys are single-use and expire in 10 minutes
- [ ] User auth keys purged from DB within 30 days of migration
- [ ] Tenant isolation verified: `tailscale ping` between instances returns unreachable
- [ ] Funnel URLs are HTTPS-only (Tailscale enforces this by default)
- [ ] SSH access to tenant nodes restricted to `tag:platform-mgmt` only
- [ ] Cloud firewall (DigitalOcean, AWS, Tencent, Azure, BytePlus) blocks all inbound except Tailscale (UDP 41641)

---

## 10. Future Considerations

| When | What | Why |
|------|------|-----|
| 50+ tenants | Evaluate Cloudflare Tunnel as Funnel alternative | Better bandwidth, DDoS protection, CDN |
| 100+ tenants | Automate ACL policy updates via CI/CD pipeline | Manual edits become error-prone |
| Multi-cloud | Abstract the **tunnel** layer (Tailscale/Cloudflare/WireGuard) | clawmacdo already abstracts the **provider** layer across 5 clouds; remaining work is swapping the tunnel implementation |
| Enterprise users | Offer dedicated tailnet option | Large customers may demand network isolation |
| Custom domains | Implement Caddy/nginx reverse proxy with user's domain | Users want `chat.theircompany.com`, not a `.ts.net` URL |

---

## Appendix: clawmacdo Command Reference

All Tailscale-related clawmacdo commands used in this document. For full syntax and options, see `clawmacdo/docs/clawmacdo_usage.md`.

| Command | Purpose | Key Flags / Env Vars |
|---------|---------|----------------------|
| `clawmacdo deploy --tailscale --tailscale-auth-key <key>` | Deploy instance with Tailscale pre-installed and connected | `--provider`, `--customer-name`, `--customer-email` |
| `clawmacdo tailscale-funnel --instance <query> --auth-key <key>` | Full 6-step Funnel setup (install, connect, enable, configure, approve) | `--port` (default 18789), env: `TAILSCALE_AUTH_KEY` |
| `clawmacdo funnel-on --instance <query>` | Enable Funnel (requires prior Tailscale setup) | `--port` |
| `clawmacdo funnel-off --instance <query>` | Disable Funnel | — |
| `clawmacdo migrate --source-ip <ip> --tailscale --tailscale-auth-key <key>` | Cloud-to-cloud migration with Tailscale transition | `--provider`, `--customer-email` |
| `clawmacdo device-approve --instance <query>` | Approve pending webchat device pairing requests | — |
| `clawmacdo serve` | Web UI with Funnel toggle and one-click open | `--port` (default 3456) |

> **Instance query:** All `--instance` flags accept a deploy ID, hostname, or IP address.