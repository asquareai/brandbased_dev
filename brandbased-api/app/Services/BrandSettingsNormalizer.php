<?php

namespace App\Services;

class BrandSettingsNormalizer
{
    public static function defaults(): array
    {
        return [
            'placement' => [
                's' => '100',
                'w' => '100',
                'h' => '100',
                'l' => '0',
                'r' => '0',
                't' => '0',
                'b' => '0',
            ],
            'replace_threshold' => 8,
            'brand_ai_smart' => false,
        ];
    }

    public static function merge(?array $stored): array
    {
        $defaults = self::defaults();
        if (!is_array($stored)) {
            return $defaults;
        }

        $placement = $defaults['placement'];
        if (isset($stored['placement']) && is_array($stored['placement'])) {
            foreach (array_keys($placement) as $key) {
                if (array_key_exists($key, $stored['placement'])) {
                    $placement[$key] = (string) $stored['placement'][$key];
                }
            }
        }

        return [
            'placement' => self::normalizePlacement($placement),
            'replace_threshold' => self::clampThreshold($stored['replace_threshold'] ?? $defaults['replace_threshold']),
            'brand_ai_smart' => (bool) ($stored['brand_ai_smart'] ?? $defaults['brand_ai_smart']),
        ];
    }

    public static function normalize(array $input): array
    {
        $defaults = self::defaults();
        $placement = $defaults['placement'];

        if (isset($input['placement']) && is_array($input['placement'])) {
            foreach (array_keys($placement) as $key) {
                if (array_key_exists($key, $input['placement'])) {
                    $placement[$key] = (string) $input['placement'][$key];
                }
            }
        }

        return [
            'placement' => self::normalizePlacement($placement),
            'replace_threshold' => self::clampThreshold($input['replace_threshold'] ?? $defaults['replace_threshold']),
            'brand_ai_smart' => filter_var(
                $input['brand_ai_smart'] ?? $defaults['brand_ai_smart'],
                FILTER_VALIDATE_BOOLEAN
            ),
        ];
    }

    protected static function normalizePlacement(array $placement): array
    {
        $mulKeys = ['s', 'w', 'h'];
        $padKeys = ['l', 'r', 't', 'b'];
        $out = [];

        foreach ($mulKeys as $key) {
            $n = (int) ($placement[$key] ?? 100);
            $out[$key] = (string) max(50, min(150, $n));
        }

        foreach ($padKeys as $key) {
            $n = (int) ($placement[$key] ?? 0);
            $out[$key] = (string) max(0, min(40, $n));
        }

        return $out;
    }

    protected static function clampThreshold(mixed $value): int
    {
        $n = (int) $value;
        return max(1, min(8, $n));
    }
}
