// 游戏状态
let socket = null;
let currentRoom = null;
let currentPlayer = null;
let gameState = null;
let currentPlayerId = null;

// DOM 元素
const screens = {
    mainMenu: document.getElementById('mainMenu'),
    createRoom: document.getElementById('createRoomScreen'),
    joinRoom: document.getElementById('joinRoomScreen'),
    rooms: document.getElementById('roomsScreen'),
    waiting: document.getElementById('waitingRoom'),
    game: document.getElementById('gameScreen'),
    gameOver: document.getElementById('gameOverScreen')
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    initializeSocket();
    setupEventListeners();
    setupMobileControls();
    showScreen('mainMenu');
});

// 初始化Socket连接
function initializeSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('已连接到服务器');
        currentPlayerId = socket.id;
    });
    
    socket.on('disconnect', () => {
        console.log('与服务器断开连接');
        showScreen('mainMenu');
    });
    
    socket.on('error', (message) => {
        alert('错误: ' + message);
    });
    
    socket.on('roomUpdate', (data) => {
        updateWaitingRoom(data);
    });
    
    socket.on('gameStart', () => {
        showScreen('game');
        startGame();
    });
    
    socket.on('gameUpdate', (data) => {
        updateGame(data);
    });
    
    socket.on('gameOver', (data) => {
        showGameOver(data);
    });
    
    socket.on('playerLeft', (data) => {
        alert('对手离开了游戏');
        showScreen('mainMenu');
    });
}

// 设置事件监听器
function setupEventListeners() {
    // 主菜单按钮
    document.getElementById('createRoomBtn').addEventListener('click', () => showScreen('createRoom'));
    document.getElementById('joinRoomBtn').addEventListener('click', () => showScreen('joinRoom'));
    document.getElementById('viewRoomsBtn').addEventListener('click', () => {
        showScreen('rooms');
        loadRooms();
    });
    
    // 返回按钮
    document.getElementById('backToMain').addEventListener('click', () => showScreen('mainMenu'));
    document.getElementById('backToMain2').addEventListener('click', () => showScreen('mainMenu'));
    document.getElementById('backToMain3').addEventListener('click', () => showScreen('mainMenu'));
    document.getElementById('backToMain4').addEventListener('click', () => showScreen('mainMenu'));
    
    // 表单提交
    document.getElementById('createRoomForm').addEventListener('submit', handleCreateRoom);
    document.getElementById('joinRoomForm').addEventListener('submit', handleJoinRoom);
    
    // 游戏控制
    document.getElementById('leaveWaitingRoom').addEventListener('click', leaveRoom);
    document.getElementById('leaveGame').addEventListener('click', leaveGame);
    document.getElementById('playAgain').addEventListener('click', playAgain);
    
    // 键盘控制
    document.addEventListener('keydown', handleKeyPress);
}

// 设置移动端控制
function setupMobileControls() {
    // 移动端控制按钮
    document.getElementById('leftBtn').addEventListener('click', () => {
        if (socket && gameState) {
            socket.emit('movePiece', { direction: 'left' });
        }
    });
    
    document.getElementById('rightBtn').addEventListener('click', () => {
        if (socket && gameState) {
            socket.emit('movePiece', { direction: 'right' });
        }
    });
    
    document.getElementById('downBtn').addEventListener('click', () => {
        if (socket && gameState) {
            socket.emit('movePiece', { direction: 'down' });
        }
    });
    
    document.getElementById('rotateBtn').addEventListener('click', () => {
        if (socket && gameState) {
            socket.emit('rotatePiece');
        }
    });
    
    document.getElementById('hardDropBtn').addEventListener('click', () => {
        if (socket && gameState) {
            socket.emit('hardDrop');
        }
    });
}

// 显示指定屏幕
function showScreen(screenName) {
    Object.values(screens).forEach(screen => {
        screen.classList.add('hidden');
    });
    screens[screenName].classList.remove('hidden');
}

// 处理创建房间
function handleCreateRoom(e) {
    e.preventDefault();
    
    const playerName = document.getElementById('createPlayerName').value.trim();
    const roomId = document.getElementById('roomId').value.trim();
    
    if (!playerName || !roomId) {
        alert('请填写所有字段');
        return;
    }
    
    currentPlayer = playerName;
    currentRoom = roomId;
    
    socket.emit('joinRoom', { roomId, playerName });
    showScreen('waiting');
    document.getElementById('waitingRoomId').textContent = roomId;
}

