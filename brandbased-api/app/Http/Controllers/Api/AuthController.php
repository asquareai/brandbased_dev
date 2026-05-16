<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Account;
use App\Models\AccountRegistration;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use App\Models\AccountOtp;

class AuthController extends Controller
{
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

        $otp = rand(100000, 999999);

        AccountRegistration::updateOrCreate(
            ['email' => $email],
            [
                'otp_code' => $otp,
                'otp_expires_at' => now()->addMinutes(10),
                'otp_verified_at' => null,
                'otp_attempts' => 0,
            ]
        );

        return response()->json([
            'status' => true,
            'message' => 'OTP sent successfully.',
            'otp' => $otp // remove later after email setup
        ]);
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

        $otp = rand(100000, 999999);

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

        return response()->json([
            'status' => true,
            'message' => 'OTP sent successfully.',
            'otp' => $otp // remove after email setup
        ]);
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
}