import React, { useEffect, useRef, useState } from "react";
import "./Dino.css";
import bunnyRun from "./32PixelBunny/32PixelBunny/PNG/BunnyRun-Sheet.png";
import bunnyJump from "./32PixelBunny/32PixelBunny/PNG/BunnyJump-Sheet.png";
import bunnyLie from "./32PixelBunny/32PixelBunny/PNG/BunnyLieDown-Sheet.png";
import bunnySit from "./32PixelBunny/32PixelBunny/PNG/BunnySitting-Sheet.png";
import bunnySkill from "./32PixelBunny/32PixelBunny/PNG/BunnyCarrotSkill-Sheet.png";
import carrotImg from "./32PixelBunny/32PixelBunny/PNG/Carrot.png";
import logImg from "./32PixelBunny/32PixelBunny/PNG/Log.png";
import flowerImg from "./32PixelBunny/32PixelBunny/PNG/Flowers.png";
import meadowImg from "./32PixelBunny/32PixelBunny/PNG/Meadow.png";
import cloud1 from "./32PixelBunny/32PixelBunny/PNG/Cloud1.png";
import cloud2 from "./32PixelBunny/32PixelBunny/PNG/Cloud2.png";

import jumpSfx from "./Jump.mp3";
import crashSfx from "./Crash.mp3";
import gameOverSfx from "./GameOver.mp3";
import musicSrc from "./Music.mp3";
import pickUpSfx from "./PickUp.mp3";
import eatSfx from "./Eat.mp3";

// ---------- Audio ----------
const makeAudio = (src) => {
  const a = new Audio(src);
  a.preload = "auto";
  a.load();
  return a;
};

const jumpSound = makeAudio(jumpSfx);
const crashSound = makeAudio(crashSfx);
const gameOverSound = makeAudio(gameOverSfx);
const pickUpSound = makeAudio(pickUpSfx);
const eatSound = makeAudio(eatSfx);
const music = makeAudio(musicSrc);
music.loop = true;
music.volume = 0.4;

const playSound = (sound) => {
  sound.currentTime = 0;
  sound.play().catch(() => {});
};

const GAME_OVER_DELAY = 600; // ms between the crash and the game over sound/screen

// ---------- Duck timing (ms) ----------
const LIE_MS = 250;
const HIDE_MS = 550;
const SIT_MS = 300;
const DUCK_CLASSES = ["duck-lie", "duck-hide", "duck-sit"];

const FLOWER_CHANCE = 0.5;

// ---------- Carrot power-up ----------
const CARROT_POINTS = 200;
const CARROT_MIN_MS = 8000;          // gap between carrots
const CARROT_MAX_MS = 16000;
const FIRST_CARROT_MIN_MS = 4000;    // first carrot of a run
const FIRST_CARROT_MAX_MS = 8000;
const SPAWN_ZONE_MIN = 200;          // only spawn while the obstacle is between these x values,
const SPAWN_ZONE_MAX = 320;          // so the carrot never overlaps an obstacle
const PICKUP_MIN = -24;              // carrot x range (px) where E works
const PICKUP_MAX = 64;
const SKILL_FRAMES = 16;             // frames in BunnyCarrotSkill-Sheet.png (32px each)
const SKILL_MS = 900;                // how long the skill animation lasts
const EAT_DELAY_MS = 250;            // Eat.mp3 plays this long after the skill starts
const CARROT_INVINCIBLE = true;      // can't be hit during the pickup sequence

// ---------- High score ----------
const HIGH_SCORE_KEY = "bunnyRunHighScore";
const loadHighScore = () => {
  try {
    return parseInt(localStorage.getItem(HIGH_SCORE_KEY), 10) || 0;
  } catch {
    return 0;
  }
};

// ---------- Clouds ----------
const CLOUD_SPRITES = [cloud1, cloud2];
const rand = (min, max) => Math.random() * (max - min) + min;

let cloudId = 0;
function makeCloud(seeded = false) {
  const duration = rand(12, 22);
  return {
    id: cloudId++,
    src: CLOUD_SPRITES[Math.floor(Math.random() * CLOUD_SPRITES.length)],
    top: Math.floor(rand(0, 35)),
    width: Math.floor(rand(48, 90)),
    duration,
    delay: seeded ? -rand(0, duration * 0.7) : 0,
  };
}

