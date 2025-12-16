const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

// --- Game State ---
let players = {};
let mapData = null; 
const MAP_SIZE = 500;
const BLOCK_SIZE = 50;

// --- Map Generation ---
function generateCity() {
    console.log("Generating new map...");
    const buildings = [];
    const trees = [];
    const newItems = []; // (Placeholder for future items)

    for (let x = -MAP_SIZE / 2; x < MAP_SIZE / 2; x += 10) {
        for (let z = -MAP_SIZE / 2; z < MAP_SIZE / 2; z += 10) {
            // Determine if this spot is a road or building area
            const isRoadX = Math.abs(x) % BLOCK_SIZE < 20; 
            const isRoadZ = Math.abs(z) % BLOCK_SIZE < 20;

            if (isRoadX || isRoadZ) {
                // It's a road area, maybe place a tree?
                if (Math.random() > 0.95) {
                    trees.push({ x, z });
                }
            } else {
                // It's a building block
                if (Math.random() > 0.8 && Math.abs(x) % 20 === 0 && Math.abs(z) % 20 === 0) {
                    const height = 20 + Math.random() * 60;
                    const type = Math.random() > 0.8 ? 'barn' : 'skyscraper';
                    buildings.push({ x, z, h: height, type: type });
                }
            }
        }
    }
    return { buildings, trees, items: newItems };
}

// --- Spawn Logic ---
function getSafeSpawn() {
    let safe = false;
    let x = 0, z = 0;
    let attempts = 0;

    // Try to find a safe spot up to 50 times
    while (!safe && attempts < 50) {
        attempts++;
        // Pick a random spot within the map boundaries
        x = (Math.random() * (MAP_SIZE - 20)) - (MAP_SIZE / 2 - 10);
        z = (Math.random() * (MAP_SIZE - 20)) - (MAP_SIZE / 2 - 10);
        
        safe = true;

        // 1. Check Buildings
        // Buildings are 8 units wide/deep on the client.
        // We add a buffer of 6 (4 for half-building + 2 for player size)
        for (const b of mapData.buildings) {
            if (Math.abs(x - b.x) < 6 && Math.abs(z - b.z) < 6) {
                safe = false;
                break; 
            }
        }
        
        if (!safe) continue; // Hit a building, try again

        // 2. Check Trees
        // Trees are small, but let's give a 2 unit buffer
        for (const t of mapData.trees) {
            if (Math.abs(x - t.x) < 2 && Math.abs(z - t.z) < 2) {
                safe = false;
                break;
            }
        }
    }

    // If we couldn't find a safe spot after 50 tries, spawn high in the air at 0,0
    // so they can fall down to a potentially safe spot or just start over.
    if (!safe) {
        return { x: 0, y: 50, z: 0, rotation: 0 };
    }

    // Return safe coordinates (Start slightly in air to prevent clipping floor)
    return { x: x, y: 5, z: z, rotation: 0 };
}

// Ensure map exists on startup
if (!mapData) mapData = generateCity();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // If server restarted, ensure map exists
    if (!mapData) mapData = generateCity();

    // GENERATE SAFE SPAWN HERE
    players[socket.id] = getSafeSpawn();

    // Send data to client
    socket.emit('init', { id: socket.id, players: players, map: mapData });
    socket.broadcast.emit('playerJoined', { id: socket.id, data: players[socket.id] });

    // Handle Movement
    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit('playerMoved', { id: socket.id, data: data });
        }
    });

    // Handle Shooting
    socket.on('shoot', () => {
        socket.broadcast.emit('playerShot', { id: socket.id });
    });

    // Handle Disconnect
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
