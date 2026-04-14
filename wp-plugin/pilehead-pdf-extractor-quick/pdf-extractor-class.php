<?php
/**
 * PHP PDF Extractor Class
 * Extracts text from PDFs and categorizes content
 */

namespace PileheadPDFExtractor;

class PDFExtractor {
    private $keywords = [
        'specifications' => ['spec', 'technical', 'property', 'appearance', 'density', 'viscosity', 'strength', 'cure', 'astm', 'iso', 'standard'],
        'features' => ['feature', 'benefit', 'advantage', 'excellent', 'superior', 'resistant', 'easy', 'fast'],
        'applications' => ['application', 'suitable', 'ideal', 'concrete', 'repair', 'anchor', 'grout'],
        'estimating' => ['consumption', 'coverage', 'kg/m', 'yield', 'thickness'],
        'delivery' => ['pack', 'storage', 'shelf life', 'bucket', 'bag', 'container'],
        'faqs' => ['question', 'faq', 'how', 'when', 'why', 'can i']
    ];

    public function enrichProductWithPDFs($product) {
        $pdf_url = $product['datasheetUrl'] ?? null;
        if (!$pdf_url) {
            return $product;
        }

        return $this->extractAndEnrich($product, $pdf_url);
    }

    private function extractAndEnrich($product, $pdf_url) {
        // Try to extract text from PDF
        $extracted = $this->extractPDFText($pdf_url);
        
        if (!$extracted['success']) {
            return $product;
        }

        // Detect type
        $pdf_type = $this->detectPDFType($pdf_url, $extracted['metadata'] ?? []);

        // Categorize
        $categorized = $this->categorizeContent($extracted['text']);

        // Convert to HTML
        $tab_html = $this->convertToTabHTML($categorized);

        // Merge
        $enriched = array_merge($product, $tab_html, [
            '_pdf_extracted' => true,
            '_pdf_source' => $pdf_url,
            '_pdf_type' => $pdf_type
        ]);

        return $enriched;
    }

