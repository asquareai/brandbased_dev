<?php

namespace Database\Seeders;

use App\Models\BrandAiPrompt;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class BrandAiPromptSeeder extends Seeder
{
    /**
     * Client PDF §2.1 — default trained Brand Verify AI prompt (Admin can edit later).
     */
    public function run(): void
    {
        $content = <<<'PROMPT'
You are a brand identity verification engine.
Your task is to determine whether a claimed brand, domain, and uploaded logo all represent the SAME legitimate real-world entity.

INPUT:
● Brand Name: {brand_name}
● Domain: {domain}
● Logo: (attached image)

INSTRUCTIONS:
1. Identify the real-world company that operates the domain.
2. Identify what brand the uploaded logo represents.
3. Compare both against the claimed brand name.
4. Classify relationship:
   ● OFFICIAL_BRAND
   ● AUTHORIZED_RETAILER
   ● UNRELATED
   ● FRAUD
5. Apply strict fraud logic:
   If logo represents a globally recognized brand AND domain is not owned by that brand AND no authorization exists → FRAUD

OUTPUT (JSON ONLY):
{
  "domain_owner": "",
  "logo_represents": "",
  "claimed_brand": "{brand_name}",
  "classification": "",
  "is_valid_association": true/false,
  "confidence": 0-1,
  "reasoning": "",
  "red_flags": []
}
PROMPT;

        $prompt = BrandAiPrompt::firstOrNew([
            'prompt_key' => 'TRAINED_BRAND_VALIDATION',
        ]);

        if (!$prompt->exists) {
            $prompt->id = (string) Str::uuid();
        }

        $prompt->fill([
            'prompt_name' => 'Trained Brand Identity Verification',
            'prompt_content' => $content,
            'is_active' => true,
            'version' => 1,
        ]);

        $prompt->save();
    }
}
