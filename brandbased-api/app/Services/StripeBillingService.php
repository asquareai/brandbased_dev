<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AccountSubscription;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Stripe\Checkout\Session as CheckoutSession;
use Stripe\Customer;
use Stripe\Exception\ApiErrorException;
use Stripe\Stripe;
use Stripe\Subscription as StripeSubscription;
use Stripe\Webhook;

class StripeBillingService
{
    public function __construct(
        protected AccountSubscriptionService $subscriptions
    ) {}

    public function isConfigured(): bool
    {
        return !empty(config('stripe.secret')) && !empty(config('stripe.price_id_premium'));
    }

    protected function client(): void
    {
        Stripe::setApiKey(config('stripe.secret'));
    }

    public function resolveOrCreateCustomer(Account $account): string
    {
        if ($account->stripe_customer_id) {
            return $account->stripe_customer_id;
        }

        $this->client();

        $customer = Customer::create([
            'email' => $account->email,
            'metadata' => [
                'account_id' => $account->id,
            ],
        ]);

        $account->update(['stripe_customer_id' => $customer->id]);

        return $customer->id;
    }

    /**
     * @param  array{success_url?: string, cancel_url?: string}  $returnUrls
     * @return array{url: string, session_id: string}
     */
    public function createCheckoutSession(Account $account, array $returnUrls = []): array
    {
        if (!$this->isConfigured()) {
            $fallback = config('stripe.payment_link_url');
            if ($fallback) {
                return ['url' => $fallback, 'session_id' => ''];
            }

            throw new \RuntimeException(
                'Stripe is not configured. Set STRIPE_SECRET and STRIPE_PRICE_ID_PREMIUM.'
            );
        }

        $this->client();
        $customerId = $this->resolveOrCreateCustomer($account);

        $successUrl = $returnUrls['success_url'] ?? config('stripe.success_url');
        if (!str_contains($successUrl, '{CHECKOUT_SESSION_ID}')) {
            $separator = str_contains($successUrl, '?') ? '&' : '?';
            $successUrl .= $separator . 'session_id={CHECKOUT_SESSION_ID}';
        }

        $cancelUrl = $returnUrls['cancel_url'] ?? config('stripe.cancel_url');

        $session = CheckoutSession::create([
            'customer' => $customerId,
            'mode' => 'subscription',
            'line_items' => [[
                'price' => config('stripe.price_id_premium'),
                'quantity' => 1,
            ]],
            'success_url' => $successUrl,
            'cancel_url' => $cancelUrl,
            'client_reference_id' => $account->id,
            'subscription_data' => [
                'metadata' => [
                    'account_id' => $account->id,
                ],
            ],
            'metadata' => [
                'account_id' => $account->id,
            ],
        ]);

        return [
            'url' => $session->url,
            'session_id' => $session->id,
        ];
    }

    /**
     * @return array{url: string}
     */
    public function createBillingPortalSession(Account $account, ?string $returnUrl = null): array
    {
        if (!$account->stripe_customer_id) {
            throw new \RuntimeException('No Stripe customer on file for this account.');
        }

        $this->client();

        $returnUrl = $returnUrl ?? config('stripe.portal_return_url', config('stripe.cancel_url'));

        $session = \Stripe\BillingPortal\Session::create([
            'customer' => $account->stripe_customer_id,
            'return_url' => $returnUrl,
        ]);

        return ['url' => $session->url];
    }

    public function syncCheckoutSession(string $sessionId, Account $account): array
    {
        if (!$this->isConfigured()) {
            throw new \RuntimeException('Stripe is not configured.');
        }

        $this->client();

        $session = CheckoutSession::retrieve([
            'id' => $sessionId,
            'expand' => ['subscription'],
        ]);

        if ($session->client_reference_id && $session->client_reference_id !== $account->id) {
            throw new \RuntimeException('Checkout session does not belong to this account.');
        }

        if ($session->subscription) {
            $subscription = is_string($session->subscription)
                ? StripeSubscription::retrieve($session->subscription)
                : $session->subscription;

            $this->applyStripeSubscription($account, $subscription);
        }

        return $this->subscriptions->serializeAccountPlan($account->fresh());
    }

    /** Pull latest subscription state from Stripe (after portal or support). */
    public function refreshSubscriptionFromStripe(Account $account): array
    {
        if (!$this->isConfigured() || !$account->stripe_customer_id) {
            return $this->subscriptions->serializeAccountPlan($account);
        }

        $this->client();

        $subscriptions = StripeSubscription::all([
            'customer' => $account->stripe_customer_id,
            'status' => 'all',
            'limit' => 10,
        ]);

        $priceId = config('stripe.price_id_premium');
        $applied = false;

        foreach ($subscriptions->data as $subscription) {
            $subPrice = $subscription->items->data[0]->price->id ?? null;
            if ($subPrice !== $priceId) {
                continue;
            }
            $this->applyStripeSubscription($account, $subscription);
            $applied = true;
            break;
        }

        if (!$applied) {
            $this->subscriptions->syncAccountPlanType($account);
        }

        return $this->subscriptions->serializeAccountPlan($account->fresh());
    }

