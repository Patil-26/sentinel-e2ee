# backend/main.py
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List

app = FastAPI(title="Sentinel E2EE Relay", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
        # Store-and-Forward Vault: Temporarily holds encrypted payloads for offline users
        self.offline_queue: Dict[str, List[dict]] = {}

    async def connect(self, websocket: WebSocket, client_id: str):
        await websocket.accept()
        self.active_connections[client_id] = websocket
        print(f"[SYSTEM] Client '{client_id}' connected. Total active: {len(self.active_connections)}")

        # Check if this user has any pending offline messages
        if client_id in self.offline_queue and self.offline_queue[client_id]:
            pending_count = len(self.offline_queue[client_id])
            print(f"[STORE-AND-FORWARD] Delivering {pending_count} queued packets to '{client_id}'")
            
            # Flush the queue to the user
            for payload in self.offline_queue[client_id]:
                await websocket.send_text(json.dumps(payload))
            
            # Instantly delete the queue from server memory to maintain zero-trust
            del self.offline_queue[client_id]

    def disconnect(self, client_id: str):
        if client_id in self.active_connections:
            del self.active_connections[client_id]
            print(f"[SYSTEM] Client '{client_id}' disconnected.")

    async def send_system_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(json.dumps({"type": "system", "message": message}))

    async def route_message(self, sender_id: str, payload: dict):
        target_id = payload.get("target_id")
        encrypted_data = payload.get("data")
        tier = payload.get("tier", 1)

        if not target_id:
            return

        forward_payload = {
            "type": "message",
            "sender_id": sender_id,
            "data": encrypted_data,
            "tier": tier,
            "timestamp": payload.get("timestamp")
        }

        if target_id in self.active_connections:
            # Target is online, route immediately
            target_socket = self.active_connections[target_id]
            await target_socket.send_text(json.dumps(forward_payload))
            print(f"[RELAY] Blindly routed packet from '{sender_id}' to '{target_id}' with Tier {tier}")
        else:
            # Target is offline, push to the encrypted holding queue
            print(f"[STORE-AND-FORWARD] Target '{target_id}' is offline. Queuing packet.")
            
            if target_id not in self.offline_queue:
                self.offline_queue[target_id] = []
            self.offline_queue[target_id].append(forward_payload)

            # Notify the sender that the message is waiting on the server
            sender_socket = self.active_connections.get(sender_id)
            if sender_socket:
                await self.send_system_message(f"User '{target_id}' is offline. Packet encrypted and queued for delivery.", sender_socket)

manager = ConnectionManager()

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await manager.connect(websocket, client_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                payload = json.loads(data)
                await manager.route_message(sender_id=client_id, payload=payload)
            except json.JSONDecodeError:
                print(f"[ERROR] Received malformed non-JSON data from '{client_id}'")
                
    except WebSocketDisconnect:
        manager.disconnect(client_id)