<?php

namespace App\Models;

use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Support\Str;
use Laravel\Sanctum\HasApiTokens;

class Account extends Authenticatable
{
    use HasApiTokens;

    protected $table = 'accounts';

    protected $keyType = 'string';
    public $incrementing = false;

    protected $fillable = [
        'id',
        'email',
        'password',
        'pin_code',
        'account_status',
        'plan_type',
        'stripe_customer_id',
        'email_verified_at',
        'last_login_at'
    ];

    protected $hidden = [
        'password',
        'pin_code',
    ];

    public function subscriptions()
    {
        return $this->hasMany(AccountSubscription::class, 'account_id');
    }

    protected static function boot()
    {
        parent::boot();

        static::creating(function ($model) {
            if (!$model->id) {
                $model->id = (string) Str::uuid();
            }
        });
    }
}