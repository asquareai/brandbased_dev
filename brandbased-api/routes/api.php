<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\BrandVerificationRequestController;
use App\Http\Controllers\Api\InternalBrandVerificationController;
use App\Http\Controllers\Api\InternalBrandAiPromptController;
use App\Http\Controllers\Api\BrandAiPromptController;

Route::get('/internal/brand-ai-prompts/{promptKey}', [InternalBrandAiPromptController::class, 'show']);

Route::post('/auth/signup/send-otp', [AuthController::class, 'sendSignupOtp']);
Route::post('/auth/signup/verify-otp', [AuthController::class, 'verifySignupOtp']);
Route::post('/auth/signup/finish', [AuthController::class, 'finishSignup']);    
Route::post('/auth/login', [AuthController::class, 'login']);
Route::middleware('auth:sanctum')->get('/auth/me', [AuthController::class, 'me']);
Route::middleware('auth:sanctum')->post('/auth/verify-pin', [AuthController::class, 'verifyPin']);
Route::post('/auth/reset-pin/send-otp', [AuthController::class, 'sendResetPinOtp']);
Route::post('/auth/reset-pin/verify-otp', [AuthController::class, 'verifyResetPinOtp']);
Route::post('/auth/reset-pin/update', [AuthController::class, 'updateResetPin']);


Route::middleware('auth:sanctum')->group(function () {
    Route::post('/brand-verification-requests', [BrandVerificationRequestController::class, 'store']);
    Route::get('/brand-verification-requests/{id}/status', [BrandVerificationRequestController::class, 'status']);

    Route::get('/brand-ai-prompts/{promptKey}', [BrandAiPromptController::class, 'show']);
    Route::put('/brand-ai-prompts/{promptKey}', [BrandAiPromptController::class, 'upsert']);
});


Route::prefix('internal/brand-verification')->group(function () {
    Route::get('/pending', [InternalBrandVerificationController::class, 'pending']);
    Route::post('/{id}/claim', [InternalBrandVerificationController::class, 'claim']);
    Route::post('/{id}/status', [InternalBrandVerificationController::class, 'updateStatus']);
});

Route::get('/internal/brand-ai-prompts/{promptKey}', [InternalBrandAiPromptController::class, 'show']);