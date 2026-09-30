import { WORDS } from "./words.js";

const NUMBER_OF_GUESSES = 6;
const keySound = new Audio("mixkit-modern-technology-select-3124.wav");
const victorySound = new Audio("victory.mp3");
const losingSound = new Audio("lose.mp3")
losingSound.volume = 0.6
let guessesRemaining = NUMBER_OF_GUESSES;
let currentGuess = [];
let nextLetter = 0;
let rightGuessString = WORDS[Math.floor(Math.random() * WORDS.length)];

console.log(rightGuessString);

function initBoard() {
  let board = document.getElementById("game-board");

  for (let i = 0; i < NUMBER_OF_GUESSES; i++) {
    let row = document.createElement("div");
    row.className = "letter-row";

    for (let j = 0; j < 5; j++) {
      let box = document.createElement("div");
      box.className = "letter-box";
      row.appendChild(box);
    }

    board.appendChild(row);
  }
}

function playSparkleConfetti() {
  //in the name, sparkly confetti
  confetti({
    particleCount: 120,
    spread: 150,
    startVelocity: 45,
    ticks: 700,
    origin: {y: 0.6},
    colors: ["#efd43c", "#ffffe6", "#fff2d1", "#ffdcbf", "#e8c763"],
    shapes: ["circle"], //sparkle dots
  });

  confetti({
    particleCount: 80,
    spread: 100,
    startVelocity: 30,
    origin: {y: 0.4},
    colors: ["#ffffff", "#cea51d", "#f2ffd1"],
    shapes: ["square"], //glitter squares
  });
}

function showPlayAgainButton() {
  const container = document.getElementById("play-again-container")
  // Clear previous button if it exists
  container.innerHTML = "";

  const button = document.createElement("button");
  button.textContent = "Play Again"
  button.id = "play-again-button";

  button.addEventListener("click", resetGame);

  container.appendChild(button);
}

function resetGame() {
  const board = document.getElementById("game-board");
  const keyboard = document.getElementById("keyboard-cont");

  // Fade out everything
  board.classList.add("fade-out");
  keyboard.classList.add("fade-out");

  setTimeout(() => {
    // Reset variables
    guessesRemaining = NUMBER_OF_GUESSES;
    currentGuess = [];
    nextLetter = 0;
    rightGuessString = WORDS[Math.floor(Math.random() * WORDS.length)];
    console.log("New word:", rightGuessString);

    // Clear board
    board.innerHTML = "";
    initBoard();

    // Clear keyboard colors
    for (const key of document.getElementsByClassName("keyboard-button")) {
      key.style.backgroundColor = "";
    }

    // Remove Play Again button
    document.getElementById("play-again-container").innerHTML = "";

    // Fade back in
    board.classList.remove("fade-out");
    keyboard.classList.remove("fade-out");
    board.classList.add("fade-in");
    keyboard.classList.add("fade-in");

    // Remove fade-in class after animation completes
    setTimeout(() => {
      board.classList.remove("fade-in");
      keyboard.classList.remove("fade-in");
    }, 500);

  }, 500); // matches fade-out duration
}

function shadeKeyBoard(letter, color) {
  for (const elem of document.getElementsByClassName("keyboard-button")) {
    if (elem.textContent === letter) {
      let oldColor = elem.style.backgroundColor;
      if (oldColor === "#90ee90" ) {
        return;
      }

      if (oldColor === "#fefeac" && color !== "#90ee90" ) {
        return;
      }

      elem.style.backgroundColor = color;
      break;
    }
  }
}

function deleteLetter() {
  let row = document.getElementsByClassName("letter-row")[6 - guessesRemaining];
  let box = row.children[nextLetter - 1];
  box.textContent = "";
  box.classList.remove("filled-box");
  currentGuess.pop();
  nextLetter -= 1;
}

