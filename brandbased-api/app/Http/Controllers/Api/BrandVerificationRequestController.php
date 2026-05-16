<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BrandVerificationRequest;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class BrandVerificationRequestController extends Controller
{
    public function store(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'User session not found.'
            ], 401);
        }

        $request->validate([
            'brand_name'     => 'required|string|max:255',
            'website_url'    => 'required|url',
            'light_logo_svg' => 'required|string',
            'dark_logo_svg'  => 'required|string',
        ]);

        try {
            $brandName = trim($request->brand_name);
            $websiteUrl = trim($request->website_url);

            $baseSlug = Str::slug($brandName);
            $slug = $baseSlug;
            $count = 1;

            while (BrandVerificationRequest::where('slug', $slug)->exists()) {
                $slug = $baseSlug . '-' . $count;
                $count++;
            }

            $brandUniqueId = 'BB' . strtoupper(str_replace('-', '', (string) Str::uuid()));

            $lightPath = "brand-verification/{$user->id}/{$brandUniqueId}/light-logo.svg";
            $darkPath  = "brand-verification/{$user->id}/{$brandUniqueId}/dark-logo.svg";

            Storage::disk('s3')->put($lightPath, $request->light_logo_svg, [
                'visibility' => 'public',
                'ContentType' => 'image/svg+xml',
            ]);

            Storage::disk('s3')->put($darkPath, $request->dark_logo_svg, [
                'visibility' => 'public',
                'ContentType' => 'image/svg+xml',
            ]);

            $brandRequest = BrandVerificationRequest::create([
                'user_id' => $user->id,
                'brand_unique_id' => $brandUniqueId,
                'brand_name' => $brandName,
                'slug' => $slug,
                'website_url' => $websiteUrl,
                'logo_light_url' => Storage::disk('s3')->url($lightPath),
                'logo_dark_url' => Storage::disk('s3')->url($darkPath),
                'identity_status' => 'pending',
                'identity_progress' => 0,
                'meta_status' => 'pending',
                'meta_progress' => 0,
                'final_status' => 'pending',
            ]);

            return response()->json([
                'status' => true,
                'message' => 'Brand submitted for identity verification.',
                'brand_request' => $brandRequest,
            ], 201);

        } catch (\Exception $e) {
            return response()->json([
                'status' => false,
                'message' => 'Unable to submit brand verification request.',
                'debug' => $e->getMessage(),
            ], 500);
        }
    }
    public function status(string $id)
    {
        $brandRequest = \App\Models\BrandVerificationRequest::find($id);

        if (!$brandRequest) {
            return response()->json([
                'status' => false,
                'message' => 'Brand verification request not found.',
            ], 404);
        }

        return response()->json([
            'status' => true,
            'brand_request' => [
                'id' => $brandRequest->id,
                'identity_status' => $brandRequest->identity_status,
                'identity_progress' => $brandRequest->identity_progress,
                'identity_verification_notes' => $brandRequest->identity_verification_notes,
                'final_status' => $brandRequest->final_status,
                'updated_at' => $brandRequest->updated_at,
            ]
        ]);
    }
}