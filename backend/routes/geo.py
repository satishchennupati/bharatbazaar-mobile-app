"""Geo endpoints (Google Places/Geocoding proxy + interactive map picker HTML)."""
from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Query, Response

from config import GOOGLE_MAPS_API_KEY, SERVICEABLE_COUNTRY_CODES

router = APIRouter(prefix="/geo")


def _parse_google_address_components(components: list) -> dict:
    parts = {"country_code": None}
    for comp in components:
        types = comp.get("types", [])
        if "country" in types:
            parts["country_code"] = comp.get("short_name")
            parts["country"] = comp.get("long_name")
        if "postal_code" in types:
            parts["postal_code"] = comp.get("long_name")
        if "administrative_area_level_1" in types:
            parts["state"] = comp.get("long_name")
        if "administrative_area_level_2" in types:
            parts.setdefault("city", comp.get("long_name"))
        if "administrative_area_level_3" in types:
            # Often the "sub-district" or lagje — good area fallback.
            parts.setdefault("area", comp.get("long_name"))
        if "locality" in types:
            parts["city"] = comp.get("long_name")
        if "sublocality" in types or "sublocality_level_1" in types or "neighborhood" in types:
            # Prefer sublocality over admin_area_3.
            parts["area"] = comp.get("long_name")
        if "sublocality_level_2" in types:
            parts.setdefault("landmark", comp.get("long_name"))
        if "route" in types:
            parts.setdefault("street", comp.get("long_name"))
        if "street_number" in types:
            parts["street_number"] = comp.get("long_name")
        if "premise" in types or "point_of_interest" in types:
            parts.setdefault("landmark", comp.get("long_name"))
        if "establishment" in types:
            parts.setdefault("landmark", comp.get("long_name"))
    return parts


def _derive_area_and_landmark_from_formatted(
    formatted: str, city: str, area: str, landmark: str
) -> tuple[str, str]:
    """When Google's components are sparse, use the formatted_address parts.

    Formatted addresses in Albania typically look like:
        "Rr. XYZ, Nr. 12, Tirana 1001, Albania"
        "Kombinat, Tirana, Albania"
    We keep the middle segments (not first line1, not last city/country) as
    additional area/landmark fallbacks so the user sees meaningful data.
    """
    if not formatted:
        return area, landmark
    parts = [p.strip() for p in formatted.split(",") if p.strip()]
    # Drop leading line1 & trailing country + city (if they appear at end).
    middle = parts[1:-1] if len(parts) >= 3 else []
    # Filter out fragments that are just the city name or repeat the area.
    city_low = (city or "").lower()
    area_low = (area or "").lower()
    middle = [
        m for m in middle
        if m.lower() != city_low
        and not m.lower().startswith(city_low + " ")  # "Tirana 1001"
        and (not area_low or m.lower() != area_low)
    ]
    if not area and middle:
        area = middle[0]
        middle = middle[1:]
    if not landmark and middle:
        # Skip any leftover fragment that matches the (now-set) area.
        for m in middle:
            if m.lower() != (area or "").lower():
                landmark = m
                break
    return area, landmark


@router.get("/autocomplete")
async def geo_autocomplete(input: str = Query(..., min_length=2), country: str = Query("al")):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    params = {
        "input": input,
        "key": GOOGLE_MAPS_API_KEY,
        "components": f"country:{country.lower()}",
        "language": "en",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/place/autocomplete/json", params=params)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Places autocomplete failed")
    data = r.json()
    preds = [
        {
            "place_id": p.get("place_id"),
            "description": p.get("description"),
            "main_text": (p.get("structured_formatting") or {}).get("main_text"),
            "secondary_text": (p.get("structured_formatting") or {}).get("secondary_text"),
        }
        for p in data.get("predictions", [])
    ]
    return {"predictions": preds, "status": data.get("status")}