    public function handleWebhookPayload(string $payload, ?string $signatureHeader): void
    {
        $secret = config('stripe.webhook_secret');

        if (!$secret) {
            Log::error('Stripe webhook rejected: STRIPE_WEBHOOK_SECRET is not set');

            throw new \RuntimeException('Webhook secret not configured.');
        }

        if (!$signatureHeader) {
            throw new \UnexpectedValueException('Missing Stripe-Signature header.');
        }

        $event = Webhook::constructEvent($payload, $signatureHeader, $secret);

        $type = $event->type ?? null;
        $object = $event->data->object ?? null;

        if (!$type || !$object) {
            return;
        }

        Log::info('Stripe webhook received', ['type' => $type]);

        match ($type) {
            'checkout.session.completed' => $this->onCheckoutCompleted($object),
            'customer.subscription.created',
            'customer.subscription.updated' => $this->onSubscriptionUpdated($object),
            'customer.subscription.deleted' => $this->onSubscriptionDeleted($object),
            'invoice.paid' => $this->onInvoicePaid($object),
            'invoice.payment_failed' => $this->onInvoicePaymentFailed($object),
            default => null,
        };
    }

    protected function onCheckoutCompleted(object $session): void
    {
        $account = $this->findAccountFromStripe($session);
        if (!$account || empty($session->subscription)) {
            return;
        }

        try {
            $this->client();
            $subscription = StripeSubscription::retrieve($session->subscription);
            $this->applyStripeSubscription($account, $subscription);
        } catch (ApiErrorException $e) {
            Log::error('Stripe checkout.session.completed failed', [
                'error' => $e->getMessage(),
            ]);
        }
    }

    protected function onSubscriptionUpdated(object $subscription): void
    {
        $account = $this->findAccountFromStripe($subscription);
        if (!$account) {
            return;
        }

        $this->applyStripeSubscription($account, $subscription);
    }

    protected function onSubscriptionDeleted(object $subscription): void
    {
        $account = $this->findAccountFromStripe($subscription);
        if (!$account) {
            return;
        }

        $this->expirePremiumByStripeId($account, $subscription->id ?? null, AccountSubscription::STATUS_CANCELLED);
        $this->subscriptions->syncAccountPlanType($account);
    }

    protected function onInvoicePaid(object $invoice): void
    {
        if (empty($invoice->subscription)) {
            return;
        }

        try {
            $this->client();
            $subscription = StripeSubscription::retrieve($invoice->subscription);
            $account = $this->findAccountFromStripe($subscription);
            if ($account) {
                $this->applyStripeSubscription($account, $subscription);
            }
        } catch (ApiErrorException $e) {
            Log::error('Stripe invoice.paid sync failed', ['error' => $e->getMessage()]);
        }
    }

    protected function onInvoicePaymentFailed(object $invoice): void
    {
        if (empty($invoice->subscription)) {
            return;
        }

        $account = Account::where('stripe_customer_id', $invoice->customer ?? '')->first();
        if (!$account) {
            return;
        }

        AccountSubscription::query()
            ->where('account_id', $account->id)
            ->where('stripe_subscription_id', $invoice->subscription)
            ->update([
                'stripe_status' => AccountSubscription::STRIPE_PAST_DUE,
            ]);

        Log::warning('Stripe invoice payment failed', [
            'account_id' => $account->id,
            'subscription_id' => $invoice->subscription,
        ]);
    }

    public function applyStripeSubscription(Account $account, object $subscription): ?AccountSubscription
    {
        $stripeStatus = (string) ($subscription->status ?? '');
        $cancelAtPeriodEnd = !empty($subscription->cancel_at_period_end);

        $startsAt = isset($subscription->current_period_start)
            ? Carbon::createFromTimestamp($subscription->current_period_start)
            : now();

        $endsAt = isset($subscription->current_period_end)
            ? Carbon::createFromTimestamp($subscription->current_period_end)
            : null;

        $priceId = $subscription->items->data[0]->price->id ?? config('stripe.price_id_premium');

        $grantsPremium = in_array($stripeStatus, [
            AccountSubscription::STRIPE_ACTIVE,
            AccountSubscription::STRIPE_TRIALING,
            AccountSubscription::STRIPE_PAST_DUE,
        ], true);

        if ($grantsPremium) {
            return $this->subscriptions->activatePremiumFromStripe(
                $account,
                $subscription->id,
                $priceId,
                $startsAt,
                $endsAt,
                $stripeStatus,
                $cancelAtPeriodEnd
            );
        }

        $this->expirePremiumByStripeId($account, $subscription->id ?? null, AccountSubscription::STATUS_EXPIRED);
        $this->subscriptions->syncAccountPlanType($account);

        return null;
    }

    protected function expirePremiumByStripeId(
        Account $account,
        ?string $stripeSubscriptionId,
        string $localStatus
    ): void {
        if (!$stripeSubscriptionId) {
            return;
        }

        AccountSubscription::query()
            ->where('account_id', $account->id)
            ->where('stripe_subscription_id', $stripeSubscriptionId)
            ->update([
                'status' => $localStatus,
                'ends_at' => now(),
                'stripe_status' => AccountSubscription::STRIPE_CANCELED,
                'cancel_at_period_end' => false,
            ]);
    }

    protected function findAccountFromStripe(object $stripeObject): ?Account
    {
        $accountId = $stripeObject->metadata->account_id
            ?? $stripeObject->client_reference_id
            ?? null;

        if ($accountId) {
            return Account::find($accountId);
        }

        $customerId = $stripeObject->customer ?? null;
        if ($customerId) {
            return Account::where('stripe_customer_id', $customerId)->first();
        }

        return null;
    }
}
