
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

const PORT = process.env.PORT || 3000;
const SAVE_INTERVAL = 5 * 60 * 1000; // Save every 5 minutes
const SAVE_FILE = 'game_state.json';

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

let players = {};
let islands = [];
let alliances = {};

function loadGameState() {
    try {
        const data = fs.readFileSync(SAVE_FILE, 'utf8');
        const savedState = JSON.parse(data);
        players = savedState.players || {};
        islands = savedState.islands || [];
        alliances = savedState.alliances || {};
        console.log('Game state loaded successfully');
    } catch (err) {
        console.log('No saved game state found, starting new game');
        // Generate 5 islands with random positions, gold, and no initial owner
        for (let i = 0; i < 5; i++) {
            islands.push({
                x: Math.floor(Math.random() * 750) + 25,
                y: Math.floor(Math.random() * 550) + 25,
                gold: Math.floor(Math.random() * 100) + 50,
                owner: null
            });
        }
    }
}

function saveGameState() {
    const gameState = {
        players,
        islands,
        alliances
    };
    fs.writeFileSync(SAVE_FILE, JSON.stringify(gameState));
    console.log('Game state saved');
}

loadGameState();
setInterval(saveGameState, SAVE_INTERVAL);

function generateRandomEvent() {
    const eventType = Math.random() < 0.5 ? 'storm' : 'pirateAttack';
    const x = Math.floor(Math.random() * 800);
    const y = Math.floor(Math.random() * 600);
    
    if (eventType === 'storm') {
        io.emit('stormEvent', { x, y });
        setTimeout(() => {
            Object.keys(players).forEach(playerId => {
                const player = players[playerId];
                const distance = Math.sqrt(Math.pow(player.x - x, 2) + Math.pow(player.y - y, 2));
                if (distance < 100) {
                    player.gold = Math.max(0, player.gold - 10);
                    io.to(playerId).emit('stormDamage', { goldLost: 10 });
                }
            });
        }, 5000);
    } else {
        const targetPlayerId = Object.keys(players)[Math.floor(Math.random() * Object.keys(players).length)];
        if (targetPlayerId) {
            const stolenGold = Math.min(20, players[targetPlayerId].gold);
            players[targetPlayerId].gold -= stolenGold;
            io.to(targetPlayerId).emit('pirateAttack', { goldLost: stolenGold });
        }
    }
}

setInterval(generateRandomEvent, 30000); // Generate a random event every 30 seconds


// ... (previous code remains the same)

io.on('connection', (socket) => {
    // ... (previous event handlers remain the same)

    // Handle trade request
    socket.on('tradeRequest', ({ targetPlayerId, amount }) => {
        if (players[targetPlayerId] && players[socket.id].gold >= amount) {
            io.to(targetPlayerId).emit('tradeOffer', { 
                fromPlayerId: socket.id, 
                amount 
            });
        } else {
            socket.emit('tradeError', 'Invalid trade request');
        }
    });

    // Handle trade response
    socket.on('tradeResponse', ({ fromPlayerId, accepted }) => {
        if (accepted && players[fromPlayerId] && players[socket.id]) {
            const amount = players[fromPlayerId].pendingTrade;
            if (amount && players[fromPlayerId].gold >= amount) {
                players[fromPlayerId].gold -= amount;
                players[socket.id].gold += amount;
                io.to(fromPlayerId).emit('tradeComplete', { 
                    targetPlayerId: socket.id, 
                    amount, 
                    newGold: players[fromPlayerId].gold 
                });
                socket.emit('tradeComplete', { 
                    fromPlayerId, 
                    amount, 
                    newGold: players[socket.id].gold 
                });
            } else {
                socket.emit('tradeError', 'Trade no longer valid');
            }
            delete players[fromPlayerId].pendingTrade;
        } else {
            io.to(fromPlayerId).emit('tradeRejected', socket.id);
        }
    });

    // ... (rest of the code remains the same)
});

