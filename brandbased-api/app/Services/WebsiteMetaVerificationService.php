<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class WebsiteMetaVerificationService
{
    public function buildSnippet(string $brandUniqueId): string
    {
        $scriptUrl = config('brandbased.cdn_runtime_script');
        $token = $this->metaContentToken($brandUniqueId);

        return implode("\n", [
            '<!-- BrandBased Official Verification -->',
            '<meta name="brandbased-official" content="' . $token . '">',
            '',
            '<!-- BrandBased Runtime -->',
            '<script src="' . $scriptUrl . '" data-bb-id="' . $brandUniqueId . '" async></script>',
        ]);
    }

    public function metaContentToken(string $brandUniqueId): string
    {
        return 'BB-VERIFIED-' . $brandUniqueId;
    }

    /**
     * @return array{
     *   verified: bool,
     *   meta_found: bool,
     *   script_found: bool,
     *   message: string,
     *   checked_url?: string
     * }
     */
    public function verify(string $websiteUrl, string $brandUniqueId): array
    {
        $checkedUrl = $this->normalizeUrl($websiteUrl);
        $html = $this->fetchHtml($checkedUrl);

        if ($html === null) {
            return [
                'verified' => false,
                'meta_found' => false,
                'script_found' => false,
                'message' => 'Unable to load your website. Check the URL is public and try again.',
                'checked_url' => $checkedUrl,
            ];
        }

        $metaFound = $this->hasOfficialMetaTag($html, $brandUniqueId);
        $scriptFound = $this->hasRuntimeScript($html, $brandUniqueId);

        $verified = $metaFound && $scriptFound;

        $message = $verified
            ? 'Meta tag and BrandBased runtime script verified on your website.'
            : $this->failureMessage($metaFound, $scriptFound);

        return [
            'verified' => $verified,
            'meta_found' => $metaFound,
            'script_found' => $scriptFound,
            'message' => $message,
            'checked_url' => $checkedUrl,
        ];
    }

    protected function failureMessage(bool $metaFound, bool $scriptFound): string
    {
        if (!$metaFound && !$scriptFound) {
            return 'BrandBased meta tag and runtime script were not found in your site <head>. Paste both snippets, publish, then try Verify again.';
        }

        if (!$metaFound) {
            return 'BrandBased verification meta tag was not found. Add the meta tag to your site <head> and try again.';
        }

        return 'BrandBased runtime script was not found. Add the script tag to your site <head> and try again.';
    }

    protected function normalizeUrl(string $url): string
    {
        $url = trim($url);

        if (!Str::startsWith(strtolower($url), ['http://', 'https://'])) {
            $url = 'https://' . $url;
        }

        return $url;
    }

    protected function fetchHtml(string $url): ?string
    {
        try {
            $response = Http::timeout(config('brandbased.meta_verification_timeout', 25))
                ->withHeaders([
                    'User-Agent' => 'BrandBased-Website-Verifier/1.0',
                    'Accept' => 'text/html,application/xhtml+xml',
                ])
                ->get($url);

            if (!$response->successful()) {
                return null;
            }

            $body = $response->body();

            return is_string($body) && $body !== '' ? $body : null;
        } catch (\Throwable $e) {
            return null;
        }
    }

    protected function hasOfficialMetaTag(string $html, string $brandUniqueId): bool
    {
        $expected = $this->metaContentToken($brandUniqueId);

        if (preg_match_all(
            '/<meta\b[^>]*>/i',
            $html,
            $matches
        )) {
            foreach ($matches[0] as $tag) {
                if (!preg_match('/name\s*=\s*["\']brandbased-official["\']/i', $tag)) {
                    continue;
                }

                if (preg_match('/content\s*=\s*["\']([^"\']+)["\']/i', $tag, $contentMatch)) {
                    $content = strtoupper(trim($contentMatch[1]));
                    if (str_contains($content, strtoupper($expected))) {
                        return true;
                    }
                }
            }
        }

        return (bool) preg_match(
            '/brandbased-official[^>]+content\s*=\s*["\'][^"\']*' . preg_quote($expected, '/') . '/i',
            $html
        );
    }

    protected function hasRuntimeScript(string $html, string $brandUniqueId): bool
    {
        if (!preg_match_all('/<script\b[^>]*>/i', $html, $matches)) {
            return false;
        }

        foreach ($matches[0] as $tag) {
            if (!preg_match('/\bsrc\s*=\s*["\']([^"\']+)["\']/i', $tag, $srcMatch)) {
                continue;
            }

            $src = strtolower($srcMatch[1]);

            if (!str_contains($src, 'cdn.brandbased.ai')) {
                continue;
            }

            if (preg_match('/\bdata-bb-id\s*=\s*["\']' . preg_quote($brandUniqueId, '/') . '["\']/i', $tag)) {
                return true;
            }
        }

        return (bool) preg_match(
            '/<script\b[^>]*\bsrc\s*=\s*["\'][^"\']*cdn\.brandbased\.ai[^"\']*["\'][^>]*\bdata-bb-id\s*=\s*["\']'
            . preg_quote($brandUniqueId, '/')
            . '["\']/i',
            $html
        );
    }
}
