<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\AccountRegistration;
use App\Models\AccountOtp;
use App\Services\OtpDeliveryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;

class AuthController extends Controller
{
    private function isLocalApiRequest(Request $request): bool
    {
        return in_array($request->ip(), ['127.0.0.1', '::1'], true);
    }

    /** Success JSON, or 503 when email fails (local API may still return OTP for dev). */
    private function otpDeliveryResponse(
        Request $request,
        string $otp,
        bool $mailSent,
        string $successMessage = 'OTP sent successfully. Check your email.',
    ): JsonResponse {
        if (!$mailSent) {
            if ($this->isLocalApiRequest($request)) {
                Log::warning('OTP email failed on local API; returning OTP in response for dev');

                return response()->json([
                    'status' => true,
                    'message' => 'OTP ready for local testing (email could not be sent).',
                    'otp' => $otp,
                ]);
            }

            return response()->json([
                'status' => false,
                'message' => 'Unable to send verification email. Please try again later.',
            ], 503);
        }

        $payload = [
            'status' => true,
            'message' => $successMessage,
        ];

        if (config('app.debug')) {
            $payload['otp'] = $otp;
        }

        return response()->json($payload);
    }

    public function sendSignupOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email|max:255',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $email = strtolower(trim($request->email));

        $existingAccount = Account::where('email', $email)->first();

        if ($existingAccount) {
            return response()->json([
                'status' => false,
                'message' => 'This email is already registered. Please login.'
            ], 409);
        }

        $otp = OtpDeliveryService::generateCode();

        AccountRegistration::updateOrCreate(
            ['email' => $email],
            [
                'otp_code' => $otp,
                'otp_expires_at' => now()->addMinutes(10),
                'otp_verified_at' => null,
                'otp_attempts' => 0,
            ]
        );

        $mailSent = true;
        try {
            app(OtpDeliveryService::class)->sendOrFail(
                $email,
                $otp,
                'BrandBased account signup'
            );
        } catch (\Throwable $e) {
            $mailSent = false;
        }