// 处理加入房间
function handleJoinRoom(e) {
    e.preventDefault();
    
    const playerName = document.getElementById('joinPlayerName').value.trim();
    const roomId = document.getElementById('joinRoomId').value.trim();
    
    if (!playerName || !roomId) {
        alert('请填写所有字段');
        return;
    }
    
    currentPlayer = playerName;
    currentRoom = roomId;
    
    socket.emit('joinRoom', { roomId, playerName });
    showScreen('waiting');
    document.getElementById('waitingRoomId').textContent = roomId;
}

// 加载房间列表
async function loadRooms() {
    try {
        const response = await fetch('/api/rooms');
        const rooms = await response.json();
        
        const roomsList = document.getElementById('roomsList');
        roomsList.innerHTML = '';
        
        if (rooms.length === 0) {
            roomsList.innerHTML = '<p>暂无可用房间</p>';
            return;
        }
        
        rooms.forEach(room => {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            roomElement.innerHTML = `
                <div class="room-info">
                    <div class="room-id">房间: ${room.id}</div>
                    <div class="room-status">玩家: ${room.playerCount}/2 | 状态: ${getGameStateText(room.gameState)}</div>
                </div>
                <button class="btn btn-primary" onclick="joinRoomFromList('${room.id}')">加入</button>
            `;
            roomsList.appendChild(roomElement);
        });
    } catch (error) {
        console.error('加载房间列表失败:', error);
        alert('加载房间列表失败');
    }
}

// 从房间列表加入房间
function joinRoomFromList(roomId) {
    const playerName = prompt('请输入你的名字:');
    if (playerName && playerName.trim()) {
        currentPlayer = playerName.trim();
        currentRoom = roomId;
        
        socket.emit('joinRoom', { roomId, playerName: currentPlayer });
        showScreen('waiting');
        document.getElementById('waitingRoomId').textContent = roomId;
    }
}

// 获取游戏状态文本
function getGameStateText(state) {
    switch (state) {
        case 'waiting': return '等待中';
        case 'playing': return '游戏中';
        case 'finished': return '已结束';
        default: return '未知';
    }
}

// 更新等待房间
function updateWaitingRoom(data) {
    const waitingPlayers = document.getElementById('waitingPlayers');
    waitingPlayers.innerHTML = '';
    
    data.players.forEach(player => {
        const playerElement = document.createElement('div');
        playerElement.className = 'player-item';
        playerElement.textContent = player.name;
        waitingPlayers.appendChild(playerElement);
    });
}

// 离开房间
function leaveRoom() {
    if (socket) {
        socket.disconnect();
        socket.connect();
    }
    currentRoom = null;
    currentPlayer = null;
    showScreen('mainMenu');
}

// 开始游戏
function startGame() {
    document.getElementById('gameRoomId').textContent = currentRoom;
    gameState = null;
}

// 更新游戏状态
function updateGame(data) {
    gameState = data;
    
    // 找到当前玩家和对手
    const currentPlayerData = data.players.find(player => player.id === currentPlayerId);
    const opponentData = data.players.find(player => player.id !== currentPlayerId);
    
    if (currentPlayerData) {
        // 更新主玩家信息
        document.getElementById('mainPlayerName').textContent = currentPlayerData.name;
        document.getElementById('mainPlayerScore').textContent = currentPlayerData.score;
        document.getElementById('mainPlayerLevel').textContent = currentPlayerData.level;
        document.getElementById('mainPlayerLines').textContent = currentPlayerData.lines;
        
        // 绘制主玩家游戏板
        drawBoard('mainBoard', currentPlayerData.board, currentPlayerData.currentPiece);
        drawNextPiece('mainNextPiece', currentPlayerData.nextPiece);
    }
    
    if (opponentData) {
        // 更新对手信息
        document.getElementById('opponentName').textContent = opponentData.name;
        document.getElementById('opponentScore').textContent = opponentData.score;
        document.getElementById('opponentLevel').textContent = opponentData.level;
        document.getElementById('opponentLines').textContent = opponentData.lines;
        
        // 绘制对手游戏板（小尺寸）
        drawBoard('opponentBoard', opponentData.board, opponentData.currentPiece);
        drawNextPiece('opponentNextPiece', opponentData.nextPiece);
    }
}

