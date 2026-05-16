<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Str;

class BrandAiPrompt extends Model
{
    use HasFactory;

    protected $table = 'brand_ai_prompts';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'prompt_key',
        'prompt_name',
        'prompt_content',
        'is_active',
        'version',
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