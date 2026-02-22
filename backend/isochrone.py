from searoute.searoute import setup_M
from searoute.utils import distance
from shapely.geometry import MultiPoint, Point, Polygon
from shapely.ops import unary_union
import networkx as nx
import math
from typing import Dict, Any

# Ensure we have the loaded Marnet graph
M = setup_M()

def calculate_isochrones(origin_lon: float, origin_lat: float, speed_knots: float, max_days: int) -> Dict[str, Any]:
    origin = (origin_lon, origin_lat)
    
    # Locate closest node on the maritime network
    try:
        closest_node = M.kdtree.query(origin)
    except AttributeError:
        # Fallback if M.kdtree isn't initialized standardly
        # Simple Euclidean search among all nodes
        nodes = list(M.nodes())
        closest_node = min(nodes, key=lambda n: (n[0]-origin_lon)**2 + (n[1]-origin_lat)**2)

    # 1 Knot = 1 Nautical mile per hour = 1.852 km per hour
    speed_kmh = speed_knots * 1.852
    
    # We want to find nodes reachable in K kilometers.
    # searoute edge weights by default are lengths in km (or approximately so based on their utils distance()).
    # Let's ensure weight is treated as km
    
    # Run Dijkstra from the closest node to find all distances
    # weight='weight' uses the graph's pre-calculated edge distances
    lengths = nx.single_source_dijkstra_path_length(M, closest_node, weight=lambda u, v, d: d.get('weight', distance(u,v)))
    
    features = []
    
    for day in range(1, max_days + 1):
        target_dist_km = speed_kmh * 24 * day
        
        lines = []
        visited_edges = set()
        
        def add_line(lon1, lat1, lon2, lat2):
            if abs(lon1 - lon2) > 180:
                lon2_adj = lon2 + 360 if lon2 < lon1 else lon2 - 360
                # Protect against division by zero
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
        
        for u in lengths:
            dist_u = lengths[u]
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
                    # Both nodes are reachable
                    add_line(lon_u, lat_u, lon_v, lat_v)
                else:
                    # u is reachable, v is not. We find the interpolation point.
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

    # Sort in reverse so larger extents (day N) render below smaller ones (day 1)
    features.reverse()
    
    return {
        "type": "FeatureCollection",
        "features": features
    }
