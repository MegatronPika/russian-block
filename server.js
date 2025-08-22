const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// 中间件
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// 游戏状态
const gameRooms = new Map();
const players = new Map();

// 俄罗斯方块形状定义
const TETROMINOS = {
  I: {
    shape: [
      [1, 1, 1, 1]
    ],
    color: '#00f5ff'
  },
  O: {
    shape: [
      [1, 1],
      [1, 1]
    ],
    color: '#ffff00'
  },
  T: {
    shape: [
      [0, 1, 0],
      [1, 1, 1]
    ],
    color: '#a000f0'
  },
  S: {
    shape: [
      [0, 1, 1],
      [1, 1, 0]
    ],
    color: '#00f000'
  },
  Z: {
    shape: [
      [1, 1, 0],
      [0, 1, 1]
    ],
    color: '#f00000'
  },
  J: {
    shape: [
      [1, 0, 0],
      [1, 1, 1]
    ],
    color: '#0000f0'
  },
  L: {
    shape: [
      [0, 0, 1],
      [1, 1, 1]
    ],
    color: '#f0a000'
  }
};

// 游戏配置
const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;

// 创建新房间
function createRoom(roomId) {
  return {
    id: roomId,
    players: [],
    gameState: 'waiting', // waiting, playing, finished
    boards: {},
    currentPieces: {},
    scores: {},
    levels: {},
    lines: {},
    gameStartTime: null
  };
}

// 创建新玩家
function createPlayer(socketId, name) {
  return {
    id: socketId,
    name: name,
    board: createEmptyBoard(),
    currentPiece: null,
    nextPiece: null,
    score: 0,
    level: 1,
    lines: 0,
    gameOver: false
  };
}

// 创建空游戏板
function createEmptyBoard() {
  return Array(BOARD_HEIGHT).fill().map(() => Array(BOARD_WIDTH).fill(0));
}

// 生成随机方块
function getRandomPiece() {
  const pieces = Object.keys(TETROMINOS);
  const randomPiece = pieces[Math.floor(Math.random() * pieces.length)];
  return {
    type: randomPiece,
    shape: TETROMINOS[randomPiece].shape,
    color: TETROMINOS[randomPiece].color,
    x: Math.floor(BOARD_WIDTH / 2) - Math.floor(TETROMINOS[randomPiece].shape[0].length / 2),
    y: 0
  };
}

// 检查碰撞
function checkCollision(board, piece, x, y) {
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const newX = x + col;
        const newY = y + row;
        
        if (newX < 0 || newX >= BOARD_WIDTH || newY >= BOARD_HEIGHT) {
          return true;
        }
        
        if (newY >= 0 && board[newY][newX]) {
          return true;
        }
      }
    }
  }
  return false;
}

// 放置方块到板上
function placePiece(board, piece, x, y) {
  const newBoard = board.map(row => [...row]);
  
  for (let row = 0; row < piece.shape.length; row++) {
    for (let col = 0; col < piece.shape[row].length; col++) {
      if (piece.shape[row][col]) {
        const newX = x + col;
        const newY = y + row;
        
        if (newY >= 0 && newY < BOARD_HEIGHT && newX >= 0 && newX < BOARD_WIDTH) {
          newBoard[newY][newX] = piece.color;
        }
      }
    }
  }
  
  return newBoard;
}

// 清除完整行
function clearLines(board) {
  const newBoard = board.filter(row => row.some(cell => cell === 0));
  const linesCleared = board.length - newBoard.length;
  
  while (newBoard.length < BOARD_HEIGHT) {
    newBoard.unshift(Array(BOARD_WIDTH).fill(0));
  }
  
  return { board: newBoard, linesCleared };
}

// 计算分数
function calculateScore(linesCleared, level) {
  const lineScores = [0, 100, 300, 500, 800];
  return lineScores[linesCleared] * level;
}

// 更新等级
function updateLevel(lines, currentLevel) {
  return Math.floor(lines / 10) + 1;
}