// 绘制游戏板
function drawBoard(canvasId, board, currentPiece) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    const cellSize = canvas.width / 10;
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // 绘制背景网格
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cellSize, 0);
        ctx.lineTo(i * cellSize, canvas.height);
        ctx.stroke();
    }
    
    for (let i = 0; i <= 20; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * cellSize);
        ctx.lineTo(canvas.width, i * cellSize);
        ctx.stroke();
    }
    
    // 绘制已放置的方块
    for (let row = 0; row < board.length; row++) {
        for (let col = 0; col < board[row].length; col++) {
            if (board[row][col]) {
                ctx.fillStyle = board[row][col];
                ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                
                // 绘制边框
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 2;
                ctx.strokeRect(col * cellSize, row * cellSize, cellSize, cellSize);
            }
        }
    }
    
    // 绘制当前方块
    if (currentPiece) {
        ctx.fillStyle = currentPiece.color;
        
        for (let row = 0; row < currentPiece.shape.length; row++) {
            for (let col = 0; col < currentPiece.shape[row].length; col++) {
                if (currentPiece.shape[row][col]) {
                    const x = (currentPiece.x + col) * cellSize;
                    const y = (currentPiece.y + row) * cellSize;
                    
                    ctx.fillRect(x, y, cellSize, cellSize);
                    
                    // 绘制边框
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x, y, cellSize, cellSize);
                }
            }
        }
    }
}

// 绘制下一个方块
function drawNextPiece(canvasId, piece) {
    const canvas = document.getElementById(canvasId);
    const ctx = canvas.getContext('2d');
    
    // 清空画布
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!piece) return;
    
    const cellSize = canvas.width / 6; // 假设最大方块宽度为6
    const offsetX = (canvas.width - piece.shape[0].length * cellSize) / 2;
    const offsetY = (canvas.height - piece.shape.length * cellSize) / 2;
    
    ctx.fillStyle = piece.color;
    
    for (let row = 0; row < piece.shape.length; row++) {
        for (let col = 0; col < piece.shape[row].length; col++) {
            if (piece.shape[row][col]) {
                const x = offsetX + col * cellSize;
                const y = offsetY + row * cellSize;
                
                ctx.fillRect(x, y, cellSize, cellSize);
                
                // 绘制边框
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, cellSize, cellSize);
            }
        }
    }
}

// 处理键盘输入
function handleKeyPress(e) {
    if (!socket || !gameState) return;
    
    switch (e.key) {
        case 'ArrowLeft':
            e.preventDefault();
            socket.emit('movePiece', { direction: 'left' });
            break;
        case 'ArrowRight':
            e.preventDefault();
            socket.emit('movePiece', { direction: 'right' });
            break;
        case 'ArrowDown':
            e.preventDefault();
            socket.emit('movePiece', { direction: 'down' });
            break;
        case 'ArrowUp':
            e.preventDefault();
            socket.emit('rotatePiece');
            break;
        case ' ':
            e.preventDefault();
            socket.emit('hardDrop');
            break;
    }
}

// 显示游戏结束
function showGameOver(data) {
    showScreen('gameOver');
    
    const resultsContainer = document.getElementById('gameResults');
    resultsContainer.innerHTML = '';
    
    // 按分数排序
    const sortedPlayers = data.players.sort((a, b) => b.score - a.score);
    
    sortedPlayers.forEach((player, index) => {
        const resultElement = document.createElement('div');
        resultElement.className = `result-item ${index === 0 ? 'winner' : ''}`;
        
        resultElement.innerHTML = `
            <div class="result-name">${player.name} ${index === 0 ? '(获胜者)' : ''}</div>
            <div class="result-stats">
                <span>分数: ${player.score}</span>
                <span>等级: ${player.level}</span>
                <span>行数: ${player.lines}</span>
            </div>
        `;
        
        resultsContainer.appendChild(resultElement);
    });
}

// 离开游戏
function leaveGame() {
    if (socket) {
        socket.disconnect();
        socket.connect();
    }
    currentRoom = null;
    currentPlayer = null;
    gameState = null;
    showScreen('mainMenu');
}

// 再来一局
function playAgain() {
    if (currentRoom && currentPlayer) {
        socket.emit('joinRoom', { roomId: currentRoom, playerName: currentPlayer });
        showScreen('waiting');
        document.getElementById('waitingRoomId').textContent = currentRoom;
    } else {
        showScreen('mainMenu');
    }
}
