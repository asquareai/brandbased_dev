<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $purposeLabel }}</title>
</head>
<body style="font-family: Arial, Helvetica, sans-serif; line-height: 1.5; color: #111; max-width: 520px; margin: 0 auto; padding: 24px;">
    <p style="margin: 0 0 16px;">Hello,</p>
    <p style="margin: 0 0 16px;">Use this code for <strong>{{ $purposeLabel }}</strong>:</p>
    <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; margin: 24px 0; color: #1030f5;">{{ $otp }}</p>
    <p style="margin: 0 0 8px; color: #444;">This code expires in {{ $expiresMinutes }} minutes.</p>
    <p style="margin: 16px 0 0; color: #666; font-size: 13px;">If you did not request this, you can ignore this email.</p>
    <p style="margin: 24px 0 0; color: #666; font-size: 13px;">— {{ config('mail.from.name', 'BrandBased') }}</p>
</body>
</html>
