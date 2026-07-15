"""Backend tests for the interactive map picker endpoints (Google Maps variant).

Covers:
- GET /api/geo/map-picker returns HTML embedding the Google Maps JS API bootstrap,
  with the API key parameter, `new google.maps.Map(` instantiation, and NO Leaflet references.
- GET /api/geo/map-picker without params returns 200 with default Tirana coordinates
  (41.3275, 19.8187) and zoom 12 embedded in the JS.
- GET /api/geo/reverse-geocode with an Albanian lat/lng returns serviceable=True and
  parsed city=='Tiranë' / country_code=='AL'.
- GET /api/geo/reverse-geocode with a Paris lat/lng returns serviceable=False with a
  non-empty unserviceable_reason.
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


# --------------------------- /api/geo/map-picker (Google Maps) ---------------------------
class TestMapPickerHTML:
    def test_returns_html_with_google_maps(self, api_client):
        r = api_client.get(
            f"{BASE_URL}/api/geo/map-picker",
            params={"lat": 41.3275, "lng": 19.8187, "zoom": 12},
            timeout=30,
        )
        assert r.status_code == 200, r.text[:400]
        ctype = r.headers.get("content-type", "").lower()
        assert "text/html" in ctype, f"content-type was {ctype!r}"
        body = r.text
        low = body.lower()

        # (a) Google Maps JS bootstrap URL is present
        assert "maps.googleapis.com/maps/api/js" in body, "Google Maps JS bootstrap URL missing"
        # (b) new google.maps.Map( ... ) instantiation
        assert "new google.maps.Map(" in body, "google.maps.Map instantiation missing"
        # (c) API key parameter is present in the JS bootstrap URL
        assert "key=" in body, "API key parameter missing in JS URL"
        # Extract the key= param and ensure it's non-empty
        # e.g. .../js?key=AIza...&callback=...
        idx = body.find("key=")
        assert idx != -1
        tail = body[idx + 4: idx + 4 + 80]
        # first char after key= should NOT be '&' or empty or a quote
        assert tail and tail[0] not in ("&", '"', "'", " ", "\n"), f"API key looks empty: {tail!r}"

        # (d) Must NOT contain any Leaflet references
        assert "leaflet" not in low, "Leaflet reference found in Google Maps HTML"
        assert "l.tilelayer" not in low, "L.tileLayer call found in HTML"
        assert "unpkg.com/leaflet" not in low, "unpkg leaflet reference found"

        # Uses supplied lat/lng/zoom in the JS center config
        assert "41.3275" in body and "19.8187" in body
        assert "zoom: 12" in body or "zoom:12" in body

    def test_default_lat_lng_when_missing(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        assert r.status_code == 200
        body = r.text
        # Google Maps bootstrap present
        assert "maps.googleapis.com/maps/api/js" in body
        assert "new google.maps.Map(" in body
        # Default Tirana center and zoom 12 embedded
        assert "41.3275" in body, "default Tirana lat missing"
        assert "19.8187" in body, "default Tirana lng missing"
        assert ("zoom: 12" in body) or ("zoom:12" in body), "default zoom 12 missing"
        # No Leaflet
        assert "leaflet" not in body.lower()


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
        for k in ("formatted_address", "lat", "lng", "country_code", "city", "state", "serviceable"):
            assert k in data, f"missing key {k} in {list(data.keys())}"
        assert data["country_code"] == "AL", f"country_code was {data['country_code']!r}"
        assert data["serviceable"] is True
        assert data["city"] == "Tiranë", f"city was {data['city']!r}"
        assert isinstance(data["formatted_address"], str) and data["formatted_address"]
        assert abs(float(data["lat"]) - 41.3275) < 1e-4
        assert abs(float(data["lng"]) - 19.8187) < 1e-4

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
        assert data["country_code"] != "AL"
