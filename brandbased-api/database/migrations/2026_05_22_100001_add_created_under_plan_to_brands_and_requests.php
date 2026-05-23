<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('brand_verification_requests', function (Blueprint $table) {
            $table->enum('created_under_plan', ['freemium', 'premium'])
                ->default('freemium')
                ->after('final_status');
        });

        Schema::table('brands', function (Blueprint $table) {
            $table->enum('created_under_plan', ['freemium', 'premium'])
                ->default('freemium')
                ->after('is_published');
        });
    }

    public function down(): void
    {
        Schema::table('brand_verification_requests', function (Blueprint $table) {
            $table->dropColumn('created_under_plan');
        });

        Schema::table('brands', function (Blueprint $table) {
            $table->dropColumn('created_under_plan');
        });
    }
};