        return $this->otpDeliveryResponse($request, $otp, $mailSent);
    }
    public function verifySignupOtp(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'otp' => 'required|digits:6',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $email = strtolower(trim($request->email));
        $otp = $request->otp;

        $record = AccountRegistration::where('email', $email)->first();

        if (!$record) {
            return response()->json([
                'status' => false,
                'message' => 'No OTP request found.'
            ], 404);
        }

        if ($record->otp_attempts >= 5) {
            return response()->json([
                'status' => false,
                'message' => 'Too many attempts. Try again later.'
            ], 429);
        }

        if ($record->otp_expires_at < now()) {
            return response()->json([
                'status' => false,
                'message' => 'OTP expired.'
            ], 410);
        }

        if ($record->otp_code !== $otp) {
            $record->increment('otp_attempts');

            return response()->json([
                'status' => false,
                'message' => 'Invalid OTP.'
            ], 401);
        }

        $record->update([
            'otp_verified_at' => now()
        ]);

        return response()->json([
            'status' => true,
            'message' => 'OTP verified successfully.'
        ]);
    }
    public function finishSignup(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|min:6|confirmed',
            'pin_code' => 'nullable|digits:6',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $email = strtolower(trim($request->email));

        $existingAccount = Account::where('email', $email)->first();

        if ($existingAccount) {
            return response()->json([
                'status' => false,
                'message' => 'This email is already registered. Please login.'
            ], 409);
        }

        $registration = AccountRegistration::where('email', $email)->first();

        if (!$registration || !$registration->otp_verified_at) {
            return response()->json([
                'status' => false,
                'message' => 'Please verify OTP before creating password.'
            ], 403);
        }

        $account = Account::create([
            'email' => $email,
            'password' => bcrypt($request->password),
            'pin_code' => $request->pin_code ? bcrypt($request->pin_code) : null,
            'account_status' => 'active',
            'plan_type' => 'freemium',
            'email_verified_at' => now(),
        ]);

        $registration->delete();

        return response()->json([
            'status' => true,
            'message' => 'Account created successfully.',
            'account' => [
                'id' => $account->id,
                'email' => $account->email,
                'plan_type' => $account->plan_type,
                'account_status' => $account->account_status,
            ]
        ]);
    }
    public function login(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $email = strtolower(trim($request->email));

        $account = Account::where('email', $email)->first();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'Account not found.'
            ], 404);
        }

        if (!\Hash::check($request->password, $account->password)) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid password.'
            ], 401);
        }

        if ($account->account_status !== 'active') {
            return response()->json([
                'status' => false,
                'message' => 'Account is blocked.'
            ], 403);
        }

        $account->update([
            'last_login_at' => now()
        ]);
        $token = $account->createToken('brandbased_account_token')->plainTextToken;
        return response()->json([
            'status' => true,
            'message' => 'Login successful.',
            'token' => $token,
            'account' => [
                'id' => $account->id,
                'email' => $account->email,
                'plan_type' => $account->plan_type
            ]
        ]);
    }
    public function me(Request $request)
    {
        return response()->json([
            'status' => true,
            'account' => [
                'id' => $request->user()->id,
                'email' => $request->user()->email,
                'plan_type' => $request->user()->plan_type,
                'account_status' => $request->user()->account_status,
                'has_pin' => !empty($request->user()->pin_code),
            ]
        ]);
    }
    public function verifyPin(Request $request)
    {
        $request->validate([
            'pin_code' => 'required|digits:6',
        ]);

        $account = $request->user();

        if (!$account->pin_code) {
            return response()->json([
                'status' => true,
                'message' => 'No PIN set.'
            ]);
        }

        if (!\Hash::check($request->pin_code, $account->pin_code)) {
            return response()->json([
                'status' => false,
                'message' => 'Invalid PIN.'
            ], 401);
        }

        return response()->json([
            'status' => true,
            'message' => 'PIN verified.'
        ]);
    }
    public function sendResetPinOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = strtolower(trim($request->email));

        $account = Account::where('email', $email)->first();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'Account not found.'
            ], 404);
        }

        $otp = OtpDeliveryService::generateCode();

        AccountOtp::updateOrCreate(
            [
                'email' => $email,
                'purpose' => 'pin_reset',
            ],
            [
                'account_id' => $account->id,
                'otp_code' => $otp,
                'otp_expires_at' => now()->addMinutes(10),
                'otp_verified_at' => null,
                'otp_attempts' => 0,
            ]
        );

        $mailSent = true;
        try {
            app(OtpDeliveryService::class)->sendOrFail(
                $email,
                $otp,
                'BrandBased PIN reset'
            );
        } catch (\Throwable $e) {
            $mailSent = false;
        }

        return $this->otpDeliveryResponse($request, $otp, $mailSent);
    }
    public function verifyResetPinOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|digits:6',
        ]);

        $email = strtolower(trim($request->email));

        $record = AccountOtp::where('email', $email)
            ->where('purpose', 'pin_reset')
            ->first();

        if (!$record) {
            return response()->json([
                'status' => false,
                'message' => 'No OTP request found.'
            ], 404);
        }

        if ($record->otp_attempts >= 5) {
            return response()->json([
                'status' => false,
                'message' => 'Too many attempts. Try again later.'
            ], 429);
        }

        if ($record->otp_expires_at < now()) {
            return response()->json([
                'status' => false,
                'message' => 'OTP expired.'
            ], 410);
        }

        if ($record->otp_code !== $request->otp) {
            $record->increment('otp_attempts');

            return response()->json([
                'status' => false,
                'message' => 'Invalid OTP.'
            ], 401);
        }

        $record->update([
            'otp_verified_at' => now()
        ]);

        return response()->json([
            'status' => true,
            'message' => 'OTP verified successfully.'
        ]);
    }
    public function updateResetPin(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'pin_code' => 'required|digits:6',
        ]);

        $email = strtolower(trim($request->email));

        $otpRecord = AccountOtp::where('email', $email)
            ->where('purpose', 'pin_reset')
            ->first();

        if (!$otpRecord || !$otpRecord->otp_verified_at) {
            return response()->json([
                'status' => false,
                'message' => 'Please verify OTP first.'
            ], 403);
        }

        $account = Account::where('email', $email)->first();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'Account not found.'
            ], 404);
        }

        $account->update([
            'pin_code' => bcrypt($request->pin_code)
        ]);

        $otpRecord->delete();

        return response()->json([
            'status' => true,
            'message' => 'PIN updated successfully.'
        ]);
    }

    public function sendResetPasswordOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
        ]);

        $email = strtolower(trim($request->email));

        $account = Account::where('email', $email)->first();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'Account not found.'
            ], 404);
        }

        $otp = OtpDeliveryService::generateCode();

        AccountOtp::updateOrCreate(
            [
                'email' => $email,
                'purpose' => 'password_reset',
            ],
            [
                'account_id' => $account->id,
                'otp_code' => $otp,
                'otp_expires_at' => now()->addMinutes(10),
                'otp_verified_at' => null,
                'otp_attempts' => 0,
            ]
        );

        $mailSent = true;
        try {
            app(OtpDeliveryService::class)->sendOrFail(
                $email,
                $otp,
                'BrandBased password reset'
            );
        } catch (\Throwable $e) {
            $mailSent = false;
        }

        return $this->otpDeliveryResponse($request, $otp, $mailSent);
    }

    public function verifyResetPasswordOtp(Request $request)
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|digits:6',
        ]);

        $email = strtolower(trim($request->email));

        $record = AccountOtp::where('email', $email)
            ->where('purpose', 'password_reset')
            ->first();

        if (!$record) {
            return response()->json([
                'status' => false,
                'message' => 'No OTP request found.'
            ], 404);
        }

        if ($record->otp_attempts >= 5) {
            return response()->json([
                'status' => false,
                'message' => 'Too many attempts. Try again later.'
            ], 429);
        }

        if ($record->otp_expires_at < now()) {
            return response()->json([
                'status' => false,
                'message' => 'OTP expired.'
            ], 410);
        }

        if ($record->otp_code !== $request->otp) {
            $record->increment('otp_attempts');

            return response()->json([
                'status' => false,
                'message' => 'Invalid OTP.'
            ], 401);
        }

        $record->update([
            'otp_verified_at' => now()
        ]);

        return response()->json([
            'status' => true,
            'message' => 'OTP verified successfully.'
        ]);
    }

    public function updateResetPassword(Request $request)
    {
        $validator = Validator::make($request->all(), [
            'email' => 'required|email',
            'password' => 'required|min:6|confirmed',
        ]);

        if ($validator->fails()) {
            return response()->json([
                'status' => false,
                'message' => $validator->errors()->first()
            ], 422);
        }

        $email = strtolower(trim($request->email));

        $otpRecord = AccountOtp::where('email', $email)
            ->where('purpose', 'password_reset')
            ->first();

        if (!$otpRecord || !$otpRecord->otp_verified_at) {
            return response()->json([
                'status' => false,
                'message' => 'Please verify OTP first.'
            ], 403);
        }

        $account = Account::where('email', $email)->first();

        if (!$account) {
            return response()->json([
                'status' => false,
                'message' => 'Account not found.'
            ], 404);
        }

        $account->update([
            'password' => bcrypt($request->password),
        ]);

        $otpRecord->delete();

        return response()->json([
            'status' => true,
            'message' => 'Password updated successfully. You can log in now.'
        ]);
    }
}