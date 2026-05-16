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
        Schema::create('brand_ai_prompts', function (Blueprint $table) {

            $table->uuid('id')->primary();

            $table->string('prompt_key')->unique();

            $table->string('prompt_name');

            $table->longText('prompt_content');

            $table->boolean('is_active')->default(true);

            $table->integer('version')->default(1);

            $table->timestamps();

        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('brand_ai_prompts');
    }
};