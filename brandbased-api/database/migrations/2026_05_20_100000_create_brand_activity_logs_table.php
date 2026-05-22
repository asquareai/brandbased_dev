<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('brand_activity_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->foreign('user_id')
                ->references('id')
                ->on('accounts')
                ->onDelete('cascade');

            $table->uuid('brand_id')->nullable();
            $table->uuid('brand_verification_request_id')->nullable();

            $table->string('action', 32);
            $table->string('brand_unique_id', 120)->nullable();
            $table->string('brand_name')->nullable();
            $table->string('slug')->nullable();
            $table->text('website_url')->nullable();
            $table->text('logo_light_url')->nullable();
            $table->text('logo_dark_url')->nullable();
            $table->boolean('is_published')->nullable();
            $table->timestamp('verified_at')->nullable();
            $table->json('metadata')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index(['user_id', 'created_at']);
            $table->index(['brand_id', 'created_at']);
            $table->index(['action', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('brand_activity_logs');
    }
};
