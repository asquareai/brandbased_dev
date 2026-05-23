# Stripe Premium — monthly subscription

## Required `.env`

```env
STRIPE_KEY=pk_test_...
STRIPE_SECRET=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PREMIUM=price_...
STRIPE_SUCCESS_URL=http://127.0.0.1:5500/premium-subscription.html?stripe=success
STRIPE_CANCEL_URL=http://127.0.0.1:5500/premium-subscription.html?stripe=cancel
STRIPE_PORTAL_RETURN_URL=http://127.0.0.1:5500/premium-subscription.html?stripe=portal
```

**Webhooks are required** for monthly renewals, cancellations, and payment failures. Checkout redirect alone only handles the first purchase.

## Stripe Dashboard — Webhook endpoint

**URL:** `https://api.brandbased.ai/api/stripe/webhook` (production)  
**Local:** use Stripe CLI (below)

**Events to enable:**

| Event | Purpose |
|-------|---------|
| `checkout.session.completed` | First subscription after checkout |
| `customer.subscription.created` | New subscription |
| `customer.subscription.updated` | Renewals, cancel-at-period-end, plan changes |
| `customer.subscription.deleted` | Subscription ended → freemium |
| `invoice.paid` | Monthly renewal paid → extend `ends_at` |
| `invoice.payment_failed` | Mark `past_due` (user should update card in portal) |

Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.

## Local UI + production API (recommended)

In `brandbased_frontend/assets/js/app-config.js`:

```javascript
const USE_PRODUCTION_BACKEND = true;
```

- Frontend: `http://127.0.0.1:5500`
- API + DB + webhooks: `https://api.brandbased.ai`
- Webhook in Stripe Dashboard: `https://api.brandbased.ai/api/stripe/webhook`
- Checkout return URLs land on the **Brand Console** (`brand-console-dashboard.html?page=start&stripe=success`); success shows a dashboard popup. Go Premium opens Stripe in the **same tab** (parent window when embedded in the iframe).

Production `.env` must include the same Stripe keys and `STRIPE_WEBHOOK_SECRET` from the Dashboard webhook signing secret.

## Local webhook (full local stack only)

```bash
stripe listen --forward-to http://127.0.0.1:8000/api/stripe/webhook
```

Paste the `whsec_...` from the CLI into local `.env`, restart `php artisan serve`.

## Manage subscription (users)

Authenticated users open **Stripe Customer Portal** via:

- `POST /api/billing/portal-session` → redirect to `portal_url`
- UI: **Manage subscription** on `premium-subscription.html`

Portal allows: update card, cancel (at period end), view invoices.

## API

| Method | Path | Auth |
|--------|------|------|
| POST | `/api/billing/checkout-session` | Yes |
| POST | `/api/billing/sync-checkout-session` | Yes |
| POST | `/api/billing/refresh-subscription` | Yes — pull latest from Stripe |
| POST | `/api/billing/portal-session` | Yes |
| POST | `/api/stripe/webhook` | No (Stripe signature) |

`GET /auth/me` includes `subscription` with `active_premium.status_label`, `stripe_status`, `cancel_at_period_end`, `ends_at`.

## Behaviour

- **Monthly billing:** `ends_at` = Stripe `current_period_end`; renewed on `invoice.paid` / `subscription.updated`.
- **Cancel:** User cancels in portal → `cancel_at_period_end` = true; Premium stays until `ends_at`, then webhook downgrades to freemium.
- **Failed payment:** `stripe_status` = `past_due`; Premium may remain during Stripe retry window; user should fix payment in portal.
