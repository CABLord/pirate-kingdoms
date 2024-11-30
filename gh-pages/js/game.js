
const config = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'game-container',
    scene: {
        preload: preload,
        create: create,
        update: update
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0 },
            debug: false
        }
    }
};

const game = new Phaser.Game(config);
let player;
let cursors;
let islands;
let otherPlayers;
let socket;
let goldText;
let speedText;
let strengthText;
let upgradeButton;
let allianceText;
let playerList;
let eventText;

function preload() {
    this.load.image('ship', 'assets/ship.png');
    this.load.image('island', 'assets/island.png');
    this.load.image('storm', 'assets/storm.png');
    this.load.image('pirate', 'assets/pirate.png');
}


// ... (previous code remains the same)

function create() {
    // ... (previous code remains the same)

    socket.on('tradeOffer', ({ fromPlayerId, amount }) => {
        const acceptButton = this.add.text(400, 400, `Accept ${amount} gold from ${fromPlayerId.substr(0, 4)}?`, { fontSize: '24px', fill: '#0f0' })
            .setInteractive()
            .on('pointerdown', () => {
                socket.emit('tradeResponse', { fromPlayerId, accepted: true });
                acceptButton.destroy();
                rejectButton.destroy();
            });

        const rejectButton = this.add.text(400, 450, 'Reject Trade', { fontSize: '24px', fill: '#f00' })
            .setInteractive()
            .on('pointerdown', () => {
                socket.emit('tradeResponse', { fromPlayerId, accepted: false });
                acceptButton.destroy();
                rejectButton.destroy();
            });
    });

    socket.on('tradeComplete', ({ fromPlayerId, targetPlayerId, amount, newGold }) => {
        goldText.setText('Gold: ' + newGold);
        console.log(`Trade complete: ${amount} gold ${fromPlayerId ? 'from ' + fromPlayerId.substr(0, 4) : 'to ' + targetPlayerId.substr(0, 4)}`);
    });

    socket.on('tradeError', (message) => {
        console.log('Trade error:', message);
    });

    socket.on('tradeRejected', (rejectingPlayerId) => {
        console.log('Trade rejected by player', rejectingPlayerId.substr(0, 4));
    });

    // ... (rest of the create function remains the same)
}

function update() {
    // ... (previous code remains the same)

    // Add trade initiation on 'T' key press
    this.input.keyboard.on('keydown-T', () => {
        const closestPlayer = findClosestPlayer();
        if (closestPlayer) {
            const tradeAmount = Math.min(10, players[socket.id].gold);
            socket.emit('tradeRequest', { targetPlayerId: closestPlayer.playerId, amount: tradeAmount });
        }
    });
}

function findClosestPlayer() {
    let closestPlayer = null;
    let closestDistance = Infinity;

    otherPlayers.getChildren().forEach((otherPlayer) => {
        const distance = Phaser.Math.Distance.Between(player.x, player.y, otherPlayer.x, otherPlayer.y);
        if (distance < closestDistance && distance < 100) {
            closestDistance = distance;
            closestPlayer = otherPlayer;
        }
    });

    return closestPlayer;
}

