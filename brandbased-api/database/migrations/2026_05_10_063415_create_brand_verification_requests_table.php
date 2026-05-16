<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('brand_verification_requests', function (Blueprint $table) {

            /*
            |--------------------------------------------------------------------------
            | Primary ID
            |--------------------------------------------------------------------------
            */

            $table->uuid('id')->primary();

            /*
            |--------------------------------------------------------------------------
            | Account Relation
            |--------------------------------------------------------------------------
            */

            $table->uuid('user_id');

            $table->foreign('user_id')
                ->references('id')
                ->on('accounts')
                ->onDelete('cascade');

            /*
            |--------------------------------------------------------------------------
            | Brand Details
            |--------------------------------------------------------------------------
            */

            $table->string('brand_unique_id', 120)->unique();

            $table->string('brand_name');

            $table->string('slug')->unique();

            $table->text('website_url')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Logo URLs
            |--------------------------------------------------------------------------
            */

            $table->text('logo_light_url')->nullable();

            $table->text('logo_dark_url')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Identity Verification
            |--------------------------------------------------------------------------
            */

            $table->string('identity_status')->default('pending');

            $table->integer('identity_progress')->default(0);

            $table->text('identity_verification_notes')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Meta Verification
            |--------------------------------------------------------------------------
            */

            $table->string('meta_status')->default('pending');

            $table->integer('meta_progress')->default(0);

            $table->text('meta_verification_notes')->nullable();

            /*
            |--------------------------------------------------------------------------
            | Final Status
            |--------------------------------------------------------------------------
            */

            $table->string('final_status')->default('pending');

            /*
            |--------------------------------------------------------------------------
            | Tracking
            |--------------------------------------------------------------------------
            */

            $table->timestamp('last_checked_at')->nullable();

            $table->timestamps();

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('brand_verification_requests');
    }
};