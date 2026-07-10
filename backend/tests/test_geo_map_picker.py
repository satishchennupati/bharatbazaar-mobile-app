"""Backend tests for the interactive map picker endpoints.

Covers:
- GET /api/geo/map-picker returns HTML with Leaflet + OSM tile layer
- GET /api/geo/reverse-geocode with an Albanian lat/lng returns serviceable=True
  and parsed city/state
- GET /api/geo/reverse-geocode with a Paris lat/lng returns serviceable=False
  with a non-empty unserviceable_reason
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://bharat-app-8.preview.emergentagent.com").rstrip("/")


@pytest.fixture(scope="module")
def api_client():
    s = requests.Session()
    s.headers.update({"Accept": "*/*"})
    return s


# --------------------------- /api/geo/map-picker ---------------------------
class TestMapPickerHTML:
    def test_returns_html_with_leaflet(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", params={"lat": 41.3275, "lng": 19.8187, "zoom": 12}, timeout=30)
        assert r.status_code == 200, r.text[:400]
        ctype = r.headers.get("content-type", "").lower()
        assert "text/html" in ctype, f"content-type was {ctype!r}"
        body = r.text
        # Leaflet JS + CSS loaded
        assert "leaflet" in body.lower(), "leaflet not referenced in HTML"
        # OSM tile layer instantiated
        assert "L.tileLayer(" in body, "L.tileLayer call missing"
        # Uses supplied lat/lng in setView
        assert "41.3275" in body and "19.8187" in body

    def test_default_lat_lng_when_missing(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        assert r.status_code == 200
        assert "L.tileLayer(" in r.text


# ------------------------- /api/geo/reverse-geocode ------------------------
class TestReverseGeocode:
    def test_tirana_center_is_serviceable(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": 41.3275, "lng": 19.8187},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        # Required keys
        for k in ("formatted_address", "lat", "lng", "country_code", "city", "state", "serviceable"):
            assert k in data, f"missing key {k} in {list(data.keys())}"
        assert data["country_code"] == "AL", f"country_code was {data['country_code']!r}"
        assert data["serviceable"] is True
        assert isinstance(data["formatted_address"], str) and data["formatted_address"]
        # lat/lng echoed back
        assert abs(float(data["lat"]) - 41.3275) < 1e-4
        assert abs(float(data["lng"]) - 19.8187) < 1e-4
        # city should be non-empty for Tirana center
        assert data["city"], f"city empty: {data}"

    def test_paris_is_not_serviceable(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": 48.8566, "lng": 2.3522},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        data = r.json()
        assert data["serviceable"] is False
        assert isinstance(data.get("unserviceable_reason"), str) and data["unserviceable_reason"], data
        # Should not be Albania
        assert data["country_code"] != "AL"
