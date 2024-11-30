socket.on('underAttack', ({ attackerId, goldLost }) => {
    displayMessage(`You were attacked by ${players[attackerId].name} and lost ${goldLost} gold!`);
    updatePlayerGold();
});

socket.on('attackSuccess', ({ targetId, goldGained }) => {
    displayMessage(`Successfully attacked ${players[targetId].name} and gained ${goldGained} gold!`);
    updatePlayerGold();
});

socket.on('attackFailed', ({ targetId, goldLost }) => {
    displayMessage(`Failed to attack ${players[targetId].name} and lost ${goldLost} gold!`);
    updatePlayerGold();
});

socket.on('defendedAttack', ({ attackerId, goldGained }) => {
    displayMessage(`Successfully defended against ${players[attackerId].name} and gained ${goldGained} gold!`);
    updatePlayerGold();
});

socket.on('weatherEffect', ({ type, newSpeed }) => {
    player.speed = newSpeed;
    if (type === 'storm') {
        displayMessage('Caught in a storm! Speed reduced.');
    } else {
        displayMessage('Weather cleared! Speed restored.');
    }
});

socket.on('islandUpdate', ({ index, gold }) => {
    islands[index].gold = gold;
    updateIslandDisplay(index);
});

socket.on('leaderboardUpdate', (leaderboard) => {
    updateLeaderboardDisplay(leaderboard);
});

socket.on('powerUpSpawned', (powerUp) => {
    addPowerUpToMap(powerUp);
});

socket.on('powerUpCollected', ({ id, playerId }) => {
    removePowerUpFromMap(id);
    if (playerId === socket.id) {
        displayMessage('Power-up collected!');
    }
});

socket.on('powerUpExpired', (type) => {
    displayMessage(`${type} power-up has expired!`);
});

socket.on('questAssigned', (quest) => {
    displayQuest(quest);
});

socket.on('questProgress', (progress) => {
    updateQuestProgress(progress);
});

socket.on('questCompleted', ({ reward, newQuest }) => {
    displayMessage(`Quest completed! Received ${reward} gold!`);
    displayQuest(newQuest);
});

socket.on('tradeProposal', ({ fromId, offer, request }) => {
    displayTradeProposal(fromId, offer, request);
});

socket.on('tradeComplete', ({ partnerId, received, given }) => {
    displayMessage(`Trade completed with ${players[partnerId].name}!`);
    updatePlayerGold();
});

socket.on('newChatMessage', (message) => {
    addChatMessage(message);
});

// Helper functions for UI updates
function updateLeaderboardDisplay(leaderboard) {
    const leaderboardEl = document.getElementById('leaderboard');
    leaderboardEl.innerHTML = leaderboard
        .map((player, index) => `
            <div class="leaderboard-item">
                ${index + 1}. ${player.name} - ${player.gold} gold
            </div>
        `)
        .join('');
}

function displayQuest(quest) {
    const questEl = document.getElementById('active-quest');
    questEl.innerHTML = `
        <h3>Active Quest</h3>
        <p>${getQuestDescription(quest)}</p>
        <p>Progress: ${quest.progress}/${quest.goal}</p>
        <p>Reward: ${quest.reward} gold</p>
    `;
}

function getQuestDescription(quest) {
    switch(quest.type) {
        case 'collect':
            return `Collect ${quest.goal} gold from islands`;
        case 'visit':
            return `Visit ${quest.goal} different islands`;
        case 'combat':
            return `Win ${quest.goal} ship battles`;
        default:
            return 'Unknown quest type';
    }
}

function displayTradeProposal(fromId, offer, request) {
    // Create and show trade proposal modal
    const modal = createTradeModal(fromId, offer, request);
    document.body.appendChild(modal);
}

function addChatMessage(message) {
    const chatEl = document.getElementById('chat-messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'chat-message';
    messageEl.innerHTML = `
        <span class="chat-timestamp">[${new Date(message.timestamp).toLocaleTimeString()}]</span>
        <span class="chat-sender">${message.sender}:</span>
        <span class="chat-text">${message.message}</span>
    `;
    chatEl.appendChild(messageEl);
    chatEl.scrollTop = chatEl.scrollHeight;
}

// Game initialization
window.addEventListener('load', () => {
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Show ship selection on game start
    const shipModal = document.getElementById('ship-select-modal');
    const shipOptions = document.querySelectorAll('.ship-option');
    let selectedShip = 'merchant';

    shipOptions.forEach(option => {
        option.addEventListener('click', () => {
            shipOptions.forEach(opt => opt.classList.remove('selected'));
            option.classList.add('selected');
            selectedShip = option.dataset.ship;
        });
    });

    document.getElementById('start-game').addEventListener('click', () => {
        const playerName = prompt('Enter your pirate name:');
        if (playerName) {
            shipModal.classList.add('hidden');
            startGame(playerName, selectedShip);
        }
    });

    // Chat functionality
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    function sendChat() {
        const message = chatInput.value.trim();
        if (message) {
            socket.emit('chatMessage', message);
            chatInput.value = '';
        }
    }

    chatSend.addEventListener('click', sendChat);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendChat();
    });
});

// Game loop
function gameLoop() {
    updateGameState();
    drawGame();
    requestAnimationFrame(gameLoop);
}

function updateGameState() {
    // Update player position based on input
    if (player.moving) {
        const dx = Math.cos(player.angle) * player.speed;
        const dy = Math.sin(player.angle) * player.speed;
        player.x += dx;
        player.y += dy;
        
        // Emit position update
        socket.emit('playerMove', { x: player.x, y: player.y, angle: player.angle });
    }
    
    // Check for power-up collection
    powerUps.forEach(powerUp => {
        const distance = Math.sqrt(
            Math.pow(player.x - powerUp.x, 2) + 
            Math.pow(player.y - powerUp.y, 2)
        );
        if (distance < 30) {
            socket.emit('collectPowerUp', powerUp.id);
        }
    });
}

function drawGame() {
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw background
    drawBackground();
    
    // Draw islands
    islands.forEach(drawIsland);
    
    // Draw power-ups
    powerUps.forEach(drawPowerUp);
    
    // Draw other players
    Object.values(players).forEach(drawPlayer);
    
    // Draw weather effects
    drawWeatherEffects();
}

// Start the game loop
gameLoop();