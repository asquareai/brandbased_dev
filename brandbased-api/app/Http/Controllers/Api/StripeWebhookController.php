<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\StripeBillingService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class StripeWebhookController extends Controller
{
    public function handle(Request $request, StripeBillingService $stripe)
    {
        $payload = $request->getContent();
        $signature = $request->header('Stripe-Signature');

        try {
            $stripe->handleWebhookPayload($payload, $signature);

            return response()->json(['received' => true]);
        } catch (\UnexpectedValueException $e) {
            Log::warning('Stripe webhook invalid payload', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Invalid payload'], 400);
        } catch (\Stripe\Exception\SignatureVerificationException $e) {
            Log::warning('Stripe webhook signature failed', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Invalid signature'], 400);
        } catch (\Throwable $e) {
            Log::error('Stripe webhook error', ['error' => $e->getMessage()]);

            return response()->json(['message' => 'Webhook handler failed'], 500);
        }
    }
}
