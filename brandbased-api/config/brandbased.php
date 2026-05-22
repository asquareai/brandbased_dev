<?php

return [

    /*
    |--------------------------------------------------------------------------
    | BrandBased website verification (meta tag + runtime script)
    |--------------------------------------------------------------------------
    */

    'cdn_runtime_script' => env(
        'BRANDBASED_CDN_RUNTIME_SCRIPT',
        'https://cdn.brandbased.ai/runtime/v1.js'
    ),

    'meta_verification_timeout' => (int) env('BRANDBASED_META_VERIFY_TIMEOUT', 25),

];
