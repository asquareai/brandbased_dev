<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BrandAiPrompt;
use Illuminate\Http\Request;

class InternalBrandAiPromptController extends Controller
{
    public function show(Request $request, string $promptKey)
    {
        $prompt = BrandAiPrompt::where('prompt_key', $promptKey)
            ->where('is_active', true)
            ->latest('version')
            ->first();

        if (!$prompt) {
            return response()->json([
                'status' => false,
                'message' => 'Prompt not found.',
            ], 404);
        }

        return response()->json([
            'status' => true,
            'prompt' => $prompt,
        ]);
    }
}