// ... (rest of the file remains the same)

    islands = this.physics.add.staticGroup();
    otherPlayers = this.physics.add.group();
    cursors = this.input.keyboard.createCursorKeys();

    socket = io("https://pirate-kingdoms-server.herokuapp.com");

    socket.on('connect', () => {
        console.log('Connected to server');
        player = this.physics.add.sprite(400, 300, 'ship');
        player.setCollideWorldBounds(true);
        socket.emit('playerJoin', { x: player.x, y: player.y });
    });

    socket.on('gameState', (gameState) => {
        createIslands(this, gameState.islands);
        Object.keys(gameState.players).forEach((id) => {
            if (id !== socket.id) {
                addOtherPlayer(this, gameState.players[id]);
            } else {
                player.speed = gameState.players[id].speed;
                player.strength = gameState.players[id].strength;
            }
        });
        goldText = this.add.text(16, 16, 'Gold: 0', { fontSize: '32px', fill: '#fff' });
        speedText = this.add.text(16, 56, 'Speed: ' + player.speed, { fontSize: '32px', fill: '#fff' });
        strengthText = this.add.text(16, 96, 'Strength: ' + player.strength, { fontSize: '32px', fill: '#fff' });
        
        upgradeButton = this.add.text(16, 136, 'Upgrade Ship', { fontSize: '32px', fill: '#0f0' })
            .setInteractive()
            .on('pointerdown', () => {
                socket.emit('upgradeShip');
            });

        allianceText = this.add.text(16, 176, 'Alliance: None', { fontSize: '32px', fill: '#fff' });
        
        playerList = this.add.text(600, 16, 'Players:', { fontSize: '24px', fill: '#fff' });
        updatePlayerList(gameState.players);

        eventText = this.add.text(400, 16, '', { fontSize: '24px', fill: '#ff0' });
        eventText.setOrigin(0.5, 0);
    });

    socket.on('newPlayer', (playerInfo) => {
        addOtherPlayer(this, playerInfo);
        updatePlayerList(playerInfo);
    });

    socket.on('playerMoved', (playerInfo) => {
        otherPlayers.getChildren().forEach((otherPlayer) => {
            if (playerInfo.id === otherPlayer.playerId) {
                otherPlayer.setPosition(playerInfo.x, playerInfo.y);
            }
        });
    });

    socket.on('playerDisconnected', (playerId) => {
        otherPlayers.getChildren().forEach((otherPlayer) => {
            if (playerId === otherPlayer.playerId) {
                otherPlayer.destroy();
            }
        });
        updatePlayerList();
    });

    socket.on('resourceUpdate', (updateInfo) => {
        updateIslandGold(updateInfo.islands);
        if (updateInfo.playerGold.id === socket.id) {
            goldText.setText('Gold: ' + updateInfo.playerGold.gold);
        }
    });

    socket.on('upgradeResult', (result) => {
        if (result.success) {
            player.speed = result.newSpeed;
            player.strength = result.newStrength;
            speedText.setText('Speed: ' + player.speed);
            strengthText.setText('Strength: ' + player.strength);
            goldText.setText('Gold: ' + result.newGold);
        } else {
            console.log('Not enough gold to upgrade');
        }
    });

    socket.on('allianceRequest', (requestingPlayerId) => {
        const acceptButton = this.add.text(400, 300, 'Accept Alliance', { fontSize: '32px', fill: '#0f0' })
            .setInteractive()
            .on('pointerdown', () => {
                socket.emit('allianceResponse', requestingPlayerId, true);
                acceptButton.destroy();
                rejectButton.destroy();
            });

        const rejectButton = this.add.text(400, 350, 'Reject Alliance', { fontSize: '32px', fill: '#f00' })
            .setInteractive()
            .on('pointerdown', () => {
                socket.emit('allianceResponse', requestingPlayerId, false);
                acceptButton.destroy();
                rejectButton.destroy();
            });
    });

    socket.on('allianceFormed', (allianceInfo) => {
        allianceText.setText('Alliance: Formed');
        console.log('Alliance formed with player', allianceInfo.partnerId);
    });

    socket.on('allianceRejected', (rejectingPlayerId) => {
        console.log('Alliance rejected by player', rejectingPlayerId);
    });

    socket.on('allianceDissolved', (disconnectedPlayerId) => {
        allianceText.setText('Alliance: None');
        console.log('Alliance dissolved. Player disconnected:', disconnectedPlayerId);
    });

    socket.on('allianceUpdate', (updateInfo) => {
        updatePlayerList(updateInfo.players);
    });

    socket.on('islandCaptured', (data) => {
        updateIslandOwnership(data.islandIndex, data.newOwner);
        if (data.newOwner === socket.id) {
            console.log('You captured island', data.islandIndex);
        } else {
            console.log('Island', data.islandIndex, 'captured by', data.newOwner);
        }
    });

    socket.on('islandLost', (data) => {
        console.log('You lost island', data.islandIndex, 'and gained', data.gold, 'gold');
    });

    socket.on('defendedIsland', (data) => {
        console.log('You successfully defended island', data.islandIndex, 'and gained', data.goldGained, 'gold');
    });

    socket.on('attackFailed', (data) => {
        console.log('Attack on island', data.islandIndex, 'failed. You lost', data.goldLost, 'gold');
    });

    socket.on('islandOwnershipChanged', (data) => {
        updateIslandOwnership(data.islandIndex, data.newOwner);
    });

    socket.on('stormEvent', (data) => {
        const storm = this.add.image(data.x, data.y, 'storm');
        storm.setAlpha(0.7);
        this.tweens.add({
            targets: storm,
            alpha: 0,
            duration: 5000,
            onComplete: () => storm.destroy()
        });
        eventText.setText('A storm is approaching!');
        this.time.delayedCall(3000, () => eventText.setText(''));
    });

    socket.on('stormDamage', (data) => {
        console.log('Your ship was damaged by the storm. You lost', data.goldLost, 'gold');
        goldText.setText('Gold: ' + (parseInt(goldText.text.split(': ')[1]) - data.goldLost));
    });

    socket.on('pirateAttack', (data) => {
        console.log('Your ship was attacked by pirates. You lost', data.goldLost, 'gold');
        goldText.setText('Gold: ' + (parseInt(goldText.text.split(': ')[1]) - data.goldLost));
        const pirate = this.add.image(player.x, player.y, 'pirate');
        this.tweens.add({
            targets: pirate,
            alpha: 0,
            duration: 2000,
            onComplete: () => pirate.destroy()
        });
        eventText.setText('Pirates are attacking!');
        this.time.delayedCall(3000, () => eventText.setText(''));
    });

    this.input.keyboard.on('keydown-SPACE', () => {
        const closestIsland = findClosestIsland();
        if (closestIsland !== null) {
            socket.emit('collectResource', closestIsland);
        }
    });

    this.input.keyboard.on('keydown-A', () => {
        const closestIsland = findClosestIsland();
        if (closestIsland !== null) {
            socket.emit('attackIsland', closestIsland);
        }
    });
}

