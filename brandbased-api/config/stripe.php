<?php

return [
    'secret' => env('STRIPE_SECRET'),
    'publishable_key' => env('STRIPE_KEY'),
    'webhook_secret' => env('STRIPE_WEBHOOK_SECRET'),

    /** Stripe Price ID for the Premium subscription (recurring). */
    'price_id_premium' => env('STRIPE_PRICE_ID_PREMIUM'),

    /** Optional legacy Payment Link if Checkout API is not configured. */
    'payment_link_url' => env('STRIPE_PAYMENT_LINK_URL'),

    'success_url' => env(
        'STRIPE_SUCCESS_URL',
        'http://127.0.0.1:5500/premium-subscription.html?stripe=success'
    ),
    'cancel_url' => env(
        'STRIPE_CANCEL_URL',
        'http://127.0.0.1:5500/premium-subscription.html?stripe=cancel'
    ),
    'portal_return_url' => env(
        'STRIPE_PORTAL_RETURN_URL',
        env(
            'STRIPE_CANCEL_URL',
            'http://127.0.0.1:5500/premium-subscription.html?stripe=portal'
        )
    ),
];
