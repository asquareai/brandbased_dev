<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('password_reset_otps', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->uuid('account_id');
            $table->string('email');

            $table->string('otp_code');
            $table->timestamp('otp_expires_at');
            $table->timestamp('otp_verified_at')->nullable();
            $table->unsignedTinyInteger('otp_attempts')->default(0);

            $table->timestamps();

            $table->foreign('account_id')->references('id')->on('accounts')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('password_reset_otps');
    }
};