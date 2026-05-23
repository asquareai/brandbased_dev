<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->string('stripe_customer_id')->nullable()->unique()->after('plan_type');
        });

        Schema::table('account_subscriptions', function (Blueprint $table) {
            $table->string('stripe_subscription_id')->nullable()->after('status');
            $table->string('stripe_price_id')->nullable()->after('stripe_subscription_id');
            $table->index('stripe_subscription_id');
        });
    }

    public function down(): void
    {
        Schema::table('accounts', function (Blueprint $table) {
            $table->dropColumn('stripe_customer_id');
        });

        Schema::table('account_subscriptions', function (Blueprint $table) {
            $table->dropIndex(['stripe_subscription_id']);
            $table->dropColumn(['stripe_subscription_id', 'stripe_price_id']);
        });
    }
};
