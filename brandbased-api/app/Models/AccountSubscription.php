<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class AccountSubscription extends Model
{
    public const PLAN_FREEMIUM = 'freemium';
    public const PLAN_PREMIUM = 'premium';

    public const STATUS_ACTIVE = 'active';
    public const STATUS_EXPIRED = 'expired';
    public const STATUS_CANCELLED = 'cancelled';

    /** Stripe subscription.status values we persist for UI / support. */
    public const STRIPE_ACTIVE = 'active';
    public const STRIPE_TRIALING = 'trialing';
    public const STRIPE_PAST_DUE = 'past_due';
    public const STRIPE_CANCELED = 'canceled';
    public const STRIPE_UNPAID = 'unpaid';

    protected $table = 'account_subscriptions';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'account_id',
        'plan_type',
        'starts_at',
        'ends_at',
        'status',
        'stripe_subscription_id',
        'stripe_price_id',
        'stripe_status',
        'cancel_at_period_end',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at' => 'datetime',
        'cancel_at_period_end' => 'boolean',
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

    public function account()
    {
        return $this->belongsTo(Account::class, 'account_id');
    }

    public function isActiveAt(?\DateTimeInterface $at = null): bool
    {
        if ($this->status !== self::STATUS_ACTIVE) {
            return false;
        }

        $at = $at ? \Carbon\Carbon::parse($at) : now();

        if ($this->starts_at && $this->starts_at->gt($at)) {
            return false;
        }

        if ($this->ends_at && $this->ends_at->lte($at)) {
            return false;
        }

        return true;
    }
}
