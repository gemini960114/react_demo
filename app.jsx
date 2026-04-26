import React, { useState, useEffect, useRef, useCallback } from 'react';

// --- 關卡設定 ---
const LEVELS = [
    { target: 50, speed: 120, layout: [] },
    { target: 120, speed: 100, layout: [ // 上下擋板
        {x: 10, y: 5, w: 20, h: 1}, {x: 10, y: 24, w: 20, h: 1}
    ]},
    { target: 200, speed: 85, layout: [ // 中間十字
        {x: 15, y: 14, w: 10, h: 2}, {x: 19, y: 10, w: 2, h: 10}
    ]},
    { target: 300, speed: 70, layout: [ // 四角方塊
        {x: 5, y: 5, w: 5, h: 5}, {x: 30, y: 5, w: 5, h: 5},
        {x: 5, y: 20, w: 5, h: 5}, {x: 30, y: 20, w: 5, h: 5}
    ]},
    { target: 9999, speed: 55, layout: [ // 隨機迷宮感
        {x: 8, y: 8, w: 2, h: 14}, {x: 30, y: 8, w: 2, h: 14},
        {x: 15, y: 5, w: 10, h: 2}, {x: 15, y: 23, w: 10, h: 2}
    ]}
];

const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const TILE_SIZE = 20;
const COLS = CANVAS_WIDTH / TILE_SIZE;
const ROWS = CANVAS_HEIGHT / TILE_SIZE;

