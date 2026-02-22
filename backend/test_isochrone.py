import time
from searoute import searoute
import math

def calculate_radials(lat, lng, radius_nm, num_points):
    points = []
    # 1 NM is approx 1/60th of a degree of latitude.
    # We will just roughly estimate the target points using simple math for test purposes.
    for i in range(num_points):
        angle = math.radians(i * (360 / num_points))
        # rough approx
        delta_lat = (radius_nm / 60.0) * math.cos(angle)
        delta_lng = (radius_nm / (60.0 * math.cos(math.radians(lat)))) * math.sin(angle)
        
        target_lat = min(max(lat + delta_lat, -89.9), 89.9)
        target_lng = lng + delta_lng
        if target_lng > 180: target_lng -= 360
        if target_lng < -180: target_lng += 360
        
        points.append((target_lng, target_lat))
    return points

start_time = time.time()
origin = (4.3, 51.9) # Rotterdam approx (lng, lat)
radials = calculate_radials(51.9, 4.3, 2000, 32)
routes = []

print(f"Generated {len(radials)} radials. Routing...")

for p in radials:
    try:
        route = searoute(origin, p)
        routes.append(route)
    except Exception as e:
        print(f"Error route to {p}: {e}")

end_time = time.time()
print(f"Calculated {len(routes)} routes in {end_time - start_time:.2f} seconds.")
