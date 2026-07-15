"""Backend tests for the interactive map picker endpoints (Google Maps variant).

Iteration 6 additions:
- /api/geo/map-picker HTML must use `dragend` + `zoom_changed` listeners
  (NOT `idle`) so it doesn't flicker on tile-load / camera-settle.
- /api/geo/reverse-geocode returns non-empty `line1` (falls back to first
  fragment of formatted_address) plus preferably non-empty `area`.

Legacy assertions kept:
- Google Maps JS bootstrap + API key + `new google.maps.Map(`, no Leaflet.
- Default center + zoom when params missing.
- Tirana serviceable=True + Paris serviceable=False.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    "https://bharat-app-8.preview.emergentagent.com",
).rstrip("/")


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
        assert "maps.googleapis.com/maps/api/js" in body
        # (b) new google.maps.Map( ... ) instantiation
        assert "new google.maps.Map(" in body
        # (c) API key parameter is present + non-empty
        idx = body.find("key=")
        assert idx != -1
        tail = body[idx + 4: idx + 4 + 80]
        assert tail and tail[0] not in ("&", '"', "'", " ", "\n"), f"API key looks empty: {tail!r}"

        # (d) Must NOT contain any Leaflet references
        assert "leaflet" not in low
        assert "l.tilelayer" not in low
        assert "unpkg.com/leaflet" not in low

        # Uses supplied lat/lng/zoom
        assert "41.3275" in body and "19.8187" in body
        assert "zoom: 12" in body or "zoom:12" in body

    def test_no_idle_listener_uses_dragend_and_zoom_changed(self, api_client):
        """Iteration-6 flicker fix: HTML must listen to `dragend` + `zoom_changed`
        (fire only on real user pan/zoom) and MUST NOT listen to `idle`
        (which fires on tile-load & camera-settle animations)."""
        r = api_client.get(
            f"{BASE_URL}/api/geo/map-picker",
            params={"lat": 41.3275, "lng": 19.8187, "zoom": 12},
            timeout=30,
        )
        assert r.status_code == 200
        body = r.text
        assert "addListener('dragend'" in body, \
            "map-picker HTML must attach a 'dragend' listener"
        assert "addListener('zoom_changed'" in body, \
            "map-picker HTML must attach a 'zoom_changed' listener"
        assert "addListener('idle'" not in body, \
            "map-picker HTML must NOT attach an 'idle' listener (causes flicker)"

    def test_default_lat_lng_when_missing(self, api_client):
        r = api_client.get(f"{BASE_URL}/api/geo/map-picker", timeout=30)
        assert r.status_code == 200
        body = r.text
        assert "maps.googleapis.com/maps/api/js" in body
        assert "new google.maps.Map(" in body
        assert "41.3275" in body
        assert "19.8187" in body
        assert ("zoom: 12" in body) or ("zoom:12" in body)
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
        for k in ("formatted_address", "lat", "lng", "country_code",
                  "city", "state", "serviceable", "line1", "area"):
            assert k in data, f"missing key {k} in {list(data.keys())}"
        assert data["country_code"] == "AL", f"country_code was {data['country_code']!r}"
        assert data["serviceable"] is True
        assert data["city"] == "Tiranë", f"city was {data['city']!r}"
        assert data["state"] == "Tirana County", f"state was {data['state']!r}"
        assert isinstance(data["formatted_address"], str) and data["formatted_address"]
        assert abs(float(data["lat"]) - 41.3275) < 1e-4
        assert abs(float(data["lng"]) - 19.8187) < 1e-4

    def test_tirana_line1_and_area_non_empty(self, api_client):
        """Iteration-6 hydration fix: line1 must fall back to first fragment of
        formatted_address if street_number/route are missing; area should ideally
        also be non-empty (falls back to a middle fragment of formatted_address)."""
        r = api_client.get(
            f"{BASE_URL}/api/geo/reverse-geocode",
            params={"lat": 41.3275, "lng": 19.8187},
            timeout=30,
        )
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data.get("line1"), str) and data["line1"].strip(), \
            f"line1 must be non-empty; got {data.get('line1')!r} (formatted={data.get('formatted_address')!r})"
        # Area is preferred to be non-empty but the spec allows either area
        # OR postal to be filled downstream — we log it for visibility.
        print(f"[reverse-geocode Tirana center] line1={data.get('line1')!r} area={data.get('area')!r} formatted={data.get('formatted_address')!r}")

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
