from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
import logging
import sys
import os

# Add the local searoute library to path
# (The searoute package folder must be located in the same directory)
from searoute import searoute
from isochrone import calculate_isochrones

app = FastAPI()

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import httpx
from typing import Optional

import json
import os

# Load actual Eurostat ports
try:
    with open("locations.json", "r", encoding="utf-8") as f:
        LOCATIONS = json.load(f)
except FileNotFoundError:
    LOCATIONS = []
    print("Warning: locations.json not found")

def load_live_vessels():
    try:
        with open("live_vessels.json", "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return []

class RouteRequest(BaseModel):
    origin: list[float]  # [longitude, latitude]
    destination: list[float] # [longitude, latitude]
    midpoint: Optional[list[float]] = None

class AddPortRequest(BaseModel):
    name: str
    country: str
    lat: float
    lng: float

# In-memory route cache for instant replies
# Key: f"{o_lng},{o_lat}_{m_lng},{m_lat}_{d_lng},{d_lat}" (midpoint is optional)
# Value: {"length": ..., "geometry": ...}
ROUTE_CACHE = {} # [longitude, latitude]

class WeatherRequest(BaseModel):
    route_coords: list # List of [lon, lat] points
    speed: float # Knots
    base_fuel: float # Metric tons per day
    total_distance: float # NM

class ReachabilityRequest(BaseModel):
    lat: float
    lng: float
    speed: float
    days: int

@app.post("/api/route")
async def calculate_route(req: RouteRequest):
    try:
        origin_pt = req.origin
        dest_pt = req.destination
        mid_pt = req.midpoint
        
        # Build cache key
        cache_key = f"{origin_pt[0]},{origin_pt[1]}_"
        if mid_pt:
            cache_key += f"{mid_pt[0]},{mid_pt[1]}_"
        cache_key += f"{dest_pt[0]},{dest_pt[1]}"
        
        # Check cache
        if cache_key in ROUTE_CACHE:
            print(f"Cache hit for route: {cache_key}")
            return ROUTE_CACHE[cache_key]
        
        # Determine routing logic
        if mid_pt:
            route1 = searoute(origin_pt, mid_pt, units="nm")
            route2 = searoute(mid_pt, dest_pt, units="nm")
            
            combined_coords = route1["geometry"]["coordinates"] + route2["geometry"]["coordinates"][1:]
            
            result = {
                "type": "Feature",
                "properties": {"units": "nautical miles"},
                "geometry": {
                    "type": "LineString",
                    "coordinates": combined_coords
                }
            }
        else:
            route = searoute(origin_pt, dest_pt, units="nm")
            result = route
            
        # The searoute library calculates distance based on grid-node traversal (taxicab geometry)
        # which highly overestimates the exact physical route distance. We instead calculate the 
        # actual Haversine distance of the simplified, smoothed route geometry returned.
        coords_for_calc = result["geometry"]["coordinates"]
        true_length = 0
        for i in range(len(coords_for_calc) - 1):
            true_length += haversine_distance(coords_for_calc[i], coords_for_calc[i+1])
            
        result["properties"]["length"] = true_length
            
        # Save to cache
        ROUTE_CACHE[cache_key] = result
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
async def search_locations(q: str, filter_type: Optional[str] = None):
    q = q.lower()
    results = []
    
    # Combine static locations and live vessels
    all_locations = LOCATIONS.copy()
    if not filter_type or filter_type == "vessel":
        all_locations.extend(load_live_vessels())
    
    for loc in all_locations:
        if filter_type and loc.get("type", "unknown") != filter_type:
            continue
            
        name_match = "name" in loc and q in str(loc["name"]).lower()
        imo_match = "imo" in loc and q in str(loc["imo"]).lower()
        code_match = "code" in loc and q in str(loc.get("code", "")).lower()
        
        if name_match or imo_match or code_match:
            results.append(loc)
        
        # Limit results so we don't send 4000 items if they type 'a'
        if len(results) >= 25: 
            break
            
    return results

@app.post("/api/add_port")
async def add_port(req: AddPortRequest):
    try:
        new_port = {
            "name": req.name,
            "type": "port",
            "lat": req.lat,
            "lng": req.lng,
            "code": "CUSTM",
            "country": req.country
        }
        
        # Add to in-memory list so it's instantly searchable
        LOCATIONS.append(new_port)
        
        # Add to disk so it persists
        try:
            with open("locations.json", "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            data = []
            
        data.append(new_port)
        
        with open("locations.json", "w", encoding="utf-8") as f:
            json.dump(data, f)
            
        return {"status": "success", "port": new_port}
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/all_ports")
async def get_all_ports():
    return LOCATIONS

@app.get("/api/all_vessels")
async def get_all_vessels():
    return load_live_vessels()

import math
def haversine_distance(coord1, coord2):
    # coord = [lon, lat]
    lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
    lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 3440.065 # Radius of earth in nautical miles
    return c * r

@app.post("/api/weather")
async def check_weather(request: WeatherRequest):
    coords = request.route_coords
    base_speed = request.speed
    base_fuel_per_day = getattr(request, 'base_fuel', 20.0)
    
    if not coords or len(coords) < 2:
        return {"weather_html": "<p>Invalid route for weather check.</p>", "avg_wave_meters": 0, "impact_level": 0}
        
    # We will walk the coords array
    curr_coord_idx = 0
    curr_point = coords[0]
    
    # Pre-calculate measured total distance
    measured_dist = 0
    for i in range(len(coords)-1):
        measured_dist += haversine_distance(coords[i], coords[i+1])
        
    if measured_dist == 0:
        return {"weather_html": "<p>0 NM route.</p>", "avg_wave_meters": 0, "impact_level": 0}

    dist_covered_so_far = 0.0
    day_logs = []
    current_day = 0
    total_waves = 0
    wave_samples = 0
    total_time_days = 0.0
    total_fuel_mt = 0.0
    
    async with httpx.AsyncClient() as client:
        while curr_coord_idx < len(coords) - 1:
            # 1. Fetch weather forecast for the CURRENT projected position, looking ahead to the forecast for current_day
            lon, lat = curr_point
            
            # Forecasts usually go up to 7-14 days. If voyage is > 7 days, we cap the lookahead index.
            # Open-Meteo provides hourly arrays. 1 day = 24 hours.
            hour_index = min(current_day * 24, 160) # roughly 6.5 days max lookahead for standard free tier without archival
            
            wave_height = 0.0
            url = f"https://marine-api.open-meteo.com/v1/marine?latitude={lat}&longitude={lon}&hourly=wave_height&timezone=UTC"
            try:
                resp = await client.get(url)
                if resp.status_code == 200:
                    data = resp.json()
                    hourly_waves = data.get("hourly", {}).get("wave_height", [])
                    if hourly_waves and len(hourly_waves) > hour_index and hourly_waves[hour_index] is not None:
                        wave_height = hourly_waves[hour_index]
            except Exception as e:
                pass
                
            total_waves += wave_height
            wave_samples += 1
            
            # 2. Apply Speed Penalty based on wave height
            penalty_pct = 0.0
            if wave_height > 3.0:
                penalty_pct = 0.15
            elif wave_height > 2.0:
                penalty_pct = 0.05
                
            actual_speed = base_speed * (1.0 - penalty_pct)
            
            # 3. Calculate how far we can travel in this 24h period (or remaining distance)
            max_dist_today = actual_speed * 24.0
            
            # Walk the generic polygon coords until we exhaust today's distance
            dist_left_today = max_dist_today
            hit_destination = False
            
            while dist_left_today > 0 and curr_coord_idx < len(coords) - 1:
                next_point = coords[curr_coord_idx + 1]
                leg_dist = haversine_distance(curr_point, next_point)
                
                if leg_dist <= dist_left_today:
                    # We consume this leg fully
                    dist_left_today -= leg_dist
                    curr_point = next_point
                    curr_coord_idx += 1
                    if curr_coord_idx == len(coords) - 1:
                        hit_destination = True
                        break
                else:
                    # We end the day midway through this leg
                    fraction = dist_left_today / leg_dist
                    # Linear interpolation for simplicity (spherical is better but fine for small segments)
                    new_lon = curr_point[0] + (next_point[0] - curr_point[0]) * fraction
                    new_lat = curr_point[1] + (next_point[1] - curr_point[1]) * fraction
                    curr_point = [new_lon, new_lat]
                    dist_left_today = 0
                    break
                    
            actual_dist_today = max_dist_today - dist_left_today
            dist_covered_so_far += actual_dist_today
            time_spent_days = actual_dist_today / (actual_speed * 24.0) if actual_speed > 0 else 0
            
            total_time_days += time_spent_days
            total_fuel_mt += time_spent_days * base_fuel_per_day
            
            day_logs.append({
                "day": current_day + 1,
                "lat": curr_point[1],
                "lon": curr_point[0],
                "wave": wave_height,
                "speed": actual_speed,
                "dist": actual_dist_today
            })
            
            current_day += 1
            if hit_destination or current_day > 30: # Safety break at 30 days
                break
                
    avg_wave = total_waves / wave_samples if wave_samples > 0 else 0
    overall_impact = 3 if avg_wave > 3.0 else (2 if avg_wave > 2.0 else 1)
    
    # Build HTML table snippet
    html = f"""
    <div style="font-size: 0.8rem; max-height: 200px; overflow-y: auto; text-align: left; margin: 10px 0;">
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border); color: var(--text-secondary);">
                    <th style="padding: 4px; text-align: left;">Day</div>
                    <th style="padding: 4px; text-align: right;">Wave</div>
                    <th style="padding: 4px; text-align: right;">Speed</div>
                </tr>
            </thead>
            <tbody>
    """
    for log in day_logs:
        color = "var(--accent-red)" if log['wave'] > 3.0 else ("#facc15" if log['wave'] > 2.0 else "var(--text-primary)")
        html += f"""
                <tr style="border-bottom: 1px dashed rgba(255,255,255,0.1);">
                    <td style="padding: 4px;">{log['day']}</td>
                    <td style="padding: 4px; text-align: right; color: {color};">{log['wave']:.1f}m</td>
                    <td style="padding: 4px; text-align: right;">{log['speed']:.1f}kn</td>
                </tr>
        """
    html += "</tbody></table></div>"

    return {
        "avg_wave_meters": round(avg_wave, 2),
        "impact_level": overall_impact,
        "total_days": round(total_time_days, 2),
        "total_fuel": round(total_fuel_mt, 2),
        "weather_html": html
    }

@app.post("/api/reachability")
async def generate_reachability(req: ReachabilityRequest):
    try:
        geojson = calculate_isochrones(req.lng, req.lat, req.speed, req.days)
        return geojson
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Ensure precalc dir exists
os.makedirs("precalc", exist_ok=True)

import zipfile
from fastapi.responses import Response
import glob

# Auto-reconstruct the split ZIP file if downloading from GitHub limits
zip_path = "precalc_data.zip"
if not os.path.exists(zip_path):
    parts = sorted(glob.glob("precalc_data_part_*"))
    if parts:
        print(f"Reconstructing {zip_path} from {len(parts)} parts...")
        with open(zip_path, 'wb') as outfile:
            for part in parts:
                with open(part, 'rb') as infile:
                    outfile.write(infile.read())
        print("Reconstruction complete.")

@app.get("/api/precalc/{filename}")
async def get_precalc_file(filename: str):
    if not os.path.exists(zip_path):
        # Fallback to direct directory if zip isn't generated
        file_path = os.path.join("precalc", filename)
        if os.path.exists(file_path):
            return FileResponse(file_path)
        raise HTTPException(status_code=404, detail="File not found")
        
    try:
        with zipfile.ZipFile(zip_path, 'r') as zf:
            internal_path = f"precalc/{filename}"
            if internal_path in zf.namelist():
                content = zf.read(internal_path)
                return Response(content, media_type="application/json")
            else:
                # Try simple filename just in case it was zipped without the precalc/ prefix
                if filename in zf.namelist():
                    content = zf.read(filename)
                    return Response(content, media_type="application/json")
                raise HTTPException(status_code=404, detail="File not found in archive")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Serve the frontend static files
app.mount("/", StaticFiles(directory="../frontend", html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

