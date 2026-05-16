<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BrandVerificationRequest;
use Illuminate\Http\Request;

class InternalBrandVerificationController extends Controller
{
    public function pending(Request $request)
    {
        $items = BrandVerificationRequest::where('identity_status', 'pending')
            ->orderBy('created_at', 'asc')
            ->limit(5)
            ->get();

        return response()->json([
            'status' => true,
            'items' => $items,
        ]);
    }

    public function claim(Request $request, string $id)
    {
        $brandRequest = BrandVerificationRequest::where('id', $id)
            ->where('identity_status', 'pending')
            ->first();

        if (!$brandRequest) {
            return response()->json([
                'status' => false,
                'message' => 'Request not available for processing.',
            ], 404);
        }

        $brandRequest->update([
            'identity_status' => 'processing',
            'identity_progress' => 10,
            'last_checked_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'item' => $brandRequest,
        ]);
    }

    public function updateStatus(Request $request, string $id)
    {
        $request->validate([
            'identity_status' => 'required|string',
            'identity_progress' => 'nullable|integer|min:0|max:100',
            'identity_verification_notes' => 'nullable|string',
            'final_status' => 'nullable|string',
        ]);

        $brandRequest = BrandVerificationRequest::findOrFail($id);

        $brandRequest->update([
            'identity_status' => $request->identity_status,
            'identity_progress' => $request->identity_progress ?? $brandRequest->identity_progress,
            'identity_verification_notes' => $request->identity_verification_notes,
            'final_status' => $request->final_status ?? $brandRequest->final_status,
            'last_checked_at' => now(),
        ]);

        return response()->json([
            'status' => true,
            'item' => $brandRequest,
        ]);
    }
}