@router.get("/place-details")
async def geo_place_details(place_id: str = Query(...)):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    params = {
        "place_id": place_id,
        "key": GOOGLE_MAPS_API_KEY,
        "fields": "formatted_address,geometry/location,address_components,name,types",
        "language": "en",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/place/details/json", params=params)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Places details failed")
    data = r.json()
    result = data.get("result") or {}
    loc = ((result.get("geometry") or {}).get("location") or {})
    parsed = _parse_google_address_components(result.get("address_components", []))
    line1 = " ".join([p for p in [parsed.get("street_number"), parsed.get("street")] if p]) or (result.get("name") or "")
    # If the place itself is a business/POI (e.g. "Pyramid of Tirana"), also
    # surface its name as a landmark hint.
    result_types = result.get("types") or []
    landmark = parsed.get("landmark", "") or ""
    if not landmark and result.get("name") and (
        "establishment" in result_types
        or "point_of_interest" in result_types
        or "premise" in result_types
    ):
        landmark = result["name"]
    area = parsed.get("area", "") or ""
    area, landmark = _derive_area_and_landmark_from_formatted(
        result.get("formatted_address") or "", parsed.get("city") or "", area, landmark
    )
    serviceable = parsed["country_code"] in SERVICEABLE_COUNTRY_CODES
    return {
        "place_id": place_id,
        "formatted_address": result.get("formatted_address"),
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "country_code": parsed["country_code"],
        "country": parsed.get("country"),
        "state": parsed.get("state", ""),
        "city": parsed.get("city"),
        "area": area,
        "landmark": landmark,
        "postal_code": parsed.get("postal_code", ""),
        "line1": line1,
        "serviceable": serviceable,
        "unserviceable_reason": None if serviceable else "We currently deliver only within Albania.",
    }


