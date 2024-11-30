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
let leaderboard = [];
let activeQuests = {};
let powerUps = [];
let chatHistory = [];

const SHIP_TYPES = {
    merchant: { speed: 140, strength: 8, capacity: 200, cost: 0 },
    warship: { speed: 180, strength: 15, capacity: 100, cost: 200 },
    explorer: { speed: 200, strength: 10, capacity: 150, cost: 150 },
    galleon: { speed: 160, strength: 12, capacity: 300, cost: 300 }
};

function loadGameState() {
    try {
        const data = fs.readFileSync(SAVE_FILE, 'utf8');
        const savedState = JSON.parse(data);
        players = savedState.players || {};
        islands = savedState.islands || [];
        alliances = savedState.alliances || {};
        leaderboard = savedState.leaderboard || [];
        activeQuests = savedState.activeQuests || {};
        powerUps = savedState.powerUps || [];
        chatHistory = savedState.chatHistory || [];
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
        alliances,
        leaderboard,
        activeQuests,
        powerUps,
        chatHistory
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

// Add new game mechanics
function regenerateIslandResources() {
    islands.forEach((island, index) => {
        if (island.gold < 200) {  // Cap maximum gold
            island.gold += Math.floor(Math.random() * 5) + 1;
            io.emit('islandUpdate', { index, gold: island.gold });
        }
    });
}

// Regenerate resources every minute
setInterval(regenerateIslandResources, 60000);

// Generate power-ups periodically
function spawnPowerUp() {
    if (powerUps.length < 3) {
        powerUps.push({
            type: ['speed', 'strength', 'shield'][Math.floor(Math.random() * 3)],
            x: Math.floor(Math.random() * 750) + 25,
            y: Math.floor(Math.random() * 550) + 25,
            duration: 30000, // 30 seconds
            id: Date.now()
        });
        io.emit('powerUpSpawned', powerUps[powerUps.length - 1]);
    }
}

// Generate new quests periodically
function generateQuest() {
    const questTypes = [
        { type: 'collect', goal: 100, reward: 50 },
        { type: 'visit', goal: 3, reward: 75 },
        { type: 'combat', goal: 2, reward: 100 }
    ];
    
    const quest = questTypes[Math.floor(Math.random() * questTypes.length)];
    quest.id = Date.now();
    quest.progress = 0;
    
    return quest;
}

// Update leaderboard
function updateLeaderboard() {
    leaderboard = Object.entries(players)
        .map(([id, player]) => ({
            id,
            name: player.name,
            gold: player.gold,
            strength: player.strength
        }))
        .sort((a, b) => b.gold - a.gold)
        .slice(0, 10);
    
    io.emit('leaderboardUpdate', leaderboard);
}

setInterval(spawnPowerUp, 45000); // Spawn power-up every 45 seconds
setInterval(updateLeaderboard, 10000); // Update leaderboard every 10 seconds

io.on('connection', (socket) => {
    console.log('A user connected');

    // Handle player join
    socket.on('playerJoin', (playerData) => {
        const shipType = SHIP_TYPES[playerData.shipType || 'merchant'];
        players[socket.id] = {
            ...playerData,
            ...shipType,
            gold: 0,
            alliance: null,
            activeQuest: null,
            inventory: []
        };
        
        // Assign initial quest
        players[socket.id].activeQuest = generateQuest();
        socket.emit('questAssigned', players[socket.id].activeQuest);
        
        socket.emit('gameState', { 
            players, 
            islands, 
            alliances, 
            powerUps,
            leaderboard,
            chatHistory: chatHistory.slice(-20) // Send last 20 messages
        });
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

    // Add player combat
    socket.on('attackPlayer', (targetPlayerId) => {
        const attacker = players[socket.id];
        const defender = players[targetPlayerId];
        
        if (!defender || attacker.alliance === defender.alliance) {
            return socket.emit('combatError', 'Invalid target');
        }

        const distance = Math.sqrt(
            Math.pow(attacker.x - defender.x, 2) + 
            Math.pow(attacker.y - defender.y, 2)
        );

        if (distance > 100) {
            return socket.emit('combatError', 'Target is too far');
        }

        const attackerPower = attacker.strength + (Math.random() * 20);
        const defenderPower = defender.strength + (Math.random() * 20);

        if (attackerPower > defenderPower) {
            const stolenGold = Math.min(Math.floor(defender.gold * 0.3), 100);
            defender.gold -= stolenGold;
            attacker.gold += stolenGold;
            
            io.to(targetPlayerId).emit('underAttack', {
                attackerId: socket.id,
                goldLost: stolenGold
            });
            
            socket.emit('attackSuccess', {
                targetId: targetPlayerId,
                goldGained: stolenGold
            });
        } else {
            const penalty = Math.floor(attacker.gold * 0.1);
            attacker.gold -= penalty;
            defender.gold += penalty;
            
            socket.emit('attackFailed', {
                targetId: targetPlayerId,
                goldLost: penalty
            });
            
            io.to(targetPlayerId).emit('defendedAttack', {
                attackerId: socket.id,
                goldGained: penalty
            });
        }

        io.emit('playerUpdate', {
            [socket.id]: { gold: attacker.gold },
            [targetPlayerId]: { gold: defender.gold }
        });
    });

    // Add weather effects
    socket.on('checkWeather', ({ x, y }) => {
        const player = players[socket.id];
        const stormDistance = Math.sqrt(
            Math.pow(player.x - x, 2) + 
            Math.pow(player.y - y, 2)
        );
        
        if (stormDistance < 50) {
            player.speed = Math.max(80, player.speed - 40);
            socket.emit('weatherEffect', {
                type: 'storm',
                newSpeed: player.speed
            });
        } else {
            player.speed = Math.min(320, player.speed + 20);
            socket.emit('weatherEffect', {
                type: 'clear',
                newSpeed: player.speed
            });
        }
    });

    // Handle power-up collection
    socket.on('collectPowerUp', (powerUpId) => {
        const powerUpIndex = powerUps.findIndex(p => p.id === powerUpId);
        if (powerUpIndex !== -1) {
            const powerUp = powerUps[powerUpIndex];
            const player = players[socket.id];
            
            switch (powerUp.type) {
                case 'speed':
                    player.speed += 50;
                    setTimeout(() => {
                        player.speed = SHIP_TYPES[player.shipType].speed;
                        socket.emit('powerUpExpired', 'speed');
                    }, powerUp.duration);
                    break;
                case 'strength':
                    player.strength += 10;
                    setTimeout(() => {
                        player.strength = SHIP_TYPES[player.shipType].strength;
                        socket.emit('powerUpExpired', 'strength');
                    }, powerUp.duration);
                    break;
                case 'shield':
                    player.shield = true;
                    setTimeout(() => {
                        player.shield = false;
                        socket.emit('powerUpExpired', 'shield');
                    }, powerUp.duration);
                    break;
            }
            
            powerUps.splice(powerUpIndex, 1);
            io.emit('powerUpCollected', { id: powerUpId, playerId: socket.id });
        }
    });

    // Handle trading
    socket.on('tradeProposeRequest', ({ targetId, offer, request }) => {
        if (players[targetId]) {
            io.to(targetId).emit('tradeProposal', {
                fromId: socket.id,
                offer,
                request
            });
        }
    });

    socket.on('tradeResponse', ({ targetId, accepted, offer, request }) => {
        if (accepted && players[targetId]) {
            const sender = players[socket.id];
            const receiver = players[targetId];
            
            if (sender.gold >= request.gold && receiver.gold >= offer.gold) {
                sender.gold -= request.gold;
                receiver.gold -= offer.gold;
                sender.gold += offer.gold;
                receiver.gold += request.gold;
                
                io.to(targetId).emit('tradeComplete', {
                    partnerId: socket.id,
                    received: request,
                    given: offer
                });
                
                socket.emit('tradeComplete', {
                    partnerId: targetId,
                    received: offer,
                    given: request
                });
                
                updateLeaderboard();
            }
        }
    });

    // Handle chat
    socket.on('chatMessage', (message) => {
        const player = players[socket.id];
        if (player) {
            const chatMessage = {
                id: Date.now(),
                sender: player.name,
                message,
                timestamp: new Date().toISOString()
            };
            chatHistory.push(chatMessage);
            if (chatHistory.length > 100) chatHistory.shift(); // Keep last 100 messages
            io.emit('newChatMessage', chatMessage);
        }
    });

    // Handle quest progress
    socket.on('questProgress', (type) => {
        const player = players[socket.id];
        if (player && player.activeQuest && player.activeQuest.type === type) {
            player.activeQuest.progress++;
            
            if (player.activeQuest.progress >= player.activeQuest.goal) {
                player.gold += player.activeQuest.reward;
                socket.emit('questCompleted', {
                    reward: player.activeQuest.reward,
                    newQuest: generateQuest()
                });
                player.activeQuest = generateQuest();
                updateLeaderboard();
            } else {
                socket.emit('questProgress', player.activeQuest.progress);
            }
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
