<?php

namespace App\Services;

use App\Models\Brand;
use App\Models\BrandActivityLog;

class BrandActivityLogger
{
    public function log(Brand $brand, string $action, array $metadata = []): BrandActivityLog
    {
        return BrandActivityLog::create([
            'user_id' => $brand->user_id,
            'brand_id' => $brand->id,
            'brand_verification_request_id' => $brand->brand_verification_request_id,
            'action' => $action,
            'brand_unique_id' => $brand->brand_unique_id,
            'brand_name' => $brand->brand_name,
            'slug' => $brand->slug,
            'website_url' => $brand->website_url,
            'logo_light_url' => $brand->logo_light_url,
            'logo_dark_url' => $brand->logo_dark_url,
            'is_published' => $brand->is_published,
            'verified_at' => $brand->verified_at,
            'metadata' => empty($metadata) ? null : $metadata,
        ]);
    }

    /**
     * After the brand row is removed, keep brand_id null but retain snapshot fields.
     */
    public function logDeletedSnapshot(Brand $brand, array $metadata = []): BrandActivityLog
    {
        return BrandActivityLog::create([
            'user_id' => $brand->user_id,
            'brand_id' => null,
            'brand_verification_request_id' => $brand->brand_verification_request_id,
            'action' => BrandActivityLog::ACTION_DELETED,
            'brand_unique_id' => $brand->brand_unique_id,
            'brand_name' => $brand->brand_name,
            'slug' => $brand->slug,
            'website_url' => $brand->website_url,
            'logo_light_url' => $brand->logo_light_url,
            'logo_dark_url' => $brand->logo_dark_url,
            'is_published' => $brand->is_published,
            'verified_at' => $brand->verified_at,
            'metadata' => array_merge(
                ['deleted_brand_id' => $brand->id],
                $metadata
            ),
        ]);
    }
}