export default function App() {
    // --- React State (UI 狀態管理) ---
    const [gameState, setGameState] = useState('MENU'); // MENU, PLAYING, LEVEL_COMPLETE, GAME_OVER
    const [score, setScore] = useState(0);
    const [currentLevel, setCurrentLevel] = useState(1);
    
    // --- Refs (用來在 Canvas 遊戲迴圈中保存最新狀態，避免閉包陷阱) ---
    const canvasRef = useRef(null);
    const requestRef = useRef();
    const gameStateRef = useRef(gameState);
    
    // 遊戲實體 Refs
    const snakeRef = useRef([]);
    const directionRef = useRef({ x: 1, y: 0 });
    const nextDirectionRef = useRef({ x: 1, y: 0 });
    const foodRef = useRef({ x: 0, y: 0 });
    const obstaclesRef = useRef([]);
    const particlesRef = useRef([]);
    
    // 計時與狀態 Refs
    const lastRenderTimeRef = useRef(0);
    const moveAccumulatorRef = useRef(0);
    const animationTimeRef = useRef(0);
    const currentSpeedRef = useRef(LEVELS[0].speed);
    const scoreRef = useRef(0);
    const currentLevelRef = useRef(1);

    // 同步 React state 到 refs，以便遊戲迴圈能讀取到最新值
    useEffect(() => { gameStateRef.current = gameState; }, [gameState]);
    useEffect(() => { scoreRef.current = score; }, [score]);
    useEffect(() => { currentLevelRef.current = currentLevel; }, [currentLevel]);

    // --- 遊戲邏輯函式 ---
    const spawnFood = useCallback(() => {
        let valid = false;
        let newFood = { x: 0, y: 0 };
        while (!valid) {
            newFood = {
                x: Math.floor(Math.random() * COLS),
                y: Math.floor(Math.random() * ROWS)
            };
            valid = true;
            for (let part of snakeRef.current) {
                if (part.x === newFood.x && part.y === newFood.y) valid = false;
            }
            for (let obs of obstaclesRef.current) {
                if (obs.x === newFood.x && obs.y === newFood.y) valid = false;
            }
        }
        foodRef.current = newFood;
    }, []);

    const createParticles = useCallback((x, y, color, amount) => {
        const newParticles = [];
        for (let i = 0; i < amount; i++) {
            newParticles.push({
                x: x * TILE_SIZE + TILE_SIZE / 2,
                y: y * TILE_SIZE + TILE_SIZE / 2,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1,
                color: color
            });
        }
        particlesRef.current = [...particlesRef.current, ...newParticles];
    }, []);

    const loadLevel = useCallback((levelNum) => {
        const levelIdx = Math.min(levelNum - 1, LEVELS.length - 1);
        const levelData = LEVELS[levelIdx];
        
        currentSpeedRef.current = levelData.speed;
        snakeRef.current = [{ x: 10, y: 15 }, { x: 9, y: 15 }, { x: 8, y: 15 }];
        directionRef.current = { x: 1, y: 0 };
        nextDirectionRef.current = { x: 1, y: 0 };
        particlesRef.current = [];
        moveAccumulatorRef.current = 0;
        
        const newObstacles = [];
        levelData.layout.forEach(rect => {
            for(let i = 0; i < rect.w; i++){
                for(let j = 0; j < rect.h; j++){
                    newObstacles.push({ x: rect.x + i, y: rect.y + j });
                }
            }
        });
        obstaclesRef.current = newObstacles;

        spawnFood();
        setCurrentLevel(levelNum);
    }, [spawnFood]);

    const startGame = () => {
        setScore(0);
        loadLevel(1);
        setGameState('PLAYING');
    };

    const nextLevel = () => {
        loadLevel(currentLevel + 1);
        setGameState('PLAYING');
    };

    const handleGameOver = useCallback(() => {
        setGameState('GAME_OVER');
        createParticles(snakeRef.current[0].x, snakeRef.current[0].y, '#ef4444', 50); // Tailwind red-500
    }, [createParticles]);

    // --- 主遊戲迴圈 (更新與渲染) ---
    const update = useCallback((dt) => {
        animationTimeRef.current += dt;
        
        // 更新粒子
        particlesRef.current = particlesRef.current.map(p => ({
            ...p,
            x: p.x + p.vx,
            y: p.y + p.vy,
            life: p.life - dt * 0.002
        })).filter(p => p.life > 0);

        if (gameStateRef.current !== 'PLAYING') return;

        moveAccumulatorRef.current += dt;
        if (moveAccumulatorRef.current >= currentSpeedRef.current) {
            moveAccumulatorRef.current = 0;
            
            directionRef.current = { ...nextDirectionRef.current };
            const head = { 
                x: snakeRef.current[0].x + directionRef.current.x, 
                y: snakeRef.current[0].y + directionRef.current.y 
            };

            // 撞牆判定
            if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS) {
                handleGameOver();
                return;
            }

            // 撞自己判定
            for (let part of snakeRef.current) {
                if (part.x === head.x && part.y === head.y) {
                    handleGameOver();
                    return;
                }
            }

            // 撞障礙物判定
            for (let obs of obstaclesRef.current) {
                if (obs.x === head.x && obs.y === head.y) {
                    handleGameOver();
                    return;
                }
            }

            const newSnake = [head, ...snakeRef.current];

            // 吃食物
            if (head.x === foodRef.current.x && head.y === foodRef.current.y) {
                const newScore = scoreRef.current + 10;
                setScore(newScore); // 更新 React UI
                createParticles(foodRef.current.x, foodRef.current.y, '#ec4899', 15); // Tailwind pink-500
                
                const target = LEVELS[Math.min(currentLevelRef.current - 1, LEVELS.length - 1)].target;
                if (newScore >= target) {
                    setGameState('LEVEL_COMPLETE');
                    createParticles(head.x, head.y, '#2dd4bf', 40); // Tailwind teal-400
                } else {
                    spawnFood();
                }
            } else {
                newSnake.pop();
            }
            
            snakeRef.current = newSnake;
        }
    }, [createParticles, handleGameOver, spawnFood]);

    const draw = useCallback((ctx) => {
        // 清除背景
        ctx.fillStyle = '#0f172a'; // Tailwind slate-900
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // 畫網格
        ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)'; // Tailwind slate-700
        ctx.lineWidth = 1;
        for (let i = 0; i < COLS; i++) {
            ctx.beginPath(); ctx.moveTo(i * TILE_SIZE, 0); ctx.lineTo(i * TILE_SIZE, CANVAS_HEIGHT); ctx.stroke();
        }
        for (let i = 0; i < ROWS; i++) {
            ctx.beginPath(); ctx.moveTo(0, i * TILE_SIZE); ctx.lineTo(CANVAS_WIDTH, i * TILE_SIZE); ctx.stroke();
        }

        // 畫障礙物
        ctx.fillStyle = '#334155'; // Tailwind slate-700
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#0f766e'; // Tailwind teal-700
        obstaclesRef.current.forEach(obs => {
            ctx.fillRect(obs.x * TILE_SIZE + 1, obs.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2);
        });
        ctx.shadowBlur = 0;

        // 畫食物
        const pulse = Math.abs(Math.sin(animationTimeRef.current * 0.005)) * 3;
        ctx.fillStyle = '#ec4899'; // pink-500
        ctx.shadowBlur = 15 + pulse;
        ctx.shadowColor = '#ec4899';
        ctx.beginPath();
        ctx.arc(foodRef.current.x * TILE_SIZE + TILE_SIZE/2, foodRef.current.y * TILE_SIZE + TILE_SIZE/2, (TILE_SIZE/2 - 2) + pulse/3, 0, Math.PI * 2);
        ctx.fill();

        // 畫蛇
        snakeRef.current.forEach((part, i) => {
            const isHead = i === 0;
            const ratio = i / snakeRef.current.length;
            const r = Math.floor(45 - ratio * 20);
            const g = Math.floor(212 - ratio * 100);
            const b = Math.floor(191 - ratio * 100);
            
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.shadowBlur = isHead ? 15 : 5;
            ctx.shadowColor = isHead ? '#2dd4bf' : `rgba(${r}, ${g}, ${b}, 0.5)`;

            ctx.beginPath();
            ctx.roundRect(part.x * TILE_SIZE + 1, part.y * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2, isHead ? 6 : 4);
            ctx.fill();

            // 眼睛
            if (isHead) {
                ctx.fillStyle = '#0f172a';
                ctx.shadowBlur = 0;
                let eye1 = {x: 0, y: 0}, eye2 = {x: 0, y: 0};
                const dir = directionRef.current;
                
                if (dir.x === 1) { eye1 = {x: 12, y: 5}; eye2 = {x: 12, y: 13}; }
                else if (dir.x === -1) { eye1 = {x: 4, y: 5}; eye2 = {x: 4, y: 13}; }
                else if (dir.y === 1) { eye1 = {x: 5, y: 12}; eye2 = {x: 13, y: 12}; }
                else if (dir.y === -1) { eye1 = {x: 5, y: 4}; eye2 = {x: 13, y: 4}; }

                ctx.beginPath(); ctx.arc(part.x * TILE_SIZE + eye1.x, part.y * TILE_SIZE + eye1.y, 2, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(part.x * TILE_SIZE + eye2.x, part.y * TILE_SIZE + eye2.y, 2, 0, Math.PI*2); ctx.fill();
            }
        });
        ctx.shadowBlur = 0;

        // 畫粒子
        ctx.globalCompositeOperation = 'lighter';
        particlesRef.current.forEach(p => {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, Math.max(0.1, p.life * 3), 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.globalAlpha = 1.0;
        ctx.globalCompositeOperation = 'source-over';

    }, []);

    const gameLoop = useCallback((timestamp) => {
        if (!lastRenderTimeRef.current) lastRenderTimeRef.current = timestamp;
        let dt = timestamp - lastRenderTimeRef.current;
        lastRenderTimeRef.current = timestamp;
        
        if (dt > 100) dt = 16; // 防止切換分頁造成的 dt 暴衝

        update(dt);
        
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            draw(ctx);
        }

        requestRef.current = requestAnimationFrame(gameLoop);
    }, [update, draw]);

    // --- 啟動與清理 ---
    useEffect(() => {
        requestRef.current = requestAnimationFrame(gameLoop);
        return () => cancelAnimationFrame(requestRef.current);
    }, [gameLoop]);

    // --- 輸入控制 (鍵盤) ---
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (gameStateRef.current !== 'PLAYING') return;
            const dir = directionRef.current;
            switch (e.key) {
                case 'ArrowUp': case 'w': case 'W':
                    if (dir.y === 0) nextDirectionRef.current = { x: 0, y: -1 };
                    e.preventDefault(); break;
                case 'ArrowDown': case 's': case 'S':
                    if (dir.y === 0) nextDirectionRef.current = { x: 0, y: 1 };
                    e.preventDefault(); break;
                case 'ArrowLeft': case 'a': case 'A':
                    if (dir.x === 0) nextDirectionRef.current = { x: -1, y: 0 };
                    e.preventDefault(); break;
                case 'ArrowRight': case 'd': case 'D':
                    if (dir.x === 0) nextDirectionRef.current = { x: 1, y: 0 };
                    e.preventDefault(); break;
                default: break;
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // --- 觸控邏輯 (綁定在最外層容器以支援手機滑動) ---
    const touchStartRef = useRef({ x: 0, y: 0 });
    
    const handleTouchStart = (e) => {
        touchStartRef.current = {
            x: e.touches[0].clientX,
            y: e.touches[0].clientY
        };
    };

    const handleTouchMove = (e) => {
        if (gameState === 'PLAYING') {
            e.preventDefault(); // 防止滾動螢幕
        }
    };

    const handleTouchEnd = (e) => {
        if (gameState !== 'PLAYING') return;
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        const dx = touchEndX - touchStartRef.current.x;
        const dy = touchEndY - touchStartRef.current.y;
        
        const dir = directionRef.current;
        if (Math.abs(dx) > Math.abs(dy)) {
            if (dx > 30 && dir.x === 0) nextDirectionRef.current = { x: 1, y: 0 };
            else if (dx < -30 && dir.x === 0) nextDirectionRef.current = { x: -1, y: 0 };
        } else {
            if (dy > 30 && dir.y === 0) nextDirectionRef.current = { x: 0, y: 1 };
            else if (dy < -30 && dir.y === 0) nextDirectionRef.current = { x: 0, y: -1 };
        }
    };

    // --- UI 渲染區塊 ---
    return (
        <div 
            className="flex items-center justify-center min-h-screen bg-slate-950 w-full overflow-hidden select-none"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
        >
            <div className="relative w-full max-w-[800px] aspect-[4/3] rounded-lg shadow-[0_0_30px_rgba(45,212,191,0.2)] overflow-hidden bg-slate-900 border border-slate-800">
                
                {/* 遊戲畫布 (置底) */}
                <canvas 
                    ref={canvasRef}
                    width={CANVAS_WIDTH}
                    height={CANVAS_HEIGHT}
                    className="absolute inset-0 w-full h-full object-contain"
                />

                {/* HUD 抬頭顯示器 (DOM UI) */}
                {gameState === 'PLAYING' && (
                    <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start text-teal-400 font-bold text-xl pointer-events-none drop-shadow-md z-10">
                        <div>分數: <span className="text-white">{score}</span></div>
                        <div className="text-right">
                            <div>關卡: <span className="text-white">{currentLevel}</span></div>
                            <div className="text-sm font-normal text-teal-600 mt-1">
                                目標: {LEVELS[Math.min(currentLevel - 1, LEVELS.length - 1)].target === 9999 ? "無限" : LEVELS[Math.min(currentLevel - 1, LEVELS.length - 1)].target}
                            </div>
                        </div>
                    </div>
                )}

                {/* 選單與結算介面 (DOM UI Overlay) */}
                {gameState !== 'PLAYING' && (
                    <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-20 transition-all">
                        
                        {gameState === 'MENU' && (
                            <div className="text-center animate-pulse">
                                <h1 className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-cyan-400 drop-shadow-[0_0_15px_rgba(45,212,191,0.5)] mb-4">
                                    霓虹覺醒
                                </h1>
                                <p className="text-teal-600 text-lg md:text-xl mb-12">React DOM 版 • 使用方向鍵或滑動控制</p>
                                <button 
                                    onClick={startGame}
                                    className="px-8 py-4 bg-slate-800 text-teal-400 font-bold text-2xl rounded-xl border-2 border-teal-500 shadow-[0_0_15px_rgba(45,212,191,0.4)] hover:bg-teal-900 hover:text-white hover:scale-105 hover:shadow-[0_0_25px_rgba(45,212,191,0.6)] transition-all cursor-pointer"
                                >
                                    開始遊戲
                                </button>
                            </div>
                        )}

                        {gameState === 'LEVEL_COMPLETE' && (
                            <div className="text-center">
                                <h2 className="text-5xl font-bold text-teal-400 drop-shadow-[0_0_10px_rgba(45,212,191,0.8)] mb-8">
                                    關卡完成！
                                </h2>
                                <button 
                                    onClick={nextLevel}
                                    className="px-8 py-4 bg-slate-800 text-teal-400 font-bold text-2xl rounded-xl border-2 border-teal-500 shadow-[0_0_15px_rgba(45,212,191,0.4)] hover:bg-teal-900 hover:text-white hover:scale-105 transition-all cursor-pointer"
                                >
                                    進入下一關
                                </button>
                            </div>
                        )}

                        {gameState === 'GAME_OVER' && (
                            <div className="text-center">
                                <h2 className="text-6xl font-black text-red-500 drop-shadow-[0_0_15px_rgba(239,68,68,0.8)] mb-4">
                                    遊戲結束
                                </h2>
                                <p className="text-white text-xl md:text-2xl mb-8">
                                    最終分數: <span className="text-red-400 font-bold">{score}</span> <br/>
                                    <span className="text-slate-400 text-lg">到達關卡: {currentLevel}</span>
                                </p>
                                <button 
                                    onClick={startGame}
                                    className="px-8 py-4 bg-slate-800 text-red-400 font-bold text-xl md:text-2xl rounded-xl border-2 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.4)] hover:bg-red-900 hover:text-white hover:scale-105 transition-all cursor-pointer"
                                >
                                    重新開始
                                </button>
                            </div>
                        )}
                        
                    </div>
                )}
            </div>
        </div>
    );
}
