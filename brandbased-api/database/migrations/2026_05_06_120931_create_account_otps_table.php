<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_otps', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->uuid('account_id')->nullable();
            $table->string('email');

            $table->string('otp_code');
            $table->enum('purpose', [
                'password_reset',
                'pin_reset',
                'email_change',
                'two_factor'
            ]);

            $table->timestamp('otp_expires_at');
            $table->timestamp('otp_verified_at')->nullable();
            $table->unsignedTinyInteger('otp_attempts')->default(0);

            $table->timestamps();

            $table->index(['email', 'purpose']);
            $table->foreign('account_id')->references('id')->on('accounts')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('account_otps');
    }
};