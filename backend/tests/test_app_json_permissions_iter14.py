"""Iter 14: static config verification for Google Play permission fix.

Primary win condition:
  /app/frontend/app.json android.permissions list does NOT contain READ_MEDIA_IMAGES.
Secondary win condition:
  expo-image-picker plugin config disables auto-injection of media permissions
  (photosPermission=false, cameraPermission=false, microphonePermission=false).
Plus minimal backend health regression sanity.
"""
import json
import os
import pytest
import requests

APP_JSON_PATH = "/app/frontend/app.json"
BASE_URL = os.environ.get("EXPO_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def app_json():
    with open(APP_JSON_PATH, "r") as f:
        return json.load(f)


# ---------- app.json permission contract ----------
class TestAndroidPermissions:
    def test_android_permissions_exact_shape(self, app_json):
        perms = app_json["expo"]["android"]["permissions"]
        assert perms == ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION"], (
            f"android.permissions must be exactly [FINE, COARSE]; got {perms}"
        )

    @pytest.mark.parametrize(
        "forbidden",
        [
            "READ_MEDIA_IMAGES",
            "READ_MEDIA_VIDEO",
            "READ_EXTERNAL_STORAGE",
            "WRITE_EXTERNAL_STORAGE",
            "android.permission.READ_MEDIA_IMAGES",
        ],
    )
    def test_forbidden_permission_absent(self, app_json, forbidden):
        perms = app_json["expo"]["android"]["permissions"]
        assert forbidden not in perms, f"{forbidden} MUST NOT be in android.permissions"

    def test_no_forbidden_string_anywhere_in_config(self, app_json):
        raw = json.dumps(app_json)
        for bad in ("READ_MEDIA_IMAGES", "READ_MEDIA_VIDEO",
                    "READ_EXTERNAL_STORAGE", "WRITE_EXTERNAL_STORAGE"):
            assert bad not in raw, f"{bad} still present somewhere in app.json"


# ---------- expo-image-picker plugin config ----------
class TestImagePickerPluginConfig:
    def _find_plugin(self, app_json, name):
        for entry in app_json["expo"]["plugins"]:
            if isinstance(entry, list) and entry and entry[0] == name:
                return entry
            if entry == name:
                return [entry, None]
        return None

    def test_plugin_present(self, app_json):
        entry = self._find_plugin(app_json, "expo-image-picker")
        assert entry is not None, "expo-image-picker plugin entry missing"
        assert isinstance(entry, list) and len(entry) == 2, \
            "expo-image-picker must be [name, configObject]"

    def test_plugin_disables_all_perms(self, app_json):
        entry = self._find_plugin(app_json, "expo-image-picker")
        assert entry is not None
        cfg = entry[1]
        assert isinstance(cfg, dict), "expo-image-picker config must be an object"
        assert cfg.get("photosPermission") is False, "photosPermission must be false"
        assert cfg.get("cameraPermission") is False, "cameraPermission must be false"
        assert cfg.get("microphonePermission") is False, "microphonePermission must be false"


# ---------- iOS infoPlist description strings preserved ----------
class TestIOSInfoPlist:
    def test_location_description_present(self, app_json):
        ip = app_json["expo"]["ios"]["infoPlist"]
        assert ip.get("NSLocationWhenInUseUsageDescription"), \
            "NSLocationWhenInUseUsageDescription must be preserved"

    def test_photo_library_description_present(self, app_json):
        ip = app_json["expo"]["ios"]["infoPlist"]
        val = ip.get("NSPhotoLibraryUsageDescription")
        assert val and isinstance(val, str) and len(val) > 0, \
            "NSPhotoLibraryUsageDescription must be preserved as non-empty string"


# ---------- Minimal backend regression ----------
class TestBackendRegression:
    def test_health(self):
        r = requests.get(f"{BASE_URL}/api/health", timeout=10)
        assert r.status_code == 200, r.text
        assert r.json().get("status") in ("ok", "healthy", "up") or r.json(), r.text

    def test_categories_list(self):
        r = requests.get(f"{BASE_URL}/api/categories", timeout=10)
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_products_list(self):
        r = requests.get(f"{BASE_URL}/api/products", timeout=10)
        assert r.status_code == 200, r.text
        body = r.json()
        assert isinstance(body, (list, dict))

    def test_customer_login(self):
        r = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"phone": "+355695808480", "password": "123456"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and "user" in data

    def test_admin_login(self):
        r = requests.post(
            f"{BASE_URL}/api/admin/auth/login",
            json={"phone": "+355690000001", "password": "admin123"},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data and data.get("user", {}).get("is_admin") is True

    def test_offers_public(self):
        r = requests.get(f"{BASE_URL}/api/offers", timeout=10)
        # Public offers endpoint should exist; accept 200 with list, else skip
        if r.status_code == 404:
            pytest.skip("public /api/offers not implemented under this path")
        assert r.status_code == 200, r.text
