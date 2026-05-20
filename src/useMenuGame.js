import { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';

const SEARCH_RADIUS_KM = 5;
const GAME_VIEWPORT_HEIGHT = 460;
const GAME_WORLD_HEIGHT = 1500;
const BALL_SKILL_CHANCE = 0.42;

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('????????????? ?????? ??????? ??????.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000
    });
  });
}

export default function useMenuGame() {
  const gameRef = useRef(null);
  const engineRef = useRef(null);
  const runnerRef = useRef(null);
  const renderRef = useRef(null);
  const boardSizeRef = useRef({
    width: 640,
    viewportHeight: GAME_VIEWPORT_HEIGHT,
    worldHeight: GAME_WORLD_HEIGHT,
    cameraY: 0
  });
  const activeBallsRef = useRef([]);
  const boardEventRef = useRef(null);
  const gameEventRef = useRef(null);
  const releaseTimersRef = useRef([]);
  const [status, setStatus] = useState('내 위치 기준으로 후보 식당을 불러올 수 있습니다.');
  const [restaurants, setRestaurants] = useState([]);
  const [excludedText, setExcludedText] = useState('');
  const [winner, setWinner] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const excludedTerms = excludedText
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);
  const filteredRestaurants = restaurants
    .filter((restaurant) => {
      const searchableText = [
        restaurant.name,
        restaurant.food_category,
        restaurant.naver_category,
        restaurant.memo,
        restaurant.address
      ]
        .filter(Boolean)
        .join(' ');

      return !excludedTerms.some((term) => searchableText.includes(term));
    })
    .sort((a, b) => Number(a.distance_km) - Number(b.distance_km));
  const candidates = filteredRestaurants;

  async function loadCandidates() {
    setIsLoading(true);
    setWinner(null);

    try {
      const geoPosition = await getCurrentPosition();
      const current = {
        lat: geoPosition.coords.latitude,
        lng: geoPosition.coords.longitude
      };
      const params = new URLSearchParams({
        lat: String(current.lat),
        lng: String(current.lng),
        radiusKm: String(SEARCH_RADIUS_KM)
      });
      const response = await fetch(`/api/matjip/nearby?${params.toString()}`);

      if (!response.ok) {
        throw new Error('주변 식당 후보를 불러오지 못했습니다.');
      }

      const data = await response.json();
      const nextRestaurants = data.restaurants ?? [];
      setRestaurants(nextRestaurants);
      setStatus(`${nextRestaurants.length}개의 주변 식당을 찾았습니다.`);
    } catch (error) {
      setStatus(error.message || '후보 식당을 불러오지 못했습니다.');
      setRestaurants([]);
    } finally {
      setIsLoading(false);
    }
  }

  function clearReleaseTimers() {
    releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    releaseTimersRef.current = [];
  }

  function clearActiveBalls() {
    if (engineRef.current && activeBallsRef.current.length > 0) {
      Matter.Composite.remove(engineRef.current.world, activeBallsRef.current);
    }

    activeBallsRef.current = [];
  }

  function removeGameEvent() {
    if (engineRef.current && gameEventRef.current) {
      Matter.Events.off(engineRef.current, 'beforeUpdate', gameEventRef.current);
      gameEventRef.current = null;
    }
  }

  function removeBoardEvent() {
    if (engineRef.current && boardEventRef.current) {
      Matter.Events.off(engineRef.current, 'beforeUpdate', boardEventRef.current);
      boardEventRef.current = null;
    }
  }

  function setBoardCamera(cameraY) {
    const render = renderRef.current;
    if (!render) return;

    const { width, viewportHeight, worldHeight } = boardSizeRef.current;
    const nextCameraY = Math.max(0, Math.min(cameraY, worldHeight - viewportHeight));
    render.bounds.min.x = 0;
    render.bounds.max.x = width;
    render.bounds.min.y = nextCameraY;
    render.bounds.max.y = nextCameraY + viewportHeight;
    boardSizeRef.current.cameraY = nextCameraY;
  }

  function initializeBoard() {
    if (renderRef.current || !gameRef.current) return Boolean(renderRef.current);

    const { Engine, Render, Runner, Bodies, Composite, Events } = Matter;
    const width = gameRef.current.clientWidth || 640;
    const viewportHeight = GAME_VIEWPORT_HEIGHT;
    const worldHeight = GAME_WORLD_HEIGHT;
    const engine = Engine.create();
    engine.gravity.y = 0.42;
    engine.positionIterations = 10;
    engine.velocityIterations = 8;
    const world = engine.world;
    const pegRadius = Math.max(14, Math.min(22, width / 58));
    const guideColor = '#cfc5b8';
    const guideThickness = 26;
    const channelHalfWidth = 42;
    const funnelTopY = worldHeight - 320;
    const neckY = worldHeight - 82;

    function createGuide(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);

      return Bodies.rectangle((x1 + x2) / 2, (y1 + y2) / 2, length, guideThickness, {
        isStatic: true,
        angle: Math.atan2(dy, dx),
        slop: 0,
        restitution: 0.9,
        friction: 0.02,
        chamfer: { radius: 8 },
        render: { fillStyle: guideColor }
      });
    }

    const mixerLength = Math.min(138, width * 0.22);
    const finalMixerLength = Math.min(126, width * 0.2);
    const mixers = [
      { x: width * 0.36, y: 250, speed: 0.036, color: '#9f8b62' },
      { x: width * 0.64, y: 455, speed: -0.041, color: '#826b3a' },
      { x: width * 0.42, y: 660, speed: 0.044, color: '#9f8b62' },
      { x: width * 0.6, y: 865, speed: -0.038, color: '#826b3a' },
      { x: width * 0.47, y: 1070, speed: 0.042, color: '#9f8b62' },
      {
        x: width / 2 + channelHalfWidth - finalMixerLength / 2 - 3,
        y: neckY + 10,
        length: finalMixerLength,
        speed: -0.018,
        color: '#826b3a'
      }
    ].map((mixer) =>
      Bodies.rectangle(mixer.x, mixer.y, mixer.length ?? mixerLength, 10, {
        isStatic: true,
        restitution: 0.96,
        friction: 0.01,
        chamfer: { radius: 5 },
        plugin: { speed: mixer.speed },
        render: { fillStyle: mixer.color }
      })
    );

    const render = Render.create({
      element: gameRef.current,
      engine,
      options: {
        width,
        height: viewportHeight,
        wireframes: false,
        background: '#efe9df',
        hasBounds: true,
        pixelRatio: window.devicePixelRatio || 1
      }
    });

    const walls = [
      Bodies.rectangle(-20, worldHeight / 2, 40, worldHeight, { isStatic: true }),
      Bodies.rectangle(width + 20, worldHeight / 2, 40, worldHeight, { isStatic: true }),
      createGuide(-8, funnelTopY, width / 2 - channelHalfWidth + 5, neckY + 18),
      createGuide(width + 8, funnelTopY, width / 2 + channelHalfWidth - 5, neckY + 18),
      Bodies.rectangle(width / 2 - channelHalfWidth, worldHeight - 36, 14, 114, {
        isStatic: true,
        chamfer: { radius: 6 },
        render: { fillStyle: guideColor }
      }),
      Bodies.rectangle(width / 2 + channelHalfWidth, worldHeight - 36, 14, 114, {
        isStatic: true,
        chamfer: { radius: 6 },
        render: { fillStyle: guideColor }
      })
    ];
    const obstacles = [];

    for (let row = 0; 76 + row * 46 < funnelTopY - 52; row += 1) {
      const count = row % 2 === 0 ? 7 : 6;
      const y = 76 + row * 46;
      const gap = width / (count + 1);

      for (let column = 1; column <= count; column += 1) {
        obstacles.push(
          Bodies.circle(column * gap, y, pegRadius, {
            isStatic: true,
            restitution: 1.08,
            render: { fillStyle: row % 2 === 0 ? '#b8ad9e' : '#d0b38c' }
          })
        );
      }
    }

    for (let row = 1; 96 + row * 92 < funnelTopY - 72; row += 1) {
      const y = 96 + row * 92;
      const sidePegRadius = pegRadius * 0.86;
      const leftX = Math.max(34, width * 0.065);
      const rightX = Math.min(width - 34, width * 0.935);

      obstacles.push(
        Bodies.circle(leftX, y, sidePegRadius, {
          isStatic: true,
          restitution: 1.04,
          render: { fillStyle: row % 2 === 0 ? '#b8ad9e' : '#d0b38c' }
        }),
        Bodies.circle(rightX, y + 46, sidePegRadius, {
          isStatic: true,
          restitution: 1.04,
          render: { fillStyle: row % 2 === 0 ? '#d0b38c' : '#b8ad9e' }
        })
      );
    }

    Composite.add(world, [...walls, ...obstacles, ...mixers]);
    const rotateMixers = () => {
      mixers.forEach((mixer) => {
        Matter.Body.setAngle(mixer, mixer.angle + mixer.plugin.speed);
      });
    };
    boardEventRef.current = rotateMixers;
    Events.on(engine, 'beforeUpdate', rotateMixers);
    Render.run(render);

    const runner = Runner.create();
    Runner.run(runner, engine);

    engineRef.current = engine;
    renderRef.current = render;
    runnerRef.current = runner;
    boardSizeRef.current = { width, viewportHeight, worldHeight, cameraY: 0 };
    setBoardCamera(0);

    return true;
  }

  function resetGame() {
    clearReleaseTimers();
    removeGameEvent();
    removeBoardEvent();
    clearActiveBalls();

    if (renderRef.current) {
      Matter.Render.stop(renderRef.current);
      renderRef.current.canvas.remove();
      renderRef.current.textures = {};
      renderRef.current = null;
    }

    if (runnerRef.current) {
      Matter.Runner.stop(runnerRef.current);
      runnerRef.current = null;
    }

    engineRef.current = null;
  }

  function startGame() {
    if (candidates.length < 2 || !gameRef.current) {
      setStatus('후보가 2개 이상일 때 게임을 시작할 수 있습니다.');
      return;
    }

    if (!initializeBoard()) return;

    clearReleaseTimers();
    removeGameEvent();
    clearActiveBalls();
    setBoardCamera(0);
    setWinner(null);
    setIsPlaying(true);
    setStatus('공이 내려가는 중입니다.');

    const { Bodies, Composite, Events } = Matter;
    const { width, viewportHeight, worldHeight } = boardSizeRef.current;
    const engine = engineRef.current;
    const world = engine.world;
    const ballRadius = Math.max(8, Math.min(13, width / 70));

    const balls = [];
    const pendingBalls = candidates.map((candidate, index) => {
      const hue = (index * 43) % 360;
      const baseColor = `hsl(${hue} 48% 32%)`;
      const hasBurstSkill = Math.random() < BALL_SKILL_CHANCE;
      const ball = Bodies.circle(width / 2, -80, ballRadius, {
        restitution: 0.62,
        friction: 0.035,
        frictionAir: 0.018,
        density: 0.008,
        slop: 0,
        render: {
          fillStyle: baseColor,
          lineWidth: hasBurstSkill ? 3 : 0,
          strokeStyle: hasBurstSkill ? '#f6df8f' : baseColor
        }
      });

      ball.plugin = {
        candidate,
        baseColor,
        hasBurstSkill,
        skillUsed: false,
        skillReadyAt: 900 + Math.random() * 1700,
        skillFlashTicks: 0
      };
      return ball;
    });

    activeBallsRef.current = pendingBalls;

    const lastPositions = new Map();
    const stuckTicks = new Map();
    pendingBalls.forEach((ball) => {
      const releaseX = width / 2 + (Math.random() - 0.5) * Math.min(90, width * 0.18);
      Matter.Body.setPosition(ball, { x: releaseX, y: 28 });
      Matter.Body.setVelocity(ball, { x: 0, y: 0 });
      ball.plugin.skillReadyAt += engine.timing.timestamp;
      balls.push(ball);
      lastPositions.set(ball.id, { x: ball.position.x, y: ball.position.y });
      stuckTicks.set(ball.id, 0);
    });
    Composite.add(world, pendingBalls);
    releaseTimersRef.current = [];
    let hasDecided = false;

    function decideWinner(ball) {
      const isInExit = ball.position.y > worldHeight - ballRadius - 16 && Math.abs(ball.position.x - width / 2) < 34;
      if (hasDecided || !isInExit) return;

      const winnerCandidate = ball.plugin.candidate;
      hasDecided = true;
      releaseTimersRef.current = [];
      ball.render.fillStyle = '#dc4a2f';
      setWinner(winnerCandidate);
      setStatus(`${winnerCandidate.name} 공이 가장 먼저 도착했습니다.`);
      setIsPlaying(false);
    }

    function triggerBurstSkill(sourceBall, nearbyBalls) {
      sourceBall.plugin.skillUsed = true;
      sourceBall.plugin.skillFlashTicks = 14;
      sourceBall.render.fillStyle = '#fff4b8';
      sourceBall.render.strokeStyle = '#dc4a2f';

      nearbyBalls.forEach((targetBall) => {
        const dx = targetBall.position.x - sourceBall.position.x;
        const dy = targetBall.position.y - sourceBall.position.y;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const falloff = Math.max(0.35, 1 - distance / (ballRadius * 8));
        const pushX = (dx / distance) * 4.4 * falloff;
        const pushY = (dy / distance) * 3.1 * falloff - 0.9;

        Matter.Body.setVelocity(targetBall, {
          x: targetBall.velocity.x + pushX,
          y: targetBall.velocity.y + pushY
        });
      });

      Matter.Body.setVelocity(sourceBall, {
        x: sourceBall.velocity.x * 0.35,
        y: sourceBall.velocity.y - 1.1
      });
    }

    function clampBallVelocity(ball) {
      const maxSpeed = 7.5;
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      if (speed <= maxSpeed) return;

      const scale = maxSpeed / speed;
      Matter.Body.setVelocity(ball, {
        x: ball.velocity.x * scale,
        y: ball.velocity.y * scale
      });
    }

    const handleBeforeUpdate = () => {
      const leader = balls.reduce((currentLeader, ball) => {
        if (!currentLeader || ball.position.y > currentLeader.position.y) return ball;
        return currentLeader;
      }, null);

      if (leader) {
        const targetCameraY = leader.position.y - viewportHeight * 0.42;
        const nextCameraY = boardSizeRef.current.cameraY + (targetCameraY - boardSizeRef.current.cameraY) * 0.08;
        setBoardCamera(nextCameraY);
      }

      balls.forEach((ball) => {
        const lastPosition = lastPositions.get(ball.id);
        if (!lastPosition) return;

        if (ball.plugin.skillFlashTicks > 0) {
          ball.plugin.skillFlashTicks -= 1;

          if (ball.plugin.skillFlashTicks === 0) {
            ball.render.fillStyle = ball.plugin.baseColor;
            ball.render.strokeStyle = ball.plugin.hasBurstSkill ? '#f6df8f' : ball.plugin.baseColor;
          }
        }

        if (
          ball.plugin.hasBurstSkill &&
          !ball.plugin.skillUsed &&
          ball.position.y > 130 &&
          ball.position.y < worldHeight - 220 &&
          engine.timing.timestamp >= ball.plugin.skillReadyAt
        ) {
          const skillRadius = ballRadius * 8;
          const nearbyBalls = balls.filter((otherBall) => {
            if (otherBall === ball) return false;
            return Math.hypot(otherBall.position.x - ball.position.x, otherBall.position.y - ball.position.y) < skillRadius;
          });

          if (nearbyBalls.length >= 2 || (nearbyBalls.length === 1 && Math.random() < 0.035)) {
            triggerBurstSkill(ball, nearbyBalls);
          }
        }

        const movement = Math.hypot(ball.position.x - lastPosition.x, ball.position.y - lastPosition.y);
        const nextStuckTicks =
          movement < 0.28 && ball.position.y < worldHeight - 74 ? stuckTicks.get(ball.id) + 1 : 0;

        if (nextStuckTicks > 75) {
          Matter.Body.applyForce(ball, ball.position, {
            x: (Math.random() - 0.5) * 0.014,
            y: -0.009
          });
          stuckTicks.set(ball.id, 0);
        } else {
          stuckTicks.set(ball.id, nextStuckTicks);
        }

        lastPositions.set(ball.id, { x: ball.position.x, y: ball.position.y });

        if (ball.position.y > worldHeight - 70) {
          ball.frictionAir = 0.05;
        }

        clampBallVelocity(ball);
        decideWinner(ball);
      });
    };

    gameEventRef.current = handleBeforeUpdate;
    Events.on(engine, 'beforeUpdate', handleBeforeUpdate);
  }

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(initializeBoard);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resetGame();
    };
  }, []);

  return {
    SEARCH_RADIUS_KM,
    gameRef,
    status,
    excludedText,
    setExcludedText,
    winner,
    isLoading,
    isPlaying,
    candidates,
    filteredRestaurants,
    loadCandidates,
    startGame
  };
}