function checkGuess() {
  let row = document.getElementsByClassName("letter-row")[6 - guessesRemaining];
  let guessString = "";
  let rightGuess = Array.from(rightGuessString);

  for (const val of currentGuess) {
    guessString += val;
  }

  if (guessString.length != 5) {
    toastr.error("Not enough letters!");
    return;
  }

  if (!WORDS.includes(guessString)) {
    toastr.error("Word not in list!");
    return;
  }

  var letterColor = ["#ff9999", "#ff9999", "#ff9999", "#ff9999", "#ff9999"];

  //check green
  for (let i = 0; i < 5; i++) {
    if (rightGuess[i] == currentGuess[i]) {
      letterColor[i] = "#90ee90";
      rightGuess[i] = "#";
    }
  }

  //check yellow
  //checking guess letters
  for (let i = 0; i < 5; i++) {
    if (letterColor[i] == "#90ee90") continue;

    //checking right letters
    for (let j = 0; j < 5; j++) {
      if (rightGuess[j] == currentGuess[i]) {
        letterColor[i] = "#fefeac";
        rightGuess[j] = "#";
      }
    }
  }

  for (let i = 0; i < 5; i++) {
    let box = row.children[i];
    let delay = 250 * i;
    setTimeout(() => {
      //flip box
      animateCSS(box, "flipInX");
      //shade box
      box.style.backgroundColor = letterColor[i];
      shadeKeyBoard(guessString.charAt(i) + "", letterColor[i]);
    }, delay);
  }

  if (guessString === rightGuessString) {
    victorySound.currentTime = 0;
    victorySound.play();
    playSparkleConfetti();
    toastr.success("You guessed right! Game over!");
    guessesRemaining = 0;
    showPlayAgainButton();
    return;
  } else {
    guessesRemaining -= 1;
    currentGuess = [];
    nextLetter = 0;

    if (guessesRemaining === 0) {
      toastr.error("You've run out of guesses! Game over!");
      losingSound.currentTime = 0;
      losingSound.play();
      toastr.info(`The right word was: "${rightGuessString}"`);
      showPlayAgainButton();
    }
  }
}

function insertLetter(pressedKey) {
  if (nextLetter === 5) {
    return;
  }
  pressedKey = pressedKey.toLowerCase();

  let row = document.getElementsByClassName("letter-row")[6 - guessesRemaining];
  let box = row.children[nextLetter];
  animateCSS(box, "pulse");
  box.textContent = pressedKey;
  box.classList.add("filled-box");
  currentGuess.push(pressedKey);
  nextLetter += 1;
}

const animateCSS = (element, animation, prefix = "animate__") =>
  // We create a Promise and return it
  new Promise((resolve, reject) => {
    const animationName = `${prefix}${animation}`;
    // const node = document.querySelector(element);
    const node = element;
    node.style.setProperty("--animate-duration", "0.3s");

    node.classList.add(`${prefix}animated`, animationName);

    // When the animation ends, we clean the classes and resolve the Promise
    function handleAnimationEnd(event) {
      event.stopPropagation();
      node.classList.remove(`${prefix}animated`, animationName);
      resolve("Animation ended");
    }

    node.addEventListener("animationend", handleAnimationEnd, { once: true });
  });

document.addEventListener("keyup", (e) => {
  if (guessesRemaining === 0) {
    return;
  }

  let pressedKey = String(e.key);
  if (pressedKey === "Backspace" && nextLetter !== 0) {
    keySound.currentTime = 0;
    keySound.play();
    deleteLetter();
    return;
  }

  if (pressedKey === "Enter") {
    keySound.currentTime = 0;
    keySound.play();
    checkGuess();
    return;
  }

  let found = pressedKey.match(/[a-z]/gi);
  if (!found || found.length > 1) {
    return;
  } else {
    keySound.currentTime = 0;
    keySound.play();
    insertLetter(pressedKey);
  }
});

document.getElementById("keyboard-cont").addEventListener("click", (e) => {
  const target = e.target;

  if (!target.classList.contains("keyboard-button")) {
    return;
  }

  keySound.currentTime = 0;
  keySound.play();

  let key = target.textContent;

  if (key === "Del") {
    key = "Backspace";
  }

  document.dispatchEvent(new KeyboardEvent("keyup", { key: key }));
});

initBoard();