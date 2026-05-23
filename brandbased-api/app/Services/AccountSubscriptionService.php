<?php

namespace App\Services;

use App\Models\Account;
use App\Models\AccountSubscription;
use Illuminate\Support\Carbon;

class AccountSubscriptionService
{
    public function ensureFreemiumBaseline(Account $account): AccountSubscription
    {
        $existing = AccountSubscription::query()
            ->where('account_id', $account->id)
            ->where('plan_type', AccountSubscription::PLAN_FREEMIUM)
            ->where('status', AccountSubscription::STATUS_ACTIVE)
            ->where(function ($q) {
                $q->whereNull('ends_at')->orWhere('ends_at', '>', now());
            })
            ->orderByDesc('starts_at')
            ->first();

        if ($existing) {
            return $existing;
        }

        return AccountSubscription::create([
            'account_id' => $account->id,
            'plan_type' => AccountSubscription::PLAN_FREEMIUM,
            'starts_at' => now(),
            'ends_at' => null,
            'status' => AccountSubscription::STATUS_ACTIVE,
        ]);
    }

    public function getActivePremiumSubscription(Account $account): ?AccountSubscription
    {
        return AccountSubscription::query()
            ->where('account_id', $account->id)
            ->where('plan_type', AccountSubscription::PLAN_PREMIUM)
            ->where('status', AccountSubscription::STATUS_ACTIVE)
            ->where('starts_at', '<=', now())
            ->where(function ($q) {
                $q->whereNull('ends_at')->orWhere('ends_at', '>', now());
            })
            ->orderByDesc('starts_at')
            ->first();
    }

    public function effectivePlanType(Account $account): string
    {
        return $this->getActivePremiumSubscription($account)
            ? AccountSubscription::PLAN_PREMIUM
            : AccountSubscription::PLAN_FREEMIUM;
    }

    public function accountHasActivePremium(Account $account): bool
    {
        return $this->effectivePlanType($account) === AccountSubscription::PLAN_PREMIUM;
    }

    public function syncAccountPlanType(Account $account): Account
    {
        $plan = $this->effectivePlanType($account);

        if ($account->plan_type !== $plan) {
            $account->update(['plan_type' => $plan]);
            $account->refresh();
        }

        return $account;
    }

    /** @return array<int, array<string, mixed>> */
    public function listSubscriptions(Account $account): array
    {
        $this->ensureFreemiumBaseline($account);

        return AccountSubscription::query()
            ->where('account_id', $account->id)
            ->orderByDesc('starts_at')
            ->get()
            ->map(function (AccountSubscription $row) {
                return [
                    'id' => $row->id,
                    'plan_type' => $row->plan_type,
                    'starts_at' => $row->starts_at?->toIso8601String(),
                    'ends_at' => $row->ends_at?->toIso8601String(),
                    'status' => $row->status,
                    'stripe_status' => $row->stripe_status,
                    'cancel_at_period_end' => (bool) $row->cancel_at_period_end,
                    'is_active' => $row->isActiveAt(),
                ];
            })
            ->values()
            ->all();
    }

    public function serializeAccountPlan(Account $account): array
    {
        $this->ensureFreemiumBaseline($account);
        $account = $this->syncAccountPlanType($account);

        $premium = $this->getActivePremiumSubscription($account);

        return [
            'plan_type' => $account->plan_type,
            'is_premium' => $account->plan_type === AccountSubscription::PLAN_PREMIUM,
            'billing_interval' => 'monthly',
            'can_manage_billing' => !empty($account->stripe_customer_id),
            'active_premium' => $premium ? [
                'id' => $premium->id,
                'starts_at' => $premium->starts_at?->toIso8601String(),
                'ends_at' => $premium->ends_at?->toIso8601String(),
                'stripe_status' => $premium->stripe_status,
                'cancel_at_period_end' => (bool) $premium->cancel_at_period_end,
                'status_label' => $this->premiumStatusLabel($premium),
            ] : null,
            'subscriptions' => $this->listSubscriptions($account),
        ];
    }

    public function premiumStatusLabel(AccountSubscription $premium): string
    {
        if ($premium->stripe_status === AccountSubscription::STRIPE_PAST_DUE) {
            return 'Payment issue — update billing in Stripe';
        }
        if ($premium->cancel_at_period_end && $premium->ends_at) {
            return 'Cancels on ' . $premium->ends_at->format('M j, Y');
        }
        if ($premium->ends_at) {
            return 'Renews ' . $premium->ends_at->format('M j, Y');
        }

        return 'Active';
    }

    public function grantPremium(
        Account $account,
        Carbon $startsAt,
        ?Carbon $endsAt = null
    ): AccountSubscription {
        return $this->activatePremiumFromStripe(
            $account,
            null,
            null,
            $startsAt,
            $endsAt,
            AccountSubscription::STRIPE_ACTIVE,
            false
        );
    }

    public function activatePremiumFromStripe(
        Account $account,
        ?string $stripeSubscriptionId,
        ?string $stripePriceId,
        Carbon $startsAt,
        ?Carbon $endsAt = null,
        ?string $stripeStatus = null,
        bool $cancelAtPeriodEnd = false
    ): AccountSubscription {
        AccountSubscription::query()
            ->where('account_id', $account->id)
            ->where('plan_type', AccountSubscription::PLAN_PREMIUM)
            ->where('status', AccountSubscription::STATUS_ACTIVE)
            ->when($stripeSubscriptionId, function ($q) use ($stripeSubscriptionId) {
                $q->where('stripe_subscription_id', '!=', $stripeSubscriptionId);
            })
            ->update([
                'status' => AccountSubscription::STATUS_EXPIRED,
                'ends_at' => now(),
            ]);

        if ($stripeSubscriptionId) {
            $existing = AccountSubscription::query()
                ->where('stripe_subscription_id', $stripeSubscriptionId)
                ->first();

            if ($existing) {
                $existing->update([
                    'account_id' => $account->id,
                    'plan_type' => AccountSubscription::PLAN_PREMIUM,
                    'starts_at' => $startsAt,
                    'ends_at' => $endsAt,
                    'status' => AccountSubscription::STATUS_ACTIVE,
                    'stripe_price_id' => $stripePriceId,
                    'stripe_status' => $stripeStatus,
                    'cancel_at_period_end' => $cancelAtPeriodEnd,
                ]);
                $this->syncAccountPlanType($account);

                return $existing->fresh();
            }
        }

        $row = AccountSubscription::create([
            'account_id' => $account->id,
            'plan_type' => AccountSubscription::PLAN_PREMIUM,
            'starts_at' => $startsAt,
            'ends_at' => $endsAt,
            'status' => AccountSubscription::STATUS_ACTIVE,
            'stripe_subscription_id' => $stripeSubscriptionId,
            'stripe_price_id' => $stripePriceId,
            'stripe_status' => $stripeStatus,
            'cancel_at_period_end' => $cancelAtPeriodEnd,
        ]);

        $this->syncAccountPlanType($account);

        return $row;
    }
}
