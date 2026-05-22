<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Brand;
use App\Models\BrandActivityLog;
use App\Services\BrandActivityLogger;
use App\Services\BrandSettingsNormalizer;
use Illuminate\Http\Request;

class BrandController extends Controller
{
    public function index(Request $request)
    {
        $user = $request->user();

        if (!$user) {
            return response()->json([
                'status' => false,
                'message' => 'User session not found.',
            ], 401);
        }

        $brands = Brand::query()
            ->where('user_id', $user->id)
            ->whereNotNull('verified_at')
            ->orderByDesc('verified_at')
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'status' => true,
            'brands' => $brands->map(function (Brand $brand) {
                return $this->serializeBrand($brand);
            }),
        ]);
    }

    public function showSettings(Request $request, string $id)
    {
        $brand = $this->findOwnedBrand($request, $id);

        if (!$brand) {
            return response()->json([
                'status' => false,
                'message' => 'Brand not found.',
            ], 404);
        }

        return response()->json([
            'status' => true,
            'settings' => $brand->resolvedSettings(),
        ]);
    }

    public function updateSettings(Request $request, string $id)
    {
        $brand = $this->findOwnedBrand($request, $id);

        if (!$brand) {
            return response()->json([
                'status' => false,
                'message' => 'Brand not found.',
            ], 404);
        }

        $payload = $request->input('settings');
        if (!is_array($payload)) {
            return response()->json([
                'status' => false,
                'message' => 'Settings payload is required.',
            ], 422);
        }

        $normalized = BrandSettingsNormalizer::normalize($payload);
        $brand->update(['settings' => $normalized]);

        return response()->json([
            'status' => true,
            'message' => 'Brand settings saved.',
            'settings' => $brand->fresh()->resolvedSettings(),
            'brand' => $this->serializeBrand($brand->fresh()),
        ]);
    }

    public function publish(Request $request, string $id, BrandActivityLogger $activityLogger)
    {
        $brand = $this->findOwnedBrand($request, $id);

        if (!$brand) {
            return response()->json([
                'status' => false,
                'message' => 'Brand not found.',
            ], 404);
        }

        if (!$brand->verified_at) {
            return response()->json([
                'status' => false,
                'message' => 'Brand must be fully verified before publishing.',
            ], 422);
        }

        $brand->update(['is_published' => true]);
        $brand = $brand->fresh();

        $activityLogger->log($brand, BrandActivityLog::ACTION_PUBLISHED);

        return response()->json([
            'status' => true,
            'message' => 'Brand published successfully.',
            'brand' => $this->serializeBrand($brand),
        ]);
    }

    public function unpublish(Request $request, string $id, BrandActivityLogger $activityLogger)
    {
        $brand = $this->findOwnedBrand($request, $id);

        if (!$brand) {
            return response()->json([
                'status' => false,
                'message' => 'Brand not found.',
            ], 404);
        }

        $brand->update(['is_published' => false]);
        $brand = $brand->fresh();

        $activityLogger->log($brand, BrandActivityLog::ACTION_UNPUBLISHED);

        return response()->json([
            'status' => true,
            'message' => 'Brand unpublished successfully.',
            'brand' => $this->serializeBrand($brand),
        ]);
    }

    public function destroy(Request $request, string $id, BrandActivityLogger $activityLogger)
    {
        $brand = $this->findOwnedBrand($request, $id);

        if (!$brand) {
            return response()->json([
                'status' => false,
                'message' => 'Brand not found.',
            ], 404);
        }

        $activityLogger->logDeletedSnapshot($brand);
        $brand->delete();

        return response()->json([
            'status' => true,
            'message' => 'Brand deleted successfully. Activity recorded in history.',
        ]);
    }

    protected function findOwnedBrand(Request $request, string $id): ?Brand
    {
        $user = $request->user();

        if (!$user) {
            return null;
        }

        return Brand::query()
            ->where('id', $id)
            ->where('user_id', $user->id)
            ->first();
    }

    protected function serializeBrand(Brand $brand): array
    {
        $data = $brand->toArray();
        $data['settings'] = $brand->resolvedSettings();

        return $data;
    }
}
