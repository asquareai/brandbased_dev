<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class BrandVerificationRequest extends Model
{
    use HasFactory;

    protected $table = 'brand_verification_requests';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [

        'id',
        'user_id',
        'brand_unique_id',
        'brand_name',
        'slug',
        'website_url',
        'logo_light_url',
        'logo_dark_url',
        'identity_status',
        'identity_progress',
        'identity_verification_notes',
        'meta_status',
        'meta_progress',
        'meta_verification_notes',
        'final_status',
        'last_checked_at',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {

            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }

        });
    }
}