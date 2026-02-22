import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from isochrone import calculate_isochrones

try:
    geojson = calculate_isochrones(4.3, 51.9, 10.0, 3)
    print("Success, features:", len(geojson['features']))
except Exception as e:
    import traceback
    traceback.print_exc()
