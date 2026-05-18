<?php

namespace App\Services;

use App\Mail\OtpCodeMail;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Throwable;

class OtpDeliveryService
{
    public function send(string $email, string $otp, string $purposeLabel): void
    {
        Mail::to($email)->send(new OtpCodeMail(
            otp: $otp,
            purposeLabel: $purposeLabel,
            expiresMinutes: 10,
        ));
    }

    public function sendOrFail(string $email, string $otp, string $purposeLabel): void
    {
        try {
            $this->send($email, $otp, $purposeLabel);
        } catch (Throwable $e) {
            Log::error('OTP email failed', [
                'email' => $email,
                'purpose' => $purposeLabel,
                'error' => $e->getMessage(),
            ]);

            throw $e;
        }
    }

    public static function generateCode(): string
    {
        return str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    }
}
