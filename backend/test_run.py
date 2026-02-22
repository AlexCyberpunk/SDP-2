import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/sea-distance-web/backend")
from isochrone import calculate_isochrones
import json

# Bay of Biscay coordinate roughly: 45.0, -5.0
result = calculate_isochrones(-5.0, 45.0, 15.0, 3) 
print(json.dumps(result, indent=2))
