<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

return new class extends Migration
{
    public function up(): void
    {
        $accounts = DB::table('accounts')->select('id')->get();
        $now = now();

        foreach ($accounts as $account) {
            $hasActive = DB::table('account_subscriptions')
                ->where('account_id', $account->id)
                ->where('status', 'active')
                ->where(function ($q) use ($now) {
                    $q->whereNull('ends_at')->orWhere('ends_at', '>', $now);
                })
                ->exists();

            if ($hasActive) {
                continue;
            }

            DB::table('account_subscriptions')->insert([
                'id' => (string) Str::uuid(),
                'account_id' => $account->id,
                'plan_type' => 'freemium',
                'starts_at' => $now,
                'ends_at' => null,
                'status' => 'active',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // No-op: baseline rows may already be referenced.
    }
};
