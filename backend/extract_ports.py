import sys
sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from searoute.data.ports_dict import node_list as port_n
import json

print(f"Loaded {len(port_n)} ports.")

clean_ports = []
for coords, data in port_n.items():
    clean_ports.append({
        "name": data.get("name", data.get("port", "Unknown Port")),
        "type": "port",
        "lat": coords[1],
        "lng": coords[0],
        "code": data.get("port", ""),
        "country": data.get("cty", "")
    })

# Add custom missing ports
clean_ports.append({
    "name": "Avilés",
    "type": "port",
    "lat": 43.5931,
    "lng": -5.9345,
    "code": "ESAVI",
    "country": "Spain"
})

with open("locations.json", "w") as f:
    json.dump(clean_ports, f)
print("Saved to locations.json")