    private function extractPDFText($pdf_url) {
        try {
            // Download PDF
            $response = wp_remote_get($pdf_url, [
                'timeout' => 30,
                'sslverify' => false
            ]);

            if (is_wp_error($response)) {
                return ['success' => false, 'error' => $response->get_error_message()];
            }

            $pdf_content = wp_remote_retrieve_body($response);
            if (empty($pdf_content)) {
                return ['success' => false, 'error' => 'Empty PDF'];
            }

            // Simple text extraction from PDF
            $text = $this->extractTextFromPDF($pdf_content);

            return [
                'success' => true,
                'text' => $text,
                'pages' => substr_count($text, 'endstream') ?: 1,
                'metadata' => []
            ];
        } catch (\Exception $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Simple PDF text extraction using regex
     * Handles basic text extraction from PDFs
     */
    private function extractTextFromPDF($pdf_content) {
        // Extract text between BT and ET operators
        preg_match_all('/BT(.+?)ET/s', $pdf_content, $matches);
        $text = '';

        if (!empty($matches[1])) {
            foreach ($matches[1] as $match) {
                // Extract text strings - look for parentheses
                preg_match_all('/\((.*?)\)/s', $match, $strings);
                if (!empty($strings[1])) {
                    foreach ($strings[1] as $str) {
                        // Decode PDF text encoding
                        $decoded = $this->decodePDFText($str);
                        if (!empty($decoded)) {
                            $text .= $decoded . ' ';
                        }
                    }
                }
            }
        }

        // Fallback: try to extract any readable strings
        if (strlen($text) < 100) {
            preg_match_all('/\s([A-Z][a-z\s]+[:\.])\s+([^<>\n]{20,})/i', $pdf_content, $matches);
            if (!empty($matches[0])) {
                $text .= implode(' ', $matches[0]);
            }
        }

        return trim($text) ?: 'PDF content extraction incomplete';
    }

    private function decodePDFText($text) {
        // Remove PDF escape sequences
        $text = str_replace(['\\n', '\\r', '\\t'], [' ', ' ', ' '], $text);
        $text = preg_replace('/\\[0-9a-f]{2}/i', '', $text);
        $text = html_entity_decode($text, ENT_QUOTES, 'UTF-8');
        return trim($text);
    }

    private function detectPDFType($url, $metadata = []) {
        $combined = strtoupper($url . ' ' . implode(' ', $metadata));

        if (strpos($combined, 'TDS') !== false || strpos($combined, 'TECHNICAL DATA') !== false) {
            return 'tds';
        }
        if (strpos($combined, 'SDS') !== false || strpos($combined, 'SAFETY DATA') !== false) {
            return 'sds';
        }
        if (strpos($combined, 'METHOD STATEMENT') !== false) {
            return 'ms';
        }
        return 'auto';
    }

    private function categorizeContent($text) {
        $lines = explode("\n", $text);
        $categories = [
            'specifications' => [],
            'features' => [],
            'applications' => [],
            'estimating' => [],
            'delivery' => [],
            'faqs' => [],
            'unknown' => []
        ];

        foreach ($lines as $line) {
            $line = trim($line);
            if (strlen($line) < 3) continue;

            $lower = strtolower($line);
            $matched = false;

            foreach ($this->keywords as $category => $keywords) {
                foreach ($keywords as $keyword) {
                    if (strpos($lower, $keyword) !== false) {
                        $categories[$category][] = $line;
                        $matched = true;
                        break 2;
                    }
                }
            }

            if (!$matched && strlen($line) > 10) {
                $categories['unknown'][] = $line;
            }
        }

        return $categories;
    }

    private function convertToTabHTML($categorized) {
        return [
            'ph_tab_specifications_html' => $this->renderSpecifications($categorized['specifications']),
            'ph_tab_features_html' => $this->renderFeatures($categorized['features']),
            'ph_tab_applications_html' => $this->renderApplications($categorized['applications']),
            'ph_tab_estimating_html' => $this->renderEstimating($categorized['estimating']),
            'ph_tab_delivery_html' => $this->renderDelivery($categorized['delivery']),
            'ph_tab_faqs_html' => $this->renderFAQs($categorized['faqs'])
        ];
    }

    private function renderSpecifications($specs) {
        if (empty($specs)) {
            return '<div class="ph-spec-grid"><p style="color: #999;">No specifications found.</p></div>';
        }

        $html = '<div class="ph-spec-grid">';
        foreach (array_slice($specs, 0, 10) as $spec) {
            $parts = explode(':', $spec);
            $label = $parts[0] ?? 'Property';
            $value = $parts[1] ?? $spec;
            $html .= '<div class="ph-spec-row"><div class="ph-spec-label">' . esc_html($label) . '</div>';
            $html .= '<div class="ph-spec-value">' . esc_html(substr($value, 0, 50)) . '</div></div>';
        }
        $html .= '</div>';
        return $html;
    }

    private function renderFeatures($features) {
        if (empty($features)) {
            return '<div class="ph-feat-list"><p style="color: #999;">No features found.</p></div>';
        }

        $html = '<ul class="ph-feat-list">';
        foreach (array_slice($features, 0, 8) as $feature) {
            $html .= '<li class="ph-feat-item"><span style="color: #facc15;">✓</span> ' . esc_html(substr($feature, 0, 80)) . '</li>';
        }
        $html .= '</ul>';
        return $html;
    }

    private function renderApplications($apps) {
        if (empty($apps)) {
            return '<div class="ph-app-grid"><p style="color: #999;">No applications found.</p></div>';
        }

        $emojis = ['🏗️', '🔩', '🧱', '🛣️', '⚓', '🌊'];
        $html = '<div class="ph-app-grid">';
        foreach (array_slice($apps, 0, 6) as $i => $app) {
            $emoji = $emojis[$i % count($emojis)];
            $html .= '<div class="ph-app-card"><div style="font-size: 24px;">'. $emoji . '</div>';
            $html .= '<div style="font-size: 12px; font-weight: 500;">' . esc_html(substr($app, 0, 40)) . '</div></div>';
        }
        $html .= '</div>';
        return $html;
    }

    private function renderEstimating($estimating) {
        if (empty($estimating)) {
            return '<div class="ph-est-section"><div style="background: #fffbeb; padding: 12px; border-radius: 4px;"><strong>📝 Estimating:</strong> No coverage information found.</div></div>';
        }

        $html = '<div class="ph-est-section"><table class="ph-est-table" style="width: 100%; border-collapse: collapse;">';
        foreach (array_slice($estimating, 0, 5) as $est) {
            $html .= '<tr style="border-bottom: 1px solid #eee;"><td style="padding: 8px;">' . esc_html(substr($est, 0, 30)) . '</td></tr>';
        }
        $html .= '</table></div>';
        return $html;
    }

    private function renderDelivery($delivery) {
        if (empty($delivery)) {
            return '<div class="ph-delivery-list"><p style="color: #999;">No delivery info found.</p></div>';
        }

        $html = '<ul class="ph-delivery-list" style="list-style: none; padding: 0;">';
        foreach (array_slice($delivery, 0, 5) as $item) {
            $html .= '<li style="padding: 8px 0; border-bottom: 1px solid #eee;">📦 ' . esc_html(substr($item, 0, 80)) . '</li>';
        }
        $html .= '</ul>';
        return $html;
    }

    private function renderFAQs($faqs) {
        if (empty($faqs)) {
            return '<div class="ph-faq-list"><p style="color: #999;">No FAQs found.</p></div>';
        }

        $html = '<div class="ph-faq-list">';
        foreach (array_slice($faqs, 0, 5) as $faq) {
            $html .= '<div class="ph-faq-item" style="border-bottom: 1px solid #eee; padding: 12px 0;">';
            $html .= '<div style="font-weight: 500; cursor: pointer;">Q: ' . esc_html(substr($faq, 0, 100)) . '</div>';
            $html .= '</div>';
        }
        $html .= '</div>';
        return $html;
    }
}
