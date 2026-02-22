import json
import math

def haversine_distance(coord1, coord2):
    lon1, lat1 = math.radians(coord1[0]), math.radians(coord1[1])
    lon2, lat2 = math.radians(coord2[0]), math.radians(coord2[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat/2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon/2)**2
    c = 2 * math.asin(math.sqrt(a))
    r = 3440.065
    return c * r

res = json.load(open('gijon_huelva_debug.json'))
coords = res['geometry']['coordinates']
print("Searoute Length Prop:", res['properties']['length'])

total = 0
for i in range(len(coords)-1):
    total += haversine_distance(coords[i], coords[i+1])

print("Haversine Sum of GeoJSON Array:", total)
