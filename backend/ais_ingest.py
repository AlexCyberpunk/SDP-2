import asyncio
import websockets
import json
import os
import time
import ssl

API_KEY = os.environ.get("AIS_API_KEY", "")

# We will maintain a dictionary of active cargo ships
# Key: MMSI, Value: Dict of vessel data
active_vessels = {}

# File to sync active vessels to
DB_FILE = "live_vessels.json"

def save_to_disk():
    # Only save vessels that have at least some basic information
    # and have sent a PositionReport recently
    valid_vessels = []
    current_time = time.time()
    
    for mmsi, data in list(active_vessels.items()):
        # Drop vessels not updated in the last 24 hours
        if current_time - data.get("last_updated", 0) > 86400:
            del active_vessels[mmsi]
            continue
            
        if "lat" in data and "lng" in data and "name" in data:
            valid_vessels.append({
                "mmsi": mmsi,
                "name": data["name"],
                "imo": data.get("imo", "Unknown"),
                "lat": data["lat"],
                "lng": data["lng"],
                "type": "vessel",
                "ship_type": data.get("ship_type", 0),
                "length": data.get("length", 0),
                "beam": data.get("beam", 0),
                "dwt": data.get("dwt", 0)
            })
            
    with open(DB_FILE, "w") as f:
        json.dump(valid_vessels, f)
    print(f"Saved {len(valid_vessels)} live bulk carriers to disk.")

async def connect_ais_stream():
    if not API_KEY:
        print("ERROR: AIS_API_KEY environment variable not set. Please set it to your aisstream.io API key.")
        return

    # Subscribe to the entire world and filter to Cargo Ships (ShipType 70-79) 
    # Or just listen to everything and filter locally. aisstream allows filtering by vessel category, but 
    # it's usually safer to do local filtering. We will just subscribe to Position and Static Data.
    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": [[[-90, -180], [90, 180]]],
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
    }

    print("Connecting to AISStream.io...")
    
    # Bypass SSL verification locally
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ssl_context.check_hostname = False
    ssl_context.verify_mode = ssl.CERT_NONE
    
    msg_count = 0
    while True:
        try:
            async with websockets.connect("wss://stream.aisstream.io/v0/stream", ssl=ssl_context) as websocket:
                await websocket.send(json.dumps(subscribe_message))
                print("Connected and subscribed!")
                
                last_save_time = time.time()
                
                async for message_json in websocket:
                    msg_count += 1
                    message = json.loads(message_json)
                    msg_type = message.get("MessageType")
                    msg_data = message.get("Message", {})
                    
                    if msg_count % 50 == 0:
                        print(f"Received {msg_count} messages so far... Tracking {len(active_vessels)} potential vessels.")
                    
                    if msg_type == "PositionReport":
                        pr = msg_data.get("PositionReport", {})
                        mmsi = str(pr.get("UserID", ""))
                        
                        # Only track it if we already established it's a cargo ship via ShipStaticData
                        # Or if we want to store positions first and wait to classify
                        if mmsi not in active_vessels:
                            active_vessels[mmsi] = {"is_cargo": False}
                            
                        active_vessels[mmsi]["lat"] = pr.get("Latitude")
                        active_vessels[mmsi]["lng"] = pr.get("Longitude")
                        active_vessels[mmsi]["last_updated"] = time.time()
                        
                    elif msg_type == "ShipStaticData":
                        ssd = msg_data.get("ShipStaticData", {})
                        mmsi = str(ssd.get("UserID", ""))
                        ship_type = ssd.get("Type", 0)
                        
                        try:
                            ship_type = int(ship_type)
                        except ValueError:
                            ship_type = 0
                        
                        # Cargo ships are 70-79
                        if 70 <= ship_type <= 79:
                            if mmsi not in active_vessels:
                                active_vessels[mmsi] = {}
                            
                            active_vessels[mmsi]["is_cargo"] = True
                            active_vessels[mmsi]["ship_type"] = ship_type
                            active_vessels[mmsi]["name"] = ssd.get("Name", "").strip()
                            active_vessels[mmsi]["imo"] = str(ssd.get("ImoNumber", ""))
                            
                            # Calculate dimensions
                            dim_bow = ssd.get("DimensionToBow", 0)
                            dim_stern = ssd.get("DimensionToStern", 0)
                            dim_port = ssd.get("DimensionToPort", 0)
                            dim_starboard = ssd.get("DimensionToStarboard", 0)
                            
                            length = dim_bow + dim_stern
                            beam = dim_port + dim_starboard
                            
                            # Empirical DWT estimation for bulk carriers
                            # Assuming typical block coefficient and draft relationships
                            # Rough DWT ~ (L * B * Draft) * Cb. Let's use Draft ~ 11m.
                            dwt = int((length * beam * 11) * 0.75) if length > 0 and beam > 0 else 0
                            
                            active_vessels[mmsi]["length"] = length
                            active_vessels[mmsi]["beam"] = beam
                            active_vessels[mmsi]["dwt"] = dwt
                            
                            active_vessels[mmsi]["last_updated"] = time.time()
                            print(f"[NEW BULK CARRIER FOUND]: {active_vessels[mmsi]['name']} (MMSI: {mmsi}) - L:{length}m B:{beam}m DWT:~{dwt}")
                    
                    # Periodically save down valid cargo ships (e.g. every 10 seconds)
                    if time.time() - last_save_time > 10:
                        save_to_disk()
                        last_save_time = time.time()
                        
        except Exception as e:
            print(f"WebSocket Error: {e}")
            print("Reconnecting in 5 seconds...")
            await asyncio.sleep(5)

if __name__ == "__main__":
    asyncio.run(connect_ais_stream())
