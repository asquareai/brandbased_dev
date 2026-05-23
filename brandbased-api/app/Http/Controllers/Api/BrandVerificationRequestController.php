<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\BrandActivityLog;
use App\Models\BrandVerificationRequest;
use App\Models\AccountSubscription;
use App\Services\AccountSubscriptionService;
use App\Services\BrandActivityLogger;
use App\Services\WebsiteMetaVerificationService;
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
            'created_under_plan' => 'nullable|in:freemium,premium',
        ]);

        $createdUnderPlan = $request->input('created_under_plan', AccountSubscription::PLAN_FREEMIUM);

        if ($createdUnderPlan === AccountSubscription::PLAN_PREMIUM) {
            $subscriptionService = app(AccountSubscriptionService::class);
            if (!$subscriptionService->accountHasActivePremium($user)) {
                return response()->json([
                    'status' => false,
                    'message' => 'An active Premium subscription is required to create a Premium brand.',
                ], 403);
            }
        }

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
                'created_under_plan' => $createdUnderPlan,
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
    public function status(Request $request, string $id)
    {
        $brandRequest = BrandVerificationRequest::find($id);

        if (!$brandRequest) {
            return response()->json([
                'status' => false,
                'message' => 'Brand verification request not found.',
            ], 404);
        }

        if ($request->user() && $brandRequest->user_id !== $request->user()->id) {
            return response()->json([
                'status' => false,
                'message' => 'Unauthorized.',
            ], 403);
        }

        return response()->json([
            'status' => true,
            'brand_request' => $this->serializeBrandRequest($brandRequest),
        ]);
    }

    public function metaSnippet(Request $request, string $id, WebsiteMetaVerificationService $metaService)
    {
        $brandRequest = $this->findOwnedRequest($request, $id);

        if (!$brandRequest) {
            return response()->json([
                'status' => false,
                'message' => 'Brand verification request not found.',
            ], 404);
        }

        return response()->json([
            'status' => true,
            'brand_unique_id' => $brandRequest->brand_unique_id,
            'snippet' => $metaService->buildSnippet($brandRequest->brand_unique_id),
            'runtime_script_url' => config('brandbased.cdn_runtime_script'),
        ]);
    }

    public function verifyMeta(Request $request, string $id, WebsiteMetaVerificationService $metaService, BrandActivityLogger $activityLogger)
    {
        $brandRequest = $this->findOwnedRequest($request, $id);

        if (!$brandRequest) {
            return response()->json([
                'status' => false,
                'message' => 'Brand verification request not found.',
            ], 404);
        }

        if ($brandRequest->identity_status !== 'verified') {
            return response()->json([
                'status' => false,
                'message' => 'Complete identity verification before verifying your website.',
            ], 422);
        }

        if (empty($brandRequest->website_url)) {
            return response()->json([
                'status' => false,
                'message' => 'Website URL is missing on this brand request.',
            ], 422);
        }

        $brandRequest->update([
            'meta_status' => 'processing',
            'meta_progress' => 50,
            'last_checked_at' => now(),
        ]);

        $check = $metaService->verify(
            $brandRequest->website_url,
            $brandRequest->brand_unique_id
        );

        $brand = null;

        if ($check['verified']) {
            $brandRequest->update([
                'meta_status' => 'verified',
                'meta_progress' => 100,
                'meta_verification_notes' => $check['message'],
                'final_status' => 'verified',
                'last_checked_at' => now(),
            ]);

            $brand = Brand::updateOrCreate(
                ['brand_unique_id' => $brandRequest->brand_unique_id],
                [
                    'user_id' => $brandRequest->user_id,
                    'brand_verification_request_id' => $brandRequest->id,
                    'brand_name' => $brandRequest->brand_name,
                    'slug' => $brandRequest->slug,
                    'website_url' => $brandRequest->website_url,
                    'logo_light_url' => $brandRequest->logo_light_url,
                    'logo_dark_url' => $brandRequest->logo_dark_url,
                    'verified_at' => now(),
                    'is_published' => false,
                    'created_under_plan' => $brandRequest->created_under_plan
                        ?? AccountSubscription::PLAN_FREEMIUM,
                ]
            );

            if ($brand->wasRecentlyCreated) {
                $activityLogger->log($brand, BrandActivityLog::ACTION_CREATED, [
                    'source' => 'meta_verification',
                ]);
            }
        } else {
            $brandRequest->update([
                'meta_status' => 'failed',
                'meta_progress' => 100,
                'meta_verification_notes' => $check['message'],
                'final_status' => 'pending',
                'last_checked_at' => now(),
            ]);
        }

        return response()->json([
            'status' => true,
            'verified' => $check['verified'],
            'meta_found' => $check['meta_found'],
            'script_found' => $check['script_found'],
            'message' => $check['message'],
            'checked_url' => $check['checked_url'] ?? null,
            'brand_request' => $this->serializeBrandRequest($brandRequest->fresh()),
            'brand' => $brand ? $this->serializeBrandForApi($brand) : null,
        ]);
    }

    protected function serializeBrandForApi(Brand $brand): array
    {
        $data = $brand->toArray();
        $data['settings'] = $brand->resolvedSettings();

        return $data;
    }

    protected function findOwnedRequest(Request $request, string $id): ?BrandVerificationRequest
    {
        $user = $request->user();

        if (!$user) {
            return null;
        }

        return BrandVerificationRequest::query()
            ->where('id', $id)
            ->where('user_id', $user->id)
            ->first();
    }

    protected function serializeBrandRequest(BrandVerificationRequest $brandRequest): array
    {
        return [
            'id' => $brandRequest->id,
            'user_id' => $brandRequest->user_id,
            'brand_unique_id' => $brandRequest->brand_unique_id,
            'brand_name' => $brandRequest->brand_name,
            'slug' => $brandRequest->slug,
            'website_url' => $brandRequest->website_url,
            'logo_light_url' => $brandRequest->logo_light_url,
            'logo_dark_url' => $brandRequest->logo_dark_url,
            'identity_status' => $brandRequest->identity_status,
            'identity_progress' => $brandRequest->identity_progress,
            'identity_verification_notes' => $brandRequest->identity_verification_notes,
            'meta_status' => $brandRequest->meta_status,
            'meta_progress' => $brandRequest->meta_progress,
            'meta_verification_notes' => $brandRequest->meta_verification_notes,
            'final_status' => $brandRequest->final_status,
            'last_checked_at' => $brandRequest->last_checked_at,
            'updated_at' => $brandRequest->updated_at,
        ];
    }
}