// 游戏循环
function gameLoop(roomId) {
  const room = gameRooms.get(roomId);
  if (!room || room.gameState !== 'playing') return;
  
  let allPlayersReady = true;
  
  room.players.forEach(playerId => {
    const player = players.get(playerId);
    if (!player || player.gameOver) return;
    
    // 移动当前方块
    if (player.currentPiece) {
      if (!checkCollision(player.board, player.currentPiece, player.currentPiece.x, player.currentPiece.y + 1)) {
        player.currentPiece.y++;
      } else {
        // 放置方块
        player.board = placePiece(player.board, player.currentPiece, player.currentPiece.x, player.currentPiece.y);
        
        // 清除完整行
        const { board: newBoard, linesCleared } = clearLines(player.board);
        player.board = newBoard;
        
        if (linesCleared > 0) {
          player.lines += linesCleared;
          player.score += calculateScore(linesCleared, player.level);
          player.level = updateLevel(player.lines, player.level);
          
          // 发送攻击行给对手
          const attackLines = Math.floor(linesCleared / 2);
          if (attackLines > 0) {
            room.players.forEach(opponentId => {
              if (opponentId !== playerId) {
                const opponent = players.get(opponentId);
                if (opponent && !opponent.gameOver) {
                  // 添加攻击行
                  for (let i = 0; i < attackLines; i++) {
                    opponent.board.shift();
                    opponent.board.push(Array(BOARD_WIDTH).fill('#ff0000'));
                  }
                }
              }
            });
          }
        }
        
        // 生成新方块
        player.currentPiece = player.nextPiece;
        player.nextPiece = getRandomPiece();
        
        // 检查游戏结束
        if (checkCollision(player.board, player.currentPiece, player.currentPiece.x, player.currentPiece.y)) {
          player.gameOver = true;
        }
      }
    }
    
    if (!player.gameOver) {
      allPlayersReady = false;
    }
  });
  
  // 检查游戏是否结束
  if (allPlayersReady) {
    room.gameState = 'finished';
    io.to(roomId).emit('gameOver', {
      players: room.players.map(id => ({
        id,
        name: players.get(id)?.name,
        score: players.get(id)?.score,
        level: players.get(id)?.level,
        lines: players.get(id)?.lines
      }))
    });
  } else {
    // 发送游戏状态更新
    io.to(roomId).emit('gameUpdate', {
      players: room.players.map(id => {
        const player = players.get(id);
        return {
          id,
          name: player?.name,
          board: player?.board,
          currentPiece: player?.currentPiece,
          nextPiece: player?.nextPiece,
          score: player?.score,
          level: player?.level,
          lines: player?.lines,
          gameOver: player?.gameOver
        };
      })
    });
    
    // 继续游戏循环
    setTimeout(() => gameLoop(roomId), 1000 - (Math.min(room.players.length > 0 ? players.get(room.players[0])?.level * 50 : 0, 800)));
  }
}

// Socket.IO 连接处理
io.on('connection', (socket) => {
  console.log('用户连接:', socket.id);
  
  // 加入房间
  socket.on('joinRoom', ({ roomId, playerName }) => {
    let room = gameRooms.get(roomId);
    
    if (!room) {
      room = createRoom(roomId);
      gameRooms.set(roomId, room);
    }
    
    if (room.players.length >= 2) {
      socket.emit('error', '房间已满');
      return;
    }
    
    const player = createPlayer(socket.id, playerName);
    players.set(socket.id, player);
    room.players.push(socket.id);
    
    socket.join(roomId);
    
    // 发送房间信息
    io.to(roomId).emit('roomUpdate', {
      players: room.players.map(id => ({
        id,
        name: players.get(id)?.name
      })),
      gameState: room.gameState
    });
    
    // 如果房间满了，开始游戏
    if (room.players.length === 2) {
      room.gameState = 'playing';
      room.gameStartTime = Date.now();
      
      // 为每个玩家生成初始方块
      room.players.forEach(playerId => {
        const player = players.get(playerId);
        player.currentPiece = getRandomPiece();
        player.nextPiece = getRandomPiece();
      });
      
      io.to(roomId).emit('gameStart');
      
      // 开始游戏循环
      setTimeout(() => gameLoop(roomId), 1000);
    }
  });
  
  // 移动方块
  socket.on('movePiece', ({ direction }) => {
    const player = players.get(socket.id);
    if (!player || player.gameOver) return;
    
    const piece = player.currentPiece;
    if (!piece) return;
    
    let newX = piece.x;
    let newY = piece.y;
    
    switch (direction) {
      case 'left':
        newX--;
        break;
      case 'right':
        newX++;
        break;
      case 'down':
        newY++;
        break;
    }
    
    if (!checkCollision(player.board, piece, newX, newY)) {
      piece.x = newX;
      piece.y = newY;
    }
  });
  
  // 旋转方块
  socket.on('rotatePiece', () => {
    const player = players.get(socket.id);
    if (!player || player.gameOver) return;
    
    const piece = player.currentPiece;
    if (!piece) return;
    
    // 旋转矩阵
    const rotated = piece.shape[0].map((_, i) => piece.shape.map(row => row[i]).reverse());
    const rotatedPiece = { ...piece, shape: rotated };
    
    if (!checkCollision(player.board, rotatedPiece, piece.x, piece.y)) {
      piece.shape = rotated;
    }
  });
  
  // 硬降落
  socket.on('hardDrop', () => {
    const player = players.get(socket.id);
    if (!player || player.gameOver) return;
    
    const piece = player.currentPiece;
    if (!piece) return;
    
    let dropDistance = 0;
    while (!checkCollision(player.board, piece, piece.x, piece.y + 1)) {
      piece.y++;
      dropDistance++;
    }
    
    // 额外分数
    player.score += dropDistance * 2;
  });
  
  // 断开连接
  socket.on('disconnect', () => {
    console.log('用户断开连接:', socket.id);
    
    const player = players.get(socket.id);
    if (player) {
      // 从房间中移除玩家
      gameRooms.forEach((room, roomId) => {
        const playerIndex = room.players.indexOf(socket.id);
        if (playerIndex > -1) {
          room.players.splice(playerIndex, 1);
          
          if (room.players.length === 0) {
            gameRooms.delete(roomId);
          } else {
            io.to(roomId).emit('playerLeft', { playerId: socket.id });
          }
        }
      });
      
      players.delete(socket.id);
    }
  });
});

// 路由
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/api/rooms', (req, res) => {
  const rooms = Array.from(gameRooms.values()).map(room => ({
    id: room.id,
    playerCount: room.players.length,
    gameState: room.gameState
  }));
  res.json(rooms);
});

// 启动服务器
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`服务器运行在端口 ${PORT}`);
});
