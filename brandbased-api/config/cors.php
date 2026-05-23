<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => array_filter([
        'http://127.0.0.1:5500',
        'http://localhost:5500',
        env('FRONTEND_ORIGIN'),
        'https://brandbased.ai',
        'https://www.brandbased.ai',
    ]),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,
];
