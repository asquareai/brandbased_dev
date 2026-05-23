<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class Brand extends Model
{
    use HasFactory;

    protected $table = 'brands';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'user_id',
        'brand_verification_request_id',
        'brand_unique_id',
        'brand_name',
        'slug',
        'website_url',
        'logo_light_url',
        'logo_dark_url',
        'verified_at',
        'is_published',
        'created_under_plan',
        'settings',
    ];

    protected $casts = [
        'verified_at' => 'datetime',
        'is_published' => 'boolean',
        'settings' => 'array',
    ];

    public function resolvedSettings(): array
    {
        return \App\Services\BrandSettingsNormalizer::merge($this->settings);
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
        });
    }

    public function verificationRequest()
    {
        return $this->belongsTo(BrandVerificationRequest::class, 'brand_verification_request_id');
    }
}
