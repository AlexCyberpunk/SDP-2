import json
import os
import sys

sys.path.append("/Volumes/SSD MAC  MINI 2025/Applications/Antigravity/Sea Distances/Eurostat -sea routes/searoute-1.4.3")
from searoute.searoute import setup_M
from searoute.utils import distance
import networkx as nx

def main():
    print("Setting up graph...")
    M = setup_M()
    
    with open('locations.json', 'r', encoding='utf-8') as f:
        locations = json.load(f)
        
    baleares = ['Alcudia', 'Ibiza', 'Mahon', 'Menorca', 'Palma', 'Palma de Mallorca', 'San Antonio', 'Puerto de la Savina', 'Formentera']
    
    spain_ports = [p for p in locations if p.get('country') == 'Spain' and p.get('name') not in baleares]
    
    out_dir = 'precalc'
    os.makedirs(out_dir, exist_ok=True)
    
    speeds = [8.0 + (i * 0.5) for i in range(19)]
    max_days = 5
    
    index_data = []

    print(f"Starting calculation for {len(spain_ports)} ports...")
    
    for idx, port in enumerate(spain_ports):
        port_name = port['name']
        lat, lng = port['lat'], port['lng']
        origin = (lng, lat)
        
        index_data.append({
            "name": port_name,
            "lat": lat,
            "lng": lng,
            "speeds": speeds
        })
        
        try:
            closest_node = M.kdtree.query(origin)
        except AttributeError:
            nodes = list(M.nodes())
            closest_node = min(nodes, key=lambda n: (n[0]-lng)**2 + (n[1]-lat)**2)
            
        print(f"[{idx+1}/{len(spain_ports)}] Running Dijkstra for {port_name}...")
        lengths = nx.single_source_dijkstra_path_length(M, closest_node, weight=lambda u, v, d: d.get('weight', distance(u,v)))
        
        for speed in speeds:
            filename = f"{port_name.replace(' ', '_').replace('/', '_')}_{speed:.1f}.json"
            filepath = os.path.join(out_dir, filename)
            
            speed_kmh = speed * 1.852
            features = []
            
            for day in range(1, max_days + 1):
                target_dist_km = speed_kmh * 24 * day
                lines = []
                visited_edges = set()
                
                def add_line(lon1, lat1, lon2, lat2):
                    if abs(lon1 - lon2) > 180:
                        lon2_adj = lon2 + 360 if lon2 < lon1 else lon2 - 360
                        denom = abs(lon2_adj - lon1)
                        if denom == 0:
                            lines.append([(lon1, lat1), (lon2, lat2)])
                            return
                        fraction = abs((180 if lon1 > 0 else -180) - lon1) / denom
                        if fraction <= 1.0:
                            mid_lat = lat1 + (lat2 - lat1) * fraction
                            lines.append([(lon1, lat1), (180 if lon1 > 0 else -180, mid_lat)])
                            lines.append([(-180 if lon1 > 0 else 180, mid_lat), (lon2, lat2)])
                        else:
                            lines.append([(lon1, lat1), (lon2, lat2)])
                    else:
                        lines.append([(lon1, lat1), (lon2, lat2)])
                
                for u, dist_u in lengths.items():
                    if dist_u > target_dist_km:
                        continue
                    for v in M.neighbors(u):
                        edge_id = tuple(sorted((u, v)))
                        if edge_id in visited_edges:
                            continue
                        visited_edges.add(edge_id)
                        
                        dist_v = lengths.get(v, float('inf'))
                        lon_u, lat_u = u[0], u[1]
                        lon_v, lat_v = v[0], v[1]
                        
                        if dist_v <= target_dist_km:
                            add_line(lon_u, lat_u, lon_v, lat_v)
                        else:
                            d = M.get_edge_data(u, v, default={}) if hasattr(M, 'get_edge_data') else M[u][v]
                            weight = d.get('weight', distance(u, v))
                            if weight > 0:
                                fraction = max(0.0, min(1.0, (target_dist_km - dist_u) / weight))
                                lon_v_adj = lon_v + 360 if (lon_v - lon_u) < -180 else (lon_v - 360 if (lon_v - lon_u) > 180 else lon_v)
                                interp_lon = lon_u + (lon_v_adj - lon_u) * fraction
                                interp_lat = lat_u + (lat_v - lat_u) * fraction
                                if interp_lon > 180: interp_lon -= 360
                                if interp_lon < -180: interp_lon += 360
                                add_line(lon_u, lat_u, interp_lon, interp_lat)
                                
                if lines:
                    features.append({
                        "type": "Feature",
                        "properties": {
                            "day": day,
                            "distance_nm": round(target_dist_km / 1.852, 1)
                        },
                        "geometry": {
                            "type": "MultiLineString",
                            "coordinates": lines
                        }
                    })
            
            features.reverse()
            geojson = {
                "type": "FeatureCollection",
                "features": features
            }
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(geojson, f)

    with open(os.path.join(out_dir, 'index.json'), 'w', encoding='utf-8') as f:
        json.dump(index_data, f)
        
    print("Done!")

if __name__ == '__main__':
    main()
