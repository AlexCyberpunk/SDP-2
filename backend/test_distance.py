import json
import math
import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from searoute import searoute

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

origin = [-5.4, 36.1] # Algeciras approx
dest = [-74.0, 40.7] # NYC approx

route = searoute(origin, dest, units="nm")
coords = route["geometry"]["coordinates"]
searoute_length = route["properties"]["length"]

total_haversine = 0
for i in range(len(coords)-1):
    total_haversine += haversine_distance(coords[i], coords[i+1])

print(f"Searoute Length (NM): {searoute_length}")
print(f"Haversine Sum (NM): {total_haversine}")