@router.get("/reverse-geocode")
async def geo_reverse_geocode(lat: float = Query(...), lng: float = Query(...)):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    params = {"latlng": f"{lat},{lng}", "key": GOOGLE_MAPS_API_KEY, "language": "en"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get("https://maps.googleapis.com/maps/api/geocode/json", params=params)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Reverse geocoding failed")
    data = r.json()
    results = data.get("results") or []
    if not results:
        return {
            "place_id": None,
            "formatted_address": f"{lat:.5f}, {lng:.5f}",
            "lat": lat, "lng": lng,
            "country_code": None, "country": "",
            "state": "", "city": "", "area": "", "landmark": "", "postal_code": "", "line1": "",
            "serviceable": False,
            "unserviceable_reason": "No address found for this location.",
        }
    best = next(
        (res for res in results if any(t in ("street_address", "premise", "route") for t in res.get("types", []))),
        results[0],
    )
    parsed = _parse_google_address_components(best.get("address_components", []))
    line1 = " ".join([p for p in [parsed.get("street_number"), parsed.get("street")] if p])
    if not line1 and best.get("formatted_address"):
        line1 = best["formatted_address"].split(",")[0].strip()
    area = parsed.get("area", "") or ""
    landmark = parsed.get("landmark", "") or ""
    # Also mine any nearby POI in the geocode results as a landmark hint.
    if not landmark:
        for res in results:
            types = res.get("types") or []
            if "point_of_interest" in types or "establishment" in types:
                for comp in res.get("address_components") or []:
                    ctypes = comp.get("types") or []
                    if "point_of_interest" in ctypes or "establishment" in ctypes:
                        landmark = comp.get("long_name") or ""
                        if landmark:
                            break
            if landmark:
                break
    # Fallback: parse formatted_address for area / landmark hints.
    area, landmark = _derive_area_and_landmark_from_formatted(
        best.get("formatted_address") or "", parsed.get("city") or "", area, landmark
    )
    serviceable = parsed["country_code"] in SERVICEABLE_COUNTRY_CODES
    return {
        "place_id": best.get("place_id"),
        "formatted_address": best.get("formatted_address"),
        "lat": lat, "lng": lng,
        "country_code": parsed["country_code"],
        "country": parsed.get("country", ""),
        "state": parsed.get("state", ""),
        "city": parsed.get("city", ""),
        "area": area,
        "landmark": landmark,
        "postal_code": parsed.get("postal_code", ""),
        "line1": line1,
        "serviceable": serviceable,
        "unserviceable_reason": None if serviceable else "We currently deliver only within Albania.",
    }


@router.get("/map-picker")
async def geo_map_picker_page(
    lat: float = Query(41.3275),
    lng: float = Query(19.8187),
    zoom: int = Query(12, ge=6, le=19),
):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    html = f"""<!doctype html>
<html>
<head>
  <meta charset='utf-8'/>
  <meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no'/>
  <title>Pick location</title>
  <style>
    html, body, #map {{ height: 100%; margin: 0; padding: 0; }}
    body {{ font-family: -apple-system, system-ui, sans-serif; background: #fff; overflow: hidden; }}
    #map {{ width: 100%; touch-action: none; }}
    .center-pin {{
      position: fixed; top: 50%; left: 50%;
      transform: translate(-50%, -100%);
      pointer-events: none;
      z-index: 999;
      filter: drop-shadow(0 3px 4px rgba(0,0,0,0.4));
    }}
    .center-pin svg {{ display: block; }}
    .hint {{
      position: fixed; bottom: 12px; left: 12px; right: 68px;
      background: rgba(255,255,255,0.95); border-radius: 12px;
      padding: 10px 14px; font-size: 13px; color: #333;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15); text-align: center;
      z-index: 1000; font-weight: 600;
    }}
    .locate-btn {{
      position: fixed; bottom: 12px; right: 12px;
      width: 48px; height: 48px; border-radius: 24px;
      background: #fff; border: none;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,0.25);
      z-index: 1001; cursor: pointer;
      -webkit-tap-highlight-color: transparent;
    }}
    .locate-btn:active {{ background: #f5f5f5; }}
    .locate-btn.loading {{ opacity: 0.7; pointer-events: none; }}
    .locate-btn .spinner {{
      width: 20px; height: 20px; border-radius: 50%;
      border: 2px solid #FF5722; border-top-color: transparent;
      animation: spin 0.8s linear infinite;
    }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    .locate-btn.granted svg circle {{ fill: #FF5722; }}
    .fatal {{
      position: fixed; inset: 0; display: flex; align-items: center;
      justify-content: center; padding: 24px; text-align: center;
      color: #b71c1c; font-size: 14px; font-weight: 600;
      background: #fff;
    }}
  </style>
</head>
<body>
  <div id='map'></div>
  <div class='center-pin' aria-hidden='true'>
    <svg width='40' height='52' viewBox='0 0 40 52' xmlns='http://www.w3.org/2000/svg'>
      <path d='M20 0C9 0 0 9 0 20c0 15 20 32 20 32s20-17 20-32C40 9 31 0 20 0z' fill='#FF5722'/>
      <circle cx='20' cy='20' r='7' fill='#fff'/>
    </svg>
  </div>
  <div class='hint' id='hint'>Drag the map to place the pin</div>
  <button class='locate-btn' id='locateBtn' aria-label='Use my location' title='Use my location'>
    <svg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>
      <circle cx='12' cy='12' r='3' fill='#666'/>
      <path d='M12 2v3M12 19v3M2 12h3M19 12h3M12 6a6 6 0 100 12 6 6 0 000-12z'
            stroke='#666' stroke-width='2' fill='none' stroke-linecap='round'/>
    </svg>
  </button>
  <script>
    (function() {{
      var map = null;
      var userInteracted = false;
      var debounce;
      var locateBtn = document.getElementById('locateBtn');
      var hint = document.getElementById('hint');

      function post() {{
        if (!map) return;
        var c = map.getCenter();
        if (!c) return;
        var payload = {{ type: 'map-pin', lat: c.lat(), lng: c.lng(), zoom: map.getZoom() }};
        var msg = JSON.stringify(payload);
        try {{ window.parent.postMessage(msg, '*'); }} catch(e) {{}}
        if (window.ReactNativeWebView) {{
          try {{ window.ReactNativeWebView.postMessage(msg); }} catch(e) {{}}
        }}
      }}

      function flyTo(lat, lng, z) {{
        if (!map) return;
        userInteracted = true;
        map.panTo({{ lat: lat, lng: lng }});
        if (z) map.setZoom(z);
        clearTimeout(debounce);
        debounce = setTimeout(post, 500);
      }}

      function setLocateState(state) {{
        // state: 'idle' | 'loading' | 'granted' | 'denied'
        locateBtn.classList.remove('loading', 'granted');
        locateBtn.innerHTML = '';
        if (state === 'loading') {{
          locateBtn.classList.add('loading');
          var s = document.createElement('div');
          s.className = 'spinner';
          locateBtn.appendChild(s);
        }} else {{
          var color = state === 'granted' ? '#FF5722' : '#666';
          locateBtn.innerHTML = "<svg width='24' height='24' viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'>" +
            "<circle cx='12' cy='12' r='3' fill='" + color + "'/>" +
            "<path d='M12 2v3M12 19v3M2 12h3M19 12h3M12 6a6 6 0 100 12 6 6 0 000-12z' stroke='" + color + "' stroke-width='2' fill='none' stroke-linecap='round'/>" +
            "</svg>";
        }}
      }}

      function requestLocation(showHint) {{
        if (!navigator.geolocation) {{
          if (showHint) alert('Geolocation is not supported by your browser.');
          setLocateState('idle');
          return;
        }}
        setLocateState('loading');
        navigator.geolocation.getCurrentPosition(
          function(pos) {{
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            flyTo(lat, lng, 17);
            setLocateState('granted');
            hint.textContent = 'Pin placed at your current location';
          }},
          function(err) {{
            setLocateState('idle');
            if (showHint) {{
              hint.textContent = 'Location unavailable — drag the map to place the pin';
              setTimeout(function() {{ hint.textContent = 'Drag the map to place the pin'; }}, 3000);
            }}
          }},
          {{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }}
        );
      }}

      locateBtn.addEventListener('click', function() {{ requestLocation(true); }});

      window.__gm_ready = function() {{
        try {{
          map = new google.maps.Map(document.getElementById('map'), {{
            center: {{ lat: {lat}, lng: {lng} }},
            zoom: {zoom},
            disableDefaultUI: false,
            zoomControl: true,
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            gestureHandling: 'greedy',
            clickableIcons: false,
          }});
          map.addListener('dragstart', function() {{ userInteracted = true; }});
          map.addListener('dragend', function() {{
            clearTimeout(debounce);
            debounce = setTimeout(post, 250);
          }});
          map.addListener('zoom_changed', function() {{
            if (!userInteracted) return;
            clearTimeout(debounce);
            debounce = setTimeout(post, 250);
          }});
          window.addEventListener('message', function(ev) {{
            try {{
              var data = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data;
              if (data && data.type === 'fly-to' && typeof data.lat === 'number') {{
                flyTo(data.lat, data.lng, data.zoom || 15);
              }}
              if (data && data.type === 'request-locate') {{
                requestLocation(false);
              }}
            }} catch(e) {{}}
          }});
          setTimeout(post, 400);
          // Automatically try to zoom to the user's location on first load.
          // If permission is already granted (or the OS returns it silently),
          // this fires without a native prompt. Otherwise the OS prompts once
          // and — either way — the recenter button remains available.
          setTimeout(function() {{ requestLocation(false); }}, 600);
        }} catch (err) {{
          document.body.innerHTML = "<div class='fatal'>Unable to load Google Maps. Please make sure the Maps JavaScript API is enabled on the server key.</div>";
        }}
      }};
      window.gm_authFailure = function() {{
        document.body.innerHTML = "<div class='fatal'>Google Maps authentication failed. Please check that the API key is valid and Maps JavaScript API is enabled.</div>";
      }};
    }})();
  </script>
  <script async defer
    src='https://maps.googleapis.com/maps/api/js?key={GOOGLE_MAPS_API_KEY}&callback=__gm_ready&loading=async&v=weekly'></script>
</body>
</html>"""
    return Response(content=html, media_type="text/html; charset=utf-8")


@router.get("/static-map")
async def geo_static_map(
    lat: float = Query(...),
    lng: float = Query(...),
    zoom: int = Query(15, ge=8, le=20),
    width: int = Query(600, ge=100, le=800),
    height: int = Query(300, ge=100, le=400),
):
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=500, detail="Maps API key not configured")
    url = (
        "https://maps.googleapis.com/maps/api/staticmap"
        f"?center={lat},{lng}&zoom={zoom}&size={width}x{height}"
        f"&markers=color:0xFF5722%7C{lat},{lng}&key={GOOGLE_MAPS_API_KEY}"
        "&scale=2&style=feature:poi|element:labels|visibility:off"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(url)
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="static_map_unavailable")
    return Response(
        content=r.content,
        media_type=r.headers.get("content-type", "image/png"),
        headers={"Cache-Control": "public, max-age=86400"},
    )
