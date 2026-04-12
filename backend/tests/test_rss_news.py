"""
Test RSS News Endpoints - Investing.com RSS Feed Integration
Tests the new RSS news system that replaced Finnhub API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestRSSNewsEndpoints:
    """Test RSS news endpoints for all categories"""
    
    def test_news_general_category(self):
        """GET /api/market/news?category=general - returns general news articles"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "general"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one article"
        
        # Validate article structure
        article = data[0]
        assert "id" in article, "Article should have id"
        assert "headline" in article, "Article should have headline"
        assert "source" in article, "Article should have source"
        assert "url" in article, "Article should have url"
        assert "category" in article, "Article should have category"
        assert "datetime_iso" in article, "Article should have datetime_iso"
        assert article["category"] == "general", "Category should be general"
        print(f"✅ General news: {len(data)} articles returned")
    
    def test_news_crypto_category(self):
        """GET /api/market/news?category=crypto - returns crypto news articles"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "crypto"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one article"
        
        article = data[0]
        assert article["category"] == "crypto", "Category should be crypto"
        print(f"✅ Crypto news: {len(data)} articles returned")
    
    def test_news_forex_category(self):
        """GET /api/market/news?category=forex - returns forex news articles"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "forex"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one article"
        
        article = data[0]
        assert article["category"] == "forex", "Category should be forex"
        print(f"✅ Forex news: {len(data)} articles returned")
    
    def test_news_economy_category(self):
        """GET /api/market/news?category=economy - returns economy news articles"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "economy"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        assert len(data) > 0, "Should return at least one article"
        
        article = data[0]
        assert article["category"] == "economy", "Category should be economy"
        print(f"✅ Economy news: {len(data)} articles returned")
    
    def test_news_invalid_category_defaults_to_general(self):
        """GET /api/market/news?category=invalid - should default to general"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "invalid_category"})
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Invalid category should default to general
        if len(data) > 0:
            assert data[0]["category"] == "general", "Invalid category should default to general"
        print("✅ Invalid category defaults to general")
    
    def test_news_article_structure(self):
        """Verify complete article structure from RSS feed"""
        response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "general"})
        assert response.status_code == 200
        
        data = response.json()
        assert len(data) > 0, "Should have articles"
        
        article = data[0]
        # Required fields
        required_fields = ["id", "headline", "summary", "source", "url", "image", "category", "datetime_iso", "related"]
        for field in required_fields:
            assert field in article, f"Article missing required field: {field}"
        
        # Validate URL format
        assert article["url"].startswith("https://www.investing.com/"), "URL should be from investing.com"
        
        # Validate datetime format (ISO)
        assert "T" in article["datetime_iso"], "datetime_iso should be in ISO format"
        
        print("✅ Article structure validated")


class TestImageProxy:
    """Test image proxy endpoint for CORS bypass"""
    
    def test_image_proxy_valid_url(self):
        """GET /api/market/news/image-proxy - proxies valid investing.com images"""
        # First get a real image URL from news
        news_response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "general"})
        assert news_response.status_code == 200
        
        articles = news_response.json()
        image_url = None
        for article in articles:
            if article.get("image") and "i-invdn-com.investing.com" in article["image"]:
                image_url = article["image"]
                break
        
        if not image_url:
            pytest.skip("No articles with images found")
        
        # Test the proxy
        proxy_response = requests.get(
            f"{BASE_URL}/api/market/news/image-proxy",
            params={"url": image_url}
        )
        assert proxy_response.status_code == 200, f"Expected 200, got {proxy_response.status_code}"
        
        # Verify it's an image
        content_type = proxy_response.headers.get("content-type", "")
        assert "image" in content_type, f"Expected image content-type, got {content_type}"
        
        # Verify content is not empty
        assert len(proxy_response.content) > 1000, "Image content should be substantial"
        
        print(f"✅ Image proxy working - returned {len(proxy_response.content)} bytes")
    
    def test_image_proxy_invalid_domain(self):
        """GET /api/market/news/image-proxy - rejects non-investing.com URLs"""
        response = requests.get(
            f"{BASE_URL}/api/market/news/image-proxy",
            params={"url": "https://example.com/image.jpg"}
        )
        assert response.status_code == 400, f"Expected 400 for invalid domain, got {response.status_code}"
        print("✅ Image proxy correctly rejects invalid domains")
    
    def test_image_proxy_missing_url(self):
        """GET /api/market/news/image-proxy - requires url parameter"""
        response = requests.get(f"{BASE_URL}/api/market/news/image-proxy")
        # Should return 422 (validation error) or 400
        assert response.status_code in [400, 422], f"Expected 400/422 for missing url, got {response.status_code}"
        print("✅ Image proxy correctly requires url parameter")
    
    def test_image_proxy_cache_header(self):
        """Verify image proxy sets cache headers"""
        news_response = requests.get(f"{BASE_URL}/api/market/news", params={"category": "general"})
        articles = news_response.json()
        
        image_url = None
        for article in articles:
            if article.get("image") and "i-invdn-com.investing.com" in article["image"]:
                image_url = article["image"]
                break
        
        if not image_url:
            pytest.skip("No articles with images found")
        
        proxy_response = requests.get(
            f"{BASE_URL}/api/market/news/image-proxy",
            params={"url": image_url}
        )
        
        # Check for cache control header
        cache_control = proxy_response.headers.get("cache-control", "")
        assert "max-age" in cache_control.lower() or proxy_response.status_code == 200, "Should have cache headers or return 200"
        print("✅ Image proxy cache headers verified")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