// ... (rest of the file remains the same)

    console.log('A user connected');

    // Handle player join
    socket.on('playerJoin', (playerData) => {
        console.log('Player joined:', playerData);
        players[socket.id] = { ...playerData, gold: 0, speed: 160, alliance: null, strength: 10 };
        socket.emit('gameState', { players, islands, alliances });
        socket.broadcast.emit('newPlayer', { id: socket.id, ...players[socket.id] });
    });

    // Handle player movement
    socket.on('playerMove', (moveData) => {
        players[socket.id] = { ...players[socket.id], ...moveData };
        socket.broadcast.emit('playerMoved', { id: socket.id, ...moveData });
    });

    // Handle resource collection
    socket.on('collectResource', (islandIndex) => {
        if (islands[islandIndex] && islands[islandIndex].gold > 0) {
            const collectedGold = Math.min(10, islands[islandIndex].gold);
            islands[islandIndex].gold -= collectedGold;
            players[socket.id].gold += collectedGold;
            io.emit('resourceUpdate', { islands, playerGold: { id: socket.id, gold: players[socket.id].gold } });
        }
    });

    // Handle ship upgrade
    socket.on('upgradeShip', () => {
        const player = players[socket.id];
        const upgradeCost = Math.floor(player.speed / 10);
        if (player.gold >= upgradeCost) {
            player.gold -= upgradeCost;
            player.speed += 20;
            player.strength += 5;
            socket.emit('upgradeResult', { success: true, newSpeed: player.speed, newStrength: player.strength, newGold: player.gold });
        } else {
            socket.emit('upgradeResult', { success: false, gold: player.gold });
        }
    });

    // Handle alliance request
    socket.on('requestAlliance', (targetPlayerId) => {
        if (players[targetPlayerId]) {
            io.to(targetPlayerId).emit('allianceRequest', socket.id);
        }
    });

    // Handle alliance response
    socket.on('allianceResponse', (targetPlayerId, accepted) => {
        if (accepted && players[targetPlayerId]) {
            const allianceId = Date.now().toString();
            players[socket.id].alliance = allianceId;
            players[targetPlayerId].alliance = allianceId;
            alliances[allianceId] = [socket.id, targetPlayerId];
            io.to(targetPlayerId).emit('allianceFormed', { allianceId, partnerId: socket.id });
            socket.emit('allianceFormed', { allianceId, partnerId: targetPlayerId });
            io.emit('allianceUpdate', { alliances, players });
        } else {
            io.to(targetPlayerId).emit('allianceRejected', socket.id);
        }
    });

    // Handle island attack
    socket.on('attackIsland', (islandIndex) => {
        const island = islands[islandIndex];
        const attacker = players[socket.id];

        if (island && island.owner !== socket.id) {
            let defenseStrength = island.gold; // Island's defense is based on its gold
            if (island.owner) {
                defenseStrength += players[island.owner].strength;
            }

            if (attacker.strength > defenseStrength) {
                // Attacker wins
                if (island.owner) {
                    players[island.owner].gold += island.gold;
                    io.to(island.owner).emit('islandLost', { islandIndex, gold: island.gold });
                }
                island.owner = socket.id;
                attacker.gold += island.gold;
                island.gold = 0;
                io.emit('islandCaptured', { islandIndex, newOwner: socket.id });
            } else {
                // Attacker loses
                const goldLost = Math.floor(attacker.gold * 0.1);
                attacker.gold -= goldLost;
                if (island.owner) {
                    players[island.owner].gold += goldLost;
                    io.to(island.owner).emit('defendedIsland', { islandIndex, goldGained: goldLost });
                }
                socket.emit('attackFailed', { islandIndex, goldLost });
            }

            io.emit('resourceUpdate', { islands, playerGold: { id: socket.id, gold: attacker.gold } });
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
        if (players[socket.id] && players[socket.id].alliance) {
            const allianceId = players[socket.id].alliance;
            alliances[allianceId] = alliances[allianceId].filter(id => id !== socket.id);
            if (alliances[allianceId].length === 0) {
                delete alliances[allianceId];
            } else {
                alliances[allianceId].forEach(id => {
                    players[id].alliance = null;
                    io.to(id).emit('allianceDissolved', socket.id);
                });
            }
        }
        // Remove player ownership from islands
        islands.forEach((island, index) => {
            if (island.owner === socket.id) {
                island.owner = null;
                io.emit('islandOwnershipChanged', { islandIndex: index, newOwner: null });
            }
        });
        delete players[socket.id];
        io.emit('playerDisconnected', socket.id);
        io.emit('allianceUpdate', { alliances, players });
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

process.on('SIGINT', () => {
    console.log('Saving game state before shutting down...');
    saveGameState();
    process.exit();
});
