const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.use(express.static('public'));

let players = {};
let mapData = null; 
const MAP_SIZE = 500;
const BLOCK_SIZE = 50;

function generateCity() {
    console.log("Generating new map...");
    const buildings = [];
    const trees = [];
    const newItems = [];

    for (let x = -MAP_SIZE / 2; x < MAP_SIZE / 2; x += 10) {
        for (let z = -MAP_SIZE / 2; z < MAP_SIZE / 2; z += 10) {
            const isRoadX = Math.abs(x) % BLOCK_SIZE < 20; 
            const isRoadZ = Math.abs(z) % BLOCK_SIZE < 20;

            if (isRoadX || isRoadZ) {
                if (Math.random() > 0.95) trees.push({ x, z });
            } else {
                if (Math.random() > 0.8 && Math.abs(x) % 20 === 0 && Math.abs(z) % 20 === 0) {
                    buildings.push({ x, z, h: 20 + Math.random() * 60, type: Math.random() > 0.8 ? 'barn' : 'skyscraper' });
                }
            }
        }
    }
    return { buildings, trees, items: newItems };
}

if (!mapData) mapData = generateCity();

io.on('connection', (socket) => {
    if (!mapData) mapData = generateCity();

    players[socket.id] = { x: 0, y: 2, z: 0, rotation: 0 };

    socket.emit('init', { id: socket.id, players: players, map: mapData });
    socket.broadcast.emit('playerJoined', { id: socket.id, data: players[socket.id] });

    socket.on('move', (data) => {
        if (players[socket.id]) {
            players[socket.id] = data;
            socket.broadcast.emit('playerMoved', { id: socket.id, data: data });
        }
    });

    socket.on('shoot', () => socket.broadcast.emit('playerShot', { id: socket.id }));

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('playerLeft', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