function update() {
    if (player) {
        if (cursors.left.isDown) {
            player.setVelocityX(-player.speed);
        } else if (cursors.right.isDown) {
            player.setVelocityX(player.speed);
        } else {
            player.setVelocityX(0);
        }

        if (cursors.up.isDown) {
            player.setVelocityY(-player.speed);
        } else if (cursors.down.isDown) {
            player.setVelocityY(player.speed);
        } else {
            player.setVelocityY(0);
        }

        socket.emit('playerMove', { x: player.x, y: player.y });
    }
}

function addOtherPlayer(scene, playerInfo) {
    const otherPlayer = scene.physics.add.sprite(playerInfo.x, playerInfo.y, 'ship');
    otherPlayer.setTint(0xff0000);
    otherPlayer.playerId = playerInfo.id;
    otherPlayers.add(otherPlayer);
}

function createIslands(scene, islandData) {
    islandData.forEach((island, index) => {
        const islandSprite = islands.create(island.x, island.y, 'island');
        islandSprite.islandIndex = index;
        const goldText = scene.add.text(island.x, island.y - 20, island.gold.toString(), { fontSize: '16px', fill: '#fff' });
        goldText.setOrigin(0.5, 0.5);
        islandSprite.goldText = goldText;
        const ownerText = scene.add.text(island.x, island.y + 20, island.owner || 'Unclaimed', { fontSize: '16px', fill: '#fff' });
        ownerText.setOrigin(0.5, 0.5);
        islandSprite.ownerText = ownerText;
    });
    scene.physics.add.collider(player, islands);
}

function updateIslandGold(islandData) {
    islands.getChildren().forEach((island, index) => {
        island.goldText.setText(islandData[index].gold.toString());
    });
}

function updateIslandOwnership(islandIndex, newOwner) {
    const island = islands.getChildren()[islandIndex];
    island.ownerText.setText(newOwner || 'Unclaimed');
    if (newOwner === socket.id) {
        island.setTint(0x00ff00);
    } else if (newOwner) {
        island.setTint(0xff0000);
    } else {
        island.clearTint();
    }
}

function findClosestIsland() {
    let closestIsland = null;
    let closestDistance = Infinity;

    islands.getChildren().forEach((island) => {
        const distance = Phaser.Math.Distance.Between(player.x, player.y, island.x, island.y);
        if (distance < closestDistance && distance < 100) {
            closestDistance = distance;
            closestIsland = island.islandIndex;
        }
    });

    return closestIsland;
}

function updatePlayerList(players) {
    let playerListText = 'Players:\n';
    Object.keys(players).forEach((id) => {
        if (id !== socket.id) {
            playerListText += `${id.substr(0, 4)}: ${players[id].alliance ? 'Allied' : 'Not Allied'}\n`;
        }
    });
    playerList.setText(playerListText);

    otherPlayers.getChildren().forEach((otherPlayer) => {
        const playerId = otherPlayer.playerId;
        if (players[playerId] && players[playerId].alliance === players[socket.id].alliance) {
            otherPlayer.setTint(0x00ff00); // Green for allies
        } else {
            otherPlayer.setTint(0xff0000); // Red for non-allies
        }
    });
}
