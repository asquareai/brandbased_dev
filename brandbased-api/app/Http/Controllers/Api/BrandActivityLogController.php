<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BrandActivityLog;
use Illuminate\Http\Request;

class BrandActivityLogController extends Controller
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

        $query = BrandActivityLog::query()
            ->where('user_id', $user->id)
            ->orderByDesc('created_at');

        if ($request->filled('brand_id')) {
            $query->where(function ($q) use ($request) {
                $q->where('brand_id', $request->brand_id)
                    ->orWhere('metadata->deleted_brand_id', $request->brand_id);
            });
        }

        if ($request->filled('action')) {
            $query->where('action', $request->action);
        }

        $limit = min((int) $request->input('limit', 50), 100);
        $logs = $query->limit($limit)->get();

        return response()->json([
            'status' => true,
            'activity_logs' => $logs,
        ]);
    }
}
