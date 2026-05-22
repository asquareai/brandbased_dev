<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class BrandActivityLog extends Model
{
    use HasFactory;

    public const ACTION_CREATED = 'created';
    public const ACTION_PUBLISHED = 'published';
    public const ACTION_UNPUBLISHED = 'unpublished';
    public const ACTION_DELETED = 'deleted';

    protected $table = 'brand_activity_logs';

    public $incrementing = false;

    protected $keyType = 'string';

    public $timestamps = false;

    protected $fillable = [
        'id',
        'user_id',
        'brand_id',
        'brand_verification_request_id',
        'action',
        'brand_unique_id',
        'brand_name',
        'slug',
        'website_url',
        'logo_light_url',
        'logo_dark_url',
        'is_published',
        'verified_at',
        'metadata',
        'created_at',
    ];

    protected $casts = [
        'is_published' => 'boolean',
        'verified_at' => 'datetime',
        'metadata' => 'array',
        'created_at' => 'datetime',
    ];

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (empty($model->id)) {
                $model->id = (string) Str::uuid();
            }
            if (empty($model->created_at)) {
                $model->created_at = now();
            }
        });
    }

    public function brand()
    {
        return $this->belongsTo(Brand::class);
    }
}
