import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from searoute import searoute
import json

gijon = [-5.6615, 43.5357]
huelva = [-6.9508, 37.2614]

route = searoute(gijon, huelva, units="nm")

print(f"Length: {route['properties']['length']} NM")
with open("gijon_huelva_debug.json", "w") as f:
    json.dump(route, f)
    
