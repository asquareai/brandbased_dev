<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('account_subscriptions', function (Blueprint $table) {
            $table->string('stripe_status', 32)->nullable()->after('stripe_price_id');
            $table->boolean('cancel_at_period_end')->default(false)->after('stripe_status');
        });
    }

    public function down(): void
    {
        Schema::table('account_subscriptions', function (Blueprint $table) {
            $table->dropColumn(['stripe_status', 'cancel_at_period_end']);
        });
    }
};