// status: "ready" (start screen) | "playing" | "crashed" (frozen) | "over" (game over screen)
function Dino() {
  const dinoRef = useRef();
  const cactusRef = useRef();
  const gameRef = useRef();
  const carrotRef = useRef();
  const carrotSpriteRef = useRef();
  const statusRef = useRef("ready");
  const scoreRef = useRef(0);
  const timeoutsRef = useRef([]);
  const duckRef = useRef(false);
  const duckTimersRef = useRef([]);
  const obstacleRef = useRef("log");

  const carrotIdRef = useRef(0);
  const carrotActiveRef = useRef(false);   // a carrot exists on screen
  const carrotSeqRef = useRef(false);      // pickup sequence in progress
  const nextCarrotRef = useRef(0);         // timestamp of the next allowed spawn
  const skillTimersRef = useRef([]);

  const [status, setStatusState] = useState("ready");
  const [score, setScore] = useState(0);
  const [finalScore, setFinalScore] = useState(0);
  const [highScore, setHighScore] = useState(loadHighScore);
  const highScoreRef = useRef(highScore);
  const [newHigh, setNewHigh] = useState(false);
  const [runId, setRunId] = useState(0);
  const [obstacle, setObstacle] = useState("log");
  const [carrot, setCarrot] = useState(null); // null or the carrot's id
  const [clouds, setClouds] = useState(() => [
    makeCloud(true),
    makeCloud(true),
    makeCloud(true),
  ]);

  const setStatus = (s) => {
    statusRef.current = s;
    setStatusState(s);
  };

  // ---------- Obstacle ----------
  const pickObstacle = () => {
    const next = Math.random() < FLOWER_CHANCE ? "flower" : "log";
    obstacleRef.current = next;
    setObstacle(next);
  };

  const handleObstacleIteration = (e) => {
    if (e.animationName === "block") pickObstacle();
  };

  // ---------- Duck ----------
  const setDuckClass = (cls) => {
    const dino = dinoRef.current;
    if (!dino) return;
    dino.classList.remove(...DUCK_CLASSES);
    if (cls) dino.classList.add(cls);
  };

  const resetDuck = () => {
    duckTimersRef.current.forEach(clearTimeout);
    duckTimersRef.current = [];
    duckRef.current = false;
    setDuckClass(null);
  };

  const startDuck = () => {
    duckRef.current = true;
    setDuckClass("duck-lie");
    duckTimersRef.current = [
      setTimeout(() => setDuckClass("duck-hide"), LIE_MS),
      setTimeout(() => setDuckClass("duck-sit"), LIE_MS + HIDE_MS),
      setTimeout(() => {
        setDuckClass(null);
        duckRef.current = false;
      }, LIE_MS + HIDE_MS + SIT_MS),
    ];
  };

  // ---------- Carrot ----------
  const scheduleNextCarrot = (min = CARROT_MIN_MS, max = CARROT_MAX_MS) => {
    nextCarrotRef.current = performance.now() + rand(min, max);
  };

  const spawnCarrot = () => {
    carrotActiveRef.current = true;
    carrotIdRef.current += 1;
    setCarrot(carrotIdRef.current);
  };

  const removeCarrot = () => {
    carrotActiveRef.current = false;
    setCarrot(null);
    scheduleNextCarrot();
  };

  const resetCarrot = () => {
    skillTimersRef.current.forEach(clearTimeout);
    skillTimersRef.current = [];
    carrotSeqRef.current = false;
    carrotActiveRef.current = false;
    setCarrot(null);
    dinoRef.current?.classList.remove("skill");
    scheduleNextCarrot(FIRST_CARROT_MIN_MS, FIRST_CARROT_MAX_MS);
  };

  // Carrot scrolled off the left side without being picked up
  const handleCarrotEnd = (e) => {
    if (e.animationName === "carrotMove") removeCarrot();
  };

  // Carrot frames: pull (frames 2-3) -> rise + fade -> bunny skill
  const handleSpriteEnd = (e) => {
    e.stopPropagation();
    const sprite = carrotSpriteRef.current;
    if (!sprite) return;
    if (e.animationName === "carrotPull") {
      sprite.classList.remove("pull");
      sprite.classList.add("rise");
    } else if (e.animationName === "carrotRise") {
      removeCarrot();
      startSkill();
    }
  };

  const startSkill = () => {
    dinoRef.current.classList.add("skill");
    skillTimersRef.current.push(
      setTimeout(() => playSound(eatSound), EAT_DELAY_MS)
    );
  };

  const finishSkill = () => {
    dinoRef.current.classList.remove("skill");
    carrotSeqRef.current = false;
  };

  const tryPickUpCarrot = () => {
    const carrotEl = carrotRef.current;
    const sprite = carrotSpriteRef.current;
    if (!carrotActiveRef.current || !carrotEl || !sprite) return;

    const left = parseFloat(getComputedStyle(carrotEl).left);
    if (left < PICKUP_MIN || left > PICKUP_MAX) return; // too far away

    carrotSeqRef.current = true;
    playSound(pickUpSound);

    scoreRef.current += CARROT_POINTS;
    setScore(scoreRef.current);

    // Pin the carrot near the bunny and stop it scrolling away
    carrotEl.style.left = `${Math.min(Math.max(left, 20), 44)}px`;
    carrotEl.classList.add("picked");
    sprite.classList.add("pull");
  };

  // ---------- Game flow ----------
  const beginRun = () => {
    scoreRef.current = 0;
    setScore(0);
    resetDuck();
    resetCarrot();
    pickObstacle();
    setRunId((id) => id + 1);
    dinoRef.current.classList.remove("jump");
    gameRef.current.classList.remove("frozen");
    setStatus("playing");
    playSound(music);
  };

  const handleKey = (e) => {
    const isJump = e.code === "Space" || e.code === "ArrowUp";
    const isDuck = e.code === "ArrowDown";
    const isPickUp = e.code === "KeyE";
    if (!isJump && !isDuck && !isPickUp) return;
    if (!isPickUp) e.preventDefault();

    const dino = dinoRef.current;
    if (!dino || statusRef.current !== "playing") return;
    if (dino.classList.contains("jump") || duckRef.current || carrotSeqRef.current) return; // busy

    if (isPickUp) {
      tryPickUpCarrot();
    } else if (isJump) {
      dino.classList.add("jump");
      playSound(jumpSound);
    } else {
      startDuck();
    }
  };

  const handleAnimationEnd = (e) => {
    if (e.animationName === "bunnyJumpMotion") {
      dinoRef.current.classList.remove("jump");
    } else if (e.animationName === "bunnySkill") {
      finishSkill();
    }
  };

  const handleCollision = () => {
    statusRef.current = "crashed";
    gameRef.current.classList.add("frozen");
    resetDuck();

    // High score
    const final = scoreRef.current;
    const beat = final > highScoreRef.current;
    if (beat) {
      highScoreRef.current = final;
      setHighScore(final);
      try {
        localStorage.setItem(HIGH_SCORE_KEY, String(final));
      } catch {}
    }
    setNewHigh(beat);
    setFinalScore(final);
    setScore(final);

    music.pause();
    music.currentTime = 0;
    playSound(crashSound);

    timeoutsRef.current.push(
      setTimeout(() => {
        skillTimersRef.current.forEach(clearTimeout);
        skillTimersRef.current = [];
        carrotSeqRef.current = false;
        carrotActiveRef.current = false;
        setCarrot(null);

        const dino = dinoRef.current;
        dino.classList.remove("jump", "skill");
        gameRef.current.classList.remove("frozen");

        playSound(gameOverSound);
        setStatus("over");
      }, GAME_OVER_DELAY)
    );
  };

  // Spawn clouds at random intervals
  useEffect(() => {
    let timeoutId;
    const spawn = () => {
      setClouds((prev) => [...prev, makeCloud()]);
      timeoutId = setTimeout(spawn, rand(1500, 4000));
    };
    timeoutId = setTimeout(spawn, rand(500, 2000));
    return () => clearTimeout(timeoutId);
  }, []);

  const removeCloud = (id) => {
    setClouds((prev) => prev.filter((c) => c.id !== id));
  };

  // Game loop: created ONCE. Only obstacles can hurt you (never clouds or carrots).
  useEffect(() => {
    let tick = 0;
    const loop = setInterval(() => {
      if (statusRef.current !== "playing") return;
      if (!cactusRef.current || !dinoRef.current) return;

      const dinoTop = parseInt(
        getComputedStyle(dinoRef.current).getPropertyValue("top")
      );
      const obstacleLeft = parseInt(
        getComputedStyle(cactusRef.current).getPropertyValue("left")
      );

      // Carrot spawn: not too often, and never overlapping an obstacle
      if (
        !carrotActiveRef.current &&
        performance.now() >= nextCarrotRef.current &&
        obstacleLeft > SPAWN_ZONE_MIN &&
        obstacleLeft < SPAWN_ZONE_MAX
      ) {
        spawnCarrot();
      }

      // Collision (skipped while the bunny is busy eating a carrot)
      if (!(CARROT_INVINCIBLE && carrotSeqRef.current)) {
        let hit = false;
        if (obstacleRef.current === "log") {
          hit = obstacleLeft < 32 && obstacleLeft > 0 && dinoTop >= 130;
        } else {
          hit = obstacleLeft < 32 && obstacleLeft > -28 && !duckRef.current;
        }

        if (hit) {
          handleCollision();
          return;
        }
      }

      scoreRef.current += 1;
      tick += 1;
      if (tick % 5 === 0) setScore(scoreRef.current);
    }, 10);

    return () => clearInterval(loop);
  }, []);

  useEffect(() => {
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      music.pause();
      music.currentTime = 0;
      timeoutsRef.current.forEach(clearTimeout);
      duckTimersRef.current.forEach(clearTimeout);
      skillTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={gameRef} className={`game ${status}`}>
      <div className="meadow" style={{ "--meadow-img": `url(${meadowImg})` }} />

      {clouds.map((c) => (
        <img
          key={c.id}
          className="cloud"
          src={c.src}
          alt=""
          draggable={false}
          onAnimationEnd={() => removeCloud(c.id)}
          style={{
            top: c.top,
            width: c.width,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
          }}
        />
      ))}

      <span style={{ position: "relative", zIndex: 1 }}>Score : {score}</span>

      <div
        id="dino"
        ref={dinoRef}
        onAnimationEnd={handleAnimationEnd}
        style={{
          "--run-img": `url(${bunnyRun})`,
          "--jump-img": `url(${bunnyJump})`,
          "--lie-img": `url(${bunnyLie})`,
          "--sit-img": `url(${bunnySit})`,
          "--skill-img": `url(${bunnySkill})`,
          "--skill-frames": SKILL_FRAMES,
          "--skill-ms": `${SKILL_MS}ms`,
        }}
      ></div>

      {status === "playing" && (
        <>
          {/* Zero-height lane: lets the carrot share the log's ground line */}
          <div className="carrot-lane">
            {carrot !== null && (
              <div
                key={carrot}
                className="carrot"
                ref={carrotRef}
                onAnimationEnd={handleCarrotEnd}
              >
                <div
                  className="carrot-sprite"
                  ref={carrotSpriteRef}
                  onAnimationEnd={handleSpriteEnd}
                  style={{ backgroundImage: `url(${carrotImg})` }}
                />
              </div>
            )}
          </div>

          <div
            key={runId}
            id="cactus"
            ref={cactusRef}
            className={obstacle}
            onAnimationIteration={handleObstacleIteration}
            style={{
            backgroundImage: `url(${obstacle === "flower" ? flowerImg : logImg})`,
            }}
          ></div>
        </>
      )}
      {status === "ready" && (
        <div className="overlay">
          <h2>Bunny Run</h2>
          <p>High Score : {highScore}</p>
          <button onClick={beginRun}>Start</button>
          <div className="controls">
            <div>Space / ↑ : jump over logs</div>
            <div>↓ : go through flowers</div>
            <div>E : grab carrots (+{CARROT_POINTS})</div>
          </div>
        </div>
      )}

      {status === "over" && (
        <div className="overlay">
          <h2>Game Over</h2>
          <p>Your Score : {finalScore}</p>
          <p>
            {newHigh ? "New High Score!" : `High Score : ${highScore}`}
          </p>
          <button onClick={beginRun}>Play Again</button>
        </div>
      )}
    </div>
  );
}

export default Dino;

// Add sound effects for jumping, running, add background music
//add a carrot that randomly spawns on the ground and when the player touches it the carrot dissapears 
// and it adds 100 points to the score and plays a sound effect

//add a patch of flowers that randomly spawns on the ground and when the player 
// touches it the game ends and plays a sound effect
//but if the player presses the down arrow they pass throgh it.

//add a game over button and screen instead of server host notiification
//add a start button to start the game where the bunny run animation is running 
// and the meadow and clouds but when the game starts those animations are still there but the player 
// takes over the bunny
