<?php

namespace App\Mail;

use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class OtpCodeMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public string $otp,
        public string $purposeLabel,
        public int $expiresMinutes = 10,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "{$this->purposeLabel} — your verification code",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.otp-code',
        );
    }
}
