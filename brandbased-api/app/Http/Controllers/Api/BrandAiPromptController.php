<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\BrandAiPrompt;
use Illuminate\Http\Request;

class BrandAiPromptController extends Controller
{
    public function show(string $promptKey)
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

    public function upsert(Request $request, string $promptKey)
    {
        $request->validate([
            'prompt_name' => 'nullable|string|max:255',
            'prompt_content' => 'required|string',
        ]);

        $prompt = BrandAiPrompt::firstOrNew(['prompt_key' => $promptKey]);

        $prompt->fill([
            'prompt_name' => $request->input(
                'prompt_name',
                $prompt->prompt_name ?? 'Trained Brand Identity Verification'
            ),
            'prompt_content' => $request->prompt_content,
            'is_active' => true,
            'version' => ($prompt->version ?? 0) + 1,
        ]);

        $prompt->save();

        return response()->json([
            'status' => true,
            'message' => 'Prompt saved.',
            'prompt' => $prompt,
        ]);
    }
}
