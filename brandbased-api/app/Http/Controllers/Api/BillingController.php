<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AccountSubscriptionService;
use App\Services\StripeBillingService;
use Illuminate\Http\Request;

class BillingController extends Controller
{
    public function checkoutSession(
        Request $request,
        StripeBillingService $stripe,
        AccountSubscriptionService $subscriptions
    ) {
        $account = $request->user();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'User session not found.',
            ], 401);
        }

        if ($subscriptions->accountHasActivePremium($account)) {
            return response()->json([
                'status' => false,
                'message' => 'You already have an active Premium subscription.',
            ], 409);
        }

        $request->validate([
            'success_url' => 'nullable|url',
            'cancel_url' => 'nullable|url',
        ]);

        $returnUrls = array_filter([
            'success_url' => $request->input('success_url'),
            'cancel_url' => $request->input('cancel_url'),
        ]);

        try {
            $session = $stripe->createCheckoutSession($account, $returnUrls);

            return response()->json([
                'status' => true,
                'checkout_url' => $session['url'],
                'session_id' => $session['session_id'],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 503);
        }
    }

    public function portalSession(Request $request, StripeBillingService $stripe)
    {
        $account = $request->user();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'User session not found.',
            ], 401);
        }

        $request->validate([
            'return_url' => 'nullable|url',
        ]);

        try {
            $session = $stripe->createBillingPortalSession(
                $account,
                $request->input('return_url')
            );

            return response()->json([
                'status' => true,
                'portal_url' => $session['url'],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 503);
        }
    }

    public function syncCheckoutSession(Request $request, StripeBillingService $stripe)
    {
        $request->validate([
            'session_id' => 'required|string|max:255',
        ]);

        $account = $request->user();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'User session not found.',
            ], 401);
        }

        try {
            $plan = $stripe->syncCheckoutSession($request->session_id, $account);

            return response()->json([
                'status' => true,
                'message' => 'Subscription synced.',
                'subscription' => $plan,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function refreshSubscription(Request $request, StripeBillingService $stripe)
    {
        $account = $request->user();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'User session not found.',
            ], 401);
        }

        try {
            $plan = $stripe->refreshSubscriptionFromStripe($account);

            return response()->json([
                'status' => true,
                'message' => 'Subscription status refreshed.',
                'subscription' => $plan,
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'status' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    public function config(StripeBillingService $stripe)
    {
        return response()->json([
            'status' => true,
            'stripe' => [
                'configured' => $stripe->isConfigured(),
                'publishable_key' => config('stripe.publishable_key'),
                'webhook_required' => empty(config('stripe.webhook_secret')),
            ],
        ]);
    }
}
